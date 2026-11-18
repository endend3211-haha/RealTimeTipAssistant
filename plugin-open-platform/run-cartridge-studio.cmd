@echo off
cd /d "%~dp0"
node PhoneSDK/tools/run-browser-studio.mjs --plugin examples/cartridge-library
pause
