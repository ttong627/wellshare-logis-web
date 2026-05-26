# 앱 빌드 & 다운로드 링크 받기

## 1단계 — Expo 계정 만들기 (무료)
https://expo.dev/signup 에서 계정 생성

## 2단계 — 터미널에서 mobile/ 폴더로 이동

```
cd mobile
```

## 3단계 — EAS 로그인

```
eas login
```
(이메일/비밀번호 입력)

## 4단계 — Android APK 빌드 요청

```
eas build --platform android --profile preview
```

- 첫 실행 시 "프로젝트를 Expo에 등록할까요?" 질문 → Y
- 빌드는 클라우드에서 약 10~15분 소요
- 완료되면 콘솔에 APK 다운로드 URL 출력됨

## 빌드 완료 후

1. 출력된 URL에서 APK 다운로드
2. 안드로이드폰으로 공유 (카카오톡, 이메일 등)
3. 폰에서 파일 열어 설치 (출처를 알 수 없는 앱 허용 필요)

---

## Expo Go로 즉시 테스트 (계정 불필요)

```
npx expo start --tunnel
```

QR 코드를 Expo Go 앱으로 스캔하면 바로 실행됩니다.
(Play Store에서 "Expo Go" 검색 후 설치)
