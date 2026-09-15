"use strict";

const fs = require("fs");
const path = require("path");
const { PNG } = require("./_asmr_shots/node_modules/pngjs");

const file = process.argv[2] || path.join(__dirname, "_asmr_shots/level1b.png");
const png = PNG.sync.read(fs.readFileSync(file));
const { width, height, data } = png;

function px(x, y) {
  x = Math.max(0, Math.min(width - 1, Math.round(x)));
  y = Math.max(0, Math.min(height - 1, Math.round(y)));
  const i = (width * y + x) << 2;
  return [data[i], data[i + 1], data[i + 2]];
}

function dist(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isBackground(rgb) {
  // dark purple bg
  const [r, g, b] = rgb;
  if (r < 55 && g < 40 && b < 70) return true;
  if (r < 70 && g < 50 && b < 90 && Math.abs(r - b) < 40) return true;
  return false;
}

function isGlassOutline(rgb) {
  const [r, g, b] = rgb;
  // cyan/white glass glow
  return b > 140 && g > 120 && r > 80 && b >= r;
}

function classifyColor(rgb) {
  const [r, g, b] = rgb;
  if (isBackground(rgb)) return "empty";
  if (r > 160 && g > 160 && b > 160) return "glass";
  // red
  if (r > 150 && r > g + 40 && r > b + 40) return "red";
  // orange
  if (r > 160 && g > 80 && g < 160 && b < 90) return "orange";
  // yellow
  if (r > 170 && g > 150 && b < 110) return "yellow";
  // lime / green
  if (g > 140 && g > r + 20 && g > b) return "green";
  // dark green
  if (g > 90 && g > r && g > b && r < 100) return "green";
  // cyan
  if (b > 150 && g > 140 && r < 120) return "cyan";
  // light blue / blue
  if (b > 140 && b > r + 30 && g > 80 && g < 180) return "blue";
  // dark blue / navy
  if (b > 90 && b > r + 20 && b >= g && r < 100 && g < 120) return "navy";
  // purple
  if (r > 100 && b > 120 && g < 100 && Math.abs(r - b) < 80) return "purple";
  // brown
  if (r > 90 && g > 50 && g < 120 && b < 80 && r > b + 30) return "brown";
  // grey
  if (Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && r > 70 && r < 160) return "grey";
  return `unk(${r},${g},${b})`;
}

function medianColor(samples) {
  if (!samples.length) return [0, 0, 0];
  const rs = samples.map((s) => s[0]).sort((a, b) => a - b);
  const gs = samples.map((s) => s[1]).sort((a, b) => a - b);
  const bs = samples.map((s) => s[2]).sort((a, b) => a - b);
  const m = (arr) => arr[Math.floor(arr.length / 2)];
  return [m(rs), m(gs), m(bs)];
}

function sampleRegion(cx, y0, y1, halfW = 6) {
  const samples = [];
  for (let y = y0; y <= y1; y++) {
    for (let dx = -halfW; dx <= halfW; dx++) {
      const rgb = px(cx + dx, y);
      if (isBackground(rgb) || isGlassOutline(rgb)) continue;
      const name = classifyColor(rgb);
      if (name === "empty" || name === "glass" || name.startsWith("unk")) continue;
      samples.push(rgb);
    }
  }
  return medianColor(samples);
}

// Manual bottle center guesses for level1b (tutorial, hand pointing) - refine by scanning
// First dump a coarse color map of mid playfield to find bottles
function scanVerticalBottleCandidates() {
  const candidates = [];
  // playfield approx
  const yTop = Math.floor(height * 0.18);
  const yBot = Math.floor(height * 0.72);
  for (let x = Math.floor(width * 0.05); x < width * 0.95; x += 2) {
    let coloredRuns = 0;
    let run = 0;
    for (let y = yTop; y < yBot; y++) {
      const c = classifyColor(px(x, y));
      if (c !== "empty" && c !== "glass" && !c.startsWith("unk")) {
        run++;
        if (run === 8) coloredRuns++;
      } else {
        run = 0;
      }
    }
    if (coloredRuns >= 2) candidates.push(x);
  }
  // cluster x positions
  const clusters = [];
  for (const x of candidates) {
    const last = clusters[clusters.length - 1];
    if (!last || x - last.center > 18) clusters.push({ xs: [x], center: x });
    else {
      last.xs.push(x);
      last.center = Math.round(last.xs.reduce((a, b) => a + b, 0) / last.xs.length);
    }
  }
  return clusters.map((c) => c.center);
}

const xs = scanVerticalBottleCandidates();
console.log("file", file, width, height);
console.log("candidateXs", xs);

// For each x, find y ranges of liquid bands
function readBottleAt(cx) {
  const yTop = Math.floor(height * 0.16);
  const yBot = Math.floor(height * 0.78);
  const labels = [];
  for (let y = yTop; y < yBot; y++) {
    const med = sampleRegion(cx, y, y, 5);
    labels.push({ y, name: classifyColor(med), rgb: med });
  }
  // compress into runs
  const runs = [];
  for (const row of labels) {
    if (row.name === "empty" || row.name === "glass" || row.name.startsWith("unk")) continue;
    const last = runs[runs.length - 1];
    if (last && last.name === row.name && row.y - last.y1 <= 3) {
      last.y1 = row.y;
      last.samples.push(row.rgb);
    } else {
      runs.push({ name: row.name, y0: row.y, y1: row.y, samples: [row.rgb] });
    }
  }
  // keep significant runs (height)
  const significant = runs.filter((r) => r.y1 - r.y0 >= 6);
  // merge very small gaps same color already handled
  // take up to 4 thickest / topmost liquid bands in the tube body
  // Sort by y ascending (top to bottom of screen)
  significant.sort((a, b) => a.y0 - b.y0);
  // If more than 4, pick 4 largest
  let bands = significant;
  if (bands.length > 4) {
    bands = [...significant].sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0)).slice(0, 4);
    bands.sort((a, b) => a.y0 - b.y0);
  }
  const topToBottom = bands.map((b) => b.name);
  const bottomToTop = [...topToBottom].reverse();
  return {
    cx,
    ySpan: bands.length ? [bands[0].y0, bands[bands.length - 1].y1] : null,
    topToBottom,
    bottomToTop,
    bandHeights: bands.map((b) => ({ name: b.name, h: b.y1 - b.y0, y0: b.y0 })),
  };
}

const bottles = xs.map(readBottleAt).filter((b) => b.topToBottom.length >= 2);
console.log(JSON.stringify(bottles, null, 2));

// Also sample user-specified top-left region more carefully
console.log("\\nmanual top-left probes:");
for (const x of [70, 90, 110, 130]) {
  for (const y of [220, 250, 280, 310, 340, 370]) {
    const rgb = px(x, y);
    console.log(x, y, classifyColor(rgb), rgb.join(","));
  }
  console.log("---");
}
