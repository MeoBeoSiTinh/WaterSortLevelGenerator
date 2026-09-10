---
title: 'Portable Water Sort generation and localhost playtesting'
type: 'feature'
created: '2026-09-10'
status: 'done'
baseline_commit: '8ffcefad5e6825b21725698b6f979533f4ecb53d'
context: ['agent-rules/watersort-level-generation.md', 'agent-rules/game-flow.md']
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** Colleagues without Unity need to use an AI coding assistant to generate levels with this project's rules and configuration, then play those levels locally. The current game loads Resources embedded at build time; serving its WebGL output alone cannot load newly generated packs.

**Approach:** Distribute a portable Level Lab containing a prebuilt copy of the actual Unity WebGL game, the production Node generator and dependencies, configuration, palette, authoritative rules, and a localhost server. The project owner builds the updated player once. Colleagues generate JSON and refresh the player without installing Unity or rebuilding. AI means their existing coding assistant operating on the shared folder; this feature does not introduce an AI service or API account.

## Boundaries & Constraints

**Always:** Preserve existing workspace changes. Reuse production generation and exact validation paths. Keep the game mechanics in the existing Unity player. Read external packs at runtime through a dedicated localhost manifest and HTTP endpoints. Include level and solution JSON together, with explicit pack identity and pack-local solution matching. Preserve Resources loading for normal game use. Bind the portable server to loopback and serve only intended distribution files. Use explicit deterministic seeds internally and refuse accidental pack overwrite.

**Ask First:** Replacing the actual Unity game with a separately implemented browser simulator; changing gameplay or generation rules to make packaging easier.

**Never:** Require colleagues to install Unity; promise a Unity player can be created without an initial Unity build; include Library, credentials, or editor caches in the distribution; silently fall back to embedded levels after an external-load failure.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Error handling |
|---|---|---|---|
| Generate | Portable folder, config, free pack number, explicit seed | Production generator writes paired JSON; exact replay succeeds | Report failure, do not advertise an invalid pack |
| Play new data | Valid newly generated pair | Refresh discovers packs; user selects and plays new levels | Show identifiable load errors |
| Bad data | Malformed JSON, missing pair, duplicate identity | Reject affected pack | Explain file and cause |
| Multiple packs | Repeated pack-local level numbering | Solutions attach only within their matching pack | Reject ambiguous entries |
| Cached browser | JSON changes at same URL | Reload fetches current content and resets game state | No stale gameplay state |
| Missing prerequisites | No Node or no prebuilt player | Launcher/package command fails clearly | Explain installation or owner build step |

</frozen-after-approval>

## Code Map

- `Assets/Project/Script/Core/WaterSort/WaterSortBootstrap.cs`: currently creates the Resources catalog and initializes game manager/view.
- `Assets/Project/Script/Gameplay/WaterSort/WaterSortJsonCatalog.cs`: Resources JSON parsing and solution attachment; current solution lookup uses global list position.
- `Assets/Project/Script/Core/WaterSort/WaterSortGameManager.cs`: existing level loading, restart, and gameplay coordination.
- `Assets/Project/Script/Editor/WaterSort/WebGLBuildMenu.cs`: existing build entry point.
- `Tools/Build-WebGL.ps1`, `Tools/Serve-WebGL.ps1`: existing owner build and Python static serving scripts.
- `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/`: production generator, solver, Mega engine, fingerprinting and pack validator.
- `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`: current authored settings; preserve content.

## Tasks & Acceptance

**Execution:**
- [ ] `Assets/Project/Script/Gameplay/WaterSort/WaterSortJsonCatalog.cs`: add reusable pack ingestion with pack-local solution association and meaningful validation errors.
- [ ] `Assets/Project/Script/Core/WaterSort/WaterSortExternalCatalogLoader.cs` and `WaterSortBootstrap.cs`: load the external manifest and paired packs before initialization when explicitly launched in lab mode; retain standard Resources behavior otherwise.
- [ ] `Tools/LevelLab/server.js`: dependency-free Node localhost server, no-cache data responses, manifest discovery, and player launch page with pack selection. Keep paths confined to distribution roots.
- [ ] `Tools/LevelLab/generate.js`: invoke the production generator in the distribution's preserved directory structure; choose a free pack index, record seed, run exact validation, and report output.
- [ ] `Tools/LevelLab/package.js`: package an existing successful WebGL build plus allowlisted generator modules, rules, schema, config, palette, launchers, and AI instructions. Fail when build output is missing; never delete existing output implicitly.
- [ ] `Tools/LevelLab/README.md`, `Tools/LevelLab/AGENTS.md`, and `Tools/LevelLab/Start.cmd`: document owner build/package steps and colleague generation/playtest steps, including config edits and returning JSON to the owner.
- [ ] `Tools/LevelLab/tests/` and focused Unity tests: verify path confinement, manifest/pack selection, invalid input, solution association, and external loading behavior.

**Acceptance Criteria:**
- Given a packaged player and Node on a machine without Unity, when the colleague starts the lab, then the actual game opens on localhost.
- Given the shared config and rules, when an AI runs the documented generation command, then a new validated pair is produced without a Unity command.
- Given a new valid pack, when the browser reloads and selects it, then the game plays its current data without a new build.
- Given two packs with local numbering, when hints are used, then each hint belongs to the selected pack and level.
- Given ordinary project startup without lab mode, when the game starts, then existing Resources behavior remains available.

## Design Notes

A prebuilt player preserves gameplay parity, including hidden layers, locks, Mega bottles and undo. Only data discovery/loading changes. A browser reimplementation would require a second gameplay engine and parity tests and is outside this approach. Current WebGL Build Support exists locally, but no `Builds/WebGL/index.html` exists. Existing AI context assumes an imported Unity package and must be adapted for the portable folder. The workspace already contains substantial user changes; implementation must integrate with those files without resetting them.

## Verification

- Run `node --check` on new or changed JavaScript and `node --test Tools/LevelLab/tests/`.
- Generate in a temporary isolated folder with an explicit seed; replay via production `validate-pack.js`; compare repeat outputs for deterministic generation.
- Run focused Unity compilation/tests and create the initial WebGL build; report any actual build blocker.
- Smoke-test the packaged server and player: initial load, new pack after build, reload, selection, hints, restart, and invalid data.
- Run `git diff --check` for touched files. Record pre-existing failures separately.

## Spec Change Log
