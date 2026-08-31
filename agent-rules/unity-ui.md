# Unity UI Agent Rules

Use these rules for Unity UI creation, UI edits, prefab edits, Figma/image-to-UI work, and feature UI wiring.

## Architecture

- Keep gameplay mechanic code independent from UI.
- Gameplay scripts expose state, events, data, or public methods; UI scripts observe/call them without owning game rules.
- Put UI orchestration in a UI manager when one does not already exist.
- Keep persistent UI managers on their own GameObject; do not attach them to gameplay managers just for convenience.
- Do not mix screen, button, text, panel, or prefab wiring into mechanic controllers.
- Give each feature/function its own UI prefab when it needs editable UI, so layout and assets can be changed later by hand or AI without rewriting gameplay logic.

## Mobile Responsive Layout

- Treat portrait 1080×2160 (1:2) as the reference mobile resolution for newly created UI and screen-space layout.
- Use Canvas Scaler `Scale With Screen Size`, anchors, safe-area handling, and relative layout values so UI stays usable on supported portrait aspect ratios; do not hard-code screen pixel positions or sizes.
- Make camera/world GameObjects adapt through camera viewport or orthographic bounds, not UI pixel coordinates; keep critical gameplay content inside the visible safe play area at the reference ratio.
- Verify new UI and screen-bound GameObjects at the 1080×2160 reference resolution and at least one narrower/taller portrait resolution when practical.

## Persistent UI Root

- Use a persistent `UIRoot` with `DontDestroyOnLoad` when the project needs UI shared across scenes.
- Create persistent `UIRoot`/`UIManager` as a standalone object, not as a component on `GameManager` or a scene gameplay controller.
- `UIRoot` should own separate roots for screen/camera UI, world UI, and transition UI.
- Keep transition UI on a dedicated canvas with higher sorting order so fades, loading overlays, and input blocking do not depend on gameplay UI.
- Spawn feature UI prefabs under the correct root instead of placing unrelated UI directly in gameplay scenes.
- Clear scene-scoped UI when unloading or changing scenes; keep only explicitly persistent UI alive.
- `UIManager` manages UI prefab lifecycle, screen/popup stack, root lookup, transition handoff, and scene UI cleanup; it must not own gameplay rules.

## Prefabs And Tools

- For Unity UI prefab creation or edits, prefer available Unity-aware MCP/app/IDE tools that can inspect or modify prefab and scene structure directly.
- If no Unity-aware MCP/app/IDE tool is available for a requested prefab/UI edit, warn the user before editing, link MCP for Unity (`https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#main`), and state the fallback method and verification limits.
- Fall back to targeted YAML edits only after reading the exact prefab, scene, script, or asset files involved.
- Preserve prefab editability: expose serialized references where useful, avoid hard-coded scene lookups unless the project already uses that pattern.

## Design Matching

- When the user provides a UI image, Figma reference, or design sample, use available image/Figma/MCP tooling to extract layout, spacing, typography, colors, and asset references before editing UI.
- If the connector or source asset is unavailable, ask for an export or screenshot instead of guessing.
- Read only the relevant source prefab/scene, referenced sprites/fonts/materials, and provided design inputs.
- Do not scan broad asset folders to hunt for alternatives unless the user asks for asset discovery.

## Performance

- Group frequently co-displayed small UI sprites into Sprite Atlases; keep shared sprites in a shared atlas, view-specific sprites in view-specific atlases, and avoid packing large backgrounds or rare one-off sprites.
- Use UI texture settings deliberately: prefer POT-friendly sizes when practical, disable alpha when not needed, avoid oversized max texture sizes, choose platform-appropriate compression, and use 9-slice for scalable panels/buttons.
- Split static and frequently changing UI onto separate canvases so changing text, timers, animation, or progress bars does not dirty a large static canvas.
- Keep UI elements on the same canvas aligned by refresh frequency and, where practical, by shared Z value, material, and texture to preserve batching.
- Hide full-screen or unused canvases by disabling the Canvas component when practical; avoid unnecessary `SetActive` toggles that force heavier rebuilds.
- When a full-screen UI covers the game, disable hidden canvases and consider disabling scene camera rendering or lowering frame rate when the game can safely pause.
- Keep UI hierarchy shallow, and avoid nested LayoutGroups unless the layout is genuinely dynamic.
- Prefer anchors or one-shot/manual layout calculation for simple layouts instead of LayoutGroups that rebuild repeatedly.
- Avoid large list/grid UI with one GameObject per item; use a small pooled/virtualized item set for inventories, stores, level lists, and long scroll views.
- Avoid heavy layered UI and overdraw; merge simple decorative layers or reduce overlapping transparent graphics when the same result can be achieved with fewer elements.
- Pool UI objects in the least-dirty order: disable before reparenting into a pool, and reparent/update data before enabling when taking an object from the pool.
- Disable `Raycast Target` on non-interactive text/images, and keep `GraphicRaycaster` only on canvases that need UI input.
- Use Graphic Raycaster blocking masks and 2D/3D physics blocking sparingly; prefer simpler UI hit testing unless world/camera UI truly needs it.
- Use Animator only for UI elements that animate continuously; prefer tween/event-driven animation for short or occasional UI transitions.

## Implementation

- Build the smallest working UI for the requested feature first.
- Place UI scripts, prefabs, assets, and manager scripts under the project's feature/function folder convention; default to `Assets/Project/{Core|UI|Prefab|Scripts|Asset|ScriptableObject}/<FeatureOrFunction>/` when no convention exists.
- Keep UI scripts focused on presentation, input forwarding, state display, and prefab/view coordination.
- Keep gameplay scripts focused on mechanic rules, state transitions, validation, and win/fail conditions.
