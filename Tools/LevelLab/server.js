"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { ROOT, LEVELS, SOLUTIONS, packPaths, readData, validatePair, digest } = require("./common");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".data": "application/octet-stream", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml" };
const DEFAULT_PORT = 8081;

function resolvePlayerDirectory(root, explicit) {
  if (explicit) {
    const player = path.resolve(root, explicit);
    if (!fs.existsSync(path.join(player, "index.html"))) {
      throw new Error(`Player is missing at ${player}. Build WebGL first, or pass the folder that contains index.html.`);
    }
    return player;
  }
  for (const candidate of ["Player", path.join("Builds", "WebGL")]) {
    const player = path.join(root, candidate);
    if (fs.existsSync(path.join(player, "index.html"))) return player;
  }
  throw new Error("Prebuilt player is missing. Package Level Lab (Player/) or build WebGL to Builds/WebGL first.");
}

function listenLoopback(server, preferredPort) {
  let port = preferredPort;
  const last = preferredPort + 20;
  return new Promise((resolve, reject) => {
    const tryListen = () => {
      const onError = error => {
        server.off("listening", onListening);
        if (error.code === "EADDRINUSE" && port < last) {
          port += 1;
          tryListen();
          return;
        }
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    };
    tryListen();
  });
}

function openBrowser(url) {
  if (process.env.LEVEL_LAB_NO_BROWSER === "1" || !process.stdout.isTTY) return;
  const command = process.platform === "win32"
    ? spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" })
    : process.platform === "darwin"
      ? spawn("open", [url], { detached: true, stdio: "ignore" })
      : spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  command.unref();
}

function safeFile(root, relative) {
  const base = fs.realpathSync(root);
  const candidate = fs.realpathSync(path.resolve(base, relative));
  const rel = path.relative(base, candidate);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) || !fs.statSync(candidate).isFile()) {
    throw new Error("File is outside the served directory.");
  }
  return candidate;
}

function createLabServer({ root = ROOT, player = path.join(root, "Player") } = {}) {
  const snapshots = new Map();
  const cache = new Map();
  function manifest() {
    const ids = new Set();
    for (const [folder, prefix] of [[LEVELS, "levels"], [SOLUTIONS, "solutions"]]) {
      if (!fs.existsSync(path.join(root, folder))) continue;
      for (const file of fs.readdirSync(path.join(root, folder))) {
        const match = file.match(new RegExp(`^watersort-${prefix}-((?!000)\\d{3})\\.json$`));
        if (match) ids.add(match[1]);
      }
    }
    const packs = [], errors = [];
    for (const id of [...ids].sort()) {
      try {
        const files = packPaths(root, id);
        const levelText = readData(safeFile(path.join(root, LEVELS), path.basename(files.levels)));
        const solutionText = readData(safeFile(path.join(root, SOLUTIONS), path.basename(files.solutions)));
        const version = digest(levelText, solutionText);
        let result = cache.get(id);
        if (result?.version !== version) {
          try {
            result = { version, pair: validatePair(root, levelText, solutionText) };
          } catch (error) {
            result = { version, error: error.message };
          }
          cache.set(id, result);
        }
        if (result.error) throw new Error(result.error);
        const key = `${id}:${version}`;
        snapshots.set(key, { levels: JSON.stringify(result.pair.levels), solutions: JSON.stringify(result.pair.solutions) });
        // Retain a bounded set of immutable pairs so two HTTP requests cannot mix revisions.
        while (snapshots.size > 1000) snapshots.delete(snapshots.keys().next().value);
        packs.push({ id, levelCount: result.pair.levels.levels.length,
          levelUrl: `/api/packs/${id}/levels?v=${version}`, solutionUrl: `/api/packs/${id}/solutions?v=${version}` });
      } catch (error) {
        errors.push({ id, message: error.message });
      }
    }
    return { packs, errors };
  }

  return http.createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    const send = (status, body, type = "application/json; charset=utf-8") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    try {
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || "")) {
        return send(403, JSON.stringify({ error: "Use the localhost URL printed by the launcher." }));
      }
      if (req.method !== "GET" && req.method !== "HEAD") return send(405, JSON.stringify({ error: "Read-only HTTP server." }));
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/manifest") return send(200, JSON.stringify(manifest()));
      const data = url.pathname.match(/^\/api\/packs\/((?!000)\d{3})\/(levels|solutions)$/);
      if (data) {
        const snapshot = snapshots.get(`${data[1]}:${url.searchParams.get("v")}`);
        if (!snapshot) return send(409, JSON.stringify({ error: "Data revision expired. Reload the lab to load a validated pair." }));
        return send(200, snapshot[data[2]]);
      }
      const pathname = decodeURIComponent(url.pathname);
      let file;
      if (pathname === "/") file = path.join(__dirname, "index.html");
      else if (pathname === "/lab.js" || pathname === "/lab.css") file = path.join(__dirname, pathname.slice(1));
      else if (pathname.startsWith("/player/")) file = safeFile(player, pathname.slice(8) || "index.html");
      else return send(404, JSON.stringify({ error: "Not found." }));
      let extension = path.extname(file);
      if (extension === ".gz" || extension === ".br") {
        res.setHeader("Content-Encoding", extension === ".gz" ? "gzip" : "br");
        extension = path.extname(file.slice(0, -extension.length));
      }
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      res.writeHead(200, { "Content-Type": TYPES[extension] || "application/octet-stream", "Content-Length": fs.statSync(file).size });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
    } catch (error) {
      if (!res.headersSent) send(404, JSON.stringify({ error: error.message }));
      else res.destroy();
    }
  });
}

if (require.main === module) {
  (async () => {
    try {
      const preferredPort = process.argv[2] == null || process.argv[2] === "" ? DEFAULT_PORT : Number(process.argv[2]);
      if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535) {
        throw new Error("Port must be 1–65535.");
      }
      const player = resolvePlayerDirectory(ROOT, process.argv[3]);
      const server = createLabServer({ player });
      const port = await listenLoopback(server, preferredPort);
      const url = `http://127.0.0.1:${port}/`;
      console.log(`Water Sort Level Lab: ${url}`);
      console.log(`Player: ${player}`);
      if (port !== preferredPort) console.log(`Port ${preferredPort} was busy; using ${port} instead.`);
      console.log("Keep this terminal open. Ctrl+C stops the server.");
      openBrowser(url);
    } catch (error) {
      console.error(`Cannot start Level Lab: ${error.message}`);
      process.exitCode = 1;
    }
  })();
}

module.exports = { createLabServer, safeFile, resolvePlayerDirectory, listenLoopback, DEFAULT_PORT };
