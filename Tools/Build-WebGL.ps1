param(
    [string]$UnityPath = "",
    [string]$OutputPath = "Builds/WebGL",
    [switch]$Release
)

$ScriptRoot = Split-Path -Parent $PSCommandPath
$ProjectRoot = (Resolve-Path (Join-Path $ScriptRoot "..")).Path
$ProjectVersionFile = Join-Path $ProjectRoot "ProjectSettings/ProjectVersion.txt"

if ([string]::IsNullOrWhiteSpace($UnityPath)) {
    $VersionLine = Get-Content -LiteralPath $ProjectVersionFile | Where-Object { $_ -like "m_EditorVersion:*" } | Select-Object -First 1
    $UnityVersion = ($VersionLine -replace "m_EditorVersion:\s*", "").Trim()
    $UnityPath = "C:\Program Files\Unity\Hub\Editor\$UnityVersion\Editor\Unity.exe"
}

if (-not (Test-Path -LiteralPath $UnityPath)) {
    throw "Unity executable was not found: $UnityPath"
}

$UnityEditorRoot = Split-Path -Parent $UnityPath
$WebGLSupportPath = Join-Path $UnityEditorRoot "Data/PlaybackEngines/WebGLSupport"
if (-not (Test-Path -LiteralPath $WebGLSupportPath)) {
    throw "Unity WebGL Build Support is not installed for this editor: $UnityEditorRoot. Install it from Unity Hub, then run this script again."
}

$OutputFullPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath
} else {
    Join-Path $ProjectRoot $OutputPath
}

$LogDirectory = Join-Path $ProjectRoot "_bmad-output/build-logs"
New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
$LogFile = Join-Path $LogDirectory "webgl-build.log"
$ExecuteMethod = if ($Release) {
    "TrainWaterSort.Editor.WaterSort.WebGLBuildMenu.BuildRelease"
} else {
    "TrainWaterSort.Editor.WaterSort.WebGLBuildMenu.BuildDevelopment"
}

& $UnityPath `
    -batchmode `
    -quit `
    -projectPath $ProjectRoot `
    -buildTarget WebGL `
    -executeMethod $ExecuteMethod `
    -outputPath $OutputFullPath `
    -logFile $LogFile

if ($LASTEXITCODE -ne 0) {
    throw "Unity WebGL build failed. See $LogFile"
}

Write-Host "WebGL build is ready: $OutputFullPath"
Write-Host "Build log: $LogFile"
