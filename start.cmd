@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ==============================================
echo  Trading Platform - local start
echo ==============================================
echo.

REM ---- Overridable paths (set these in your shell to change them) ----
if not defined BAO_EXE    set "BAO_EXE=D:\OpenBao\bao.exe"
if not defined PG_SERVICE set "PG_SERVICE=postgresql-x64-18"

REM ---- 1. .env must exist; it holds the DB URL, API key and OpenBao token ----
if not exist ".env" (
  echo [FAIL] .env not found in %CD%
  echo        The app cannot start without it. See CLAUDE.md.
  exit /b 1
)

set "BAO_DEV_TOKEN="
set "APP_PORT="
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"OPENBAO_TOKEN=" ".env"') do set "BAO_DEV_TOKEN=%%B"
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"PORT=" ".env"') do set "APP_PORT=%%B"
if not defined APP_PORT set "APP_PORT=3000"

if not defined BAO_DEV_TOKEN (
  echo [FAIL] OPENBAO_TOKEN not found in .env
  exit /b 1
)

REM OpenBao refuses to create a dev root token whose ID carries the "s." prefix
REM ^("invalid request"^) - that prefix is issued by the server, it can't be supplied.
REM Caught the hard way; guarding so it fails loudly instead of confusingly.
echo !BAO_DEV_TOKEN! | findstr /b /c:"s." >nul
if not errorlevel 1 (
  echo [FAIL] OPENBAO_TOKEN in .env starts with "s." - OpenBao cannot pin that as a
  echo        dev root token. Replace it with a plain value ^(e.g. a UUID^) in .env.
  exit /b 1
)

REM ---- 2. Postgres (a Windows service; normally already running) ----
echo [1/4] Postgres service "%PG_SERVICE%"...
sc query "%PG_SERVICE%" 2>nul | findstr /c:"RUNNING" >nul
if errorlevel 1 (
  echo       not running - attempting to start ^(may need an elevated prompt^)...
  net start "%PG_SERVICE%" >nul 2>&1
  sc query "%PG_SERVICE%" 2>nul | findstr /c:"RUNNING" >nul
  if errorlevel 1 (
    echo [FAIL] Could not start Postgres. Start it manually, then re-run.
    exit /b 1
  )
)
echo       OK
echo.

REM ---- 3. OpenBao dev server ----
REM Dev mode is in-memory: it issues a NEW random root token on every start, which
REM silently invalidates the one in .env (this is what caused a 403 on session save
REM before). Pinning -dev-root-token-id to the .env value keeps the two in sync.
echo [2/4] OpenBao (dev, in-memory)...
REM A real TCP connect, not netstat text-matching - the latter false-positived in
REM testing and reported OK while nothing was actually listening.
call :port_open 8200
if not errorlevel 1 (
  echo       already running
  goto bao_ready
)

if not exist "%BAO_EXE%" (
  echo [FAIL] OpenBao not found at "%BAO_EXE%"
  echo        Set BAO_EXE to its real path, then re-run.
  exit /b 1
)

echo       starting in a separate window...
start "OpenBao (dev)" /min "%BAO_EXE%" server -dev -dev-root-token-id="!BAO_DEV_TOKEN!"

REM Waits via PowerShell rather than timeout.exe - timeout fails outright when stdin
REM is redirected, and on a PATH carrying Unix tools it resolves to GNU timeout.
powershell -NoProfile -Command "for($i=0;$i -lt 20;$i++){$c=New-Object Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',8200);$c.Dispose();exit 0}catch{Start-Sleep -Seconds 1}}; exit 1"
if errorlevel 1 (
  echo [FAIL] OpenBao did not become ready within 20s.
  echo        Check the "OpenBao (dev)" window for the reason.
  exit /b 1
)

:bao_ready
echo       OK ^(port 8200^)
echo.

REM ---- 4. Build, then run ----
echo [3/4] Building...
call npm run build
if errorlevel 1 (
  echo.
  echo [FAIL] Build failed - not starting the app on a stale dist/.
  exit /b 1
)
echo       OK
echo.

echo [4/4] Starting app...
echo.
echo   Dashboard: http://localhost:%APP_PORT%
echo.
echo   Note: OpenBao dev mode is in-memory, so any previously connected broker
echo   session is gone after a restart - reconnect the account from the dashboard.
echo   Angel One sessions also expire at 00:00 IST daily regardless.
echo.
echo   Ctrl+C to stop the app. The OpenBao window stays open; close it separately.
echo ----------------------------------------------
echo.

node --env-file=.env dist/http/server.js
exit /b %errorlevel%

REM ---- helper: sets errorlevel 0 if something is listening on port %1 ----
:port_open
powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',%1);exit 0}catch{exit 1}finally{$c.Dispose()}" >nul 2>&1
exit /b %errorlevel%
