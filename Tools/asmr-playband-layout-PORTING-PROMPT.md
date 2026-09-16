# Prompt / Spec — Water Sort Playband Layout (portable)

Dùng file này như **prompt triển khai** hoặc **spec độc lập** cho project khác. Tự chứa đủ; không cần screenshot hay repo tham chiếu.

Mục tiêu: hệ đặt bottle **visual** dạng play-band normalized — **≤ 7 cột thẳng**, **≤ 5 hàng/cột**, **span dọc ≤ 5 row-pitch**, **pitch cố định**, **nhiều family** (ưu tiên stagger/zigzag). **Thay thế hoàn toàn** lưới rời NxM; khi port phải **xóa** logic/schema/runtime grid cũ, không giữ dual path.

Canonical module (Unity project): `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/asmr-playband-layout.js`  
Canonical agent doc: `agent-rules/watersort-asmr-playband-layout.md`

---

## Prompt ngắn (copy cho agent)

```
Implement a Water Sort bottle VISUAL layout system called "asmrPlayband".

REMOVE the old discrete NxM grid layout from the target project entirely.
Do NOT keep a dual path (grid + playband). Playband is the only visual placement system.

Layout style (required):
- Straight VERTICAL COLUMNS (constant nx per column)
- columnCount ≤ 7, rows per column ≤ 5, total bottles ≤ 35
- Max silhouette SPAN ≤ 5 row-pitch units (topmost center → bottommost). Do NOT allow tall diamond offsets that look like ~8 rows.
- FIXED neighbor pitch: COL_PITCH ≈ 0.095, ROW_PITCH ≈ 0.132 (normalized play-band). Adjacent column/row centers always use that pitch. Families only choose lattice seats — never stretch sparse columns.
- Runtime bottle size ≈ pitch * boardSize − airGap (~4px). Outlines must not touch.
- Left–right mirror pairs MUST share the exact same ny
- Do NOT jitter nx inside a column
- Center the cluster; uniform scale down only if needed to fit (keeps pitch ratio)

Must delete / stop using:
- Any layoutGrid / gridPosition / cell (x,y) / row-col placement for bottles
- Runtime that places bottles by grid cell index → world position
- Editor/tools that author bottles onto a fixed grid
- Validation that requires layoutGrid / unique gridPosition
- Fallback "if no playband, use grid"
- Parallel storage of grid fields "for compatibility" on playband levels

After removal, only asmrPlayband coordinates remain for visual layout.

Coordinate space:
- Bottle CENTER is (nx, ny) with nx,ny in [0,1]
- Origin = bottom-left of the interactive board rectangle (below header, above footer — not full screen)
- Runtime: map center to (nx * boardWidth, ny * boardHeight) in board space (flip Y if engine is top-left)
- Clip liquid INSIDE bottle outline

JSON schema (level):
boardLayout = {
  system: "asmrPlayband",
  family: string,
  version: 1,
  maxColumns: 7,
  maxRows: 5,
  maxSpanRows: 5,
  columnCount: number,
  colPitch: number,   // measured/written ≈ 0.095
  rowPitch: number    // measured/written ≈ 0.132
}
each bottle: layoutRole + layoutPosition { nx, ny }
layoutRole in: mega | active | helper | ad | locked | colorLocked
family in: columns | honeycomb | diamond | wings | valley | pillar | stagger | zigzag | doubleV | frame
FORBIDDEN on levels: layoutGrid, gridPosition, and any equivalent cell-index fields

Families (rotate — do NOT stamp every level as the same oval):
1) columns — oval / even column heights
2) honeycomb — mild diamond + half-row stagger
3) diamond — mild diamond (start amplitude ≤ 1 row)
4) wings — dual side blocks + center connectors
5) valley — twin peaks, shallow center dip
6) pillar — dense tall center, sparse sides
7) stagger — alternating half-row column stagger (so le)
8) zigzag — mirror-safe 0/1 row wave across columns
9) doubleV — interlocking ∧ + ∨ (X / hourglass)
10) frame — ring / center mega (REQUIRED when any bottle isMegaBottle)

Pack assignment bias:
- Prefer stagger + zigzag for ~55% of non-mega levels
- No consecutive same family when alternatives exist
- Mega levels → frame only

Role zoning:
- mega → center column mid height (frame)
- ad → outermost L/R columns, mid–lower, mirrored ny
- locked/colorLocked → prefer top of columns
- helper (empty non-ad) → mid-body
- active → remaining seats

Placement pipeline:
1) Infer roles from bottle flags
2) Pick family (frame if mega; else pack-biased / seed rotation)
3) Build lattice seats with fixed COL_PITCH/ROW_PITCH; clamp startRows so span ≤ maxSpanRows
4) Reserve ad seats from outermost columns
5) Assign roles: ads → mega → locked/colorLocked → helper → active
6) Write layoutPosition / layoutRole / boardLayout (include colPitch/rowPitch/maxRows/maxSpanRows)
7) DELETE any legacy grid fields

Migration when porting into an existing project:
1) Find all grid-layout code (search: layoutGrid, gridPosition, gridWidth, gridHeight, cell, PlaceOnGrid, …)
2) Replace runtime placement with playband map (nx,ny) → board transform
3) Migrate existing level JSON: stamp playband, then strip grid fields
4) Update validators: reject grid fields; require boardLayout + layoutPosition; assert ≤ 7 columns, ≤ 5 rows/col, span ≤ 5
5) Delete dead grid helpers / constants / docs
6) Build/run must fail if any code path still places by grid cell

Acceptance:
- Zero remaining grid visual-layout code paths
- columnCount ≤ 7; max column height ≤ 5; silhouette span ≤ 5 row units
- Ads on outer columns (not isolated footer corners)
- Liquid clipped inside bottle
- Deterministic for same inputs
- Level JSON has no layoutGrid / gridPosition
- Packs show stagger/zigzag frequently among non-mega levels
```

---

## 1. Mục tiêu thẩm mỹ

| Mục | Đúng | Sai |
|---|---|---|
| Silhouette | ≤7 cột thẳng; family đa dạng; L/R cùng `ny` | Lưới phẳng; lệch đối xứng |
| Chiều cao | ≤5 hàng/cột; span ≤5 row-pitch | Offset diamond ~8 hàng |
| Cột | Pitch cố định `colPitch≈0.095`, khe hở nhỏ (~4px) | Cột quá thưa / chạm viền |
| Ads | Cột ngoài, ghế mid–lower | Góc footer cô lập |
| Liquid UI | Màu trong viền bình | Màu tràn |

---

## 2. Không gian tọa độ

```
boardRect (play-band only — dưới header, trên footer)
^ ny=1 (top)
|
|   bottle center at (nx, ny)
|
+--------------> nx=1 (right)
nx=0, ny=0 (bottom-left)
```

- `nx, ny ∈ [0, 1]` là **tọa độ tương đối**.
- Điểm lưu trong JSON = **tâm** bottle.
- Margin an toàn gợi ý: `MARGIN ≈ 0.05`.

### Runtime map

```
centerX = boardLeft + nx * boardWidth
centerY = boardBottom + ny * boardHeight   // flip Y nếu engine gốc trên-trái
bottleWidth  ≈ colPitch * boardWidth  - airGapPx
bottleHeight ≈ rowPitch * boardHeight - airGapPx   // hoặc theo aspect 118:190
```

---

## 3. Schema JSON (level)

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
  "modeOptions": {
    "hiddenStack": false,
    "hybridHiddenStack": false,
    "lockedBottles": false,
    "megaBottle": false
  },
  "bottles": [
    {
      "capacity": 4,
      "colorsBottomToTop": [0, 1, 2, 3],
      "layoutRole": "active",
      "layoutPosition": { "nx": 0.215, "ny": 0.566 },
      "isAdBottle": false,
      "isMegaBottle": false,
      "isLocked": false,
      "isColorLocked": false
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

### `boardLayout` fields

| Field | Type | Meaning |
|---|---|---|
| `system` | string | Must be `"asmrPlayband"` |
| `family` | string | Silhouette family (see below) |
| `version` | number | Schema version (`1`) |
| `maxColumns` | number | Hard cap columns (`7`) |
| `maxRows` | number | Hard cap rows/column (`5`) |
| `maxSpanRows` | number | Max vertical span in row-pitch units (`5`) |
| `columnCount` | number | Actual unique column count for this level |
| `colPitch` | number | Center-to-center X between adjacent columns |
| `rowPitch` | number | Center-to-center Y between adjacent seats in a column |

### Per-bottle layout fields

| Field | Type | Meaning |
|---|---|---|
| `layoutPosition.nx` | number `[0,1]` | Bottle center X in play-band |
| `layoutPosition.ny` | number `[0,1]` | Bottle center Y in play-band |
| `layoutRole` | string | `mega` \| `active` \| `helper` \| `ad` \| `locked` \| `colorLocked` |

### Bắt buộc
- `boardLayout.system === "asmrPlayband"`
- `boardLayout.family` ∈ allowed families (aliases: `alt`→`stagger`, `chevron`/`hourglass`→`doubleV`, `megaOrbit`→`frame`, `packed`→`columns`)
- Mỗi bottle có `layoutPosition.nx/ny` hợp lệ và **không trùng**
- Unique column `nx` (tolerance ~0.02) **≤ 7**
- Mỗi cột: cùng `nx`, số seat **≤ 5**
- Silhouette span `(maxNy-minNy)/rowPitch` **≤ ~4.65** (≤ `maxSpanRows`)
- **Cấm** `layoutGrid` / `gridPosition`

### `layoutRole` suy từ flag gameplay
| Role | Flag |
|---|---|
| `mega` | `isMegaBottle` |
| `ad` | `isAdBottle` |
| `locked` | `isLocked` |
| `colorLocked` | `isColorLocked` |
| `helper` | empty `colorsBottomToTop` và không phải ad |
| `active` | còn lại |

Gameplay fingerprint / uniqueness **bỏ qua** toàn bộ layout cosmetics (`boardLayout`, `layoutPosition`, `layoutRole`).

---

## 3b. Loại bỏ logic grid layout cũ (bắt buộc khi port)

Playband **thay thế**, không song song với grid.

### Phải tìm và gỡ
| Khu vực | Ví dụ dấu hiệu |
|---|---|
| Runtime place | map `(col,row)` / `gridPosition` → world/UI; `layoutGrid.cols/rows` |
| Authoring / editor | snap bottle lên ô lưới; paint layout trên NxM |
| Validator | bắt buộc unique `gridPosition`; check in-bounds `layoutGrid` |
| Generator / tools | xuất `layoutGrid` + `gridPosition`; fallback grid khi thiếu playband |
| Docs / constants | `GRID_W`, `GRID_H`, “8×5 board”, cell spacing visual |

### Thứ tự migration
1. Implement placer + runtime playband.
2. Stamp lại mọi pack/level JSON → playband `layoutPosition` + `boardLayout`.
3. Xóa field grid khỏi JSON đã stamp.
4. Đổi validator: **reject** grid; **require** playband; assert columns/rows/span caps.
5. Xóa code/helper/constant/doc visual grid; không để `if (hasPlayband) … else placeByGrid`.
6. Verify: grep sạch place-by-grid; playtest chỉ đi playband.

---

## 4. Families

| Family | Silhouette |
|---|---|
| `columns` | Oval / even column heights |
| `honeycomb` | Mild diamond + half-row stagger |
| `diamond` | Mild diamond (start amplitude ≤ 1) |
| `wings` | Dual side blocks + center connectors |
| `valley` | Twin peaks, shallow center dip |
| `pillar` | Dense tall center, sparse sides |
| `stagger` | Alternating half-row stagger (so le) |
| `zigzag` | Mirror-safe 0/1 row wave |
| `doubleV` | Interlocking ∧ + ∨ (X / hourglass) |
| `frame` | Center mega / ring void |

### Pack variety rules
- Mega → always `frame`
- Prefer **`stagger` + `zigzag` ≈ 55%** of non-mega levels
- Avoid consecutive identical family when alternatives exist
- Other families fill the rest for diversity

### Lattice rules (all families)
```
MAX_COLUMNS = 7
MAX_ROWS = 5
MAX_SPAN_ROWS = 5
COL_PITCH ≈ 0.095
ROW_PITCH ≈ 0.132

seats: x = (col - mid) * COL_PITCH
       y = -row * ROW_PITCH
then center cluster; uniform scale if needed
clamp startRows so (maxBot - minTop) ≤ MAX_SPAN_ROWS - 1
```

---

## 5. Pipeline gán chỗ

```
roles[] = inferRole(each bottle)
family  = pickFamily / assignFamiliesForPack (frame if mega)
slots[] = buildFamilySlots(family, n, hasMega)   // fixed pitch lattice
assert uniqueNx(slots) ≤ 7
assert per-column height ≤ 5
assert silhouette span ≤ maxSpanRows

adSeats = reserve from outermost columns (mirrored ny)
freeSlots = slots - adSeats

assign ads → adSeats
assign mega, locked, colorLocked, helper, active → freeSlots

write layoutPosition / layoutRole / boardLayout
  { system, family, version, maxColumns, maxRows, maxSpanRows,
    columnCount, colPitch, rowPitch }
delete layoutGrid, gridPosition
```

---

## 6. Runtime sizing & clipping

- Aspect gợi ý ~ `118:190` (w:h); mega ~ `1.35×`
- Air gap outline ~ `4px` (không chạm)
- Mask + inset liquid; không `minHeight` cứng làm tràn
- Z-order: sort theo `ny` nếu cần

---

## 7. Validation checklist

- [ ] Không còn code path place-by-grid / fallback grid
- [ ] `boardLayout.system === "asmrPlayband"`
- [ ] `family` hợp lệ (kể cả stagger/zigzag/doubleV)
- [ ] `maxColumns/maxRows/maxSpanRows/colPitch/rowPitch` có mặt (hoặc default runtime khớp)
- [ ] Mọi bottle có `layoutPosition` trong `[0,1]`, unique
- [ ] Unique column `nx` ≤ 7; mỗi cột ≤ 5 bottles; cùng `nx` trong cột
- [ ] Silhouette span ≤ maxSpanRows
- [ ] JSON không còn `layoutGrid` / `gridPosition`
- [ ] Ads không footer-corner (`ny < ~0.12` là dấu hiệu xấu)
- [ ] Pack non-mega: nhiều `stagger`/`zigzag`
- [ ] Deterministic; liquid không tràn khi playtest

---

## 8. Deliverables khi port

1. **Xóa visual grid cũ**
2. **Placer module**: `applyPlaybandLayout(level)` + `assignFamiliesForPack(levels)`
3. **Stamp / migrate CLI**
4. **Runtime placer**: `(nx, ny)` → transform + size từ `colPitch`/`rowPitch` + mask
5. **Self-test**: mọi family, nhiều `n`, mega, ads; assert caps + mirror + pitch
6. **Docs** mô tả schema `boardLayout` + `layoutPosition` như mục 3

Không cần port generator gameplay / solver. Layout chỉ là lớp visual.

---

## 9. Hằng số (production baseline)

| Name | Value | Ý nghĩa |
|---|---|---|
| `MAX_COLUMNS` | 7 | trần số cột |
| `MAX_ROWS` | 5 | trần hàng/cột |
| `MAX_SPAN_ROWS` | 5 | trần span dọc (row units) |
| `COL_PITCH` | 0.095 | center-to-center ngang |
| `ROW_PITCH` | 0.132 | center-to-center dọc |
| `MARGIN` | 0.05 | giữ tâm trong play-band |
| Air gap | ~4px | khe giữa outline |
| Mega scale | 1.35 | so với bottle thường |

---

## 10. Anti-patterns (không làm)

- Dual system grid + playband, hoặc fallback về grid
- Lệch `nx` trong cùng cột, hoặc L/R không cùng `ny`
- Silhouette cao ~8 hàng vì `startRows` lớn
- Cột quá thưa (`colPitch` lớn) hoặc chạm viền (gap ≤ 0)
- Vượt 7 cột / 5 hàng/cột / 35 bottles
- Stamp mọi level cùng một family (thiếu stagger/zigzag)
- Ads tách UI dưới chân màn hình
- Lưu song song grid “cho chắc”
- Coi layout là fingerprint gameplay
- Phụ thuộc screenshot / level số project khác

---

Spec này đủ để triển khai lại từ zero mà không cần media hay level tham chiếu bên ngoài.
