// 첨부파일 암호 해제 — 엑셀(office 암호화) 직접 + zip 안에 든 암호화 엑셀도 풀어서 재압축한다.
//   xlsx: officecrypto-tool(순수 JS, CFB/OOXML 암호화 해석)
//   zip: JSZip으로 열람(zip 자체는 실측 결과 비암호 — 안의 xlsx만 개별 암호화되는 패턴, CLAUDE.md 참고)
//        안의 xlsx가 암호화면 풀어서 원래 자리에 다시 넣고 재압축(다른 파일은 그대로 보존).
//   ⚠️ zip 재압축(generateAsync) 시 항상 zip-filenames.mjs의 원시 파서로 이름을 다시 정한다 —
//      JSZip은 UTF8 플래그가 잘못 켜진 항목은 자체 손실 디코딩(U+FFFD)을 쓰고 우리 훅을 안 부른다.
//      이 상태로 그냥 재압축하면 원본 한글 파일명이 영구히 복구불가로 뭉개진다(2026-07-11 실제 사고
//      — 동대문구 zip 2건. 재발 방지를 위해 절대 JSZip 기본 디코딩 경로로 재압축하지 말 것).
import officecrypto from 'officecrypto-tool';
import JSZip from 'jszip';
import { buildCorrectedNameMap } from './zip-filenames.mjs';

export async function isXlsxEncrypted(buf) {
  try { return await officecrypto.isEncrypted(buf); } catch { return false; }
}

// xlsx 버퍼 + 암호 → 평문 버퍼. 실패(암호 불일치 등)면 null(추측 재시도 없음 — 확실한 암호만 시도).
export async function decryptXlsx(buf, password) {
  if (!password) return null;
  try { return await officecrypto.decrypt(buf, { password: String(password) }); }
  catch { return null; }
}

// zip 안에 암호화된 xlsx가 하나라도 있는지만 확인(암호 없이) — 호출측이 이걸로 메일 본문을
// 가져올지(비용 있는 API 호출) 미리 판단한다.
export async function zipHasEncryptedXlsx(zipBuf) {
  const zip = await JSZip.loadAsync(zipBuf);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && /\.xlsx?$/i.test(n));
  for (const name of names) {
    const entryBuf = await zip.file(name).async('nodebuffer');
    if (await isXlsxEncrypted(entryBuf)) return true;
  }
  return false;
}

// zip 버퍼 안의 암호화된 xlsx를 password로 풀어 재압축. 변경 없으면 changed:false(원본 그대로 반환).
// stillEncrypted: 암호화된 entry가 있었는데 못 푼 경우(암호 없음/불일치) — 알림·note 표시용.
export async function decryptZipEntries(zipBuf, password) {
  const zip = await JSZip.loadAsync(zipBuf);
  const jszipKeys = Object.keys(zip.files);
  const nameMap = buildCorrectedNameMap(zipBuf, jszipKeys); // JSZip key → 실제 올바른 파일명(항상 계산)

  let changed = false;
  let stillEncrypted = false;
  const xlsxKeys = jszipKeys.filter((k) => !zip.files[k].dir && /\.xlsx?$/i.test(k));
  for (const key of xlsxKeys) {
    const entryBuf = await zip.file(key).async('nodebuffer');
    if (!(await isXlsxEncrypted(entryBuf))) continue;
    const plain = password ? await decryptXlsx(entryBuf, password) : null;
    if (plain) {
      zip.file(key, plain);
      changed = true;
    } else {
      stillEncrypted = true;
    }
  }

  // 이름이 하나라도 JSZip 키와 다르면(잘못 디코딩된 경우) 무조건 재압축해서 정정한다.
  const nameFixNeeded = jszipKeys.some((k) => nameMap.get(k) !== k);
  if (!changed && !nameFixNeeded) return { changed: false, buf: zipBuf, stillEncrypted };

  // 새 zip을 올바른 이름으로 다시 구성(기존 zip.generateAsync()를 그대로 쓰면 JSZip이 다시
  // 자체 UTF-8 인코딩으로 손상된 키를 그대로 쓸 수 있어, 반드시 새 인스턴스에 정정된 이름으로 추가).
  const outZip = new JSZip();
  for (const key of jszipKeys) {
    const entry = zip.files[key];
    const correctName = nameMap.get(key);
    if (entry.dir) { outZip.folder(correctName); continue; }
    const content = await entry.async('nodebuffer');
    outZip.file(correctName, content, { date: entry.date });
  }
  const outBuf = await outZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { changed: true, buf: outBuf, stillEncrypted };
}
