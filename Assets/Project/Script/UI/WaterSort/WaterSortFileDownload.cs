using System.IO;
using System.Runtime.InteropServices;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace TrainWaterSort.UI.WaterSort
{
    public static class WaterSortFileDownload
    {
        /// <summary>
        /// Project Resources folder sibling to generated <c>WaterSort/</c> packs.
        /// Relative to <c>Assets/</c>: <c>Project/Data/WaterSort/Resources/WaterSortExport</c>.
        /// </summary>
        public const string ProjectExportResourcesRelativePath =
            "Project/Data/WaterSort/Resources/WaterSortExport";

        public const string ExportResourcesFolderName = "WaterSortExport";

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void WaterSort_DownloadTextFile(string filename, string content, string mimeType);
#endif

        /// <summary>
        /// Writes text for download.
        /// WebGL: browser download.
        /// Editor: project <c>WaterSortExport/</c> (next to generated <c>WaterSort/</c>), then AssetDatabase refresh.
        /// Other players: <c>persistentDataPath/WaterSortExports</c>.
        /// </summary>
        public static string DownloadText(string filename, string content, string mimeType = "application/json")
        {
            if (string.IsNullOrWhiteSpace(filename))
            {
                filename = "download.txt";
            }

            content ??= string.Empty;
            mimeType = string.IsNullOrWhiteSpace(mimeType) ? "text/plain" : mimeType;

#if UNITY_WEBGL && !UNITY_EDITOR
            WaterSort_DownloadTextFile(filename, content, mimeType);
            return filename;
#else
            string directory = GetExportDirectory();
            string path = Path.Combine(directory, filename);
            File.WriteAllText(path, content);
            Debug.Log($"Saved export to {path}");
            GUIUtility.systemCopyBuffer = path;
#if UNITY_EDITOR
            AssetDatabase.Refresh();
            EditorUtility.RevealInFinder(path);
#endif
            return path;
#endif
        }

        /// <summary>Editor project export folder, or player persistent folder.</summary>
        public static string GetExportDirectory()
        {
#if UNITY_EDITOR
            string directory = Path.Combine(Application.dataPath, ProjectExportResourcesRelativePath);
#else
            string directory = Path.Combine(Application.persistentDataPath, "WaterSortExports");
#endif
            Directory.CreateDirectory(directory);
            return directory;
        }
    }
}
