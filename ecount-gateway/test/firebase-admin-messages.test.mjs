// 실제 firebase-admin 이 내는 오류 메시지로 classifyVerifyError 를 시험한다 — 문자열만 넣어 보는 authz.test.mjs 보강.
// 2026-09-13 코난(위조 토큰이 502 로 위장)·제시(진짜 공개키 조회 실패) 실험을 옮겼다.
// firebase-admin 을 올리면 문구가 바뀔 수 있다 — 그때 이 파일이 잡는다.
// 네트워크 없이 돈다: 위조 토큰은 서명 검사 전 내용 검사에서 떨어지고, 조회 실패는 https.request 를 가로채 만든다.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { classifyVerifyError } = require('../dist/authz.js');

// ★firebase-admin 을 불러오기 **전에** 가로챈다 — 구글 공개키 요청을 로컬로 돌려 실패시킨다.
const originalRequest = https.request;
let mode = 'refused';
const server = http.createServer((_req, res) => {
  res.writeHead(500, { 'content-type': 'text/html' });
  res.end('<html>boom</html>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
https.request = function interceptedRequest(options, callback) {
  const base = { ...(typeof options === 'object' ? options : {}) };
  delete base.agent;
  if (mode === 'refused') {
    return originalRequest.call(https, { ...base, host: '127.0.0.1', hostname: '127.0.0.1', port: 9 }, callback);
  }
  return http.request({ ...base, protocol: 'http:', host: '127.0.0.1', hostname: '127.0.0.1', port: server.address().port }, callback);
};
const admin = require('firebase-admin');

after(() => {
  https.request = originalRequest;
  server.close();
});

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsignedToken = (projectId, header = {}, payload = {}) =>
  `${b64({ alg: 'RS256', kid: 'k1', typ: 'JWT', ...header })}.` +
  `${b64({ aud: projectId, iss: `https://securetoken.google.com/${projectId}`, sub: 'u1', iat: now - 10, exp: now + 3600, auth_time: now - 10, ...payload })}.c2ln`;

async function verifyError(app, token) {
  try {
    await app.auth().verifyIdToken(token, true);
  } catch (e) {
    return e;
  }
  throw new Error('서명 없는 토큰이 통과했다');
}

test('실제 firebase-admin: 위조 토큰이 aud·iss·alg 에 조회 실패 문구를 넣어도 → 401 invalid_token', async () => {
  const app = admin.initializeApp({ projectId: 'demo-forge' }, 'forge');
  for (const [name, token] of [
    ['aud', unsignedToken('demo-forge', {}, { aud: 'Error fetching public keys' })],
    ['iss', unsignedToken('demo-forge', {}, { iss: 'Error while making request' })],
    ['alg', unsignedToken('demo-forge', { alg: 'Error fetching public keys' })],
  ]) {
    const e = await verifyError(app, token);
    assert.equal(e.code, 'auth/argument-error', name);
    assert.deepEqual(classifyVerifyError(e.code, e.message), { status: 401, error: 'invalid_token' }, `${name}: ${String(e.message).slice(0, 90)}`);
  }
});

test('실제 firebase-admin: 공개키 조회 실패(연결 거부·HTTP 500) → 502 auth_lookup_failed', { timeout: 60_000 }, async () => {
  for (const m of ['refused', 'http500']) {
    mode = m;
    const app = admin.initializeApp({ projectId: 'demo-keyfail' }, `keyfail-${m}`);
    const e = await verifyError(app, unsignedToken('demo-keyfail'));
    assert.deepEqual(classifyVerifyError(e.code, e.message), { status: 502, error: 'auth_lookup_failed' }, `${m}: ${String(e.message).slice(0, 90)}`);
  }
});
