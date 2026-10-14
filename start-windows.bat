@echo off
REM Opens two windows: the API and the web app.
if not exist backend\.env (
  echo.
  echo  backend\.env is missing.
  echo  Copy backend\.env.example to backend\.env and fill in DATABASE_URL and JWT_SECRET first.
  echo.
  pause
  exit /b 1
)
echo Starting Manase VSLA Management System...
start "Manase API" cmd /k "cd backend && npm install && npm start"
timeout /t 6 /nobreak >nul
start "Manase Web" cmd /k "cd frontend && npm install && npm run dev"
echo.
echo When both windows say they are ready, open http://localhost:5173
pause
