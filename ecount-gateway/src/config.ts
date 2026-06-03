// 환경변수 파싱·검증 — 필수값 미설정 시 부팅 즉시 throw (fail fast).
// 멀티값(ADMIN_EMAILS, ALLOWED_ORIGINS)은 '|' 또는 ',' 구분.
// 주의: gcloud --set-env-vars 는 ','로 변수를 나누므로, 값 안에는 '|'를 쓴다.

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') {
    throw new Error(`환경변수 ${name} 가 설정되지 않았습니다 (필수)`);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v.trim() === '' ? fallback : v.trim();
}

function splitMulti(raw: string): string[] {
  return raw
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseAdminEmails(raw: string): Set<string> {
  const valid = splitMulti(raw)
    .map((e) => e.toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (valid.length === 0) throw new Error('ADMIN_EMAILS 에 유효한 이메일이 없습니다');
  return new Set(valid);
}

function parseOrigins(raw: string): Set<string> {
  const list = splitMulti(raw);
  for (const o of list) {
    try {
      new URL(o);
    } catch {
      throw new Error(`ALLOWED_ORIGINS 형식 오류: ${o}`);
    }
  }
  if (list.length === 0) throw new Error('ALLOWED_ORIGINS 가 비어있습니다');
  return new Set(list);
}

export interface AppConfig {
  port: number;
  ecount: {
    base: string;
    comCode: string;
    userId: string;
    zone: string;
    lanType: string;
    apiKey: string;
    cust: string;
    whCd: string;
    makeFlag: string;
  };
  firebaseProjectId: string;
  adminEmails: Set<string>;
  allowedOrigins: Set<string>;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(optional('PORT', '8080')),
    ecount: {
      base: optional('ECOUNT_BASE', 'https://oapiAC.ecount.com/OAPI/V2').replace(/\/+$/, ''),
      comCode: required('ECOUNT_COM_CODE'),
      userId: required('ECOUNT_USER_ID'),
      zone: required('ECOUNT_ZONE'),
      lanType: optional('ECOUNT_LAN_TYPE', 'ko-KR'),
      apiKey: required('ECOUNT_API_KEY'),
      cust: optional('ECOUNT_CUST', '490-82-00102'),
      whCd: optional('ECOUNT_WH_CD', '100'),
      makeFlag: optional('ECOUNT_MAKE_FLAG', 'N'),
    },
    // 토큰 발급 프로젝트. 명시 필수 — 미지정 시 GOOGLE_CLOUD_PROJECT(logis-TMS)로
    // 추론되어 모든 토큰 검증이 실패한다.
    firebaseProjectId: required('FIREBASE_PROJECT_ID'),
    adminEmails: parseAdminEmails(required('ADMIN_EMAILS')),
    allowedOrigins: parseOrigins(required('ALLOWED_ORIGINS')),
  };
}

export type { AppConfig as Config };
