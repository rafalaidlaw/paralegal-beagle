@echo off
rem Paralegal Beagle - double-click to start the tracker.
cd /d "%~dp0"
echo Starting Paralegal Beagle...
echo (Close this window to stop the server.)
echo.
python serve.py
if errorlevel 1 (
  echo.
  echo Something went wrong. If Python is not on your PATH, try:  py serve.py
  pause
)
