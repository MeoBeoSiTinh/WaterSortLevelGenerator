# Water Sort Level Lab Rules

Use this rule when packaging, serving, generating, or playtesting Water Sort levels through the portable Level Lab (colleagues without Unity).

## Purpose

Distribute a self-contained folder so colleagues can:

1. Edit generation config as YAML (no Unity).
2. Generate validated level + solution JSON with Node.
3. Play the real WebGL game on localhost and reload new packs without rebuilding.

Do not reimplement gameplay in the browser. Do not require colleagues to install Unity, Python, or npm packages for normal Lab use.

## Paths

| Role | Path |
|---|---|
| Lab tooling | `Tools/LevelLab/` |
| Colleague AI instructions | `Tools/LevelLab/AGENTS.md` |
| Colleague README | `Tools/LevelLab/README.md` |
| Launcher | `Tools/LevelLab/Start.cmd` |
| Packaged share folder | `Builds/LevelLab/` (created by package step) |
| Owner WebGL player | `Builds/WebGL/` |

Production generator/validator stay under `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/`. Lab wrappers call those modules; do not fork a second rule engine.

## Owner: build and package

1. Close Unity Editor for this project before batch builds (only one Unity instance may open the project).
2. Build WebGL with Level Lab marker:
   - Menu: **Tools → Water Sort → Build → WebGL Release Build**, or
   - `powershell -ExecutionPolicy Bypass -File Tools/Build-WebGL.ps1 -Release`
3. Successful builds write `Builds/WebGL/level-lab-build.json` with `externalCatalogVersion: 1`.
4. Package: `node Tools/LevelLab/package.js Builds/WebGL Builds/LevelLab`
5. Share the entire `Builds/LevelLab` folder (includes `Player/`, Tools, allowlisted Assets, `agent-rules`, `Start.cmd`, `AGENTS.md`, `README.md`).

For in-project testing without packaging: `node Tools/LevelLab/server.js` (auto-detects `Player/` or `Builds/WebGL`).

## Colleague: generate and play

Prerequisites: Node.js 22+.

1. Unzip the shared folder and run `Start.cmd` (Windows) or `./Start.sh` (macOS/Linux; `chmod +x Start.sh` once if needed). Or run `node Tools/LevelLab/server.js`.
2. Server binds loopback only, auto-picks a free port starting at 8081, opens the browser, and serves no-cache data.
3. Read mode/rules overview: `agent-rules/watersort-gameplay-modes.md` (packaged with the Lab).
4. Edit config when needed:
   - `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset` (YAML; keep Unity headers)
   - Schema: `Assets/Project/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs`
5. Generate: `node Tools/LevelLab/generate.js` with optional `--pack`, `--seed`, `--profile`, `--config`.
6. Reload the Lab pack list and open the player. Hard-refresh (`Ctrl+F5`) after a new WebGL player is packaged.

Config edits do not require a player rebuild. Palette or gameplay code changes do.

## Runtime loading

- Lab mode URL query: `levelLab=1&pack=###` on `/player/index.html`.
- `WaterSortExternalCatalogLoader` fetches `/api/manifest` then the selected pack pair from the same origin.
- `WaterSortJsonCatalog.AddPack` associates solutions by pack-local level identity (`level.id` ↔ `solution.levelNumber`), not global array position.
- Ordinary non-Lab startup still loads Resources packs.

Never silently fall back to embedded Resources data after an external Lab load failure.

## WebGL inspection UI (Lab / WebGL only)

On WebGL builds, `WaterSortGameView` shows side panels outside the gameplay board:

- Left (stacked): level summary (difficulty profile, bottle/color/mode overview, playability ratios) above the stored solution move list for the current level.
- Right: saved-level curation — **Save** adds the current level (keyed by pack id + level id) to an in-memory list; **Import** downloads that list as a `watersort-levels-*.json` pack with unique renumbered ids and pack-prefixed display names; rows support reorder (↑/↓), delete, delete all, and click-to-jump to that level in the loaded catalog. UI titles use `[packId] displayName` so duplicate names across packs stay distinct.

Do not enable these panels on non-WebGL player builds. Difficulty metrics come from stored solution JSON; they are selector/tuning signals, not a second solvability proof. Solvability remains exact solution replay.

## Verification

- `node --check` on changed Lab JS.
- `node --test Tools/LevelLab/tests/lab.test.js`
- After player changes: rebuild WebGL, confirm `level-lab-build.json`, refresh `Builds/LevelLab/Player` or re-run `package.js`, smoke `http://127.0.0.1:<port>/` and `/api/manifest`.
- Do not claim Unity compilation passed unless it was run.
