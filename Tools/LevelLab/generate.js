"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { ROOT, TOOLS, CONFIG, LEVELS, SOLUTIONS, packPaths, readData, validatePair, digest } = require("./common");

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--pack", "--seed", "--profile", "--config"].includes(args[i]) || !args[i + 1] || options[args[i].slice(2)] != null) {
      throw new Error("Usage: node Tools/LevelLab/generate.js [--pack 5] [--seed 12345] [--profile Easy|Normal|Hard|VeryHard|Special] [--config path]");
    }
    options[args[i].slice(2)] = args[i + 1];
  }
  if (options.pack != null && (!/^\d+$/.test(options.pack) || +options.pack < 1 || +options.pack > 999)) throw new Error("Pack must be 1–999.");
  if (options.seed != null && (!/^\d+$/.test(options.seed) || !Number.isSafeInteger(+options.seed) || +options.seed > 0xffffffff)) throw new Error("Seed must be an unsigned 32-bit integer.");
  if (options.profile && !["Easy", "Normal", "Hard", "VeryHard", "Special"].includes(options.profile)) throw new Error("Unknown difficulty profile.");
  return options;
}

function generate(root, options = {}) {
  const lockPath = path.join(root, ".level-lab-generation.lock");
  const lock = fs.openSync(lockPath, "wx");
  let temp;
  try {
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }));
    let index = options.pack ? Number(options.pack) : 1;
    if (!options.pack) {
      for (const folder of [LEVELS, SOLUTIONS]) {
        if (!fs.existsSync(path.join(root, folder))) continue;
        for (const name of fs.readdirSync(path.join(root, folder))) {
          const number = name.match(/^watersort-(?:levels|solutions)-(\d{3})\.json$/)?.[1];
          if (number) index = Math.max(index, Number(number) + 1);
        }
      }
    }
    const id = String(index).padStart(3, "0");
    const output = packPaths(root, id);
    if (fs.existsSync(output.levels) || fs.existsSync(output.solutions)) throw new Error(`Pack ${id} already exists. Choose a new pack number.`);
    const seed = options.seed == null ? crypto.randomBytes(4).readUInt32LE() : Number(options.seed);
    const config = path.resolve(root, options.config || CONFIG);
    const configText = readData(config);
    const count = Number(configText.match(/^\s*levelsPerPack:\s*(\d+)\s*$/m)?.[1]);
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("Config levelsPerPack must be 1–100.");
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "watersort-generate-"));
    // Pin the configuration for this run; edits made while solving affect the next run.
    const pinnedConfig = path.join(temp, "config.asset");
    fs.writeFileSync(pinnedConfig, configText);
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith("WATERSORT_")) delete env[key];
    env.WATERSORT_GENERATION_CONFIG_PATH = pinnedConfig;
    console.log(`Generating pack ${id}; seed ${seed}; config ${config}; levels ${count}. This may take several minutes.`);
    const result = spawnSync(process.execPath, [path.join(root, TOOLS, "generate-watersort-exhaustive-100.js"), String(index), String(seed), options.profile || ""], {
      cwd: temp, env, stdio: "inherit", windowsHide: true,
    });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || `Generator failed (exit ${result.status}). No pack published.`);
    const staged = packPaths(temp, id);
    const levelText = readData(staged.levels), solutionText = readData(staged.solutions);
    const pair = validatePair(root, levelText, solutionText);
    if (pair.levels.levels.length !== count) throw new Error("Generated count differs from config. No pack published.");
    fs.mkdirSync(path.dirname(output.levels), { recursive: true });
    fs.mkdirSync(path.dirname(output.solutions), { recursive: true });
    // EXCL protects against a file appearing after the initial existence check.
    fs.copyFileSync(staged.levels, output.levels, fs.constants.COPYFILE_EXCL);
    try { fs.copyFileSync(staged.solutions, output.solutions, fs.constants.COPYFILE_EXCL); }
    catch (error) { fs.unlinkSync(output.levels); throw error; }
    const receipt = { pack: id, seed, profile: options.profile || "config", levelCount: count,
      configHash: digest(configText), pairHash: digest(levelText, solutionText) };
    fs.mkdirSync(path.join(root, "GenerationRuns"), { recursive: true });
    fs.writeFileSync(path.join(root, "GenerationRuns", `pack-${id}.json`), JSON.stringify(receipt, null, 2) + "\n");
    fs.writeFileSync(path.join(root, "GenerationRuns", `pack-${id}-config.asset`), configText);
    console.log(`Validated ${count} levels. Pack ${id} is ready. Reload the Level Lab list to play.\n${output.levels}\n${output.solutions}`);
    return receipt;
  } finally {
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

if (require.main === module) {
  try { generate(ROOT, parseArgs(process.argv.slice(2))); }
  catch (error) { console.error(error.code === "EEXIST" ? `A generation is already running, or the requested output exists. ${error.message}` : error.message); process.exitCode = 1; }
}
module.exports = { parseArgs, generate };
