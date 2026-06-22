# wellshare-logis-web — 프로젝트 룰 (Claude 자동 로드)

> 글로벌 룰 보완. 상세는 자동 메모리 참조.

## 0. 한눈 요약
- **GitHub 계정**: `ttong627` — push 전 `gh auth switch --user ttong627`
- **클라우드**: `wellshare-logis` (#528541497350) · **Firebase**
- **절대 규칙 Top 1**: Firestore 월 문서 저장은 `setDoc(merge)` 사용

## 1. 반드시 지킬 규칙 (MUST)
- **Firestore 저장 패턴**: 월 문서의 **개별 필드는 `updateDoc` 금지**. `setDoc(..., {merge:true})` + 중첩 객체로 저장(부분 갱신 시 데이터 유실 방지).

## 2. 작업 전 확인 (바로바로)
- [ ] `gh` 활성 계정 `ttong627`
- [ ] Firestore 쓰기 시 `setDoc(merge)` 패턴 적용했는가
