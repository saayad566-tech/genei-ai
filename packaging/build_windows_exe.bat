@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_windows_exe.ps1"
if errorlevel 1 (
  echo.
  echo GeneiRunner EXE build failed. Review the output above.
  pause
  exit /b 1
)
echo.
echo GeneiRunner.exe was created in the dist folder.
pause
