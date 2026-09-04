namespace TrainWaterSort.Gameplay.WaterSort
{
    public readonly struct WaterSortMoveRecord
    {
        public WaterSortMoveRecord(
            int sourceIndex,
            int targetIndex,
            int colorIndex,
            int amount,
            bool[] sourceUnlockedLayersBeforeMove,
            bool[] targetUnlockedLayersBeforeMove,
            bool[] bottleLockStatesBeforeMove)
        {
            SourceIndex = sourceIndex;
            TargetIndex = targetIndex;
            ColorIndex = colorIndex;
            Amount = amount;
            SourceUnlockedLayersBeforeMove = sourceUnlockedLayersBeforeMove;
            TargetUnlockedLayersBeforeMove = targetUnlockedLayersBeforeMove;
            BottleLockStatesBeforeMove = bottleLockStatesBeforeMove;
        }

        public int SourceIndex { get; }
        public int TargetIndex { get; }
        public int ColorIndex { get; }
        public int Amount { get; }
        public bool[] SourceUnlockedLayersBeforeMove { get; }
        public bool[] TargetUnlockedLayersBeforeMove { get; }
        public bool[] BottleLockStatesBeforeMove { get; }
    }
}
