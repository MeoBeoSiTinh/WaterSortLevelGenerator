using System;
using System.Collections.Generic;
using TrainWaterSort.ScriptableObject.WaterSort;
using UnityEngine;

namespace TrainWaterSort.Gameplay.WaterSort
{
    public sealed class WaterSortJsonCatalog
    {
        private readonly List<WaterSortJsonLevel> levels = new();
        private readonly HashSet<string> packIds = new(StringComparer.Ordinal);

        public WaterSortColorPalette ColorPalette { get; private set; }
        public IReadOnlyList<WaterSortJsonLevel> Levels => levels;

        public static WaterSortJsonCatalog LoadFromResources(string levelResourcesFolder, string solutionResourcesFolder, WaterSortColorPalette colorPalette)
        {
            WaterSortJsonCatalog catalog = new()
            {
                ColorPalette = colorPalette
            };
            TextAsset[] levelFiles = Resources.LoadAll<TextAsset>(levelResourcesFolder);
            Array.Sort(levelFiles, (left, right) => string.CompareOrdinal(left.name, right.name));
            Dictionary<string, TextAsset> solutionFiles = new(StringComparer.Ordinal);
            foreach (TextAsset file in Resources.LoadAll<TextAsset>(solutionResourcesFolder))
            {
                string id = GetPackId(file.name, "watersort-solutions-");
                if (!solutionFiles.TryAdd(id, file))
                    throw new FormatException($"Duplicate solution pack {id}.");
            }
            foreach (TextAsset file in levelFiles)
            {
                string id = GetPackId(file.name, "watersort-levels-");
                solutionFiles.TryGetValue(id, out TextAsset solutions);
                catalog.AddPack(id, file.text, solutions?.text);
            }
            return catalog;
        }

        public static WaterSortJsonCatalog Create(WaterSortColorPalette colorPalette)
        {
            return new WaterSortJsonCatalog { ColorPalette = colorPalette };
        }

        private static string GetPackId(string name, string prefix)
        {
            if (!name.StartsWith(prefix, StringComparison.Ordinal) || name.Length == prefix.Length)
                throw new FormatException($"Unexpected Water Sort pack filename: {name}.");
            return name.Substring(prefix.Length);
        }

        // Identity/shape checks only. The Level Lab server performs canonical rule validation and replay.
        public void AddPack(string packId, string levelJson, string solutionJson, bool requireSolutions = false)
        {
            if (string.IsNullOrWhiteSpace(packId) || packIds.Contains(packId))
                throw new FormatException($"Missing or duplicate pack identity: {packId}.");
            WaterSortJsonPack pack;
            WaterSortJsonSolutionPack solutions = null;
            try
            {
                pack = JsonUtility.FromJson<WaterSortJsonPack>(levelJson);
                if (!string.IsNullOrWhiteSpace(solutionJson))
                    solutions = JsonUtility.FromJson<WaterSortJsonSolutionPack>(solutionJson);
            }
            catch (Exception exception)
            {
                throw new FormatException($"Pack {packId}: invalid JSON: {exception.Message}", exception);
            }
            if (pack?.levels == null || pack.levels.Count == 0 || pack.levels.Count > 100)
                throw new FormatException($"Pack {packId}: expected 1–100 levels.");
            Dictionary<int, WaterSortJsonLevel> byId = new();
            for (int index = 0; index < pack.levels.Count; index++)
            {
                WaterSortJsonLevel level = pack.levels[index];
                if (level?.bottles == null || level.bottles.Count == 0 || level.bottles.Exists(bottle => bottle == null))
                    throw new FormatException($"Pack {packId}, level {index + 1}: missing bottle data.");
                // Missing IDs in older packs use local numbering; collisions with explicit IDs are rejected.
                int id = level.id == 0 ? index + 1 : level.id;
                if (id < 1 || !byId.TryAdd(id, level))
                    throw new FormatException($"Pack {packId}: duplicate or ambiguous level identity {id}.");
            }
            HashSet<int> attached = new();
            if (solutions?.levelSolutions != null)
            {
                foreach (WaterSortJsonLevelSolution solution in solutions.levelSolutions)
                {
                    if (solution == null || !byId.TryGetValue(solution.levelNumber, out WaterSortJsonLevel level)
                        || !attached.Add(solution.levelNumber) || solution.solutionData == null)
                        throw new FormatException($"Pack {packId}: missing, duplicate, or unmatched solution identity {solution?.levelNumber}.");
                    level.solutionData = solution.solutionData;
                }
            }
            if (requireSolutions && attached.Count != pack.levels.Count)
                throw new FormatException($"Pack {packId}: each level must have a matching solution entry.");
            packIds.Add(packId);
            levels.AddRange(pack.levels);
        }

        public Color GetColor(int index)
        {
            if (ColorPalette == null)
            {
                return Color.magenta;
            }

            return ColorPalette.GetColor(index);
        }
    }

    [Serializable]
    public sealed class WaterSortJsonPack
    {
        public string packName;
        public List<WaterSortJsonLevel> levels = new();
    }

    [Serializable]
    public sealed class WaterSortJsonLevel
    {
        public int id;
        public string displayName;
        public WaterSortJsonLayoutGrid layoutGrid = new();
        public WaterSortJsonModeOptions modeOptions = new();
        public List<WaterSortJsonBottle> bottles = new();
        public WaterSortJsonSolutionData solutionData = new();

        public string GetDisplayName(int levelIndex)
        {
            return string.IsNullOrWhiteSpace(displayName) ? $"Level {levelIndex + 1}" : displayName;
        }
    }

    [Serializable]
    public sealed class WaterSortJsonLayoutGrid
    {
        public int columns = 8;
        public int rows = 5;
        public string shape;

        public int Columns => columns > 0 ? columns : 8;
        public int Rows => rows > 0 ? rows : 5;
        public string Shape => string.IsNullOrWhiteSpace(shape) ? "default" : shape;
    }

    [Serializable]
    public sealed class WaterSortJsonModeOptions
    {
        public bool hiddenStack;
        public bool hybridHiddenStack;
        public bool lockedBottles;
        public bool colorLockedBottles;
        public bool megaBottle;

        public bool HiddenStack => hiddenStack;
        public bool HybridHiddenStack => hybridHiddenStack;
        public bool LockedBottles => lockedBottles;
        public bool ColorLockedBottles => colorLockedBottles;
        public bool MegaBottle => megaBottle;
    }

    [Serializable]
    public sealed class WaterSortJsonGridPosition
    {
        public int x;
        public int y;
    }

    [Serializable]
    public sealed class WaterSortJsonSolutionPack
    {
        public string packName;
        public List<WaterSortJsonLevelSolution> levelSolutions = new();
    }

    [Serializable]
    public sealed class WaterSortJsonLevelSolution
    {
        public int levelNumber;
        public WaterSortJsonSolutionData solutionData = new();
    }

    [Serializable]
    public sealed class WaterSortJsonBottle
    {
        public int capacity = 4;
        public List<int> colorsBottomToTop = new();
        public List<int> hiddenLayerIndexes = new();
        public WaterSortJsonGridPosition gridPosition = new();
        public bool isLocked;
        public int unlockCompletedBottleCount = 1;
        public bool isColorLocked;
        public int unlockRequiredColor;
        public int unlockCompletedColorBottleCount = 1;
        public bool isAdBottle;
        public bool isMegaBottle;
        public int targetColor;

        public int Capacity => isMegaBottle ? Mathf.Max(12, capacity) : Mathf.Clamp(capacity, 2, 5);
        public IReadOnlyList<int> ColorsBottomToTop => colorsBottomToTop;
        public IReadOnlyList<int> HiddenLayerIndexes => hiddenLayerIndexes;
        public Vector2Int GridPosition => gridPosition == null ? new Vector2Int(-1, -1) : new Vector2Int(gridPosition.x, gridPosition.y);
        public bool IsLocked => isLocked;
        public int UnlockCompletedBottleCount => Mathf.Max(1, unlockCompletedBottleCount);
        public bool IsColorLocked => isColorLocked;
        public int UnlockRequiredColor => unlockRequiredColor;
        public int UnlockCompletedColorBottleCount => Mathf.Max(1, unlockCompletedColorBottleCount);
        public bool IsAdBottle => isAdBottle;
        public bool IsMegaBottle => isMegaBottle;
        public int TargetColor => targetColor;
    }

    [Serializable]
    public sealed class WaterSortJsonSolutionData
    {
        public int solutionCount;
        public int shortestStepCount;
        public int storedSolutionCount;
        public bool storesAllSolutions;
        public string difficulty;
        public string selectionPolicy;
        public List<WaterSortJsonSolution> solutions = new();
        public WaterSortJsonDifficultyMetrics difficultyMetrics;
        public WaterSortJsonLayoutMetrics layoutMetrics;
        public WaterSortJsonSpecialOptions specialOptions;
    }

    [Serializable]
    public sealed class WaterSortJsonDifficultyMetrics
    {
        public float difficultyScore;
        public int solutionSteps;
        public int legalOpeningMoves;
        public float branchingFactor;
        public float safeMoveRatio;
        public int criticalDecisionCount;
        public float falseProgressScore;
        public float trapLikelihood;
        public int recoveryPenalty;
        public int normalHelperCount;
        public int embeddedWorkspaceBottleCount;
        public int coreBottleCountExcludingAds;
        public float forcedMoveRatio;
        public float fragmentation;
        public int buriedDepth;
        public float helperPressure;
        public int freeCapacity;
        public float fillDensity;
        public float rehandling;
        public float crossBottleDependency;
        public float temporaryDisorder;
        public float deadEndPotential;
        public float specialModePressure;
        public int solverVisitedStates;
        public int remainingMixedBottleCount;
        public int safeOpeningMoves;
        public int deadEndOpeningMoves;
        public int falseProgressOpeningMoves;
        public int classifiedOpeningMoves;
        public int safetySampleCheckpoints;
    }

    [Serializable]
    public sealed class WaterSortJsonLayoutMetrics
    {
        public int connectedGroupCount;
        public int isolatedBottleCount;
        public int emptyRowGapCount;
        public int internalHorizontalGapCount;
        public float rowBalanceScore;
        public float centerOffset;
        public float compactnessScore;
        public float layoutScore;
    }

    [Serializable]
    public sealed class WaterSortJsonSpecialOptions
    {
        public string type;
        public string trapType;
        public string preferredRescueType;
        public int safeSolutionStepCount;
        public WaterSortJsonNearWinMetrics nearWinMetrics;
        public WaterSortJsonRecoveryMetrics recovery;
    }

    [Serializable]
    public sealed class WaterSortJsonNearWinMetrics
    {
        public float nearWinScore;
        public float safeMoveRatio;
        public float branchingFactor;
        public float trapLikelihood;
        public float falseProgressScore;
        public int criticalDecisionCount;
        public float completedBottleRatio;
        public float completedColorRatio;
        public int remainingMixedBottleCount;
    }

    [Serializable]
    public sealed class WaterSortJsonRecoveryMetrics
    {
        public int safeRemainingSteps;
        public int trapRemainingSteps;
        public int recoveryPenalty;
        public float recoveryRatio;
        public string solverStatus;
    }

    [Serializable]
    public sealed class WaterSortJsonSolution
    {
        public int stepCount;
        public List<WaterSortJsonMove> moves = new();
    }

    [Serializable]
    public sealed class WaterSortJsonMove
    {
        public int fromBottle;
        public int toBottle;
    }
}
