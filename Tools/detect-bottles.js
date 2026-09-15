"use strict";

const fs = require("fs");
const { PNG } = require("./_asmr_shots/node_modules/pngjs");

const file = process.argv[2] || "Tools/_asmr_shots/level1b.png";
const png = PNG.sync.read(fs.readFileSync(file));
const { width, height, data } = png;

function idx(x, y) { return (width * y + x) << 2; }
function rgbAt(x, y) {
  const i = idx(x, y);
  return [data[i], data[i + 1], data[i + 2]];
}

function isGlass(r, g, b) {
  // cyan/white bottle outline
  return (b > 140 && g > 120 && r > 70 && b >= r - 5 && g >= r - 10 && (b + g) > r * 2.1)
    || (r > 200 && g > 200 && b > 200);
}

function isBg(r, g, b) {
  return r < 60 && g < 50 && b < 85;
}

function colorName(r, g, b) {
  if (isBg(r, g, b)) return null;
  if (isGlass(r, g, b)) return null;
  // yellow / gold
  if (r > 170 && g > 130 && b < 120 && g > b + 40) return "Y";
  // orange
  if (r > 170 && g > 85 && g < 160 && b < 90 && r > g + 25) return "O";
  // red
  if (r > 130 && r > g + 45 && r > b + 45) return "R";
  // green / lime
  if (g > 120 && g >= r - 5 && g > b + 20) return "G";
  // cyan
  if (b > 145 && g > 130 && r < 130 && g > r + 20) return "C";
  // blue (bright royal)
  if (b > 120 && b > r + 35 && g > 50 && g < 160 && r < 110) return "B";
  // navy / dark blue
  if (b > 70 && b >= g && b > r + 20 && r < 90 && g < 110) return "N";
  // purple
  if (r > 90 && b > 110 && g < 110 && b > g + 20) return "P";
  // brown
  if (r > 85 && g > 45 && g < 120 && b < 75 && r > b + 30 && r > g) return "K";
  return null;
}

// Find bottle columns: x where vertical glass edges are dense
const edgeXs = [];
for (let x = 10; x < width - 10; x++) {
  let hits = 0;
  for (let y = Math.floor(height * 0.15); y < height * 0.75; y++) {
    const [r, g, b] = rgbAt(x, y);
    if (isGlass(r, g, b)) hits++;
  }
  if (hits > 40) edgeXs.push(x);
}

const clusters = [];
for (const x of edgeXs) {
  const last = clusters[clusters.length - 1];
  if (!last || x - last.max > 8) clusters.push({ xs: [x], min: x, max: x });
  else { last.xs.push(x); last.max = x; }
}

// Pair nearby edge clusters into bottles (left+right rim)
const bottles = [];
for (let i = 0; i < clusters.length - 1; i++) {
  const a = clusters[i];
  const b = clusters[i + 1];
  const gap = b.min - a.max;
  const wa = a.max - a.min;
  const wb = b.max - b.min;
  if (gap >= 8 && gap <= 45 && wa < 25 && wb < 25) {
    const left = a.min;
    const right = b.max;
    const cx = Math.round((left + right) / 2);
    // find y extent of liquid/glass around cx
    let yMin = height, yMax = 0;
    for (let y = Math.floor(height * 0.12); y < height * 0.8; y++) {
      let hit = false;
      for (let x = left; x <= right; x++) {
        const [r, g, b] = rgbAt(x, y);
        if (!isBg(r, g, b)) { hit = true; break; }
      }
      if (hit) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
    }
    const h = yMax - yMin;
    if (h > 80 && h < 220) {
      bottles.push({ left, right, cx, yMin, yMax });
      i++; // skip paired right edge
    }
  }
}

function readBottle(bot) {
  const { cx, yMin, yMax, left, right } = bot;
  // sample only inner liquid region, exclude neck: use middle 75% height of body
  const top = yMin + Math.floor((yMax - yMin) * 0.12);
  const botY = yMin + Math.floor((yMax - yMin) * 0.92);
  const bandH = (botY - top) / 4;
  const layersTopToBottom = [];
  for (let i = 0; i < 4; i++) {
    const y0 = Math.round(top + i * bandH + bandH * 0.25);
    const y1 = Math.round(top + i * bandH + bandH * 0.75);
    const counts = new Map();
    for (let y = y0; y <= y1; y++) {
      for (let x = cx - 4; x <= cx + 4; x++) {
        if (x <= left + 2 || x >= right - 2) continue;
        const [r, g, b] = rgbAt(x, y);
        const name = colorName(r, g, b);
        if (!name) continue;
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
    let best = null, bestN = 0;
    for (const [k, v] of counts) if (v > bestN) { best = k; bestN = v; }
    layersTopToBottom.push(best || "?");
  }
  return layersTopToBottom;
}

// Deduplicate bottles by cx proximity
bottles.sort((a, b) => a.cx - b.cx || a.yMin - b.yMin);
const unique = [];
for (const b of bottles) {
  const near = unique.find((u) => Math.abs(u.cx - b.cx) < 15 && Math.abs(u.yMin - b.yMin) < 40);
  if (near) continue;
  unique.push(b);
}

console.log("file", file, width, height, "bottles", unique.length);
for (const b of unique) {
  const layers = readBottle(b);
  console.log(JSON.stringify({
    cx: b.cx, y: b.yMin, h: b.yMax - b.yMin,
    T2B: layers.join(","),
    B2T: [...layers].reverse().join(","),
  }));
}
