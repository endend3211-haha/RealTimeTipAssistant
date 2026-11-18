@echo off
powershell.exe -NoProfile -File "%~dp0run-messenger-companion.ps1"
if errorlevel 1 pause
