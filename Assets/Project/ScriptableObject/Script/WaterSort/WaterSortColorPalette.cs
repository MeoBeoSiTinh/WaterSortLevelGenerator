using System.Collections.Generic;
using UnityEngine;

namespace TrainWaterSort.ScriptableObject.WaterSort
{
    [CreateAssetMenu(fileName = "WaterSortColorPalette", menuName = "Train WaterSort/Color Palette")]
    public sealed class WaterSortColorPalette : UnityEngine.ScriptableObject
    {
        [SerializeField] private List<Color> colors = new();

        public IReadOnlyList<Color> Colors => colors;

        public Color GetColor(int index)
        {
            if (index < 0 || index >= colors.Count)
            {
                return Color.magenta;
            }

            return colors[index];
        }
    }
}
