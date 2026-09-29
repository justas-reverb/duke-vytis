@echo off
rem Duke Vytis 4K launcher.
rem
rem Runs the game in a Chromium window with --app, which removes every piece of browser
rem UI: no tabs, no address bar, no bookmarks. That matters for more than looks -- in a
rem normal tab the chrome steals 100-200px of height, which at 4K drops the integer
rem scale from 2 to 1 and puts black bars on all four sides, or in AUTO swaps the crisp
rem image for a soft fractional fill. In app mode at fullscreen the 1920x1080 buffer
rem maps to exactly 2x2 blocks filling 3840x2160.
rem
rem Close this window to stop the server.

title Duke Vytis 4K - close this window to stop the game
cd /d "%~dp0"

set "URL=http://127.0.0.1:8173/"
set "PROFILE=%TEMP%\dukevytis-chrome"

rem A dedicated profile directory is not optional: without it Chrome hands the URL to
rem an already-running instance and silently drops every flag below.
set "BROWSER="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do if not defined BROWSER if exist %%~P set "BROWSER=%%~P"

echo.
echo   DUKE VYTIS
echo   and the Quest for New Lands
if defined BROWSER (
  echo   browser : %BROWSER%
) else (
  echo   browser : none found, using your default
)
echo   serving : %URL%
echo.
echo   F toggles fullscreen.  O opens graphics options.
echo.

rem Start the server minimised, give it a moment to bind, then open the window.
start "Duke Vytis server" /min cmd /c "node tools\serve.mjs"
timeout /t 2 /nobreak >nul

if defined BROWSER (
  start "" "%BROWSER%" ^
    --app=%URL% ^
    --start-fullscreen ^
    --user-data-dir="%PROFILE%" ^
    --autoplay-policy=no-user-gesture-required ^
    --disable-features=CalculateNativeWinOcclusion
) else (
  start "" "%URL%"
)

echo   Game launched. Close the minimised "Duke Vytis server" window to stop it.
rem No pause here. This console is the foreground window at the moment it is printed,
rem and holding it for another four seconds meant the player's first keypress went to
rem THIS window rather than to the game -- which, since the audio only started on a
rem gesture the game could see, is why the music appeared to need a mouse click.
