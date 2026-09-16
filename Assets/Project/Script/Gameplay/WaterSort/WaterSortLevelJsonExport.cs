using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;

namespace TrainWaterSort.Gameplay.WaterSort
{
    /// <summary>
    /// Deep-clones level JSON models and writes pack JSON with arrays
    /// (Unity JsonUtility does not reliably emit List&lt;T&gt; fields).
    /// </summary>
    public static class WaterSortLevelJsonExport
    {
        public static WaterSortJsonLevel CloneLevel(WaterSortJsonLevel source, bool includeSolutionData)
        {
            if (source == null)
            {
                return null;
            }

            WaterSortJsonLevel clone = new()
            {
                id = source.id,
                displayName = source.displayName,
                layoutGrid = CloneLayoutGrid(source.layoutGrid),
                boardLayout = CloneBoardLayout(source.boardLayout),
                modeOptions = CloneModeOptions(source.modeOptions),
                bottles = new List<WaterSortJsonBottle>(),
                solutionData = includeSolutionData ? CloneSolutionData(source.solutionData) : new WaterSortJsonSolutionData()
            };

            if (source.bottles != null)
            {
                foreach (WaterSortJsonBottle bottle in source.bottles)
                {
                    clone.bottles.Add(CloneBottle(bottle));
                }
            }

            return clone;
        }

        public static string BuildLevelPackJson(string packName, IReadOnlyList<WaterSortJsonLevel> levels)
        {
            StringBuilder builder = new();
            builder.AppendLine("{");
            builder.Append("  \"packName\": ").Append(JsonString(packName ?? "Saved Levels")).AppendLine(",");
            builder.AppendLine("  \"levels\": [");
            for (int i = 0; i < levels.Count; i++)
            {
                AppendLevel(builder, levels[i], "    ");
                if (i < levels.Count - 1)
                {
                    builder.AppendLine(",");
                }
                else
                {
                    builder.AppendLine();
                }
            }

            builder.AppendLine("  ]");
            builder.AppendLine("}");
            return builder.ToString();
        }

        private static void AppendLevel(StringBuilder builder, WaterSortJsonLevel level, string indent)
        {
            builder.Append(indent).AppendLine("{");
            builder.Append(indent).Append("  \"id\": ").Append(level.id).AppendLine(",");
            if (!string.IsNullOrWhiteSpace(level.displayName))
            {
                builder.Append(indent).Append("  \"displayName\": ").Append(JsonString(level.displayName)).AppendLine(",");
            }

            if (level.boardLayout != null && !string.IsNullOrWhiteSpace(level.boardLayout.system))
            {
                builder.Append(indent).AppendLine("  \"boardLayout\": {");
                builder.Append(indent).Append("    \"system\": ").Append(JsonString(level.boardLayout.system)).AppendLine(",");
                if (!string.IsNullOrWhiteSpace(level.boardLayout.family))
                {
                    builder.Append(indent).Append("    \"family\": ").Append(JsonString(level.boardLayout.family)).AppendLine(",");
                }

                builder.Append(indent).Append("    \"version\": ").Append(Mathf.Max(1, level.boardLayout.version)).AppendLine();
                builder.Append(indent).AppendLine("  },");
            }

            WaterSortJsonModeOptions modes = level.modeOptions ?? new WaterSortJsonModeOptions();
            builder.Append(indent).AppendLine("  \"modeOptions\": {");
            builder.Append(indent).Append("    \"hiddenStack\": ").Append(JsonBool(modes.hiddenStack)).AppendLine(",");
            builder.Append(indent).Append("    \"hybridHiddenStack\": ").Append(JsonBool(modes.hybridHiddenStack)).AppendLine(",");
            builder.Append(indent).Append("    \"lockedBottles\": ").Append(JsonBool(modes.lockedBottles)).AppendLine(",");
            builder.Append(indent).Append("    \"colorLockedBottles\": ").Append(JsonBool(modes.colorLockedBottles)).AppendLine(",");
            builder.Append(indent).Append("    \"megaBottle\": ").Append(JsonBool(modes.megaBottle)).AppendLine();
            builder.Append(indent).AppendLine("  },");
            builder.Append(indent).AppendLine("  \"bottles\": [");
            List<WaterSortJsonBottle> bottles = level.bottles ?? new List<WaterSortJsonBottle>();
            for (int i = 0; i < bottles.Count; i++)
            {
                AppendBottle(builder, bottles[i], indent + "    ");
                if (i < bottles.Count - 1)
                {
                    builder.AppendLine(",");
                }
                else
                {
                    builder.AppendLine();
                }
            }

            builder.Append(indent).AppendLine("  ]");
            builder.Append(indent).Append("}");
        }

        private static void AppendBottle(StringBuilder builder, WaterSortJsonBottle bottle, string indent)
        {
            List<string> properties = new();
            properties.Add($"\"capacity\": {bottle.capacity}");
            properties.Add($"\"colorsBottomToTop\": {FormatIntArray(bottle.colorsBottomToTop)}");

            if (bottle.hiddenLayerIndexes != null && bottle.hiddenLayerIndexes.Count > 0)
            {
                properties.Add($"\"hiddenLayerIndexes\": {FormatIntArray(bottle.hiddenLayerIndexes)}");
            }

            if (bottle.layoutPosition != null)
            {
                properties.Add(
                    "\"layoutPosition\": {"
                    + $"\"nx\": {JsonFloat(bottle.layoutPosition.nx)}, "
                    + $"\"ny\": {JsonFloat(bottle.layoutPosition.ny)}"
                    + "}");
            }

            if (!string.IsNullOrWhiteSpace(bottle.layoutRole))
            {
                properties.Add($"\"layoutRole\": {JsonString(bottle.layoutRole)}");
            }

            if (bottle.isLocked)
            {
                properties.Add("\"isLocked\": true");
                properties.Add($"\"unlockCompletedBottleCount\": {Mathf.Max(1, bottle.unlockCompletedBottleCount)}");
            }

            if (bottle.isColorLocked)
            {
                properties.Add("\"isColorLocked\": true");
                properties.Add($"\"unlockRequiredColor\": {bottle.unlockRequiredColor}");
                properties.Add(
                    $"\"unlockCompletedColorBottleCount\": {Mathf.Max(1, bottle.unlockCompletedColorBottleCount)}");
            }

            if (bottle.isAdBottle)
            {
                properties.Add("\"isAdBottle\": true");
            }

            if (bottle.isMegaBottle)
            {
                properties.Add("\"isMegaBottle\": true");
                properties.Add($"\"targetColor\": {bottle.targetColor}");
            }

            builder.Append(indent).AppendLine("{");
            for (int i = 0; i < properties.Count; i++)
            {
                builder.Append(indent).Append("  ").Append(properties[i]);
                if (i < properties.Count - 1)
                {
                    builder.Append(',');
                }

                builder.AppendLine();
            }

            builder.Append(indent).Append('}');
        }

        private static string FormatIntArray(List<int> values)
        {
            StringBuilder builder = new();
            AppendIntArray(builder, values);
            return builder.ToString();
        }

        private static void AppendIntArray(StringBuilder builder, List<int> values)
        {
            builder.Append('[');
            if (values != null)
            {
                for (int i = 0; i < values.Count; i++)
                {
                    if (i > 0)
                    {
                        builder.Append(", ");
                    }

                    builder.Append(values[i]);
                }
            }

            builder.Append(']');
        }

        private static string JsonString(string value)
        {
            if (value == null)
            {
                return "null";
            }

            StringBuilder escaped = new();
            escaped.Append('"');
            foreach (char c in value)
            {
                switch (c)
                {
                    case '\\': escaped.Append("\\\\"); break;
                    case '"': escaped.Append("\\\""); break;
                    case '\n': escaped.Append("\\n"); break;
                    case '\r': escaped.Append("\\r"); break;
                    case '\t': escaped.Append("\\t"); break;
                    default: escaped.Append(c); break;
                }
            }

            escaped.Append('"');
            return escaped.ToString();
        }

        private static string JsonBool(bool value) => value ? "true" : "false";

        private static string JsonFloat(float value) =>
            value.ToString("0.####", CultureInfo.InvariantCulture);

        private static WaterSortJsonLayoutGrid CloneLayoutGrid(WaterSortJsonLayoutGrid source)
        {
            if (source == null)
            {
                return new WaterSortJsonLayoutGrid();
            }

            return new WaterSortJsonLayoutGrid
            {
                columns = source.columns,
                rows = source.rows,
                shape = source.shape
            };
        }

        private static WaterSortJsonBoardLayout CloneBoardLayout(WaterSortJsonBoardLayout source)
        {
            if (source == null)
            {
                return new WaterSortJsonBoardLayout();
            }

            return new WaterSortJsonBoardLayout
            {
                system = source.system,
                family = source.family,
                version = source.version
            };
        }

        private static WaterSortJsonModeOptions CloneModeOptions(WaterSortJsonModeOptions source)
        {
            if (source == null)
            {
                return new WaterSortJsonModeOptions();
            }

            return new WaterSortJsonModeOptions
            {
                hiddenStack = source.hiddenStack,
                hybridHiddenStack = source.hybridHiddenStack,
                lockedBottles = source.lockedBottles,
                colorLockedBottles = source.colorLockedBottles,
                megaBottle = source.megaBottle
            };
        }

        private static WaterSortJsonBottle CloneBottle(WaterSortJsonBottle source)
        {
            if (source == null)
            {
                return null;
            }

            return new WaterSortJsonBottle
            {
                capacity = source.capacity,
                colorsBottomToTop = source.colorsBottomToTop == null
                    ? new List<int>()
                    : new List<int>(source.colorsBottomToTop),
                hiddenLayerIndexes = source.hiddenLayerIndexes == null
                    ? new List<int>()
                    : new List<int>(source.hiddenLayerIndexes),
                gridPosition = source.gridPosition == null
                    ? new WaterSortJsonGridPosition()
                    : new WaterSortJsonGridPosition { x = source.gridPosition.x, y = source.gridPosition.y },
                layoutPosition = source.layoutPosition == null
                    ? new WaterSortJsonLayoutPosition()
                    : new WaterSortJsonLayoutPosition { nx = source.layoutPosition.nx, ny = source.layoutPosition.ny },
                layoutRole = source.layoutRole,
                isLocked = source.isLocked,
                unlockCompletedBottleCount = source.unlockCompletedBottleCount,
                isColorLocked = source.isColorLocked,
                unlockRequiredColor = source.unlockRequiredColor,
                unlockCompletedColorBottleCount = source.unlockCompletedColorBottleCount,
                isAdBottle = source.isAdBottle,
                isMegaBottle = source.isMegaBottle,
                targetColor = source.targetColor
            };
        }

        private static WaterSortJsonSolutionData CloneSolutionData(WaterSortJsonSolutionData source)
        {
            if (source == null)
            {
                return new WaterSortJsonSolutionData();
            }

            // Saved list only needs identity for navigation; export strips solutions.
            // Keep a shallow copy of step count / difficulty for UI labels.
            return new WaterSortJsonSolutionData
            {
                solutionCount = source.solutionCount,
                shortestStepCount = source.shortestStepCount,
                storedSolutionCount = source.storedSolutionCount,
                storesAllSolutions = source.storesAllSolutions,
                difficulty = source.difficulty,
                selectionPolicy = source.selectionPolicy,
                solutions = new List<WaterSortJsonSolution>(),
                difficultyMetrics = source.difficultyMetrics,
                layoutMetrics = source.layoutMetrics,
                specialOptions = source.specialOptions
            };
        }
    }
}
