@echo off
setlocal

set "EXE=%~dp0src-tauri\target\release\desktop-organizer.exe"

if exist "%EXE%" (
    echo Starting Desktop Organizer...
    start "" "%EXE%"
) else (
    echo.
    echo  Production build not found.
    echo  Run build-final.bat first to compile the app.
    echo.
)

endlocal
