"use strict";

function isAdBottle(bottle) {
  return Boolean(bottle && bottle.isAdBottle);
}

function cloneBottleForCore(bottle) {
  return {
    capacity: Number(bottle.capacity) || 0,
    colorsBottomToTop: Array.isArray(bottle.colorsBottomToTop)
      ? bottle.colorsBottomToTop.map((color) => Number(color))
      : [],
    isMegaBottle: Boolean(bottle.isMegaBottle),
    targetColor: bottle.targetColor == null ? null : Number(bottle.targetColor),
    isLocked: Boolean(bottle.isLocked),
    unlockCompletedBottleCount: bottle.unlockCompletedBottleCount == null
      ? null
      : Number(bottle.unlockCompletedBottleCount),
    hiddenLayerIndexes: Array.isArray(bottle.hiddenLayerIndexes)
      ? bottle.hiddenLayerIndexes.map((index) => Number(index)).sort((a, b) => a - b)
      : [],
  };
}

function bottleSignature(bottle) {
  return JSON.stringify({
    capacity: bottle.capacity,
    colorsBottomToTop: bottle.colorsBottomToTop,
    isMegaBottle: bottle.isMegaBottle,
    targetColor: bottle.targetColor,
    isLocked: bottle.isLocked,
    unlockCompletedBottleCount: bottle.unlockCompletedBottleCount,
    hiddenLayerIndexes: bottle.hiddenLayerIndexes,
  });
}

function bottleShapeSignature(bottle) {
  const localMap = new Map();
  let nextColor = 0;
  const localColors = bottle.colorsBottomToTop.map((color) => {
    if (!localMap.has(color)) {
      localMap.set(color, nextColor);
      nextColor += 1;
    }
    return localMap.get(color);
  });
  const targetColor = bottle.targetColor == null ? null : localMap.get(bottle.targetColor) ?? "external";
  return JSON.stringify({
    capacity: bottle.capacity,
    colorsBottomToTop: localColors,
    isMegaBottle: bottle.isMegaBottle,
    targetColor,
    isLocked: bottle.isLocked,
    unlockCompletedBottleCount: bottle.unlockCompletedBottleCount,
    hiddenLayerIndexes: bottle.hiddenLayerIndexes,
  });
}

function remapColors(bottles) {
  const colorMap = new Map();
  let nextColor = 0;

  function mapColor(color) {
    if (!colorMap.has(color)) {
      colorMap.set(color, nextColor);
      nextColor += 1;
    }
    return colorMap.get(color);
  }

  return bottles.map((bottle) => {
    const remapped = {
      ...bottle,
      colorsBottomToTop: bottle.colorsBottomToTop.map(mapColor),
      targetColor: bottle.targetColor == null ? null : mapColor(bottle.targetColor),
    };
    return remapped;
  });
}

function canonicalizeCoreBottles(bottles) {
  let canonical = bottles
    .filter((bottle) => !isAdBottle(bottle))
    .map(cloneBottleForCore)
    .sort(compareByBottleShape);
  let previous = "";

  for (let pass = 0; pass < 8; pass++) {
    canonical = remapColors(canonical).sort(compareByBottleSignature);
    const current = JSON.stringify(canonical);
    if (current === previous) break;
    previous = current;
  }

  return canonical;
}

function compareByBottleShape(left, right) {
  const leftSignature = bottleShapeSignature(left);
  const rightSignature = bottleShapeSignature(right);
  if (leftSignature < rightSignature) return -1;
  if (leftSignature > rightSignature) return 1;
  return 0;
}

function compareByBottleSignature(left, right) {
  const leftSignature = bottleSignature(left);
  const rightSignature = bottleSignature(right);
  if (leftSignature < rightSignature) return -1;
  if (leftSignature > rightSignature) return 1;
  return 0;
}

function canonicalizeModeOptions(modeOptions = {}) {
  return {
    hiddenStack: Boolean(modeOptions.hiddenStack),
    hybridHiddenStack: Boolean(modeOptions.hybridHiddenStack),
    lockedBottles: Boolean(modeOptions.lockedBottles),
    megaBottle: Boolean(modeOptions.megaBottle),
  };
}

function coreGameplayFingerprint(level) {
  const bottles = Array.isArray(level?.bottles) ? level.bottles : [];
  const payload = {
    modeOptions: canonicalizeModeOptions(level?.modeOptions),
    bottles: canonicalizeCoreBottles(bottles),
  };
  return JSON.stringify(payload);
}

function coreGameplayFingerprintFromBoard({
  board,
  capacity,
  firstAdBottleIndex = board.length,
  modeOptions = {},
  hybridHiddenLayers = null,
  lockedByBottle = null,
  megaBottleIndex = -1,
  megaCapacity = null,
  megaTargetColor = null,
}) {
  const bottles = board.map((colorsBottomToTop, index) => {
    const isAd = index >= firstAdBottleIndex;
    const isMegaBottle = megaBottleIndex >= 0 && index === megaBottleIndex;
    const bottle = {
      capacity: isMegaBottle ? megaCapacity : capacity,
      colorsBottomToTop: Array.isArray(colorsBottomToTop) ? colorsBottomToTop.slice() : [],
      isAdBottle: isAd,
    };
    if (isMegaBottle) {
      bottle.isMegaBottle = true;
      bottle.targetColor = megaTargetColor;
    }
    if (hybridHiddenLayers && Array.isArray(hybridHiddenLayers[index]) && hybridHiddenLayers[index].length > 0) {
      bottle.hiddenLayerIndexes = hybridHiddenLayers[index].slice();
    }
    if (lockedByBottle && lockedByBottle.has(index)) {
      bottle.isLocked = true;
      bottle.unlockCompletedBottleCount = lockedByBottle.get(index);
    }
    return bottle;
  });

  return coreGameplayFingerprint({
    modeOptions,
    bottles,
  });
}

module.exports = {
  coreGameplayFingerprint,
  coreGameplayFingerprintFromBoard,
  canonicalizeCoreBottles,
  canonicalizeModeOptions,
};
