// 환경변수 파싱·검증 — 필수값 미설정 시 부팅 즉시 throw (fail fast).
// 멀티회사: ECOUNT_COMPANIES(JSON 배열)로 회사코드별 ID/ZONE/도메인/거래처를 정의하고,
// 각 회사 API키는 별도 시크릿을 환경변수(keyEnv)로 주입받는다.

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

// 회사(COM_CODE)별 설정
export interface CompanyConfig {
  comCode: string;
  label: string;
  userId: string;
  zone: string;
  base: string;
  apiKey: string;
  cust: string;
  whCd: string;
  makeFlag: string;
}

interface CompanyEntry {
  comCode: string | number;
  label?: string;
  userId: string;
  zone: string;
  base: string;
  keyEnv: string; // API키가 담긴 환경변수 이름(시크릿 주입)
  cust?: string;
  whCd?: string;
  makeFlag?: string;
}

function parseCompanies(): { companies: Map<string, CompanyConfig>; defaultComCode: string } {
  let arr: CompanyEntry[];
  try {
    arr = JSON.parse(required('ECOUNT_COMPANIES'));
  } catch {
    throw new Error('ECOUNT_COMPANIES JSON 파싱 실패');
  }
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('ECOUNT_COMPANIES 가 비어있습니다');

  const companies = new Map<string, CompanyConfig>();
  for (const c of arr) {
    const comCode = String(c.comCode);
    const apiKey = (process.env[c.keyEnv] || '').trim();
    if (!apiKey) throw new Error(`회사 ${comCode}: 키 환경변수 ${c.keyEnv} 가 없습니다`);
    if (!c.userId || !c.zone || !c.base) throw new Error(`회사 ${comCode}: userId/zone/base 필수`);
    companies.set(comCode, {
      comCode,
      label: c.label || comCode,
      userId: c.userId,
      zone: c.zone,
      base: String(c.base).replace(/\/+$/, ''),
      apiKey,
      cust: c.cust || '',
      whCd: String(c.whCd || '100'),
      makeFlag: c.makeFlag || 'N',
    });
  }
  return { companies, defaultComCode: String(arr[0].comCode) };
}

export interface AppConfig {
  port: number;
  companies: Map<string, CompanyConfig>;
  defaultComCode: string;
  firebaseProjectId: string;
  adminEmails: Set<string>;
  allowedOrigins: Set<string>;
}

export function loadConfig(): AppConfig {
  const { companies, defaultComCode } = parseCompanies();
  return {
    port: Number(optional('PORT', '8080')),
    companies,
    defaultComCode,
    // 토큰 발급 프로젝트. 명시 필수 — 미지정 시 GOOGLE_CLOUD_PROJECT(logis-TMS)로
    // 추론되어 모든 토큰 검증이 실패한다.
    firebaseProjectId: required('FIREBASE_PROJECT_ID'),
    adminEmails: parseAdminEmails(required('ADMIN_EMAILS')),
    allowedOrigins: parseOrigins(required('ALLOWED_ORIGINS')),
  };
}

export type { AppConfig as Config };
