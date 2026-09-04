using System;
using System.Collections.Generic;
using UnityEngine;

namespace TrainWaterSort.ScriptableObject.WaterSort
{
    [CreateAssetMenu(fileName = "WaterSortGenerationConfig", menuName = "Train WaterSort/Generation Config")]
    public sealed class WaterSortGenerationConfig : UnityEngine.ScriptableObject
    {
        [SerializeField] private int schemaVersion = 1;
        [SerializeField] private int levelsPerPack = 100;
        [SerializeField] private int solutionExampleLimitWhenMany = 3;
        [SerializeField] private int manySolutionThreshold = 10;
        [SerializeField] private int defaultBottleCapacity = 4;
        [SerializeField] private int layoutGridColumns = 8;
        [SerializeField] private int layoutGridRows = 8;
        [SerializeField] private bool allowNoEmptyStartingBottles = true;
        [SerializeField, Range(0f, 1f)] private float noEmptyStartingBottleChance = 0.15f;
        [SerializeField] private int preferredMinEmptyBottleCount = 1;
        [SerializeField] private int preferredMaxEmptyBottleCount = 3;
        [SerializeField, Range(0f, 1f)] private float duplicateColorBottleChance = 0.45f;
        [SerializeField] private int maxDuplicateBottleTargetsPerColor = 10;
        [SerializeField] private int maxBottleCount = 50;
        [SerializeField, Range(0f, 1f)] private float diverseOpeningSolutionChance = 0.35f;
        [SerializeField] private int diverseOpeningMoveWindow = 4;
        [SerializeField] private int diverseOpeningMinDistinctSourceBottles = 3;
        [SerializeField] private int diverseOpeningMinStoredSolutions = 2;
        [SerializeField] private string selectionPolicy = "shortest_non_loop_empty_priority_opening_diversity_soft";
        [SerializeField] private List<DifficultyBand> difficultyBands = new();

        public int SchemaVersion => schemaVersion;
        public int LevelsPerPack => levelsPerPack;
        public int SolutionExampleLimitWhenMany => solutionExampleLimitWhenMany;
        public int ManySolutionThreshold => manySolutionThreshold;
        public int DefaultBottleCapacity => defaultBottleCapacity;
        public int LayoutGridColumns => layoutGridColumns;
        public int LayoutGridRows => layoutGridRows;
        public bool AllowNoEmptyStartingBottles => allowNoEmptyStartingBottles;
        public float NoEmptyStartingBottleChance => noEmptyStartingBottleChance;
        public int PreferredMinEmptyBottleCount => preferredMinEmptyBottleCount;
        public int PreferredMaxEmptyBottleCount => preferredMaxEmptyBottleCount;
        public float DuplicateColorBottleChance => duplicateColorBottleChance;
        public int MaxDuplicateBottleTargetsPerColor => maxDuplicateBottleTargetsPerColor;
        public int MaxBottleCount => maxBottleCount;
        public float DiverseOpeningSolutionChance => diverseOpeningSolutionChance;
        public int DiverseOpeningMoveWindow => diverseOpeningMoveWindow;
        public int DiverseOpeningMinDistinctSourceBottles => diverseOpeningMinDistinctSourceBottles;
        public int DiverseOpeningMinStoredSolutions => diverseOpeningMinStoredSolutions;
        public string SelectionPolicy => selectionPolicy;
        public IReadOnlyList<DifficultyBand> DifficultyBands => difficultyBands;

        private void OnValidate()
        {
            schemaVersion = Mathf.Max(1, schemaVersion);
            levelsPerPack = Mathf.Max(1, levelsPerPack);
            solutionExampleLimitWhenMany = Mathf.Max(1, solutionExampleLimitWhenMany);
            manySolutionThreshold = Mathf.Max(1, manySolutionThreshold);
            defaultBottleCapacity = Mathf.Clamp(defaultBottleCapacity, 2, 5);
            layoutGridColumns = 8;
            layoutGridRows = 8;
            noEmptyStartingBottleChance = allowNoEmptyStartingBottles ? Mathf.Clamp01(noEmptyStartingBottleChance) : 0f;
            preferredMinEmptyBottleCount = Mathf.Max(0, preferredMinEmptyBottleCount);
            preferredMaxEmptyBottleCount = Mathf.Max(preferredMinEmptyBottleCount, preferredMaxEmptyBottleCount);
            duplicateColorBottleChance = Mathf.Clamp01(duplicateColorBottleChance);
            maxDuplicateBottleTargetsPerColor = Mathf.Max(1, maxDuplicateBottleTargetsPerColor);
            maxBottleCount = Mathf.Clamp(maxBottleCount, 1, 50);
            diverseOpeningSolutionChance = Mathf.Clamp01(diverseOpeningSolutionChance);
            diverseOpeningMoveWindow = Mathf.Max(1, diverseOpeningMoveWindow);
            diverseOpeningMinDistinctSourceBottles = Mathf.Max(1, diverseOpeningMinDistinctSourceBottles);
            diverseOpeningMinStoredSolutions = Mathf.Max(1, diverseOpeningMinStoredSolutions);
            selectionPolicy = string.IsNullOrWhiteSpace(selectionPolicy)
                ? "shortest_non_loop_empty_priority_opening_diversity_soft"
                : selectionPolicy.Trim();

            foreach (DifficultyBand band in difficultyBands)
            {
                band?.Validate();
            }
        }

        [Serializable]
        public sealed class DifficultyBand
        {
            [SerializeField] private string name;
            [SerializeField] private int levelCount = 1;
            [SerializeField] private float targetDifficultyScoreMin = 0.75f;
            [SerializeField] private float targetDifficultyScoreMax = 0.9f;
            [SerializeField] private List<ColorWeight> colorWeights = new();
            [SerializeField] private List<HelperCapacityWeight> helperCapacityWeights = new();
            [SerializeField] private List<BottleCapacityWeight> bottleCapacityWeights = new();
            [SerializeField] private List<GridShapeWeight> gridShapeWeights = new();
            [SerializeField] private bool allowHiddenStackMode;
            [SerializeField, Range(0f, 1f)] private float hiddenStackChance;
            [SerializeField] private bool allowHybridHiddenStackMode;
            [SerializeField, Range(0f, 1f)] private float hybridHiddenStackChance;
            [SerializeField, Range(0f, 1f)] private float hybridHiddenBottleChance = 0.5f;
            [SerializeField] private int minHybridHiddenLayersPerBottle = 1;
            [SerializeField] private int maxHybridHiddenLayersPerBottle = 2;
            [SerializeField] private bool allowLockedBottleMode;
            [SerializeField, Range(0f, 1f)] private float lockedBottleChance;
            [SerializeField] private int minLockedBottleCount = 1;
            [SerializeField] private int maxLockedBottleCount = 4;
            [SerializeField] private int minCompletedBottleCountToUnlock = 1;
            [SerializeField] private int maxCompletedBottleCountToUnlock = 3;
            [SerializeField] private int minTargetBottleCount = 0;
            [SerializeField] private int maxTargetBottleCount = 0;
            [SerializeField] private int minShortestStepCount = 1;
            [SerializeField] private int maxShortestStepCount = 1;
            [SerializeField] private int maxSolutionCount = 1000;

            public string Name => name;
            public int LevelCount => levelCount;
            public float TargetDifficultyScoreMin => targetDifficultyScoreMin;
            public float TargetDifficultyScoreMax => targetDifficultyScoreMax;
            public IReadOnlyList<ColorWeight> ColorWeights => colorWeights;
            public IReadOnlyList<HelperCapacityWeight> HelperCapacityWeights => helperCapacityWeights;
            public IReadOnlyList<BottleCapacityWeight> BottleCapacityWeights => bottleCapacityWeights;
            public IReadOnlyList<GridShapeWeight> GridShapeWeights => gridShapeWeights;
            public bool AllowHiddenStackMode => allowHiddenStackMode;
            public float HiddenStackChance => hiddenStackChance;
            public bool AllowHybridHiddenStackMode => allowHybridHiddenStackMode;
            public float HybridHiddenStackChance => hybridHiddenStackChance;
            public float HybridHiddenBottleChance => hybridHiddenBottleChance;
            public int MinHybridHiddenLayersPerBottle => minHybridHiddenLayersPerBottle;
            public int MaxHybridHiddenLayersPerBottle => maxHybridHiddenLayersPerBottle;
            public bool AllowLockedBottleMode => allowLockedBottleMode;
            public float LockedBottleChance => lockedBottleChance;
            public int MinLockedBottleCount => minLockedBottleCount;
            public int MaxLockedBottleCount => maxLockedBottleCount;
            public int MinCompletedBottleCountToUnlock => minCompletedBottleCountToUnlock;
            public int MaxCompletedBottleCountToUnlock => maxCompletedBottleCountToUnlock;
            public int MinTargetBottleCount => minTargetBottleCount;
            public int MaxTargetBottleCount => maxTargetBottleCount;
            public int MinShortestStepCount => minShortestStepCount;
            public int MaxShortestStepCount => maxShortestStepCount;
            public int MaxSolutionCount => maxSolutionCount;

            internal void Validate()
            {
                levelCount = Mathf.Max(1, levelCount);
                targetDifficultyScoreMin = Mathf.Clamp01(targetDifficultyScoreMin);
                targetDifficultyScoreMax = Mathf.Clamp(targetDifficultyScoreMax, targetDifficultyScoreMin, 1f);
                hiddenStackChance = allowHiddenStackMode ? Mathf.Clamp01(hiddenStackChance) : 0f;
                hybridHiddenStackChance = allowHybridHiddenStackMode ? Mathf.Clamp01(hybridHiddenStackChance) : 0f;
                hybridHiddenBottleChance = Mathf.Clamp01(hybridHiddenBottleChance);
                minHybridHiddenLayersPerBottle = Mathf.Clamp(minHybridHiddenLayersPerBottle, 1, 2);
                maxHybridHiddenLayersPerBottle = Mathf.Clamp(maxHybridHiddenLayersPerBottle, minHybridHiddenLayersPerBottle, 2);
                lockedBottleChance = allowLockedBottleMode ? Mathf.Clamp01(lockedBottleChance) : 0f;
                minLockedBottleCount = Mathf.Clamp(minLockedBottleCount, 1, 4);
                maxLockedBottleCount = Mathf.Clamp(maxLockedBottleCount, minLockedBottleCount, 4);
                minCompletedBottleCountToUnlock = Mathf.Max(1, minCompletedBottleCountToUnlock);
                maxCompletedBottleCountToUnlock = Mathf.Max(minCompletedBottleCountToUnlock, maxCompletedBottleCountToUnlock);
                minTargetBottleCount = Mathf.Max(0, minTargetBottleCount);
                maxTargetBottleCount = Mathf.Clamp(maxTargetBottleCount, minTargetBottleCount, 50);
                minShortestStepCount = Mathf.Max(0, minShortestStepCount);
                maxShortestStepCount = Mathf.Max(minShortestStepCount, maxShortestStepCount);
                maxSolutionCount = Mathf.Max(1, maxSolutionCount);

                foreach (ColorWeight colorWeight in colorWeights)
                {
                    colorWeight?.Validate();
                }

                foreach (HelperCapacityWeight helperCapacityWeight in helperCapacityWeights)
                {
                    helperCapacityWeight?.Validate();
                }

                foreach (BottleCapacityWeight bottleCapacityWeight in bottleCapacityWeights)
                {
                    bottleCapacityWeight?.Validate();
                }

                foreach (GridShapeWeight gridShapeWeight in gridShapeWeights)
                {
                    gridShapeWeight?.Validate();
                }
            }
        }

        [Serializable]
        public sealed class ColorWeight
        {
            [SerializeField] private int colorCount = 3;
            [SerializeField] private int weight = 1;

            public int ColorCount => colorCount;
            public int Weight => weight;

            internal void Validate()
            {
                colorCount = Mathf.Max(1, colorCount);
                weight = Mathf.Max(0, weight);
            }
        }

        [Serializable]
        public sealed class HelperCapacityWeight
        {
            [SerializeField] private int helperCapacity;
            [SerializeField] private int weight = 1;

            public int HelperCapacity => helperCapacity;
            public int Weight => weight;

            internal void Validate()
            {
                helperCapacity = Mathf.Max(0, helperCapacity);
                weight = Mathf.Max(0, weight);
            }
        }

        [Serializable]
        public sealed class BottleCapacityWeight
        {
            [SerializeField] private int capacity = 4;
            [SerializeField] private int weight = 1;

            public int Capacity => capacity;
            public int Weight => weight;

            internal void Validate()
            {
                capacity = Mathf.Clamp(capacity, 2, 5);
                weight = Mathf.Max(0, weight);
            }
        }

        [Serializable]
        public sealed class GridShapeWeight
        {
            [SerializeField] private string shape = "circle";
            [SerializeField] private int weight = 1;
            [SerializeField] private int minBottleCount = 1;
            [SerializeField] private int maxBottleCount = 50;

            public string Shape => shape;
            public int Weight => weight;
            public int MinBottleCount => minBottleCount;
            public int MaxBottleCount => maxBottleCount;

            internal void Validate()
            {
                shape = string.IsNullOrWhiteSpace(shape) ? "circle" : shape.Trim();
                weight = Mathf.Max(0, weight);
                minBottleCount = Mathf.Clamp(minBottleCount, 1, 64);
                maxBottleCount = Mathf.Clamp(maxBottleCount, minBottleCount, 64);
            }
        }
    }
}
