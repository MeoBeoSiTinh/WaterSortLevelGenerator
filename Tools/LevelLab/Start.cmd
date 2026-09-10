@echo off
setlocal
cd /d "%~dp0"

rem Packaged lab root has Tools\LevelLab\server.js here.
rem Source copy lives in Tools\LevelLab\, so climb to the Unity project root.
if exist "Tools\LevelLab\server.js" (
  rem already at lab/project root
) else if exist "server.js" (
  cd /d "%~dp0..\.."
) else (
  echo Cannot find Tools\LevelLab\server.js. Run Start.cmd from the Level Lab folder.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is missing. Install Node.js 22 or newer, then run Start.cmd again.
  pause
  exit /b 1
)

echo Starting Water Sort Level Lab...
echo The browser URL is printed below. Keep this window open while you play.
node Tools\LevelLab\server.js
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo Level Lab failed to start. See the message above.
)
echo.
pause
exit /b %EXITCODE%
