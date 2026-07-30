'use client'

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type React from 'react';
import { useUiSettings } from '@/components/layout/AppShell';

interface DocumentItem {
  id: string;
  manager: string;
  date: string;
  title: string;
  summary: string;
  process: string;
  lot: string;
  detail: string;
}

interface ActionHistoryItem {
  id: number;
  situation: string;
  action: string;
  cause: string;
  manager: string;
  date: string;
  /** 인수인계 이관 항목의 분류(특이사항/전달사항/주의사항). 정적 목업에는 없음 */
  category?: string;
  handoverFrom?: string;
  handoverTo?: string;
}

interface ReportData {
  baseDate: string;
  mainCause: string;
  similarCase: string;
  recommendation: string;
  riskSummary: string;
  referenceCount: number;
}

interface FilterState {
  manager: string;
  date: string;
  keyword: string;
}

type TabKey = 'knowledge' | 'report';

interface ActionFormState {
  situation: string;
  action: string;
  cause: string;
  manager: string;
  date: string;
}

type DetailTarget =
  | { kind: 'document'; item: DocumentItem }
  | { kind: 'action'; item: ActionHistoryItem };

const colors = {
  background: '#f1f5f9',
  panel: '#ffffff',
  navy: '#0f172a',
  slate: '#475569',
  muted: '#94a3b8',
  line: '#e2e8f0',
  blue: '#2563eb',
  blueSoft: '#eff6ff',
  green: '#16a34a',
  greenSoft: '#f0fdf4',
  red: '#dc2626',
  redSoft: '#fef2f2',
  amber: '#d97706',
  amberSoft: '#fffbeb',
  input: '#f8fafc',
};

const darkColors: typeof colors = {
  background: '#0f172a',
  panel: '#1e293b',
  navy: '#f1f5f9',
  slate: '#94a3b8',
  muted: '#64748b',
  line: '#334155',
  blue: '#60a5fa',
  blueSoft: 'rgba(30, 58, 138, 0.45)',
  green: '#4ade80',
  greenSoft: 'rgba(6, 78, 59, 0.45)',
  red: '#f87171',
  redSoft: 'rgba(127, 29, 29, 0.45)',
  amber: '#fbbf24',
  amberSoft: 'rgba(120, 53, 15, 0.45)',
  input: '#0f172a',
};

type UiColors = typeof colors;

function getUiColors(isDark: boolean): UiColors {
  return isDark ? darkColors : colors;
}

function getPanelStyle(c: UiColors): CSSProperties {
  return {
    background: c.panel,
    border: `1px solid ${c.line}`,
    borderRadius: 18,
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
    padding: 24,
  };
}

function getInputStyle(c: UiColors): CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${c.line}`,
    borderRadius: 10,
    background: c.input,
    color: c.navy,
    fontSize: 14,
    padding: '10px 12px',
    outlineColor: c.blue,
  };
}

function getLabelStyle(c: UiColors): CSSProperties {
  return {
    display: 'block',
    marginBottom: 7,
    color: c.slate,
    fontSize: 13,
    fontWeight: 700,
  };
}

const primaryButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 10,
  background: colors.blue,
  color: '#fff',
  padding: '11px 18px',
  fontSize: 14,
  fontWeight: 800,
  cursor: 'pointer',
};

function getGhostButtonStyle(c: UiColors): CSSProperties {
  return {
    border: `1px solid ${c.line}`,
    borderRadius: 10,
    background: c.panel,
    color: c.slate,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  };
}

function getCellStyle(c: UiColors): CSSProperties {
  return {
    border: `1px solid ${c.line}`,
    padding: '10px 12px',
    fontSize: 13,
    color: c.navy,
    textAlign: 'left',
    verticalAlign: 'top',
  };
}

function getHeadCellStyle(c: UiColors): CSSProperties {
  return {
    ...getCellStyle(c),
    background: c.input,
    color: c.slate,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  };
}

const DEFAULT_VISIBLE_COUNT = 5;
const LIST_PAGE_SIZE = 5;
const COMPLETED_KNOWLEDGE_STORAGE_KEY = 'completed_knowledge_logs';
const HANDOVER_ACTION_STORAGE_KEY = 'handover_action_logs';

function readTransferredKnowledgeDocuments(): DocumentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(COMPLETED_KNOWLEDGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const result: DocumentItem[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (typeof row.id !== 'string' || !row.id) continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      result.push({
        id: row.id,
        manager: typeof row.manager === 'string' ? row.manager : '',
        date: typeof row.date === 'string' ? row.date : '',
        title: typeof row.title === 'string' ? row.title : '',
        summary: typeof row.summary === 'string' ? row.summary : '',
        process: typeof row.process === 'string' ? row.process : '',
        lot: typeof row.lot === 'string' ? row.lot : '',
        detail: typeof row.detail === 'string' ? row.detail : '',
      });
    }
    return result;
  } catch {
    return [];
  }
}

function readHandoverActionItems(): ActionHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HANDOVER_ACTION_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const result: ActionHistoryItem[] = [];
    const seen = new Set<number>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (typeof row.id !== 'number' || !Number.isFinite(row.id)) continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      result.push({
        id: row.id,
        situation: typeof row.situation === 'string' ? row.situation : '',
        action: typeof row.action === 'string' ? row.action : '',
        cause: typeof row.cause === 'string' ? row.cause : '',
        manager: typeof row.manager === 'string' ? row.manager : '',
        date: typeof row.date === 'string' ? row.date : '',
        ...(typeof row.category === 'string' && row.category
          ? { category: row.category }
          : {}),
        ...(typeof row.handoverFrom === 'string' && row.handoverFrom
          ? { handoverFrom: row.handoverFrom }
          : {}),
        ...(typeof row.handoverTo === 'string' && row.handoverTo
          ? { handoverTo: row.handoverTo }
          : {}),
      });
    }
    return result;
  } catch {
    return [];
  }
}

const DOCUMENTS: DocumentItem[] = [
  {
    id: 'DOC-2026-041',
    manager: '김현수',
    date: '2026-07-18',
    title: '소성로 2호기 온도 프로파일 최적화 결과',
    summary: '온도 상한 초과 재발 방지를 위한 구간별 설정값 조정 결과 정리',
    process: '소성',
    lot: 'LOT-CA-260718-11',
    detail:
      '소성로 2호기의 구간별 온도 프로파일을 재설계하여 3구간 목표 온도를 748°C에서 742°C로 하향 조정했습니다. 조정 후 72시간 동안 불량률이 2.4%에서 1.7%로 감소했으며, 결정 구조 분석 결과 리튬 잔류량도 기준치 이내로 확인되었습니다. 동절기에는 승온 속도를 5% 낮추는 보정이 추가로 필요합니다.',
  },
  {
    id: 'DOC-2026-040',
    manager: '박서연',
    date: '2026-07-15',
    title: '리튬 계량기 교정 주기 개선 보고',
    summary: '투입량 편차 원인이었던 계량기 드리프트 보정 주기 단축안',
    process: '원료 투입',
    lot: 'LOT-CA-260715-04',
    detail:
      '리튬 계량기의 월 1회 교정 주기를 2주 1회로 단축한 결과, 투입량 표준편차가 0.021에서 0.008로 감소했습니다. 드리프트는 주로 호퍼 진동에 의한 로드셀 미세 변형에서 발생하며, 방진 패드 교체 시 교정 주기를 다시 완화할 수 있습니다.',
  },
  {
    id: 'DOC-2026-039',
    manager: '이도윤',
    date: '2026-07-12',
    title: '혼합 공정 임펠러 마모 점검 이력',
    summary: '혼합 균일도 저하와 임펠러 마모의 상관관계 분석',
    process: '혼합',
    lot: 'LOT-CA-260712-08',
    detail:
      '임펠러 날개 끝단 마모가 1.2mm를 초과하면 혼합 균일도 지수가 급격히 저하되는 것을 확인했습니다. 마모 측정을 월 점검 항목에 추가했고, 예비품 재고 기준을 2개에서 4개로 상향했습니다.',
  },
  {
    id: 'DOC-2026-038',
    manager: '최유진',
    date: '2026-07-10',
    title: '입도 분포 관리 기준 개정안',
    summary: 'D50 관리 상한 초과 사례 분석 및 분쇄 조건 표준화',
    process: '분쇄',
    lot: 'LOT-CA-260710-03',
    detail:
      '최근 3개월간 D50 상한 접근 사례 7건을 분석한 결과, 분쇄기 회전수와 원료 수분 함량의 조합이 주요 변수였습니다. 수분 0.25% 초과 시 회전수를 3% 하향하는 조건표를 작성하여 표준 작업 지침에 반영했습니다.',
  },
  {
    id: 'DOC-2026-037',
    manager: '김현수',
    date: '2026-07-08',
    title: '냉각 구간 압력 이상 대응 매뉴얼',
    summary: '냉각수 압력 급상승 시 단계별 조치 절차 정리',
    process: '냉각',
    lot: 'LOT-CA-260708-12',
    detail:
      '냉각수 압력이 2.5bar를 초과하면 1단계로 바이패스 밸브를 개방하고, 2.8bar 초과 시 라인 절환 후 열교환기 스케일 점검을 수행합니다. 7월 초 발생한 압력 급상승은 열교환기 스케일 축적이 원인이었으며, 세정 후 정상화되었습니다.',
  },
  {
    id: 'DOC-2026-036',
    manager: '정민재',
    date: '2026-07-05',
    title: '표면 검사 카메라 조도 보정 기록',
    summary: '오검출률 개선을 위한 조명 세팅 변경 이력',
    process: '검사',
    lot: 'LOT-CA-260705-06',
    detail:
      '검사 부스 조도를 4200lux에서 4800lux로 상향하고 카메라 노출 시간을 재조정하여 표면 결함 오검출률을 3.1%에서 1.2%로 낮췄습니다. 조도 센서 값이 4500lux 아래로 내려가면 알람이 발생하도록 설정했습니다.',
  },
  {
    id: 'DOC-2026-035',
    manager: '한지우',
    date: '2026-07-02',
    title: '전구체 보관 습도 관리 개선 보고',
    summary: '수분 함량 변동 저감을 위한 보관 환경 기준 강화',
    process: '원료 보관',
    lot: 'LOT-CA-260702-01',
    detail:
      '전구체 보관 창고의 상대습도 기준을 45%에서 35%로 강화하고 제습기 가동 로직을 자동화했습니다. 개선 후 입고 로트 간 수분 함량 편차가 절반 이하로 감소했습니다.',
  },
  {
    id: 'DOC-2026-034',
    manager: '박서연',
    date: '2026-06-28',
    title: '소성 배가스 산소 농도 트렌드 분석',
    summary: '산소 농도와 결정성 상관 분석 및 급기 제어 개선',
    process: '소성',
    lot: 'LOT-CA-260628-09',
    detail:
      '배가스 산소 농도가 19.2% 아래로 내려간 구간에서 결정성 저하가 관측되었습니다. 급기 팬 제어를 수동에서 PID 자동 제어로 전환하여 산소 농도 변동 폭을 ±0.5%에서 ±0.15%로 줄였습니다.',
  },
  {
    id: 'DOC-2026-033',
    manager: '이도윤',
    date: '2026-06-24',
    title: '설비 예지보전 진동 데이터 리뷰',
    summary: '혼합기·분쇄기 베어링 진동 스펙트럼 월간 리뷰',
    process: '설비 관리',
    lot: '-',
    detail:
      '분쇄기 2호기 베어링에서 외륜 결함 주파수 성분이 미세하게 증가하는 추세가 확인되었습니다. 8월 정기 보전 시 교체를 권고하며, 그 전까지 주 1회 정밀 측정을 수행합니다.',
  },
];

const INITIAL_ACTIONS: ActionHistoryItem[] = [
  {
    id: 1,
    situation: '소성로 2호기 온도 상한(750°C) 3회 연속 초과',
    action: '목표 온도 742°C 하향 및 냉각 계통 긴급 점검',
    cause: '온도 센서 열화로 인한 제어 지연',
    manager: '김현수',
    date: '2026-07-18',
  },
  {
    id: 2,
    situation: '리튬 투입량 편차 급증으로 조성 불균일 경보 발생',
    action: '계량기 즉시 재교정 및 투입 속도 수동 제어 전환',
    cause: '계량기 로드셀 드리프트',
    manager: '박서연',
    date: '2026-07-15',
  },
  {
    id: 3,
    situation: '냉각수 압력 2.7bar 급상승',
    action: '바이패스 밸브 개방 후 열교환기 세정',
    cause: '열교환기 스케일 축적',
    manager: '김현수',
    date: '2026-07-08',
  },
  {
    id: 4,
    situation: '표면 검사 오검출률 3% 초과',
    action: '검사 부스 조도 상향 및 카메라 노출 재조정',
    cause: '조명 열화로 인한 조도 저하',
    manager: '정민재',
    date: '2026-07-05',
  },
  {
    id: 5,
    situation: '전구체 수분 함량 상승으로 잔류 리튬 증가 우려',
    action: '보관 습도 기준 강화 및 건조 시간 10% 연장',
    cause: '장마철 보관 창고 습도 상승',
    manager: '한지우',
    date: '2026-07-02',
  },
];

const INITIAL_REPORT: ReportData = {
  baseDate: '2026-07-21',
  mainCause: '소성 온도 상한 근접 운전(747°C 이상) 구간에서의 결정성 저하가 최근 불량률 상승분의 62%를 설명합니다.',
  similarCase: '2026-07-18 소성로 2호기 온도 초과 사례(DOC-2026-041)와 공정 패턴이 91% 유사합니다.',
  recommendation: '3구간 목표 온도를 742°C로 유지하고, 승온 속도를 5% 하향한 상태에서 4시간 간격으로 결정성 샘플링을 권장합니다.',
  riskSummary: '현재 위험도 중간 — 조치 미이행 시 48시간 내 불량률 2.5% 초과 확률 78%',
  referenceCount: 126,
};

const EMPTY_ACTION_FORM: ActionFormState = {
  situation: '',
  action: '',
  cause: '',
  manager: '',
  date: '',
};

const TABS: { key: TabKey; labelKo: string; labelEn: string }[] = [
  { key: 'knowledge', labelKo: '라이브러리 & 대처 이력', labelEn: 'Library & Action History' },
  { key: 'report', labelKo: 'AI 맞춤 분석', labelEn: 'AI Custom Analysis' },
];

function KnowledgeTabIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 7h8M8 11h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReportTabIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="11" r="1.3" fill="currentColor" />
      <circle cx="15" cy="11" r="1.3" fill="currentColor" />
      <path
        d="M9 15c1.1 1.2 4.9 1.2 6 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8 5V3.8M16 5V3.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

const DOC_ID_PATTERN = /DOC-\d{4}-\d+/g;

function extractDocIds(text: string): string[] {
  return Array.from(new Set(text.match(DOC_ID_PATTERN) ?? []));
}

function extractRiskPercent(riskSummary: string): number | null {
  const match = riskSummary.match(/(\d+)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return null;
  return Math.min(100, Math.max(0, value));
}

function CategoryBadge({ label }: { label: string }) {
  const { isDark } = useUiSettings();
  const toneClass = (() => {
    if (label === '소성')
      return isDark
        ? 'border-rose-800/60 bg-rose-950/40 text-rose-300'
        : 'border-rose-200 bg-rose-50 text-rose-700';
    if (label === '원료 투입')
      return isDark
        ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (label === '혼합')
      return isDark
        ? 'border-violet-800/60 bg-violet-950/40 text-violet-300'
        : 'border-violet-200 bg-violet-50 text-violet-700';
    if (label === '검사' || label === '분석')
      return isDark
        ? 'border-blue-800/60 bg-blue-950/40 text-blue-300'
        : 'border-blue-200 bg-blue-50 text-blue-700';
    if (label === '냉각')
      return isDark
        ? 'border-cyan-800/60 bg-cyan-950/40 text-cyan-300'
        : 'border-cyan-200 bg-cyan-50 text-cyan-700';
    if (label === '원료 보관')
      return isDark
        ? 'border-amber-800/60 bg-amber-950/40 text-amber-300'
        : 'border-amber-200 bg-amber-50 text-amber-700';
    if (label === '설비 관리')
      return isDark
        ? 'border-slate-600 bg-slate-800 text-slate-300'
        : 'border-slate-300 bg-slate-100 text-slate-700';
    if (label === '대처 이력')
      return isDark
        ? 'border-indigo-800/60 bg-indigo-950/40 text-indigo-300'
        : 'border-indigo-200 bg-indigo-50 text-indigo-700';
    if (label === '특이사항')
      return isDark
        ? 'border-amber-800/60 bg-amber-950/40 text-amber-300'
        : 'border-amber-200 bg-amber-50 text-amber-700';
    if (label === '전달사항')
      return isDark
        ? 'border-blue-800/60 bg-blue-950/40 text-blue-300'
        : 'border-blue-200 bg-blue-50 text-blue-700';
    if (label === '주의사항')
      return isDark
        ? 'border-rose-800/60 bg-rose-950/40 text-rose-300'
        : 'border-rose-200 bg-rose-50 text-rose-700';
    if (label === '분쇄')
      return isDark
        ? 'border-orange-800/60 bg-orange-950/40 text-orange-300'
        : 'border-orange-200 bg-orange-50 text-orange-700';
    return isDark
      ? 'border-slate-600 bg-slate-800 text-slate-300'
      : 'border-slate-200 bg-slate-50 text-slate-600';
  })();

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass}`}
    >
      {label}
    </span>
  );
}

function ModalShell({
  open,
  title,
  titleId,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const { isDark } = useUiSettings();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
        } ${wide ? 'max-w-3xl' : 'max-w-2xl'}`}
      >
        <div
          className={`flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4 ${
            isDark ? 'border-slate-700' : 'border-slate-200'
          }`}
        >
          <h3
            id={titleId}
            className={`m-0 text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="모달 닫기"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xl text-slate-400 ${
              isDark ? 'hover:bg-slate-700 hover:text-slate-200' : 'hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function useMasterCheckbox(
  visibleIds: Array<string | number>,
  selectedIds: Array<string | number>,
) {
  const ref = useRef<HTMLInputElement | null>(null);
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someSelected = visibleIds.some((id) => selectedIds.includes(id));

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  return { ref, allSelected, someSelected, disabled: visibleIds.length === 0 };
}

export default function KnowledgePage() {
  const { isDark, language } = useUiSettings();
  const uiColors = getUiColors(isDark);
  const panelStyle = getPanelStyle(uiColors);
  const inputStyle = getInputStyle(uiColors);
  const labelStyle = getLabelStyle(uiColors);
  const ghostButtonStyle = getGhostButtonStyle(uiColors);
  const cellStyle = getCellStyle(uiColors);
  const headCellStyle = getHeadCellStyle(uiColors);
  void cellStyle;
  void headCellStyle;
  const [activeTab, setActiveTab] = useState<TabKey>('knowledge');
  const [toast, setToast] = useState('');

  const [filters, setFilters] = useState<FilterState>({ manager: '', date: '', keyword: '' });
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
    manager: '',
    date: '',
    keyword: '',
  });
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const [actions] = useState<ActionHistoryItem[]>(INITIAL_ACTIONS);
  const [actionSearch, setActionSearch] = useState('');
  const [appliedActionSearch, setAppliedActionSearch] = useState('');
  const [, setActionForm] = useState<ActionFormState>(EMPTY_ACTION_FORM);
  const [, setEditingId] = useState<number | null>(null);
  const [, setFormError] = useState('');

  const [report, setReport] = useState<ReportData>(INITIAL_REPORT);

  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [selectedActionIds, setSelectedActionIds] = useState<number[]>([]);
  const [analysisDocIds, setAnalysisDocIds] = useState<string[]>([]);
  const [analysisActionIds, setAnalysisActionIds] = useState<number[]>([]);
  const [isSelectionListExpanded, setIsSelectionListExpanded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasRunAnalysis, setHasRunAnalysis] = useState(false);
  const [docPage, setDocPage] = useState(1);
  const [actionPage, setActionPage] = useState(1);
  const [transferredDocuments, setTransferredDocuments] = useState<DocumentItem[]>([]);
  const [handoverActions, setHandoverActions] = useState<ActionHistoryItem[]>([]);
  const analysisTimerRef = useRef<number | null>(null);

  const refreshTransferredDocuments = () => {
    setTransferredDocuments(readTransferredKnowledgeDocuments());
  };

  const refreshHandoverActions = () => {
    setHandoverActions(readHandoverActionItems());
  };

  useEffect(() => {
    refreshTransferredDocuments();
    refreshHandoverActions();
  }, []);

  useEffect(() => {
    if (activeTab === 'knowledge') {
      refreshTransferredDocuments();
      refreshHandoverActions();
    }
  }, [activeTab]);

  const transferredIdSet = useMemo(
    () => new Set(transferredDocuments.map((doc) => doc.id)),
    [transferredDocuments],
  );

  const allDocuments = useMemo(() => {
    const staticIds = new Set(DOCUMENTS.map((doc) => doc.id));
    const uniqueTransferred = transferredDocuments.filter((doc) => !staticIds.has(doc.id));
    return [...uniqueTransferred, ...DOCUMENTS];
  }, [transferredDocuments]);

  const allActions = useMemo(() => {
    const staticIds = new Set(actions.map((item) => item.id));
    const uniqueHandover = handoverActions.filter((item) => !staticIds.has(item.id));
    return [...uniqueHandover, ...actions];
  }, [actions, handoverActions]);

  const libraryTotalCount = allDocuments.length + allActions.length;

  const filteredDocuments = useMemo(() => {
    const keyword = appliedFilters.keyword.trim().toLowerCase();
    return allDocuments.filter((doc) => {
      const matchesDate = !appliedFilters.date || doc.date === appliedFilters.date;
      const matchesKeyword =
        !keyword ||
        doc.title.toLowerCase().includes(keyword) ||
        doc.summary.toLowerCase().includes(keyword) ||
        doc.process.toLowerCase().includes(keyword) ||
        doc.lot.toLowerCase().includes(keyword);
      return matchesDate && matchesKeyword;
    });
  }, [appliedFilters, allDocuments]);

  const selectedDoc = useMemo(
    () => allDocuments.find((doc) => doc.id === selectedDocId) ?? null,
    [selectedDocId, allDocuments],
  );

  const filteredActions = useMemo(() => {
    const keyword = appliedActionSearch.trim().toLowerCase();
    if (!keyword) return allActions;
    return allActions.filter(
      (item) =>
        item.situation.toLowerCase().includes(keyword) ||
        item.action.toLowerCase().includes(keyword) ||
        item.cause.toLowerCase().includes(keyword) ||
        item.manager.toLowerCase().includes(keyword) ||
        (item.category ?? '').toLowerCase().includes(keyword) ||
        (item.handoverFrom ?? '').toLowerCase().includes(keyword) ||
        (item.handoverTo ?? '').toLowerCase().includes(keyword) ||
        item.date.includes(keyword),
    );
  }, [allActions, appliedActionSearch]);

  const validSelectedDocIds = useMemo(
    () => selectedDocIds.filter((id) => allDocuments.some((doc) => doc.id === id)),
    [selectedDocIds, allDocuments],
  );
  const validSelectedActionIds = useMemo(
    () => selectedActionIds.filter((id) => allActions.some((item) => item.id === id)),
    [selectedActionIds, allActions],
  );

  const selectedCount = validSelectedDocIds.length + validSelectedActionIds.length;

  const selectedDocs = useMemo(
    () => allDocuments.filter((doc) => validSelectedDocIds.includes(doc.id)),
    [validSelectedDocIds, allDocuments],
  );
  const selectedActions = useMemo(
    () => allActions.filter((item) => validSelectedActionIds.includes(item.id)),
    [validSelectedActionIds, allActions],
  );

  const selectedListItems = useMemo(() => {
    const docs = selectedDocs.map((item, index) => ({
      kind: 'document' as const,
      item,
      order: index + 1,
    }));
    const actionItems = selectedActions.map((item, index) => ({
      kind: 'action' as const,
      item,
      order: selectedDocs.length + index + 1,
    }));
    return [...docs, ...actionItems];
  }, [selectedDocs, selectedActions]);

  const remainingSelectionCount = Math.max(0, selectedCount - DEFAULT_VISIBLE_COUNT);
  const visibleSelectionItems = isSelectionListExpanded
    ? selectedListItems
    : selectedListItems.slice(0, DEFAULT_VISIBLE_COUNT);

  const analysisDocs = useMemo(
    () => allDocuments.filter((doc) => analysisDocIds.includes(doc.id)),
    [analysisDocIds, allDocuments],
  );
  const analysisActions = useMemo(
    () => allActions.filter((item) => analysisActionIds.includes(item.id)),
    [analysisActionIds, allActions],
  );
  const analysisCount = analysisDocs.length + analysisActions.length;

  const selectionMatchesAnalysis = useMemo(() => {
    if (!hasRunAnalysis) return false;
    if (validSelectedDocIds.length !== analysisDocIds.length) return false;
    if (validSelectedActionIds.length !== analysisActionIds.length) return false;
    const docsMatch = validSelectedDocIds.every((id) => analysisDocIds.includes(id));
    const actionsMatch = validSelectedActionIds.every((id) => analysisActionIds.includes(id));
    return docsMatch && actionsMatch;
  }, [
    hasRunAnalysis,
    validSelectedDocIds,
    validSelectedActionIds,
    analysisDocIds,
    analysisActionIds,
  ]);

  const analysisInsights = useMemo(() => {
    const summaries = analysisDocs.map((doc) => doc.summary).filter(Boolean);
    const causes = analysisActions.map((item) => item.cause).filter(Boolean);
    const actionsTaken = analysisActions.map((item) => item.action).filter(Boolean);
    return {
      summaries,
      causes,
      actionsTaken,
      titles: [
        ...analysisDocs.map((doc) => `${doc.id} · ${doc.title}`),
        ...analysisActions.map((item) => item.situation),
      ],
    };
  }, [analysisDocs, analysisActions]);

  const docTotalPages = Math.max(1, Math.ceil(filteredDocuments.length / LIST_PAGE_SIZE));
  const actionTotalPages = Math.max(1, Math.ceil(filteredActions.length / LIST_PAGE_SIZE));
  const safeDocPage = Math.min(docPage, docTotalPages);
  const safeActionPage = Math.min(actionPage, actionTotalPages);

  const renderedDocuments = useMemo(() => {
    const start = (safeDocPage - 1) * LIST_PAGE_SIZE;
    return filteredDocuments.slice(start, start + LIST_PAGE_SIZE);
  }, [filteredDocuments, safeDocPage]);

  const renderedActions = useMemo(() => {
    const start = (safeActionPage - 1) * LIST_PAGE_SIZE;
    return filteredActions.slice(start, start + LIST_PAGE_SIZE);
  }, [filteredActions, safeActionPage]);

  const docPageNumbers = useMemo(
    () => Array.from({ length: docTotalPages }, (_, index) => index + 1),
    [docTotalPages],
  );
  const actionPageNumbers = useMemo(
    () => Array.from({ length: actionTotalPages }, (_, index) => index + 1),
    [actionTotalPages],
  );

  const riskPercent = useMemo(() => extractRiskPercent(report.riskSummary), [report.riskSummary]);
  const similarDocIds = useMemo(() => extractDocIds(report.similarCase), [report.similarCase]);

  const visibleDocIds = useMemo(() => filteredDocuments.map((doc) => doc.id), [filteredDocuments]);
  const visibleActionIds = useMemo(
    () => filteredActions.map((item) => item.id),
    [filteredActions],
  );

  const docMaster = useMasterCheckbox(visibleDocIds, validSelectedDocIds);
  const actionMaster = useMasterCheckbox(visibleActionIds, validSelectedActionIds);

  useEffect(() => {
    if (docPage > docTotalPages) setDocPage(docTotalPages);
  }, [docPage, docTotalPages]);

  useEffect(() => {
    if (actionPage > actionTotalPages) setActionPage(actionTotalPages);
  }, [actionPage, actionTotalPages]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3000);
  };

  const applyKnowledgeFilters = () => {
    setAppliedFilters({ ...filters, manager: '' });
    setAppliedActionSearch(actionSearch);
    setDocPage(1);
    setActionPage(1);
    showToast('필터가 적용되었습니다.');
  };

  const resetKnowledgeFilters = () => {
    const empty = { manager: '', date: '', keyword: '' };
    setFilters(empty);
    setAppliedFilters(empty);
    setActionSearch('');
    setAppliedActionSearch('');
    setDocPage(1);
    setActionPage(1);
    showToast('필터가 초기화되었습니다.');
  };

  const handleFormChange = (key: keyof ActionFormState, value: string) => {
    setActionForm((current) => ({ ...current, [key]: value }));
  };

  const startEdit = (item: ActionHistoryItem) => {
    setEditingId(item.id);
    setActionForm({
      situation: item.situation,
      action: item.action,
      cause: item.cause,
      manager: item.manager,
      date: item.date,
    });
    setFormError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setActionForm(EMPTY_ACTION_FORM);
    setFormError('');
  };

  const openDocumentDetail = (doc: DocumentItem) => {
    setSelectedDocId(doc.id);
    setDetailTarget({ kind: 'document', item: doc });
  };

  const openActionDetail = (item: ActionHistoryItem) => {
    setDetailTarget({ kind: 'action', item });
  };

  const closeDetailModal = () => {
    setDetailTarget(null);
  };

  const handleActionSubmit = () => {
    // 읽기 전용 화면에서는 UI를 제공하지 않으며, 기존 핸들러 시그니처·흐름은 보존합니다.
    setFormError('읽기 전용 라이브러리에서는 등록·수정이 비활성화되어 있습니다.');
  };

  const handleDelete = (id: number) => {
    console.log('인수인계 이력 삭제 요청(읽기 전용 무시):', { id });
  };

  const handleGenerateReport = () => {
    const refreshed: ReportData = {
      ...report,
      baseDate: '2026-07-21',
      referenceCount: report.referenceCount + actions.length,
    };
    setReport(refreshed);
    console.log('AI 데일리 레포트 생성:', refreshed);
    showToast('데일리 레포트가 최신 과거 데이터 기준으로 재갱신되었습니다.');
  };

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const toggleActionSelection = (id: number) => {
    setSelectedActionIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const toggleVisibleDocs = (checked: boolean) => {
    setSelectedDocIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...visibleDocIds]));
      }
      return current.filter((id) => !visibleDocIds.includes(id));
    });
  };

  const toggleVisibleActions = (checked: boolean) => {
    setSelectedActionIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...visibleActionIds]));
      }
      return current.filter((id) => !visibleActionIds.includes(id));
    });
  };

  const clearAnalysisTimer = () => {
    if (analysisTimerRef.current !== null) {
      window.clearTimeout(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearAnalysisTimer();
  }, []);

  useEffect(() => {
    if (selectedCount <= DEFAULT_VISIBLE_COUNT) {
      setIsSelectionListExpanded(false);
    }
  }, [selectedCount]);

  const clearSelection = () => {
    if (isAnalyzing) return;
    clearAnalysisTimer();
    setIsAnalyzing(false);
    setSelectedDocIds([]);
    setSelectedActionIds([]);
    setAnalysisDocIds([]);
    setAnalysisActionIds([]);
    setHasRunAnalysis(false);
    setIsSelectionListExpanded(false);
  };

  const removeDocFromSelection = (id: string) => {
    if (isAnalyzing) return;
    setSelectedDocIds((current) => current.filter((item) => item !== id));
  };

  const removeActionFromSelection = (id: number) => {
    if (isAnalyzing) return;
    setSelectedActionIds((current) => current.filter((item) => item !== id));
  };

  /** 지식 탭 액션바: 분석 탭으로 이동 (분석은 아직 실행하지 않음) */
  const runSelectedAnalysis = () => {
    if (selectedCount === 0) return;
    setIsSelectionListExpanded(false);
    setActiveTab('report');
  };

  /** AI 탭: 현재 선택 스냅샷으로 분석 실행 */
  const executeAnalysis = () => {
    if (selectedCount === 0 || isAnalyzing) return;
    const docSnapshot = [...validSelectedDocIds];
    const actionSnapshot = [...validSelectedActionIds];
    clearAnalysisTimer();
    setIsAnalyzing(true);
    analysisTimerRef.current = window.setTimeout(() => {
      setAnalysisDocIds(docSnapshot);
      setAnalysisActionIds(actionSnapshot);
      setHasRunAnalysis(true);
      setIsAnalyzing(false);
      analysisTimerRef.current = null;
      showToast(`선택한 ${docSnapshot.length + actionSnapshot.length}개 항목 분석을 완료했습니다.`);
    }, 1000);
  };

  const onRowKeyOpen = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    open: () => void,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };

  const renderSimilarCaseText = (text: string) => {
    const parts = text.split(DOC_ID_PATTERN);
    const ids = text.match(DOC_ID_PATTERN) ?? [];
    const nodes: ReactNode[] = [];
    parts.forEach((part, index) => {
      nodes.push(<span key={`t-${index}`}>{part}</span>);
      const docId = ids[index];
      if (!docId) return;
      const matched = allDocuments.find((doc) => doc.id === docId);
      if (matched) {
        nodes.push(
          <button
            key={`d-${docId}-${index}`}
            type="button"
            onClick={() => openDocumentDetail(matched)}
            className="cursor-pointer font-semibold text-blue-600 hover:underline"
          >
            {docId}
          </button>,
        );
      } else {
        nodes.push(
          <span key={`u-${docId}-${index}`} className="text-slate-700">
            {docId}
          </span>,
        );
      }
    });
    return nodes;
  };

  // 기존 핸들러 참조 유지 (트리셰이킹/린트 대비)
  void handleFormChange;
  void startEdit;
  void cancelEdit;
  void handleActionSubmit;
  void handleDelete;

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        background: uiColors.background,
        color: uiColors.navy,
        padding: '36px clamp(16px, 3vw, 44px) 56px',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif",
      }}
    >
      <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', paddingBottom: selectedCount > 0 ? 88 : 0 }}>
        {toast && (
          <div
            role="status"
            style={{
              position: 'fixed',
              top: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 110,
              background: colors.navy,
              color: '#fff',
              borderRadius: 12,
              padding: '13px 22px',
              fontSize: 14,
              fontWeight: 700,
              boxShadow: '0 12px 32px rgba(15, 23, 42, 0.35)',
            }}
          >
            ✓ {toast}
          </div>
        )}

        <div className="mb-6 flex flex-col gap-1">
          <p
            className={`text-sm font-bold tracking-wide ${
              isDark ? 'text-blue-400' : 'text-blue-600'
            }`}
          >
            Knowledge Base
          </p>
          <h1
            className={`mt-1 text-3xl font-bold tracking-tight ${
              isDark ? 'text-slate-100' : 'text-gray-900'
            }`}
          >
            {language === 'en' ? 'Library' : '라이브러리'}
          </h1>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            {language === 'en'
              ? 'Issue action archive · Knowledge library'
              : '이슈 조치 이력 아카이브 · 지식 라이브러리'}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="라이브러리 섹션"
          className={`mb-5 flex w-fit max-w-full flex-wrap gap-1.5 rounded-xl p-1.5 ${
            isDark ? 'bg-slate-950/80' : 'bg-slate-200/80'
          }`}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? isDark
                      ? 'bg-slate-800 font-semibold text-blue-300 shadow-sm'
                      : 'bg-white font-semibold text-blue-600 shadow-sm'
                    : isDark
                      ? 'bg-transparent font-medium text-slate-400 hover:text-slate-200'
                      : 'bg-transparent font-medium text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.key === 'knowledge' ? <KnowledgeTabIcon /> : <ReportTabIcon />}
                {language === 'en' ? tab.labelEn : tab.labelKo}
              </button>
            );
          })}
        </div>

        {activeTab === 'knowledge' && (
          <section style={panelStyle}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 style={{ margin: 0, color: uiColors.navy, fontSize: 19 }}>
                  {language === 'en' ? 'Library & Action History' : '라이브러리 & 대처 이력'}
                </h2>
                <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {language === 'en'
                    ? `Knowledge library (total ${libraryTotalCount})`
                    : `누적 지식 라이브러리 (총 ${libraryTotalCount}건)`}
                  {selectedDoc
                    ? language === 'en'
                      ? ` · Recently viewed ${selectedDoc.id}`
                      : ` · 최근 조회 ${selectedDoc.id}`
                    : ''}
                </p>
                <div aria-live="polite" className="sr-only">
                  {language === 'en'
                    ? `${selectedCount} items selected`
                    : `선택된 항목 ${selectedCount}개`}
                </div>
              </div>
            </div>

            <div
              className={`mb-5 flex flex-wrap items-end gap-2.5 rounded-xl border p-3 ${
                isDark
                  ? 'border-slate-700/80 bg-slate-900/60'
                  : 'border-slate-200/80 bg-slate-50/60'
              }`}
            >
              <div className="w-[150px]">
                <label htmlFor="doc-date" style={labelStyle}>
                  날짜 (YYYY. MM. DD.)
                </label>
                <input
                  id="doc-date"
                  type="date"
                  value={filters.date}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, date: event.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
              <div className="min-w-[180px] flex-[1.4]">
                <label htmlFor="doc-keyword" style={labelStyle}>
                  문서 검색
                </label>
                <input
                  id="doc-keyword"
                  value={filters.keyword}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, keyword: event.target.value }))
                  }
                  placeholder="제목, 요약, 공정, LOT 통합 검색"
                  style={inputStyle}
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <label htmlFor="action-search" style={labelStyle}>
                  대처 이력 검색
                </label>
                <input
                  id="action-search"
                  value={actionSearch}
                  onChange={(event) => setActionSearch(event.target.value)}
                  placeholder="제목, 요약, 공정, LOT 통합 검색"
                  style={inputStyle}
                />
              </div>
              <button
                type="button"
                onClick={applyKnowledgeFilters}
                className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                적용하기
              </button>
              <button
                type="button"
                onClick={resetKnowledgeFilters}
                className={`inline-flex h-10 items-center rounded-lg px-3 text-xs font-semibold ${
                  isDark
                    ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                초기화
              </button>
            </div>

            {selectedCount > 0 && (
              <div
                className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-sm ${
                  isDark
                    ? 'border-blue-800/60 bg-blue-950/40'
                    : 'border-blue-200/80 bg-blue-50'
                }`}
              >
                <div>
                  <div
                    className={`text-sm font-semibold ${isDark ? 'text-blue-300' : 'text-blue-800'}`}
                    aria-live="polite"
                  >
                    {selectedCount}개 항목 선택됨
                  </div>
                  <div className={`mt-0.5 text-[11px] ${isDark ? 'text-blue-400/80' : 'text-blue-700/80'}`}>
                    선택한 항목을 AI 데일리 레포트 분석 범위로 보낼 수 있습니다.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={clearSelection} style={ghostButtonStyle}>
                    선택 해제
                  </button>
                  <button type="button" onClick={runSelectedAnalysis} style={primaryButtonStyle}>
                    선택한 {selectedCount}개 항목 AI 분석하기 ✨
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-6">
              {/* 과거 자료 */}
              <div
                className={`overflow-hidden rounded-xl border shadow-sm ${
                  isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
                }`}
              >
                <div
                  className={`border-b px-4 py-3.5 sm:px-5 ${
                    isDark ? 'border-slate-700' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3
                      className={`m-0 text-base font-semibold ${
                        isDark ? 'text-slate-100' : 'text-slate-800'
                      }`}
                    >
                      과거 자료
                    </h3>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {filteredDocuments.length}건
                    </span>
                  </div>
                  <p className={`mb-0 mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    등록된 보고서와 공정 관련 문서를 조회합니다.
                  </p>
                </div>
                <div id="past-documents-list" className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left">
                    <thead>
                      <tr
                        className={`border-b text-xs font-semibold ${
                          isDark
                            ? 'border-slate-700 bg-slate-900/60 text-slate-400'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                      >
                        <th className="w-12 px-3 py-3">
                          <input
                            ref={docMaster.ref}
                            type="checkbox"
                            checked={docMaster.allSelected}
                            disabled={docMaster.disabled}
                            onChange={(event) => toggleVisibleDocs(event.target.checked)}
                            aria-label="표시된 문서 전체 선택"
                            className="h-4 w-4 accent-blue-600"
                          />
                        </th>
                        <th className="w-[118px] whitespace-nowrap px-3 py-3">문서 ID</th>
                        <th className="w-[104px] whitespace-nowrap px-3 py-3">분류</th>
                        <th className="min-w-[280px] px-3 py-3">제목</th>
                        <th className="w-[88px] whitespace-nowrap px-3 py-3">담당자</th>
                        <th className="w-[108px] whitespace-nowrap px-3 py-3">날짜</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDocuments.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className={`px-4 py-12 text-center text-sm ${
                              isDark ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            검색 조건에 맞는 자료가 없습니다.
                          </td>
                        </tr>
                      ) : (
                        renderedDocuments.map((doc) => {
                          const checked = validSelectedDocIds.includes(doc.id);
                          return (
                            <tr
                              key={doc.id}
                              tabIndex={0}
                              onClick={() => openDocumentDetail(doc)}
                              onKeyDown={(event) =>
                                onRowKeyOpen(event, () => openDocumentDetail(doc))
                              }
                              className={`cursor-pointer border-b transition-colors ${
                                isDark
                                  ? `border-slate-700 hover:bg-slate-700/40 ${
                                      checked
                                        ? 'border-l-4 border-l-blue-500 bg-blue-950/30'
                                        : 'border-l-4 border-l-transparent bg-slate-800'
                                    }`
                                  : `border-slate-100 hover:bg-slate-50/80 ${
                                      checked
                                        ? 'border-l-4 border-l-blue-600 bg-blue-50/60'
                                        : 'border-l-4 border-l-transparent bg-white'
                                    }`
                              }`}
                            >
                              <td
                                className="w-12 px-3 py-3.5"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleDocSelection(doc.id)}
                                  aria-label={`${doc.title} 선택`}
                                  className="h-4 w-4 accent-blue-600"
                                />
                              </td>
                              <td className="w-[118px] whitespace-nowrap px-3 py-3.5">
                                <button
                                  type="button"
                                  className={`cursor-pointer text-xs font-medium hover:underline ${
                                    isDark ? 'text-blue-300' : 'text-blue-600'
                                  }`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openDocumentDetail(doc);
                                  }}
                                >
                                  {doc.id}
                                </button>
                              </td>
                              <td className="w-[104px] whitespace-nowrap px-3 py-3.5">
                                {doc.process ? (
                                  <CategoryBadge label={doc.process} />
                                ) : transferredIdSet.has(doc.id) ? (
                                  <span
                                    className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${
                                      isDark
                                        ? 'border-indigo-800/60 bg-indigo-950/40 text-indigo-300'
                                        : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                    }`}
                                  >
                                    이슈완료
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400">-</span>
                                )}
                              </td>
                              <td className="min-w-[280px] px-3 py-3.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <div
                                    className={`line-clamp-2 text-sm font-semibold ${
                                      isDark ? 'text-slate-100' : 'text-slate-800'
                                    }`}
                                    title={doc.title}
                                  >
                                    {doc.title}
                                  </div>
                                  {transferredIdSet.has(doc.id) && doc.process ? (
                                    <span
                                      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${
                                        isDark
                                          ? 'border-indigo-800/60 bg-indigo-950/40 text-indigo-300'
                                          : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                      }`}
                                    >
                                      이슈완료
                                    </span>
                                  ) : null}
                                </div>
                                <div
                                  className={`mt-1 line-clamp-1 text-xs ${
                                    isDark ? 'text-slate-400' : 'text-slate-500'
                                  }`}
                                  title={doc.summary}
                                >
                                  {doc.summary}
                                </div>
                              </td>
                              <td
                                className={`w-[88px] whitespace-nowrap px-3 py-3.5 text-sm ${
                                  isDark ? 'text-slate-400' : 'text-slate-600'
                                }`}
                              >
                                {doc.manager}
                              </td>
                              <td
                                className={`w-[108px] whitespace-nowrap px-3 py-3.5 text-sm ${
                                  isDark ? 'text-slate-400' : 'text-slate-600'
                                }`}
                              >
                                {doc.date}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredDocuments.length > 0 ? (
                  <div
                    className={`flex flex-col items-center gap-2 border-t px-4 py-3 sm:flex-row sm:justify-between ${
                      isDark
                        ? 'border-slate-700 bg-slate-900/60'
                        : 'border-slate-200 bg-slate-50/80'
                    }`}
                  >
                    <span
                      className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                    >
                      {(safeDocPage - 1) * LIST_PAGE_SIZE + 1}-
                      {Math.min(safeDocPage * LIST_PAGE_SIZE, filteredDocuments.length)} /{' '}
                      {filteredDocuments.length}건
                    </span>
                    <nav
                      aria-label="과거 자료 페이지"
                      className="flex flex-wrap items-center justify-center gap-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => setDocPage((page) => Math.max(1, page - 1))}
                        disabled={safeDocPage <= 1}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          isDark
                            ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        이전
                      </button>
                      {docPageNumbers.map((page) => {
                        const active = page === safeDocPage;
                        return (
                          <button
                            key={page}
                            type="button"
                            aria-current={active ? 'page' : undefined}
                            onClick={() => setDocPage(page)}
                            className={`min-w-8 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                              active
                                ? 'bg-blue-600 text-white'
                                : isDark
                                  ? 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setDocPage((page) => Math.min(docTotalPages, page + 1))}
                        disabled={safeDocPage >= docTotalPages}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          isDark
                            ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        다음
                      </button>
                    </nav>
                  </div>
                ) : null}
              </div>

              {/* 인수인계 이력 */}
              <div
                className={`overflow-hidden rounded-xl border shadow-sm ${
                  isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
                }`}
              >
                <div
                  className={`border-b px-4 py-3.5 sm:px-5 ${
                    isDark ? 'border-slate-700' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3
                      className={`m-0 text-base font-semibold ${
                        isDark ? 'text-slate-100' : 'text-slate-800'
                      }`}
                    >
                      인수인계 이력
                    </h3>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {filteredActions.length}건
                    </span>
                  </div>
                  <p className={`mb-0 mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    저장된 이슈의 발생 상황과 인수인계·대응 내역입니다.
                  </p>
                </div>
                <div id="action-history-list" className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-left">
                    <thead>
                      <tr
                        className={`border-b text-xs font-semibold ${
                          isDark
                            ? 'border-slate-700 bg-slate-900/60 text-slate-400'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                      >
                        <th className="w-12 px-3 py-3">
                          <input
                            ref={actionMaster.ref}
                            type="checkbox"
                            checked={actionMaster.allSelected}
                            disabled={actionMaster.disabled}
                            onChange={(event) => toggleVisibleActions(event.target.checked)}
                            aria-label="표시된 대처 이력 전체 선택"
                            className="h-4 w-4 accent-blue-600"
                          />
                        </th>
                        <th className="w-[96px] whitespace-nowrap px-3 py-3">분류</th>
                        <th className="min-w-[220px] px-3 py-3">발생 상황</th>
                        <th className="w-[100px] whitespace-nowrap px-3 py-3">인계자</th>
                        <th className="w-[100px] whitespace-nowrap px-3 py-3">인수자</th>
                        <th className="w-[108px] whitespace-nowrap px-3 py-3">날짜</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className={`px-4 py-12 text-center text-sm ${
                              isDark ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            검색 조건에 맞는 이력이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        renderedActions.map((item) => {
                          const checked = validSelectedActionIds.includes(item.id);
                          const fromName = item.handoverFrom?.trim() || item.manager || '-';
                          const toName = item.handoverTo?.trim() || '-';
                          return (
                            <tr
                              key={item.id}
                              tabIndex={0}
                              onClick={() => openActionDetail(item)}
                              onKeyDown={(event) =>
                                onRowKeyOpen(event, () => openActionDetail(item))
                              }
                              className={`cursor-pointer border-b transition-colors ${
                                isDark
                                  ? `border-slate-700 hover:bg-slate-700/40 ${
                                      checked
                                        ? 'border-l-4 border-l-blue-500 bg-blue-950/30'
                                        : 'border-l-4 border-l-transparent bg-slate-800'
                                    }`
                                  : `border-slate-100 hover:bg-slate-50/80 ${
                                      checked
                                        ? 'border-l-4 border-l-blue-600 bg-blue-50/60'
                                        : 'border-l-4 border-l-transparent bg-white'
                                    }`
                              }`}
                            >
                              <td
                                className="w-12 px-3 py-3.5"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleActionSelection(item.id)}
                                  aria-label={`${item.situation} 선택`}
                                  className="h-4 w-4 accent-blue-600"
                                />
                              </td>
                              <td className="w-[96px] whitespace-nowrap px-3 py-3.5">
                                <CategoryBadge label={item.category?.trim() || '대처 이력'} />
                              </td>
                              <td
                                className={`min-w-[220px] px-3 py-3.5 text-sm font-semibold ${
                                  isDark ? 'text-slate-100' : 'text-slate-800'
                                }`}
                                title={item.situation}
                              >
                                <div className="line-clamp-2">{item.situation}</div>
                              </td>
                              <td
                                className={`w-[100px] whitespace-nowrap px-3 py-3.5 text-sm ${
                                  isDark ? 'text-slate-400' : 'text-slate-600'
                                }`}
                              >
                                {fromName}
                              </td>
                              <td
                                className={`w-[100px] whitespace-nowrap px-3 py-3.5 text-sm ${
                                  isDark ? 'text-slate-400' : 'text-slate-600'
                                }`}
                              >
                                {toName}
                              </td>
                              <td
                                className={`w-[108px] whitespace-nowrap px-3 py-3.5 text-sm ${
                                  isDark ? 'text-slate-400' : 'text-slate-600'
                                }`}
                              >
                                {item.date}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredActions.length > 0 ? (
                  <div
                    className={`flex flex-col items-center gap-2 border-t px-4 py-3 sm:flex-row sm:justify-between ${
                      isDark
                        ? 'border-slate-700 bg-slate-900/60'
                        : 'border-slate-200 bg-slate-50/80'
                    }`}
                  >
                    <span
                      className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                    >
                      {(safeActionPage - 1) * LIST_PAGE_SIZE + 1}-
                      {Math.min(safeActionPage * LIST_PAGE_SIZE, filteredActions.length)} /{' '}
                      {filteredActions.length}건
                    </span>
                    <nav
                      aria-label="인수인계 이력 페이지"
                      className="flex flex-wrap items-center justify-center gap-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => setActionPage((page) => Math.max(1, page - 1))}
                        disabled={safeActionPage <= 1}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          isDark
                            ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        이전
                      </button>
                      {actionPageNumbers.map((page) => {
                        const active = page === safeActionPage;
                        return (
                          <button
                            key={page}
                            type="button"
                            aria-current={active ? 'page' : undefined}
                            onClick={() => setActionPage(page)}
                            className={`min-w-8 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                              active
                                ? 'bg-blue-600 text-white'
                                : isDark
                                  ? 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() =>
                          setActionPage((page) => Math.min(actionTotalPages, page + 1))
                        }
                        disabled={safeActionPage >= actionTotalPages}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          isDark
                            ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        다음
                      </button>
                    </nav>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'report' && (
          <section style={panelStyle}>
            {selectedCount === 0 ? (
              <div
                className={`flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60'
                    : 'border-slate-200 bg-slate-50/60'
                }`}
              >
                <div
                  className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
                    isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  <ReportTabIcon />
                </div>
                <h2
                  className={`m-0 text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}
                >
                  AI 분석을 진행할 라이브러리 항목을 선택해 주세요.
                </h2>
                <p
                  className={`mt-2 max-w-md text-sm leading-relaxed ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  라이브러리 & 대처 이력 탭에서 원하는 항목을 체크한 후 AI 분석을 실행하세요.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('knowledge')}
                  style={primaryButtonStyle}
                  className="mt-5"
                >
                  라이브러리 목록에서 선택하러 가기
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.6fr)]">
                <aside
                  className={`rounded-xl border p-4 ${
                    isDark
                      ? 'border-slate-700 bg-slate-900/60'
                      : 'border-slate-200 bg-slate-50/70'
                  }`}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3
                      className={`m-0 text-sm font-bold ${
                        isDark ? 'text-slate-100' : 'text-slate-800'
                      }`}
                    >
                      분석 대상 지식 항목
                    </h3>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                        isDark
                          ? 'border-blue-800/60 bg-blue-950/40 text-blue-300'
                          : 'border-blue-100 bg-blue-50 text-blue-700'
                      }`}
                    >
                      {selectedCount}개
                    </span>
                  </div>
                  <div
                    id="analysis-selection-list"
                    className={`space-y-2 ${
                      isSelectionListExpanded ? 'max-h-[520px] overflow-y-auto pr-1' : ''
                    }`}
                  >
                    {visibleSelectionItems.map((entry) => {
                      if (entry.kind === 'document') {
                        const doc = entry.item;
                        return (
                          <div
                            key={`doc-${doc.id}`}
                            className={`flex gap-2 rounded-lg border p-3 ${
                              isDark
                                ? 'border-slate-700 bg-slate-800'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => openDocumentDetail(doc)}
                              className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
                            >
                              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-900 px-1.5 text-[10px] font-bold text-white">
                                  {entry.order}
                                </span>
                                <span
                                  className={`text-[11px] font-semibold ${
                                    isDark ? 'text-blue-300' : 'text-blue-600'
                                  }`}
                                >
                                  {doc.id}
                                </span>
                                {doc.process ? <CategoryBadge label={doc.process} /> : null}
                                {transferredIdSet.has(doc.id) ? (
                                  <span
                                    className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${
                                      isDark
                                        ? 'border-indigo-800/60 bg-indigo-950/40 text-indigo-300'
                                        : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                    }`}
                                  >
                                    이슈완료
                                  </span>
                                ) : null}
                              </div>
                              <div
                                className={`line-clamp-2 text-sm font-semibold ${
                                  isDark ? 'text-slate-100' : 'text-slate-900'
                                }`}
                              >
                                {doc.title}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-400">{doc.date}</div>
                            </button>
                            <button
                              type="button"
                              disabled={isAnalyzing}
                              aria-label={`${doc.title} 분석 대상에서 제외`}
                              onClick={(event) => {
                                event.stopPropagation();
                                removeDocFromSelection(doc.id);
                              }}
                              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold text-slate-400 disabled:cursor-not-allowed disabled:opacity-40 ${
                                isDark
                                  ? 'hover:bg-slate-700 hover:text-slate-200'
                                  : 'hover:bg-slate-100 hover:text-slate-700'
                              }`}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      }
                      const item = entry.item;
                      return (
                        <div
                          key={`action-${item.id}`}
                          className={`flex gap-2 rounded-lg border p-3 ${
                            isDark
                              ? 'border-slate-700 bg-slate-800'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => openActionDetail(item)}
                            className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
                          >
                            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-900 px-1.5 text-[10px] font-bold text-white">
                                {entry.order}
                              </span>
                              <CategoryBadge label={item.category?.trim() || '대처 이력'} />
                            </div>
                            <div
                              className={`line-clamp-2 text-sm font-semibold ${
                                isDark ? 'text-slate-100' : 'text-slate-900'
                              }`}
                            >
                              {item.situation}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400">{item.date}</div>
                          </button>
                          <button
                            type="button"
                            disabled={isAnalyzing}
                            aria-label={`${item.situation} 분석 대상에서 제외`}
                            onClick={(event) => {
                              event.stopPropagation();
                              removeActionFromSelection(item.id);
                            }}
                            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold text-slate-400 disabled:cursor-not-allowed disabled:opacity-40 ${
                              isDark
                                ? 'hover:bg-slate-700 hover:text-slate-200'
                                : 'hover:bg-slate-100 hover:text-slate-700'
                            }`}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {remainingSelectionCount > 0 && (
                    <button
                      type="button"
                      className={`mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border px-3 text-xs font-semibold ${
                        isDark
                          ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                      aria-expanded={isSelectionListExpanded}
                      aria-controls="analysis-selection-list"
                      onClick={() => setIsSelectionListExpanded((current) => !current)}
                    >
                      {isSelectionListExpanded
                        ? '접기'
                        : `${remainingSelectionCount}개 더 보기`}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={clearSelection}
                    className={`mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-lg px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDark
                        ? 'text-slate-400 hover:bg-slate-700'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    전체 선택 해제
                  </button>
                </aside>

                <div
                  className={`min-w-0 rounded-xl border ${
                    isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
                  }`}
                >
                  {isAnalyzing ? (
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-12 text-center"
                    >
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                      <p
                        className={`m-0 text-sm font-semibold ${
                          isDark ? 'text-slate-200' : 'text-slate-700'
                        }`}
                      >
                        AI가 선택된 지식 항목을 분석 중입니다...
                      </p>
                      <button type="button" disabled style={primaryButtonStyle} className="opacity-60">
                        분석 실행
                      </button>
                    </div>
                  ) : !hasRunAnalysis || !selectionMatchesAnalysis ? (
                    <div className="flex min-h-[280px] flex-col items-start justify-center gap-4 px-5 py-8 sm:px-6">
                      {hasRunAnalysis && !selectionMatchesAnalysis ? (
                        <>
                          <h2
                            className={`m-0 text-base font-bold ${
                              isDark ? 'text-slate-100' : 'text-slate-800'
                            }`}
                          >
                            분석 대상 항목이 변경되었습니다. 최신 선택 항목으로 다시 분석해 주세요.
                          </h2>
                          <p
                            className={`m-0 text-sm leading-relaxed ${
                              isDark ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            현재 선택된 {selectedCount}개 항목 기준으로 다시 분석을 실행할 수 있습니다.
                          </p>
                          <button type="button" onClick={executeAnalysis} style={primaryButtonStyle}>
                            다시 분석
                          </button>
                        </>
                      ) : (
                        <>
                          <h2
                            className={`m-0 text-base font-bold ${
                              isDark ? 'text-slate-100' : 'text-slate-800'
                            }`}
                          >
                            선택된 {selectedCount}개 지식 항목을 분석할 준비가 되었습니다.
                          </h2>
                          <p
                            className={`m-0 text-sm leading-relaxed ${
                              isDark ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            분석 실행 버튼을 눌러 선택된 항목 기반의 맞춤 분석을 시작하세요.
                          </p>
                          <button type="button" onClick={executeAnalysis} style={primaryButtonStyle}>
                            분석 실행
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
                        <strong className="text-sm">
                          선택된 {analysisCount}개 지식 항목 기반 AI 맞춤 분석 결과
                        </strong>
                        <button
                          type="button"
                          onClick={executeAnalysis}
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                        >
                          다시 분석
                        </button>
                      </div>
                      <div className="grid gap-3 p-4">
                        <div
                          className={`rounded-xl border p-3.5 ${
                            isDark
                              ? 'border-slate-700 bg-slate-900/60'
                              : 'border-slate-200 bg-slate-50/80'
                          }`}
                        >
                          <div
                            className={`mb-1.5 text-xs font-bold ${
                              isDark ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            선택 항목 요약
                          </div>
                          <p
                            className={`m-0 text-sm leading-relaxed ${
                              isDark ? 'text-slate-100' : 'text-slate-800'
                            }`}
                          >
                            문서 {analysisDocs.length}건 · 대처 이력 {analysisActions.length}건 · 총{' '}
                            {analysisCount}개 항목을 분석 참고 범위로 사용합니다.
                          </p>
                        </div>

                        <div
                          style={{
                            border: `1px solid ${uiColors.line}`,
                            borderLeft: `4px solid ${uiColors.blue}`,
                            borderRadius: 12,
                            background: uiColors.blueSoft,
                            padding: '14px 16px',
                          }}
                        >
                          <div
                            style={{
                              color: uiColors.blue,
                              fontSize: 13,
                              fontWeight: 800,
                              marginBottom: 6,
                            }}
                          >
                            주요 인사이트
                          </div>
                          <p style={{ margin: 0, color: uiColors.navy, fontSize: 14, lineHeight: 1.7 }}>
                            {analysisInsights.summaries.length > 0
                              ? analysisInsights.summaries.join(' / ')
                              : '선택된 지식 항목을 AI 분석 참고 범위로 설정했습니다.'}
                          </p>
                        </div>

                        {analysisInsights.causes.length > 0 && (
                          <div
                            style={{
                              border: `1px solid ${uiColors.line}`,
                              borderLeft: `4px solid ${uiColors.red}`,
                              borderRadius: 12,
                              background: uiColors.redSoft,
                              padding: '14px 16px',
                            }}
                          >
                            <div
                              style={{
                                color: uiColors.red,
                                fontSize: 13,
                                fontWeight: 800,
                                marginBottom: 6,
                              }}
                            >
                              공통 원인 또는 기록된 원인
                            </div>
                            <p
                              style={{ margin: 0, color: uiColors.navy, fontSize: 14, lineHeight: 1.7 }}
                            >
                              {analysisInsights.causes.join(' / ')}
                            </p>
                          </div>
                        )}

                        {analysisInsights.actionsTaken.length > 0 && (
                          <div
                            style={{
                              border: `1px solid ${uiColors.line}`,
                              borderLeft: `4px solid ${uiColors.green}`,
                              borderRadius: 12,
                              background: uiColors.greenSoft,
                              padding: '14px 16px',
                            }}
                          >
                            <div
                              style={{
                                color: uiColors.green,
                                fontSize: 13,
                                fontWeight: 800,
                                marginBottom: 6,
                              }}
                            >
                              추천 대응 조치 또는 기록된 대응 조치
                            </div>
                            <p
                              style={{ margin: 0, color: uiColors.navy, fontSize: 14, lineHeight: 1.7 }}
                            >
                              {analysisInsights.actionsTaken.join(' / ')}
                            </p>
                          </div>
                        )}

                        <div
                          className={`rounded-xl border p-3.5 ${
                            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div
                            className={`mb-2 text-xs font-bold ${
                              isDark ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            참고 지식 항목
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {analysisDocs.map((doc) => (
                              <button
                                key={doc.id}
                                type="button"
                                onClick={() => openDocumentDetail(doc)}
                                className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                                  isDark
                                    ? 'border-slate-600 bg-slate-900/60 text-slate-300 hover:bg-slate-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <span className="truncate">{doc.id}</span>
                              </button>
                            ))}
                            {analysisActions.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => openActionDetail(item)}
                                className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                                  isDark
                                    ? 'border-indigo-800/60 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50'
                                    : 'border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                }`}
                              >
                                <span className="truncate">{item.situation}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <p
              className={`mb-0 mt-4 text-center text-[11px] leading-relaxed ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              AI 분석은 등록된 과거 기록을 기반으로 한 참고 정보이며, 최종 판단은 현장 검토가
              필요합니다.
            </p>
          </section>
        )}
      </div>

      {selectedCount > 0 && activeTab === 'knowledge' && (
        <div
          className={`fixed bottom-4 left-1/2 z-[90] w-[min(920px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur ${
            isDark
              ? 'border-slate-700 bg-slate-800/95'
              : 'border-slate-200 bg-white/95'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}
              aria-live="polite"
            >
              선택한 {selectedCount}개 항목
            </span>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={runSelectedAnalysis} style={primaryButtonStyle}>
                선택한 {selectedCount}개 항목 AI 분석하기 ✨
              </button>
              <button type="button" onClick={clearSelection} style={ghostButtonStyle}>
                선택 해제
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalShell
        open={!!detailTarget}
        title="라이브러리 상세 보기"
        titleId="knowledge-detail-title"
        onClose={closeDetailModal}
        wide
      >
        {detailTarget?.kind === 'document' && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-semibold ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>
                {detailTarget.item.id}
              </span>
              {detailTarget.item.process ? (
                <CategoryBadge label={detailTarget.item.process} />
              ) : null}
              {transferredIdSet.has(detailTarget.item.id) ? (
                <span
                  className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${
                    isDark
                      ? 'border-indigo-800/60 bg-indigo-950/40 text-indigo-300'
                      : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  }`}
                >
                  이슈완료
                </span>
              ) : null}
            </div>
            <h4
              className={`m-0 text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
            >
              {detailTarget.item.title}
            </h4>
            <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {detailTarget.item.manager} · {detailTarget.item.date}
              {detailTarget.item.lot ? ` · ${detailTarget.item.lot}` : ''}
            </div>
            <p className={`m-0 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {detailTarget.item.summary}
            </p>
            <div
              className={`rounded-xl p-4 leading-relaxed whitespace-pre-wrap ${
                isDark
                  ? 'bg-slate-900/60 text-slate-100'
                  : 'bg-slate-50 text-slate-800'
              }`}
            >
              {detailTarget.item.detail}
            </div>
          </div>
        )}

        {detailTarget?.kind === 'action' && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge label={detailTarget.item.category?.trim() || '대처 이력'} />
            </div>
            <div>
              <div className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                발생 상황
              </div>
              <div
                className={`mt-1 whitespace-pre-wrap font-semibold ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                {detailTarget.item.situation}
              </div>
            </div>
            {(detailTarget.item.handoverFrom || detailTarget.item.handoverTo) ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div
                    className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    인계자
                  </div>
                  <div className={`mt-1 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                    {detailTarget.item.handoverFrom?.trim() || '-'}
                  </div>
                </div>
                <div>
                  <div
                    className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    인수자
                  </div>
                  <div className={`mt-1 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                    {detailTarget.item.handoverTo?.trim() || '-'}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {detailTarget.item.action ? (
                  <div>
                    <div
                      className={`text-xs font-semibold ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      대처 방안
                    </div>
                    <div
                      className={`mt-1 whitespace-pre-wrap ${
                        isDark ? 'text-slate-100' : 'text-slate-800'
                      }`}
                    >
                      {detailTarget.item.action}
                    </div>
                  </div>
                ) : null}
                {detailTarget.item.cause ? (
                  <div>
                    <div
                      className={`text-xs font-semibold ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      원인
                    </div>
                    <div className={`mt-1 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                      {detailTarget.item.cause}
                    </div>
                  </div>
                ) : null}
              </>
            )}
            <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {[detailTarget.item.manager, detailTarget.item.date].filter(Boolean).join(' · ')}
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
