using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace TrainWaterSort.Editor.WaterSort
{
    public static class WebGLBuildMenu
    {
        private const string DefaultBuildPath = "Builds/WebGL";

        [MenuItem("Tools/Water Sort/Build/WebGL Development Build")]
        public static void BuildDevelopment()
        {
            Build(BuildOptions.Development | BuildOptions.AllowDebugging);
        }

        [MenuItem("Tools/Water Sort/Build/WebGL Release Build")]
        public static void BuildRelease()
        {
            Build(BuildOptions.None);
        }

        private static void Build(BuildOptions options)
        {
            string outputPath = GetArgumentValue("-outputPath") ?? DefaultBuildPath;
            outputPath = Path.GetFullPath(outputPath);
            Directory.CreateDirectory(outputPath);
            string labMarker = Path.Combine(outputPath, "level-lab-build.json");
            if (File.Exists(labMarker)) File.Delete(labMarker);
            WaterSortLevelLabVerification.Run();

            string[] scenes = EditorBuildSettings.scenes
                .Where(scene => scene.enabled)
                .Select(scene => scene.path)
                .ToArray();

            if (scenes.Length == 0)
            {
                throw new InvalidOperationException("No enabled scenes found in Editor Build Settings.");
            }

            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.WebGL, BuildTarget.WebGL);
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;

            BuildPlayerOptions buildPlayerOptions = new()
            {
                scenes = scenes,
                locationPathName = outputPath,
                target = BuildTarget.WebGL,
                options = options
            };

            BuildReport report = BuildPipeline.BuildPlayer(buildPlayerOptions);
            BuildSummary summary = report.summary;

            if (summary.result != BuildResult.Succeeded)
            {
                throw new InvalidOperationException($"WebGL build failed with result {summary.result}.");
            }

            File.WriteAllText(labMarker, "{\"externalCatalogVersion\":1}");
            Debug.Log($"WebGL build completed at {outputPath}");
        }

        private static string GetArgumentValue(string name)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int index = 0; index < args.Length - 1; index++)
            {
                if (string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
                {
                    return args[index + 1];
                }
            }

            return null;
        }
    }
}
