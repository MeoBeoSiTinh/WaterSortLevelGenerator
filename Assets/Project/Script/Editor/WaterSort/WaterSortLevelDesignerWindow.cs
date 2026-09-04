#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using TrainWaterSort.Gameplay.WaterSort;
using TrainWaterSort.ScriptableObject.WaterSort;
using UnityEditor;
using UnityEngine;

namespace TrainWaterSort.Editor.WaterSort
{
    public sealed class WaterSortLevelDesignerWindow : EditorWindow
    {
        private const string DefaultLevelFolder = "Assets/Project/Data/WaterSort/Resources/WaterSort";
        private const string DefaultSolutionFolder = "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions";
        private const string DefaultPalettePath = "Assets/Project/Data/WaterSort/Resources/WaterSortColorPalette.asset";

        private readonly List<string> validationMessages = new();

        private TextAsset levelJsonAsset;
        private WaterSortColorPalette palette;
        private WaterSortJsonPack loadedPack;
        private WaterSortJsonLevel selectedLevel;
        private string loadedAssetPath;
        private Vector2 scrollPosition;
        private int selectedLevelNumber = 1;
        private int selectedBottleIndex = -1;
        private bool resetMatchingSolutionOnSave = true;

        [MenuItem("Tools/Water Sort/Level Designer")]
        public static void Open()
        {
            GetWindow<WaterSortLevelDesignerWindow>("Water Sort Level Designer");
        }

        private void OnEnable()
        {
            palette = AssetDatabase.LoadAssetAtPath<WaterSortColorPalette>(DefaultPalettePath);
            AutoAssignFirstLevelPack();
        }

        private void OnGUI()
        {
            DrawToolbar();

            if (loadedPack == null || selectedLevel == null)
            {
                EditorGUILayout.HelpBox("Select a Water Sort level JSON pack, then click Load Pack.", MessageType.Info);
                return;
            }

            scrollPosition = EditorGUILayout.BeginScrollView(scrollPosition);
            DrawLevelSelector();
            DrawSummary();
            DrawValidation();
            DrawBottleEditor();
            EditorGUILayout.EndScrollView();
        }

        private void DrawToolbar()
        {
            EditorGUILayout.LabelField("Water Sort Level JSON Designer", EditorStyles.boldLabel);

            using (new EditorGUILayout.HorizontalScope())
            {
                levelJsonAsset = (TextAsset)EditorGUILayout.ObjectField("Level Pack", levelJsonAsset, typeof(TextAsset), false);

                if (GUILayout.Button("Load Pack", GUILayout.Width(90)))
                {
                    LoadSelectedPack();
                }
            }

            palette = (WaterSortColorPalette)EditorGUILayout.ObjectField("Palette", palette, typeof(WaterSortColorPalette), false);
            resetMatchingSolutionOnSave = EditorGUILayout.ToggleLeft("Reset matching solution entry when saving this level", resetMatchingSolutionOnSave);

            using (new EditorGUILayout.HorizontalScope())
            {
                GUI.enabled = loadedPack != null && selectedLevel != null;

                if (GUILayout.Button("Save Level Pack"))
                {
                    SaveLoadedPack();
                }

                if (GUILayout.Button("Reload From Disk"))
                {
                    LoadSelectedPack();
                }

                GUI.enabled = true;
            }

            if (!string.IsNullOrEmpty(loadedAssetPath))
            {
                EditorGUILayout.LabelField("Path", loadedAssetPath);
            }

            EditorGUILayout.Space(8f);
        }

        private void DrawLevelSelector()
        {
            int levelCount = loadedPack.levels?.Count ?? 0;
            if (levelCount <= 0)
            {
                EditorGUILayout.HelpBox("Loaded pack has no levels.", MessageType.Warning);
                return;
            }

            EditorGUI.BeginChangeCheck();
            selectedLevelNumber = EditorGUILayout.IntSlider("Level Number", selectedLevelNumber, 1, levelCount);
            if (EditorGUI.EndChangeCheck())
            {
                SelectLevel(selectedLevelNumber);
            }

            selectedLevel.displayName = EditorGUILayout.TextField("Display Name", selectedLevel.displayName);

            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("Previous"))
                {
                    SelectLevel(Mathf.Max(1, selectedLevelNumber - 1));
                }

                if (GUILayout.Button("Next"))
                {
                    SelectLevel(Mathf.Min(levelCount, selectedLevelNumber + 1));
                }
            }

            EditorGUILayout.Space(8f);
        }

        private void DrawSummary()
        {
            int bottleCount = selectedLevel.bottles?.Count ?? 0;
            int emptyCount = selectedLevel.bottles?.Count(bottle => bottle.colorsBottomToTop == null || bottle.colorsBottomToTop.Count == 0) ?? 0;
            int maxCapacity = selectedLevel.bottles?.Count > 0 ? selectedLevel.bottles.Max(bottle => bottle.Capacity) : 0;
            int usedColorCount = GetUsedColors().Count;
            int fullMonoCount = selectedLevel.bottles?.Count(IsFullMonoBottle) ?? 0;
            int maxRepeatInBottle = selectedLevel.bottles?.Select(MaxColorRepeatInBottle).DefaultIfEmpty(0).Max() ?? 0;

            EditorGUILayout.LabelField("Overview", EditorStyles.boldLabel);
            using (new EditorGUILayout.VerticalScope(EditorStyles.helpBox))
            {
                EditorGUILayout.LabelField("Bottle Count", bottleCount.ToString());
                EditorGUILayout.LabelField("Empty Bottles", emptyCount.ToString());
                EditorGUILayout.LabelField("Max Capacity", maxCapacity.ToString());
                EditorGUILayout.LabelField("Used Colors", usedColorCount.ToString());
                EditorGUILayout.LabelField("Full Mono Bottles", fullMonoCount.ToString());
                EditorGUILayout.LabelField("Max Same Color In One Bottle", maxRepeatInBottle.ToString());
            }

            DrawColorUsage();
            EditorGUILayout.Space(8f);
        }

        private void DrawColorUsage()
        {
            Dictionary<int, int> usage = GetUsedColors();
            if (usage.Count == 0)
            {
                return;
            }

            EditorGUILayout.LabelField("Color Usage", EditorStyles.boldLabel);
            using (new EditorGUILayout.VerticalScope(EditorStyles.helpBox))
            {
                foreach (KeyValuePair<int, int> entry in usage.OrderBy(pair => pair.Key))
                {
                    using (new EditorGUILayout.HorizontalScope())
                    {
                        DrawColorSwatch(entry.Key, 18f, 18f);
                        EditorGUILayout.LabelField($"Color {entry.Key}", GUILayout.Width(80));
                        EditorGUILayout.LabelField($"{entry.Value} layers");
                    }
                }
            }
        }

        private void DrawValidation()
        {
            ValidateSelectedLevel();
            if (validationMessages.Count == 0)
            {
                EditorGUILayout.HelpBox("Level passes local JSON/layout checks. Stored solution still needs solver/replay validation after changes.", MessageType.Info);
                return;
            }

            foreach (string message in validationMessages)
            {
                EditorGUILayout.HelpBox(message, MessageType.Warning);
            }
        }

        private void DrawBottleEditor()
        {
            selectedLevel.bottles ??= new List<WaterSortJsonBottle>();

            EditorGUILayout.LabelField("Bottles", EditorStyles.boldLabel);
            DrawBottleGridPreview();

            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("Add Empty Bottle"))
                {
                    selectedLevel.bottles.Add(new WaterSortJsonBottle { capacity = 4, colorsBottomToTop = new List<int>() });
                    selectedBottleIndex = selectedLevel.bottles.Count - 1;
                }

                GUI.enabled = selectedLevel.bottles.Count > 0;
                if (GUILayout.Button("Normalize Capacities"))
                {
                    int capacity = selectedLevel.bottles[0].Capacity;
                    foreach (WaterSortJsonBottle bottle in selectedLevel.bottles)
                    {
                        bottle.capacity = capacity;
                        TrimBottleToCapacity(bottle);
                    }
                }

                GUI.enabled = true;
            }

            for (int i = 0; i < selectedLevel.bottles.Count; i++)
            {
                DrawBottleEditor(i, selectedLevel.bottles[i]);
            }
        }

        private void DrawBottleGridPreview()
        {
            const int bottlesPerRow = 5;
            int count = selectedLevel.bottles?.Count ?? 0;
            for (int rowStart = 0; rowStart < count; rowStart += bottlesPerRow)
            {
                using (new EditorGUILayout.HorizontalScope())
                {
                    for (int i = rowStart; i < Mathf.Min(rowStart + bottlesPerRow, count); i++)
                    {
                        DrawBottleMiniPreview(i, selectedLevel.bottles[i]);
                    }
                }
            }
        }

        private void DrawBottleMiniPreview(int index, WaterSortJsonBottle bottle)
        {
            GUIStyle style = index == selectedBottleIndex ? EditorStyles.helpBox : GUI.skin.box;
            using (new EditorGUILayout.VerticalScope(style, GUILayout.Width(92)))
            {
                if (GUILayout.Button($"#{index + 1}", GUILayout.Width(70)))
                {
                    selectedBottleIndex = index;
                    GUI.FocusControl(null);
                }

                int capacity = bottle.Capacity;
                for (int layer = capacity - 1; layer >= 0; layer--)
                {
                    int color = bottle.colorsBottomToTop != null && layer < bottle.colorsBottomToTop.Count ? bottle.colorsBottomToTop[layer] : -1;
                    DrawLayerPreview(color, 70f, 14f);
                }
            }
        }

        private void DrawBottleEditor(int index, WaterSortJsonBottle bottle)
        {
            bottle.colorsBottomToTop ??= new List<int>();

            using (new EditorGUILayout.VerticalScope(EditorStyles.helpBox))
            {
                using (new EditorGUILayout.HorizontalScope())
                {
                    bool isSelected = selectedBottleIndex == index;
                    bool nextSelected = EditorGUILayout.Toggle(isSelected, GUILayout.Width(18));
                    if (nextSelected != isSelected)
                    {
                        selectedBottleIndex = nextSelected ? index : -1;
                    }

                    EditorGUILayout.LabelField($"Bottle {index + 1}", EditorStyles.boldLabel, GUILayout.Width(90));
                    bottle.capacity = EditorGUILayout.IntPopup("Capacity", bottle.Capacity, new[] { "2", "3", "4", "5" }, new[] { 2, 3, 4, 5 });
                    TrimBottleToCapacity(bottle);
                }

                for (int layer = bottle.Capacity - 1; layer >= 0; layer--)
                {
                    using (new EditorGUILayout.HorizontalScope())
                    {
                        EditorGUILayout.LabelField(layer == bottle.colorsBottomToTop.Count - 1 ? "Top" : $"Layer {layer + 1}", GUILayout.Width(70));

                        if (layer < bottle.colorsBottomToTop.Count)
                        {
                            DrawColorSwatch(bottle.colorsBottomToTop[layer], 20f, 18f);
                            bottle.colorsBottomToTop[layer] = EditorGUILayout.IntField(bottle.colorsBottomToTop[layer], GUILayout.Width(60));

                            if (GUILayout.Button("Up", GUILayout.Width(42)))
                            {
                                MoveLayer(bottle, layer, layer + 1);
                            }

                            if (GUILayout.Button("Down", GUILayout.Width(52)))
                            {
                                MoveLayer(bottle, layer, layer - 1);
                            }

                            if (GUILayout.Button("Remove", GUILayout.Width(70)))
                            {
                                bottle.colorsBottomToTop.RemoveAt(layer);
                            }
                        }
                        else
                        {
                            DrawLayerPreview(-1, 20f, 18f);
                            EditorGUILayout.LabelField("Empty", GUILayout.Width(60));
                        }
                    }
                }

                using (new EditorGUILayout.HorizontalScope())
                {
                    GUI.enabled = bottle.colorsBottomToTop.Count < bottle.Capacity;
                    if (GUILayout.Button("Add Layer"))
                    {
                        bottle.colorsBottomToTop.Add(0);
                    }

                    GUI.enabled = true;

                    if (GUILayout.Button("Clear"))
                    {
                        bottle.colorsBottomToTop.Clear();
                    }

                    GUI.enabled = index > 0;
                    if (GUILayout.Button("Move Left"))
                    {
                        SwapBottles(index, index - 1);
                    }

                    GUI.enabled = index < selectedLevel.bottles.Count - 1;
                    if (GUILayout.Button("Move Right"))
                    {
                        SwapBottles(index, index + 1);
                    }

                    GUI.enabled = true;

                    if (GUILayout.Button("Duplicate"))
                    {
                        selectedLevel.bottles.Insert(index + 1, CloneBottle(bottle));
                        selectedBottleIndex = index + 1;
                    }

                    if (GUILayout.Button("Delete"))
                    {
                        selectedLevel.bottles.RemoveAt(index);
                        selectedBottleIndex = Mathf.Clamp(selectedBottleIndex, -1, selectedLevel.bottles.Count - 1);
                    }
                }
            }
        }

        private void AutoAssignFirstLevelPack()
        {
            if (levelJsonAsset != null)
            {
                return;
            }

            string[] guids = AssetDatabase.FindAssets("t:TextAsset watersort-levels-", new[] { DefaultLevelFolder });
            if (guids.Length == 0)
            {
                return;
            }

            string path = AssetDatabase.GUIDToAssetPath(guids.OrderBy(AssetDatabase.GUIDToAssetPath).First());
            levelJsonAsset = AssetDatabase.LoadAssetAtPath<TextAsset>(path);
        }

        private void LoadSelectedPack()
        {
            if (levelJsonAsset == null)
            {
                EditorUtility.DisplayDialog("Water Sort Level Designer", "Select a level JSON TextAsset first.", "OK");
                return;
            }

            loadedAssetPath = AssetDatabase.GetAssetPath(levelJsonAsset);
            if (string.IsNullOrEmpty(loadedAssetPath))
            {
                EditorUtility.DisplayDialog("Water Sort Level Designer", "Could not resolve the selected asset path.", "OK");
                return;
            }

            string text = File.ReadAllText(loadedAssetPath);
            loadedPack = JsonUtility.FromJson<WaterSortJsonPack>(text);
            loadedPack.levels ??= new List<WaterSortJsonLevel>();
            selectedLevelNumber = Mathf.Clamp(selectedLevelNumber, 1, Mathf.Max(1, loadedPack.levels.Count));
            SelectLevel(selectedLevelNumber);
        }

        private void SelectLevel(int levelNumber)
        {
            if (loadedPack?.levels == null || loadedPack.levels.Count == 0)
            {
                selectedLevel = null;
                selectedBottleIndex = -1;
                return;
            }

            selectedLevelNumber = Mathf.Clamp(levelNumber, 1, loadedPack.levels.Count);
            selectedLevel = loadedPack.levels[selectedLevelNumber - 1];
            selectedLevel.bottles ??= new List<WaterSortJsonBottle>();
            selectedBottleIndex = Mathf.Clamp(selectedBottleIndex, -1, selectedLevel.bottles.Count - 1);
        }

        private void SaveLoadedPack()
        {
            if (loadedPack == null || string.IsNullOrEmpty(loadedAssetPath))
            {
                return;
            }

            ValidateSelectedLevel();
            if (validationMessages.Count > 0)
            {
                bool saveAnyway = EditorUtility.DisplayDialog(
                    "Water Sort Level Designer",
                    "The selected level has validation warnings. Save anyway?",
                    "Save",
                    "Cancel");
                if (!saveAnyway)
                {
                    return;
                }
            }

            File.WriteAllText(loadedAssetPath, JsonUtility.ToJson(loadedPack, true));
            if (resetMatchingSolutionOnSave)
            {
                ResetMatchingSolutionEntry();
            }

            AssetDatabase.ImportAsset(loadedAssetPath);
            AssetDatabase.Refresh();
            EditorUtility.DisplayDialog("Water Sort Level Designer", "Level pack saved. Re-run solution generation/validation after layout changes.", "OK");
        }

        private void ResetMatchingSolutionEntry()
        {
            string solutionPath = GetMatchingSolutionPath();
            if (string.IsNullOrEmpty(solutionPath) || !File.Exists(solutionPath))
            {
                return;
            }

            WaterSortJsonSolutionPack solutionPack = JsonUtility.FromJson<WaterSortJsonSolutionPack>(File.ReadAllText(solutionPath));
            if (solutionPack?.levelSolutions == null)
            {
                return;
            }

            WaterSortJsonLevelSolution entry = solutionPack.levelSolutions.FirstOrDefault(item => item.levelNumber == selectedLevelNumber);
            if (entry == null)
            {
                return;
            }

            entry.solutionData = new WaterSortJsonSolutionData
            {
                solutionCount = 0,
                shortestStepCount = 0,
                storedSolutionCount = 0,
                storesAllSolutions = false,
                selectionPolicy = "manual_level_edit_solution_stale",
                solutions = new List<WaterSortJsonSolution>()
            };

            File.WriteAllText(solutionPath, JsonUtility.ToJson(solutionPack, true));
            AssetDatabase.ImportAsset(solutionPath);
        }

        private string GetMatchingSolutionPath()
        {
            if (string.IsNullOrEmpty(loadedAssetPath))
            {
                return string.Empty;
            }

            string fileName = Path.GetFileName(loadedAssetPath).Replace("watersort-levels-", "watersort-solutions-");
            return Path.Combine(DefaultSolutionFolder, fileName).Replace("\\", "/");
        }

        private void ValidateSelectedLevel()
        {
            validationMessages.Clear();
            if (selectedLevel?.bottles == null)
            {
                validationMessages.Add("Level has no bottles list.");
                return;
            }

            if (selectedLevel.bottles.Count == 0)
            {
                validationMessages.Add("Level has zero bottles.");
            }

            if (selectedLevel.bottles.Count > 30)
            {
                validationMessages.Add("Bottle count exceeds current max of 30.");
            }

            int paletteCount = palette?.Colors?.Count ?? 0;
            int emptyCount = 0;
            for (int i = 0; i < selectedLevel.bottles.Count; i++)
            {
                WaterSortJsonBottle bottle = selectedLevel.bottles[i];
                bottle.colorsBottomToTop ??= new List<int>();
                int capacity = bottle.Capacity;

                if (bottle.capacity < 2 || bottle.capacity > 5)
                {
                    validationMessages.Add($"Bottle {i + 1}: capacity should be 2, 3, 4, or 5.");
                }

                if (bottle.colorsBottomToTop.Count == 0)
                {
                    emptyCount++;
                }

                if (bottle.colorsBottomToTop.Count > capacity)
                {
                    validationMessages.Add($"Bottle {i + 1}: over capacity.");
                }

                foreach (int colorIndex in bottle.colorsBottomToTop)
                {
                    if (colorIndex < 0 || paletteCount > 0 && colorIndex >= paletteCount)
                    {
                        validationMessages.Add($"Bottle {i + 1}: color {colorIndex} is outside palette.");
                    }
                }

                if (IsFullMonoBottle(bottle))
                {
                    validationMessages.Add($"Bottle {i + 1}: starts as full mono bottle.");
                }

                if (MaxColorRepeatInBottle(bottle) >= capacity)
                {
                    validationMessages.Add($"Bottle {i + 1}: one color appears {capacity} times.");
                }
            }

            if (emptyCount == 0)
            {
                validationMessages.Add("No empty bottle. This is allowed only for intentionally constrained/partial-helper levels.");
            }
        }

        private Dictionary<int, int> GetUsedColors()
        {
            Dictionary<int, int> usage = new();
            if (selectedLevel?.bottles == null)
            {
                return usage;
            }

            foreach (WaterSortJsonBottle bottle in selectedLevel.bottles)
            {
                if (bottle.colorsBottomToTop == null)
                {
                    continue;
                }

                foreach (int color in bottle.colorsBottomToTop)
                {
                    usage[color] = usage.TryGetValue(color, out int count) ? count + 1 : 1;
                }
            }

            return usage;
        }

        private void DrawColorSwatch(int colorIndex, float width, float height)
        {
            Rect rect = GUILayoutUtility.GetRect(width, height, GUILayout.Width(width), GUILayout.Height(height));
            EditorGUI.DrawRect(rect, GetPaletteColor(colorIndex));
            GUI.Box(rect, GUIContent.none);
        }

        private void DrawLayerPreview(int colorIndex, float width, float height)
        {
            Rect rect = GUILayoutUtility.GetRect(width, height, GUILayout.Width(width), GUILayout.Height(height));
            EditorGUI.DrawRect(rect, colorIndex < 0 ? new Color(0.08f, 0.08f, 0.08f, 1f) : GetPaletteColor(colorIndex));
            GUI.Box(rect, colorIndex < 0 ? "-" : colorIndex.ToString());
        }

        private Color GetPaletteColor(int colorIndex)
        {
            if (palette == null || colorIndex < 0 || colorIndex >= palette.Colors.Count)
            {
                return Color.magenta;
            }

            return palette.GetColor(colorIndex);
        }

        private static bool IsFullMonoBottle(WaterSortJsonBottle bottle)
        {
            if (bottle.colorsBottomToTop == null || bottle.colorsBottomToTop.Count == 0)
            {
                return false;
            }

            int capacity = bottle.Capacity;
            return bottle.colorsBottomToTop.Count == capacity && bottle.colorsBottomToTop.All(color => color == bottle.colorsBottomToTop[0]);
        }

        private static int MaxColorRepeatInBottle(WaterSortJsonBottle bottle)
        {
            if (bottle.colorsBottomToTop == null || bottle.colorsBottomToTop.Count == 0)
            {
                return 0;
            }

            return bottle.colorsBottomToTop
                .GroupBy(color => color)
                .Select(group => group.Count())
                .DefaultIfEmpty(0)
                .Max();
        }

        private static void TrimBottleToCapacity(WaterSortJsonBottle bottle)
        {
            while (bottle.colorsBottomToTop.Count > bottle.Capacity)
            {
                bottle.colorsBottomToTop.RemoveAt(bottle.colorsBottomToTop.Count - 1);
            }
        }

        private static WaterSortJsonBottle CloneBottle(WaterSortJsonBottle bottle)
        {
            return new WaterSortJsonBottle
            {
                capacity = bottle.Capacity,
                colorsBottomToTop = bottle.colorsBottomToTop != null ? new List<int>(bottle.colorsBottomToTop) : new List<int>()
            };
        }

        private void SwapBottles(int left, int right)
        {
            (selectedLevel.bottles[left], selectedLevel.bottles[right]) = (selectedLevel.bottles[right], selectedLevel.bottles[left]);
            selectedBottleIndex = right;
        }

        private static void MoveLayer(WaterSortJsonBottle bottle, int from, int to)
        {
            if (to < 0 || to >= bottle.colorsBottomToTop.Count)
            {
                return;
            }

            (bottle.colorsBottomToTop[from], bottle.colorsBottomToTop[to]) = (bottle.colorsBottomToTop[to], bottle.colorsBottomToTop[from]);
        }

    }
}
#endif
