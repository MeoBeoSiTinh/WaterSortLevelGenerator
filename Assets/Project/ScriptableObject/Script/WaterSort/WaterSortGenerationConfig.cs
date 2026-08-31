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
        [SerializeField] private bool allowCapacityFive = true;
        [SerializeField] private bool allowNoEmptyStartingBottles = true;
        [SerializeField, Range(0f, 1f)] private float noEmptyStartingBottleChance = 0.15f;
        [SerializeField] private int preferredMinEmptyBottleCount = 1;
        [SerializeField] private int preferredMaxEmptyBottleCount = 3;
        [SerializeField, Range(0f, 1f)] private float duplicateColorBottleChance = 0.45f;
        [SerializeField] private int maxDuplicateBottleTargetsPerColor = 6;
        [SerializeField] private int maxBottleCount = 30;
        [SerializeField] private string selectionPolicy = "shortest_non_loop_empty_priority";
        [SerializeField] private List<DifficultyBand> difficultyBands = new();

        public int SchemaVersion => schemaVersion;
        public int LevelsPerPack => levelsPerPack;
        public int SolutionExampleLimitWhenMany => solutionExampleLimitWhenMany;
        public int ManySolutionThreshold => manySolutionThreshold;
        public int DefaultBottleCapacity => defaultBottleCapacity;
        public bool AllowCapacityFive => allowCapacityFive;
        public bool AllowNoEmptyStartingBottles => allowNoEmptyStartingBottles;
        public float NoEmptyStartingBottleChance => noEmptyStartingBottleChance;
        public int PreferredMinEmptyBottleCount => preferredMinEmptyBottleCount;
        public int PreferredMaxEmptyBottleCount => preferredMaxEmptyBottleCount;
        public float DuplicateColorBottleChance => duplicateColorBottleChance;
        public int MaxDuplicateBottleTargetsPerColor => maxDuplicateBottleTargetsPerColor;
        public int MaxBottleCount => maxBottleCount;
        public string SelectionPolicy => selectionPolicy;
        public IReadOnlyList<DifficultyBand> DifficultyBands => difficultyBands;

        private void OnValidate()
        {
            schemaVersion = Mathf.Max(1, schemaVersion);
            levelsPerPack = Mathf.Max(1, levelsPerPack);
            solutionExampleLimitWhenMany = Mathf.Max(1, solutionExampleLimitWhenMany);
            manySolutionThreshold = Mathf.Max(1, manySolutionThreshold);
            defaultBottleCapacity = Mathf.Clamp(defaultBottleCapacity, 4, 5);
            noEmptyStartingBottleChance = allowNoEmptyStartingBottles ? Mathf.Clamp01(noEmptyStartingBottleChance) : 0f;
            preferredMinEmptyBottleCount = Mathf.Max(0, preferredMinEmptyBottleCount);
            preferredMaxEmptyBottleCount = Mathf.Max(preferredMinEmptyBottleCount, preferredMaxEmptyBottleCount);
            duplicateColorBottleChance = Mathf.Clamp01(duplicateColorBottleChance);
            maxDuplicateBottleTargetsPerColor = Mathf.Max(1, maxDuplicateBottleTargetsPerColor);
            maxBottleCount = Mathf.Clamp(maxBottleCount, 1, 30);
            selectionPolicy = string.IsNullOrWhiteSpace(selectionPolicy)
                ? "shortest_non_loop_empty_priority"
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
            [SerializeField] private int levelFrom = 1;
            [SerializeField] private int levelTo = 1;
            [SerializeField] private float targetDifficultyScoreMin = 0.75f;
            [SerializeField] private float targetDifficultyScoreMax = 0.9f;
            [SerializeField] private List<ColorWeight> colorWeights = new();
            [SerializeField] private List<HelperCapacityWeight> helperCapacityWeights = new();
            [SerializeField] private float capacityFiveChance;
            [SerializeField] private int minTargetBottleCount = 0;
            [SerializeField] private int maxTargetBottleCount = 0;
            [SerializeField] private int minShortestStepCount = 1;
            [SerializeField] private int maxShortestStepCount = 1;
            [SerializeField] private int maxSolutionCount = 1000;

            public string Name => name;
            public int LevelFrom => levelFrom;
            public int LevelTo => levelTo;
            public float TargetDifficultyScoreMin => targetDifficultyScoreMin;
            public float TargetDifficultyScoreMax => targetDifficultyScoreMax;
            public IReadOnlyList<ColorWeight> ColorWeights => colorWeights;
            public IReadOnlyList<HelperCapacityWeight> HelperCapacityWeights => helperCapacityWeights;
            public float CapacityFiveChance => capacityFiveChance;
            public int MinTargetBottleCount => minTargetBottleCount;
            public int MaxTargetBottleCount => maxTargetBottleCount;
            public int MinShortestStepCount => minShortestStepCount;
            public int MaxShortestStepCount => maxShortestStepCount;
            public int MaxSolutionCount => maxSolutionCount;

            internal void Validate()
            {
                levelFrom = Mathf.Max(1, levelFrom);
                levelTo = Mathf.Max(levelFrom, levelTo);
                targetDifficultyScoreMin = Mathf.Clamp01(targetDifficultyScoreMin);
                targetDifficultyScoreMax = Mathf.Clamp(targetDifficultyScoreMax, targetDifficultyScoreMin, 1f);
                capacityFiveChance = Mathf.Clamp01(capacityFiveChance);
                minTargetBottleCount = Mathf.Max(0, minTargetBottleCount);
                maxTargetBottleCount = Mathf.Clamp(maxTargetBottleCount, minTargetBottleCount, 30);
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
    }
}
