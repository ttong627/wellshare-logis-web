// 첨부파일 암호 해제 — 엑셀(office 암호화) 직접 + zip 안에 든 암호화 엑셀도 풀어서 재압축한다.
//   xlsx: officecrypto-tool(순수 JS, CFB/OOXML 암호화 해석)
//   zip: JSZip으로 열람(zip 자체는 실측 결과 비암호 — 안의 xlsx만 개별 암호화되는 패턴, CLAUDE.md 참고)
//        안의 xlsx가 암호화면 풀어서 원래 자리에 다시 넣고 재압축(다른 파일은 그대로 보존).
import officecrypto from 'officecrypto-tool';
import JSZip from 'jszip';

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
  let changed = false;
  let stillEncrypted = false;
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && /\.xlsx?$/i.test(n));
  for (const name of names) {
    const entryBuf = await zip.file(name).async('nodebuffer');
    if (!(await isXlsxEncrypted(entryBuf))) continue;
    const plain = password ? await decryptXlsx(entryBuf, password) : null;
    if (plain) {
      zip.file(name, plain);
      changed = true;
    } else {
      stillEncrypted = true;
    }
  }
  if (!changed) return { changed: false, buf: zipBuf, stillEncrypted };
  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { changed: true, buf: outBuf, stillEncrypted };
}
