// 기존 rosters 파일명 소급 규격화 — 형 규칙(2026-07-26): fileName → "지자체_YYYY년MM월_원본명".
//   다운로드명은 Firestore fileName 필드 기준(RosterTab: a.download = f.fileName, blob 다운로드)이라
//   필드만 patch하면 규격 파일명으로 저장된다(Storage 객체 재업로드 불필요·가벼움).
//   멱등: 이미 규격화된 이름은 변경 안 함(재실행 안전). 파일명만 다뤄 PII 없음.
//   사용: YANGGOK_SA_KEY=<SA키경로> node backfill-standardize-filenames.mjs          # dry-run(쓰기 없음)
//         YANGGOK_SA_KEY=<SA키경로> node backfill-standardize-filenames.mjs --commit  # 실제 patch
import { getGoogleToken, listAllRosterDocs, patchRosterDoc } from './persist-rosters.mjs';
import { standardRosterFileName } from './standardize-filename.mjs';

const COMMIT = process.argv.includes('--commit');

async function main() {
  const fsToken = await getGoogleToken('https://www.googleapis.com/auth/datastore');
  const docs = await listAllRosterDocs(fsToken);
  console.log(`총 ${docs.length}건 rosters ${COMMIT ? '(COMMIT)' : '(DRY-RUN)'}`);

  let changed = 0;
  let skipped = 0;
  for (const d of docs) {
    const newName = standardRosterFileName(d.region, d.month, d.fileName);
    if (newName === d.fileName) { skipped += 1; continue; }
    console.log(`  [${d.region} ${d.month}] ${d.fileName}  →  ${newName}`);
    if (COMMIT) await patchRosterDoc(fsToken, d.id, { fileName: newName });
    changed += 1;
  }
  console.log(`완료 — 변경 ${changed}건 · 이미규격/대상외 ${skipped}건${COMMIT ? '' : ' (dry-run, 쓰기 없음)'}`);
}

main().catch((e) => { console.error('오류:', e.message); process.exit(1); });
