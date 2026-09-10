"use strict";

const fs = require("fs");
const path = require("path");
const {
  evaluateNormalDifficulty,
} = require("../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js");

const root = process.cwd();
const levelDir = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSort");
const solDir = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions");

let updated = 0;
let skipped = 0;

for (const file of fs.readdirSync(solDir).filter((name) => /^watersort-solutions-\d{3}\.json$/.test(name)).sort()) {
  const id = file.match(/(\d{3})/)[1];
  const levelPath = path.join(levelDir, `watersort-levels-${id}.json`);
  const solPath = path.join(solDir, file);
  if (!fs.existsSync(levelPath)) continue;

  const levels = JSON.parse(fs.readFileSync(levelPath, "utf8"));
  const sols = JSON.parse(fs.readFileSync(solPath, "utf8"));
  const byId = new Map(levels.levels.map((level) => [level.id, level]));

  for (const entry of sols.levelSolutions) {
    const level = byId.get(entry.levelNumber);
    if (!level || level.modeOptions?.megaBottle) {
      skipped++;
      continue;
    }
    const moves = entry.solutionData?.solutions?.[0]?.moves;
    if (!Array.isArray(moves) || moves.length === 0) {
      skipped++;
      continue;
    }
    const core = level.bottles.filter((bottle) => !bottle.isAdBottle && !bottle.isMegaBottle);
    const board = core.map((bottle) => bottle.colorsBottomToTop || []);
    const capacity = core[0]?.capacity || 4;
    entry.solutionData.difficultyMetrics = evaluateNormalDifficulty(board, capacity, moves);
    updated++;
    const metrics = entry.solutionData.difficultyMetrics;
    console.log(
      `updated ${id}#${entry.levelNumber} safe=${metrics.safeMoveRatio.toFixed(2)} dead=${metrics.deadEndPotential.toFixed(2)} trap=${metrics.trapLikelihood.toFixed(2)} score=${metrics.difficultyScore.toFixed(2)}`
    );
  }

  fs.writeFileSync(solPath, `${JSON.stringify(sols, null, 2)}\n`);
}

console.log(JSON.stringify({ updated, skipped }, null, 2));
