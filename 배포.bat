@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM  나라미 정산포털 배포 — 더블클릭 한 번으로 끝
REM
REM  하는 일: 최신 코드 받기 → 검사·빌드 → Firebase Hosting 올리기
REM  안 하는 일: functions / firestore.rules / storage.rules 배포
REM             (규칙 배포는 사고 위험이 커서 일부러 뺐다. 필요하면 수동으로)
REM ============================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo   나라미 정산포털 배포
echo   %CD%
echo ============================================================
echo.

REM ── 0. 여기가 맞는 폴더인가 ──────────────────────────────
if not exist "package.json" (
  echo [중단] 이 폴더에 package.json 이 없습니다.
  echo        이 파일을 wellshare-logis-web 폴더 안에 두고 실행하세요.
  goto :fail
)
if not exist "firebase.json" (
  echo [중단] 이 폴더에 firebase.json 이 없습니다.
  goto :fail
)

REM ── 0-2. .env 가 있어야 한다 ─────────────────────────────
REM  VITE_* 값은 빌드 시점에 번들로 들어간다.
REM  없이 빌드하면 Firebase 설정이 undefined 인 "죽은 사이트"가 배포된다.
if not exist ".env" (
  echo [중단] .env 파일이 없습니다.
  echo        이게 없으면 로그인조차 안 되는 사이트가 배포됩니다.
  echo        .env 를 이 폴더에 두고 다시 실행하세요.
  goto :fail
)

REM ── 1. 최신 코드 받기 ────────────────────────────────────
echo [1/4] 최신 코드 받는 중...
call git pull origin main
if errorlevel 1 (
  echo.
  echo [중단] git pull 실패.
  echo        고칠 게 남아 있거나 인터넷이 끊겼을 수 있습니다.
  echo        위 메시지를 그대로 안토니에게 보내주세요.
  goto :fail
)
echo.

REM ── 2. 버전 확인 (SW 캐시명과 맞아야 폰 세션이 갱신된다) ──
echo [2/4] 버전 확인...
findstr /C:"version" package.json
findstr /C:"const CACHE" public\sw.js
echo.
echo        ^^ 위 두 줄의 버전이 서로 같아야 합니다.
echo           다르면 폰·태블릿에 새 화면이 안 뜹니다. (안토니에게 문의)
echo.

REM ── 3. 검사 + 빌드 ───────────────────────────────────────
echo [3/4] 검사하고 빌드하는 중... (2~4분)
call npm run build
if errorlevel 1 (
  echo.
  echo [중단] 빌드 실패 — 아무것도 배포되지 않았습니다. 사이트는 그대로입니다.
  echo        위 에러 메시지를 그대로 안토니에게 보내주세요.
  goto :fail
)
echo.

REM ── 4. 배포 ──────────────────────────────────────────────
echo [4/4] Firebase 에 올리는 중...
REM 전역 firebase 가 깔려 있으면 그걸 쓴다 (기존 로그인을 그대로 활용).
REM 없으면 npx 로 받아서 쓴다 — 로그인 정보는 같은 곳(configstore)에 있어 공유된다.
where firebase >nul 2>&1
if errorlevel 1 (
  call npx --yes firebase-tools@15 deploy --only hosting --project wellshare-logis
) else (
  call firebase deploy --only hosting --project wellshare-logis
)
if errorlevel 1 (
  echo.
  echo [중단] 배포 실패.
  echo.
  echo   "Failed to authenticate" / "not logged in" 이 보이면 로그인이 풀린 겁니다.
  echo   아래를 한 번 실행한 뒤 이 파일을 다시 더블클릭하세요:
  echo.
  echo        npx firebase-tools@15 login
  echo.
  echo   다른 에러면 위 메시지를 그대로 안토니에게 보내주세요.
  goto :fail
)

echo.
echo ============================================================
echo   배포 완료
echo.
echo   https://wellshare-logis.web.app
echo.
echo   브라우저에서 Ctrl+F5 (강력 새로고침) 하세요.
echo   좌측 상단 버전이 바뀌고, 결제내역 옆에 [입금대사] 가 보이면 성공입니다.
echo.
echo   되돌리려면: Firebase 콘솔 - Hosting - 이전 버전 - 롤백
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo ============================================================
echo   중단됨 — 사이트는 바뀌지 않았습니다.
echo ============================================================
echo.
pause
exit /b 1
