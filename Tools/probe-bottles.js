"use strict";

const fs = require("fs");
const { PNG } = require("./_asmr_shots/node_modules/pngjs");

const file = process.argv[2] || "Tools/_asmr_shots/level1b.png";
const png = PNG.sync.read(fs.readFileSync(file));
const { width, height, data } = png;

function px(x, y) {
  x = Math.max(0, Math.min(width - 1, Math.round(x)));
  y = Math.max(0, Math.min(height - 1, Math.round(y)));
  const i = (width * y + x) << 2;
  return [data[i], data[i + 1], data[i + 2], `#${data[i].toString(16).padStart(2,"0")}${data[i+1].toString(16).padStart(2,"0")}${data[i+2].toString(16).padStart(2,"0")}`];
}

// Known approximate bottle centers for tutorial layout (level1b 363x761)
// Derived from visual: top row 4 bottles, then mid, then bottom
const bottles = [
  { name: "TL1", cx: 58, layersY: [200, 235, 270, 305] },
  { name: "TL2-hand", cx: 118, layersY: [200, 235, 270, 305] },
  { name: "TR1", cx: 235, layersY: [200, 235, 270, 305] },
  { name: "TR2", cx: 295, layersY: [200, 235, 270, 305] },
  { name: "ML-outer", cx: 48, layersY: [340, 375, 410, 445] },
  { name: "ML-inner", cx: 100, layersY: [300, 335, 370, 405] },
  { name: "MR-inner", cx: 255, layersY: [300, 335, 370, 405] },
  { name: "MR-outer", cx: 310, layersY: [340, 375, 410, 445] },
  { name: "BL1", cx: 55, layersY: [480, 515, 550, 585] },
  { name: "BL2", cx: 110, layersY: [500, 535, 570, 605] },
  { name: "BL3", cx: 155, layersY: [470, 505, 540, 575] },
  { name: "BR3", cx: 210, layersY: [470, 505, 540, 575] },
  { name: "BR2", cx: 255, layersY: [500, 535, 570, 605] },
  { name: "BR1", cx: 310, layersY: [480, 515, 550, 585] },
  { name: "HEART", cx: 180, layersY: [420, 450, 480, 510] },
];

function median(vals) {
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function sampleLayer(cx, cy) {
  const rs = [], gs = [], bs = [];
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const [r, g, b] = px(cx + dx, cy + dy);
      // skip dark bg and bright glass
      if (r < 50 && g < 40 && b < 70) continue;
      if (r > 190 && g > 190 && b > 190) continue;
      if (b > 170 && g > 160 && r > 120 && Math.abs(b - g) < 30 && b > r) continue; // glass
      rs.push(r); gs.push(g); bs.push(b);
    }
  }
  if (!rs.length) return null;
  const rgb = [median(rs), median(gs), median(bs)];
  return { rgb, hex: `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}` };
}

console.log(file, width, height);
for (const bottle of bottles) {
  const layers = bottle.layersY.map((y) => sampleLayer(bottle.cx, y));
  console.log(bottle.name, "cx", bottle.cx, layers.map((l) => (l ? l.hex : "null")).join(" | "));
}

// denser probe for top-left bottle only
console.log("\nTL dense:");
for (let y = 190; y <= 330; y += 8) {
  const s = sampleLayer(58, y);
  console.log(y, s ? s.hex : "null", s ? s.rgb.join(",") : "");
}
