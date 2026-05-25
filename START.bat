@echo off
cd /d "%~dp0"
echo Starting Flip-Siege on http://localhost:8080/
echo Close this window to stop the server.
start "" "http://localhost:8080/"
python -m http.server 8080
