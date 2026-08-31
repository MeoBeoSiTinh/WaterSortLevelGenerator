using System;
using System.Collections.Generic;
using TrainWaterSort.ScriptableObject.WaterSort;
using UnityEngine;

namespace TrainWaterSort.Gameplay.WaterSort
{
    public sealed class WaterSortJsonCatalog
    {
        private readonly List<WaterSortJsonLevel> levels = new();

        public WaterSortColorPalette ColorPalette { get; private set; }
        public IReadOnlyList<WaterSortJsonLevel> Levels => levels;

        public static WaterSortJsonCatalog LoadFromResources(string levelResourcesFolder, string solutionResourcesFolder, WaterSortColorPalette colorPalette)
        {
            WaterSortJsonCatalog catalog = new()
            {
                ColorPalette = colorPalette
            };
            catalog.LoadLevels(levelResourcesFolder);
            catalog.LoadSolutions(solutionResourcesFolder);
            return catalog;
        }

        private void LoadLevels(string resourcesFolder)
        {
            TextAsset[] jsonFiles = Resources.LoadAll<TextAsset>(resourcesFolder);
            Array.Sort(jsonFiles, (left, right) => string.CompareOrdinal(left.name, right.name));

            foreach (TextAsset jsonFile in jsonFiles)
            {
                WaterSortJsonPack pack = JsonUtility.FromJson<WaterSortJsonPack>(jsonFile.text);
                if (pack == null)
                {
                    continue;
                }

                if (pack.levels != null)
                {
                    levels.AddRange(pack.levels);
                }
            }
        }

        private void LoadSolutions(string resourcesFolder)
        {
            TextAsset[] jsonFiles = Resources.LoadAll<TextAsset>(resourcesFolder);
            Array.Sort(jsonFiles, (left, right) => string.CompareOrdinal(left.name, right.name));

            foreach (TextAsset jsonFile in jsonFiles)
            {
                WaterSortJsonSolutionPack pack = JsonUtility.FromJson<WaterSortJsonSolutionPack>(jsonFile.text);
                if (pack?.levelSolutions == null)
                {
                    continue;
                }

                foreach (WaterSortJsonLevelSolution levelSolution in pack.levelSolutions)
                {
                    int levelIndex = levelSolution.levelNumber - 1;
                    if (levelIndex < 0 || levelIndex >= levels.Count)
                    {
                        continue;
                    }

                    levels[levelIndex].solutionData = levelSolution.solutionData ?? new WaterSortJsonSolutionData();
                }
            }
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
        public string displayName;
        public List<WaterSortJsonBottle> bottles = new();
        public WaterSortJsonSolutionData solutionData = new();

        public string GetDisplayName(int levelIndex)
        {
            return string.IsNullOrWhiteSpace(displayName) ? $"Level {levelIndex + 1}" : displayName;
        }
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

        public int Capacity => capacity == 5 ? 5 : 4;
        public IReadOnlyList<int> ColorsBottomToTop => colorsBottomToTop;
    }

    [Serializable]
    public sealed class WaterSortJsonSolutionData
    {
        public int solutionCount;
        public int shortestStepCount;
        public int storedSolutionCount;
        public bool storesAllSolutions;
        public string selectionPolicy;
        public List<WaterSortJsonSolution> solutions = new();
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
