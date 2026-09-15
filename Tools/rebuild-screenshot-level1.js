"use strict";

/**
 * Rebuild watersort pack 007 Level 1 from screenshot color bars (tutorial frame).
 * Layers listed top→bottom in comments; stored as colorsBottomToTop.
 */

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const levelPath = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-007.json");
const solutionPath = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-007.json");

// Palette indexes (WaterSortColorPalette.asset)
const R = 0; // red
const B = 1; // blue
const Y = 2; // yellow
const G = 3; // green
const P = 4; // purple
const O = 6; // orange
const C = 7; // cyan/teal
const K = 8; // brown

function t2bToB2t(topToBottom) {
  return [...topToBottom].reverse();
}

function bottle(x, y, topToBottom, extra = {}) {
  return {
    capacity: 4,
    colorsBottomToTop: t2bToB2t(topToBottom),
    gridPosition: { x, y },
    ...extra,
  };
}

// Top→bottom sequences from level1b screenshot (+ crop verification)
const level1Bottles = [
  bottle(1, 0, [B, Y, G, R]), // 1 top-left — user confirmed
  bottle(2, 0, [G, Y, G, R]), // 2
  bottle(3, 0, [R, Y, B, P]), // 3 hand target
  bottle(4, 0, [Y, G, R, B]), // 4
  bottle(5, 0, [Y, R, K, G]), // 5
  bottle(6, 0, [Y, R, K, G]), // 6 top-right (crop A_t4)
  bottle(0, 1, [B, R, C, Y]), // 7 mid-left
  bottle(7, 1, [G, B, R, Y]), // 8 mid-right
  bottle(0, 3, [G, B, R, Y]), // 9
  bottle(1, 3, [G, R, G, R]), // 10
  bottle(2, 3, [C, R, Y, P]), // 11
  bottle(3, 3, [B, K, G, R]), // 12
  bottle(4, 3, [Y, B, R, G]), // 13
  bottle(5, 3, [R, Y, C, B]), // 14
  bottle(6, 3, [K, R, B, Y]), // 15
];

function countColor(bottles, color) {
  let n = 0;
  for (const b of bottles) {
    if (b.isAdBottle) continue;
    for (const c of b.colorsBottomToTop) if (c === color) n += 1;
  }
  return n;
}

const targetColor = R;
const starter = [R]; // thin red already in heart
const redTotal = countColor(level1Bottles, targetColor) + starter.length;
if (redTotal < 12 || redTotal > 20) {
  throw new Error(`Mega red count ${redTotal} out of 12-20`);
}

const mega = {
  capacity: redTotal,
  colorsBottomToTop: starter.slice(),
  gridPosition: { x: 3, y: 2 },
  isMegaBottle: true,
  targetColor,
};

const ads = [
  { capacity: 4, colorsBottomToTop: [], gridPosition: { x: 2, y: 4 }, isAdBottle: true },
  { capacity: 4, colorsBottomToTop: [], gridPosition: { x: 5, y: 4 }, isAdBottle: true },
];

// Normal empty helpers (not ads) so mega uncovering can park blockers.
const helpers = [
  { capacity: 4, colorsBottomToTop: [], gridPosition: { x: 4, y: 2 } },
  { capacity: 4, colorsBottomToTop: [], gridPosition: { x: 2, y: 2 } },
  { capacity: 4, colorsBottomToTop: [], gridPosition: { x: 4, y: 1 } },
];

const level1 = {
  id: 1,
  displayName: "Level 1",
  layoutGrid: { columns: 8, rows: 5, shape: "circle" },
  modeOptions: {
    hiddenStack: false,
    hybridHiddenStack: false,
    lockedBottles: false,
    colorLockedBottles: false,
    megaBottle: true,
  },
  bottles: [mega, ...level1Bottles, ...helpers, ...ads],
};

function solveMega(level) {
  const megaIndex = level.bottles.findIndex((b) => b.isMegaBottle);
  const megaBottle = level.bottles[megaIndex];
  const target = megaBottle.targetColor;
  const megaCap = megaBottle.capacity;
  const board = level.bottles.map((b) => (b.colorsBottomToTop || []).slice());
  const caps = level.bottles.map((b) => (b.isMegaBottle ? b.capacity : 4));
  const isAd = (i) => Boolean(level.bottles[i].isAdBottle);
  const moves = [];

  function pour(from, to) {
    const src = board[from];
    const dst = board[to];
    const color = src[src.length - 1];
    let amount = 0;
    for (let i = src.length - 1; i >= 0 && src[i] === color; i--) amount += 1;
    amount = Math.min(amount, caps[to] - dst.length);
    if (amount <= 0) throw new Error("bad pour");
    for (let i = 0; i < amount; i++) dst.push(src.pop());
    moves.push({ fromBottle: from + 1, toBottle: to + 1 });
  }

  let guard = 0;
  while (board[megaIndex].length < megaCap) {
    if (++guard > 500) throw new Error("mega solve loop");
    let src = board.findIndex((b, i) => i !== megaIndex && !isAd(i) && b.length && b[b.length - 1] === target);
    if (src >= 0) {
      pour(src, megaIndex);
      continue;
    }
    src = board.findIndex((b, i) => i !== megaIndex && !isAd(i) && b.includes(target));
    if (src < 0) throw new Error("target unreachable");
    const blocker = board[src][board[src].length - 1];
    let helperIdx = board.findIndex((b, i) =>
      i !== megaIndex && i !== src && !isAd(i) && b.length < caps[i] && b.length > 0 && b[b.length - 1] === blocker);
    if (helperIdx < 0) {
      helperIdx = board.findIndex((b, i) =>
        i !== megaIndex && i !== src && !isAd(i) && b.length === 0);
    }
    if (helperIdx < 0) throw new Error("no helper");
    pour(src, helperIdx);
  }
  if (!board[megaIndex].every((c) => c === target)) throw new Error("mega polluted");
  return {
    solutionCount: 1,
    shortestStepCount: moves.length,
    storedSolutionCount: 1,
    storesAllSolutions: true,
    selectionPolicy: "screenshot_l1_mega_greedy",
    solutions: [{ stepCount: moves.length, moves }],
  };
}

const solutionData = solveMega(level1);

// Pack currently contains only accurate screenshot Level 1; levels 2–10 rebuild next.
const levelPack = { packName: "Water Sort Levels 007", levels: [level1] };
const solutionPack = {
  packName: "Water Sort Solutions 007",
  levelSolutions: [{ levelNumber: 1, solutionData }],
};

fs.writeFileSync(levelPath, `${JSON.stringify(levelPack, null, 2)}\n`);
fs.writeFileSync(solutionPath, `${JSON.stringify(solutionPack, null, 2)}\n`);

console.log(JSON.stringify({
  redTotal,
  megaCapacity: mega.capacity,
  bottles: level1.bottles.length,
  steps: solutionData.shortestStepCount,
  topLeftB2T: level1Bottles[0].colorsBottomToTop,
  topLeftT2B: [...level1Bottles[0].colorsBottomToTop].reverse(),
}, null, 2));
