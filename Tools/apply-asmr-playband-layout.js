"use strict";

/**
 * Stamp ASMR playband layout onto a levels JSON pack (keeps gameplay fields).
 *
 * Usage:
 *   node Tools/apply-asmr-playband-layout.js <levels.json> [--family columns] [--inplace]
 *   node Tools/apply-asmr-playband-layout.js <levels.json> --out <out.json>
 */

const fs = require("fs");
const path = require("path");
const {
  applyPlaybandLayout,
  assignFamiliesForPack,
  validatePlaybandLevel,
  FAMILIES,
} = require("../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/asmr-playband-layout.js");

function parseArgs(argv) {
  const args = { input: null, out: null, inplace: false, family: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--inplace") args.inplace = true;
    else if (token === "--family") args.family = argv[++i];
    else if (token === "--out") args.out = argv[++i];
    else if (token.startsWith("-")) throw new Error(`Unknown flag ${token}`);
    else rest.push(token);
  }
  args.input = rest[0];
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Usage: node Tools/apply-asmr-playband-layout.js <levels.json> [--family name] [--inplace|--out file]");
    process.exit(1);
  }
  if (args.family && !FAMILIES.includes(args.family)) {
    throw new Error(`family must be one of: ${FAMILIES.join(", ")}`);
  }

  const inputPath = path.resolve(args.input);
  const pack = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!Array.isArray(pack.levels)) throw new Error("pack.levels missing");

  const familyCounts = args.family
    ? null
    : assignFamiliesForPack(pack.levels);

  let invalid = 0;
  for (const level of pack.levels) {
    if (args.family) {
      applyPlaybandLayout(level, { family: args.family });
    }
    const errors = validatePlaybandLevel(level);
    if (errors.length) {
      invalid += 1;
      console.error(`Level ${level.id}: ${errors.join("; ")}`);
    }
  }

  if (familyCounts) {
    console.log(`Family mix: ${JSON.stringify(familyCounts)}`);
  }

  const outPath = args.inplace
    ? inputPath
    : path.resolve(args.out || inputPath.replace(/\.json$/i, ".playband.json"));
  fs.writeFileSync(outPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
  console.log(`Wrote ${pack.levels.length} levels → ${outPath} (invalid layouts: ${invalid})`);
  if (invalid > 0) process.exit(2);
}

main();
