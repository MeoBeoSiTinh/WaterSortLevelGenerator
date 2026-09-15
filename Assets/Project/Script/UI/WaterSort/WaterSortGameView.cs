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

        private readonly List<Button> bottleButtons = new();
        private readonly List<Image> bottleOutlines = new();
        private readonly List<List<Image>> slotImages = new();
        private readonly List<List<Text>> slotQuestionTexts = new();
        private readonly List<Text> bottleLockedTexts = new();
        private readonly List<Text> bottleAdTexts = new();
        private readonly List<Text> bottleMegaTexts = new();

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
        private Text metricsText;
        private Text solutionStepsText;
        private RectTransform metricsContent;
        private RectTransform solutionContent;
        private static readonly Color TextPrimary = new(0.92f, 0.95f, 0.98f, 1f);
        private static readonly Color TextSecondary = new(0.72f, 0.78f, 0.86f, 1f);
        private static readonly Color PanelBackground = new(0.08f, 0.1f, 0.13f, 0.94f);

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
                metricsText = CreateInspectionPanel(
                    "MetricsPanel",
                    root,
                    font,
                    "Level summary",
                    new Vector2(0f, 0f),
                    new Vector2(0f, 1f),
                    new Vector2(sidePad, footerHeight + 8f),
                    new Vector2(sidePad + WebInspectionPanelWidth, -(headerHeight + 8f)),
                    out metricsContent);

                solutionStepsText = CreateInspectionPanel(
                    "SolutionPanel",
                    root,
                    font,
                    "Solution hint",
                    new Vector2(1f, 0f),
                    new Vector2(1f, 1f),
                    new Vector2(-(sidePad + WebInspectionPanelWidth), footerHeight + 8f),
                    new Vector2(-sidePad, -(headerHeight + 8f)),
                    out solutionContent);
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

        private void LateUpdate()
        {
            FitBoardGrid(force: false);
        }

        private void FitBoardGrid(bool force)
        {
            if (boardRect == null || boardGrid == null)
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

            lastRebuiltLevelIndex = manager.CurrentLevelIndex;
            FitBoardGrid(force: true);
            if (boardRoot is RectTransform boardLayoutRect)
            {
                LayoutRebuilder.ForceRebuildLayoutImmediate(boardLayoutRect);
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

            Button button = bottleObject.AddComponent<Button>();
            button.targetGraphic = outline;
            button.onClick.AddListener(onClick);

            RectTransform rect = bottleObject.GetComponent<RectTransform>();
            Stretch(rect);
            rect.offsetMin = new Vector2(4f, 4f);
            rect.offsetMax = new Vector2(-4f, -4f);

            // Stack lives in a child so lock/ad/mega overlays are not shifted by VerticalLayoutGroup.
            GameObject stackObject = new("Stack", typeof(RectTransform));
            stackObject.transform.SetParent(bottleObject.transform, false);
            RectTransform stackRect = stackObject.GetComponent<RectTransform>();
            Stretch(stackRect);
            VerticalLayoutGroup stack = stackObject.AddComponent<VerticalLayoutGroup>();
            stack.padding = new RectOffset(10, 10, 12, 12);
            stack.spacing = 4f;
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
                slotObject.AddComponent<LayoutElement>().minHeight = isMegaBottle ? 8f : 22f;

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
