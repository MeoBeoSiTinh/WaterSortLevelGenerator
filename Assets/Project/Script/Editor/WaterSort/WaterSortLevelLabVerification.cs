using System;
using TrainWaterSort.Core.WaterSort;
using TrainWaterSort.Gameplay.WaterSort;
using UnityEditor;
using UnityEngine;

namespace TrainWaterSort.Editor.WaterSort
{
    public static class WaterSortLevelLabVerification
    {
        [MenuItem("Tools/Water Sort/Verify Level Lab Loading")]
        public static void Run()
        {
            WaterSortJsonCatalog catalog = WaterSortJsonCatalog.Create(null);
            catalog.AddPack("004", Levels(301, 302), Solutions(302, 22, 301, 11), true);
            Check(catalog.Levels[0].solutionData.shortestStepCount == 11, "Explicit IDs must match reordered solutions.");
            Check(catalog.Levels[1].solutionData.shortestStepCount == 22, "Global IDs must not become list indexes.");
            catalog.AddPack("005", Levels(1, 2), Solutions(1, 33, 2, 44), true);
            Check(catalog.Levels[2].solutionData.shortestStepCount == 33, "Local IDs must be scoped to their pack.");
            Check(catalog.Levels[0].solutionData.shortestStepCount == 11, "Another pack must not overwrite solutions.");
            Check(catalog.Levels[0].sourcePackId == "004" && catalog.Levels[2].sourcePackId == "005", "Levels keep pack origin.");
            Check(catalog.Levels[0].GetDisplayName(0) == "[004] Level 301", "Display names include pack id.");
            Check(catalog.Levels[2].GetDisplayName(2) == "[005] Level 1", "Same local names stay unique across packs.");

            WaterSortJsonCatalog sameNames = WaterSortJsonCatalog.Create(null);
            sameNames.AddPack("a", "{\"levels\":[{\"id\":1,\"displayName\":\"Level 1\",\"bottles\":[{}]}]}", null);
            sameNames.AddPack("b", "{\"levels\":[{\"id\":1,\"displayName\":\"Level 1\",\"bottles\":[{}]}]}", null);
            Check(sameNames.Levels[0].GetDisplayName(0) != sameNames.Levels[1].GetDisplayName(1), "Duplicate displayName across packs must disambiguate.");
            Check(sameNames.Levels[0].id == 1 && sameNames.Levels[1].id == 1, "Pack-local ids may repeat across packs.");

            WaterSortJsonCatalog legacy = WaterSortJsonCatalog.Create(null);
            legacy.AddPack("old", "{\"levels\":[{\"bottles\":[{}]},{\"bottles\":[{}]}]}", Solutions(2, 20, 1, 10), true);
            Check(legacy.Levels[0].solutionData.shortestStepCount == 10, "Absent IDs must use unambiguous local identity.");
            ExpectFailure(() => catalog.AddPack("004", Levels(1, 2), null), "duplicate pack");
            ExpectFailure(() => catalog.AddPack("bad", Levels(1, 1), null), "duplicate level");
            ExpectFailure(() => catalog.AddPack("bad", Levels(0, 1), null), "ambiguous fallback identity");
            ExpectFailure(() => catalog.AddPack("bad", Levels(301, 302), Solutions(1, 1, 2, 2), true), "unmatched solutions");
            ExpectFailure(() => catalog.AddPack("bad", Levels(1, 2), Solutions(1, 1, 1, 2), true), "duplicate solutions");
            ExpectFailure(() => catalog.AddPack("bad", Levels(1, 2), null, true), "missing pair");
            ExpectFailure(() => catalog.AddPack("bad", "{", null, true), "malformed JSON");
            Check(catalog.Levels.Count == 4, "Rejected packs must not mutate the catalog.");

            const string player = "http://localhost:8090/player/index.html?levelLab=1&pack=004";
            Check(WaterSortExternalCatalogLoader.IsLabMode(player), "Explicit lab switch.");
            Check(!WaterSortExternalCatalogLoader.IsLabMode(""), "Editor uses Resources.");
            Check(!WaterSortExternalCatalogLoader.IsLabMode(player.Replace("levelLab=1", "levelLab=0")), "Disabled lab switch.");
            Check(WaterSortExternalCatalogLoader.GetQueryValue(player, "pack") == "004", "Pack selection query.");
            Uri resolved = WaterSortExternalCatalogLoader.ResolveSameOriginUrl(new Uri(player), "/api/packs/004/levels?v=abc");
            Check(resolved.AbsoluteUri == "http://localhost:8090/api/packs/004/levels?v=abc", "Preserve snapshot token and origin.");
            ExpectFailure(() => WaterSortExternalCatalogLoader.ResolveSameOriginUrl(new Uri(player), "https://example.com/data"), "cross-origin manifest URL");
            ExpectFailure(() => WaterSortExternalCatalogLoader.ResolveSameOriginUrl(new Uri(player), ""), "missing manifest URL");
            WaterSortJsonCatalog resources = WaterSortJsonCatalog.LoadFromResources("WaterSort", "WaterSortSolutions", null);
            Check(resources.Levels.Count > 0, "Existing Resources catalog still loads.");
            Debug.Log("Level Lab catalog and URL verification passed.");
        }

        private static string Levels(int first, int second) =>
            $"{{\"levels\":[{{\"id\":{first},\"bottles\":[{{}}]}},{{\"id\":{second},\"bottles\":[{{}}]}}]}}";

        private static string Solutions(int first, int firstSteps, int second, int secondSteps) =>
            $"{{\"levelSolutions\":[{{\"levelNumber\":{first},\"solutionData\":{{\"shortestStepCount\":{firstSteps}}}}},{{\"levelNumber\":{second},\"solutionData\":{{\"shortestStepCount\":{secondSteps}}}}}]}}";

        private static void Check(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException(message);
        }

        private static void ExpectFailure(Action action, string scenario)
        {
            try { action(); }
            catch (FormatException) { return; }
            throw new InvalidOperationException($"Expected rejection: {scenario}.");
        }
    }
}
