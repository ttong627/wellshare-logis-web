'use strict';

// 명단(PII) 열람 이상 판정 — 순수 함수만 둔다(테스트 가능하게).
//
// ★기록만 남기면 아무도 안 본다. 사고는 로그를 뒤지는 사람이 없을 때 커진다.
//   그래서 기록이 들어오는 즉시 규칙을 돌리고 사람에게 보낸다.
// ★임계값은 명단 규모에 맞춘다. 전체가 31건뿐이라 nexus(배송건 수천)보다 훨씬 낮다.

const DEFAULTS = {
  windowMin: 10,        // 관찰 창(분)
  bulkDownloads: 8,     // 그 창 안에 한 사람이 받은 파일 수
  distinctRegions: 4,   // 그 창 안에 훑은 서로 다른 지역 수
  nightStart: 1,        // 심야 시작(KST 시)
  nightEnd: 5,          // 심야 끝(KST 시)
  nightDownloads: 3,    // 심야에 이만큼 넘게 받으면 알린다
};

/** ISO 문자열 → KST 시(0~23). 서버는 UTC 로 돈다 — 여기서 한 번만 바꾼다. */
function kstHour(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return -1;
  return new Date(t.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
}

/**
 * 최근 열람 기록으로 이상을 판정한다.
 * @param {Array} recent `{at, region, adminOnly}` 목록(같은 행위자)
 * @param {object} [opts] `{config, now}` — 테스트 결정성을 위해 주입 가능
 */
function detectAnomalies(recent = [], opts = {}) {
  const cfg = { ...DEFAULTS, ...(opts.config || {}) };
  const now = opts.now ? new Date(opts.now) : new Date();
  const since = now.getTime() - cfg.windowMin * 60 * 1000;

  const rows = (Array.isArray(recent) ? recent : [])
    .filter((r) => r && r.at)
    .filter((r) => {
      const t = new Date(r.at).getTime();
      return !Number.isNaN(t) && t >= since && t <= now.getTime();
    });
  if (!rows.length) return [];

  const out = [];

  // ① 짧은 시간 대량 내려받기 — 명단을 통째로 빼가는 전형
  if (rows.length >= cfg.bulkDownloads) {
    out.push({
      kind: 'bulk_download', severity: 'high',
      message: `${cfg.windowMin}분 안에 명단 ${rows.length}건 내려받음 (임계 ${cfg.bulkDownloads}). 정상 업무인지 즉시 확인이 필요합니다.`,
    });
  }

  // ② 여러 지역을 훑는 패턴 — 회원사는 보통 자기 담당 지역만 본다
  const regions = new Set(rows.map((r) => String(r.region || '')).filter(Boolean));
  if (regions.size >= cfg.distinctRegions) {
    out.push({
      kind: 'many_regions', severity: 'high',
      message: `${cfg.windowMin}분 안에 서로 다른 지역 ${regions.size}곳의 명단 접근. 담당 범위를 넘어서는 열람일 수 있습니다.`,
    });
  }

  // ③ 심야 내려받기 — 업무 시간대가 아니다
  const night = rows.filter((r) => {
    const h = kstHour(r.at);
    return h >= cfg.nightStart && h < cfg.nightEnd;
  });
  if (night.length >= cfg.nightDownloads) {
    out.push({
      kind: 'night_download', severity: 'medium',
      message: `심야(${cfg.nightStart}~${cfg.nightEnd}시) 명단 ${night.length}건 내려받음. 업무 시간대가 아닙니다.`,
    });
  }

  // ④ 관리자 전용 명단 접근 — 규칙상 관리자만 되지만, 되면 반드시 알린다
  const adminOnly = rows.filter((r) => r.adminOnly === true);
  if (adminOnly.length) {
    out.push({
      kind: 'admin_only_access', severity: 'medium',
      message: `관리자 전용 명단 ${adminOnly.length}건 열람.`,
    });
  }

  return out;
}

/** 사람에게 보낼 한 덩어리 문구. 무엇을·누가·언제를 한 눈에. */
function formatAlert(actor, findings, now = new Date()) {
  const who = actor?.email || actor?.uid || '알 수 없는 사용자';
  const where = actor?.company ? ` (${actor.company})` : '';
  const body = (findings || []).map((f) => `· ${f.message}`).join('\n');
  const kst = new Date(new Date(now).getTime() + 9 * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);
  return `[명단 열람 경보] ${who}${where}\n${body}\n시각(KST): ${kst}`;
}

module.exports = { DEFAULTS, kstHour, detectAnomalies, formatAlert };
