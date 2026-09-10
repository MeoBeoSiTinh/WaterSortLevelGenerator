"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { ROOT, TOOLS, CONFIG, PALETTE, LEVELS, SOLUTIONS, packPaths, readData, validatePair } = require("./common");

const GENERATOR_FILES = ["generate-watersort-exhaustive-100.js", "watersort-exhaustive-solver.js", "mega-generator-v2.js", "watersort-core-fingerprint.js", "validate-pack.js", "solve-watersort-solutions.js", "mega-generator-v2-tests.js", "generator-profile-tests.js", "watersort-core-fingerprint-tests.js"];
const LAB_FILES = ["common.js", "server.js", "generate.js", "index.html", "lab.js", "lab.css", "README.md", "AGENTS.md", "Start.cmd", "Start.sh"];
const CONTEXT_FILES = [CONFIG, PALETTE, "agent-rules/watersort-level-generation.md", "agent-rules/watersort-level-lab.md",
  "Assets/Project/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs",
  "Assets/Project/ScriptableObject/Script/WaterSort/WaterSortColorPalette.cs"];

function copyFile(source, destination) {
  if (!fs.lstatSync(source).isFile()) throw new Error(`Expected a regular file: ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}

function copyPlayer(source, destination) {
  fs.mkdirSync(destination);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Player must not contain links: ${from}`);
    if (entry.isDirectory()) copyPlayer(from, to);
    else if (entry.isFile()) copyFile(from, to);
    else throw new Error(`Unsupported player entry: ${from}`);
  }
}

function packageLab(root, build, output) {
  build = path.resolve(build);
  output = path.resolve(output);
  if (!fs.existsSync(path.join(build, "index.html"))) throw new Error("WebGL build missing. Run Tools/Build-WebGL.ps1 first.");
  const markerFile = path.join(build, "level-lab-build.json");
  if (!fs.existsSync(markerFile) || JSON.parse(readData(markerFile)).externalCatalogVersion !== 1) {
    throw new Error("This player has no Level Lab build marker. Rebuild with the updated WebGLBuildMenu before packaging.");
  }
  const relative = path.relative(build, output);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("Package output must be outside the WebGL build directory.");
  }
  if (fs.existsSync(output)) throw new Error(`Output already exists: ${output}. Choose a new directory.`);
  const required = [...GENERATOR_FILES.map(file => `${TOOLS}/${file}`), ...CONTEXT_FILES,
    ...LAB_FILES.map(file => `Tools/LevelLab/${file}`)];
  for (const file of required) if (!fs.statSync(path.join(root, file)).isFile()) throw new Error(`Missing ${file}`);
  const valid = [];
  for (const file of fs.readdirSync(path.join(root, LEVELS))) {
    const id = file.match(/^watersort-levels-((?!000)\d{3})\.json$/)?.[1];
    if (!id) continue;
    const pair = packPaths(root, id);
    validatePair(root, readData(pair.levels), readData(pair.solutions));
    valid.push(pair);
  }
  fs.mkdirSync(output, { recursive: true });
  copyPlayer(build, path.join(output, "Player"));
  for (const file of required) copyFile(path.join(root, file), path.join(output, file));
  for (const pair of valid) for (const file of Object.values(pair)) copyFile(file, path.join(output, path.relative(root, file)));
  fs.mkdirSync(path.join(output, LEVELS), { recursive: true });
  fs.mkdirSync(path.join(output, SOLUTIONS), { recursive: true });
  for (const file of ["README.md", "AGENTS.md", "Start.cmd", "Start.sh"]) copyFile(path.join(root, "Tools/LevelLab", file), path.join(output, file));
  try { fs.chmodSync(path.join(output, "Start.sh"), 0o755); } catch (_) { /* Windows may ignore execute bits. */ }
  fs.writeFileSync(path.join(output, "level-lab-package.json"), JSON.stringify({ format: 1, nodeMinimumMajor: 22, includedPacks: valid.length }, null, 2) + "\n");
  console.log(`Ready to share: ${output}\n${valid.length} validated packs included. Colleagues run Start.cmd (Windows) or ./Start.sh (macOS/Linux).`);
}

if (require.main === module) {
  try { packageLab(ROOT, path.resolve(ROOT, process.argv[2] || "Builds/WebGL"), path.resolve(ROOT, process.argv[3] || "Builds/LevelLab")); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { packageLab };
