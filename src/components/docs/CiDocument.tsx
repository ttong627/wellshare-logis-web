/**
 * CI 공문 디자인 렌더러 (2026-09-02)
 *
 * 형이 승인한 한/글·PDF 공문 양식과 **같은 수치**로 옮긴 것이다.
 * 바탕화면 `공문양식_리디자인` 의 결과물과 출력이 어긋나면 안 되므로
 * 여백·글꼴크기·자간·직인 위치를 임의로 바꾸지 말 것.
 *
 * ⚠️ 인쇄는 `printRef.current.innerHTML` 을 새 창에 그대로 쓰는 방식이라
 *    **CSS 클래스와 <style> 은 유실된다.** 그래서 전부 인라인 스타일로 쓴다.
 *
 * 관련 메모리: reference_wellshare_gongmun_template
 */
import React from 'react';
import { DocTemplate } from '../../types';

// ── 종이·활자 (공고문 템플릿과 같은 축) ──────────────────────────────────────
const PAPER = '#FBFAF7';
const INK = '#15171B';
const INK_2 = '#3D434B';
const INK_3 = '#6A7079';
const RULE = '#DAD5CB';
const RULE_2 = '#EAE6DE';

/** 웰쉐어 CI 3색 — 하트 로고에서 픽셀로 뽑은 실제 값 */
export const WS_CI = ['#8C288C', '#D8307B', '#18A8D8'];
/** 희망나르미 5색 — 심볼(무지개 손)에서 뽑은 값 */
export const NARAMI_CI = ['#F04F3C', '#F69344', '#B5D342', '#3E76B2', '#985084'];

const SERIF = "'Noto Serif KR','Batang',serif";
const SANS = "'Noto Sans KR','Malgun Gothic',sans-serif";

export interface CiDocData {
  receiver: string;
  via: string;
  subject: string;
  bodies: string[];
  items: string[];
  docNumber: string;
  date: string;
}

interface Props {
  template: DocTemplate;
  data: CiDocData;
  /** 미리보기에서 직인을 감출 때 false */
  showSeal?: boolean;
}

/** CI 3색(또는 5색) 띠 */
function Tri({ colors, height, reverse }: { colors: string[]; height: string; reverse?: boolean }) {
  const cs = reverse ? [...colors].reverse() : colors;
  return (
    <div style={{ display: 'flex', width: '100%', height, flex: '0 0 auto' }}>
      {cs.map((c, i) => (
        <span key={i} style={{ flex: 1, display: 'block', background: c,
          WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties} />
      ))}
    </div>
  );
}

const Rule = ({ w, color, mt }: { w: string; color: string; mt?: string }) => (
  <div style={{ height: 0, borderTop: `${w} solid ${color}`, marginTop: mt }} />
);

export default function CiDocument({ template, data, showSeal = true }: Props) {
  const colors = (template.ciColors && template.ciColors.length >= 2)
    ? template.ciColors : WS_CI;
  const logoH = template.ciLogoHeightMm || 14.2;
  const korSize = template.ciOrgNameSize || 25;
  const who = `${template.orgName} ${template.representativeTitle}`.trim();
  const longWho = who.replace(/\s/g, '').length >= 14;

  const bodies = data.bodies.filter(b => b !== undefined);
  const items = data.items;
  const lastFilled = items.map(t => !!t.trim()).lastIndexOf(true);

  const metaRows: [string, string][] = [
    ['수 신', data.receiver],
    ['경 유', data.via],
    ['제 목', data.subject],
  ];

  return (
    <div style={{
      width: '210mm', minHeight: '297mm', background: PAPER,
      position: 'relative', overflow: 'hidden', margin: '0 auto',
      display: 'flex', flexDirection: 'column',
      fontFamily: SANS, color: INK, fontFeatureSettings: '"tnum"',
      WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
    } as React.CSSProperties}>
      <div style={{
        flex: '1 1 auto', display: 'flex', flexDirection: 'column',
        padding: '13mm 20mm 12mm', minHeight: 0,
      }}>
        {/* ── 상단 CI 띠 ─────────────────────────────────────────────── */}
        <Tri colors={colors} height="2.6mm" />

        {/* ── 레터헤드 ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '7mm', padding: '7.4mm 0 0' }}>
          {template.logoUrl && (
            <span style={{ flex: '0 0 auto', display: 'block' }}>
              <img src={template.logoUrl} alt=""
                style={{ display: 'block', height: `${logoH}mm`, width: 'auto' }} />
            </span>
          )}
          <div style={{ flex: '1 1 auto', paddingBottom: '.6mm' }}>
            <div style={{
              fontFamily: SERIF, fontWeight: 600, fontSize: `${korSize}pt`,
              lineHeight: 1.06, letterSpacing: '-.005em', color: INK, whiteSpace: 'nowrap',
            }}>{template.orgName}</div>
            {template.orgSlogan && (
              <div style={{
                marginTop: '2.1mm', fontSize: '9pt', fontWeight: 500,
                color: INK_3, letterSpacing: '.055em',
              }}>{template.orgSlogan.replace(/^["“]|["”]$/g, '')}</div>
            )}
          </div>
          <div style={{
            flex: '0 0 auto', textAlign: 'right', paddingBottom: '1.4mm',
            fontSize: '8.6pt', color: INK_3, letterSpacing: '.02em',
            lineHeight: 1.5, whiteSpace: 'nowrap',
          }}>
            <b style={{ display: 'block', fontWeight: 600, color: INK_2, fontSize: '9.4pt', letterSpacing: '.01em' }}>
              {data.docNumber || `${template.docPrefix} ${new Date().getFullYear()} -`}
            </b>
            {data.date}
          </div>
        </div>
        <Rule w=".5pt" color={RULE} mt="5.4mm" />

        {/* ── 수신 · 경유 · 제목 ────────────────────────────────────── */}
        <div style={{ marginTop: '5.6mm' }}>
          {metaRows.map(([lab, val], i) => (
            <div key={lab} style={{
              display: 'flex', alignItems: 'baseline', padding: '1.9mm 0',
              borderTop: i > 0 ? `.5pt solid ${RULE_2}` : undefined,
            }}>
              <div style={{
                flex: '0 0 21mm', fontSize: '9.4pt', fontWeight: 600, color: INK_3,
                letterSpacing: '.30em', textIndent: '.30em',
              }}>{lab}</div>
              <div style={{
                flex: '1 1 auto', fontSize: '12.5pt', color: INK,
                letterSpacing: '-.005em',
                fontWeight: val ? 600 : 400,
              }}>{val || ' '}</div>
            </div>
          ))}
        </div>
        <Rule w="1.5pt" color={INK} mt="2.2mm" />

        {/* ── 본문 ──────────────────────────────────────────────────── */}
        <div style={{
          flex: '1 1 auto', paddingTop: '7.5mm', fontSize: '11.7pt',
          lineHeight: 2.0, letterSpacing: '-.004em', minHeight: 0,
        }}>
          {bodies.map((b, i) => (
            <p key={i} style={{
              paddingLeft: '6.2mm', textIndent: '-6.2mm',
              marginTop: i > 0 ? '.8mm' : 0,
            }}>
              <span style={{ fontWeight: 600 }}>{i + 1}.</span>&nbsp; {b || ' '}
            </p>
          ))}

          {/* 다 음 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6mm', margin: '8.5mm 0 8mm' }}>
            <i style={{ flex: 1, height: 0, borderTop: `.5pt solid ${RULE}` }} />
            <span style={{
              fontFamily: SERIF, fontSize: '12.5pt', fontWeight: 600,
              letterSpacing: '.62em', marginRight: '-.62em', color: INK_2,
            }}>다&nbsp;음</span>
            <i style={{ flex: 1, height: 0, borderTop: `.5pt solid ${RULE}` }} />
          </div>

          {/* 붙임 목록 */}
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((t, i) => (
              <li key={i} style={{ display: 'flex', gap: '2.6mm', fontSize: '11.6pt', lineHeight: 1.78 }}>
                <span style={{
                  flex: '0 0 8.4mm', textAlign: 'right', color: colors[0],
                  fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                }}>{i + 1}.</span>
                <span style={{ flex: '1 1 auto' }}>
                  {t || ' '}
                  {i === lastFilled && t.trim() && (
                    <span style={{ fontWeight: 600, letterSpacing: '.04em' }}>&nbsp; 끝.</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* ── 발신명의 ──────────────────────────────────────────────── */}
        <div style={{ marginTop: 'auto', padding: '12mm 0 9mm', textAlign: 'center' }}>
          <span style={{
            position: 'relative', display: 'inline-block', paddingRight: '16mm',
            fontFamily: SERIF, fontWeight: 600,
            fontSize: longWho ? '18pt' : '19.5pt',
            letterSpacing: longWho ? '.055em' : '.10em',
            textIndent: longWho ? '.055em' : '.10em',
            color: INK, whiteSpace: 'nowrap',
          }}>
            {who}
            {showSeal && template.sealUrl && (
              <img src={template.sealUrl} alt="" style={{
                position: 'absolute', right: '1.1mm', top: '50%',
                width: '16.5mm', height: '16.5mm', transform: 'translateY(-50%)',
                mixBlendMode: 'multiply',
              }} />
            )}
          </span>
        </div>

        {/* ── 결재란 · 기관정보 ─────────────────────────────────────── */}
        <div style={{ flex: '0 0 auto' }}>
          <Rule w="1.2pt" color={INK} />
          <div style={{ padding: '2.6mm 0 2.4mm', fontSize: '9pt', color: INK_2, lineHeight: 1.85 }}>
            <div style={{ display: 'flex' }}>
              <span style={{ color: INK_3, letterSpacing: '.16em', marginRight: '3.2mm', flex: '0 0 12mm' }}>담당</span>
              <span style={{ flex: '1 1 auto', color: INK }}>{template.manager || ''}</span>
              <span style={{ flex: '0 0 auto' }}>
                <span style={{ color: INK_3, letterSpacing: '.16em', marginRight: '2.6mm' }}>
                  {template.ciApprovalTitle || template.representativeTitle}
                </span>
                {template.representative}
              </span>
            </div>
            <div style={{ display: 'flex' }}>
              <span style={{ color: INK_3, letterSpacing: '.16em', marginRight: '3.2mm', flex: '0 0 12mm' }}>협조자</span>
              <span style={{ flex: '1 1 auto', color: INK }}>{template.assistant || ''}</span>
            </div>
            <div style={{ display: 'flex' }}>
              <span style={{ color: INK_3, letterSpacing: '.16em', marginRight: '3.2mm', flex: '0 0 12mm' }}>시행</span>
              <span style={{ flex: '1 1 auto', color: INK }}>
                {data.docNumber}{data.date ? `  (${data.date})` : ''}
              </span>
              <span style={{ flex: '0 0 auto', color: INK_3, letterSpacing: '.16em' }}>접수</span>
            </div>
          </div>
          <div style={{
            borderTop: `.5pt solid ${RULE}`, padding: '2.4mm 0 3.4mm',
            fontSize: '8.4pt', color: INK_3, lineHeight: 1.72,
          }}>
            우 {template.postalCode} {template.address}<br />
            전화 {template.tel}
            <span style={{ color: RULE, margin: '0 2.2mm' }}>/</span>전송 {template.fax}
            <span style={{ color: RULE, margin: '0 2.2mm' }}>/</span>이메일 {template.email}
            <span style={{ color: RULE, margin: '0 2.2mm' }}>/</span>
            <b style={{ color: INK_2, fontWeight: 600 }}>{template.publicStatus}</b>
          </div>
        </div>

        {/* ── 하단 CI 띠 (색 순서를 뒤집어 위아래가 마주 보게) ───────── */}
        <Tri colors={colors} height="1.4mm" reverse />
      </div>
    </div>
  );
}
