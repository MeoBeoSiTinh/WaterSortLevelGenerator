using System;
using System.Collections.Generic;
using UnityEngine;

namespace TrainWaterSort.ScriptableObject.WaterSort
{
    [CreateAssetMenu(fileName = "WaterSortGenerationConfig", menuName = "Train WaterSort/Generation Config")]
    public sealed class WaterSortGenerationConfig : UnityEngine.ScriptableObject
    {
        private const int CurrentSchemaVersion = 3;

        [SerializeField] private int schemaVersion = CurrentSchemaVersion;
        [SerializeField] private string selectedDifficultyProfile = "Hard";
        [SerializeField] private int levelsPerPack = 100;
        [SerializeField] private int solutionExampleLimitWhenMany = 3;
        [SerializeField] private int manySolutionThreshold = 10;
        [SerializeField] private int defaultBottleCapacity = 4;
        [SerializeField] private int layoutGridColumns = 8;
        [SerializeField] private int layoutGridRows = 5;
        [SerializeField] private bool allowNoEmptyStartingBottles = true;
        [SerializeField, Range(0f, 1f)] private float noEmptyStartingBottleChance = 0.15f;
        [SerializeField] private int preferredMinEmptyBottleCount = 1;
        [SerializeField] private int preferredMaxEmptyBottleCount = 3;
        [SerializeField, Range(0f, 1f)] private float duplicateColorBottleChance = 0.45f;
        [SerializeField] private int maxDuplicateBottleTargetsPerColor = 10;
        [SerializeField] private int maxBottleCount = 40;
        [SerializeField, Range(0f, 1f)] private float diverseOpeningSolutionChance = 0.35f;
        [SerializeField] private int diverseOpeningMoveWindow = 4;
        [SerializeField] private int diverseOpeningMinDistinctSourceBottles = 3;
        [SerializeField] private int diverseOpeningMinStoredSolutions = 2;
        [SerializeField] private string selectionPolicy = "shortest_non_loop_empty_priority_opening_diversity_soft";
        [SerializeField] private List<DifficultyProfile> difficultyProfiles = new();
        [SerializeField, HideInInspector] private List<DifficultyBand> difficultyBands = new();

        public int SchemaVersion => schemaVersion;
        public string SelectedDifficultyProfile => selectedDifficultyProfile;
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
        public IReadOnlyList<DifficultyProfile> DifficultyProfiles => difficultyProfiles;
        public IReadOnlyList<DifficultyBand> LegacyDifficultyBands => difficultyBands;

        public bool TryGetDifficultyProfile(DifficultyProfileId profileId, out DifficultyProfile profile)
        {
            profile = FindProfile(profileId);
            return profile != null;
        }

        public bool TryGetSelectedDifficultyProfile(out DifficultyProfile profile)
        {
            DifficultyProfileId selectedId = DifficultyProfile.IdFromName(selectedDifficultyProfile);
            profile = selectedId == DifficultyProfileId.Unknown ? null : FindProfile(selectedId);
            return profile != null;
        }

        private void OnValidate()
        {
            UpgradeDifficultyProfilesIfNeeded();
            schemaVersion = Mathf.Max(CurrentSchemaVersion, schemaVersion);
            selectedDifficultyProfile = string.IsNullOrWhiteSpace(selectedDifficultyProfile)
                ? "Hard"
                : selectedDifficultyProfile.Trim();
            levelsPerPack = Mathf.Max(1, levelsPerPack);
            solutionExampleLimitWhenMany = Mathf.Max(1, solutionExampleLimitWhenMany);
            manySolutionThreshold = Mathf.Max(1, manySolutionThreshold);
            defaultBottleCapacity = Mathf.Clamp(defaultBottleCapacity, 2, 5);
            layoutGridColumns = 8;
            layoutGridRows = 5;
            noEmptyStartingBottleChance = allowNoEmptyStartingBottles ? Mathf.Clamp01(noEmptyStartingBottleChance) : 0f;
            preferredMinEmptyBottleCount = Mathf.Max(0, preferredMinEmptyBottleCount);
            preferredMaxEmptyBottleCount = Mathf.Max(preferredMinEmptyBottleCount, preferredMaxEmptyBottleCount);
            duplicateColorBottleChance = Mathf.Clamp01(duplicateColorBottleChance);
            maxDuplicateBottleTargetsPerColor = Mathf.Max(1, maxDuplicateBottleTargetsPerColor);
            maxBottleCount = Mathf.Clamp(maxBottleCount, 1, 40);
            diverseOpeningSolutionChance = Mathf.Clamp01(diverseOpeningSolutionChance);
            diverseOpeningMoveWindow = Mathf.Max(1, diverseOpeningMoveWindow);
            diverseOpeningMinDistinctSourceBottles = Mathf.Max(1, diverseOpeningMinDistinctSourceBottles);
            diverseOpeningMinStoredSolutions = Mathf.Max(1, diverseOpeningMinStoredSolutions);
            selectionPolicy = string.IsNullOrWhiteSpace(selectionPolicy)
                ? "shortest_non_loop_empty_priority_opening_diversity_soft"
                : selectionPolicy.Trim();

            foreach (DifficultyProfile profile in difficultyProfiles)
            {
                profile?.Validate();
            }
        }

        [ContextMenu("Upgrade Difficulty Profiles")]
        private void UpgradeDifficultyProfilesIfNeeded()
        {
            if (difficultyProfiles.Count == 0 && difficultyBands.Count > 0)
            {
                MigrateLegacyBandsToProfiles();
            }

            bool needsUpgrade = schemaVersion < CurrentSchemaVersion || MissingRequiredProfiles() || HasDuplicateProfiles() || !ProfilesAreInRequiredOrder();
            if (!needsUpgrade)
            {
                return;
            }

            EnsureProfileIds();
            DifficultyProfile hardTemplate = FindProfile(DifficultyProfileId.Hard)
                ?? FindProfileByName("Hard")
                ?? (difficultyProfiles.Count > 0 ? difficultyProfiles[^1] : null);
            AddProfileIfMissing(DifficultyProfileId.Easy, "Easy", hardTemplate);
            AddProfileIfMissing(DifficultyProfileId.Normal, "Normal", hardTemplate);
            AddProfileIfMissing(DifficultyProfileId.Hard, "Hard", hardTemplate);
            AddProfileIfMissing(DifficultyProfileId.VeryHard, "VeryHard", hardTemplate);
            AddProfileIfMissing(DifficultyProfileId.Special, "Special", hardTemplate);
            RemoveDuplicateProfiles();
            OrderProfiles();
            schemaVersion = CurrentSchemaVersion;
        }

        private bool MissingRequiredProfiles()
        {
            return FindProfile(DifficultyProfileId.Easy) == null
                || FindProfile(DifficultyProfileId.Normal) == null
                || FindProfile(DifficultyProfileId.Hard) == null
                || FindProfile(DifficultyProfileId.VeryHard) == null
                || FindProfile(DifficultyProfileId.Special) == null;
        }

        private bool HasDuplicateProfiles()
        {
            HashSet<DifficultyProfileId> ids = new();
            foreach (DifficultyProfile profile in difficultyProfiles)
            {
                if (profile == null)
                {
                    continue;
                }

                DifficultyProfileId id = profile.ProfileId;
                if (id == DifficultyProfileId.Unknown)
                {
                    id = DifficultyProfile.IdFromName(profile.Name);
                }

                if (id != DifficultyProfileId.Unknown && !ids.Add(id))
                {
                    return true;
                }
            }

            return false;
        }

        private bool ProfilesAreInRequiredOrder()
        {
            DifficultyProfileId[] required =
            {
                DifficultyProfileId.Easy,
                DifficultyProfileId.Normal,
                DifficultyProfileId.Hard,
                DifficultyProfileId.VeryHard,
                DifficultyProfileId.Special
            };

            if (difficultyProfiles.Count != required.Length)
            {
                return false;
            }

            for (int i = 0; i < required.Length; i++)
            {
                if (difficultyProfiles[i] == null || difficultyProfiles[i].ResolvedProfileId != required[i])
                {
                    return false;
                }
            }

            return true;
        }

        private void EnsureProfileIds()
        {
            foreach (DifficultyProfile profile in difficultyProfiles)
            {
                profile?.EnsureProfileIdFromName();
            }
        }

        private DifficultyProfile FindProfile(DifficultyProfileId profileId)
        {
            foreach (DifficultyProfile profile in difficultyProfiles)
            {
                if (profile?.ResolvedProfileId == profileId)
                {
                    return profile;
                }
            }

            return null;
        }

        private DifficultyProfile FindProfileByName(string profileName)
        {
            foreach (DifficultyProfile profile in difficultyProfiles)
            {
                if (profile != null && string.Equals(profile.Name, profileName, StringComparison.OrdinalIgnoreCase))
                {
                    return profile;
                }
            }

            return null;
        }

        private void AddProfileIfMissing(DifficultyProfileId profileId, string profileName, DifficultyProfile hardTemplate)
        {
            DifficultyProfile existing = FindProfile(profileId) ?? FindProfileByName(profileName);
            if (existing != null)
            {
                existing.SetIdentity(profileId, profileName);
                return;
            }

            DifficultyProfile created = DifficultyProfile.CreateFromTemplate(profileId, profileName, hardTemplate);
            difficultyProfiles.Add(created);
        }

        private void RemoveDuplicateProfiles()
        {
            HashSet<DifficultyProfileId> seen = new();
            for (int i = 0; i < difficultyProfiles.Count; i++)
            {
                DifficultyProfile profile = difficultyProfiles[i];
                if (profile == null)
                {
                    difficultyProfiles.RemoveAt(i);
                    i--;
                    continue;
                }

                DifficultyProfileId id = profile.ResolvedProfileId;
                if (id == DifficultyProfileId.Unknown || !seen.Add(id))
                {
                    difficultyProfiles.RemoveAt(i);
                    i--;
                }
            }
        }

        private void OrderProfiles()
        {
            DifficultyProfileId[] required =
            {
                DifficultyProfileId.Easy,
                DifficultyProfileId.Normal,
                DifficultyProfileId.Hard,
                DifficultyProfileId.VeryHard,
                DifficultyProfileId.Special
            };

            List<DifficultyProfile> ordered = new();
            foreach (DifficultyProfileId profileId in required)
            {
                DifficultyProfile profile = FindProfile(profileId);
                if (profile != null)
                {
                    ordered.Add(profile);
                }
            }

            difficultyProfiles.Clear();
            difficultyProfiles.AddRange(ordered);
        }

        public enum DifficultyProfileId
        {
            Unknown = 0,
            Easy = 1,
            Normal = 2,
            Hard = 3,
            VeryHard = 4,
            Special = 5
        }

        [Serializable]
        public class DifficultyProfile
        {
            [SerializeField] private DifficultyProfileId profileId = DifficultyProfileId.Unknown;
            [SerializeField] private string name;
            [SerializeField] private bool enabled = true;
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
            [SerializeField] private bool allowColorLockedBottleMode;
            [SerializeField, Range(0f, 1f)] private float colorLockedBottleChance;
            [SerializeField] private int minColorLockedBottleCount = 1;
            [SerializeField] private int maxColorLockedBottleCount = 4;
            [SerializeField] private int minCompletedColorBottleCountToUnlock = 1;
            [SerializeField] private int maxCompletedColorBottleCountToUnlock = 3;
            [SerializeField] private bool allowMegaBottleMode;
            [SerializeField, Range(0f, 1f)] private float megaBottleChance;
            [SerializeField] private int minMegaBottleCapacity = 12;
            [SerializeField] private int maxMegaBottleCapacity = 20;
            [SerializeField] private int megaCandidateAttemptCount = 48;
            [SerializeField] private int minMegaActiveBottleCount = 14;
            [SerializeField] private int maxMegaActiveBottleCount = 30;
            [SerializeField] private int minMegaBlockerColorCount = 6;
            [SerializeField] private int maxMegaBlockerColorCount = 9;
            [SerializeField] private int minMegaNormalHelperCount = 1;
            [SerializeField] private int maxMegaNormalHelperCount = 2;
            [SerializeField] private int maxMegaTargetGroupSize = 2;
            [SerializeField, Range(0f, 1f)] private float minMegaBuriedTargetRatio = 0.85f;
            [SerializeField, Range(0f, 1f)] private float minMegaDeepBuriedTargetRatio = 0.35f;
            [SerializeField] private int minMegaUniqueTopColorCount = 4;
            [SerializeField, Range(0f, 1f)] private float maxMegaTopColorShare = 0.25f;
            [SerializeField, Range(0f, 1f)] private float minMegaUniqueBottlePatternRatio = 1f;
            [SerializeField] private int minMegaMovesBeforeFirstFill = 3;
            [SerializeField] private int minMegaCrossBottleBlockerMoves = 3;
            [SerializeField, Range(0f, 1f)] private float minMegaNonMegaMoveRatio = 0.4f;
            [SerializeField] private int maxMegaConsecutiveFillMoves = 3;
            [SerializeField] private int megaSolverMaxStates = 60000;
            [SerializeField] private int megaSolverMaxDepth = 160;
            [SerializeField, Range(0f, 1f)] private float minMegaActiveFillRatio = 0.5f;
            [SerializeField, Range(0f, 1f)] private float targetMegaActiveFillRatio = 0.85f;
            [SerializeField, Range(0f, 1f)] private float maxMegaActiveFreeRatio = 0.2f;
            [SerializeField, Range(0f, 1f)] private float maxMegaSparseBottleRatio = 0.15f;
            [SerializeField] private int maxMegaSingleLayerBottleCount = 0;
            [SerializeField, Range(0f, 1f)] private float megaFreeCapacityConcentrationRatio = 0.65f;
            [SerializeField] private int minTargetBottleCount = 0;
            [SerializeField] private int maxTargetBottleCount = 0;
            [SerializeField] private int minShortestStepCount = 1;
            [SerializeField] private int maxShortestStepCount = 1;
            [SerializeField] private int maxSolutionCount = 1000;
            [SerializeField] private int storedSolutionTarget = 1;
            [SerializeField] private bool allowSmallIntroLevel;
            [SerializeField] private bool allowSpecialNearWin;
            [SerializeField] private NearWinOptions nearWin = new();
            [SerializeField] private int minNormalHelperCount = 1;
            [SerializeField] private int maxNormalHelperCount = 2;

            [SerializeField, Range(0f, 1f)]
            private float minActiveFillRatio = 0.7f;

            [SerializeField, Range(0f, 1f)]
            private float targetActiveFillRatio = 0.85f;

            [SerializeField, Range(0f, 1f)]
            private float maxStartingFreeRatio = 0.25f;

            [SerializeField] private int minPartialBottleCount = 0;

            [SerializeField, Range(0f, 1f)]
            private float maxSafeMoveRatio = 1f;

            [SerializeField, Range(0f, 1f)]
            private float minDeadEndPotential = 0f;

            [SerializeField, Range(0f, 1f)]
            private float minTrapLikelihood = 0f;

            [SerializeField] private float minAverageBranchingFactor = 0f;

            [SerializeField] private int minCriticalDecisionCount = 0;

            public DifficultyProfileId ProfileId => profileId;
            public DifficultyProfileId ResolvedProfileId => profileId == DifficultyProfileId.Unknown ? IdFromName(name) : profileId;
            public string Name => name;
            public bool Enabled => enabled;
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
            public bool AllowColorLockedBottleMode => allowColorLockedBottleMode;
            public float ColorLockedBottleChance => colorLockedBottleChance;
            public int MinColorLockedBottleCount => minColorLockedBottleCount;
            public int MaxColorLockedBottleCount => maxColorLockedBottleCount;
            public int MinCompletedColorBottleCountToUnlock => minCompletedColorBottleCountToUnlock;
            public int MaxCompletedColorBottleCountToUnlock => maxCompletedColorBottleCountToUnlock;
            public bool AllowMegaBottleMode => allowMegaBottleMode;
            public float MegaBottleChance => megaBottleChance;
            public int MinMegaBottleCapacity => minMegaBottleCapacity;
            public int MaxMegaBottleCapacity => maxMegaBottleCapacity;
            public int MegaCandidateAttemptCount => megaCandidateAttemptCount;
            public int MinMegaActiveBottleCount => minMegaActiveBottleCount;
            public int MaxMegaActiveBottleCount => maxMegaActiveBottleCount;
            public int MinMegaBlockerColorCount => minMegaBlockerColorCount;
            public int MaxMegaBlockerColorCount => maxMegaBlockerColorCount;
            public int MinMegaNormalHelperCount => minMegaNormalHelperCount;
            public int MaxMegaNormalHelperCount => maxMegaNormalHelperCount;
            public int MaxMegaTargetGroupSize => maxMegaTargetGroupSize;
            public float MinMegaBuriedTargetRatio => minMegaBuriedTargetRatio;
            public float MinMegaDeepBuriedTargetRatio => minMegaDeepBuriedTargetRatio;
            public int MinMegaUniqueTopColorCount => minMegaUniqueTopColorCount;
            public float MaxMegaTopColorShare => maxMegaTopColorShare;
            public float MinMegaUniqueBottlePatternRatio => minMegaUniqueBottlePatternRatio;
            public int MinMegaMovesBeforeFirstFill => minMegaMovesBeforeFirstFill;
            public int MinMegaCrossBottleBlockerMoves => minMegaCrossBottleBlockerMoves;
            public float MinMegaNonMegaMoveRatio => minMegaNonMegaMoveRatio;
            public int MaxMegaConsecutiveFillMoves => maxMegaConsecutiveFillMoves;
            public int MegaSolverMaxStates => megaSolverMaxStates;
            public int MegaSolverMaxDepth => megaSolverMaxDepth;
            public float MinMegaActiveFillRatio => minMegaActiveFillRatio;
            public float TargetMegaActiveFillRatio => targetMegaActiveFillRatio;
            public float MaxMegaActiveFreeRatio => maxMegaActiveFreeRatio;
            public float MaxMegaSparseBottleRatio => maxMegaSparseBottleRatio;
            public int MaxMegaSingleLayerBottleCount => maxMegaSingleLayerBottleCount;
            public float MegaFreeCapacityConcentrationRatio => megaFreeCapacityConcentrationRatio;
            public int MinTargetBottleCount => minTargetBottleCount;
            public int MaxTargetBottleCount => maxTargetBottleCount;
            public int MinShortestStepCount => minShortestStepCount;
            public int MaxShortestStepCount => maxShortestStepCount;
            public int MaxSolutionCount => maxSolutionCount;
            public int StoredSolutionTarget => storedSolutionTarget;
            public bool AllowSmallIntroLevel => allowSmallIntroLevel;
            public bool AllowSpecialNearWin => allowSpecialNearWin;
            public int MinNormalHelperCount => minNormalHelperCount;
            public int MaxNormalHelperCount => maxNormalHelperCount;
            public float MinActiveFillRatio => minActiveFillRatio;
            public float TargetActiveFillRatio => targetActiveFillRatio;
            public float MaxStartingFreeRatio => maxStartingFreeRatio;
            public int MinPartialBottleCount => minPartialBottleCount;
            public float MaxSafeMoveRatio => maxSafeMoveRatio;
            public float MinDeadEndPotential => minDeadEndPotential;
            public float MinTrapLikelihood => minTrapLikelihood;
            public float MinAverageBranchingFactor => minAverageBranchingFactor;
            public int MinCriticalDecisionCount => minCriticalDecisionCount;
            public NearWinOptions NearWin => nearWin;

            internal void Validate()
            {
                name = string.IsNullOrWhiteSpace(name) ? "Normal" : name.Trim();
                EnsureProfileIdFromName();
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
                colorLockedBottleChance = allowColorLockedBottleMode ? Mathf.Clamp01(colorLockedBottleChance) : 0f;
                minColorLockedBottleCount = Mathf.Clamp(minColorLockedBottleCount, 1, 4);
                maxColorLockedBottleCount = Mathf.Clamp(maxColorLockedBottleCount, minColorLockedBottleCount, 4);
                minCompletedColorBottleCountToUnlock = Mathf.Max(1, minCompletedColorBottleCountToUnlock);
                maxCompletedColorBottleCountToUnlock = Mathf.Max(minCompletedColorBottleCountToUnlock, maxCompletedColorBottleCountToUnlock);
                megaBottleChance = allowMegaBottleMode ? Mathf.Clamp01(megaBottleChance) : 0f;
                minMegaBottleCapacity = Mathf.Clamp(minMegaBottleCapacity, 12, 20);
                maxMegaBottleCapacity = Mathf.Clamp(maxMegaBottleCapacity, minMegaBottleCapacity, 20);
                megaCandidateAttemptCount = Mathf.Clamp(megaCandidateAttemptCount, 1, 256);
                minMegaActiveBottleCount = Mathf.Clamp(minMegaActiveBottleCount, 1, 40);
                maxMegaActiveBottleCount = Mathf.Clamp(maxMegaActiveBottleCount, minMegaActiveBottleCount, 40);
                minMegaBlockerColorCount = Mathf.Clamp(minMegaBlockerColorCount, 1, 12);
                maxMegaBlockerColorCount = Mathf.Clamp(maxMegaBlockerColorCount, minMegaBlockerColorCount, 12);
                minMegaNormalHelperCount =
                    Mathf.Clamp(minMegaNormalHelperCount, 0, 3);
                maxMegaNormalHelperCount = Mathf.Clamp(maxMegaNormalHelperCount, minMegaNormalHelperCount, 3);
                maxMegaTargetGroupSize = Mathf.Clamp(maxMegaTargetGroupSize, 1, 3);
                minMegaBuriedTargetRatio = Mathf.Clamp01(minMegaBuriedTargetRatio);
                minMegaDeepBuriedTargetRatio = Mathf.Clamp01(minMegaDeepBuriedTargetRatio);
                minMegaUniqueTopColorCount = Mathf.Clamp(minMegaUniqueTopColorCount, 1, 12);
                maxMegaTopColorShare = Mathf.Clamp01(maxMegaTopColorShare);
                minMegaUniqueBottlePatternRatio = Mathf.Clamp01(minMegaUniqueBottlePatternRatio);
                minMegaMovesBeforeFirstFill = Mathf.Max(0, minMegaMovesBeforeFirstFill);
                minMegaCrossBottleBlockerMoves = Mathf.Max(0, minMegaCrossBottleBlockerMoves);
                minMegaNonMegaMoveRatio = Mathf.Clamp01(minMegaNonMegaMoveRatio);
                maxMegaConsecutiveFillMoves = Mathf.Max(1, maxMegaConsecutiveFillMoves);
                megaSolverMaxStates = Mathf.Max(1000, megaSolverMaxStates);
                megaSolverMaxDepth = Mathf.Max(1, megaSolverMaxDepth);
                minMegaActiveFillRatio = Mathf.Clamp01(minMegaActiveFillRatio);
                targetMegaActiveFillRatio = Mathf.Clamp(targetMegaActiveFillRatio, minMegaActiveFillRatio, 1f);
                maxMegaActiveFreeRatio = Mathf.Clamp01(maxMegaActiveFreeRatio);
                maxMegaSparseBottleRatio = Mathf.Clamp01(maxMegaSparseBottleRatio);
                maxMegaSingleLayerBottleCount = Mathf.Max(0, maxMegaSingleLayerBottleCount);
                megaFreeCapacityConcentrationRatio = Mathf.Clamp01(megaFreeCapacityConcentrationRatio);
                minTargetBottleCount = Mathf.Max(0, minTargetBottleCount);
                maxTargetBottleCount = Mathf.Clamp(maxTargetBottleCount, minTargetBottleCount, 40);
                minShortestStepCount = Mathf.Max(0, minShortestStepCount);
                maxShortestStepCount = Mathf.Max(minShortestStepCount, maxShortestStepCount);
                maxSolutionCount = Mathf.Max(1, maxSolutionCount);
                storedSolutionTarget = Mathf.Clamp(storedSolutionTarget, 1, 8);
                nearWin ??= new NearWinOptions();
                nearWin.Validate();
                minNormalHelperCount = Mathf.Clamp(minNormalHelperCount, 0, 4);
                maxNormalHelperCount =
                    Mathf.Clamp(maxNormalHelperCount, minNormalHelperCount, 4);

                minActiveFillRatio = Mathf.Clamp01(minActiveFillRatio);
                targetActiveFillRatio =
                    Mathf.Clamp(targetActiveFillRatio, minActiveFillRatio, 1f);

                maxStartingFreeRatio = Mathf.Clamp01(maxStartingFreeRatio);
                minPartialBottleCount = Mathf.Max(0, minPartialBottleCount);

                maxSafeMoveRatio = Mathf.Clamp01(maxSafeMoveRatio);
                minDeadEndPotential = Mathf.Clamp01(minDeadEndPotential);
                minTrapLikelihood = Mathf.Clamp01(minTrapLikelihood);
                minAverageBranchingFactor = Mathf.Max(0f, minAverageBranchingFactor);
                minCriticalDecisionCount = Mathf.Max(0, minCriticalDecisionCount);

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

            internal void EnsureProfileIdFromName()
            {
                if (profileId == DifficultyProfileId.Unknown)
                {
                    profileId = IdFromName(name);
                }
            }

            internal void SetIdentity(DifficultyProfileId id, string profileName)
            {
                profileId = id;
                name = profileName;
            }

            internal static DifficultyProfileId IdFromName(string profileName)
            {
                string normalized = string.IsNullOrWhiteSpace(profileName)
                    ? string.Empty
                    : profileName.Trim().Replace(" ", string.Empty).Replace("_", string.Empty).ToLowerInvariant();
                return normalized switch
                {
                    "easy" => DifficultyProfileId.Easy,
                    "normal" => DifficultyProfileId.Normal,
                    "hard" => DifficultyProfileId.Hard,
                    "veryhard" => DifficultyProfileId.VeryHard,
                    "special" => DifficultyProfileId.Special,
                    _ => DifficultyProfileId.Unknown
                };
            }

            internal static DifficultyProfile CreateFromTemplate(DifficultyProfileId id, string profileName, DifficultyProfile template)
            {
                DifficultyProfile profile = template == null ? new DifficultyProfile() : template.Clone();
                profile.SetIdentity(id, profileName);
                profile.ApplyDefaultsForProfile(id);
                profile.Validate();
                return profile;
            }

            private DifficultyProfile Clone()
            {
                DifficultyProfile clone = new()
                {
                    profileId = profileId,
                    name = name,
                    enabled = enabled,
                    targetDifficultyScoreMin = targetDifficultyScoreMin,
                    targetDifficultyScoreMax = targetDifficultyScoreMax,
                    colorWeights = CloneList(colorWeights, item => item.Clone()),
                    helperCapacityWeights = CloneList(helperCapacityWeights, item => item.Clone()),
                    bottleCapacityWeights = CloneList(bottleCapacityWeights, item => item.Clone()),
                    gridShapeWeights = CloneList(gridShapeWeights, item => item.Clone()),
                    allowHiddenStackMode = allowHiddenStackMode,
                    hiddenStackChance = hiddenStackChance,
                    allowHybridHiddenStackMode = allowHybridHiddenStackMode,
                    hybridHiddenStackChance = hybridHiddenStackChance,
                    hybridHiddenBottleChance = hybridHiddenBottleChance,
                    minHybridHiddenLayersPerBottle = minHybridHiddenLayersPerBottle,
                    maxHybridHiddenLayersPerBottle = maxHybridHiddenLayersPerBottle,
                    allowLockedBottleMode = allowLockedBottleMode,
                    lockedBottleChance = lockedBottleChance,
                    minLockedBottleCount = minLockedBottleCount,
                    maxLockedBottleCount = maxLockedBottleCount,
                    minCompletedBottleCountToUnlock = minCompletedBottleCountToUnlock,
                    maxCompletedBottleCountToUnlock = maxCompletedBottleCountToUnlock,
                    allowColorLockedBottleMode = allowColorLockedBottleMode,
                    colorLockedBottleChance = colorLockedBottleChance,
                    minColorLockedBottleCount = minColorLockedBottleCount,
                    maxColorLockedBottleCount = maxColorLockedBottleCount,
                    minCompletedColorBottleCountToUnlock = minCompletedColorBottleCountToUnlock,
                    maxCompletedColorBottleCountToUnlock = maxCompletedColorBottleCountToUnlock,
                    allowMegaBottleMode = allowMegaBottleMode,
                    megaBottleChance = megaBottleChance,
                    minMegaBottleCapacity = minMegaBottleCapacity,
                    maxMegaBottleCapacity = maxMegaBottleCapacity,
                    megaCandidateAttemptCount = megaCandidateAttemptCount,
                    minMegaActiveBottleCount = minMegaActiveBottleCount,
                    maxMegaActiveBottleCount = maxMegaActiveBottleCount,
                    minMegaBlockerColorCount = minMegaBlockerColorCount,
                    maxMegaBlockerColorCount = maxMegaBlockerColorCount,
                    minMegaNormalHelperCount = minMegaNormalHelperCount,
                    maxMegaNormalHelperCount = maxMegaNormalHelperCount,
                    maxMegaTargetGroupSize = maxMegaTargetGroupSize,
                    minMegaBuriedTargetRatio = minMegaBuriedTargetRatio,
                    minMegaDeepBuriedTargetRatio = minMegaDeepBuriedTargetRatio,
                    minMegaUniqueTopColorCount = minMegaUniqueTopColorCount,
                    maxMegaTopColorShare = maxMegaTopColorShare,
                    minMegaUniqueBottlePatternRatio = minMegaUniqueBottlePatternRatio,
                    minMegaMovesBeforeFirstFill = minMegaMovesBeforeFirstFill,
                    minMegaCrossBottleBlockerMoves = minMegaCrossBottleBlockerMoves,
                    minMegaNonMegaMoveRatio = minMegaNonMegaMoveRatio,
                    maxMegaConsecutiveFillMoves = maxMegaConsecutiveFillMoves,
                    megaSolverMaxStates = megaSolverMaxStates,
                    megaSolverMaxDepth = megaSolverMaxDepth,
                    minMegaActiveFillRatio = minMegaActiveFillRatio,
                    targetMegaActiveFillRatio = targetMegaActiveFillRatio,
                    maxMegaActiveFreeRatio = maxMegaActiveFreeRatio,
                    maxMegaSparseBottleRatio = maxMegaSparseBottleRatio,
                    maxMegaSingleLayerBottleCount = maxMegaSingleLayerBottleCount,
                    megaFreeCapacityConcentrationRatio = megaFreeCapacityConcentrationRatio,
                    minTargetBottleCount = minTargetBottleCount,
                    maxTargetBottleCount = maxTargetBottleCount,
                    minShortestStepCount = minShortestStepCount,
                    maxShortestStepCount = maxShortestStepCount,
                    maxSolutionCount = maxSolutionCount,
                    storedSolutionTarget = storedSolutionTarget,
                    allowSmallIntroLevel = allowSmallIntroLevel,
                    allowSpecialNearWin = allowSpecialNearWin,
                    nearWin = nearWin?.Clone() ?? new NearWinOptions(),
                    minNormalHelperCount = minNormalHelperCount,
                    maxNormalHelperCount = maxNormalHelperCount,
                    minActiveFillRatio = minActiveFillRatio,
                    targetActiveFillRatio = targetActiveFillRatio,
                    maxStartingFreeRatio = maxStartingFreeRatio,
                    minPartialBottleCount = minPartialBottleCount,
                    maxSafeMoveRatio = maxSafeMoveRatio,
                    minDeadEndPotential = minDeadEndPotential,
                    minTrapLikelihood = minTrapLikelihood,
                    minAverageBranchingFactor = minAverageBranchingFactor,
                    minCriticalDecisionCount = minCriticalDecisionCount
                };
                return clone;
            }

            private static List<T> CloneList<T>(IEnumerable<T> source, Func<T, T> cloneItem)
            {
                List<T> clone = new();
                if (source == null)
                {
                    return clone;
                }

                foreach (T item in source)
                {
                    if (item != null)
                    {
                        clone.Add(cloneItem(item));
                    }
                }

                return clone;
            }

            private void ApplyDefaultsForProfile(DifficultyProfileId id)
            {
                if (id == DifficultyProfileId.VeryHard)
                {
                    targetDifficultyScoreMin = Mathf.Max(targetDifficultyScoreMin, 0.72f);
                    targetDifficultyScoreMax = Mathf.Max(targetDifficultyScoreMax, 0.92f);
                    minShortestStepCount = Mathf.Max(minShortestStepCount, 44);
                    maxShortestStepCount = Mathf.Max(maxShortestStepCount, 120);
                    minTargetBottleCount = Mathf.Max(minTargetBottleCount, 12);
                    maxTargetBottleCount = Mathf.Max(maxTargetBottleCount, minTargetBottleCount);
                    minMegaDeepBuriedTargetRatio = Mathf.Max(minMegaDeepBuriedTargetRatio, 0.5f);
                    targetMegaActiveFillRatio = Mathf.Max(targetMegaActiveFillRatio, 0.9f);
                    maxMegaActiveFreeRatio = Mathf.Min(maxMegaActiveFreeRatio, 0.15f);
                    maxMegaSparseBottleRatio = Mathf.Min(maxMegaSparseBottleRatio, 0.1f);
                    minMegaCrossBottleBlockerMoves = Mathf.Max(minMegaCrossBottleBlockerMoves, 4);
                    ReduceLargestHelperCapacityWeight();
                    return;
                }

                if (id == DifficultyProfileId.Special)
                {
                    targetDifficultyScoreMin = 0.75f;
                    targetDifficultyScoreMax = 1f;

                    minShortestStepCount = Mathf.Clamp(minShortestStepCount, 16, 80);
                    maxShortestStepCount = Mathf.Clamp(maxShortestStepCount, minShortestStepCount, 80);

                    allowHiddenStackMode = false;
                    allowHybridHiddenStackMode = false;
                    allowLockedBottleMode = false;
                    allowColorLockedBottleMode = false;
                    allowMegaBottleMode = false;

                    hiddenStackChance = 0f;
                    hybridHiddenStackChance = 0f;
                    lockedBottleChance = 0f;
                    megaBottleChance = 0f;

                    allowSpecialNearWin = true;

                    nearWin ??= new NearWinOptions();
                    nearWin.ApplySpecialDefaults();

                    minNormalHelperCount = 0;
                    maxNormalHelperCount = 1;
                    minActiveFillRatio = 0.75f;
                    targetActiveFillRatio = 0.88f;
                    maxStartingFreeRatio = 0.22f;
                    minPartialBottleCount = 2;
                    maxSafeMoveRatio = 0.45f;
                    minDeadEndPotential = 0.2f;
                    minTrapLikelihood = 0.25f;
                    minAverageBranchingFactor = 2f;
                    minCriticalDecisionCount = 1;
                }
            }

            private void ReduceLargestHelperCapacityWeight()
            {
                HelperCapacityWeight largest = null;
                foreach (HelperCapacityWeight weight in helperCapacityWeights)
                {
                    if (largest == null || weight.HelperCapacity > largest.HelperCapacity)
                    {
                        largest = weight;
                    }
                }

                largest?.SetWeight(0);
            }
        }

        [Serializable]
        public sealed class DifficultyBand : DifficultyProfile
        {
            [SerializeField] private int levelCount = 1;

            public int LevelCount => levelCount;
        }

        [Serializable]
        public sealed class NearWinOptions
        {
            [SerializeField, Range(0f, 1f)] private float minNearWinScore = 0.55f;
            [SerializeField, Range(0f, 1f)] private float minCriticalDepthRatio = 0.4f;
            [SerializeField, Range(0f, 1f)] private float maxCriticalDepthRatio = 0.85f;
            [SerializeField] private int maxCriticalStates = 24;
            [SerializeField] private int maxTrapCandidates = 24;
            [SerializeField] private int trapSolverMaxStates = 100000;
            [SerializeField] private int trapSolverMaxDepth = 140;
            [SerializeField] private int minSoftTrapRecoveryPenalty = 2;
            [SerializeField] private float minSoftTrapRecoveryRatio = 1.1f;
            [SerializeField, Range(0f, 1f)] private float softTrapWeight = 0.55f;
            [SerializeField, Range(0f, 1f)] private float strongTrapWeight = 0.35f;
            [SerializeField, Range(0f, 1f)] private float hardDeadlockWeight = 0.1f;
            [SerializeField] private bool allowAddBottleRescue = true;
            [SerializeField] private bool allowShuffleRescue = true;
            [SerializeField] private int shuffleCandidateCount = 24;
            [SerializeField] private int minShuffleRemainingSteps = 2;

            public float MinNearWinScore => minNearWinScore;
            public float MinCriticalDepthRatio => minCriticalDepthRatio;
            public float MaxCriticalDepthRatio => maxCriticalDepthRatio;
            public int MaxCriticalStates => maxCriticalStates;
            public int MaxTrapCandidates => maxTrapCandidates;
            public int TrapSolverMaxStates => trapSolverMaxStates;
            public int TrapSolverMaxDepth => trapSolverMaxDepth;
            public int MinSoftTrapRecoveryPenalty => minSoftTrapRecoveryPenalty;
            public float MinSoftTrapRecoveryRatio => minSoftTrapRecoveryRatio;
            public float SoftTrapWeight => softTrapWeight;
            public float StrongTrapWeight => strongTrapWeight;
            public float HardDeadlockWeight => hardDeadlockWeight;
            public bool AllowAddBottleRescue => allowAddBottleRescue;
            public bool AllowShuffleRescue => allowShuffleRescue;
            public int ShuffleCandidateCount => shuffleCandidateCount;
            public int MinShuffleRemainingSteps => minShuffleRemainingSteps;

            internal NearWinOptions Clone()
            {
                return new NearWinOptions
                {
                    minNearWinScore = minNearWinScore,
                    minCriticalDepthRatio = minCriticalDepthRatio,
                    maxCriticalDepthRatio = maxCriticalDepthRatio,
                    maxCriticalStates = maxCriticalStates,
                    maxTrapCandidates = maxTrapCandidates,
                    trapSolverMaxStates = trapSolverMaxStates,
                    trapSolverMaxDepth = trapSolverMaxDepth,
                    minSoftTrapRecoveryPenalty = minSoftTrapRecoveryPenalty,
                    minSoftTrapRecoveryRatio = minSoftTrapRecoveryRatio,
                    softTrapWeight = softTrapWeight,
                    strongTrapWeight = strongTrapWeight,
                    hardDeadlockWeight = hardDeadlockWeight,
                    allowAddBottleRescue = allowAddBottleRescue,
                    allowShuffleRescue = allowShuffleRescue,
                    shuffleCandidateCount = shuffleCandidateCount,
                    minShuffleRemainingSteps = minShuffleRemainingSteps
                };
            }

            internal void ApplySpecialDefaults()
            {
                minNearWinScore = 0.55f;
                minCriticalDepthRatio = 0.4f;
                maxCriticalDepthRatio = 0.99f;
                maxTrapCandidates = 128;
                trapSolverMaxStates = 100000;
                trapSolverMaxDepth = 180;
                minSoftTrapRecoveryPenalty = 2;
                minSoftTrapRecoveryRatio = 1.15f;
                softTrapWeight = 0.4f;
                strongTrapWeight = 0.4f;
                hardDeadlockWeight = 0.2f;
                allowAddBottleRescue = true;
                allowShuffleRescue = true;
                shuffleCandidateCount = 24;
                minShuffleRemainingSteps = 2;
            }

            internal void Validate()
            {
                minNearWinScore = Mathf.Clamp01(minNearWinScore);
                minCriticalDepthRatio = Mathf.Clamp01(minCriticalDepthRatio);
                maxCriticalDepthRatio = Mathf.Clamp(maxCriticalDepthRatio, minCriticalDepthRatio, 1f);
                maxCriticalStates = Mathf.Clamp(maxCriticalStates, 1, 256);
                maxTrapCandidates = Mathf.Clamp(maxTrapCandidates, 1, 256);
                trapSolverMaxStates = Mathf.Max(1000, trapSolverMaxStates);
                trapSolverMaxDepth = Mathf.Max(1, trapSolverMaxDepth);
                minSoftTrapRecoveryPenalty = Mathf.Max(1, minSoftTrapRecoveryPenalty);
                minSoftTrapRecoveryRatio = Mathf.Max(1f, minSoftTrapRecoveryRatio);
                softTrapWeight = Mathf.Clamp01(softTrapWeight);
                strongTrapWeight = Mathf.Clamp01(strongTrapWeight);
                hardDeadlockWeight = Mathf.Clamp01(hardDeadlockWeight);
                shuffleCandidateCount = Mathf.Clamp(shuffleCandidateCount, 1, 256);
                minShuffleRemainingSteps = Mathf.Max(1, minShuffleRemainingSteps);
            }
        }

        private void MigrateLegacyBandsToProfiles()
        {
            difficultyProfiles.AddRange(difficultyBands);
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

            internal ColorWeight Clone()
            {
                return new ColorWeight
                {
                    colorCount = colorCount,
                    weight = weight
                };
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

            internal void SetWeight(int value)
            {
                weight = Mathf.Max(0, value);
            }

            internal HelperCapacityWeight Clone()
            {
                return new HelperCapacityWeight
                {
                    helperCapacity = helperCapacity,
                    weight = weight
                };
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

            internal BottleCapacityWeight Clone()
            {
                return new BottleCapacityWeight
                {
                    capacity = capacity,
                    weight = weight
                };
            }
        }

        [Serializable]
        public sealed class GridShapeWeight
        {
            [SerializeField] private string shape = "circle";
            [SerializeField] private int weight = 1;
            [SerializeField] private int minBottleCount = 1;
            [SerializeField] private int maxBottleCount = 40;

            public string Shape => shape;
            public int Weight => weight;
            public int MinBottleCount => minBottleCount;
            public int MaxBottleCount => maxBottleCount;

            internal void Validate()
            {
                shape = string.IsNullOrWhiteSpace(shape) ? "circle" : shape.Trim();
                weight = Mathf.Max(0, weight);
                minBottleCount = Mathf.Clamp(minBottleCount, 1, 40);
                maxBottleCount = Mathf.Clamp(maxBottleCount, minBottleCount, 40);
            }

            internal GridShapeWeight Clone()
            {
                return new GridShapeWeight
                {
                    shape = shape,
                    weight = weight,
                    minBottleCount = minBottleCount,
                    maxBottleCount = maxBottleCount
                };
            }
        }
    }
}
