@echo off

REM start tor detached
start "" "service/tor.exe"

echo waiting for tor...
:wait
powershell -command "try { $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1',9050); if ($c.Connected) { exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel%==1 (
  timeout /t 1 >nul
  goto wait
)

node server
