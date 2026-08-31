using System.Collections.Generic;

namespace TrainWaterSort.Gameplay.WaterSort
{
    public sealed class WaterSortBottleState
    {
        private readonly List<int> colorIndexes = new();

        public WaterSortBottleState(int capacity, IEnumerable<int> initialColors)
        {
            Capacity = capacity;

            foreach (int colorIndex in initialColors)
            {
                if (colorIndex >= 0 && colorIndexes.Count < Capacity)
                {
                    colorIndexes.Add(colorIndex);
                }
            }
        }

        public int Capacity { get; }
        public IReadOnlyList<int> ColorIndexes => colorIndexes;
        public int Count => colorIndexes.Count;
        public bool IsEmpty => Count == 0;
        public bool IsFull => Count >= Capacity;
        public int EmptySlots => Capacity - Count;
        public int TopColor => IsEmpty ? -1 : colorIndexes[^1];

        public bool IsComplete
        {
            get
            {
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

        public void PushColor(int colorIndex)
        {
            if (!IsFull)
            {
                colorIndexes.Add(colorIndex);
            }
        }

        public int PopColor()
        {
            int lastIndex = colorIndexes.Count - 1;
            int colorIndex = colorIndexes[lastIndex];
            colorIndexes.RemoveAt(lastIndex);
            return colorIndex;
        }
    }
}
