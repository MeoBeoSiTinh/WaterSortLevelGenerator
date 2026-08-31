using System.Collections.Generic;
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
        private readonly List<Button> bottleButtons = new();
        private readonly List<Image> bottleOutlines = new();
        private readonly List<List<Image>> slotImages = new();

        private WaterSortGameManager manager;
        private Text messageText;
        private Text titleText;
        private Button undoButton;
        private Button previousLevelButton;
        private Button nextLevelButton;
        private InputField levelInput;
        private Text levelCounterText;
        private Transform boardRoot;

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

            RectTransform root = CreateRect("Root", canvas.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            Image background = root.gameObject.AddComponent<Image>();
            background.color = new Color(0.95f, 0.97f, 1f);
            background.raycastTarget = false;

            RectTransform topBar = CreateRect("TopBar", root, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -128f), new Vector2(-24f, -24f));
            HorizontalLayoutGroup topLayout = topBar.gameObject.AddComponent<HorizontalLayoutGroup>();
            topLayout.spacing = 12f;
            topLayout.childAlignment = TextAnchor.MiddleCenter;
            topLayout.childControlWidth = true;
            topLayout.childControlHeight = true;
            topLayout.childForceExpandWidth = false;
            topLayout.childForceExpandHeight = true;

            titleText = CreateText("Title", topBar, font, "Water Sort", 36, TextAnchor.MiddleLeft, new Color(0.12f, 0.15f, 0.2f));
            titleText.GetComponent<LayoutElement>().flexibleWidth = 1f;

            undoButton = CreateButton("UndoButton", topBar, font, "Undo", () => manager.Undo());
            CreateButton("RestartButton", topBar, font, "Restart", () => manager.RestartLevel());

            RectTransform levelsPanel = CreateRect("LevelSelect", root, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(24f, -210f), new Vector2(-24f, -146f));
            HorizontalLayoutGroup levelsLayout = levelsPanel.gameObject.AddComponent<HorizontalLayoutGroup>();
            levelsLayout.spacing = 10f;
            levelsLayout.childAlignment = TextAnchor.MiddleCenter;
            levelsLayout.childControlWidth = true;
            levelsLayout.childControlHeight = true;
            levelsLayout.childForceExpandWidth = false;
            levelsLayout.childForceExpandHeight = false;

            previousLevelButton = CreateButton("PreviousLevelButton", levelsPanel, font, "<", LoadPreviousLevel);
            previousLevelButton.GetComponent<LayoutElement>().preferredWidth = 72f;

            levelInput = CreateInputField("LevelInput", levelsPanel, font);
            levelInput.onEndEdit.AddListener(_ => LoadTypedLevel());

            Button goButton = CreateButton("GoLevelButton", levelsPanel, font, "Go", LoadTypedLevel);
            goButton.GetComponent<LayoutElement>().preferredWidth = 92f;

            nextLevelButton = CreateButton("NextLevelButton", levelsPanel, font, ">", LoadNextLevel);
            nextLevelButton.GetComponent<LayoutElement>().preferredWidth = 72f;

            levelCounterText = CreateText("LevelCounter", levelsPanel, font, "", 24, TextAnchor.MiddleLeft, new Color(0.12f, 0.15f, 0.2f));
            LayoutElement counterLayout = levelCounterText.GetComponent<LayoutElement>();
            counterLayout.preferredWidth = 210f;
            counterLayout.preferredHeight = 76f;

            RectTransform board = CreateRect("Board", root, Vector2.zero, Vector2.one, new Vector2(24f, 126f), new Vector2(-24f, -230f));
            GridLayoutGroup grid = board.gameObject.AddComponent<GridLayoutGroup>();
            grid.cellSize = new Vector2(150f, 270f);
            grid.spacing = new Vector2(24f, 24f);
            grid.childAlignment = TextAnchor.MiddleCenter;
            grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            grid.constraintCount = 4;
            boardRoot = board;

            RectTransform bottomBar = CreateRect("MessageBar", root, Vector2.zero, new Vector2(1f, 0f), new Vector2(24f, 24f), new Vector2(-24f, 104f));
            messageText = CreateText("Message", bottomBar, font, "", 28, TextAnchor.MiddleCenter, new Color(0.12f, 0.15f, 0.2f));
            Stretch(messageText.rectTransform);
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
            scaler.referenceResolution = new Vector2(1080f, 2160f);
            scaler.matchWidthOrHeight = 0.5f;

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

            for (int i = 0; i < manager.Bottles.Count; i++)
            {
                int bottleIndex = i;
                WaterSortBottleState bottle = manager.Bottles[i];
                Button button = CreateBottleButton(bottleIndex, bottle.Capacity, () => manager.SelectBottle(bottleIndex));
                bottleButtons.Add(button);
            }
        }

        private Button CreateBottleButton(int bottleIndex, int capacity, UnityEngine.Events.UnityAction onClick)
        {
            GameObject bottleObject = new($"Bottle{bottleIndex + 1}");
            bottleObject.transform.SetParent(boardRoot, false);

            Image outline = bottleObject.AddComponent<Image>();
            outline.color = new Color(1f, 1f, 1f, 0.65f);

            Button button = bottleObject.AddComponent<Button>();
            button.targetGraphic = outline;
            button.onClick.AddListener(onClick);

            RectTransform rect = bottleObject.GetComponent<RectTransform>();
            rect.sizeDelta = new Vector2(150f, 270f);

            VerticalLayoutGroup stack = bottleObject.AddComponent<VerticalLayoutGroup>();
            stack.padding = new RectOffset(14, 14, 18, 18);
            stack.spacing = 6f;
            stack.childControlWidth = true;
            stack.childControlHeight = true;
            stack.childForceExpandWidth = true;
            stack.childForceExpandHeight = true;
            stack.childAlignment = TextAnchor.LowerCenter;

            List<Image> slots = new();
            for (int i = capacity - 1; i >= 0; i--)
            {
                GameObject slotObject = new($"Slot{i + 1}");
                slotObject.transform.SetParent(bottleObject.transform, false);
                Image slot = slotObject.AddComponent<Image>();
                slot.color = new Color(0.85f, 0.88f, 0.93f, 0.45f);
                slot.raycastTarget = false;
                slotObject.AddComponent<LayoutElement>().minHeight = 28f;
                slots.Insert(0, slot);
            }

            bottleOutlines.Add(outline);
            slotImages.Add(slots);
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
                bottleOutlines[i].color = i == manager.SelectedBottleIndex
                    ? new Color(1f, 0.9f, 0.25f, 0.95f)
                    : new Color(1f, 1f, 1f, 0.72f);

                for (int slot = 0; slot < slotImages[i].Count; slot++)
                {
                    Image slotImage = slotImages[i][slot];
                    if (slot < bottle.Count)
                    {
                        int colorIndex = bottle.ColorIndexes[slot];
                        slotImage.color = hasPlayableCatalog
                            ? manager.Catalog.GetColor(colorIndex)
                            : Color.magenta;
                    }
                    else
                    {
                        slotImage.color = new Color(0.85f, 0.88f, 0.93f, 0.45f);
                    }
                }
            }

            undoButton.interactable = manager.HasUndo;
            RefreshLevelSelector();
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

            for (int i = 0; i < manager.Bottles.Count; i++)
            {
                if (slotImages[i].Count != manager.Bottles[i].Capacity)
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
            textComponent.horizontalOverflow = HorizontalWrapMode.Wrap;
            textComponent.verticalOverflow = VerticalWrapMode.Truncate;
            textObject.AddComponent<LayoutElement>().preferredHeight = 80f;
            return textComponent;
        }

        private static Button CreateButton(string name, Transform parent, Font font, string label, UnityEngine.Events.UnityAction onClick)
        {
            GameObject buttonObject = new(name);
            buttonObject.transform.SetParent(parent, false);

            Image image = buttonObject.AddComponent<Image>();
            image.color = new Color(0.18f, 0.23f, 0.31f);

            Button button = buttonObject.AddComponent<Button>();
            button.targetGraphic = image;
            button.onClick.AddListener(onClick);

            LayoutElement layout = buttonObject.AddComponent<LayoutElement>();
            layout.preferredWidth = 168f;
            layout.preferredHeight = 76f;

            Text text = CreateText("Label", buttonObject.transform, font, label, 24, TextAnchor.MiddleCenter, Color.white);
            Stretch(text.rectTransform);
            return button;
        }

        private static InputField CreateInputField(string name, Transform parent, Font font)
        {
            GameObject inputObject = new(name);
            inputObject.transform.SetParent(parent, false);

            Image image = inputObject.AddComponent<Image>();
            image.color = Color.white;

            InputField input = inputObject.AddComponent<InputField>();
            input.contentType = InputField.ContentType.IntegerNumber;
            input.lineType = InputField.LineType.SingleLine;
            input.targetGraphic = image;

            LayoutElement layout = inputObject.AddComponent<LayoutElement>();
            layout.preferredWidth = 150f;
            layout.preferredHeight = 76f;

            Text text = CreateText("Text", inputObject.transform, font, "", 28, TextAnchor.MiddleCenter, new Color(0.12f, 0.15f, 0.2f));
            Stretch(text.rectTransform);
            input.textComponent = text;

            Text placeholder = CreateText("Placeholder", inputObject.transform, font, "Level", 24, TextAnchor.MiddleCenter, new Color(0.48f, 0.52f, 0.58f));
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
