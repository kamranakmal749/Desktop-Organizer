@echo off
setlocal

echo ============================================
echo  Desktop Organizer - Production Build
echo ============================================
echo.

echo [1/3] Building production bundle...
call npm run tauri build
if errorlevel 1 (
    echo.
    echo  Build failed. Check the output above for errors.
    pause
    exit /b 1
)

echo.
echo [2/3] Build complete. Opening output folder...
echo.

set "BUNDLE=%~dp0src-tauri\target\release\bundle"

if exist "%BUNDLE%\nsis" (
    explorer "%BUNDLE%\nsis"
) else if exist "%BUNDLE%\msi" (
    explorer "%BUNDLE%\msi"
) else (
    echo  Bundle folder not found at %BUNDLE%
)

echo.
echo ============================================
echo  Done! Installers are in:
echo    NSIS: src-tauri\target\release\bundle\nsis\
echo    MSI:  src-tauri\target\release\bundle\msi\
echo ============================================
echo.
pause
