"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd();
const packageDir = path.join(root, "_bmad-output/unity-packages");
const outputPath = path.join(packageDir, "WaterSortLevelGeneration.unitypackage");

const assetEntries = [
  "Assets/Project/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs",
  "Assets/Project/ScriptableObject/Script/WaterSort/WaterSortColorPalette.cs",
  "Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset",
  "Assets/Project/Data/WaterSort/Resources/WaterSortColorPalette.asset",
  "Assets/Project/Editor/WaterSort/LevelGeneration/README.md",
  "Assets/Project/Editor/WaterSort/LevelGeneration/AI_CONTEXT.md",
  "Assets/Project/Editor/WaterSort/LevelGeneration/Docs/watersort-level-generation.md",
  "Assets/Project/Editor/WaterSort/LevelGeneration/WaterSortLevelDataDesignerWindow.cs",
  "Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js",
  "Assets/Project/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2.js",
  "Assets/Project/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2-tests.js",
  "Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js",
  "Assets/Project/Editor/WaterSort/LevelGeneration/Tools/watersort-exhaustive-solver.js",
  "Assets/Project/Editor/WaterSort/LevelGeneration/Tools/solve-watersort-solutions.js",
].map(sourcePath => ({
  sourcePath,
  packagePath: sourcePath.replace(/^Assets\/Project\//, "Assets/LevelGenerator/"),
}));

function readGuid(metaPath) {
  const text = fs.readFileSync(metaPath, "utf8");
  const match = text.match(/^guid:\s*([0-9a-fA-F]+)\s*$/m);
  if (!match) {
    throw new Error(`Missing guid in ${metaPath}`);
  }

  return match[1].toLowerCase();
}

function assertInsideRoot(relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new Error(`Path escapes project root: ${relativePath}`);
  }

  return resolved;
}

function copyPackageEntry(tempDir, entry) {
  const assetPath = assertInsideRoot(entry.sourcePath);
  const metaPath = `${assetPath}.meta`;
  if (!fs.existsSync(assetPath)) {
    throw new Error(`Missing asset: ${entry.sourcePath}`);
  }

  if (!fs.existsSync(metaPath)) {
    throw new Error(`Missing meta: ${entry.sourcePath}.meta`);
  }

  const guid = readGuid(metaPath);
  const entryDir = path.join(tempDir, guid);
  fs.mkdirSync(entryDir, { recursive: true });
  fs.copyFileSync(assetPath, path.join(entryDir, "asset"));
  fs.copyFileSync(metaPath, path.join(entryDir, "asset.meta"));
  fs.writeFileSync(path.join(entryDir, "pathname"), entry.packagePath.replace(/\\/g, "/"), "utf8");
}

function main() {
  fs.mkdirSync(packageDir, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "watersort-level-generation-package-"));

  try {
    for (const entry of assetEntries) {
      copyPackageEntry(tempDir, entry);
    }

    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath);
    }

    const result = spawnSync("tar", ["-czf", outputPath, "-C", tempDir, "."], {
      cwd: root,
      encoding: "utf8",
    });

    if (result.status !== 0) {
      throw new Error(`tar failed:\n${result.stderr || result.stdout}`);
    }

    console.log(JSON.stringify({
      package: path.relative(root, outputPath),
      assets: assetEntries.length,
    }, null, 2));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
