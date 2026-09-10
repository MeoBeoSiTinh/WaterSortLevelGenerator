param(
    [string]$BuildPath = "Builds/WebGL",
    [int]$Port = 8080,
    [string]$HostName = "127.0.0.1"
)

$ScriptRoot = Split-Path -Parent $PSCommandPath
$ProjectRoot = (Resolve-Path (Join-Path $ScriptRoot "..")).Path
$BuildFullPath = if ([System.IO.Path]::IsPathRooted($BuildPath)) {
    $BuildPath
} else {
    Join-Path $ProjectRoot $BuildPath
}

if (-not (Test-Path -LiteralPath (Join-Path $BuildFullPath "index.html"))) {
    throw "WebGL build index.html was not found in $BuildFullPath. Run Tools/Build-WebGL.ps1 first."
}

$PythonCommand = Get-Command py -ErrorAction SilentlyContinue
if ($PythonCommand) {
    Write-Host "Serving $BuildFullPath at http://${HostName}:$Port/"
    & py -3 -m http.server $Port --bind $HostName --directory $BuildFullPath
    exit $LASTEXITCODE
}

$PythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($PythonCommand) {
    Write-Host "Serving $BuildFullPath at http://${HostName}:$Port/"
    & python -m http.server $Port --bind $HostName --directory $BuildFullPath
    exit $LASTEXITCODE
}

throw "Python was not found. Install Python or serve $BuildFullPath with another static web server."
