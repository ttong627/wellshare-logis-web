// 무인 데몬 장애 알림 — 텔레그램 ops 채널(형이 실제 보는 통로: daily_report·market_brief와 동일).
//   메일 '내용' 알림(앱 벨)과 별개의 '운영 장애' 알림이다. 토큰 만료처럼 사람이 모르면
//   조용히 수집이 멈추는 사고를 막는다.
//   설정: D:/Gemma4/telegram_config.json {bot_token, chat_id} (env WSSC_TELEGRAM_CONFIG로 경로 변경 가능)
//   안전: 설정 없거나 전송 실패해도 절대 throw 안 함(데몬 본업을 막지 않는다) → boolean 반환.
import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns';

// VM 등 IPv6 경로가 끊긴 망에서 fetch(undici)가 api.telegram.org의 IPv6 주소를 잡아 'fetch failed' 나는 문제 방지.
//   telegram은 IPv4/IPv6 둘 다 갖는데 VM IPv6가 안 되므로 IPv4를 강제한다(works API·firestore는 자식 프로세스라 무영향).
try { net.setDefaultAutoSelectFamily(false); } catch { /* 구버전 Node 호환 */ }
dns.setDefaultResultOrder('ipv4first');

const CONFIG = process.env.WSSC_TELEGRAM_CONFIG || 'D:/Gemma4/telegram_config.json';

function loadConfig() {
  try {
    const j = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    if (!j.bot_token || !j.chat_id) return null;
    return j;
  } catch {
    return null;
  }
}

// 텔레그램 메시지 1건 전송. 성공 true / (설정없음·실패) false.
export async function sendTelegram(text) {
  const cfg = loadConfig();
  if (!cfg) {
    console.log(`  (텔레그램 설정 없음 — 알림 생략: ${CONFIG})`);
    return false;
  }
  try {
    const url = `https://api.telegram.org/bot${cfg.bot_token}/sendMessage`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chat_id, text, disable_web_page_preview: true }),
    });
    if (!r.ok) {
      console.log(`  (텔레그램 전송 실패 HTTP ${r.status})`);
      return false;
    }
    return true;
  } catch (e) {
    console.log(`  (텔레그램 전송 오류: ${e.message})`);
    return false;
  }
}
