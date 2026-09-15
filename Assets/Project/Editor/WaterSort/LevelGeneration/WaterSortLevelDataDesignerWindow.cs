#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEngine;

namespace WaterSort.LevelGeneration.Editor
{
    public sealed class WaterSortLevelDataDesignerWindow : EditorWindow
    {
        private static string DefaultAssetRoot => Directory.Exists("Assets/LevelGenerator") ? "Assets/LevelGenerator" : "Assets/Project";
        private static string DefaultLevelFolder => $"{DefaultAssetRoot}/Data/WaterSort/Resources/WaterSort";
        private static string DefaultSolutionFolder => $"{DefaultAssetRoot}/Data/WaterSort/Resources/WaterSortSolutions";
        private static string DefaultPalettePath => $"{DefaultAssetRoot}/Data/WaterSort/Resources/WaterSortColorPalette.asset";
        private const int DefaultColumns = 8;
        private const int DefaultRows = 5;
        private const int MaxBottleCount = 40;

        private readonly List<string> validationMessages = new();
        private readonly List<Color> paletteColors = new();

        private TextAsset levelJsonAsset;
        private LevelPack loadedPack;
        private LevelData selectedLevel;
        private string loadedAssetPath;
        private string palettePath = DefaultPalettePath;
        private Vector2 scrollPosition;
        private int selectedLevelNumber = 1;
        private int selectedBottleIndex = -1;
        private bool resetMatchingSolutionOnSave = true;

        [MenuItem("Tools/Water Sort/Level Data Designer")]
        public static void Open()
        {
            GetWindow<WaterSortLevelDataDesignerWindow>("Water Sort Level Data");
        }

        private void OnEnable()
        {
            LoadPaletteColors();
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
            DrawGridEditor();
            DrawBottleEditor();
            EditorGUILayout.EndScrollView();
        }

        private void DrawToolbar()
        {
            EditorGUILayout.LabelField("Water Sort Level Data Designer", EditorStyles.boldLabel);

            using (new EditorGUILayout.HorizontalScope())
            {
                levelJsonAsset = (TextAsset)EditorGUILayout.ObjectField("Level Pack", levelJsonAsset, typeof(TextAsset), false);
                if (GUILayout.Button("Load Pack", GUILayout.Width(90)))
                {
                    LoadSelectedPack();
                }
            }

            using (new EditorGUILayout.HorizontalScope())
            {
                palettePath = EditorGUILayout.TextField("Palette Asset", palettePath);
                if (GUILayout.Button("Reload", GUILayout.Width(70)))
                {
                    LoadPaletteColors();
                }
            }

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

            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("Previous", GUILayout.Width(90)))
                {
                    SelectLevel(Mathf.Max(1, selectedLevelNumber - 1));
                }

                EditorGUI.BeginChangeCheck();
                selectedLevelNumber = EditorGUILayout.IntSlider("Level Number", selectedLevelNumber, 1, levelCount);
                if (EditorGUI.EndChangeCheck())
                {
                    SelectLevel(selectedLevelNumber);
                }

                if (GUILayout.Button("Next", GUILayout.Width(90)))
                {
                    SelectLevel(Mathf.Min(levelCount, selectedLevelNumber + 1));
                }
            }

            selectedLevel.displayName = EditorGUILayout.TextField("Display Name", selectedLevel.displayName);
            EnsureLayoutGrid();
            using (new EditorGUILayout.HorizontalScope())
            {
                selectedLevel.layoutGrid.columns = EditorGUILayout.IntField("Columns", selectedLevel.layoutGrid.columns);
                selectedLevel.layoutGrid.rows = EditorGUILayout.IntField("Rows", selectedLevel.layoutGrid.rows);
                selectedLevel.layoutGrid.shape = EditorGUILayout.TextField("Shape", selectedLevel.layoutGrid.shape);
            }

            selectedLevel.layoutGrid.columns = Mathf.Clamp(selectedLevel.layoutGrid.columns, 1, DefaultColumns);
            selectedLevel.layoutGrid.rows = Mathf.Clamp(selectedLevel.layoutGrid.rows, 1, DefaultRows);
            EditorGUILayout.Space(8f);
        }

        private void DrawSummary()
        {
            int bottleCount = selectedLevel.bottles?.Count ?? 0;
            int emptyCount = selectedLevel.bottles?.Count(bottle => bottle.colorsBottomToTop == null || bottle.colorsBottomToTop.Count == 0) ?? 0;
            int adCount = selectedLevel.bottles?.Count(bottle => bottle.isAdBottle) ?? 0;
            int lockedCount = selectedLevel.bottles?.Count(bottle => bottle.isLocked) ?? 0;
            int megaCount = selectedLevel.bottles?.Count(bottle => bottle.isMegaBottle) ?? 0;
            int normalCount = Mathf.Max(0, bottleCount - adCount - lockedCount - megaCount);
            int maxCapacity = selectedLevel.bottles?.Count > 0 ? selectedLevel.bottles.Max(bottle => bottle.Capacity) : 0;
            int usedColorCount = GetUsedColors().Count;

            EditorGUILayout.LabelField("Overview", EditorStyles.boldLabel);
            using (new EditorGUILayout.VerticalScope(EditorStyles.helpBox))
            {
                EditorGUILayout.LabelField("Bottles", $"{bottleCount}/{MaxBottleCount}");
                EditorGUILayout.LabelField("Normal / Locked / Ads / Mega", $"{normalCount} / {lockedCount} / {adCount} / {megaCount}");
                EditorGUILayout.LabelField("Empty Bottles", emptyCount.ToString());
                EditorGUILayout.LabelField("Max Capacity", maxCapacity.ToString());
                EditorGUILayout.LabelField("Used Colors", usedColorCount.ToString());
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
                EditorGUILayout.HelpBox("Level passes local JSON/layout checks. Re-run solution validation after changing gameplay bottles or color layers.", MessageType.Info);
                return;
            }

            foreach (string message in validationMessages)
            {
                EditorGUILayout.HelpBox(message, MessageType.Warning);
            }
        }

        private void DrawGridEditor()
        {
            EnsureLayoutGrid();
            selectedLevel.bottles ??= new List<BottleData>();

            EditorGUILayout.LabelField("Grid Position", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox("Click an occupied cell to select a bottle. Select a bottle, then click an empty cell to move it.", MessageType.None);

            Dictionary<Vector2Int, int> occupied = BuildGridIndex();
            for (int y = 0; y < selectedLevel.layoutGrid.rows; y++)
            {
                using (new EditorGUILayout.HorizontalScope())
                {
                    for (int x = 0; x < selectedLevel.layoutGrid.columns; x++)
                    {
                        Vector2Int position = new(x, y);
                        bool hasBottle = occupied.TryGetValue(position, out int bottleIndex);
                        string label = hasBottle ? GridCellLabel(bottleIndex, selectedLevel.bottles[bottleIndex]) : ".";
                        Color oldColor = GUI.backgroundColor;
                        GUI.backgroundColor = hasBottle ? GridCellColor(bottleIndex, selectedLevel.bottles[bottleIndex]) : Color.white;
                        if (GUILayout.Button(label, GUILayout.Width(64), GUILayout.Height(38)))
                        {
                            HandleGridCellClick(position, hasBottle, bottleIndex);
                        }

                        GUI.backgroundColor = oldColor;
                    }
                }
            }

            if (selectedBottleIndex >= 0 && selectedBottleIndex < selectedLevel.bottles.Count)
            {
                BottleData bottle = selectedLevel.bottles[selectedBottleIndex];
                EnsureGridPosition(bottle);
                using (new EditorGUILayout.HorizontalScope())
                {
                    EditorGUILayout.LabelField($"Selected Bottle {selectedBottleIndex + 1}", GUILayout.Width(140));
                    bottle.gridPosition.x = EditorGUILayout.IntSlider("X", bottle.gridPosition.x, 0, selectedLevel.layoutGrid.columns - 1);
                    bottle.gridPosition.y = EditorGUILayout.IntSlider("Y", bottle.gridPosition.y, 0, selectedLevel.layoutGrid.rows - 1);
                }
            }

            EditorGUILayout.Space(8f);
        }

        private void DrawBottleEditor()
        {
            selectedLevel.bottles ??= new List<BottleData>();

            EditorGUILayout.LabelField("Bottles", EditorStyles.boldLabel);
            using (new EditorGUILayout.HorizontalScope())
            {
                GUI.enabled = selectedLevel.bottles.Count < MaxBottleCount && TryFindFreeGridCell(out _);
                if (GUILayout.Button("Add Normal"))
                {
                    AddBottle(BottleKind.Normal);
                }

                if (GUILayout.Button("Add Locked"))
                {
                    AddBottle(BottleKind.Locked);
                }

                if (GUILayout.Button("Add ColorLocked"))
                {
                    AddBottle(BottleKind.ColorLocked);
                }

                if (GUILayout.Button("Add Ads"))
                {
                    AddBottle(BottleKind.Ads);
                }

                if (GUILayout.Button("Add Mega"))
                {
                    AddBottle(BottleKind.Mega);
                }

                GUI.enabled = selectedLevel.bottles.Count > 0;
                if (GUILayout.Button("Normalize Capacity"))
                {
                    NormalizeCapacity();
                }

                GUI.enabled = true;
            }

            for (int i = 0; i < selectedLevel.bottles.Count; i++)
            {
                DrawBottlePanel(i, selectedLevel.bottles[i]);
            }
        }

        private void DrawBottlePanel(int index, BottleData bottle)
        {
            bottle.colorsBottomToTop ??= new List<int>();
            EnsureGridPosition(bottle);

            using (new EditorGUILayout.VerticalScope(index == selectedBottleIndex ? EditorStyles.helpBox : GUI.skin.box))
            {
                using (new EditorGUILayout.HorizontalScope())
                {
                    bool isSelected = selectedBottleIndex == index;
                    bool nextSelected = EditorGUILayout.Toggle(isSelected, GUILayout.Width(18));
                    if (nextSelected != isSelected)
                    {
                        selectedBottleIndex = nextSelected ? index : -1;
                    }

                    EditorGUILayout.LabelField($"Bottle {index + 1}", EditorStyles.boldLabel, GUILayout.Width(80));
                    BottleKind kind = GetBottleKind(bottle);
                    BottleKind nextKind = (BottleKind)EditorGUILayout.EnumPopup("State", kind);
                    if (nextKind != kind)
                    {
                        SetBottleKind(bottle, nextKind);
                    }

                    bottle.capacity = bottle.isMegaBottle
                        ? EditorGUILayout.IntSlider("Capacity", Mathf.Max(12, bottle.capacity), 12, 24)
                        : EditorGUILayout.IntPopup("Capacity", bottle.Capacity, new[] { "2", "3", "4", "5" }, new[] { 2, 3, 4, 5 });
                    TrimBottleToCapacity(bottle);
                }

                if (bottle.isMegaBottle)
                {
                    bottle.targetColor = DrawColorPopup(Mathf.Max(0, bottle.targetColor));
                    EditorGUILayout.HelpBox("Mega bottle can only receive this target color. It should start with one visible target-color layer.", MessageType.Info);
                }

                if (bottle.isLocked)
                {
                    bottle.unlockCompletedBottleCount = EditorGUILayout.IntSlider("Unlock Completed Bottles", Mathf.Max(1, bottle.unlockCompletedBottleCount), 1, 10);
                }

                if (bottle.isColorLocked)
                {
                    bottle.unlockRequiredColor = DrawColorPopup(Mathf.Max(0, bottle.unlockRequiredColor));
                    bottle.unlockCompletedColorBottleCount = EditorGUILayout.IntSlider(
                        "Unlock Color Bottle Count",
                        Mathf.Max(1, bottle.unlockCompletedColorBottleCount),
                        1,
                        10);
                }

                using (new EditorGUILayout.HorizontalScope())
                {
                    EditorGUILayout.LabelField("Grid", GUILayout.Width(42));
                    bottle.gridPosition.x = EditorGUILayout.IntSlider("X", bottle.gridPosition.x, 0, selectedLevel.layoutGrid.columns - 1);
                    bottle.gridPosition.y = EditorGUILayout.IntSlider("Y", bottle.gridPosition.y, 0, selectedLevel.layoutGrid.rows - 1);
                }

                DrawLayerEditor(bottle);

                using (new EditorGUILayout.HorizontalScope())
                {
                    GUI.enabled = bottle.colorsBottomToTop.Count < bottle.Capacity;
                    if (GUILayout.Button("Add Layer"))
                    {
                        bottle.colorsBottomToTop.Add(NextDefaultColor());
                    }

                    GUI.enabled = true;
                    if (GUILayout.Button("Clear Layers"))
                    {
                        bottle.colorsBottomToTop.Clear();
                    }

                    if (GUILayout.Button("Duplicate"))
                    {
                        DuplicateBottle(index);
                    }

                    if (GUILayout.Button("Delete"))
                    {
                        selectedLevel.bottles.RemoveAt(index);
                        selectedBottleIndex = Mathf.Clamp(selectedBottleIndex, -1, selectedLevel.bottles.Count - 1);
                    }
                }
            }
        }

        private void DrawLayerEditor(BottleData bottle)
        {
            for (int layer = bottle.Capacity - 1; layer >= 0; layer--)
            {
                using (new EditorGUILayout.HorizontalScope())
                {
                    EditorGUILayout.LabelField(layer == bottle.colorsBottomToTop.Count - 1 ? "Top" : $"Layer {layer + 1}", GUILayout.Width(70));

                    if (layer < bottle.colorsBottomToTop.Count)
                    {
                        DrawColorSwatch(bottle.colorsBottomToTop[layer], 20f, 18f);
                        bottle.colorsBottomToTop[layer] = DrawColorPopup(bottle.colorsBottomToTop[layer]);

                        GUI.enabled = layer + 1 < bottle.colorsBottomToTop.Count;
                        if (GUILayout.Button("Up", GUILayout.Width(42)))
                        {
                            MoveLayer(bottle, layer, layer + 1);
                        }

                        GUI.enabled = layer > 0;
                        if (GUILayout.Button("Down", GUILayout.Width(52)))
                        {
                            MoveLayer(bottle, layer, layer - 1);
                        }

                        GUI.enabled = true;
                        if (GUILayout.Button("Remove", GUILayout.Width(70)))
                        {
                            bottle.colorsBottomToTop.RemoveAt(layer);
                        }
                    }
                    else
                    {
                        DrawLayerPreview(-1, 20f, 18f);
                        EditorGUILayout.LabelField("Empty");
                    }
                }
            }
        }

        private int DrawColorPopup(int current)
        {
            if (paletteColors.Count <= 0)
            {
                return EditorGUILayout.IntField(current, GUILayout.Width(80));
            }

            int[] values = Enumerable.Range(0, paletteColors.Count).ToArray();
            string[] labels = values.Select(value => $"Color {value}").ToArray();
            return EditorGUILayout.IntPopup(current, labels, values, GUILayout.Width(120));
        }

        private void HandleGridCellClick(Vector2Int position, bool hasBottle, int bottleIndex)
        {
            if (hasBottle)
            {
                selectedBottleIndex = bottleIndex;
                GUI.FocusControl(null);
                return;
            }

            if (selectedBottleIndex < 0 || selectedBottleIndex >= selectedLevel.bottles.Count)
            {
                return;
            }

            BottleData bottle = selectedLevel.bottles[selectedBottleIndex];
            bottle.gridPosition = new GridPosition { x = position.x, y = position.y };
            GUI.FocusControl(null);
        }

        private void AddBottle(BottleKind kind)
        {
            if (!TryFindFreeGridCell(out Vector2Int position))
            {
                return;
            }

            BottleData bottle = new()
            {
                capacity = selectedLevel.bottles.Count > 0 ? selectedLevel.bottles[0].Capacity : 4,
                colorsBottomToTop = new List<int>(),
                gridPosition = new GridPosition { x = position.x, y = position.y }
            };
            SetBottleKind(bottle, kind);
            selectedLevel.bottles.Add(bottle);
            selectedBottleIndex = selectedLevel.bottles.Count - 1;
        }

        private void DuplicateBottle(int index)
        {
            if (!TryFindFreeGridCell(out Vector2Int position))
            {
                EditorUtility.DisplayDialog("Water Sort Level Data Designer", "No empty grid cell is available.", "OK");
                return;
            }

            BottleData clone = CloneBottle(selectedLevel.bottles[index]);
            clone.gridPosition = new GridPosition { x = position.x, y = position.y };
            selectedLevel.bottles.Insert(index + 1, clone);
            selectedBottleIndex = index + 1;
        }

        private void NormalizeCapacity()
        {
            int capacity = selectedLevel.bottles[0].Capacity;
            foreach (BottleData bottle in selectedLevel.bottles)
            {
                bottle.capacity = capacity;
                TrimBottleToCapacity(bottle);
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
                EditorUtility.DisplayDialog("Water Sort Level Data Designer", "Select a level JSON TextAsset first.", "OK");
                return;
            }

            loadedAssetPath = AssetDatabase.GetAssetPath(levelJsonAsset);
            if (string.IsNullOrEmpty(loadedAssetPath))
            {
                EditorUtility.DisplayDialog("Water Sort Level Data Designer", "Could not resolve the selected asset path.", "OK");
                return;
            }

            loadedPack = JsonUtility.FromJson<LevelPack>(File.ReadAllText(loadedAssetPath)) ?? new LevelPack();
            loadedPack.levels ??= new List<LevelData>();
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
            selectedLevel.bottles ??= new List<BottleData>();
            EnsureLayoutGrid();
            EnsureAllGridPositions();
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
                    "Water Sort Level Data Designer",
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
            EditorUtility.DisplayDialog("Water Sort Level Data Designer", "Level pack saved. Re-run solution generation/validation after gameplay changes.", "OK");
        }

        private void ResetMatchingSolutionEntry()
        {
            string solutionPath = GetMatchingSolutionPath();
            if (string.IsNullOrEmpty(solutionPath) || !File.Exists(solutionPath))
            {
                return;
            }

            SolutionPack solutionPack = JsonUtility.FromJson<SolutionPack>(File.ReadAllText(solutionPath));
            if (solutionPack?.levelSolutions == null)
            {
                return;
            }

            int levelNumber = ExtractSelectedGlobalLevelNumber();
            LevelSolution entry = solutionPack.levelSolutions.FirstOrDefault(item => item.levelNumber == levelNumber);
            if (entry == null)
            {
                return;
            }

            entry.solutionData = new SolutionData
            {
                solutionCount = 0,
                shortestStepCount = 0,
                storedSolutionCount = 0,
                storesAllSolutions = false,
                selectionPolicy = "manual_level_edit_solution_stale",
                solutions = new List<SolutionEntry>()
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

        private int ExtractSelectedGlobalLevelNumber()
        {
            Match match = Regex.Match(Path.GetFileNameWithoutExtension(loadedAssetPath), @"(\d+)$");
            int packIndex = match.Success && int.TryParse(match.Groups[1].Value, out int parsed) ? parsed : 1;
            return (packIndex - 1) * 100 + selectedLevelNumber;
        }

        private void ValidateSelectedLevel()
        {
            validationMessages.Clear();
            if (selectedLevel?.bottles == null)
            {
                validationMessages.Add("Level has no bottles list.");
                return;
            }

            EnsureLayoutGrid();
            if (selectedLevel.bottles.Count == 0)
            {
                validationMessages.Add("Level has zero bottles.");
            }

            if (selectedLevel.bottles.Count > MaxBottleCount)
            {
                validationMessages.Add($"Bottle count exceeds current max of {MaxBottleCount}.");
            }

            HashSet<Vector2Int> positions = new();
            int adCount = 0;
            int megaCount = 0;
            for (int i = 0; i < selectedLevel.bottles.Count; i++)
            {
                BottleData bottle = selectedLevel.bottles[i];
                bottle.colorsBottomToTop ??= new List<int>();
                EnsureGridPosition(bottle);

                if (bottle.isMegaBottle)
                {
                    megaCount++;
                    if (bottle.capacity < 12)
                    {
                        validationMessages.Add($"Bottle {i + 1}: mega capacity should be 12 or higher.");
                    }

                    if (bottle.colorsBottomToTop.Count == 0 || bottle.colorsBottomToTop[0] != bottle.targetColor)
                    {
                        validationMessages.Add($"Bottle {i + 1}: mega bottle should start with one visible target-color layer.");
                    }

                    if (bottle.colorsBottomToTop.Any(color => color != bottle.targetColor))
                    {
                        validationMessages.Add($"Bottle {i + 1}: mega bottle should contain only target color.");
                    }
                }
                else if (bottle.capacity < 2 || bottle.capacity > 5)
                {
                    validationMessages.Add($"Bottle {i + 1}: capacity should be 2, 3, 4, or 5.");
                }

                if (bottle.colorsBottomToTop.Count > bottle.Capacity)
                {
                    validationMessages.Add($"Bottle {i + 1}: over capacity.");
                }

                Vector2Int position = bottle.GridPosition;
                if (position.x < 0 || position.x >= selectedLevel.layoutGrid.columns || position.y < 0 || position.y >= selectedLevel.layoutGrid.rows)
                {
                    validationMessages.Add($"Bottle {i + 1}: grid position is outside {selectedLevel.layoutGrid.columns}x{selectedLevel.layoutGrid.rows}.");
                }

                if (!positions.Add(position))
                {
                    validationMessages.Add($"Bottle {i + 1}: duplicate grid position {position.x},{position.y}.");
                }

                foreach (int colorIndex in bottle.colorsBottomToTop)
                {
                    if (colorIndex < 0 || paletteColors.Count > 0 && colorIndex >= paletteColors.Count)
                    {
                        validationMessages.Add($"Bottle {i + 1}: color {colorIndex} is outside palette.");
                    }
                }

                if (bottle.isAdBottle)
                {
                    adCount++;
                    if (bottle.colorsBottomToTop.Count > 0)
                    {
                        validationMessages.Add($"Bottle {i + 1}: ads bottle should start empty.");
                    }
                }

                if (bottle.isLocked && bottle.isColorLocked)
                {
                    validationMessages.Add($"Bottle {i + 1}: cannot combine count-lock and color-lock.");
                }

                if (bottle.isColorLocked)
                {
                    int need = Mathf.Max(1, bottle.unlockCompletedColorBottleCount);
                    int layers = selectedLevel.bottles
                        .Where(candidate => candidate != null && !candidate.isAdBottle)
                        .SelectMany(candidate => candidate.colorsBottomToTop ?? new List<int>())
                        .Count(color => color == bottle.unlockRequiredColor);
                    if (layers < bottle.Capacity * need)
                    {
                        validationMessages.Add($"Bottle {i + 1}: color-lock needs {bottle.Capacity * need} layers of color {bottle.unlockRequiredColor}, found {layers}.");
                    }
                }
            }

            selectedLevel.modeOptions ??= new ModeOptions();
            selectedLevel.modeOptions.lockedBottles = selectedLevel.bottles.Any(bottle => bottle.isLocked);
            selectedLevel.modeOptions.colorLockedBottles = selectedLevel.bottles.Any(bottle => bottle.isColorLocked);

            if (megaCount > 0)
            {
                selectedLevel.modeOptions.megaBottle = true;
                foreach (BottleData megaBottle in selectedLevel.bottles.Where(bottle => bottle.isMegaBottle))
                {
                    int availableTargetLayers = selectedLevel.bottles
                        .Where(bottle => !bottle.isMegaBottle)
                        .SelectMany(bottle => bottle.colorsBottomToTop ?? new List<int>())
                        .Count(color => color == megaBottle.targetColor);
                    int requiredTargetLayers = Mathf.Max(0, megaBottle.Capacity - megaBottle.colorsBottomToTop.Count);
                    if (availableTargetLayers < requiredTargetLayers)
                    {
                        validationMessages.Add($"Mega bottle needs {requiredTargetLayers} more target-color layers, but only {availableTargetLayers} exist in default bottles.");
                    }
                }
            }
            else if (selectedLevel.modeOptions != null)
            {
                selectedLevel.modeOptions.megaBottle = false;
            }

            if (adCount < 2 || adCount > 3)
            {
                validationMessages.Add("Generated levels should keep 2 or 3 ads bottles.");
            }
        }

        private Dictionary<Vector2Int, int> BuildGridIndex()
        {
            Dictionary<Vector2Int, int> occupied = new();
            for (int i = 0; i < selectedLevel.bottles.Count; i++)
            {
                BottleData bottle = selectedLevel.bottles[i];
                EnsureGridPosition(bottle);
                Vector2Int position = bottle.GridPosition;
                if (!occupied.ContainsKey(position))
                {
                    occupied[position] = i;
                }
            }

            return occupied;
        }

        private bool TryFindFreeGridCell(out Vector2Int position)
        {
            EnsureLayoutGrid();
            Dictionary<Vector2Int, int> occupied = BuildGridIndex();
            for (int y = 0; y < selectedLevel.layoutGrid.rows; y++)
            {
                for (int x = 0; x < selectedLevel.layoutGrid.columns; x++)
                {
                    position = new Vector2Int(x, y);
                    if (!occupied.ContainsKey(position))
                    {
                        return true;
                    }
                }
            }

            position = default;
            return false;
        }

        private void EnsureAllGridPositions()
        {
            HashSet<Vector2Int> used = new();
            for (int i = 0; i < selectedLevel.bottles.Count; i++)
            {
                BottleData bottle = selectedLevel.bottles[i];
                EnsureGridPosition(bottle);
                Vector2Int position = bottle.GridPosition;
                if (position.x < 0 || position.x >= selectedLevel.layoutGrid.columns || position.y < 0 || position.y >= selectedLevel.layoutGrid.rows || used.Contains(position))
                {
                    if (TryFindFreeGridCell(out Vector2Int free))
                    {
                        bottle.gridPosition = new GridPosition { x = free.x, y = free.y };
                        position = free;
                    }
                }

                used.Add(position);
            }
        }

        private void EnsureLayoutGrid()
        {
            selectedLevel.layoutGrid ??= new LayoutGrid { columns = DefaultColumns, rows = DefaultRows, shape = "dense" };
            if (selectedLevel.layoutGrid.columns <= 0) selectedLevel.layoutGrid.columns = DefaultColumns;
            if (selectedLevel.layoutGrid.rows <= 0) selectedLevel.layoutGrid.rows = DefaultRows;
            if (string.IsNullOrWhiteSpace(selectedLevel.layoutGrid.shape)) selectedLevel.layoutGrid.shape = "dense";
        }

        private static void EnsureGridPosition(BottleData bottle)
        {
            bottle.gridPosition ??= new GridPosition();
        }

        private void LoadPaletteColors()
        {
            paletteColors.Clear();
            if (!File.Exists(palettePath))
            {
                return;
            }

            string text = File.ReadAllText(palettePath);
            foreach (Match match in Regex.Matches(text, @"-\s*\{r:\s*([0-9.]+),\s*g:\s*([0-9.]+),\s*b:\s*([0-9.]+),\s*a:\s*([0-9.]+)\}"))
            {
                paletteColors.Add(new Color(
                    float.Parse(match.Groups[1].Value),
                    float.Parse(match.Groups[2].Value),
                    float.Parse(match.Groups[3].Value),
                    float.Parse(match.Groups[4].Value)));
            }
        }

        private Dictionary<int, int> GetUsedColors()
        {
            Dictionary<int, int> usage = new();
            if (selectedLevel?.bottles == null)
            {
                return usage;
            }

            foreach (BottleData bottle in selectedLevel.bottles)
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
            if (colorIndex < 0)
            {
                return new Color(0.08f, 0.08f, 0.08f, 1f);
            }

            if (colorIndex >= paletteColors.Count)
            {
                return Color.magenta;
            }

            return paletteColors[colorIndex];
        }

        private static string GridCellLabel(int bottleIndex, BottleData bottle)
        {
            string state = bottle.isMegaBottle
                ? "M"
                : bottle.isAdBottle
                ? "A"
                : bottle.isColorLocked
                ? "C"
                : bottle.isLocked
                ? "L"
                : "N";
            return $"{bottleIndex + 1}\n{state}";
        }

        private Color GridCellColor(int bottleIndex, BottleData bottle)
        {
            if (bottleIndex == selectedBottleIndex)
            {
                return new Color(1f, 0.88f, 0.25f);
            }

            if (bottle.isAdBottle)
            {
                return new Color(1f, 0.72f, 0.2f);
            }

            if (bottle.isMegaBottle)
            {
                return new Color(0.68f, 0.42f, 1f);
            }

            if (bottle.isColorLocked)
            {
                return new Color(1f, 0.55f, 0.35f);
            }

            return bottle.isLocked ? new Color(0.65f, 0.72f, 0.9f) : Color.white;
        }

        private static BottleKind GetBottleKind(BottleData bottle)
        {
            if (bottle.isMegaBottle) return BottleKind.Mega;
            if (bottle.isAdBottle) return BottleKind.Ads;
            if (bottle.isColorLocked) return BottleKind.ColorLocked;
            return bottle.isLocked ? BottleKind.Locked : BottleKind.Normal;
        }

        private static void SetBottleKind(BottleData bottle, BottleKind kind)
        {
            bottle.isAdBottle = kind == BottleKind.Ads;
            bottle.isLocked = kind == BottleKind.Locked;
            bottle.isColorLocked = kind == BottleKind.ColorLocked;
            bottle.isMegaBottle = kind == BottleKind.Mega;
            if (bottle.isAdBottle)
            {
                bottle.colorsBottomToTop ??= new List<int>();
                bottle.colorsBottomToTop.Clear();
                bottle.isLocked = false;
                bottle.isColorLocked = false;
                bottle.isMegaBottle = false;
            }
            else if (bottle.isMegaBottle)
            {
                bottle.colorsBottomToTop ??= new List<int>();
                bottle.capacity = Mathf.Max(12, bottle.capacity);
                bottle.targetColor = bottle.colorsBottomToTop.Count > 0 ? bottle.colorsBottomToTop[0] : Mathf.Max(0, bottle.targetColor);
                if (bottle.colorsBottomToTop.Count == 0)
                {
                    bottle.colorsBottomToTop.Add(bottle.targetColor);
                }
                bottle.isLocked = false;
                bottle.isColorLocked = false;
                bottle.isAdBottle = false;
            }
            else if (bottle.isColorLocked)
            {
                bottle.isLocked = false;
                bottle.isAdBottle = false;
                bottle.isMegaBottle = false;
                bottle.unlockCompletedColorBottleCount = Mathf.Max(1, bottle.unlockCompletedColorBottleCount);
            }
            else if (bottle.isLocked)
            {
                bottle.isColorLocked = false;
                bottle.isAdBottle = false;
                bottle.isMegaBottle = false;
            }
            else
            {
                bottle.capacity = Mathf.Clamp(bottle.capacity, 2, 5);
            }
        }

        private int NextDefaultColor()
        {
            return paletteColors.Count <= 0 ? 0 : GetUsedColors().Count % paletteColors.Count;
        }

        private static void TrimBottleToCapacity(BottleData bottle)
        {
            bottle.colorsBottomToTop ??= new List<int>();
            while (bottle.colorsBottomToTop.Count > bottle.Capacity)
            {
                bottle.colorsBottomToTop.RemoveAt(bottle.colorsBottomToTop.Count - 1);
            }
        }

        private static BottleData CloneBottle(BottleData bottle)
        {
            return new BottleData
            {
                capacity = bottle.Capacity,
                colorsBottomToTop = bottle.colorsBottomToTop != null ? new List<int>(bottle.colorsBottomToTop) : new List<int>(),
                hiddenLayerIndexes = bottle.hiddenLayerIndexes != null ? new List<int>(bottle.hiddenLayerIndexes) : new List<int>(),
                gridPosition = new GridPosition { x = bottle.gridPosition?.x ?? 0, y = bottle.gridPosition?.y ?? 0 },
                isLocked = bottle.isLocked,
                unlockCompletedBottleCount = bottle.unlockCompletedBottleCount,
                isColorLocked = bottle.isColorLocked,
                unlockRequiredColor = bottle.unlockRequiredColor,
                unlockCompletedColorBottleCount = bottle.unlockCompletedColorBottleCount,
                isAdBottle = bottle.isAdBottle,
                isMegaBottle = bottle.isMegaBottle,
                targetColor = bottle.targetColor
            };
        }

        private static void MoveLayer(BottleData bottle, int from, int to)
        {
            if (to < 0 || to >= bottle.colorsBottomToTop.Count)
            {
                return;
            }

            (bottle.colorsBottomToTop[from], bottle.colorsBottomToTop[to]) = (bottle.colorsBottomToTop[to], bottle.colorsBottomToTop[from]);
        }

        private enum BottleKind
        {
            Normal,
            Locked,
            ColorLocked,
            Ads,
            Mega
        }

        [Serializable]
        private sealed class LevelPack
        {
            public string packName;
            public List<LevelData> levels = new();
        }

        [Serializable]
        private sealed class LevelData
        {
            public string displayName;
            public LayoutGrid layoutGrid = new();
            public ModeOptions modeOptions = new();
            public List<BottleData> bottles = new();
        }

        [Serializable]
        private sealed class LayoutGrid
        {
            public int columns = DefaultColumns;
            public int rows = DefaultRows;
            public string shape = "dense";
        }

        [Serializable]
        private sealed class ModeOptions
        {
            public bool hiddenStack;
            public bool hybridHiddenStack;
            public bool lockedBottles;
            public bool colorLockedBottles;
            public bool megaBottle;
        }

        [Serializable]
        private sealed class GridPosition
        {
            public int x;
            public int y;
        }

        [Serializable]
        private sealed class BottleData
        {
            public int capacity = 4;
            public List<int> colorsBottomToTop = new();
            public List<int> hiddenLayerIndexes = new();
            public GridPosition gridPosition = new();
            public bool isLocked;
            public int unlockCompletedBottleCount = 1;
            public bool isColorLocked;
            public int unlockRequiredColor;
            public int unlockCompletedColorBottleCount = 1;
            public bool isAdBottle;
            public bool isMegaBottle;
            public int targetColor;

            public int Capacity => isMegaBottle ? Mathf.Max(12, capacity) : Mathf.Clamp(capacity, 2, 5);
            public Vector2Int GridPosition => gridPosition == null ? Vector2Int.zero : new Vector2Int(gridPosition.x, gridPosition.y);
        }

        [Serializable]
        private sealed class SolutionPack
        {
            public string packName;
            public List<LevelSolution> levelSolutions = new();
        }

        [Serializable]
        private sealed class LevelSolution
        {
            public int levelNumber;
            public SolutionData solutionData = new();
        }

        [Serializable]
        private sealed class SolutionData
        {
            public int solutionCount;
            public int shortestStepCount;
            public int storedSolutionCount;
            public bool storesAllSolutions;
            public string selectionPolicy;
            public List<SolutionEntry> solutions = new();
        }

        [Serializable]
        private sealed class SolutionEntry
        {
            public int stepCount;
            public List<SolutionMove> moves = new();
        }

        [Serializable]
        private sealed class SolutionMove
        {
            public int fromBottle;
            public int toBottle;
        }
    }
}
#endif
