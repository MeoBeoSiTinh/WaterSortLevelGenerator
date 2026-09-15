"use strict";

/**
 * Build an ASMR-screenshot-similar pack via production generator.
 * Bags => locked; frost => color-locked; ? layers => hidden/hybrid.
 * Prefer 0 normal empty helpers. Ads stay at generator rule (2–3).
 *
 * Usage:
 *   node Tools/generate-asmr-like-pack.js
 *   WATERSORT_ASMR_PACK=8 node Tools/generate-asmr-like-pack.js
 *   WATERSORT_ASMR_ONLY_LEVEL=3 node Tools/generate-asmr-like-pack.js
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd();
const configPath = path.join(root, "Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset");
const tempConfigPath = path.join(root, "Tools/_tmp_asmr_gen_config.asset");
const generator = path.join(root, "Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js");
const validate = path.join(root, "Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js");
const packNumber = Math.max(1, Number(process.env.WATERSORT_ASMR_PACK || 8) || 8);
const packId = String(packNumber).padStart(3, "0");
const levelOut = path.join(root, `Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-${packId}.json`);
const solutionOut = path.join(root, `Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-${packId}.json`);
const tempPack = 997;

/** Batch1 = ASMR L1–10 screenshots → pack 007. Batch2 = next 10 shots → pack 008. */
const SPECS_BY_PACK = {
  7: [
    { id: 1, profile: "Normal", core: 17, colors: 8, helpers: 0, modes: ["mega"], note: "Mega heart-like" },
    { id: 2, profile: "Normal", core: 18, colors: 8, helpers: 0, modes: ["hidden"], note: "Full hidden ?" },
    { id: 3, profile: "Normal", core: 16, colors: 7, helpers: 0, modes: ["hybrid", "locked"], note: "Hybrid + bags" },
    { id: 4, profile: "Normal", core: 15, colors: 7, helpers: 0, modes: ["classic"], note: "Classic dense" },
    { id: 5, profile: "Normal", core: 17, colors: 7, helpers: 0, modes: ["locked"], note: "Bags locked" },
    { id: 6, profile: "Normal", core: 16, colors: 7, helpers: 0, modes: ["colorLocked", "locked"], note: "Frost + bags" },
    { id: 7, profile: "Normal", core: 15, colors: 7, helpers: 0, modes: ["hybrid"], note: "Hybrid hidden" },
    { id: 8, profile: "Normal", core: 18, colors: 8, helpers: 0, modes: ["hidden"], note: "Full hidden dense" },
    { id: 9, profile: "Normal", core: 16, colors: 7, helpers: 0, modes: ["hybrid", "colorLocked"], note: "Frost + hybrid" },
    { id: 10, profile: "Normal", core: 17, colors: 6, helpers: 0, modes: ["mega"], note: "Mega peacock-like" },
  ],
  // Pack ids 1..10 = ASMR levels 11..20 (sorted). Attachment order was 12,14,13,11,15,16,18,20,19,17.
  8: [
    { id: 1, profile: "Normal", core: 18, colors: 8, helpers: 0, modes: ["hybrid", "locked"], note: "ASMR11 hybrid+bags" },
    { id: 2, profile: "Normal", core: 22, colors: 8, helpers: 0, modes: ["hybrid", "locked"], note: "ASMR12 hybrid+bags" },
    { id: 3, profile: "Normal", core: 16, colors: 8, helpers: 0, modes: ["colorLocked"], note: "ASMR13 frost pair" },
    { id: 4, profile: "Normal", core: 20, colors: 8, helpers: 0, modes: ["hybrid", "locked", "colorLocked"], note: "ASMR14 hybrid+bag+frost" },
    { id: 5, profile: "Normal", core: 20, colors: 7, helpers: 0, modes: ["hybrid", "colorLocked"], note: "ASMR15 hybrid+frost" },
    { id: 6, profile: "Normal", core: 18, colors: 7, helpers: 0, modes: ["hybrid", "locked"], note: "ASMR16 hybrid+bags" },
    { id: 7, profile: "Normal", core: 18, colors: 8, helpers: 0, modes: ["hybrid", "locked", "colorLocked"], note: "ASMR17 hybrid+bag+frost" },
    { id: 8, profile: "Normal", core: 20, colors: 7, helpers: 0, modes: ["hybrid", "locked"], note: "ASMR18 hybrid+bags" },
    { id: 9, profile: "Normal", core: 20, colors: 8, helpers: 0, modes: ["hybrid", "locked", "colorLocked"], note: "ASMR19 hybrid+bag+frost" },
    { id: 10, profile: "Normal", core: 19, colors: 7, helpers: 0, modes: ["mega"], note: "ASMR20 mega lungs" },
  ],
};

const SPECS = SPECS_BY_PACK[packNumber];
if (!SPECS) throw new Error(`No ASMR SPECS for pack ${packNumber}`);

function forceProfileField(yaml, profileName, field, value) {
  const nameRe = new RegExp(`(name: ${profileName}\\n[\\s\\S]*?)(\\n    ${field}: )[^\\n]+`);
  if (!nameRe.test(yaml)) throw new Error(`Cannot find ${field} under profile ${profileName}`);
  return yaml.replace(nameRe, `$1$2${value}`);
}

function replaceColorWeights(yaml, profileName, colorCount) {
  const re = new RegExp(
    `(name: ${profileName}\\n[\\s\\S]*?\\n    colorWeights:\\n)(?:    - colorCount: \\d+\\n      weight: \\d+\\n)+`,
  );
  if (!re.test(yaml)) throw new Error(`Cannot replace colorWeights for ${profileName}`);
  return yaml.replace(re, `$1    - colorCount: ${colorCount}\n      weight: 100\n`);
}

function buildTempConfig(spec) {
  let yaml = fs.readFileSync(configPath, "utf8");
  const modes = new Set(spec.modes);
  const isMega = modes.has("mega");
  const wantHidden = modes.has("hidden");
  const wantHybrid = modes.has("hybrid");
  const wantLocked = modes.has("locked");
  const wantColorLocked = modes.has("colorLocked");
  const bottleMin = Math.max(8, spec.core - 2);
  const bottleMax = spec.core + 2;
  // Mega ASMR refs use 0 normal empty helpers; do not auto-add support empties.
  const helperMax = Math.max(0, spec.helpers);

  yaml = yaml.replace(/levelsPerPack: \d+/, "levelsPerPack: 1");
  yaml = yaml.replace(/selectedDifficultyProfile: \w+/, `selectedDifficultyProfile: ${spec.profile}`);
  yaml = yaml.replace(/preferredMinEmptyBottleCount: \d+/, `preferredMinEmptyBottleCount: ${spec.helpers}`);
  yaml = yaml.replace(/preferredMaxEmptyBottleCount: \d+/, `preferredMaxEmptyBottleCount: ${helperMax}`);
  yaml = yaml.replace(/duplicateColorBottleChance: [0-9.]+/, "duplicateColorBottleChance: 0.9");
  yaml = yaml.replace(/maxDuplicateBottleTargetsPerColor: \d+/, "maxDuplicateBottleTargetsPerColor: 8");

  yaml = replaceColorWeights(yaml, spec.profile, spec.colors);
  yaml = forceProfileField(yaml, spec.profile, "minTargetBottleCount", bottleMin);
  yaml = forceProfileField(yaml, spec.profile, "maxTargetBottleCount", bottleMax);
  yaml = forceProfileField(yaml, spec.profile, "minNormalHelperCount", spec.helpers);
  yaml = forceProfileField(yaml, spec.profile, "maxNormalHelperCount", helperMax);

  yaml = forceProfileField(yaml, spec.profile, "allowHiddenStackMode", wantHidden ? 1 : 0);
  yaml = forceProfileField(yaml, spec.profile, "hiddenStackChance", wantHidden ? 1 : 0);
  yaml = forceProfileField(yaml, spec.profile, "allowHybridHiddenStackMode", wantHybrid ? 1 : 0);
  yaml = forceProfileField(yaml, spec.profile, "hybridHiddenStackChance", wantHybrid ? 1 : 0);
  yaml = forceProfileField(yaml, spec.profile, "allowLockedBottleMode", wantLocked ? 1 : 0);
  yaml = forceProfileField(yaml, spec.profile, "lockedBottleChance", wantLocked ? 1 : 0);
  yaml = forceProfileField(yaml, spec.profile, "minLockedBottleCount", wantLocked ? 2 : 1);
  yaml = forceProfileField(yaml, spec.profile, "maxLockedBottleCount", wantLocked ? 3 : 1);
  // allowColorLockedBottleMode must stay on so composed boards map to desiredDistinctColors
  // (generator uses full paletteSize when this flag is off). Chance still gates frost bottles.
  yaml = forceProfileField(yaml, spec.profile, "allowColorLockedBottleMode", 1);
  yaml = forceProfileField(yaml, spec.profile, "colorLockedBottleChance", wantColorLocked ? 1 : 0);
  yaml = forceProfileField(yaml, spec.profile, "minColorLockedBottleCount", wantColorLocked ? 1 : 1);
  yaml = forceProfileField(yaml, spec.profile, "maxColorLockedBottleCount", wantColorLocked ? 2 : 1);
  yaml = forceProfileField(yaml, spec.profile, "minCompletedColorBottleCountToUnlock", 1);
  yaml = forceProfileField(yaml, spec.profile, "maxCompletedColorBottleCountToUnlock", 1);
  yaml = forceProfileField(yaml, spec.profile, "allowMegaBottleMode", isMega ? 1 : 0);
  yaml = forceProfileField(yaml, spec.profile, "megaBottleChance", isMega ? 1 : 0);

  // ASMR pack tool only — not production config. Prioritize mode/count match + solvability.
  yaml = forceProfileField(yaml, spec.profile, "minShortestStepCount", isMega ? 6 : 10);
  yaml = forceProfileField(yaml, spec.profile, "maxShortestStepCount", 180);
  yaml = forceProfileField(yaml, spec.profile, "maxSafeMoveRatio", 1);
  yaml = forceProfileField(yaml, spec.profile, "minDeadEndPotential", 0);
  yaml = forceProfileField(yaml, spec.profile, "minTrapLikelihood", 0);
  yaml = forceProfileField(yaml, spec.profile, "minPartialBottleCount", 0);
  yaml = forceProfileField(yaml, spec.profile, "minAverageBranchingFactor", 0);
  yaml = forceProfileField(yaml, spec.profile, "minCriticalDecisionCount", 0);
  yaml = forceProfileField(yaml, spec.profile, "minActiveFillRatio", 0.45);
  yaml = forceProfileField(yaml, spec.profile, "targetActiveFillRatio", 0.8);
  yaml = forceProfileField(yaml, spec.profile, "maxStartingFreeRatio", 0.5);
  yaml = forceProfileField(yaml, spec.profile, "targetDifficultyScoreMin", 0);
  yaml = forceProfileField(yaml, spec.profile, "targetDifficultyScoreMax", 1);

  if (isMega) {
    // spec.core includes mega bottle; active tubes ≈ core - 1
    const megaActive = Math.max(10, spec.core - 1);
    yaml = forceProfileField(yaml, spec.profile, "minMegaActiveBottleCount", megaActive);
    yaml = forceProfileField(yaml, spec.profile, "maxMegaActiveBottleCount", megaActive);
    yaml = forceProfileField(yaml, spec.profile, "minMegaBlockerColorCount", Math.max(3, Math.min(spec.colors - 1, 5)));
    yaml = forceProfileField(yaml, spec.profile, "maxMegaBlockerColorCount", Math.max(5, spec.colors));
    // Match screenshot: no spare empty normal tubes; workspace comes from pours into mega/target tops.
    yaml = forceProfileField(yaml, spec.profile, "minMegaNormalHelperCount", 0);
    yaml = forceProfileField(yaml, spec.profile, "maxMegaNormalHelperCount", 0);
    yaml = forceProfileField(yaml, spec.profile, "minMegaBuriedTargetRatio", 0.35);
    yaml = forceProfileField(yaml, spec.profile, "minMegaDeepBuriedTargetRatio", 0.1);
    yaml = forceProfileField(yaml, spec.profile, "minMegaUniqueTopColorCount", 2);
    yaml = forceProfileField(yaml, spec.profile, "maxMegaTopColorShare", 0.55);
    yaml = forceProfileField(yaml, spec.profile, "minMegaUniqueBottlePatternRatio", 0.45);
    yaml = forceProfileField(yaml, spec.profile, "minMegaMovesBeforeFirstFill", 1);
    yaml = forceProfileField(yaml, spec.profile, "minMegaCrossBottleBlockerMoves", 1);
    yaml = forceProfileField(yaml, spec.profile, "minMegaNonMegaMoveRatio", 0.08);
    yaml = forceProfileField(yaml, spec.profile, "maxMegaConsecutiveFillMoves", 12);
    yaml = forceProfileField(yaml, spec.profile, "minMegaActiveFillRatio", 0.92);
    yaml = forceProfileField(yaml, spec.profile, "targetMegaActiveFillRatio", 1);
    yaml = forceProfileField(yaml, spec.profile, "maxMegaActiveFreeRatio", 0.06);
    yaml = forceProfileField(yaml, spec.profile, "maxMegaSparseBottleRatio", 0.06);
    yaml = forceProfileField(yaml, spec.profile, "maxMegaSingleLayerBottleCount", 0);
    yaml = forceProfileField(yaml, spec.profile, "megaFreeCapacityConcentrationRatio", 0.35);
    yaml = forceProfileField(yaml, spec.profile, "megaCandidateAttemptCount", 160);
  }

  fs.writeFileSync(tempConfigPath, yaml);
  return { bottleMin, bottleMax };
}

function modeMatches(level, spec) {
  const modes = new Set(spec.modes);
  const mo = level.modeOptions || {};
  if (modes.has("mega") && !mo.megaBottle) return "need mega";
  if (modes.has("hidden") && !mo.hiddenStack) return "need hidden";
  if (modes.has("hybrid") && !mo.hybridHiddenStack) return "need hybrid";
  if (modes.has("classic") && (mo.megaBottle || mo.hiddenStack || mo.hybridHiddenStack || mo.lockedBottles || mo.colorLockedBottles)) {
    return "need classic-only";
  }
  if (modes.has("locked") && !mo.lockedBottles) return "need locked (bags)";
  if (modes.has("colorLocked") && !mo.colorLockedBottles) return "need colorLocked (frost)";
  if (!modes.has("mega") && mo.megaBottle) return "unexpected mega";
  if (!modes.has("hidden") && mo.hiddenStack) return "unexpected hidden";
  if (!modes.has("hybrid") && mo.hybridHiddenStack) return "unexpected hybrid";
  return null;
}

function countAds(level) {
  return (level.bottles || []).filter((b) => b.isAdBottle).length;
}

function countEmptyNormal(level) {
  return (level.bottles || []).filter((b) => !b.isAdBottle && !b.isMegaBottle && (b.colorsBottomToTop || []).length === 0).length;
}

function countCoreBottles(level) {
  return (level.bottles || []).filter((b) => !b.isAdBottle).length;
}

/** Non-mega bottles that are 3–4 layers of a single color (looks pre-sorted). */
function countNearMonoNormals(level) {
  let n = 0;
  for (const b of level.bottles || []) {
    if (b.isAdBottle || b.isMegaBottle) continue;
    const colors = b.colorsBottomToTop || [];
    if (colors.length >= 3 && colors.every((c) => c === colors[0])) n += 1;
  }
  return n;
}

function distinctColors(level) {
  const set = new Set();
  for (const b of level.bottles || []) {
    if (b.isAdBottle) continue;
    for (const c of b.colorsBottomToTop || []) set.add(c);
    if (Number.isInteger(b.targetColor)) set.add(b.targetColor);
  }
  return set.size;
}

function runGenerator(spec, seed) {
  const bounds = buildTempConfig(spec);
  const env = {
    ...process.env,
    WATERSORT_GENERATION_CONFIG_PATH: path.relative(root, tempConfigPath).replace(/\\/g, "/"),
    WATERSORT_LEVELS_PER_PACK: "1",
    WATERSORT_BOTTLE_CAPACITY: "4",
  };
  delete env.WATERSORT_CORE_BOTTLE_COUNT;
  delete env.WATERSORT_COLOR_COUNT;
  delete env.WATERSORT_HELPER_COUNT;
  delete env.WATERSORT_NORMAL_HELPER_COUNT;
  const result = spawnSync(process.execPath, [generator, String(tempPack), String(seed), spec.profile], {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "");
    const last = err.match(/Unable to generate[^\n]+/)?.[0]
      || err.match(/Error: [^\n]+/)?.[0]
      || err.slice(-800);
    throw new Error(last);
  }
  const levelsPath = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-997.json");
  const solsPath = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-997.json");
  const levelPack = JSON.parse(fs.readFileSync(levelsPath, "utf8"));
  const solPack = JSON.parse(fs.readFileSync(solsPath, "utf8"));
  return { level: levelPack.levels[0], solution: solPack.levelSolutions[0], bounds };
}

function main() {
  const levels = [];
  const levelSolutions = [];
  const baseSeed = 20260911 + packNumber * 10007;
  const onlyRaw = process.env.WATERSORT_ASMR_ONLY_LEVEL;
  const onlyId = onlyRaw != null && onlyRaw !== "" ? Number(onlyRaw) : null;
  const specs = Number.isFinite(onlyId) ? SPECS.filter((spec) => spec.id === onlyId) : SPECS;
  if (specs.length === 0) throw new Error(`No ASMR specs for WATERSORT_ASMR_ONLY_LEVEL=${onlyRaw}`);
  console.error(`ASMR pack ${packId} → ${levelOut}`);

  for (const spec of specs) {
    let accepted = null;
    let lastErr = null;
    const maxAttempts = spec.modes.includes("mega") ? 40 : (spec.modes.length >= 3 ? 28 : 20);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const seed = baseSeed + spec.id * 97 + attempt * 17;
      try {
        console.error(`\n=== L${spec.id} ${spec.note} attempt ${attempt + 1} seed=${seed} ===`);
        const { level, solution, bounds } = runGenerator(spec, seed);
        const modeErr = modeMatches(level, spec);
        if (modeErr) {
          lastErr = modeErr;
          console.error(`  reject: ${modeErr} modes=${JSON.stringify(level.modeOptions)}`);
          continue;
        }
        if (!solution?.solutionData?.solutions?.length) {
          lastErr = "no solution";
          continue;
        }
        const ads = countAds(level);
        if (ads < 2 || ads > 3) {
          lastErr = `bad ads ${ads}`;
          continue;
        }
        const core = countCoreBottles(level);
        const colors = distinctColors(level);
        const empties = countEmptyNormal(level);
        if (spec.modes.includes("mega")) {
          if (empties > 0) {
            lastErr = `mega must have 0 empty normals, got ${empties}`;
            console.error(`  reject: ${lastErr}`);
            continue;
          }
          const nearMono = countNearMonoNormals(level);
          if (nearMono > 0) {
            lastErr = `mega has ${nearMono} near-mono bottle(s) (3+ same color)`;
            console.error(`  reject: ${lastErr}`);
            continue;
          }
          if (core < bounds.bottleMin || core > bounds.bottleMax + 1) {
            lastErr = `mega core bottles ${core} outside ${bounds.bottleMin}-${bounds.bottleMax + 1}`;
            console.error(`  reject: ${lastErr}`);
            continue;
          }
        } else if (core < bounds.bottleMin - 1 || core > bounds.bottleMax + 4) {
          lastErr = `core bottles ${core} outside ~${bounds.bottleMin}-${bounds.bottleMax}`;
          console.error(`  reject: ${lastErr}`);
          continue;
        }
        if (Math.abs(colors - spec.colors) > 2) {
          lastErr = `colors ${colors} vs target ${spec.colors}`;
          console.error(`  reject: ${lastErr}`);
          continue;
        }
        if (spec.modes.includes("mega")) {
          // already handled empties above
        } else if (empties > Math.max(spec.helpers, 1) + 1) {
          lastErr = `too many empty normals ${empties}`;
          console.error(`  reject: ${lastErr}`);
          continue;
        }

        level.id = spec.id;
        level.displayName = `Level ${spec.id}`;
        solution.levelNumber = spec.id;
        accepted = { level, solution, empties, ads, colors, core };
        break;
      } catch (error) {
        lastErr = error.message;
        console.error(`  error: ${String(error.message).slice(0, 500)}`);
      }
    }
    if (!accepted) throw new Error(`Failed L${spec.id}: ${lastErr}`);
    console.error(`  OK core=${accepted.core} colors=${accepted.colors} ads=${accepted.ads} emptyN=${accepted.empties} modes=${JSON.stringify(accepted.level.modeOptions)} steps=${accepted.solution.solutionData.shortestStepCount}`);
    levels.push(accepted.level);
    levelSolutions.push(accepted.solution);
  }

  const mergeIntoExisting = process.env.WATERSORT_ASMR_MERGE === "1" && fs.existsSync(levelOut) && fs.existsSync(solutionOut);
  if (mergeIntoExisting) {
    const existingLevels = JSON.parse(fs.readFileSync(levelOut, "utf8"));
    const existingSols = JSON.parse(fs.readFileSync(solutionOut, "utf8"));
    for (const level of levels) {
      const idx = existingLevels.levels.findIndex((row) => row.id === level.id);
      if (idx < 0) throw new Error(`Merge: level id ${level.id} not found in ${levelOut}`);
      existingLevels.levels[idx] = level;
    }
    for (const solution of levelSolutions) {
      const idx = existingSols.levelSolutions.findIndex((row) => row.levelNumber === solution.levelNumber);
      if (idx < 0) throw new Error(`Merge: solution levelNumber ${solution.levelNumber} not found`);
      existingSols.levelSolutions[idx] = solution;
    }
    fs.writeFileSync(levelOut, `${JSON.stringify(existingLevels, null, 2)}\n`);
    fs.writeFileSync(solutionOut, `${JSON.stringify(existingSols, null, 2)}\n`);
  } else {
    fs.writeFileSync(levelOut, `${JSON.stringify({ packName: `Water Sort Levels ${packId}`, levels }, null, 2)}\n`);
    fs.writeFileSync(solutionOut, `${JSON.stringify({ packName: `Water Sort Solutions ${packId}`, levelSolutions }, null, 2)}\n`);
  }

  for (const p of [
    path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-997.json"),
    path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-997.json.meta"),
    path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-997.json"),
    path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-997.json.meta"),
    tempConfigPath,
  ]) {
    try { fs.unlinkSync(p); } catch (_) { /* ignore */ }
  }

  const v = spawnSync(process.execPath, [validate, levelOut, solutionOut], { cwd: root, encoding: "utf8" });
  console.log(v.stdout || "");
  if (v.status !== 0) {
    console.error(v.stderr || "");
    process.exit(v.status || 1);
  }

  console.log(JSON.stringify({
    pack: packNumber,
    levels: levels.map((level, i) => ({
      id: level.id,
      coreBottles: countCoreBottles(level),
      totalBottles: level.bottles.length,
      colors: distinctColors(level),
      ads: countAds(level),
      emptyNormals: countEmptyNormal(level),
      modes: level.modeOptions,
      steps: levelSolutions[i].solutionData.shortestStepCount,
      note: specs[i].note,
    })),
  }, null, 2));
}

main();
