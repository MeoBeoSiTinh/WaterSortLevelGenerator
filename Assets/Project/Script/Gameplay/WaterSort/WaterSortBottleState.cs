using System.Collections.Generic;
using System.Linq;

namespace TrainWaterSort.Gameplay.WaterSort
{
    public sealed class WaterSortBottleState
    {
        private readonly List<int> colorIndexes = new();
        private readonly List<bool> unlockedLayers = new();

        public WaterSortBottleState(
            int capacity,
            IEnumerable<int> initialColors,
            bool hiddenStackEnabled = false,
            IEnumerable<int> initialHiddenLayerIndexes = null,
            bool startsLocked = false,
            int unlockCompletedBottleCount = 1)
        {
            Capacity = capacity;
            HashSet<int> hiddenLayerSet = initialHiddenLayerIndexes == null
                ? new HashSet<int>()
                : new HashSet<int>(initialHiddenLayerIndexes.Where(index => index >= 0));
            HiddenStackEnabled = hiddenStackEnabled || hiddenLayerSet.Count > 0;
            IsLocked = startsLocked;
            UnlockCompletedBottleCount = System.Math.Max(1, unlockCompletedBottleCount);

            if (initialColors == null)
            {
                RefreshUnlockedLayers();
                return;
            }

            foreach (int colorIndex in initialColors)
            {
                if (colorIndex >= 0 && colorIndexes.Count < Capacity)
                {
                    int layerIndex = colorIndexes.Count;
                    colorIndexes.Add(colorIndex);
                    unlockedLayers.Add(hiddenStackEnabled ? false : !hiddenLayerSet.Contains(layerIndex));
                }
            }

            RefreshUnlockedLayers();
        }

        public int Capacity { get; }
        public bool HiddenStackEnabled { get; }
        public bool IsLocked { get; private set; }
        public int UnlockCompletedBottleCount { get; }
        public IReadOnlyList<int> ColorIndexes => colorIndexes;
        public int Count => colorIndexes.Count;
        public bool IsEmpty => Count == 0;
        public bool IsFull => Count >= Capacity;
        public int EmptySlots => Capacity - Count;
        public int TopColor => IsEmpty ? -1 : colorIndexes[^1];
        public bool HasUnlockedTopColor => !IsLocked && !IsEmpty && unlockedLayers[^1];

        public bool IsComplete
        {
            get
            {
                if (IsLocked)
                {
                    return false;
                }

                if (IsEmpty)
                {
                    return true;
                }

                if (Count != Capacity)
                {
                    return false;
                }

                int targetColor = colorIndexes[0];
                for (int i = 1; i < colorIndexes.Count; i++)
                {
                    if (colorIndexes[i] != targetColor)
                    {
                        return false;
                    }
                }

                return true;
            }
        }

        public bool IsFullMonoComplete
        {
            get
            {
                if (IsLocked || Count != Capacity)
                {
                    return false;
                }

                int targetColor = colorIndexes[0];
                for (int i = 1; i < colorIndexes.Count; i++)
                {
                    if (colorIndexes[i] != targetColor)
                    {
                        return false;
                    }
                }

                return true;
            }
        }

        public void SetLocked(bool isLocked)
        {
            IsLocked = isLocked;
        }

        public int GetTopGroupCount()
        {
            if (IsEmpty)
            {
                return 0;
            }

            int topColor = TopColor;
            int amount = 0;
            for (int i = colorIndexes.Count - 1; i >= 0; i--)
            {
                if (colorIndexes[i] != topColor)
                {
                    break;
                }

                amount++;
            }

            return amount;
        }

        public int GetUnlockedTopGroupCount()
        {
            if (IsEmpty)
            {
                return 0;
            }

            int topColor = TopColor;
            int amount = 0;
            for (int i = colorIndexes.Count - 1; i >= 0; i--)
            {
                if (colorIndexes[i] != topColor)
                {
                    break;
                }

                if (HiddenStackEnabled && !unlockedLayers[i])
                {
                    break;
                }

                amount++;
            }

            return amount;
        }

        public bool IsLayerUnlocked(int layerIndex)
        {
            return layerIndex >= 0 && layerIndex < unlockedLayers.Count && unlockedLayers[layerIndex];
        }

        public bool[] GetUnlockedLayerSnapshot()
        {
            return unlockedLayers.ToArray();
        }

        public void RestoreUnlockedLayerSnapshot(bool[] snapshot)
        {
            if (snapshot == null)
            {
                RefreshUnlockedLayers();
                return;
            }

            int limit = System.Math.Min(snapshot.Length, unlockedLayers.Count);
            for (int i = 0; i < limit; i++)
            {
                unlockedLayers[i] = snapshot[i];
            }

            for (int i = limit; i < unlockedLayers.Count; i++)
            {
                unlockedLayers[i] = false;
            }

            RefreshUnlockedLayers();
        }

        public void PushColor(int colorIndex)
        {
            if (!IsFull)
            {
                colorIndexes.Add(colorIndex);
                unlockedLayers.Add(true);
                RefreshUnlockedLayers();
            }
        }

        public int PopColor()
        {
            int lastIndex = colorIndexes.Count - 1;
            int colorIndex = colorIndexes[lastIndex];
            colorIndexes.RemoveAt(lastIndex);
            unlockedLayers.RemoveAt(lastIndex);
            RefreshUnlockedLayers();
            return colorIndex;
        }

        private void RefreshUnlockedLayers()
        {
            if (!HiddenStackEnabled)
            {
                for (int i = 0; i < unlockedLayers.Count; i++)
                {
                    unlockedLayers[i] = true;
                }

                return;
            }

            if (IsEmpty)
            {
                return;
            }

            int topColor = TopColor;
            for (int i = colorIndexes.Count - 1; i >= 0; i--)
            {
                if (colorIndexes[i] != topColor)
                {
                    break;
                }

                unlockedLayers[i] = true;
            }
        }
    }
}
