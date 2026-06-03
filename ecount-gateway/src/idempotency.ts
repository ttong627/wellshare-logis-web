// 멱등성 상태머신 (Firestore: logis-TMS (default) DB).
// 운영 매출전표 중복 생성을 차단한다.
//  - 키는 서버가 생성: `${year}-${month}-${NFC정규화(region)}` (클라이언트 키 신뢰 안 함)
//  - 상태: pending → done(slipNos) | failed(재시도 가능)
//  - done + 동일 입력 → cached, done + 다른 입력 → conflict(409)
//  - 최근(<60s) pending → in_progress(409)
//  - 외부 HTTP(SaveSale)는 트랜잭션 밖에서 호출 (재시도 중복발행 방지)
import { Firestore } from '@google-cloud/firestore';
import { createHash } from 'crypto';

const COLLECTION = 'ecount_sales';

const db = new Firestore(); // ADC → logis-TMS (default)

export function normalizeRegion(region: string): string {
  return region.normalize('NFC').replace(/\s+/g, '').trim();
}

export function buildIdempotencyKey(year: number, month: number, region: string): string {
  return `${year}-${month}-${normalizeRegion(region)}`;
}

export function hashInput(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export interface SaleRecord {
  status: 'pending' | 'done' | 'failed';
  inputHash: string;
  slipNos?: string[];
  total?: number;
  supply?: number;
  vat?: number;
  uid?: string;
  error?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type ClaimResult =
  | { action: 'proceed' }
  | { action: 'cached'; record: SaleRecord }
  | { action: 'conflict'; record: SaleRecord }
  | { action: 'in_progress'; record: SaleRecord };

// 트랜잭션으로 pending 클레임 또는 기존 상태 분기
export async function claim(key: string, inputHash: string, uid: string): Promise<ClaimResult> {
  const ref = db.collection(COLLECTION).doc(key);
  return db.runTransaction(async (tx): Promise<ClaimResult> => {
    const snap = await tx.get(ref);
    const now = Date.now();

    if (!snap.exists) {
      const rec: SaleRecord = { status: 'pending', inputHash, uid, createdAtMs: now, updatedAtMs: now };
      tx.set(ref, rec);
      return { action: 'proceed' };
    }

    const rec = snap.data() as SaleRecord;

    if (rec.status === 'done') {
      return rec.inputHash === inputHash ? { action: 'cached', record: rec } : { action: 'conflict', record: rec };
    }

    // pending(나이 무관) → in_progress. 비가역 매출전표라 자동 재시도로 중복발행하지 않는다.
    // 고아 pending(인스턴스 강제종료 등)은 ECOUNT 화면 확인 후 Firestore 문서 수동 삭제로 해제.
    if (rec.status === 'pending') {
      return { action: 'in_progress', record: rec };
    }

    // failed(SaveSale 예외로 전표 미생성 추정) → 재클레임 허용
    tx.set(ref, { status: 'pending', inputHash, uid, createdAtMs: rec.createdAtMs ?? now, updatedAtMs: now });
    return { action: 'proceed' };
  });
}

export async function markDone(
  key: string,
  data: { slipNos: string[]; total: number; supply: number; vat: number },
): Promise<void> {
  await db
    .collection(COLLECTION)
    .doc(key)
    .set({ status: 'done', ...data, updatedAtMs: Date.now() }, { merge: true });
}

export async function markFailed(key: string, error: string): Promise<void> {
  await db
    .collection(COLLECTION)
    .doc(key)
    .set({ status: 'failed', error: error.slice(0, 500), updatedAtMs: Date.now() }, { merge: true });
}
