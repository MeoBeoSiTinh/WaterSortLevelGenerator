"use strict";
// Real Chromium/WebGL smoke test. Usage: node .../browser-smoke.js <lab-root> <chrome-exe>
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const { createLabServer } = require("../server");
const { ROOT } = require("../common");

async function main() {
  const root = path.resolve(process.argv[2]);
  const chromeExe = process.argv[3] || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "watersort-browser-"));
  const server = createLabServer({ root });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = spawn(chromeExe, ["--headless=new", "--no-first-run", "--no-default-browser-check",
    "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Chrome debugging endpoint timed out")), 20000);
      let log = "";
      chrome.on("error", reject);
      chrome.stderr.on("data", chunk => {
        log += chunk;
        const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    let sequence = 0;
    const pending = new Map(), events = [];
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const waiter = pending.get(message.id);
        if (waiter) { pending.delete(message.id); clearTimeout(waiter.timer); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result); }
      } else events.push(message);
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    await call("Runtime.enable");
    await call("Page.enable");
    await call("Network.enable");
    await call("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
      const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function until(check, label, timeout = 120000) {
      const start = Date.now();
      while (!await check()) {
        if (Date.now() - start > timeout) throw new Error(`Timed out: ${label}`);
        await delay(500);
      }
    }
    await call("Page.navigate", { url: origin });
    await until(() => evaluate("!!document.querySelector('#play') && !document.querySelector('#play').disabled"), "lab pack listing");
    const selected = await evaluate("document.querySelector('#packs').value");
    const manifest = await (await fetch(`${origin}/api/manifest`)).json();
    assert(manifest.packs.some(pack => pack.id === selected));
    const output = path.join(ROOT, "_bmad-output/build-logs");
    fs.mkdirSync(output, { recursive: true });
    async function screenshot(name) {
      const shot = await call("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, name), Buffer.from(shot.data, "base64"));
    }
    await screenshot("level-lab-home.png");
    await call("Page.navigate", { url: `${origin}/player/index.html?levelLab=1&pack=${selected}` });
    await until(() => events.some(event => event.method === "Network.responseReceived"
      && event.params.response.url.includes(`/api/packs/${selected}/solutions?`) && event.params.response.status === 200), "Unity external solution load");
    await delay(2500);
    assert(await evaluate("!!document.querySelector('canvas')"));
    await screenshot("level-lab-player.png");
    const errors = events.filter(event => event.method === "Runtime.exceptionThrown");
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log(`PASS: packaged lab lists ${manifest.packs.length} packs; real Unity WebGL requests selected pack ${selected} level+solution JSON; no JS exceptions. Screenshots in ${output}.`);
    fs.writeFileSync(path.join(output, "level-lab-browser.json"), JSON.stringify({ selected, packs: manifest.packs,
      console: events.filter(event => event.method === "Runtime.consoleAPICalled").map(event => event.params.args.map(arg => arg.value ?? arg.description).join(" ")) }, null, 2));
    await send("Browser.close").catch(() => {});
  } finally {
    if (socket) socket.close();
    chrome.kill();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    // Chrome can hold profile handles briefly after exit; leave only this temp profile if locked.
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch {}
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
