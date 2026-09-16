# Water Sort Level Lab — AI instructions

This folder lets colleagues generate and playtest Water Sort data without Unity. Use the actual prebuilt game in `Player/`. Node.js 22+ is the only command-line prerequisite. Do not run Unity, rebuild the player, install npm dependencies, or implement a replacement game for a level-generation request.

Also follow these files when present:

- `agent-rules/watersort-gameplay-modes.md` — modes, pour rules, win conditions, create & solve overview
- `agent-rules/watersort-level-generation.md` — authoritative generation/schema rules
- `agent-rules/watersort-level-lab.md` — Lab packaging / localhost play rules

## Read before generate/edit

1. `agent-rules/watersort-gameplay-modes.md`
2. `agent-rules/watersort-level-generation.md` — Unity-only editor steps do not apply to this portable folder
3. `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset` — YAML config
4. `Assets/Project/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs` — field schema when needed
5. `Assets/Project/Data/WaterSort/Resources/WaterSortColorPalette.asset` — do not change without a new player build

## Edit config

Honor requested config changes within the authoritative rules, then generate.

- Edit `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset` as YAML.
- Keep Unity YAML headers (`%YAML`, `MonoBehaviour`, `m_*`).
- Prefer small `levelsPerPack` while tuning.
- Profile can also be selected with `--profile Easy|Normal|Hard|VeryHard|Special`.
- Config-only changes do not need a player rebuild. Palette or gameplay code changes do.

Example prompt:

> Read AGENTS.md and WaterSortGenerationConfig.asset. Set levelsPerPack to 5 and use Easy. Then run Tools/LevelLab/generate.js and tell me which pack to play.

## Generate

From this folder's root:

```sh
node Tools/LevelLab/generate.js
node Tools/LevelLab/generate.js --profile Easy --seed 12345
node Tools/LevelLab/generate.js --pack 5 --config path/to/config.asset
```

The wrapper calls the production generator, pins config for the run, picks a free pack number (unless `--pack` is set), records an explicit seed, validates with production `validate-pack.js`, and publishes the pair only on success. It removes inherited `WATERSORT_*` environment overrides so the documented config is authoritative.

Honor profile composition/difficulty gates in config (helpers, partial fills, safe-move / dead-end / trap targets). Prefer partial fills over many empty normal helpers; Ads stay separate. Keep the approved difficulty baseline — do not silently soften those gates to make generation succeed. Do not overwrite existing packs. Do not edit generated output to conceal a generator defect. When a constraint cannot be satisfied, explain the actual failure. Never weaken capacity, layout, hidden, lock, color-lock, Mega, Ad or solution rules silently. Do not claim global shortestness unless proven by the solver.

Production modules live under `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/`. Entry point: `generate-watersort-exhaustive-100.js`. Do not use legacy generators or `_bmad-output` copies as source of truth. Do not run `solve-watersort-solutions.js` as routine post-generation validation.

Supported modes (summary — see gameplay-modes doc): classic, full/hybrid hidden, count-lock, color-lock (unlock 1–3 preferred), Mega, Ads helpers, Special/NearWin.

## Output

- `Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-###.json`
- `Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-###.json`
- Receipt/config snapshot: `GenerationRuns/pack-###.json` and `GenerationRuns/pack-###-config.asset`

Each pair has at most 100 levels. IDs are pack-scoped: map `level.id` to `solution.levelNumber`. Every level needs exactly one matching solution entry; all stored paths must replay. Keep 2–3 empty optional Ad bottles out of solutions; normal capacities 2–5; Mega 12–20; visual placement via playband (`boardLayout` + unique `layoutPosition`). Hidden and hybrid modes are mutually exclusive. Count-lock and color-lock may coexist on a level but not on the same bottle.

Stored solutions may include `difficultyMetrics` (difficultyScore, safeMoveRatio, deadEndPotential, trapLikelihood, …). Those are tuning/inspection metrics, not a second solvability proof.

## Play

```sh
node Tools/LevelLab/server.js
```

Or:

- Windows: `Start.cmd`
- macOS / Linux: `./Start.sh` (run `chmod +x Start.sh` once if needed)

The server auto-detects `Player/` (packaged) or, in the Unity project, `Builds/WebGL`. It picks a free localhost port (default start 8081), opens the browser, and serves no-cache JSON. Use Reload List after generating. Existing game tabs need a page reload (hard refresh after a new player package). Keep the server running.

On the WebGL Lab player, left panels show level metrics + stored solution steps; the right panel can Save/Import curated levels. Report pack number, level count, validation result, and the localhost play path. Return both JSON files plus `GenerationRuns` receipt/config to the project owner.
