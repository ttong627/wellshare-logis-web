// 기존(자동수집 전에 이미 올라간) 명단 파일 일괄 암호 해제 — 1회성 백필.
//   대상은 실제 원본 메일 본문에서 확인된 암호만 사용한다(추측 절대 금지):
//     동대문구 zip 2건 — 6/30 mirnish@ddm.go.kr "(명단비번: 4569)"
//     중원구 xlsx      — 6/18 sang8346@korea.kr "양곡배송명단(pw2026)"
//     여주시 xlsx       — 파일명 자체에 "(pw2729)" 표기
//   원본 못 찾은 시흥시·부천 원미구/오정구·서초구는 건드리지 않고 note만 안내로 채운다.
//   실행: node backfill-decrypt-existing.mjs           (dry-run)
//         node backfill-decrypt-existing.mjs --commit  (실제 반영)
import { getGoogleToken, listAllRosterDocs, downloadFromStorage, uploadToStorage, patchRosterDoc } from './persist-rosters.mjs';
import { isXlsxEncrypted, decryptXlsx, decryptZipEntries } from './decrypt.mjs';

const COMMIT = process.argv.includes('--commit');

// storagePath 접두어로 매칭되는 실제 확인된 암호(원본 메일 근거 — 추측 금지, 확인된 것만 등재).
const KNOWN_PASSWORDS = [
  { prefix: 'rosters/동대문구/2026-06/', password: '4569' },
  { prefix: 'rosters_admin/중원구/2026-06/', password: '2026' },
];
const FILENAME_PW_RE = /\(pw(\d{3,8})\)/i;

const UNRESOLVED_NOTE = '🔒 암호 확인 필요 — 원본 메일을 찾지 못해 자동 해제하지 못했습니다. 회원사가 암호를 알면 관리자에게 알려주세요.';
const UNRESOLVED_REGIONS = new Set(['시흥시', '부천시 원미구', '부천시 오정구', '서초구', '수원시']);

async function main() {
  console.log(`백필 시작 — ${COMMIT ? '★WRITE★' : 'dry-run'}`);
  const fsToken = await getGoogleToken('https://www.googleapis.com/auth/datastore');
  const gcsToken = COMMIT ? await getGoogleToken('https://www.googleapis.com/auth/devstorage.read_write') : await getGoogleToken('https://www.googleapis.com/auth/devstorage.read_only');
  const docs = await listAllRosterDocs(fsToken);
  console.log(`  rosters 문서 ${docs.length}건 검사\n`);

  let decrypted = 0, unresolved = 0, skipped = 0;

  for (const r of docs) {
    const isXlsx = /\.xlsx?$/i.test(r.fileName);
    const isZip = /\.zip$/i.test(r.fileName);
    if (!isXlsx && !isZip) continue;

    let buf;
    try { buf = await downloadFromStorage(gcsToken, r.storagePath); }
    catch (e) { console.log(`  ✗ Storage 다운로드 실패: ${r.storagePath} (${e.message})`); continue; }

    const knownPw = KNOWN_PASSWORDS.find((k) => r.storagePath.startsWith(k.prefix))?.password || null;

    if (isXlsx) {
      if (!(await isXlsxEncrypted(buf))) continue;
      const pw = FILENAME_PW_RE.exec(r.fileName)?.[1] || knownPw || (/(?:암호|비번)\D*(\d{3,8})/.exec(r.note)?.[1]) || null;
      if (!pw) {
        if (UNRESOLVED_REGIONS.has(r.region)) {
          console.log(`  🔒 미해결(안내표시): [${r.region}] ${r.fileName}`);
          if (COMMIT && !r.note.includes('암호 확인 필요')) {
            await patchRosterDoc(fsToken, r.id, { note: [r.note, UNRESOLVED_NOTE].filter(Boolean).join(' · ') });
          }
          unresolved += 1;
        } else {
          console.log(`  ? 암호화인데 암호 미상: [${r.region}] ${r.fileName}`);
        }
        continue;
      }
      const plain = await decryptXlsx(buf, pw);
      if (!plain) { console.log(`  ✗ 복호화 실패(암호 불일치): [${r.region}] ${r.fileName} pw=${pw}`); skipped += 1; continue; }
      console.log(`  ✓ [${r.region}] ${r.fileName} — pw=${pw} 복호화 (${Math.round(plain.length / 1024)}KB)`);
      if (COMMIT) {
        await uploadToStorage(gcsToken, r.storagePath, plain, r.contentType, r.fileName);
        await patchRosterDoc(fsToken, r.id, { size: plain.length, decrypted: true });
      }
      decrypted += 1;
    } else if (isZip) {
      if (!knownPw) {
        if (UNRESOLVED_REGIONS.has(r.region)) {
          console.log(`  🔒 미해결(안내표시): [${r.region}] ${r.fileName}`);
          if (COMMIT && !r.note.includes('암호 확인 필요')) {
            await patchRosterDoc(fsToken, r.id, { note: [r.note, UNRESOLVED_NOTE].filter(Boolean).join(' · ') });
          }
          unresolved += 1;
        }
        continue;
      }
      const { changed, buf: outBuf, stillEncrypted } = await decryptZipEntries(buf, knownPw);
      if (!changed) continue;
      console.log(`  ✓ [${r.region}] ${r.fileName} — zip 내부 엑셀 pw=${knownPw} 복호화 (${Math.round(outBuf.length / 1024)}KB)${stillEncrypted ? ' ⚠일부 미해결' : ''}`);
      if (COMMIT) {
        await uploadToStorage(gcsToken, r.storagePath, outBuf, r.contentType, r.fileName);
        await patchRosterDoc(fsToken, r.id, { size: outBuf.length, decrypted: true });
      }
      decrypted += 1;
    }
  }
  console.log(`\n완료 — 복호화 ${decrypted}건 · 미해결(안내표시) ${unresolved}건 · 스킵 ${skipped}건`);
}

main().catch((e) => { console.error('오류:', e.message); process.exit(1); });
