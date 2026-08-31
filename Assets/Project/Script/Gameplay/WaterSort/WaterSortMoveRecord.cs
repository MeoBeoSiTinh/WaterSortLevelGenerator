namespace TrainWaterSort.Gameplay.WaterSort
{
    public readonly struct WaterSortMoveRecord
    {
        public WaterSortMoveRecord(int sourceIndex, int targetIndex, int colorIndex, int amount)
        {
            SourceIndex = sourceIndex;
            TargetIndex = targetIndex;
            ColorIndex = colorIndex;
            Amount = amount;
        }

        public int SourceIndex { get; }
        public int TargetIndex { get; }
        public int ColorIndex { get; }
        public int Amount { get; }
    }
}
