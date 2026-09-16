# Water Sort — Playband Layout (multi-family columns)

Canonical **visual** bottle placement system. Do not use 8×5 `gridPosition` / `layoutGrid` for playband levels.

## Coordinate space

- Play-band normalized: bottle **center** `(nx, ny)`, origin at **bottom-left** of the board RectTransform.
- `nx`, `ny` ∈ `[0, 1]`. Runtime scales into the live board size.
- Layout uses **straight vertical columns** (constant `nx` per column), **≤ 7 columns**, **≤ 5 rows per column** (max 35 bottles).
- **Max silhouette span ≤ 5 row-pitch units** (topmost bottle center → bottommost). Families must not stagger into an ~8-row-tall board.
- **Fixed neighbor pitch** (`colPitch` ≈ 0.095 / `rowPitch` ≈ 0.132): adjacent bottles (next column or next row) always use the same center distance. Families only choose lattice seats — they never stretch sparse columns to fill empty space. Runtime keeps a small air gap (~4px) so outlines do not touch.
- **Multiple silhouette families** — do not stamp every level as the same oval.
- **L/R mirror pairs share the same `ny`**.
- Bottle UI clips liquid with `RectMask2D` + inset stack so colors stay inside the outline.

## Level JSON schema (layout fields)

```json
{
  "id": 2,
  "displayName": "Level 2",
  "boardLayout": {
    "system": "asmrPlayband",
    "family": "zigzag",
    "version": 1,
    "maxColumns": 7,
    "maxRows": 5,
    "maxSpanRows": 5,
    "columnCount": 7,
    "colPitch": 0.095,
    "rowPitch": 0.132
  },
  "bottles": [
    {
      "capacity": 4,
      "colorsBottomToTop": [0, 1, 2, 3],
      "layoutRole": "active",
      "layoutPosition": { "nx": 0.215, "ny": 0.566 }
    },
    {
      "capacity": 4,
      "colorsBottomToTop": [],
      "layoutRole": "ad",
      "layoutPosition": { "nx": 0.215, "ny": 0.302 },
      "isAdBottle": true
    }
  ]
}
```

### `boardLayout`

| Field | Required | Meaning |
|---|---|---|
| `system` | yes | Must be `"asmrPlayband"` |
| `family` | yes | Silhouette family name |
| `version` | yes | `1` |
| `maxColumns` | yes | Hard cap (`7`) |
| `maxRows` | yes | Hard cap rows/column (`5`) |
| `maxSpanRows` | yes | Max vertical span in row-pitch units (`5`) |
| `columnCount` | yes | Actual unique column count |
| `colPitch` | yes | Center-to-center X between adjacent columns |
| `rowPitch` | yes | Center-to-center Y between adjacent seats |

### Per bottle

| Field | Required | Meaning |
|---|---|---|
| `layoutPosition.nx` | yes | Center X in `[0,1]` |
| `layoutPosition.ny` | yes | Center Y in `[0,1]` |
| `layoutRole` | yes | `mega` \| `active` \| `helper` \| `ad` \| `locked` \| `colorLocked` |

- Do **not** author `layoutGrid` or `gridPosition` on playband levels.
- Core gameplay fingerprint ignores all layout cosmetics.

### `layoutRole` inference

| Role | From |
|---|---|
| `mega` | `isMegaBottle` |
| `ad` | `isAdBottle` |
| `locked` | `isLocked` |
| `colorLocked` | `isColorLocked` |
| `helper` | empty non-ad bottle |
| `active` | otherwise |

## Families

| Family | Silhouette |
|---|---|
| `columns` | Oval / even column heights |
| `honeycomb` | Mild diamond counts + half-row stagger |
| `diamond` | Mild diamond (start amplitude ≤ 1 row) |
| `wings` | Dual side blocks + center half-row connectors |
| `valley` | Twin peaks with shallow center dip |
| `pillar` | Dense tall center stack, sparse sides |
| `stagger` | Alternating half-row column stagger (so le) |
| `zigzag` | Mirror-safe 0/1 row wave across columns |
| `doubleV` | Interlocking ∧ + ∨ (X / hourglass) |
| `frame` | Ring around center void (default for mega) |

Aliases: `alt`→`stagger`, `chevron`/`hourglass`→`doubleV`, `megaOrbit`→`frame`, `packed`→`columns`.

Auto-pick rotates families from `level.id` (+ bottle/lock counts). Mega → `frame`.
Pack stamping (`Tools/apply-asmr-playband-layout.js` without `--family`) uses
`assignFamiliesForPack`: bias toward **`stagger` / `zigzag`** (~55% of non-mega levels),
no consecutive same silhouette when alternatives exist, and other families stay from dominating.

Role zoning:

- Mega → center (frame)
- Ads → outermost L/R columns, mid–lower, mirrored `ny`
- Locked / frost → prefer top
- Helpers → mid-body

## Tools

- Module: `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/asmr-playband-layout.js`
- Stamp:

```powershell
node Tools/apply-asmr-playband-layout.js <levels.json> [--family zigzag] [--inplace]
```

Omit `--family` to auto-diversify (pack bias toward stagger/zigzag).

- Self-test: `node Assets/Project/Editor/WaterSort/LevelGeneration/Tools/asmr-playband-layout.js`

## Runtime

`WaterSortGameView` places by `layoutPosition` when `UsesPlaybandLayout` is true.
Bottle size is derived from `boardLayout.colPitch` / `rowPitch` minus a small air gap (~4px).

## Port to another project

`Tools/asmr-playband-layout-PORTING-PROMPT.md`
