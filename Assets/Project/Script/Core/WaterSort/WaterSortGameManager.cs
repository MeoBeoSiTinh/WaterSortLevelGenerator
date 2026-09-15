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
        public WaterSortJsonLevel CurrentLevel => catalog != null
            && CurrentLevelIndex >= 0
            && CurrentLevelIndex < catalog.Levels.Count
            ? catalog.Levels[CurrentLevelIndex]
            : null;
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
            bool hiddenStackEnabled = level.modeOptions?.HiddenStack == true;
            bool hybridHiddenStackEnabled = level.modeOptions?.HybridHiddenStack == true;
            bool lockedBottlesEnabled = level.modeOptions?.LockedBottles == true;
            bool colorLockedBottlesEnabled = level.modeOptions?.ColorLockedBottles == true;

            foreach (WaterSortJsonBottle bottleData in level.bottles)
            {
                if (bottleData == null)
                {
                    continue;
                }

                bool startsCountLocked = lockedBottlesEnabled && bottleData.IsLocked;
                bool startsColorLocked = colorLockedBottlesEnabled && bottleData.IsColorLocked;
                bottles.Add(new WaterSortBottleState(
                    bottleData.Capacity,
                    bottleData.ColorsBottomToTop,
                    hiddenStackEnabled,
                    hybridHiddenStackEnabled ? bottleData.HiddenLayerIndexes : null,
                    startsCountLocked || startsColorLocked,
                    bottleData.UnlockCompletedBottleCount,
                    bottleData.IsAdBottle,
                    bottleData.IsMegaBottle,
                    bottleData.TargetColor,
                    startsColorLocked,
                    bottleData.UnlockRequiredColor,
                    bottleData.UnlockCompletedColorBottleCount));
            }

            RefreshBottleLocks();

            SetMessage("Select a bottle to pour.");
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

            source.RestoreUnlockedLayerSnapshot(move.SourceUnlockedLayersBeforeMove);
            target.RestoreUnlockedLayerSnapshot(move.TargetUnlockedLayersBeforeMove);
            RestoreBottleLockSnapshot(move.BottleLockStatesBeforeMove);

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

            if (bottles[bottleIndex].IsLocked)
            {
                SetMessage("This bottle is locked.");
                return;
            }

            if (bottles[bottleIndex].IsMegaBottle)
            {
                SetMessage("Mega bottle can only receive colors.");
                return;
            }

            if (!bottles[bottleIndex].HasUnlockedTopColor)
            {
                SetMessage("This bottle's top color is locked.");
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

            if (source.IsLocked)
            {
                message = "Source bottle is locked.";
                return false;
            }

            if (source.IsMegaBottle)
            {
                message = "Mega bottle can only receive colors.";
                return false;
            }

            if (target.IsLocked)
            {
                message = "Target bottle is locked.";
                return false;
            }

            if (source.IsEmpty)
            {
                message = "Source bottle is empty.";
                return false;
            }

            if (!source.HasUnlockedTopColor)
            {
                message = "Source color is locked.";
                return false;
            }

            if (target.IsFull)
            {
                message = "Target bottle is full.";
                return false;
            }

            int colorIndex = source.TopColor;
            bool[] sourceUnlockedBeforeMove = source.GetUnlockedLayerSnapshot();
            bool[] targetUnlockedBeforeMove = target.GetUnlockedLayerSnapshot();
            bool[] lockStatesBeforeMove = GetBottleLockSnapshot();
            if (target.IsMegaBottle && colorIndex != target.TargetColor)
            {
                message = "Mega bottle only accepts its target color.";
                return false;
            }

            if (!target.IsEmpty && target.TopColor != colorIndex)
            {
                message = "Can only pour onto the same color or into an empty bottle.";
                return false;
            }

            int amount = Mathf.Min(source.GetUnlockedTopGroupCount(), target.EmptySlots);
            if (amount <= 0)
            {
                message = "Source color is locked.";
                return false;
            }

            for (int i = 0; i < amount; i++)
            {
                source.PopColor();
                target.PushColor(colorIndex);
            }

            RefreshBottleLocks();

            undoStack.Push(new WaterSortMoveRecord(
                sourceIndex,
                targetIndex,
                colorIndex,
                amount,
                sourceUnlockedBeforeMove,
                targetUnlockedBeforeMove,
                lockStatesBeforeMove));
            message = $"Moved {amount}.";
            return true;
        }

        private int CountCompletedFullMonoBottles()
        {
            int count = 0;
            for (int i = 0; i < bottles.Count; i++)
            {
                WaterSortBottleState bottle = bottles[i];
                if (bottle.IsAdBottle || bottle.IsMegaBottle)
                {
                    continue;
                }

                if (bottle.IsFullMonoComplete)
                {
                    count++;
                }
            }

            return count;
        }

        private int CountCompletedFullMonoBottlesOfColor(int colorIndex)
        {
            int count = 0;
            for (int i = 0; i < bottles.Count; i++)
            {
                WaterSortBottleState bottle = bottles[i];
                if (bottle.IsAdBottle || bottle.IsMegaBottle)
                {
                    continue;
                }

                if (bottle.IsFullMonoComplete && bottle.TopColor == colorIndex)
                {
                    count++;
                }
            }

            return count;
        }

        private void RefreshBottleLocks()
        {
            bool unlockedAny;
            do
            {
                unlockedAny = false;
                int completedBottleCount = CountCompletedFullMonoBottles();
                for (int i = 0; i < bottles.Count; i++)
                {
                    WaterSortBottleState bottle = bottles[i];
                    if (!bottle.IsLocked)
                    {
                        continue;
                    }

                    bool shouldUnlock = bottle.IsColorLocked
                        ? CountCompletedFullMonoBottlesOfColor(bottle.UnlockRequiredColor) >= bottle.UnlockCompletedColorBottleCount
                        : completedBottleCount >= bottle.UnlockCompletedBottleCount;
                    if (!shouldUnlock)
                    {
                        continue;
                    }

                    bottle.SetLocked(false);
                    unlockedAny = true;
                }
            }
            while (unlockedAny);
        }

        private bool[] GetBottleLockSnapshot()
        {
            bool[] snapshot = new bool[bottles.Count];
            for (int i = 0; i < bottles.Count; i++)
            {
                snapshot[i] = bottles[i].IsLocked;
            }

            return snapshot;
        }

        private void RestoreBottleLockSnapshot(bool[] snapshot)
        {
            if (snapshot == null)
            {
                return;
            }

            int count = Mathf.Min(snapshot.Length, bottles.Count);
            for (int i = 0; i < count; i++)
            {
                bottles[i].SetLocked(snapshot[i]);
            }
        }

        private void EvaluateWin()
        {
            bool hasMegaBottle = false;
            for (int i = 0; i < bottles.Count; i++)
            {
                if (bottles[i].IsMegaBottle)
                {
                    hasMegaBottle = true;
                    if (!bottles[i].IsMegaComplete)
                    {
                        return;
                    }
                }
            }

            if (hasMegaBottle)
            {
                HasWon = true;
                SetMessage("Mega bottle filled!");
                WinStateChanged?.Invoke(true);
                return;
            }

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
