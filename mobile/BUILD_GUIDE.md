# APK 빌드 & 자동 업데이트(OTA) 가이드

> 한 번 APK를 설치하면, 이후 코드 수정은 **앱 재설치 없이 자동 업데이트**됩니다.
> (네이티브 변경이 없는 한 — 화면·로직·디자인 수정은 전부 OTA로 자동 반영)

---

## ⚡ 방법 1 — 로컬 APK (이 PC, 로그인 불필요·즉시)

이 PC엔 Android Studio SDK(`C:\Android\sdk`)와 Java 21이 있어 **EAS 로그인 없이 바로 빌드**됩니다.

```
cd mobile
# 0) 아이콘 없으면 먼저 생성(assets/icon.png·adaptive-icon.png·splash-icon.png)
npx expo prebuild --platform android --no-install --clean
printf 'sdk.dir=C:/Android/sdk\n' > android/local.properties
cd android
ANDROID_HOME=C:/Android/sdk sh ./gradlew assembleRelease --no-daemon
```

- 결과 APK: `android/app/build/outputs/apk/release/app-release.apk`
- 첫 빌드는 의존성 다운로드로 10~25분(이후엔 수 분)
- 이 APK를 폰에 복사·설치(“출처를 알 수 없는 앱” 허용). **debug 키 서명이라 사이드로드 설치 가능**

> ⚠️ git bash에서 `cmd.exe //c "gradlew.bat …"`는 경로 인식 실패 → 반드시 `sh ./gradlew`.
> ⚠️ 로컬 APK는 OTA 자동업데이트를 못 받습니다. 수정 후엔 위 빌드를 다시 돌리거나, 자동업데이트가 필요하면 아래 **방법 2**로.

---

## A. 방법 2 — EAS 클라우드 + 자동 업데이트(OTA) · 최초 1회 셋업

### 1단계 — Expo 계정 (무료)
https://expo.dev/signup 에서 계정 생성

### 2단계 — mobile 폴더에서 EAS 로그인
```
cd mobile
npm install -g eas-cli      # 최초 1회만
eas login                   # 이메일/비밀번호
```

### 3단계 — 프로젝트 등록 + 업데이트(OTA) 설정 (자동 업데이트 핵심)
```
eas init                    # Expo에 프로젝트 등록(projectId 자동 기록)
eas update:configure        # app.json에 업데이트 URL 자동 주입
```
> 이 두 명령이 `app.json`의 `extra.eas.projectId`와 `updates.url`을 채웁니다.
> (이미 `runtimeVersion`·`updates`·`expo-updates` 플러그인은 설정돼 있음)

### 4단계 — Android APK 빌드
```
eas build --platform android --profile preview
```
- 클라우드 빌드 약 10~15분 → 완료 시 **APK 다운로드 URL** 출력
- 폰에 APK 설치(“출처를 알 수 없는 앱” 허용 필요)
- 이 APK는 **preview 채널**의 업데이트를 자동 수신합니다

---

## B. 이후 — 코드 수정 후 자동 배포하기 (재설치 불필요)

화면·기능·디자인을 고친 뒤, 폴더에서 한 줄만 실행하면 끝:
```
eas update --branch preview -m "수정 내용 메모"
```
- 사용자가 **앱을 다시 켜면** 새 버전을 감지 → 자동 다운로드 → 적용(재시작)
- 본 앱은 실행 즉시 확인하도록 설정됨(`useOtaUpdate` + `checkAutomatically: ON_LOAD`)

### 언제 새 APK가 다시 필요한가?
- 네이티브 패키지 추가/제거(`expo install …`로 native 모듈 추가) 시
- `app.json`의 `version`(예: 1.0.0 → 1.1.0)을 올렸을 때
  → `runtimeVersion: appVersion` 정책상, 버전을 올리면 새 APK + 같은 버전 채널로 업데이트
- 그 외 JS/디자인 변경은 **전부 `eas update`로 OTA 처리**

---

## C. 운영(스토어/정식) 빌드 — 선택
```
eas build --platform android --profile production   # APK, versionCode 자동 증가
eas update --branch production -m "운영 업데이트"
```

---

## D. 즉시 테스트 (계정·빌드 불필요)
```
npx expo start --tunnel
```
Play스토어 "Expo Go" 앱으로 QR 스캔 → 바로 실행.
(단, Expo Go에서는 OTA 자동업데이트는 동작하지 않음 — 빌드된 APK에서만)

---

## 설정 요약 (이미 적용됨)
| 파일 | 설정 |
|---|---|
| `app.json` | `runtimeVersion:{policy:appVersion}`, `updates:{enabled,checkAutomatically:ON_LOAD,fallbackToCacheTimeout:0}`, `android.versionCode`, plugin `expo-updates` |
| `eas.json` | preview→`channel:preview`(apk), production→`channel:production`(apk, autoIncrement) |
| `App.tsx` | 실행 시 `useOtaUpdate()`로 새 버전 감지→다운로드→재시작 |
| `src/hooks/useOtaUpdate.ts` | OTA 체크 로직(개발모드 비활성, 실패 시 캐시버전 구동) |
