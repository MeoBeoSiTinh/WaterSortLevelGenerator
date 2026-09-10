"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { ROOT, TOOLS, LEVELS, SOLUTIONS, packPaths, normalizePair, validatePair } = require("../common");
const { createLabServer, safeFile } = require("../server");
const { parseArgs, generate } = require("../generate");
const { packageLab } = require("../package");

function pair(id = 301, name = "Fixture") {
  const bottles = [[0, 1], [1, 0], [], [], []].map((colors, index) => ({
    capacity: 2, colorsBottomToTop: colors, gridPosition: { x: index, y: 2 }, isAdBottle: index >= 3,
  }));
  return {
    levels: { levels: [{ id, displayName: name, layoutGrid: { columns: 8, rows: 5 }, modeOptions: {}, bottles }] },
    solutions: { levelSolutions: [{ levelNumber: id, solutionData: { solutions: [{ moves: [
      { fromBottle: 1, toBottle: 3 }, { fromBottle: 2, toBottle: 1 }, { fromBottle: 2, toBottle: 3 },
    ] }] } }] },
  };
}
function texts(value) { return [JSON.stringify(value.levels), JSON.stringify(value.solutions)]; }
function writePair(root, id, value) {
  const files = packPaths(root, id);
  for (const [key, file] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value[key]));
  }
}
function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "watersort-lab-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, TOOLS), { recursive: true });
  for (const file of ["validate-pack.js", "watersort-exhaustive-solver.js", "mega-generator-v2.js", "watersort-core-fingerprint.js"]) {
    fs.copyFileSync(path.join(ROOT, TOOLS, file), path.join(root, TOOLS, file));
  }
  fs.mkdirSync(path.join(root, "Player"));
  fs.writeFileSync(path.join(root, "Player/index.html"), "<html>player fixture</html>");
  return root;
}

test("pack identity supports global IDs and isolates reordered local IDs", () => {
  const value = pair();
  value.levels.levels.push({ ...structuredClone(value.levels.levels[0]), id: 302 });
  value.solutions.levelSolutions.unshift({ ...structuredClone(value.solutions.levelSolutions[0]), levelNumber: 302 });
  assert.deepEqual(normalizePair(...texts(value)).solutions.levelSolutions.map(entry => entry.levelNumber), [301, 302]);
  value.levels.levels[1].id = 301;
  assert.throws(() => normalizePair(...texts(value)), /Duplicate/);
  const legacy = pair(1);
  delete legacy.levels.levels[0].id;
  assert.equal(normalizePair(...texts(legacy)).solutions.levelSolutions[0].levelNumber, 1);
});

test("validator rejects malformed pairs, missing identity and illegal stored paths", () => {
  assert.throws(() => normalizePair("{", "{}"));
  const value = pair();
  value.solutions.levelSolutions[0].levelNumber = 1;
  assert.throws(() => normalizePair(...texts(value)), /no matching/);
  const valid = pair();
  assert.equal(validatePair(ROOT, ...texts(valid)).levels.levels.length, 1);
  valid.solutions.levelSolutions[0].solutionData.solutions[0].moves[0].toBottle = 4;
  assert.throws(() => validatePair(ROOT, ...texts(valid)), /uses ad bottle/);
});

test("HTTP discovers new packs, preserves exact revisions, rejects invalid pairs and traversal", async t => {
  const root = workspace(t);
  writePair(root, "004", pair());
  const server = createLabServer({ root });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const first = await (await fetch(`${base}/api/manifest`)).json();
  assert.equal(first.packs.length, 1);
  const oldUrl = first.packs[0].levelUrl;
  writePair(root, "004", pair(301, "Changed after build"));
  writePair(root, "005", pair(1, "New pack"));
  const second = await (await fetch(`${base}/api/manifest`)).json();
  assert.equal(second.packs.length, 2);
  assert.notEqual(second.packs[0].levelUrl, oldUrl);
  assert.equal((await (await fetch(base + oldUrl)).json()).levels[0].displayName, "Fixture");
  const current = await fetch(base + second.packs[0].levelUrl);
  assert.equal(current.headers.get("cache-control"), "no-store");
  assert.equal((await current.json()).levels[0].displayName, "Changed after build");
  fs.writeFileSync(packPaths(root, "004").solutions, "{");
  const bad = await (await fetch(`${base}/api/manifest`)).json();
  assert.equal(bad.packs.length, 1);
  assert.equal(bad.errors[0].id, "004");
  fs.unlinkSync(packPaths(root, "005").solutions);
  assert.equal((await (await fetch(`${base}/api/manifest`)).json()).errors.length, 2);
  assert.equal((await fetch(`${base}/api/packs/005/levels?v=missing`)).status, 409);
  assert.equal((await fetch(`${base}/player/index.html`)).status, 200);
  assert.equal((await fetch(`${base}/player/%2e%2e%5cTools/LevelLab/common.js`)).status, 404);
  assert.equal((await fetch(`${base}/api/manifest`, { method: "POST" })).status, 405);
  const hostileHostStatus = await new Promise(resolve => {
    http.get(`${base}/api/manifest`, { headers: { Host: "untrusted.example" } }, res => { res.resume(); resolve(res.statusCode); });
  });
  assert.equal(hostileHostStatus, 403);
});

test("realpath boundary rejects escaped and linked files", t => {
  const root = workspace(t);
  assert.throws(() => safeFile(path.join(root, "Player"), `../${TOOLS}/validate-pack.js`), /outside/);
  const junction = path.join(root, "Player/outside");
  fs.symlinkSync(path.join(root, TOOLS), junction, "junction");
  assert.throws(() => safeFile(path.join(root, "Player"), "outside/validate-pack.js"), /outside/);
});

test("generation refuses invalid inputs and overwrite, releases its lock", t => {
  for (const args of [["--seed", "4294967296"], ["--pack", "0"], ["--seed"], ["--profile", "Unknown"], ["--shell", "cmd"]]) {
    assert.throws(() => parseArgs(args));
  }
  assert.equal(parseArgs(["--seed", "0"]).seed, "0");
  const root = workspace(t);
  writePair(root, "004", pair());
  const before = fs.readFileSync(packPaths(root, "004").levels, "utf8");
  assert.throws(() => generate(root, { pack: "4", seed: "0" }), /already exists/);
  assert.equal(fs.readFileSync(packPaths(root, "004").levels, "utf8"), before);
  assert.equal(fs.existsSync(path.join(root, ".level-lab-generation.lock")), false);
});

test("packaging rejects absent and old players and existing output", t => {
  const root = workspace(t);
  assert.throws(() => packageLab(ROOT, path.join(root, "missing"), path.join(root, "out")), /missing/);
  assert.throws(() => packageLab(ROOT, path.join(root, "Player"), path.join(root, "out")), /marker/);
  fs.writeFileSync(path.join(root, "Player/level-lab-build.json"), '{"externalCatalogVersion":1}');
  assert.throws(() => packageLab(ROOT, path.join(root, "Player"), root), /already exists/);
});
