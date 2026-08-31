using System;
using System.Collections.Generic;
using TrainWaterSort.Gameplay.WaterSort;
using UnityEngine;

namespace TrainWaterSort.Core.WaterSort
{
    public sealed class WaterSortGameManager : MonoBehaviour
    {
        private readonly List<WaterSortBottleState> bottles = new();
        private readonly Stack<WaterSortMoveRecord> undoStack = new();

        private WaterSortJsonCatalog catalog;
        private int selectedBottleIndex = -1;

        public event Action StateChanged;
        public event Action<string> MessageChanged;
        public event Action<bool> WinStateChanged;

        public IReadOnlyList<WaterSortBottleState> Bottles => bottles;
        public WaterSortJsonCatalog Catalog => catalog;
        public int CurrentLevelIndex { get; private set; }
        public int SelectedBottleIndex => selectedBottleIndex;
        public bool HasUndo => undoStack.Count > 0;
        public bool HasWon { get; private set; }
        public string CurrentMessage { get; private set; } = string.Empty;

        public void Initialize(WaterSortJsonCatalog gameCatalog)
        {
            catalog = gameCatalog;
            LoadLevel(0);
        }

        public void LoadLevel(int levelIndex)
        {
            if (catalog == null || catalog.Levels.Count == 0)
            {
                ResetToEmptyState();
                SetMessage("Missing Water Sort JSON levels.");
                StateChanged?.Invoke();
                return;
            }

            CurrentLevelIndex = Mathf.Clamp(levelIndex, 0, catalog.Levels.Count - 1);
            WaterSortJsonLevel level = catalog.Levels[CurrentLevelIndex];
            if (level == null)
            {
                ResetToEmptyState();
                SetMessage("Selected level data is missing.");
                StateChanged?.Invoke();
                return;
            }

            bottles.Clear();
            undoStack.Clear();
            selectedBottleIndex = -1;
            HasWon = false;

            foreach (WaterSortJsonBottle bottleData in level.bottles)
            {
                if (bottleData == null)
                {
                    continue;
                }

                bottles.Add(new WaterSortBottleState(bottleData.Capacity, bottleData.ColorsBottomToTop));
            }

            SetMessage(level.GetDisplayName(CurrentLevelIndex));
            WinStateChanged?.Invoke(false);
            StateChanged?.Invoke();
        }

        public void RestartLevel()
        {
            LoadLevel(CurrentLevelIndex);
        }

        public void SelectBottle(int bottleIndex)
        {
            if (HasWon || bottleIndex < 0 || bottleIndex >= bottles.Count)
            {
                return;
            }

            if (selectedBottleIndex < 0)
            {
                SelectSource(bottleIndex);
                return;
            }

            if (selectedBottleIndex == bottleIndex)
            {
                selectedBottleIndex = -1;
                SetMessage("Selection cleared.");
                StateChanged?.Invoke();
                return;
            }

            if (TryMove(selectedBottleIndex, bottleIndex, out string message))
            {
                selectedBottleIndex = -1;
                SetMessage(message);
                EvaluateWin();
            }
            else
            {
                selectedBottleIndex = -1;
                SetMessage(message);
            }

            StateChanged?.Invoke();
        }

        public void Undo()
        {
            if (undoStack.Count == 0)
            {
                return;
            }

            WaterSortMoveRecord move = undoStack.Pop();
            WaterSortBottleState source = bottles[move.SourceIndex];
            WaterSortBottleState target = bottles[move.TargetIndex];

            for (int i = 0; i < move.Amount; i++)
            {
                target.PopColor();
                source.PushColor(move.ColorIndex);
            }

            selectedBottleIndex = -1;
            HasWon = false;
            WinStateChanged?.Invoke(false);
            SetMessage("Undo.");
            StateChanged?.Invoke();
        }

        private void SelectSource(int bottleIndex)
        {
            if (bottles[bottleIndex].IsEmpty)
            {
                SetMessage("This bottle is empty.");
                return;
            }

            selectedBottleIndex = bottleIndex;
            SetMessage("Choose a target bottle.");
            StateChanged?.Invoke();
        }

        private bool TryMove(int sourceIndex, int targetIndex, out string message)
        {
            WaterSortBottleState source = bottles[sourceIndex];
            WaterSortBottleState target = bottles[targetIndex];

            if (source.IsEmpty)
            {
                message = "Source bottle is empty.";
                return false;
            }

            if (target.IsFull)
            {
                message = "Target bottle is full.";
                return false;
            }

            int colorIndex = source.TopColor;
            if (!target.IsEmpty && target.TopColor != colorIndex)
            {
                message = "Can only pour onto the same color or into an empty bottle.";
                return false;
            }

            int amount = Mathf.Min(source.GetTopGroupCount(), target.EmptySlots);
            for (int i = 0; i < amount; i++)
            {
                source.PopColor();
                target.PushColor(colorIndex);
            }

            undoStack.Push(new WaterSortMoveRecord(sourceIndex, targetIndex, colorIndex, amount));
            message = $"Moved {amount}.";
            return true;
        }

        private void EvaluateWin()
        {
            for (int i = 0; i < bottles.Count; i++)
            {
                if (!bottles[i].IsComplete)
                {
                    return;
                }
            }

            HasWon = true;
            SetMessage("Level complete!");
            WinStateChanged?.Invoke(true);
        }

        private void SetMessage(string message)
        {
            CurrentMessage = message;
            MessageChanged?.Invoke(message);
        }

        private void ResetToEmptyState()
        {
            bottles.Clear();
            undoStack.Clear();
            selectedBottleIndex = -1;
            HasWon = false;
            WinStateChanged?.Invoke(false);
        }
    }
}
