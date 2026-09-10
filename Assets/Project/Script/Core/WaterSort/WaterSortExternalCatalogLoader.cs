using System;
using System.Collections;
using TrainWaterSort.Gameplay.WaterSort;
using TrainWaterSort.ScriptableObject.WaterSort;
using UnityEngine;
using UnityEngine.Networking;

namespace TrainWaterSort.Core.WaterSort
{
    /// <summary>Loads one validated localhost pack before the gameplay manager is initialized.</summary>
    public sealed class WaterSortExternalCatalogLoader : MonoBehaviour
    {
        private string status = "Loading Level Lab data…";
        private bool failed;

        public static bool IsLabMode(string url) => GetQueryValue(url, "levelLab") == "1";

        public static string GetQueryValue(string url, string key)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out Uri uri)) return null;
            foreach (string pair in uri.Query.TrimStart('?').Split('&'))
            {
                string[] parts = pair.Split(new[] { '=' }, 2);
                if (Uri.UnescapeDataString(parts[0]) == key)
                    return parts.Length == 2 ? Uri.UnescapeDataString(parts[1].Replace("+", " ")) : string.Empty;
            }
            return null;
        }

        public static Uri ResolveSameOriginUrl(Uri playerUrl, string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !Uri.TryCreate(playerUrl, path, out Uri result)
                || result.Scheme != playerUrl.Scheme || result.Authority != playerUrl.Authority
                || (result.Scheme != "http" && result.Scheme != "https") || !string.IsNullOrEmpty(result.UserInfo))
                throw new FormatException("Level Lab manifest contains an invalid or cross-origin data URL.");
            return result;
        }

        public void Initialize(WaterSortColorPalette palette, Action<WaterSortJsonCatalog> onLoaded)
        {
            StartCoroutine(Load(palette, onLoaded));
        }

        private IEnumerator Load(WaterSortColorPalette palette, Action<WaterSortJsonCatalog> onLoaded)
        {
            if (!Uri.TryCreate(Application.absoluteURL, UriKind.Absolute, out Uri playerUrl))
            {
                Fail("The player must be opened from the Level Lab localhost server.");
                yield break;
            }
            string manifestJson = null;
            yield return Fetch(new Uri(playerUrl, "/api/manifest"), value => manifestJson = value);
            if (failed) yield break;

            ManifestPack selected = null;
            Uri levelsUrl = null;
            Uri solutionsUrl = null;
            try
            {
                Manifest manifest = JsonUtility.FromJson<Manifest>(manifestJson);
                if (manifest?.packs == null || manifest.packs.Length == 0)
                    throw new FormatException("No validated packs are available. Return to the Level Lab page for validation errors.");
                string requested = GetQueryValue(Application.absoluteURL, "pack");
                foreach (ManifestPack pack in manifest.packs)
                {
                    if (pack == null || string.IsNullOrWhiteSpace(pack.id))
                        throw new FormatException("Manifest contains a pack without an identity.");
                    if ((requested == null && selected == null) || pack.id == requested)
                    {
                        if (selected != null && requested != null)
                            throw new FormatException($"Duplicate manifest pack identity {requested}.");
                        selected = pack;
                    }
                }
                if (selected == null) throw new FormatException($"Pack {requested} is unavailable. Return to the Level Lab page for validation errors.");
                levelsUrl = ResolveSameOriginUrl(playerUrl, selected.levelUrl);
                solutionsUrl = ResolveSameOriginUrl(playerUrl, selected.solutionUrl);
            }
            catch (Exception exception) { Fail(exception.Message); }
            if (failed) yield break;

            status = $"Loading Level Lab pack {selected.id}…";
            string levelJson = null;
            string solutionJson = null;
            yield return Fetch(levelsUrl, value => levelJson = value);
            if (failed) yield break;
            yield return Fetch(solutionsUrl, value => solutionJson = value);
            if (failed) yield break;
            try
            {
                WaterSortJsonCatalog catalog = WaterSortJsonCatalog.Create(palette);
                catalog.AddPack(selected.id, levelJson, solutionJson, requireSolutions: true);
                if (catalog.Levels.Count != selected.levelCount)
                    throw new FormatException($"Pack {selected.id}: manifest and level count differ. Reload the Level Lab page.");
                onLoaded(catalog);
                Destroy(gameObject);
            }
            catch (Exception exception) { Fail($"Pack {selected.id}: {exception.Message}"); }
        }

        private IEnumerator Fetch(Uri url, Action<string> receive)
        {
            using UnityWebRequest request = UnityWebRequest.Get(url.AbsoluteUri);
            request.timeout = 60;
            yield return request.SendWebRequest();
            if (request.result != UnityWebRequest.Result.Success)
            {
                Fail($"{url.AbsolutePath}: HTTP {request.responseCode} — {request.error}");
                yield break;
            }
            receive(request.downloadHandler.text);
        }

        private void Fail(string message)
        {
            failed = true;
            status = $"Level Lab could not load data.\n\n{message}\n\nReturn to the Level Lab page, fix the pack, then reload the player.";
            Debug.LogError(status);
        }

        // A startup-only overlay: no gameplay manager/view is created until the pair loads successfully.
        private void OnGUI()
        {
            float width = Mathf.Min(Screen.width * 0.9f, 800f);
            GUIStyle style = new(GUI.skin.box) { wordWrap = true, alignment = TextAnchor.MiddleCenter,
                fontSize = Mathf.Clamp(Mathf.RoundToInt(Screen.width / 35f), 16, 28) };
            GUI.Box(new Rect((Screen.width - width) / 2f, Screen.height * 0.2f, width, Screen.height * 0.6f), status, style);
        }

        [Serializable]
        private sealed class Manifest { public ManifestPack[] packs; }

        [Serializable]
        private sealed class ManifestPack
        {
            public string id;
            public string levelUrl;
            public string solutionUrl;
            public int levelCount;
        }
    }
}
