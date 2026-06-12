@echo off
title KobiFind Launch Manager
echo =======================================================
echo          KobiFind KOBI Bulucu Platformu Baslatiliyor    
echo =======================================================
echo.

:: Check for node_modules in backend
if not exist "backend\node_modules\" (
    echo [INFO] Sunucu bagimliliklari eksik. Yukleniyor...
    cd backend && call npm install && cd ..
) else (
    echo [OK] Sunucu bagimliliklari yuklu.
)

:: Check for node_modules in frontend
if not exist "frontend\node_modules\" (
    echo [INFO] Arayuz bagimliliklari eksik. Yukleniyor...
    cd frontend && call npm install && cd ..
) else (
    echo [OK] Arayuz bagimliliklari yuklu.
)

echo.
echo [INFO] Servisler baslatiliyor...
echo [INFO] Sunucu penceresi aciliyor (Port: 5000)...
start "KobiFind Sunucu (Backend)" cmd /k "cd backend && npm run dev"

echo [INFO] Arayuz penceresi aciliyor (Port: 5173)...
start "KobiFind Arayuz (Frontend)" cmd /k "cd frontend && npm run dev"

echo.
echo [INFO] Tarayici otomatik olarak aciliyor...
timeout /t 4 >nul
start http://localhost:5173

echo.
echo =======================================================
echo [OK] Sistem aktif! Pencereyi kapatabilirsiniz.
echo      Sunucu ve Arayuz calismaya devam edecektir.
echo =======================================================
timeout /t 5 >nul
