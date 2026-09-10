using System;
using System.Diagnostics;
using System.IO;
using UnityEditor;
using UnityEngine;
using Debug = UnityEngine.Debug;

namespace TrainWaterSort.Editor.WaterSort
{
    public static class WaterSortLevelGenerationMenu
    {
        private const string GeneratorPath = "Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js";
        private const string ConfigPath = "Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset";
        private const string LevelOutputPath = "Assets/Project/Data/WaterSort/Resources/WaterSort";
        private const string SolutionOutputPath = "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions";

        [MenuItem("Tools/Water Sort/Level Generation/Generate New Pack")]
        public static void GenerateNewPack()
        {
            RunGenerator(FindNextPackIndex(), CreateTimeVariant());
        }

        [MenuItem("Tools/Water Sort/Level Generation/Regenerate Pack 001")]
        public static void RegeneratePack001()
        {
            RunGenerator(1, CreateTimeVariant());
        }

        [MenuItem("Tools/Water Sort/Level Generation/Open Generation Config")]
        public static void OpenGenerationConfig()
        {
            UnityEngine.Object config = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(ConfigPath);
            if (config == null)
            {
                EditorUtility.DisplayDialog("Water Sort Level Generation", $"Missing config asset:\n{ConfigPath}", "OK");
                return;
            }

            Selection.activeObject = config;
            EditorGUIUtility.PingObject(config);
        }

        [MenuItem("Tools/Water Sort/Level Generation/Open Output Folders")]
        public static void OpenOutputFolders()
        {
            EnsureOutputFolders();
            EditorUtility.RevealInFinder(LevelOutputPath);
        }

        private static void RunGenerator(int packIndex, int variant)
        {
            if (!File.Exists(GeneratorPath))
            {
                EditorUtility.DisplayDialog("Water Sort Level Generation", $"Missing generator script:\n{GeneratorPath}", "OK");
                return;
            }

            if (!File.Exists(ConfigPath))
            {
                EditorUtility.DisplayDialog("Water Sort Level Generation", $"Missing generation config:\n{ConfigPath}", "OK");
                return;
            }

            EnsureOutputFolders();

            ProcessStartInfo startInfo = new()
            {
                FileName = "node",
                Arguments = $"\"{GeneratorPath}\" {packIndex} {variant}",
                WorkingDirectory = Directory.GetCurrentDirectory(),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            try
            {
                using Process process = Process.Start(startInfo);
                if (process == null)
                {
                    EditorUtility.DisplayDialog("Water Sort Level Generation", "Failed to start Node.js.", "OK");
                    return;
                }

                string output = process.StandardOutput.ReadToEnd();
                string error = process.StandardError.ReadToEnd();
                process.WaitForExit();

                AssetDatabase.Refresh();

                if (process.ExitCode != 0)
                {
                    Debug.LogError(error);
                    EditorUtility.DisplayDialog("Water Sort Level Generation", $"Generator failed. See Console for details.\n\n{TrimForDialog(error)}", "OK");
                    return;
                }

                Debug.Log(output);
                EditorUtility.DisplayDialog("Water Sort Level Generation", $"Generated new Water Sort data pack {packIndex:000}.", "OK");
            }
            catch (Exception exception)
            {
                EditorUtility.DisplayDialog(
                    "Water Sort Level Generation",
                    $"Could not run Node.js. Install Node.js and make sure 'node' is available in PATH.\n\n{exception.Message}",
                    "OK");
            }
        }

        private static void EnsureOutputFolders()
        {
            Directory.CreateDirectory(LevelOutputPath);
            Directory.CreateDirectory(SolutionOutputPath);
        }

        private static int FindNextPackIndex()
        {
            EnsureOutputFolders();
            int maxIndex = 0;
            foreach (string file in Directory.GetFiles(LevelOutputPath, "watersort-levels-*.json"))
            {
                string name = Path.GetFileNameWithoutExtension(file);
                string suffix = name.Substring("watersort-levels-".Length);
                if (int.TryParse(suffix, out int index))
                {
                    maxIndex = Math.Max(maxIndex, index);
                }
            }

            return Mathf.Clamp(maxIndex + 1, 1, 999);
        }

        private static int CreateTimeVariant()
        {
            return Math.Abs((int)(DateTime.UtcNow.Ticks % int.MaxValue));
        }

        private static string TrimForDialog(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                return string.Empty;
            }

            const int maxLength = 700;
            return text.Length <= maxLength ? text : text.Substring(0, maxLength);
        }
    }
}
