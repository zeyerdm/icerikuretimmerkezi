@echo off
chcp 65001 >nul
title Icerik Uretim Merkezi
cd /d "%~dp0"

echo.
echo   Icerik Uretim Merkezi baslatiliyor...
echo.

where node >nul 2>nul
if errorlevel 1 goto install_node

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto old_node
goto deps

:install_node
echo   Node.js bulunamadi. Simdi kuruluyor, bir kac dakika surebilir...
echo   Kurulum izin isterse "Evet" de.
echo.
where winget >nul 2>nul
if errorlevel 1 goto manual_node
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
echo.
echo   Node.js kuruldu. Bu pencereyi kapat ve Baslat dosyasina TEKRAR cift tikla.
echo.
pause
exit /b 0

:old_node
echo   Node.js surumun eski. Guncelleniyor...
where winget >nul 2>nul
if errorlevel 1 goto manual_node
winget upgrade -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
echo.
echo   Guncelleme bitti. Bu pencereyi kapat ve Baslat dosyasina TEKRAR cift tikla.
echo.
pause
exit /b 0

:manual_node
echo   Otomatik kurulum yapilamadi.
echo   Acilan sayfadan Node.js "LTS" surumunu indirip kur,
echo   sonra Baslat dosyasina tekrar cift tikla.
start "" https://nodejs.org/tr/download
echo.
pause
exit /b 1

:deps
if exist node_modules\express goto run
echo   Ilk kurulum yapiliyor, bir dakika surebilir...
call npm install --no-audit --no-fund
if errorlevel 1 goto deps_failed
goto run

:deps_failed
echo.
echo   Kurulum basarisiz oldu. Internet baglantini kontrol edip tekrar dene.
pause
exit /b 1

:run
echo.
echo   Hazir. Tarayici birazdan acilacak: http://localhost:3000
echo   Uygulama calistigi surece BU PENCEREYI KAPATMA.
echo.
set OPEN_BROWSER=1
call node scripts\start.js
echo.
pause
