import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants';

// 웹 src/constants/members.ts의 CONTACTS / GOV_CONTACTS를 그대로 인라인 복사.
// (모바일 constants.ts는 건드리지 않음 — 데이터는 읽기 전용 스냅샷)
interface ContactInfo {
  agency: string;
  region: string;
  detail: string;
  manager: string;
  phone: string;
}

const CONTACTS: ContactInfo[] = [
  { agency: '사회적협동조합 행복나눔', region: '시흥시', detail: '능곡동 제외 전체', manager: '전재형 이사장', phone: '010-4710-7460' },
  { agency: '사회적협동조합 행복나눔', region: '부천시 오정구', detail: '', manager: '조유라 팀장', phone: '010-4726-0437' },
  { agency: '사회적협동조합 행복나눔', region: '부천시 원미구', detail: '', manager: '사무실', phone: '070-7518-7362' },
  { agency: '사회적협동조합 행복나눔', region: '서울 동대문구', detail: '청량리동, 이문2동, 제기동, 회기동', manager: '', phone: '' },
  { agency: '참자연', region: '경기도 시흥시', detail: '능곡동', manager: '박경선 대표', phone: '010-7424-2477' },
  { agency: '미소 협동조합', region: '경기도 여주시', detail: '전체', manager: '김해승 대표 / 강성임 실장', phone: '010-7537-3447 / 010-6530-4211' },
  { agency: '웰쉐어 사회적협동조합', region: '서울 동대문구', detail: '답십리1동, 전농1동, 휘경1동', manager: '이진만 차장', phone: '010-6381-9205' },
  { agency: '부천희망나르미', region: '부천시 소사구', detail: '대산동, 범안동, 소사본동(소사구)', manager: '박한울 과장', phone: '010-3110-9426' },
  { agency: '부천희망나르미', region: '서울 중구', detail: '전체', manager: '김은선 과장', phone: '010-7152-8729' },
  { agency: '부천희망나르미', region: '서울 종로구', detail: '전체', manager: '사무실', phone: '032-713-4644' },
  { agency: '부천희망나르미', region: '서울 용산구', detail: '전체', manager: '', phone: '' },
  { agency: '(주)한울', region: '서울 동대문구', detail: '용신동, 전농2동, 휘경2동, 답십리2동, 이문1동, 장안1동, 장안2동', manager: '장영수 대표', phone: '010-9457-1617' },
];

interface GovContact {
  region: string;
  order: string;
  manager: string;
  phone: string;
}

const GOV_CONTACTS: GovContact[] = [
  { region: '종로구', order: '1차', manager: '-', phone: '02-2148-2553' },
  { region: '동대문구', order: '2차', manager: '심정영', phone: '02-2127-4569' },
  { region: '용산구', order: '2차', manager: '-', phone: '02-2199-7094' },
  { region: '여주시', order: '2차', manager: '강호연', phone: '031-887-2278' },
  { region: '중구', order: '1차', manager: '-', phone: '02-3396-5351' },
  { region: '부천시', order: '1차', manager: '-', phone: '032-625-2859' },
  { region: '시흥시', order: '1차', manager: '이채원', phone: '031-310-2269' },
];

// ── 순수 함수: phone 파싱 (원본 mutation 금지) ──────────────────────
// 표시용 원본 문자열과 다이얼용 숫자열을 함께 보관.
interface ParsedPhone { display: string; digits: string }

const onlyDigits = (s: string): string => s.replace(/[^0-9]/g, '');

// '010-1111-2222 / 010-3333-4444' → [{display,digits}, ...]
// 빈 문자열이면 빈 배열을 반환(= "연락처 없음" 처리).
const parsePhones = (raw: string): ParsedPhone[] =>
  raw
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => ({ display: p, digits: onlyDigits(p) }))
    .filter((p) => p.digits.length > 0);

// 휴대폰 여부(문자 버튼 노출 기준): 010으로 시작.
const isMobile = (digits: string): boolean => digits.startsWith('010');

// CONTACTS를 agency별로 그룹핑(원본 순서 보존, 원본 배열 변경 없음).
interface AgencyGroup { agency: string; items: ContactInfo[] }

const groupByAgency = (rows: ContactInfo[]): AgencyGroup[] =>
  rows.reduce<AgencyGroup[]>((acc, row) => {
    const found = acc.find((g) => g.agency === row.agency);
    if (found) {
      return acc.map((g) =>
        g.agency === row.agency ? { ...g, items: [...g.items, row] } : g,
      );
    }
    return [...acc, { agency: row.agency, items: [row] }];
  }, []);

const dialTel = async (digits: string) => {
  try {
    await Linking.openURL('tel:' + digits);
  } catch {
    // 전화 앱을 열 수 없는 환경은 조용히 무시
  }
};

const sendSms = async (digits: string) => {
  try {
    await Linking.openURL('sms:' + digits);
  } catch {
    // SMS 앱을 열 수 없는 환경은 조용히 무시
  }
};

// ── 재사용 컴포넌트: 전화/문자 버튼 행 ──────────────────────────────
function PhoneActions({ raw, name }: { raw: string; name: string }) {
  const phones = parsePhones(raw);
  const who = name && name !== '-' ? name : '담당자';

  if (phones.length === 0) {
    return (
      <View style={styles.noPhone}>
        <Feather name="phone-off" size={13} color={COLORS.textMuted} />
        <Text style={styles.noPhoneText}>연락처 없음</Text>
      </View>
    );
  }

  return (
    <View style={styles.phoneList}>
      {phones.map((p) => (
        <View key={p.digits} style={styles.phoneRow}>
          <Pressable
            onPress={() => dialTel(p.digits)}
            style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`전화 걸기 ${who} ${p.display}`}
          >
            <Feather name="phone" size={15} color={COLORS.white} />
            <Text style={styles.callText}>{p.display}</Text>
          </Pressable>
          {isMobile(p.digits) && (
            <Pressable
              onPress={() => sendSms(p.digits)}
              style={({ pressed }) => [styles.smsBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`문자 보내기 ${who} ${p.display}`}
            >
              <Feather name="message-square" size={15} color={COLORS.brandDark} />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

export default function ContactsScreen() {
  const groups = groupByAgency(CONTACTS);

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.title}>주소록</Text>
        <Text style={styles.subtitle}>협력사·지자체 연락처</Text>
      </View>

      {/* 1) 협력사 연락처 */}
      <View style={styles.sectionHead}>
        <Feather name="briefcase" size={16} color={COLORS.brandDark} />
        <Text style={styles.sectionTitle}>협력사 연락처</Text>
      </View>

      {groups.map((group) => (
        <View key={group.agency} style={styles.agencyBlock}>
          <Text style={styles.agencyName}>{group.agency}</Text>
          {group.items.map((c, i) => (
            <View key={`${group.agency}-${c.region}-${i}`} style={styles.card}>
              <Text style={styles.region}>{c.region}</Text>
              {c.detail ? <Text style={styles.detail}>{c.detail}</Text> : null}
              {c.manager ? (
                <View style={styles.managerRow}>
                  <Feather name="user" size={13} color={COLORS.textMuted} />
                  <Text style={styles.manager}>{c.manager}</Text>
                </View>
              ) : null}
              <PhoneActions raw={c.phone} name={c.manager} />
            </View>
          ))}
        </View>
      ))}

      {/* 2) 지자체 연락처 */}
      <View style={[styles.sectionHead, styles.sectionGap]}>
        <Feather name="home" size={16} color={COLORS.brandDark} />
        <Text style={styles.sectionTitle}>지자체 연락처</Text>
      </View>

      <View style={styles.govBlock}>
        {GOV_CONTACTS.map((g, i) => (
          <View key={`${g.region}-${i}`} style={styles.card}>
            <View style={styles.govTopRow}>
              <Text style={styles.region}>{g.region}</Text>
              {g.order ? (
                <View style={styles.orderBadge}>
                  <Text style={styles.orderText}>{g.order}</Text>
                </View>
              ) : null}
            </View>
            {g.manager && g.manager !== '-' ? (
              <View style={styles.managerRow}>
                <Feather name="user" size={13} color={COLORS.textMuted} />
                <Text style={styles.manager}>{g.manager}</Text>
              </View>
            ) : null}
            <PhoneActions raw={g.phone} name={g.manager} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginTop: 4 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12, marginLeft: 2 },
  sectionGap: { marginTop: 28 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.brandDark },

  agencyBlock: { marginBottom: 18 },
  agencyName: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 8, marginLeft: 2 },
  govBlock: {},

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  region: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  detail: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginTop: 3 },

  govTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderBadge: {
    backgroundColor: COLORS.infoLight,
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 999,
  },
  orderText: { fontSize: 11, fontWeight: '800', color: COLORS.brandDark },

  managerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 },
  manager: { fontSize: 13, fontWeight: '700', color: COLORS.text },

  phoneList: { marginTop: 11, gap: 8 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  callBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    backgroundColor: COLORS.brand,
    borderRadius: 12,
  },
  callText: { fontSize: 14, fontWeight: '800', color: COLORS.white },
  smsBtn: {
    width: 48,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.infoLight,
    borderRadius: 12,
  },
  pressed: { opacity: 0.6 },

  noPhone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 11,
    minHeight: 44,
  },
  noPhoneText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
});
