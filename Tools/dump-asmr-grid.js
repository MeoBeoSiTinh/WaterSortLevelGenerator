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

function classify(rgb) {
  const [r, g, b] = rgb;
  if (r < 55 && g < 45 && b < 75) return ".";
  if (r > 180 && g > 180 && b > 180) return "W";
  if (b > 160 && g > 140 && r > 90 && b >= r - 10) return "G"; // glass cyan
  if (r > 150 && r > g + 45 && r > b + 45) return "R";
  if (r > 170 && g > 90 && g < 155 && b < 85) return "O";
  if (r > 180 && g > 160 && b < 100) return "Y";
  if (g > 150 && g >= r && g > b + 20) return "L"; // lime
  if (g > 110 && g > r + 15 && g > b && r < 120) return "L";
  if (b > 160 && g > 150 && r < 110) return "C"; // cyan liquid
  if (b > 130 && b > r + 25 && g > 70 && g < 170 && r < 120) return "B"; // blue
  if (b > 80 && b >= g && b > r + 15 && r < 90 && g < 110) return "N"; // navy
  if (r > 110 && b > 130 && g < 110) return "P";
  if (r > 100 && g > 55 && g < 125 && b < 75 && r > b + 35) return "K"; // brown
  return "?";
}

function dumpGrid(x0, x1, y0, y1, stepX = 4, stepY = 4) {
  const lines = [];
  for (let y = y0; y <= y1; y += stepY) {
    let row = `${String(y).padStart(3, "0")} `;
    for (let x = x0; x <= x1; x += stepX) {
      row += classify(px(x, y));
    }
    lines.push(row);
  }
  return lines.join("\n");
}

console.log("size", width, height, file);
console.log("\n=== TOP-LEFT BOTTLE ZONE ===");
console.log(dumpGrid(40, 130, 180, 400, 3, 4));
console.log("\n=== TOP ROW FULL ===");
console.log(dumpGrid(40, 320, 180, 400, 5, 6));
console.log("\n=== MID LEFT ===");
console.log(dumpGrid(30, 160, 360, 560, 5, 6));
console.log("\n=== MID RIGHT ===");
console.log(dumpGrid(200, 330, 360, 560, 5, 6));
console.log("\n=== BOTTOM ===");
console.log(dumpGrid(30, 330, 520, 680, 5, 6));
