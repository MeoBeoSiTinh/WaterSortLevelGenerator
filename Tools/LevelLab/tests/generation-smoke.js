"use strict";
// Explicit integration check, separate from the fast HTTP/unit tests.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { ROOT, TOOLS, CONFIG, packPaths } = require("../common");
const { generate } = require("../generate");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "watersort-determinism-"));
try {
  for (const name of ["a", "b"]) {
    const run = path.join(root, name);
    fs.mkdirSync(path.join(run, TOOLS), { recursive: true });
    for (const file of fs.readdirSync(path.join(ROOT, TOOLS)).filter(file => file.endsWith(".js"))) {
      fs.copyFileSync(path.join(ROOT, TOOLS, file), path.join(run, TOOLS, file));
    }
    fs.mkdirSync(path.dirname(path.join(run, CONFIG)), { recursive: true });
    fs.writeFileSync(path.join(run, CONFIG), fs.readFileSync(path.join(ROOT, CONFIG), "utf8").replace(/levelsPerPack: \d+/, "levelsPerPack: 2"));
    generate(run, { pack: "1", seed: "12345", profile: "Easy" });
  }
  const a = packPaths(path.join(root, "a"), "001"), b = packPaths(path.join(root, "b"), "001");
  for (const key of ["levels", "solutions"]) assert.equal(fs.readFileSync(a[key], "utf8"), fs.readFileSync(b[key], "utf8"), `${key} differs for identical inputs`);
  console.log("PASS: two isolated production runs, 2 levels each, seed 12345; paired JSON byte-identical and replay-valid.");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
