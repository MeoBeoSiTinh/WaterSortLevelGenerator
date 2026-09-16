using System;
using System.Collections.Generic;
using System.Text;
using TrainWaterSort.Core.WaterSort;
using TrainWaterSort.Gameplay.WaterSort;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace TrainWaterSort.UI.WaterSort
{
    public sealed class WaterSortGameView : MonoBehaviour
    {
        private const int GridColumns = 8;
        private const int GridRows = 5;
        private const float WebInspectionPanelWidth = 300f;
        private const int MaxSavedLevels = 100;

        private readonly List<Button> bottleButtons = new();
        private readonly List<Image> bottleOutlines = new();
        private readonly List<List<Image>> slotImages = new();
        private readonly List<List<Text>> slotQuestionTexts = new();
        private readonly List<Text> bottleLockedTexts = new();
        private readonly List<Text> bottleAdTexts = new();
        private readonly List<Text> bottleMegaTexts = new();
        private readonly List<SavedLevelEntry> savedLevels = new();

        private WaterSortGameManager manager;
        private Text messageText;
        private Text titleText;
        private Button undoButton;
        private Button previousLevelButton;
        private Button nextLevelButton;
        private InputField levelInput;
        private Text levelCounterText;
        private Transform boardRoot;
        private GridLayoutGroup boardGrid;
        private RectTransform boardRect;
        private Vector2 lastBoardSize;
        private int lastRebuiltLevelIndex = -1;
        private bool usingPlaybandLayout;
        private readonly List<RectTransform> playbandBottleRects = new();
        private Text metricsText;
        private Text solutionStepsText;
        private RectTransform metricsContent;
        private RectTransform solutionContent;
        private RectTransform savedListContent;
        private Text savedEmptyText;
        private Font inspectionFont;
        private bool inspectionLandscape;
        private static readonly Color TextPrimary = new(0.92f, 0.95f, 0.98f, 1f);
        private static readonly Color TextSecondary = new(0.72f, 0.78f, 0.86f, 1f);
        private static readonly Color PanelBackground = new(0.08f, 0.1f, 0.13f, 0.94f);

        private sealed class SavedLevelEntry
        {
            public string PackId;
            public int LevelId;
            public int CatalogIndex;
            public string DisplayName;
            public WaterSortJsonLevel Level;
        }

        private static bool ShowWebInspectionPanels
        {
            get
            {
#if UNITY_WEBGL
                return true;
#else
                return false;
#endif
            }
        }

        public void Initialize(WaterSortGameManager gameManager)
        {
            manager = gameManager;
            BuildUi();
            Bind();
            SetMessage(manager.CurrentMessage);
            Refresh();
        }

        private void OnDestroy()
        {
            if (manager == null)
            {
                return;
            }

            manager.StateChanged -= Refresh;
            manager.MessageChanged -= SetMessage;
            manager.WinStateChanged -= SetWinState;
        }

        private void Bind()
        {
            manager.StateChanged += Refresh;
            manager.MessageChanged += SetMessage;
            manager.WinStateChanged += SetWinState;
        }

        private void BuildUi()
        {
            Canvas canvas = CreateCanvas();
            Font font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            bool landscape = Screen.width >= Screen.height;
            bool inspection = ShowWebInspectionPanels;
            float headerHeight = landscape ? 132f : 168f;
            float footerHeight = landscape ? 64f : 88f;
            float sidePad = landscape ? 20f : 24f;
            float leftInset = sidePad + (inspection ? WebInspectionPanelWidth + 12f : 0f);
            float rightInset = sidePad + (inspection ? WebInspectionPanelWidth + 12f : 0f);

            RectTransform root = CreateRect("Root", canvas.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            Image background = root.gameObject.AddComponent<Image>();
            background.color = new Color(0.04f, 0.05f, 0.07f);
            background.raycastTarget = false;

            if (inspection)
            {
                inspectionFont = font;
                inspectionLandscape = landscape;

                metricsText = CreateInspectionPanel(
                    "MetricsPanel",
                    root,
                    font,
                    "Level summary",
                    new Vector2(0f, 0.5f),
                    new Vector2(0f, 1f),
                    new Vector2(sidePad, 4f),
                    new Vector2(sidePad + WebInspectionPanelWidth, -(headerHeight + 8f)),
                    out metricsContent);

                solutionStepsText = CreateInspectionPanel(
                    "SolutionPanel",
                    root,
                    font,
                    "Solution hint",
                    new Vector2(0f, 0f),
                    new Vector2(0f, 0.5f),
                    new Vector2(sidePad, footerHeight + 8f),
                    new Vector2(sidePad + WebInspectionPanelWidth, -4f),
                    out solutionContent);

                CreateSavedLevelsPanel(
                    root,
                    font,
                    landscape,
                    new Vector2(1f, 0f),
                    new Vector2(1f, 1f),
                    new Vector2(-(sidePad + WebInspectionPanelWidth), footerHeight + 8f),
                    new Vector2(-sidePad, -(headerHeight + 8f)));
            }

            RectTransform header = CreateRect("Header", root, new Vector2(0f, 1f), Vector2.one,
                new Vector2(leftInset, -headerHeight), new Vector2(-rightInset, -12f));
            VerticalLayoutGroup headerLayout = header.gameObject.AddComponent<VerticalLayoutGroup>();
            headerLayout.spacing = 8f;
            headerLayout.childAlignment = TextAnchor.UpperCenter;
            headerLayout.childControlWidth = true;
            headerLayout.childControlHeight = true;
            headerLayout.childForceExpandWidth = true;
            headerLayout.childForceExpandHeight = false;
            headerLayout.padding = new RectOffset(0, 0, 0, 0);

            RectTransform topBar = CreateRect("TopBar", header, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            topBar.gameObject.AddComponent<LayoutElement>().preferredHeight = landscape ? 56f : 68f;
            HorizontalLayoutGroup topLayout = topBar.gameObject.AddComponent<HorizontalLayoutGroup>();
            topLayout.spacing = 10f;
            topLayout.childAlignment = TextAnchor.MiddleCenter;
            topLayout.childControlWidth = true;
            topLayout.childControlHeight = true;
            topLayout.childForceExpandWidth = false;
            topLayout.childForceExpandHeight = true;

            titleText = CreateText("Title", topBar, font, "Water Sort", landscape ? 28 : 34, TextAnchor.MiddleLeft, TextPrimary);
            titleText.GetComponent<LayoutElement>().flexibleWidth = 1f;

            undoButton = CreateButton("UndoButton", topBar, font, "Undo", () => manager.Undo(), landscape);
            CreateButton("RestartButton", topBar, font, "Restart", () => manager.RestartLevel(), landscape);

            RectTransform levelsPanel = CreateRect("LevelSelect", header, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            levelsPanel.gameObject.AddComponent<LayoutElement>().preferredHeight = landscape ? 48f : 60f;
            HorizontalLayoutGroup levelsLayout = levelsPanel.gameObject.AddComponent<HorizontalLayoutGroup>();
            levelsLayout.spacing = 8f;
            levelsLayout.childAlignment = TextAnchor.MiddleCenter;
            levelsLayout.childControlWidth = true;
            levelsLayout.childControlHeight = true;
            levelsLayout.childForceExpandWidth = false;
            levelsLayout.childForceExpandHeight = true;

            previousLevelButton = CreateButton("PreviousLevelButton", levelsPanel, font, "<", LoadPreviousLevel, landscape);
            previousLevelButton.GetComponent<LayoutElement>().preferredWidth = landscape ? 56f : 72f;

            levelInput = CreateInputField("LevelInput", levelsPanel, font, landscape);
            levelInput.onEndEdit.AddListener(_ => LoadTypedLevel());

            Button goButton = CreateButton("GoLevelButton", levelsPanel, font, "Go", LoadTypedLevel, landscape);
            goButton.GetComponent<LayoutElement>().preferredWidth = landscape ? 72f : 92f;

            nextLevelButton = CreateButton("NextLevelButton", levelsPanel, font, ">", LoadNextLevel, landscape);
            nextLevelButton.GetComponent<LayoutElement>().preferredWidth = landscape ? 56f : 72f;

            levelCounterText = CreateText("LevelCounter", levelsPanel, font, "", landscape ? 20 : 24, TextAnchor.MiddleLeft, TextSecondary);
            LayoutElement counterLayout = levelCounterText.GetComponent<LayoutElement>();
            counterLayout.preferredWidth = landscape ? 120f : 180f;
            counterLayout.flexibleWidth = 0f;

            boardRect = CreateRect("Board", root, Vector2.zero, Vector2.one,
                new Vector2(leftInset, footerHeight + 8f), new Vector2(-rightInset, -(headerHeight + 8f)));
            boardRect.gameObject.AddComponent<RectMask2D>();
            boardGrid = boardRect.gameObject.AddComponent<GridLayoutGroup>();
            boardGrid.spacing = new Vector2(8f, 8f);
            boardGrid.childAlignment = TextAnchor.MiddleCenter;
            boardGrid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            boardGrid.constraintCount = GridColumns;
            boardRoot = boardRect;
            FitBoardGrid(force: true);

            RectTransform bottomBar = CreateRect("MessageBar", root, Vector2.zero, new Vector2(1f, 0f),
                new Vector2(leftInset, 10f), new Vector2(-rightInset, footerHeight));
            messageText = CreateText("Message", bottomBar, font, "", landscape ? 22 : 26, TextAnchor.MiddleCenter, TextSecondary);
            Stretch(messageText.rectTransform);
        }

        private Text CreateInspectionPanel(
            string name,
            Transform parent,
            Font font,
            string title,
            Vector2 anchorMin,
            Vector2 anchorMax,
            Vector2 offsetMin,
            Vector2 offsetMax,
            out RectTransform contentRect)
        {
            RectTransform panel = CreateRect(name, parent, anchorMin, anchorMax, offsetMin, offsetMax);
            Image panelImage = panel.gameObject.AddComponent<Image>();
            panelImage.color = PanelBackground;
            panelImage.raycastTarget = true;

            RectTransform titleRect = CreateRect("Title", panel, new Vector2(0f, 1f), Vector2.one, new Vector2(14f, -42f), new Vector2(-14f, -10f));
            Text titleLabel = CreateText("TitleLabel", titleRect, font, title, 20, TextAnchor.MiddleLeft, TextPrimary);
            Stretch(titleLabel.rectTransform);

            RectTransform scrollRoot = CreateRect("Scroll", panel, Vector2.zero, Vector2.one, new Vector2(8f, 8f), new Vector2(-8f, -48f));
            ScrollRect scroll = scrollRoot.gameObject.AddComponent<ScrollRect>();
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.movementType = ScrollRect.MovementType.Clamped;
            scroll.scrollSensitivity = 28f;

            RectTransform viewport = CreateRect("Viewport", scrollRoot, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            viewport.gameObject.AddComponent<RectMask2D>();
            Image viewportImage = viewport.gameObject.AddComponent<Image>();
            viewportImage.color = new Color(0f, 0f, 0f, 0.01f);
            viewportImage.raycastTarget = true;

            contentRect = CreateRect("Content", viewport, new Vector2(0f, 1f), Vector2.one, Vector2.zero, Vector2.zero);
            contentRect.pivot = new Vector2(0.5f, 1f);

            Text body = CreateText("Body", contentRect, font, "", 16, TextAnchor.UpperLeft, TextSecondary);
            body.horizontalOverflow = HorizontalWrapMode.Wrap;
            body.verticalOverflow = VerticalWrapMode.Overflow;
            LayoutElement bodyLayout = body.GetComponent<LayoutElement>();
            bodyLayout.minHeight = 40f;
            bodyLayout.flexibleHeight = 0f;
            Stretch(body.rectTransform);
            body.rectTransform.offsetMin = new Vector2(6f, 6f);
            body.rectTransform.offsetMax = new Vector2(-6f, -6f);

            scroll.viewport = viewport;
            scroll.content = contentRect;
            return body;
        }

        private void CreateSavedLevelsPanel(
            Transform parent,
            Font font,
            bool landscape,
            Vector2 anchorMin,
            Vector2 anchorMax,
            Vector2 offsetMin,
            Vector2 offsetMax)
        {
            RectTransform panel = CreateRect("SavedLevelsPanel", parent, anchorMin, anchorMax, offsetMin, offsetMax);
            Image panelImage = panel.gameObject.AddComponent<Image>();
            panelImage.color = PanelBackground;
            panelImage.raycastTarget = true;

            RectTransform titleRect = CreateRect("Title", panel, new Vector2(0f, 1f), Vector2.one, new Vector2(14f, -42f), new Vector2(-14f, -10f));
            Text titleLabel = CreateText("TitleLabel", titleRect, font, "Saved levels", 20, TextAnchor.MiddleLeft, TextPrimary);
            Stretch(titleLabel.rectTransform);

            RectTransform toolbar = CreateRect("Toolbar", panel, new Vector2(0f, 1f), Vector2.one, new Vector2(8f, -88f), new Vector2(-8f, -46f));
            HorizontalLayoutGroup toolbarLayout = toolbar.gameObject.AddComponent<HorizontalLayoutGroup>();
            toolbarLayout.spacing = 6f;
            toolbarLayout.childAlignment = TextAnchor.MiddleCenter;
            toolbarLayout.childControlWidth = true;
            toolbarLayout.childControlHeight = true;
            toolbarLayout.childForceExpandWidth = false;
            toolbarLayout.childForceExpandHeight = true;

            Button saveButton = CreateButton("SaveButton", toolbar, font, "Save", SaveCurrentLevelToList, landscape);
            saveButton.GetComponent<LayoutElement>().preferredWidth = 70f;
            saveButton.GetComponent<LayoutElement>().preferredHeight = 36f;

            Button exportButton = CreateButton("ExportButton", toolbar, font, "Export", ExportSavedLevelsToFile, landscape);
            exportButton.GetComponent<LayoutElement>().preferredWidth = 78f;
            exportButton.GetComponent<LayoutElement>().preferredHeight = 36f;

            Button clearButton = CreateButton("ClearAllButton", toolbar, font, "Del all", ClearAllSavedLevels, landscape);
            clearButton.GetComponent<LayoutElement>().preferredWidth = 78f;
            clearButton.GetComponent<LayoutElement>().preferredHeight = 36f;

            RectTransform scrollRoot = CreateRect("Scroll", panel, Vector2.zero, Vector2.one, new Vector2(8f, 8f), new Vector2(-8f, -96f));
            ScrollRect scroll = scrollRoot.gameObject.AddComponent<ScrollRect>();
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.movementType = ScrollRect.MovementType.Clamped;
            scroll.scrollSensitivity = 28f;

            RectTransform viewport = CreateRect("Viewport", scrollRoot, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            viewport.gameObject.AddComponent<RectMask2D>();
            Image viewportImage = viewport.gameObject.AddComponent<Image>();
            viewportImage.color = new Color(0f, 0f, 0f, 0.01f);
            viewportImage.raycastTarget = true;

            savedListContent = CreateRect("Content", viewport, new Vector2(0f, 1f), Vector2.one, Vector2.zero, Vector2.zero);
            savedListContent.pivot = new Vector2(0.5f, 1f);
            VerticalLayoutGroup listLayout = savedListContent.gameObject.AddComponent<VerticalLayoutGroup>();
            listLayout.spacing = 6f;
            listLayout.padding = new RectOffset(2, 2, 2, 2);
            listLayout.childAlignment = TextAnchor.UpperCenter;
            listLayout.childControlWidth = true;
            listLayout.childControlHeight = true;
            listLayout.childForceExpandWidth = true;
            listLayout.childForceExpandHeight = false;
            ContentSizeFitter fitter = savedListContent.gameObject.AddComponent<ContentSizeFitter>();
            fitter.horizontalFit = ContentSizeFitter.FitMode.Unconstrained;
            fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            savedEmptyText = CreateText("Empty", savedListContent, font, "No saved levels.\nSave keys by pack + id.", 15, TextAnchor.UpperLeft, TextSecondary);
            savedEmptyText.horizontalOverflow = HorizontalWrapMode.Wrap;
            savedEmptyText.verticalOverflow = VerticalWrapMode.Overflow;
            LayoutElement emptyLayout = savedEmptyText.GetComponent<LayoutElement>();
            emptyLayout.minHeight = 64f;
            emptyLayout.preferredHeight = 72f;

            scroll.viewport = viewport;
            scroll.content = savedListContent;
            RefreshSavedLevelsList();
        }

        private void SaveCurrentLevelToList()
        {
            WaterSortJsonLevel level = manager?.CurrentLevel;
            if (level == null || manager.Catalog == null)
            {
                SetMessage("No level to save.");
                return;
            }

            int catalogIndex = manager.CurrentLevelIndex;
            int levelId = level.ResolvedId(catalogIndex);
            string packId = string.IsNullOrWhiteSpace(level.sourcePackId) ? "-" : level.sourcePackId;
            for (int i = 0; i < savedLevels.Count; i++)
            {
                if (string.Equals(savedLevels[i].PackId, packId, StringComparison.Ordinal)
                    && savedLevels[i].LevelId == levelId)
                {
                    SetMessage($"{level.GetDisplayName(catalogIndex)} is already saved (#{i + 1}).");
                    return;
                }
            }

            if (savedLevels.Count >= MaxSavedLevels)
            {
                SetMessage($"Saved list is full ({MaxSavedLevels}).");
                return;
            }

            savedLevels.Add(new SavedLevelEntry
            {
                PackId = packId,
                LevelId = levelId,
                CatalogIndex = catalogIndex,
                DisplayName = level.GetDisplayName(catalogIndex),
                Level = WaterSortLevelJsonExport.CloneLevel(level, includeSolutionData: false)
            });
            RefreshSavedLevelsList();
            SetMessage($"Saved {level.GetDisplayName(catalogIndex)}.");
        }

        private void ExportSavedLevelsToFile()
        {
            if (savedLevels.Count == 0)
            {
                SetMessage("Nothing to export — save levels first.");
                return;
            }

            List<WaterSortJsonLevel> exportLevels = new(savedLevels.Count);
            HashSet<string> usedNames = new(StringComparer.Ordinal);
            for (int i = 0; i < savedLevels.Count; i++)
            {
                SavedLevelEntry entry = savedLevels[i];
                WaterSortJsonLevel clone = WaterSortLevelJsonExport.CloneLevel(entry.Level, includeSolutionData: false);
                // One exported pack cannot reuse colliding pack-local ids/names from multiple sources.
                clone.id = i + 1;
                clone.displayName = BuildUniqueExportDisplayName(entry, i, usedNames);
                exportLevels.Add(clone);
            }

            string json = WaterSortLevelJsonExport.BuildLevelPackJson("Saved Water Sort Levels", exportLevels);
            string filename = $"watersort-levels-export-{System.DateTime.UtcNow:yyyyMMdd-HHmmss}.json";
            string path = WaterSortFileDownload.DownloadText(filename, json);
            SetMessage($"Exported {exportLevels.Count} level(s) → WaterSortExport.\n{path}");
        }

        private static string BuildUniqueExportDisplayName(SavedLevelEntry entry, int index, HashSet<string> usedNames)
        {
            string raw = entry.Level != null
                ? entry.Level.GetBaseDisplayName(Mathf.Max(0, entry.LevelId - 1))
                : $"Level {entry.LevelId}";
            string packId = string.IsNullOrWhiteSpace(entry.PackId) || entry.PackId == "-"
                ? null
                : entry.PackId;
            string candidate = packId == null ? raw : $"[{packId}] {raw}";
            if (!usedNames.Add(candidate))
            {
                candidate = $"{candidate} #{index + 1}";
                usedNames.Add(candidate);
            }

            return candidate;
        }

        private void ClearAllSavedLevels()
        {
            if (savedLevels.Count == 0)
            {
                return;
            }

            savedLevels.Clear();
            RefreshSavedLevelsList();
            SetMessage("Cleared all saved levels.");
        }

        private void MoveSavedLevel(int index, int delta)
        {
            int target = index + delta;
            if (index < 0 || index >= savedLevels.Count || target < 0 || target >= savedLevels.Count)
            {
                return;
            }

            SavedLevelEntry entry = savedLevels[index];
            savedLevels.RemoveAt(index);
            savedLevels.Insert(target, entry);
            RefreshSavedLevelsList();
        }

        private void RemoveSavedLevel(int index)
        {
            if (index < 0 || index >= savedLevels.Count)
            {
                return;
            }

            string name = savedLevels[index].DisplayName;
            savedLevels.RemoveAt(index);
            RefreshSavedLevelsList();
            SetMessage($"Removed {name} from saved list.");
        }

        private void JumpToSavedLevel(int index)
        {
            if (index < 0 || index >= savedLevels.Count || manager?.Catalog == null)
            {
                return;
            }

            SavedLevelEntry entry = savedLevels[index];
            int catalogIndex = entry.CatalogIndex;
            if (!MatchesSavedEntry(manager.Catalog.Levels, catalogIndex, entry))
            {
                catalogIndex = FindCatalogIndexByPackAndId(entry.PackId, entry.LevelId);
            }

            if (catalogIndex < 0)
            {
                SetMessage($"Saved {entry.DisplayName} is not in the loaded catalog.");
                return;
            }

            manager.LoadLevel(catalogIndex);
        }

        private static bool MatchesSavedEntry(IReadOnlyList<WaterSortJsonLevel> levels, int catalogIndex, SavedLevelEntry entry)
        {
            if (levels == null || catalogIndex < 0 || catalogIndex >= levels.Count || levels[catalogIndex] == null)
            {
                return false;
            }

            WaterSortJsonLevel level = levels[catalogIndex];
            string packId = string.IsNullOrWhiteSpace(level.sourcePackId) ? "-" : level.sourcePackId;
            return string.Equals(packId, entry.PackId, StringComparison.Ordinal)
                && level.ResolvedId(catalogIndex) == entry.LevelId;
        }

        private int FindCatalogIndexByPackAndId(string packId, int levelId)
        {
            if (manager?.Catalog?.Levels == null)
            {
                return -1;
            }

            for (int i = 0; i < manager.Catalog.Levels.Count; i++)
            {
                WaterSortJsonLevel level = manager.Catalog.Levels[i];
                if (level == null)
                {
                    continue;
                }

                string levelPack = string.IsNullOrWhiteSpace(level.sourcePackId) ? "-" : level.sourcePackId;
                if (string.Equals(levelPack, packId, StringComparison.Ordinal)
                    && level.ResolvedId(i) == levelId)
                {
                    return i;
                }
            }

            return -1;
        }

        private void RefreshSavedLevelsList()
        {
            if (savedListContent == null)
            {
                return;
            }

            for (int i = savedListContent.childCount - 1; i >= 0; i--)
            {
                Transform child = savedListContent.GetChild(i);
                if (savedEmptyText != null && child == savedEmptyText.transform)
                {
                    continue;
                }

                Destroy(child.gameObject);
            }

            if (savedEmptyText != null)
            {
                savedEmptyText.gameObject.SetActive(savedLevels.Count == 0);
            }

            if (inspectionFont == null)
            {
                return;
            }

            for (int i = 0; i < savedLevels.Count; i++)
            {
                CreateSavedLevelRow(i, savedLevels[i]);
            }

            LayoutRebuilder.ForceRebuildLayoutImmediate(savedListContent);
        }

        private void CreateSavedLevelRow(int index, SavedLevelEntry entry)
        {
            GameObject rowObject = new($"SavedLevel_{index}");
            rowObject.transform.SetParent(savedListContent, false);
            Image rowImage = rowObject.AddComponent<Image>();
            rowImage.color = new Color(0.12f, 0.15f, 0.2f, 0.95f);
            LayoutElement rowLayout = rowObject.AddComponent<LayoutElement>();
            rowLayout.preferredHeight = inspectionLandscape ? 40f : 48f;
            rowLayout.minHeight = 36f;

            HorizontalLayoutGroup rowGroup = rowObject.AddComponent<HorizontalLayoutGroup>();
            rowGroup.spacing = 4f;
            rowGroup.padding = new RectOffset(4, 4, 2, 2);
            rowGroup.childAlignment = TextAnchor.MiddleCenter;
            rowGroup.childControlWidth = true;
            rowGroup.childControlHeight = true;
            rowGroup.childForceExpandWidth = false;
            rowGroup.childForceExpandHeight = true;

            Button upButton = CreateButton($"Up_{index}", rowObject.transform, inspectionFont, "↑", () => MoveSavedLevel(index, -1), true);
            ConfigureCompactToolbarButton(upButton, 32f);
            upButton.interactable = index > 0;

            Button downButton = CreateButton($"Down_{index}", rowObject.transform, inspectionFont, "↓", () => MoveSavedLevel(index, 1), true);
            ConfigureCompactToolbarButton(downButton, 32f);
            downButton.interactable = index < savedLevels.Count - 1;

            string label = entry.DisplayName;
            if (label.Length > 18)
            {
                label = label.Substring(0, 16) + "…";
            }

            Button selectButton = CreateButton(
                $"Select_{index}",
                rowObject.transform,
                inspectionFont,
                $"{index + 1}. {label}",
                () => JumpToSavedLevel(index),
                true);
            LayoutElement selectLayout = selectButton.GetComponent<LayoutElement>();
            selectLayout.preferredWidth = 140f;
            selectLayout.flexibleWidth = 1f;
            selectLayout.preferredHeight = inspectionLandscape ? 34f : 40f;
            Text selectLabel = selectButton.GetComponentInChildren<Text>();
            if (selectLabel != null)
            {
                selectLabel.fontSize = 14;
                selectLabel.alignment = TextAnchor.MiddleLeft;
            }

            Button deleteButton = CreateButton($"Delete_{index}", rowObject.transform, inspectionFont, "X", () => RemoveSavedLevel(index), true);
            ConfigureCompactToolbarButton(deleteButton, 32f);
        }

        private static void ConfigureCompactToolbarButton(Button button, float width)
        {
            LayoutElement layout = button.GetComponent<LayoutElement>();
            layout.preferredWidth = width;
            layout.flexibleWidth = 0f;
            layout.preferredHeight = 34f;
            Text label = button.GetComponentInChildren<Text>();
            if (label != null)
            {
                label.fontSize = 16;
            }
        }

        private void LateUpdate()
        {
            if (usingPlaybandLayout)
            {
                FitPlaybandBottles(force: false);
            }
            else
            {
                FitBoardGrid(force: false);
            }
        }

        private void FitBoardGrid(bool force)
        {
            if (usingPlaybandLayout || boardRect == null || boardGrid == null)
            {
                return;
            }

            Vector2 size = boardRect.rect.size;
            if (!force && (size - lastBoardSize).sqrMagnitude < 0.25f)
            {
                return;
            }

            lastBoardSize = size;
            if (size.x <= 1f || size.y <= 1f)
            {
                return;
            }

            const float spacing = 8f;
            float maxWidth = (size.x - spacing * (GridColumns - 1)) / GridColumns;
            float maxHeight = (size.y - spacing * (GridRows - 1)) / GridRows;
            const float aspect = 118f / 190f;
            float width = Mathf.Min(maxWidth, maxHeight * aspect);
            float height = width / aspect;
            if (height > maxHeight)
            {
                height = maxHeight;
                width = height * aspect;
            }

            width = Mathf.Max(36f, width);
            height = Mathf.Max(58f, height);
            boardGrid.cellSize = new Vector2(width, height);
            boardGrid.spacing = new Vector2(spacing, spacing);
        }

        private void FitPlaybandBottles(bool force)
        {
            if (!usingPlaybandLayout || boardRect == null || playbandBottleRects.Count == 0)
            {
                return;
            }

            Vector2 size = boardRect.rect.size;
            if (!force && (size - lastBoardSize).sqrMagnitude < 0.25f)
            {
                return;
            }

            lastBoardSize = size;
            if (size.x <= 1f || size.y <= 1f)
            {
                return;
            }

            WaterSortJsonLevel level = manager?.CurrentLevel;
            ComputePlaybandBottleSize(size, level, playbandBottleRects.Count, out float width, out float height);
            for (int i = 0; i < playbandBottleRects.Count; i++)
            {
                RectTransform rect = playbandBottleRects[i];
                if (rect == null)
                {
                    continue;
                }

                bool mega = manager != null
                    && i < manager.Bottles.Count
                    && manager.Bottles[i].IsMegaBottle;
                float scale = mega ? PlaybandMegaScale : 1f;
                rect.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, width * scale);
                rect.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical, height * scale);
            }
        }

        private const float PlaybandMegaScale = 1.35f;
        // Air gap between bottle outlines; neighbor center pitch comes from boardLayout.
        private const float PlaybandBottleGapPixels = 4f;
        private const float PlaybandBottleAspect = 118f / 190f;
        private const float DefaultColPitch = 0.095f;
        private const float DefaultRowPitch = 0.132f;

        private void ComputePlaybandBottleSize(
            Vector2 boardSize,
            WaterSortJsonLevel level,
            int bottleCount,
            out float width,
            out float height)
        {
            float colPitch = level?.boardLayout != null && level.boardLayout.ColPitch > 0.01f
                ? level.boardLayout.ColPitch
                : DefaultColPitch;
            float rowPitch = level?.boardLayout != null && level.boardLayout.RowPitch > 0.01f
                ? level.boardLayout.RowPitch
                : DefaultRowPitch;

            // Size from fixed lattice pitch so every adjacent pair keeps the same visual gap.
            float maxWidthFromCols = colPitch * boardSize.x - PlaybandBottleGapPixels;
            float maxHeightFromRows = rowPitch * boardSize.y - PlaybandBottleGapPixels;
            float densityCap = Mathf.Min(maxWidthFromCols, maxHeightFromRows * PlaybandBottleAspect);
            densityCap = Mathf.Clamp(densityCap, 28f, 120f);

            if (level?.bottles == null || level.bottles.Count == 0)
            {
                width = densityCap;
                height = width / PlaybandBottleAspect;
                return;
            }

            int count = Mathf.Min(bottleCount, level.bottles.Count);
            Vector2[] centers = new Vector2[count];
            float[] scales = new float[count];
            for (int i = 0; i < count; i++)
            {
                centers[i] = ResolvePlaybandNormalized(level, i);
                scales[i] = level.bottles[i] != null && level.bottles[i].isMegaBottle
                    ? PlaybandMegaScale
                    : 1f;
            }

            float lo = 24f;
            float hi = densityCap;
            for (int iter = 0; iter < 22; iter++)
            {
                float mid = (lo + hi) * 0.5f;
                float midHeight = mid / PlaybandBottleAspect;
                if (PlaybandSizesFit(boardSize, centers, scales, mid, midHeight, PlaybandBottleGapPixels))
                {
                    lo = mid;
                }
                else
                {
                    hi = mid;
                }
            }

            // Prefer filling toward the lattice pitch (constant neighbor spacing).
            float pitchTarget = Mathf.Min(
                colPitch * boardSize.x - PlaybandBottleGapPixels,
                (rowPitch * boardSize.y - PlaybandBottleGapPixels) * PlaybandBottleAspect);
            width = Mathf.Clamp(Mathf.Min(lo, pitchTarget), 24f, densityCap);
            height = width / PlaybandBottleAspect;
        }

        private static bool PlaybandSizesFit(
            Vector2 boardSize,
            Vector2[] centers,
            float[] scales,
            float width,
            float height,
            float gapPixels)
        {
            for (int i = 0; i < centers.Length; i++)
            {
                float wi = width * scales[i];
                float hi = height * scales[i];
                for (int j = i + 1; j < centers.Length; j++)
                {
                    float wj = width * scales[j];
                    float hj = height * scales[j];
                    float dx = Mathf.Abs(centers[i].x - centers[j].x) * boardSize.x;
                    float dy = Mathf.Abs(centers[i].y - centers[j].y) * boardSize.y;
                    bool collideX = dx < (wi + wj) * 0.5f + gapPixels;
                    bool collideY = dy < (hi + hj) * 0.5f + gapPixels;
                    if (collideX && collideY)
                    {
                        return false;
                    }
                }
            }

            return true;
        }

        private Canvas CreateCanvas()
        {
            EnsureEventSystem();

            GameObject canvasObject = new("WaterSortCanvas");
            canvasObject.transform.SetParent(transform, false);

            Canvas canvas = canvasObject.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;

            CanvasScaler scaler = canvasObject.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            bool landscape = Screen.width >= Screen.height;
#if UNITY_WEBGL && !UNITY_EDITOR
            landscape = true;
#endif
            if (landscape)
            {
                scaler.referenceResolution = new Vector2(1920f, 1080f);
                scaler.matchWidthOrHeight = 0.55f;
            }
            else
            {
                scaler.referenceResolution = new Vector2(1080f, 2160f);
                scaler.matchWidthOrHeight = 0.5f;
            }

            canvasObject.AddComponent<GraphicRaycaster>();
            return canvas;
        }

        private static void EnsureEventSystem()
        {
            if (FindFirstObjectByType<EventSystem>() != null)
            {
                return;
            }

            GameObject eventSystemObject = new("EventSystem");
            eventSystemObject.AddComponent<EventSystem>();
            InputSystemUIInputModule inputModule = eventSystemObject.AddComponent<InputSystemUIInputModule>();
            inputModule.AssignDefaultActions();
        }

        private void LoadPreviousLevel()
        {
            if (manager.Catalog == null || manager.Catalog.Levels.Count == 0)
            {
                return;
            }

            manager.LoadLevel(manager.CurrentLevelIndex - 1);
        }

        private void LoadNextLevel()
        {
            if (manager.Catalog == null || manager.Catalog.Levels.Count == 0)
            {
                return;
            }

            manager.LoadLevel(manager.CurrentLevelIndex + 1);
        }

        private void LoadTypedLevel()
        {
            if (manager.Catalog == null || manager.Catalog.Levels.Count == 0 || levelInput == null)
            {
                return;
            }

            if (!int.TryParse(levelInput.text, out int levelNumber))
            {
                SetMessage("Enter a level number.");
                RefreshLevelSelector();
                return;
            }

            if (levelNumber < 1 || levelNumber > manager.Catalog.Levels.Count)
            {
                SetMessage($"Level must be 1-{manager.Catalog.Levels.Count}.");
                RefreshLevelSelector();
                return;
            }

            manager.LoadLevel(levelNumber - 1);
        }

        private void RebuildBottles()
        {
            ClearChildren(boardRoot);
            bottleButtons.Clear();
            bottleOutlines.Clear();
            slotImages.Clear();
            slotQuestionTexts.Clear();
            bottleLockedTexts.Clear();
            bottleAdTexts.Clear();
            bottleMegaTexts.Clear();
            playbandBottleRects.Clear();

            WaterSortJsonLevel level = manager.CurrentLevel;
            usingPlaybandLayout = level != null && level.UsesPlaybandLayout;
            if (boardGrid != null)
            {
                boardGrid.enabled = !usingPlaybandLayout;
            }

            if (usingPlaybandLayout)
            {
                RebuildPlaybandBottles(level);
            }
            else
            {
                RebuildGridBottles();
            }

            lastRebuiltLevelIndex = manager.CurrentLevelIndex;
            if (usingPlaybandLayout)
            {
                FitPlaybandBottles(force: true);
            }
            else
            {
                FitBoardGrid(force: true);
                if (boardRoot is RectTransform boardLayoutRect)
                {
                    LayoutRebuilder.ForceRebuildLayoutImmediate(boardLayoutRect);
                }
            }
        }

        private void RebuildPlaybandBottles(WaterSortJsonLevel level)
        {
            Vector2 boardSize = boardRect != null ? boardRect.rect.size : new Vector2(720f, 960f);
            if (boardSize.x <= 1f || boardSize.y <= 1f)
            {
                boardSize = new Vector2(720f, 960f);
            }

            ComputePlaybandBottleSize(boardSize, level, manager.Bottles.Count, out float width, out float height);

            for (int i = 0; i < manager.Bottles.Count; i++)
            {
                int bottleIndex = i;
                WaterSortBottleState bottle = manager.Bottles[i];
                Vector2 normalized = ResolvePlaybandNormalized(level, bottleIndex);

                GameObject holderObject = new($"PlaybandSlot{bottleIndex + 1}");
                RectTransform holder = holderObject.AddComponent<RectTransform>();
                holder.SetParent(boardRoot, false);
                holder.anchorMin = normalized;
                holder.anchorMax = normalized;
                holder.pivot = new Vector2(0.5f, 0.5f);
                holder.anchoredPosition = Vector2.zero;
                float scale = bottle.IsMegaBottle ? PlaybandMegaScale : 1f;
                holder.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, width * scale);
                holder.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical, height * scale);
                playbandBottleRects.Add(holder);

                Button button = CreateBottleButton(holder, bottleIndex, bottle.Capacity, bottle.IsMegaBottle, () => manager.SelectBottle(bottleIndex));
                bottleButtons.Add(button);
            }
        }

        private static Vector2 ResolvePlaybandNormalized(WaterSortJsonLevel level, int bottleIndex)
        {
            if (level?.bottles != null && bottleIndex >= 0 && bottleIndex < level.bottles.Count)
            {
                WaterSortJsonBottle data = level.bottles[bottleIndex];
                if (data?.layoutPosition != null)
                {
                    return data.LayoutNormalized;
                }
            }

            // Fallback spread if metadata is incomplete.
            float t = bottleIndex / Mathf.Max(1f, (level?.bottles?.Count ?? 1) - 1f);
            return new Vector2(Mathf.Lerp(0.12f, 0.88f, t), 0.5f);
        }

        private void RebuildGridBottles()
        {
            Transform[] cells = new Transform[GridColumns * GridRows];
            for (int i = 0; i < cells.Length; i++)
            {
                GameObject cellObject = new($"GridCell{i + 1}");
                RectTransform cellRect = cellObject.AddComponent<RectTransform>();
                cellObject.transform.SetParent(boardRoot, false);
                cellRect.anchorMin = new Vector2(0.5f, 0.5f);
                cellRect.anchorMax = new Vector2(0.5f, 0.5f);
                cellRect.pivot = new Vector2(0.5f, 0.5f);
                cells[i] = cellRect;
            }

            bool[] occupiedCells = new bool[cells.Length];
            for (int i = 0; i < manager.Bottles.Count; i++)
            {
                int bottleIndex = i;
                WaterSortBottleState bottle = manager.Bottles[i];
                int cellIndex = ResolveGridCellIndex(bottleIndex, occupiedCells);
                Button button = CreateBottleButton(cells[cellIndex], bottleIndex, bottle.Capacity, bottle.IsMegaBottle, () => manager.SelectBottle(bottleIndex));
                bottleButtons.Add(button);
            }
        }

        private int ResolveGridCellIndex(int bottleIndex, bool[] occupiedCells)
        {
            WaterSortJsonLevel level = manager.CurrentLevel;
            if (level?.bottles != null && bottleIndex >= 0 && bottleIndex < level.bottles.Count)
            {
                Vector2Int position = level.bottles[bottleIndex].GridPosition;
                if (position.x >= 0 && position.x < GridColumns && position.y >= 0 && position.y < GridRows)
                {
                    int gridIndex = position.y * GridColumns + position.x;
                    if (!occupiedCells[gridIndex])
                    {
                        occupiedCells[gridIndex] = true;
                        return gridIndex;
                    }
                }
            }

            for (int i = 0; i < occupiedCells.Length; i++)
            {
                if (!occupiedCells[i])
                {
                    occupiedCells[i] = true;
                    return i;
                }
            }

            return occupiedCells.Length - 1;
        }

        private Button CreateBottleButton(Transform parent, int bottleIndex, int capacity, bool isMegaBottle, UnityEngine.Events.UnityAction onClick)
        {
            GameObject bottleObject = new($"Bottle{bottleIndex + 1}");
            bottleObject.transform.SetParent(parent, false);

            Image outline = bottleObject.AddComponent<Image>();
            outline.color = new Color(1f, 1f, 1f, 0.65f);

            // Clip liquid slots so colors never bleed past the bottle outline.
            bottleObject.AddComponent<RectMask2D>();

            Button button = bottleObject.AddComponent<Button>();
            button.targetGraphic = outline;
            button.onClick.AddListener(onClick);

            RectTransform rect = bottleObject.GetComponent<RectTransform>();
            Stretch(rect);
            rect.offsetMin = new Vector2(3f, 3f);
            rect.offsetMax = new Vector2(-3f, -3f);

            // Stack lives in a child so lock/ad/mega overlays are not shifted by VerticalLayoutGroup.
            GameObject stackObject = new("Stack", typeof(RectTransform));
            stackObject.transform.SetParent(bottleObject.transform, false);
            RectTransform stackRect = stackObject.GetComponent<RectTransform>();
            Stretch(stackRect);
            // Inset keeps liquid inside the visible bottle rim.
            stackRect.offsetMin = new Vector2(6f, 8f);
            stackRect.offsetMax = new Vector2(-6f, -8f);

            VerticalLayoutGroup stack = stackObject.AddComponent<VerticalLayoutGroup>();
            stack.padding = new RectOffset(2, 2, 2, 2);
            stack.spacing = 2f;
            stack.childControlWidth = true;
            stack.childControlHeight = true;
            stack.childForceExpandWidth = true;
            stack.childForceExpandHeight = true;
            stack.childAlignment = TextAnchor.LowerCenter;

            List<Image> slots = new();
            List<Text> questionTexts = new();
            for (int i = capacity - 1; i >= 0; i--)
            {
                GameObject slotObject = new($"Slot{i + 1}");
                slotObject.transform.SetParent(stackObject.transform, false);
                Image slot = slotObject.AddComponent<Image>();
                slot.color = new Color(0.85f, 0.88f, 0.93f, 0.45f);
                slot.raycastTarget = false;
                LayoutElement slotLayout = slotObject.AddComponent<LayoutElement>();
                // Flexible heights avoid forcing minHeight past the bottle bounds (overflow cause).
                slotLayout.minHeight = 0f;
                slotLayout.preferredHeight = isMegaBottle ? 4f : 0f;
                slotLayout.flexibleHeight = 1f;

                Text questionText = CreateText(
                    "LockedLabel",
                    slotObject.transform,
                    Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"),
                    "?",
                    24,
                    TextAnchor.MiddleCenter,
                    Color.white);
                questionText.fontStyle = FontStyle.Bold;
                questionText.enabled = false;
                Stretch(questionText.rectTransform);

                slots.Insert(0, slot);
                questionTexts.Insert(0, questionText);
            }

            Text lockedText = CreateText(
                "LockedLabel",
                bottleObject.transform,
                Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"),
                "LOCK",
                22,
                TextAnchor.MiddleCenter,
                Color.white);
            lockedText.fontStyle = FontStyle.Bold;
            lockedText.enabled = false;
            lockedText.horizontalOverflow = HorizontalWrapMode.Overflow;
            lockedText.verticalOverflow = VerticalWrapMode.Overflow;
            LayoutElement lockedLayout = lockedText.GetComponent<LayoutElement>();
            lockedLayout.ignoreLayout = true;
            lockedLayout.minHeight = 0f;
            lockedLayout.preferredHeight = 0f;
            Stretch(lockedText.rectTransform);
            lockedText.rectTransform.anchoredPosition = Vector2.zero;
            Outline lockedOutline = lockedText.gameObject.AddComponent<Outline>();
            lockedOutline.enabled = false;
            lockedOutline.effectColor = new Color(0f, 0f, 0f, 0.95f);
            lockedOutline.effectDistance = new Vector2(2.5f, -2.5f);
            lockedOutline.useGraphicAlpha = true;
            lockedText.transform.SetAsLastSibling();

            Text adText = CreateText(
                "AdLabel",
                bottleObject.transform,
                Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"),
                "ADS",
                18,
                TextAnchor.UpperCenter,
                new Color(1f, 0.86f, 0.2f));
            adText.fontStyle = FontStyle.Bold;
            adText.enabled = false;
            LayoutElement adLayout = adText.GetComponent<LayoutElement>();
            adLayout.ignoreLayout = true;
            Stretch(adText.rectTransform);

            Text megaText = CreateText(
                "MegaLabel",
                bottleObject.transform,
                Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"),
                "MEGA",
                20,
                TextAnchor.LowerCenter,
                new Color(0.75f, 0.35f, 1f));
            megaText.fontStyle = FontStyle.Bold;
            megaText.enabled = false;
            LayoutElement megaLayout = megaText.GetComponent<LayoutElement>();
            megaLayout.ignoreLayout = true;
            Stretch(megaText.rectTransform);

            bottleOutlines.Add(outline);
            slotImages.Add(slots);
            slotQuestionTexts.Add(questionTexts);
            bottleLockedTexts.Add(lockedText);
            bottleAdTexts.Add(adText);
            bottleMegaTexts.Add(megaText);
            return button;
        }

        private void Refresh()
        {
            if (manager == null)
            {
                return;
            }

            if (ShouldRebuildBottles())
            {
                RebuildBottles();
            }

            bool hasPlayableCatalog = manager.Catalog != null
                && manager.Catalog.ColorPalette != null
                && manager.Catalog.ColorPalette.Colors.Count > 0
                && manager.Catalog.Levels.Count > 0
                && manager.CurrentLevelIndex >= 0
                && manager.CurrentLevelIndex < manager.Catalog.Levels.Count
                && manager.Catalog.Levels[manager.CurrentLevelIndex] != null;

            titleText.text = !hasPlayableCatalog
                ? "Water Sort"
                : manager.Catalog.Levels[manager.CurrentLevelIndex].GetDisplayName(manager.CurrentLevelIndex);

            for (int i = 0; i < manager.Bottles.Count; i++)
            {
                WaterSortBottleState bottle = manager.Bottles[i];
                bottleOutlines[i].color = bottle.IsLocked
                    ? new Color(0.18f, 0.19f, 0.22f, 0.95f)
                    : i == manager.SelectedBottleIndex
                    ? new Color(1f, 0.9f, 0.25f, 0.95f)
                    : bottle.IsMegaBottle
                    ? new Color(0.55f, 0.28f, 1f, 0.9f)
                    : bottle.IsAdBottle
                    ? new Color(1f, 0.78f, 0.18f, 0.8f)
                    : new Color(1f, 1f, 1f, 0.72f);
                Text lockedText = bottleLockedTexts[i];
                lockedText.enabled = bottle.IsLocked;
                if (bottle.IsLocked)
                {
                    RectTransform lockedRect = lockedText.rectTransform;
                    Outline lockedOutline = lockedText.GetComponent<Outline>();
                    Stretch(lockedRect);
                    lockedRect.offsetMin = Vector2.zero;
                    lockedRect.offsetMax = Vector2.zero;
                    lockedRect.anchoredPosition = Vector2.zero;
                    lockedText.alignment = TextAnchor.MiddleCenter;
                    lockedText.fontStyle = FontStyle.Bold;
                    lockedText.transform.SetAsLastSibling();
                    if (bottle.IsColorLocked)
                    {
                        lockedText.text = bottle.UnlockCompletedColorBottleCount.ToString();
                        lockedText.color = hasPlayableCatalog
                            ? manager.Catalog.GetColor(bottle.UnlockRequiredColor)
                            : Color.white;
                        lockedText.fontSize = 56;
                        lockedText.horizontalOverflow = HorizontalWrapMode.Overflow;
                        lockedText.verticalOverflow = VerticalWrapMode.Overflow;
                        if (lockedOutline == null)
                        {
                            lockedOutline = lockedText.gameObject.AddComponent<Outline>();
                        }

                        lockedOutline.enabled = true;
                        lockedOutline.effectColor = new Color(0f, 0f, 0f, 0.95f);
                        lockedOutline.effectDistance = new Vector2(3f, -3f);
                        lockedOutline.useGraphicAlpha = true;
                    }
                    else
                    {
                        lockedText.text = "LOCK";
                        lockedText.color = Color.white;
                        lockedText.fontSize = 22;
                        if (lockedOutline != null)
                        {
                            lockedOutline.enabled = false;
                        }
                    }
                }

                bottleAdTexts[i].enabled = bottle.IsAdBottle;
                bottleMegaTexts[i].enabled = bottle.IsMegaBottle;

                for (int slot = 0; slot < slotImages[i].Count; slot++)
                {
                    Image slotImage = slotImages[i][slot];
                    Text questionText = slotQuestionTexts[i][slot];
                    if (bottle.IsLocked)
                    {
                        slotImage.color = new Color(0.02f, 0.025f, 0.035f, 0.98f);
                        questionText.enabled = false;
                    }
                    else if (slot < bottle.Count)
                    {
                        if (bottle.IsLayerUnlocked(slot))
                        {
                            int colorIndex = bottle.ColorIndexes[slot];
                            slotImage.color = hasPlayableCatalog
                                ? manager.Catalog.GetColor(colorIndex)
                                : Color.magenta;
                            questionText.enabled = false;
                        }
                        else
                        {
                            slotImage.color = new Color(0.03f, 0.035f, 0.045f, 0.95f);
                            questionText.enabled = true;
                        }
                    }
                    else
                    {
                        slotImage.color = new Color(0.85f, 0.88f, 0.93f, 0.45f);
                        questionText.enabled = false;
                    }
                }
            }

            undoButton.interactable = manager.HasUndo;
            RefreshLevelSelector();
            RefreshInspectionPanels();
        }

        private void RefreshInspectionPanels()
        {
            if (metricsText == null || solutionStepsText == null)
            {
                return;
            }

            WaterSortJsonLevel level = manager.CurrentLevel;
            if (level == null)
            {
                metricsText.text = "No level loaded.";
                solutionStepsText.text = "No solution loaded.";
                ResizeInspectionContent(metricsContent, metricsText);
                ResizeInspectionContent(solutionContent, solutionStepsText);
                return;
            }

            metricsText.text = BuildMetricsText(level, manager.CurrentLevelIndex);
            solutionStepsText.text = BuildSolutionStepsText(level.solutionData);
            ResizeInspectionContent(metricsContent, metricsText);
            ResizeInspectionContent(solutionContent, solutionStepsText);
        }

        private static string BuildMetricsText(WaterSortJsonLevel level, int levelIndex)
        {
            int playable = 0;
            int ads = 0;
            int locked = 0;
            int mega = 0;
            int hiddenLayers = 0;
            HashSet<int> colors = new();
            foreach (WaterSortJsonBottle bottle in level.bottles ?? new List<WaterSortJsonBottle>())
            {
                if (bottle == null)
                {
                    continue;
                }

                if (bottle.IsAdBottle)
                {
                    ads++;
                }
                else
                {
                    playable++;
                }

                if (bottle.IsLocked)
                {
                    locked++;
                }

                if (bottle.IsMegaBottle)
                {
                    mega++;
                }

                if (bottle.hiddenLayerIndexes != null)
                {
                    hiddenLayers += bottle.hiddenLayerIndexes.Count;
                }

                if (bottle.colorsBottomToTop == null)
                {
                    continue;
                }

                foreach (int color in bottle.colorsBottomToTop)
                {
                    colors.Add(color);
                }
            }

            WaterSortJsonModeOptions modes = level.modeOptions ?? new WaterSortJsonModeOptions();
            WaterSortJsonSolutionData solution = level.solutionData ?? new WaterSortJsonSolutionData();
            WaterSortJsonDifficultyMetrics metrics = solution.difficultyMetrics;
            StringBuilder builder = new();

            builder.AppendLine(level.GetDisplayName(levelIndex));
            builder.AppendLine($"Difficulty: {(string.IsNullOrWhiteSpace(solution.difficulty) ? "-" : solution.difficulty)}");
            builder.AppendLine($"Stored steps: {Mathf.Max(solution.shortestStepCount, 0)}");
            builder.AppendLine();
            builder.AppendLine("Composition");
            builder.AppendLine($"• {playable} play bottles · {ads} Ads");
            builder.AppendLine($"• {colors.Count} colors");
            List<string> extras = new();
            if (locked > 0)
            {
                extras.Add($"{locked} locked");
            }

            if (mega > 0)
            {
                extras.Add($"{mega} Mega");
            }

            if (hiddenLayers > 0)
            {
                extras.Add($"{hiddenLayers} hidden layers");
            }

            if (extras.Count > 0)
            {
                builder.AppendLine($"• {string.Join(" · ", extras)}");
            }

            List<string> modeNames = new();
            if (modes.HiddenStack)
            {
                modeNames.Add("Hidden");
            }

            if (modes.HybridHiddenStack)
            {
                modeNames.Add("Hybrid");
            }

            if (modes.LockedBottles)
            {
                modeNames.Add("Locked");
            }

            if (modes.MegaBottle)
            {
                modeNames.Add("Mega");
            }

            builder.AppendLine($"• Mode: {(modeNames.Count > 0 ? string.Join(", ", modeNames) : "Normal")}");
            builder.AppendLine();
            builder.AppendLine("Playability");
            if (metrics == null)
            {
                builder.AppendLine("• No generator metrics");
            }
            else
            {
                builder.AppendLine($"• Score: {FormatScore10(metrics.difficultyScore)} / 10");
                builder.AppendLine($"• Safe moves: {FormatPercent(metrics.safeMoveRatio)} (stay near best path)");
                builder.AppendLine($"• Dead-end risk: {FormatPercent(metrics.deadEndPotential)} (moves that break solvability)");
                builder.AppendLine($"• Trap risk: {FormatPercent(metrics.trapLikelihood)}");
                if (metrics.classifiedOpeningMoves > 0)
                {
                    builder.AppendLine($"• Opening sample: {metrics.safeOpeningMoves} safe / {metrics.deadEndOpeningMoves} dead / {metrics.falseProgressOpeningMoves} bait of {metrics.classifiedOpeningMoves}");
                }
                builder.AppendLine($"• Opening moves: {metrics.legalOpeningMoves}");
                builder.AppendLine($"• Fragmentation: {FormatPercent(metrics.fragmentation)}");
                builder.AppendLine($"• Free slots: {metrics.freeCapacity}");
            }

            if (solution.specialOptions != null && !string.IsNullOrWhiteSpace(solution.specialOptions.type))
            {
                builder.AppendLine();
                builder.AppendLine($"Special: {solution.specialOptions.type}");
                if (!string.IsNullOrWhiteSpace(solution.specialOptions.trapType))
                {
                    builder.AppendLine($"• Trap type: {solution.specialOptions.trapType}");
                }
            }

            return builder.ToString().TrimEnd();
        }

        private static string FormatPercent(float value) => $"{Mathf.Clamp01(value) * 100f:0}%";

        private static string FormatScore10(float value) => $"{Mathf.Clamp01(value) * 10f:0.0}";

        private static string BuildSolutionStepsText(WaterSortJsonSolutionData solutionData)
        {
            if (solutionData?.solutions == null || solutionData.solutions.Count == 0)
            {
                return "No stored solution.";
            }

            WaterSortJsonSolution solution = solutionData.solutions[0];
            if (solution?.moves == null || solution.moves.Count == 0)
            {
                return "Empty solution.";
            }

            StringBuilder builder = new();
            builder.AppendLine($"{solution.moves.Count} hint steps");
            builder.AppendLine("(from -> to)");
            builder.AppendLine();
            for (int i = 0; i < solution.moves.Count; i++)
            {
                WaterSortJsonMove move = solution.moves[i];
                if (move == null)
                {
                    builder.AppendLine($"{i + 1}. -");
                    continue;
                }

                builder.AppendLine($"{i + 1}. {move.fromBottle} -> {move.toBottle}");
            }

            return builder.ToString().TrimEnd();
        }

        private static void ResizeInspectionContent(RectTransform content, Text text)
        {
            if (content == null || text == null)
            {
                return;
            }

            float width = Mathf.Max(40f, content.rect.width > 1f ? content.rect.width : WebInspectionPanelWidth - 16f);
            content.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, width);
            text.rectTransform.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, Mathf.Max(20f, width - 12f));
            float height = Mathf.Max(40f, text.preferredHeight + 16f);
            content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical, height);
        }

        private void SetMessage(string message)
        {
            if (messageText != null)
            {
                messageText.text = message;
            }
        }

        private void SetWinState(bool won)
        {
            if (won)
            {
                SetMessage("Level complete! Pick another level or restart.");
            }
        }

        private bool ShouldRebuildBottles()
        {
            if (bottleButtons.Count != manager.Bottles.Count)
            {
                return true;
            }

            if (lastRebuiltLevelIndex != manager.CurrentLevelIndex)
            {
                return true;
            }

            if (slotQuestionTexts.Count != manager.Bottles.Count)
            {
                return true;
            }

            if (slotImages.Count != manager.Bottles.Count)
            {
                return true;
            }

            if (bottleMegaTexts.Count != manager.Bottles.Count)
            {
                return true;
            }

            for (int i = 0; i < manager.Bottles.Count; i++)
            {
                if (slotImages[i].Count != manager.Bottles[i].Capacity)
                {
                    return true;
                }

                if (slotQuestionTexts[i].Count != manager.Bottles[i].Capacity)
                {
                    return true;
                }
            }

            return false;
        }

        private void RefreshLevelSelector()
        {
            int levelCount = manager.Catalog?.Levels.Count ?? 0;
            bool hasLevels = levelCount > 0;

            previousLevelButton.interactable = hasLevels && manager.CurrentLevelIndex > 0;
            nextLevelButton.interactable = hasLevels && manager.CurrentLevelIndex < levelCount - 1;
            levelInput.interactable = hasLevels;

            if (hasLevels && !levelInput.isFocused)
            {
                levelInput.SetTextWithoutNotify((manager.CurrentLevelIndex + 1).ToString());
            }

            levelCounterText.text = hasLevels ? $"/ {levelCount}" : "/ 0";
        }

        private static RectTransform CreateRect(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax)
        {
            GameObject rectObject = new(name);
            rectObject.transform.SetParent(parent, false);
            RectTransform rect = rectObject.AddComponent<RectTransform>();
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.offsetMin = offsetMin;
            rect.offsetMax = offsetMax;
            return rect;
        }

        private static Text CreateText(string name, Transform parent, Font font, string text, int size, TextAnchor alignment, Color color)
        {
            GameObject textObject = new(name);
            textObject.transform.SetParent(parent, false);
            Text textComponent = textObject.AddComponent<Text>();
            textComponent.font = font;
            textComponent.text = text;
            textComponent.fontSize = size;
            textComponent.alignment = alignment;
            textComponent.color = color;
            textComponent.raycastTarget = false;
            textComponent.horizontalOverflow = HorizontalWrapMode.Overflow;
            textComponent.verticalOverflow = VerticalWrapMode.Truncate;
            LayoutElement layout = textObject.AddComponent<LayoutElement>();
            layout.minHeight = size + 8f;
            layout.preferredHeight = size + 16f;
            return textComponent;
        }

        private static Button CreateButton(string name, Transform parent, Font font, string label, UnityEngine.Events.UnityAction onClick, bool compact = false)
        {
            GameObject buttonObject = new(name);
            buttonObject.transform.SetParent(parent, false);

            Image image = buttonObject.AddComponent<Image>();
            image.color = new Color(0.18f, 0.23f, 0.31f);

            Button button = buttonObject.AddComponent<Button>();
            button.targetGraphic = image;
            button.onClick.AddListener(onClick);

            LayoutElement layout = buttonObject.AddComponent<LayoutElement>();
            layout.preferredWidth = compact ? 120f : 168f;
            layout.preferredHeight = compact ? 44f : 76f;

            Text text = CreateText("Label", buttonObject.transform, font, label, compact ? 20 : 24, TextAnchor.MiddleCenter, Color.white);
            Stretch(text.rectTransform);
            return button;
        }

        private static InputField CreateInputField(string name, Transform parent, Font font, bool compact = false)
        {
            GameObject inputObject = new(name);
            inputObject.transform.SetParent(parent, false);

            Image image = inputObject.AddComponent<Image>();
            image.color = new Color(0.94f, 0.96f, 0.98f);

            InputField input = inputObject.AddComponent<InputField>();
            input.contentType = InputField.ContentType.IntegerNumber;
            input.lineType = InputField.LineType.SingleLine;
            input.targetGraphic = image;

            LayoutElement layout = inputObject.AddComponent<LayoutElement>();
            layout.preferredWidth = compact ? 96f : 150f;
            layout.preferredHeight = compact ? 44f : 76f;

            Text text = CreateText("Text", inputObject.transform, font, "", compact ? 22 : 28, TextAnchor.MiddleCenter, new Color(0.12f, 0.15f, 0.2f));
            Stretch(text.rectTransform);
            input.textComponent = text;

            Text placeholder = CreateText("Placeholder", inputObject.transform, font, "Level", compact ? 18 : 24, TextAnchor.MiddleCenter, new Color(0.48f, 0.52f, 0.58f));
            Stretch(placeholder.rectTransform);
            input.placeholder = placeholder;

            return input;
        }

        private static void Stretch(RectTransform rect)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
        }

        private static void ClearChildren(Transform parent)
        {
            for (int i = parent.childCount - 1; i >= 0; i--)
            {
                Destroy(parent.GetChild(i).gameObject);
            }
        }
    }
}
