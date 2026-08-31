using TrainWaterSort.Gameplay.WaterSort;
using TrainWaterSort.ScriptableObject.WaterSort;
using TrainWaterSort.UI.WaterSort;
using UnityEngine;

namespace TrainWaterSort.Core.WaterSort
{
    public static class WaterSortBootstrap
    {
        private const string LevelResourceFolder = "WaterSort";
        private const string SolutionResourceFolder = "WaterSortSolutions";
        private const string ColorPaletteResourceName = "WaterSortColorPalette";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateGame()
        {
            EnsureCamera();

            WaterSortColorPalette palette = Resources.Load<WaterSortColorPalette>(ColorPaletteResourceName);
            WaterSortJsonCatalog catalog = WaterSortJsonCatalog.LoadFromResources(LevelResourceFolder, SolutionResourceFolder, palette);

            WaterSortGameManager manager = Object.FindFirstObjectByType<WaterSortGameManager>();
            if (manager == null)
            {
                GameObject managerObject = new("WaterSortGameManager");
                manager = managerObject.AddComponent<WaterSortGameManager>();
                manager.Initialize(catalog);
            }
            else if (manager.Catalog == null)
            {
                manager.Initialize(catalog);
            }

            if (Object.FindFirstObjectByType<WaterSortGameView>() != null)
            {
                return;
            }

            GameObject viewObject = new("WaterSortGameView");
            WaterSortGameView view = viewObject.AddComponent<WaterSortGameView>();
            view.Initialize(manager);
        }

        private static void EnsureCamera()
        {
            if (Camera.main != null)
            {
                return;
            }

            GameObject cameraObject = new("Main Camera");
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.tag = "MainCamera";
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.95f, 0.97f, 1f);
            camera.orthographic = true;
        }
    }
}
