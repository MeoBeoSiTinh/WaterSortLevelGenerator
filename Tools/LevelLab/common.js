"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const ASSETS = "Assets/Project";
const TOOLS = `${ASSETS}/Editor/WaterSort/LevelGeneration/Tools`;
const CONFIG = `${ASSETS}/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`;
const PALETTE = `${ASSETS}/Data/WaterSort/Resources/WaterSortColorPalette.asset`;
const LEVELS = `${ASSETS}/Data/WaterSort/Resources/WaterSort`;
const SOLUTIONS = `${ASSETS}/Data/WaterSort/Resources/WaterSortSolutions`;

function packPaths(root, id) {
  if (!/^(?!000)\d{3}$/.test(id)) throw new Error("Pack must be 001–999.");
  return {
    levels: path.join(root, LEVELS, `watersort-levels-${id}.json`),
    solutions: path.join(root, SOLUTIONS, `watersort-solutions-${id}.json`),
  };
}

function readData(file) {
  if (fs.statSync(file).size > 32 * 1024 * 1024) throw new Error(`${path.basename(file)} exceeds 32 MB.`);
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function normalizePair(levelText, solutionText) {
  const levels = JSON.parse(levelText);
  const solutions = JSON.parse(solutionText);
  if (!Array.isArray(levels?.levels) || levels.levels.length < 1 || levels.levels.length > 100) {
    throw new Error("A pack must contain 1–100 levels.");
  }
  if (!Array.isArray(solutions?.levelSolutions) || solutions.levelSolutions.length !== levels.levels.length) {
    throw new Error("Missing or mismatched levelSolutions.");
  }
  const ids = new Set();
  const indexed = new Map();
  for (const entry of solutions.levelSolutions) {
    if (!Number.isSafeInteger(entry?.levelNumber) || entry.levelNumber < 1 || indexed.has(entry.levelNumber)) {
      throw new Error("Duplicate or invalid solution levelNumber.");
    }
    indexed.set(entry.levelNumber, entry);
  }
  solutions.levelSolutions = levels.levels.map((level, index) => {
    const id = level?.id ?? index + 1;
    if (!Number.isSafeInteger(id) || id < 1 || ids.has(id)) throw new Error("Duplicate or invalid level id.");
    ids.add(id);
    const solution = indexed.get(id);
    if (!solution) throw new Error(`Level ${id}: no matching solution levelNumber.`);
    if (!Array.isArray(level.bottles) || level.bottles.length < 1) throw new Error(`Level ${id}: missing bottles.`);
    for (const bottle of level.bottles) {
      if (!Number.isInteger(bottle?.capacity) || !Array.isArray(bottle.colorsBottomToTop)
        || bottle.colorsBottomToTop.some(color => !Number.isInteger(color) || color < 0 || color >= 13)
        || !Number.isInteger(bottle.gridPosition?.x) || !Number.isInteger(bottle.gridPosition?.y)) {
        throw new Error(`Level ${id}: invalid bottle capacity, colors, or grid position.`);
      }
    }
    for (const stored of solution.solutionData?.solutions ?? []) {
      if (!Array.isArray(stored?.moves) || stored.moves.some(move =>
        !Number.isInteger(move?.fromBottle) || !Number.isInteger(move?.toBottle))) {
        throw new Error(`Level ${id}: invalid solution moves.`);
      }
    }
    return solution;
  });
  return { levels, solutions };
}

// The production validator owns legality and replay. This adapter only resolves
// pack identities and feeds it the exact pair in matching level order.
function validatePair(root, levelText, solutionText) {
  const pair = normalizePair(levelText, solutionText);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "watersort-validate-"));
  try {
    const levelFile = path.join(temp, "levels.json");
    const solutionFile = path.join(temp, "solutions.json");
    fs.writeFileSync(levelFile, JSON.stringify(pair.levels));
    fs.writeFileSync(solutionFile, JSON.stringify(pair.solutions));
    const result = spawnSync(process.execPath, [path.join(root, TOOLS, "validate-pack.js"), levelFile, solutionFile], {
      encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      throw new Error(`Pack validation failed: ${result.error?.message || result.stdout || result.stderr}`);
    }
    return pair;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function digest(...texts) {
  const hash = crypto.createHash("sha256");
  for (const value of texts) hash.update(value).update("\0");
  return hash.digest("hex");
}

module.exports = { ROOT, ASSETS, TOOLS, CONFIG, PALETTE, LEVELS, SOLUTIONS, packPaths, readData, normalizePair, validatePair, digest };
