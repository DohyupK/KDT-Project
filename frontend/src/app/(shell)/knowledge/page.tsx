'use client'

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authApi } from '@/api/authApi';
import { useUiSettings } from '@/components/layout/AppShell';
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent';
import DateInput from '@/components/DateInput';
import {
  consumeLocalKnowledgeForLlm,
} from '@/lib/completedKnowledgeTransfer';
import DocumentsBrowser from '@/components/knowledge/DocumentsBrowser';
import { issueApi, normalizeIssueRiskLevel, type HandoverHistoryItem, type PastIssueDetail, type PastIssueLot } from '@/api/issueApi';
import { knowledgeApi } from '@/api/knowledgeApi';
import { fetchDocFileBlob } from '@/api/docsApi';
import {
  IssueDetailAnalysis,
  type IssueDetailAnalysisModel,
} from '@/components/IssueDetailAnalysis';
import { usePageChat } from '@/context/PageChatContext';
import { useShellRefresh } from '@/hooks/useShellRefresh';
import { isAxiosError } from 'axios';

interface DocumentItem {
  id: string;
  date: string;
  title: string;
  lot: string;
  detail?: string;
  occurredAt?: string;
}

interface ActionHistoryItem {
  id: number;
  handoverContent: string;
  action: string;
  cause: string;
  manager: string;
  /** Display datetime: archivedAt || createdAt */
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
  date: string;
  keyword: string;
}

interface AnalysisResult {
  summary: string;
  insights: string;
  countermeasures: string;
  references: string;
}

type ViewMode = 'list' | 'analysis';

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

function mapHandoverHistoryItem(item: HandoverHistoryItem): ActionHistoryItem {
  const from = item.handoverFrom?.trim() || '';
  const dateTime = item.archivedAt?.trim() || item.createdAt?.trim() || '';
  return {
    id: item.historyId,
    handoverContent: item.handoverContent,
    action: item.action ?? '',
    cause: '',
    manager: from,
    date: dateTime,
    ...(item.category ? { category: item.category } : {}),
    ...(from ? { handoverFrom: from } : {}),
    ...(item.handoverTo?.trim() ? { handoverTo: item.handoverTo.trim() } : {}),
  };
}

/* Legacy static mock data intentionally disabled; past issues now load from the API.
  {
    id: 'DOC-2026-041',
    manager: '김현수',
    date: '2026-07-18',
    occurredAt: '2026-07-18 21:10',
    title: '소성로 2호기 온도 프로파일 최적화 결과',
    summary: '온도 상한 초과 재발 방지를 위한 구간별 설정값 조정 결과 정리',
    process: '소성',
    lot: 'LOT-CA-260718-11',
    risk: '높음',
    status: '완료',
    detail:
      '소성로 2호기의 구간별 온도 프로파일을 재설계하여 3구간 목표 온도를 748°C에서 742°C로 하향 조정했습니다. 조정 후 72시간 동안 불량률이 2.4%에서 1.7%로 감소했으며, 결정 구조 분석 결과 리튬 잔류량도 기준치 이내로 확인되었습니다. 동절기에는 승온 속도를 5% 낮추는 보정이 추가로 필요합니다.',
    anomaly: '온도와 투입량 복합 영향으로 AI 예측 불량률이 2.73%까지 상승했습니다.',
    residualLiMargin: 0.08,
    defectProbability: 78.9,
    spcMetrics: buildSpcMetrics(
      { sintering_temp: '이상', lithium_input: '이상', humidity: '주의' },
      {
        sintering_temp: [739, 743, 749, 753, 751, 747],
        lithium_input: [1.06, 1.09, 1.12, 1.15, 1.14, 1.13],
        humidity: [46, 48, 51, 53, 52, 51],
      },
    ),
  },
  {
    id: 'DOC-2026-040',
    manager: '박서연',
    date: '2026-07-15',
    occurredAt: '2026-07-15 14:20',
    title: '리튬 계량기 교정 주기 개선 보고',
    summary: '투입량 편차 원인이었던 계량기 드리프트 보정 주기 단축안',
    process: '원료 투입',
    lot: 'LOT-CA-260715-04',
    risk: '중간',
    status: '완료',
    detail:
      '리튬 계량기의 월 1회 교정 주기를 2주 1회로 단축한 결과, 투입량 표준편차가 0.021에서 0.008로 감소했습니다. 드리프트는 주로 호퍼 진동에 의한 로드셀 미세 변형에서 발생하며, 방진 패드 교체 시 교정 주기를 다시 완화할 수 있습니다.',
    anomaly: '리튬 투입 속도의 표준편차가 기준 대비 32% 증가하여 조성 불균일 가능성이 감지되었습니다.',
    residualLiMargin: 0.18,
    defectProbability: 48.6,
    spcMetrics: buildSpcMetrics(
      { lithium_input: '이상', additive_ratio: '주의' },
      {
        lithium_input: [1.06, 1.08, 1.11, 1.15, 1.14, 1.16],
        additive_ratio: [2.5, 2.6, 2.7, 2.85, 2.9, 2.92],
      },
    ),
  },
  {
    id: 'DOC-2026-039',
    manager: '이도윤',
    date: '2026-07-12',
    occurredAt: '2026-07-12 11:05',
    title: '혼합 공정 임펠러 마모 점검 이력',
    summary: '혼합 균일도 저하와 임펠러 마모의 상관관계 분석',
    process: '혼합',
    lot: 'LOT-CA-260712-08',
    risk: '낮음',
    status: '완료',
    detail:
      '임펠러 날개 끝단 마모가 1.2mm를 초과하면 혼합 균일도 지수가 급격히 저하되는 것을 확인했습니다. 마모 측정을 월 점검 항목에 추가했고, 예비품 재고 기준을 2개에서 4개로 상향했습니다.',
    anomaly: '내부 습도(Humidity)가 일시적으로 50%를 초과하였으나 즉시 정상 범위로 복구되었습니다.',
    residualLiMargin: 0.28,
    defectProbability: 18.2,
    spcMetrics: buildSpcMetrics(
      { humidity: '주의', process_time: '주의' },
      {
        humidity: [45, 47, 50, 52, 53, 53],
        process_time: [118, 122, 128, 131, 132, 133],
      },
    ),
  },
  {
    id: 'DOC-2026-038',
    manager: '최유진',
    date: '2026-07-10',
    occurredAt: '2026-07-10 18:12',
    title: '입도 분포 관리 기준 개정안',
    summary: 'D50 관리 상한 초과 사례 분석 및 분쇄 조건 표준화',
    process: '분쇄',
    lot: 'LOT-CA-260710-03',
    risk: '중간',
    status: '완료',
    detail:
      '최근 3개월간 D50 상한 접근 사례 7건을 분석한 결과, 분쇄기 회전수와 원료 수분 함량의 조합이 주요 변수였습니다. 수분 0.25% 초과 시 회전수를 3% 하향하는 조건표를 작성하여 표준 작업 지침에 반영했습니다.',
    anomaly: 'D50 측정값이 관리 상한에 근접했으나 공정 조정 후 정상 중앙값으로 회복되었습니다.',
    residualLiMargin: 0.22,
    defectProbability: 34.1,
    spcMetrics: buildSpcMetrics(
      { d50: '주의', d90: '주의' },
      {
        d50: [12.1, 12.4, 12.8, 13.1, 13.2, 13.3],
        d90: [28.2, 29.0, 30.1, 31.0, 31.4, 31.6],
      },
    ),
  },
  {
    id: 'DOC-2026-037',
    manager: '김현수',
    date: '2026-07-08',
    occurredAt: '2026-07-08 23:36',
    title: '냉각 구간 압력 이상 대응 매뉴얼',
    summary: '냉각수 압력 급상승 시 단계별 조치 절차 정리',
    process: '냉각',
    lot: 'LOT-CA-260708-12',
    risk: '높음',
    status: '완료',
    detail:
      '냉각수 압력이 2.5bar를 초과하면 1단계로 바이패스 밸브를 개방하고, 2.8bar 초과 시 라인 절환 후 열교환기 스케일 점검을 수행합니다. 7월 초 발생한 압력 급상승은 열교환기 스케일 축적이 원인이었으며, 세정 후 정상화되었습니다.',
    anomaly: '냉각수 압력이 2.7bar까지 급상승하고 배출 온도 안정화 시간이 평소보다 18분 지연되었습니다.',
    residualLiMargin: 0.09,
    defectProbability: 81.5,
    spcMetrics: buildSpcMetrics(
      { tank_pressure: '이상', process_time: '이상', sintering_temp: '주의' },
      {
        tank_pressure: [1.9, 2.1, 2.4, 2.7, 2.6, 2.65],
        process_time: [122, 128, 136, 142, 140, 138],
        sintering_temp: [741, 744, 747, 749, 748, 748],
      },
    ),
  },
  {
    id: 'DOC-2026-036',
    manager: '정민재',
    date: '2026-07-05',
    occurredAt: '2026-07-05 16:48',
    title: '표면 검사 카메라 조도 보정 기록',
    summary: '오검출률 개선을 위한 조명 세팅 변경 이력',
    process: '검사',
    lot: 'LOT-CA-260705-06',
    risk: '낮음',
    status: '완료',
    detail:
      '검사 부스 조도를 4200lux에서 4800lux로 상향하고 카메라 노출 시간을 재조정하여 표면 결함 오검출률을 3.1%에서 1.2%로 낮췄습니다. 조도 센서 값이 4500lux 아래로 내려가면 알람이 발생하도록 설정했습니다.',
    anomaly: '표면 검사 이미지 수집이 평균 1.2초 지연되었으나 검사 결과 누락은 없었습니다.',
    residualLiMargin: 0.35,
    defectProbability: 8.4,
    spcMetrics: buildSpcMetrics(),
  },
  {
    id: 'DOC-2026-035',
    manager: '한지우',
    date: '2026-07-02',
    occurredAt: '2026-07-02 09:22',
    title: '전구체 보관 습도 관리 개선 보고',
    summary: '수분 함량 변동 저감을 위한 보관 환경 기준 강화',
    process: '원료 보관',
    lot: 'LOT-CA-260702-01',
    risk: '중간',
    status: '완료',
    detail:
      '전구체 보관 창고의 상대습도 기준을 45%에서 35%로 강화하고 제습기 가동 로직을 자동화했습니다. 개선 후 입고 로트 간 수분 함량 편차가 절반 이하로 감소했습니다.',
    anomaly: '수분 함량이 0.03%p 상승하여 소성 후 잔류 리튬 증가 가능성이 확인되었습니다.',
    residualLiMargin: 0.15,
    defectProbability: 56.8,
    spcMetrics: buildSpcMetrics(
      { humidity: '이상', metal_impurity: '주의' },
      {
        humidity: [46, 50, 56, 58, 57, 58],
        metal_impurity: [0.016, 0.018, 0.021, 0.023, 0.024, 0.024],
      },
    ),
  },
  {
    id: 'DOC-2026-034',
    manager: '박서연',
    date: '2026-06-28',
    occurredAt: '2026-06-28 13:40',
    title: '소성 배가스 산소 농도 트렌드 분석',
    summary: '산소 농도와 결정성 상관 분석 및 급기 제어 개선',
    process: '소성',
    lot: 'LOT-CA-260628-09',
    risk: '중간',
    status: '완료',
    detail:
      '배가스 산소 농도가 19.2% 아래로 내려간 구간에서 결정성 저하가 관측되었습니다. 급기 팬 제어를 수동에서 PID 자동 제어로 전환하여 산소 농도 변동 폭을 ±0.5%에서 ±0.15%로 줄였습니다.',
    anomaly: '14시 이후 온도가 관리 상한 750°C를 3회 초과했으며 AI 위험 점수가 91점까지 상승했습니다.',
    residualLiMargin: 0.12,
    defectProbability: 72.4,
    spcMetrics: buildSpcMetrics(
      { sintering_temp: '이상', tank_pressure: '이상', humidity: '주의' },
      {
        sintering_temp: [738, 742, 748, 754, 752, 751],
        tank_pressure: [1.9, 2.1, 2.3, 2.6, 2.5, 2.55],
        humidity: [46, 48, 51, 53, 54, 54],
      },
    ),
  },
  {
    id: 'DOC-2026-033',
    manager: '이도윤',
    date: '2026-06-24',
    occurredAt: '2026-06-24 10:15',
    title: '설비 예지보전 진동 데이터 리뷰',
    summary: '혼합기·분쇄기 베어링 진동 스펙트럼 월간 리뷰',
    process: '설비 관리',
    lot: '-',
    risk: '낮음',
    status: '완료',
    detail:
      '분쇄기 2호기 베어링에서 외륜 결함 주파수 성분이 미세하게 증가하는 추세가 확인되었습니다. 8월 정기 보전 시 교체를 권고하며, 그 전까지 주 1회 정밀 측정을 수행합니다.',
    anomaly: '공정 파라미터는 관리 한계 내였으나 설비 진동 스펙트럼에서 외륜 결함 주파수 성분이 증가했습니다.',
    residualLiMargin: 0.3,
    defectProbability: 12.5,
    spcMetrics: buildSpcMetrics(
      { process_time: '주의' },
      {
        process_time: [118, 120, 124, 128, 130, 131],
      },
    ),
  },
];
*/

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

type ParsedAnalysis = {
  result: AnalysisResult;
  parseError?: string;
  raw: string;
};

function getAnalyzeErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as { error?: string; message?: string } | string | undefined;
    const fromBody =
      typeof data === 'string'
        ? data
        : typeof data?.error === 'string'
          ? data.error
          : typeof data?.message === 'string'
            ? data.message
            : '';
    const parts = [
      status != null ? `HTTP ${status}` : null,
      fromBody || err.message || null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' — ') : fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

function fmtLotField(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return String(value);
}

function pastIssueToAnalysisModel(item: PastIssueDetail): IssueDetailAnalysisModel {
  const fromLot = item.lot;
  const analysis = item.analysis
    ? {
        ...item.analysis,
        riskLevel: normalizeIssueRiskLevel(item.analysis.riskLevel),
      }
    : fromLot
      ? {
          lotId: fromLot.lotId,
          probability: fromLot.defectProb,
          spcStatus: fromLot.spcStatus,
          riskLevel: normalizeIssueRiskLevel(fromLot.riskLevel),
          riskReason: fromLot.riskReason,
          createdAt: null,
          scoredAt: null,
        }
      : null;
  return {
    issueId: item.issueId,
    lotId: item.lotId,
    createdAt: item.createdAt,
    issueContent: item.issueContent,
    riskLevel: normalizeIssueRiskLevel(analysis?.riskLevel),
    listSpcStatus: analysis?.spcStatus ?? fromLot?.spcStatus ?? null,
    analysis,
  };
}

const LOT_PROCESS_FIELDS: Array<{
  label: string;
  get: (lot: PastIssueLot) => string | number | null | undefined;
}> = [
  { label: 'timestamp', get: (lot) => lot.recordedAt },
  { label: 'd50', get: (lot) => lot.d50 },
  { label: 'd90', get: (lot) => lot.d90 },
  { label: 'metal_impurity', get: (lot) => lot.metalImpurity },
  { label: 'lithium_input', get: (lot) => lot.lithiumInput },
  { label: 'additive_ratio', get: (lot) => lot.additiveRatio },
  { label: 'process_time', get: (lot) => lot.processTime },
  { label: 'sintering_temp', get: (lot) => lot.sinteringTemp },
  { label: 'humidity', get: (lot) => lot.humidity },
  { label: 'tank_pressure', get: (lot) => lot.tankPressure },
  { label: 'operator_id', get: (lot) => lot.operatorId },
];

/** Knowledge library: free text is success. Optional JSON keys fill cards when present. */
function asLibraryAnalysisResult(reply: string): ParsedAnalysis {
  const raw = reply ?? '';
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      result: { summary: '', insights: '', countermeasures: '', references: '' },
      parseError: 'LLM 응답이 비어 있습니다.',
      raw,
    };
  }
  const cleaned = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const jsonCandidate = cleaned.match(/^\s*\{[\s\S]*\}\s*$/)?.[0];
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as Partial<AnalysisResult>;
      const result: AnalysisResult = {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        insights: typeof parsed.insights === 'string' ? parsed.insights : '',
        countermeasures: typeof parsed.countermeasures === 'string' ? parsed.countermeasures : '',
        references: typeof parsed.references === 'string' ? parsed.references : '',
      };
      if (result.summary || result.insights || result.countermeasures || result.references) {
        return { result, raw };
      }
    } catch {
      /* free text — ignore */
    }
  }
  return {
    result: { summary: raw, insights: '', countermeasures: '', references: '' },
    raw,
  };
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
  const pathname = usePathname();
  const router = useRouter();
  const { isDark, language } = useUiSettings();
  const { setPagePayload, trackPageChatEvent } = usePageChat();
  const uiColors = getUiColors(isDark);
  const panelStyle = getPanelStyle(uiColors);
  const inputStyle = getInputStyle(uiColors);
  const labelStyle = getLabelStyle(uiColors);
  const ghostButtonStyle = getGhostButtonStyle(uiColors);
  const cellStyle = getCellStyle(uiColors);
  const headCellStyle = getHeadCellStyle(uiColors);
  void cellStyle;
  void headCellStyle;
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [toast, setToast] = useState('');

  const [filters, setFilters] = useState<FilterState>({ date: '', keyword: '' });
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
    date: '',
    keyword: '',
  });
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const [actions, setActions] = useState<ActionHistoryItem[]>([]);
  const [actionSearch, setActionSearch] = useState('');
  const [appliedActionSearch, setAppliedActionSearch] = useState('');
  const [, setActionForm] = useState<ActionFormState>(EMPTY_ACTION_FORM);
  const [, setEditingId] = useState<number | null>(null);
  const [, setFormError] = useState('');

  const [report, setReport] = useState<ReportData>(INITIAL_REPORT);

  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [selectedActionIds, setSelectedActionIds] = useState<number[]>([]);
  const [selectedDocPaths, setSelectedDocPaths] = useState<string[]>([]);
  const [analysisDocIds, setAnalysisDocIds] = useState<string[]>([]);
  const [analysisActionIds, setAnalysisActionIds] = useState<number[]>([]);
  const [analysisDocPaths, setAnalysisDocPaths] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [llmRawReply, setLlmRawReply] = useState<string | null>(null);
  const [diagnosisReply, setDiagnosisReply] = useState('');
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState('');
  const [pastDetail, setPastDetail] = useState<PastIssueDetail | null>(null);
  const [isSelectionListExpanded, setIsSelectionListExpanded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  /** analyzing UX: reading docs vs waiting on LLM */
  const [analyzePhase, setAnalyzePhase] = useState<'idle' | 'reading' | 'llm'>('idle');
  const [hasRunAnalysis, setHasRunAnalysis] = useState(false);
  const [docPage, setDocPage] = useState(1);
  const [actionPage, setActionPage] = useState(1);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  const refreshPastIssues = async () => {
    try {
      const { data } = await issueApi.listPastIssues();
      setDocuments(
        data.items.map((item) => ({
          id: item.issueId,
          title: item.issueContent,
          lot: item.lotId,
          date: item.completedAt || item.createdAt,
          occurredAt: item.createdAt,
        })),
      );
    } catch {
      setDocuments([]);
    } finally {
      setDocPage(1);
    }
  };

  const refreshHandoverActions = async () => {
    try {
      const { data } = await issueApi.listHandoverHistory('completed');
      setActions(data.items.map(mapHandoverHistoryItem));
    } catch {
      setActions([]);
    }
  };

  useEffect(() => {
    if (allowed !== true) return
    void refreshPastIssues();
    void refreshHandoverActions();
  }, [allowed]);

  useEffect(() => {
    let cancelled = false
    void authApi
      .getSettings()
      .then(({ data }) => {
        if (cancelled) return
        if (data.settings.manage === 'O') {
          setAllowed(true)
          return
        }
        setAllowed(false)
        router.replace('/main')
      })
      .catch(() => {
        if (cancelled) return
        setAllowed(false)
        router.replace('/main')
      })
    return () => {
      cancelled = true
    }
  }, [router])

  useShellRefresh(() => {
    void refreshPastIssues();
    void refreshHandoverActions();
  });

  useEffect(() => {
    if (pathname.includes('/knowledge')) {
      void refreshPastIssues();
      void refreshHandoverActions();
    }
  }, [pathname]);

  useEffect(() => {
    if (viewMode === 'list') {
      void refreshPastIssues();
      void refreshHandoverActions();
    }
  }, [viewMode]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshPastIssues();
      void refreshHandoverActions();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  const allDocuments = documents;

  const allActions = useMemo(() => actions, [actions]);

  const libraryTotalCount = allDocuments.length + allActions.length;

  // pagePayload is set after filtered* memos below


  const filteredDocuments = useMemo(() => {
    const keyword = appliedFilters.keyword.trim().toLowerCase();
    return allDocuments.filter((doc) => {
      const docDay = (doc.occurredAt || doc.date).slice(0, 10);
      const matchesDate = !appliedFilters.date || doc.date === appliedFilters.date || docDay === appliedFilters.date;
      const matchesKeyword =
        !keyword ||
        doc.title.toLowerCase().includes(keyword) ||
        doc.lot.toLowerCase().includes(keyword) ||
        doc.id.toLowerCase().includes(keyword);
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
        item.handoverContent.toLowerCase().includes(keyword) ||
        item.action.toLowerCase().includes(keyword) ||
        item.cause.toLowerCase().includes(keyword) ||
        item.manager.toLowerCase().includes(keyword) ||
        (item.category ?? '').toLowerCase().includes(keyword) ||
        (item.handoverFrom ?? '').toLowerCase().includes(keyword) ||
        (item.handoverTo ?? '').toLowerCase().includes(keyword) ||
        item.date.includes(keyword),
    );
  }, [allActions, appliedActionSearch]);

  useEffect(() => {
    setPagePayload(
      '/knowledge',
      {
        page: 'knowledge',
        viewMode,
        visibleTables: ['pastIssues', 'handover', 'documents'],
        filters: {
          pastIssues: appliedFilters,
          handoverSearch: appliedActionSearch,
        },
        pastIssues: {
          total: allDocuments.length,
          filteredTotal: filteredDocuments.length,
          items: filteredDocuments.slice(0, 10).map((d) => ({
            id: d.id,
            title: d.title.slice(0, 160),
            lot: d.lot,
            date: d.date,
          })),
        },
        handover: {
          total: allActions.length,
          filteredTotal: filteredActions.length,
          items: filteredActions.slice(0, 10).map((a) => ({
            id: a.id,
            handoverContent: a.handoverContent.slice(0, 160),
            action: a.action.slice(0, 120),
            cause: a.cause.slice(0, 120),
            manager: a.manager,
            date: a.date,
            category: a.category,
          })),
        },
        documentsMeta: {
          selectedPaths: selectedDocPaths.slice(0, 20),
          selectedPathCount: selectedDocPaths.length,
          note: 'Document file bodies are retrieved via RAG; only path meta is sent here.',
        },
        selection: {
          pastIssueIds: selectedDocIds.slice(0, 20),
          handoverIds: selectedActionIds.slice(0, 20),
          count:
            selectedDocIds.length + selectedActionIds.length + selectedDocPaths.length,
        },
        detail: detailTarget
          ? detailTarget.kind === 'document'
            ? {
                kind: 'past-issue',
                id: detailTarget.item.id,
                title: detailTarget.item.title.slice(0, 200),
                lot: detailTarget.item.lot,
              }
            : {
                kind: 'handover',
                id: detailTarget.item.id,
                content: detailTarget.item.handoverContent.slice(0, 200),
              }
          : null,
      },
      ['handover', 'documents'],
    );
  }, [
    setPagePayload,
    viewMode,
    allDocuments.length,
    allActions.length,
    filteredDocuments,
    filteredActions,
    appliedFilters,
    appliedActionSearch,
    selectedDocPaths,
    selectedDocIds,
    selectedActionIds,
    detailTarget,
  ]);

  const validSelectedDocIds = useMemo(
    () => selectedDocIds.filter((id) => allDocuments.some((doc) => doc.id === id)),
    [selectedDocIds, allDocuments],
  );
  const validSelectedActionIds = useMemo(
    () => selectedActionIds.filter((id) => allActions.some((item) => item.id === id)),
    [selectedActionIds, allActions],
  );

  const selectedCount =
    validSelectedDocIds.length + validSelectedActionIds.length + selectedDocPaths.length;

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
    const base = selectedDocs.length + selectedActions.length;
    const files = selectedDocPaths.map((path, index) => {
      const parts = path.replace(/\\/g, '/').split('/');
      const name = parts[parts.length - 1] || path;
      return {
        kind: 'file' as const,
        path,
        name,
        order: base + index + 1,
      };
    });
    return [...docs, ...actionItems, ...files];
  }, [selectedDocs, selectedActions, selectedDocPaths]);

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
  const analysisCount = analysisDocs.length + analysisActions.length + analysisDocPaths.length;

  const selectionMatchesAnalysis = useMemo(() => {
    if (!hasRunAnalysis) return false;
    if (validSelectedDocIds.length !== analysisDocIds.length) return false;
    if (validSelectedActionIds.length !== analysisActionIds.length) return false;
    if (selectedDocPaths.length !== analysisDocPaths.length) return false;
    const docsMatch = validSelectedDocIds.every((id) => analysisDocIds.includes(id));
    const actionsMatch = validSelectedActionIds.every((id) => analysisActionIds.includes(id));
    const pathsMatch = selectedDocPaths.every((path) => analysisDocPaths.includes(path));
    return docsMatch && actionsMatch && pathsMatch;
  }, [
    hasRunAnalysis,
    validSelectedDocIds,
    validSelectedActionIds,
    analysisDocIds,
    analysisActionIds,
    selectedDocPaths,
    analysisDocPaths,
  ]);

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
    setAppliedFilters(filters);
    setAppliedActionSearch(actionSearch);
    setDocPage(1);
    setActionPage(1);
    showToast('필터가 적용되었습니다.');
  };

  const resetKnowledgeFilters = () => {
    const empty = { date: '', keyword: '' };
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
      situation: item.handoverContent,
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

  const openDocumentDetail = async (doc: DocumentItem) => {
    setSelectedDocId(doc.id);
    setDetailTarget({ kind: 'document', item: doc });
    setPastDetail(null);
    trackPageChatEvent({
      type: 'row_click',
      route: '/knowledge',
      target: 'knowledge-past-issue',
      entityId: doc.id,
      payload: {
        id: doc.id,
        title: doc.title.slice(0, 200),
        lot: doc.lot,
        date: doc.date,
      },
    });
    setDiagnosisReply('');
    setDiagnosisError('');
    setDiagnosisLoading(true);
    try {
      const { data } = await issueApi.getPastIssueById(doc.id);
      const item = data.item;
      const detailedDoc: DocumentItem = {
        id: item.issueId,
        title: item.issueContent,
        lot: item.lotId,
        date: item.completedAt || item.createdAt,
        occurredAt: item.createdAt,
        detail: item.actionContent || undefined,
      };
      setDetailTarget({ kind: 'document', item: detailedDoc });
      setPastDetail(item);
      const cached = item.libraryAnalysis?.analysisContent?.trim() || '';
      if (cached) {
        setDiagnosisReply(cached);
        return;
      }
      setDiagnosisReply('');
      try {
        const response = await knowledgeApi.analyze({ lotId: item.lotId });
        if (response.error) {
          console.error('[knowledge-diagnose] ai.error', response.error);
          setDiagnosisError(`AI error: ${response.error}`);
        }
        const reply = response.reply ?? '';
        if (!reply.trim()) {
          console.error('[knowledge-diagnose] empty reply', response);
          setDiagnosisError((prev) =>
            [prev, '이슈 완료 후 진단이 아직 없습니다. 잠시 후 다시 열어 주세요.'].filter(Boolean).join('\n'),
          );
        }
        setDiagnosisReply(reply);
      } catch (err) {
        const msg = getAnalyzeErrorMessage(err, '진단을 아직 불러오지 못했습니다.');
        console.error('[knowledge-diagnose] analyze lotId', msg, err);
        setDiagnosisError(`진단 준비 중: ${msg}`);
      }
    } catch (err) {
      const msg = getAnalyzeErrorMessage(err, '상세 이슈를 불러오지 못했습니다.');
      console.error('[knowledge-diagnose] getPastIssueById', msg, err);
      setDiagnosisError(msg);
    } finally {
      setDiagnosisLoading(false);
    }
  };

  const openActionDetail = (item: ActionHistoryItem) => {
    setPastDetail(null);
    setDetailTarget({ kind: 'action', item });
    trackPageChatEvent({
      type: 'row_click',
      route: '/knowledge',
      target: 'knowledge-handover',
      entityId: String(item.id),
      payload: {
        id: item.id,
        handoverContent: item.handoverContent.slice(0, 200),
        action: item.action.slice(0, 120),
        cause: item.cause.slice(0, 120),
        manager: item.manager,
        date: item.date,
      },
    });
  };

  const closeDetailModal = () => {
    setDetailTarget(null);
    setPastDetail(null);
    setDiagnosisReply('');
    setDiagnosisError('');
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

  useEffect(() => {
    if (selectedCount <= DEFAULT_VISIBLE_COUNT) {
      setIsSelectionListExpanded(false);
    }
  }, [selectedCount]);

  const clearSelection = () => {
    if (isAnalyzing) return;
    setIsAnalyzing(false);
    setAnalyzePhase('idle');
    setSelectedDocIds([]);
    setSelectedActionIds([]);
    setSelectedDocPaths([]);
    setAnalysisDocIds([]);
    setAnalysisActionIds([]);
    setAnalysisDocPaths([]);
    setAnalysisResult(null);
    setAnalysisError(null);
    setLlmRawReply(null);
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

  const removeFileFromSelection = (path: string) => {
    if (isAnalyzing) return;
    setSelectedDocPaths((current) => current.filter((p) => p !== path));
  };

  /** 목록 액션바: 분석 화면으로 이동 (분석은 아직 실행하지 않음) */
  const runSelectedAnalysis = () => {
    if (selectedCount === 0) return;
    setIsSelectionListExpanded(false);
    setViewMode('analysis');
  };

  const MAX_DOC_FILES = 3;
  const MAX_DOC_CHARS = 1200;

  /** AI 탭: 현재 선택 스냅샷으로 분석 실행 */
  const executeAnalysis = async () => {
    if (selectedCount === 0 || isAnalyzing) return;
    const docSnapshot = [...validSelectedDocIds];
    const actionSnapshot = [...validSelectedActionIds];
    const docPathSnapshot = [...selectedDocPaths];
    setIsAnalyzing(true);
    setAnalyzePhase('reading');
    setHasRunAnalysis(false);
    setAnalysisResult(null);
    setAnalysisError(null);
    setLlmRawReply(null);
    const warnings: string[] = [];
    try {
      const localKnowledge = consumeLocalKnowledgeForLlm();
      const selectedPastIssues = allDocuments.filter((doc) => docSnapshot.includes(doc.id));
      const selectedHandoverActions = allActions.filter((item) => actionSnapshot.includes(item.id));
      const pathsToFetch = docPathSnapshot.slice(0, MAX_DOC_FILES);
      const docSnippets = await Promise.all(
        pathsToFetch.map(async (path) => {
          try {
            const { blob, contentType } = await fetchDocFileBlob(path);
            const lower = path.toLowerCase();
            const isText =
              contentType.startsWith('text/') ||
              contentType.includes('json') ||
              contentType.includes('markdown') ||
              /\.(md|txt|csv|json)$/i.test(lower);
            if (!isText) {
              const msg = `문서 읽기 실패: ${path} — 텍스트 추출 불가 (${contentType || 'unknown type'})`;
              warnings.push(msg);
              console.error('[knowledge-analyze] doc_fetch', msg);
              return `- ${path}: (텍스트 추출 불가)`;
            }
            const text = (await blob.text()).slice(0, MAX_DOC_CHARS);
            return `- ${path}:\n${text}`;
          } catch (err) {
            const detail = getAnalyzeErrorMessage(err, '알 수 없는 오류');
            const msg = `문서 읽기 실패: ${path} — ${detail}`;
            warnings.push(msg);
            console.error('[knowledge-analyze] doc_fetch', msg, err);
            return `- ${path}: (읽기 실패: ${detail})`;
          }
        }),
      );
      if (docPathSnapshot.length > MAX_DOC_FILES) {
        docSnippets.push(`- (외 ${docPathSnapshot.length - MAX_DOC_FILES}개 문서는 속도상 생략)`);
      }
      const prompt = `선택한 지식 항목을 바탕으로 한국어로 「요약」과 「참고 사항」을 작성해 주세요.
아래에 나열된 선택 항목을 모두 언급해 주세요.

[완료 이슈]
${
  selectedPastIssues
    .map((item) => `- ${item.id} / ${item.title}${item.lot ? ` (${item.lot})` : ''}`)
    .join('\n') || '(없음)'
}

[인수인계]
${selectedHandoverActions.map((item) => `- ${item.handoverContent}`).join('\n') || '(없음)'}

[사내 문서]
${docSnippets.join('\n') || '(없음)'}

[로컬 1회 지식]
${
  localKnowledge
    .map((item) => `- ${item.title}:${(item.summary || item.detail || '').slice(0, 200)}`)
    .join('\n') || '(없음)'
}`;
      setAnalyzePhase('llm');
      let response;
      try {
        response = await knowledgeApi.analyze({ message: prompt });
      } catch (err) {
        const msg = getAnalyzeErrorMessage(err, '알 수 없는 네트워크 오류');
        console.error('[knowledge-analyze] api', msg, err);
        setAnalysisDocIds(docSnapshot);
        setAnalysisActionIds(actionSnapshot);
        setAnalysisDocPaths(docPathSnapshot);
        setAnalysisResult(null);
        setLlmRawReply(null);
        const full = [...warnings, `LLM 요청 실패: ${msg}`].join('\n');
        setAnalysisError(full);
        setHasRunAnalysis(true);
        showToast(`분석 실패: ${msg}`);
        return;
      }

      if (response.error) {
        console.error('[knowledge-analyze] ai.error', response.error);
        warnings.push(`API error: ${response.error}`);
      }

      const reply = response.reply ?? '';
      const { result, parseError, raw } = asLibraryAnalysisResult(reply);
      if (parseError) {
        console.error('[knowledge-analyze] empty', parseError);
        warnings.push(parseError);
      }

      setAnalysisDocIds(docSnapshot);
      setAnalysisActionIds(actionSnapshot);
      setAnalysisDocPaths(docPathSnapshot);
      setAnalysisResult(result);
      setLlmRawReply(raw || null);
      setAnalysisError(warnings.length > 0 ? warnings.join('\n') : null);
      setHasRunAnalysis(true);
      if (warnings.length > 0 && !raw) {
        showToast(warnings[warnings.length - 1]);
      } else {
        showToast(
          `선택한 ${docSnapshot.length + actionSnapshot.length + docPathSnapshot.length}개 항목 분석을 완료했습니다.`,
        );
      }
    } catch (err) {
      const msg = getAnalyzeErrorMessage(err, '알 수 없는 오류');
      console.error('[knowledge-analyze] unexpected', msg, err);
      setAnalysisDocIds(docSnapshot);
      setAnalysisActionIds(actionSnapshot);
      setAnalysisDocPaths(docPathSnapshot);
      setAnalysisError([...warnings, msg].join('\n'));
      setHasRunAnalysis(true);
      showToast(`분석 실패: ${msg}`);
    } finally {
      setIsAnalyzing(false);
      setAnalyzePhase('idle');
    }
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

  // 기존 핸들러 참조 유지 (트리셰이킹/린트 대비)
  void handleFormChange;
  void startEdit;
  void cancelEdit;
  void handleActionSubmit;
  void handleDelete;

  if (allowed !== true) {
    return null;
  }

  return (
    <div
      className={
        isDark
          ? 'h-full overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800'
          : 'h-full overflow-y-auto bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50'
      }
      style={{
        boxSizing: 'border-box',
        color: uiColors.navy,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif",
      }}
    >
      <div
        className={`${SHELL_CONTENT_CLASS} py-6 pb-14`}
        style={{ paddingBottom: selectedCount > 0 ? 88 : undefined }}
      >
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

        {viewMode === 'list' && (
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
                <DateInput
                  id="doc-date"
                  value={filters.date}
                  onChange={(date) =>
                    setFilters((current) => ({ ...current, date }))
                  }
                  isDark={isDark}
                  style={inputStyle}
                  aria-label="날짜"
                />
              </div>
              <div className="min-w-[180px] flex-[1.4]">
                <label htmlFor="doc-keyword" style={labelStyle}>
                  과거 이슈 검색
                </label>
                <input
                  id="doc-keyword"
                  value={filters.keyword}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, keyword: event.target.value }))
                  }
                  placeholder="이슈 ID, 제목, LOT 검색"
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
                  placeholder="인수인계 내용 검색"
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
                  <table className="w-full min-w-[960px] border-collapse text-left">
                    <thead>
                      <tr
                        className={`border-y text-xs font-semibold ${
                          isDark
                            ? 'border-slate-700 bg-slate-900/70 text-slate-400'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                        }`}
                      >
                        <th className="w-12 px-4 py-2.5">
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
                        <th className="whitespace-nowrap px-4 py-2.5 font-semibold">이슈 ID</th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-semibold">일시</th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-semibold">관련 LOT</th>
                        <th className="min-w-[280px] px-4 py-2.5 font-semibold">이슈 내용</th>
                        <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">진단</th>
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
                              className={`cursor-pointer border-b border-l-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40 ${
                                isDark
                                  ? `border-slate-700 hover:bg-slate-700/40 ${
                                      checked
                                        ? 'border-l-blue-500 bg-blue-950/30'
                                        : 'border-l-transparent bg-slate-800'
                                    }`
                                  : `border-slate-100 hover:bg-slate-50/80 ${
                                      checked
                                        ? 'border-l-blue-600 bg-blue-50/60'
                                        : 'border-l-transparent bg-white'
                                    }`
                              }`}
                            >
                              <td
                                className="w-12 px-4 py-3"
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
                              <td className="whitespace-nowrap px-4 py-3">
                                <button
                                  type="button"
                                  className={`cursor-pointer font-semibold hover:underline ${
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
                              <td
                                className={`whitespace-nowrap px-4 py-3 text-xs ${
                                  isDark ? 'text-slate-400' : 'text-slate-500'
                                }`}
                              >
                                {doc.occurredAt || doc.date}
                              </td>
                              <td
                                className={`whitespace-nowrap px-4 py-3 text-xs font-semibold ${
                                  isDark ? 'text-slate-200' : 'text-slate-800'
                                }`}
                              >
                                {doc.lot || '-'}
                              </td>
                              <td
                                className={`max-w-[420px] px-4 py-3 text-sm font-semibold ${
                                  isDark ? 'text-slate-100' : 'text-slate-900'
                                }`}
                              >
                                <span className="line-clamp-2" title={doc.title}>
                                  {doc.title}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right">
                                <button
                                  type="button"
                                  className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                    isDark
                                      ? 'border-blue-700 bg-blue-950/40 text-blue-300 hover:bg-blue-900/60'
                                      : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  }`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openDocumentDetail(doc);
                                  }}
                                >
                                  상세 보기
                                </button>
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
                        <th className="w-[148px] whitespace-nowrap px-3 py-3">날짜</th>
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
                                  aria-label={`${item.handoverContent} 선택`}
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
                                title={item.handoverContent}
                              >
                                <div className="line-clamp-2">{item.handoverContent}</div>
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
                                className={`w-[148px] whitespace-nowrap px-3 py-3.5 text-sm ${
                                  isDark ? 'text-slate-400' : 'text-slate-600'
                                }`}
                              >
                                {item.date || '-'}
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

              {/* 사내 문서 (Documents/ READ-ONLY) */}
              <DocumentsBrowser
                selectedPaths={selectedDocPaths}
                onSelectedPathsChange={(paths) => {
                  setSelectedDocPaths(paths);
                  trackPageChatEvent({
                    type: 'row_select',
                    route: '/knowledge',
                    target: 'knowledge-docs-paths',
                    payload: {
                      paths: paths.slice(0, 20),
                      count: paths.length,
                    },
                  });
                }}
              />
            </div>
          </section>
        )}

        {viewMode === 'analysis' && (
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
                  라이브러리 목록에서 원하는 항목을 체크한 후 AI 분석을 실행하세요.
                </p>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
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
                                <span className="text-[11px] text-slate-400">{doc.lot || '-'}</span>
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
                      if (entry.kind === 'file') {
                        return (
                          <div
                            key={`file-${entry.path}`}
                            className={`flex gap-2 rounded-lg border p-3 ${
                              isDark
                                ? 'border-slate-700 bg-slate-800'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div className="min-w-0 flex-1 text-left">
                              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-900 px-1.5 text-[10px] font-bold text-white">
                                  {entry.order}
                                </span>
                                <CategoryBadge label="사내 문서" />
                              </div>
                              <div
                                className={`line-clamp-2 text-sm font-semibold ${
                                  isDark ? 'text-slate-100' : 'text-slate-900'
                                }`}
                                title={entry.path}
                              >
                                {entry.name}
                              </div>
                              <div
                                className={`mt-1 truncate text-[11px] ${
                                  isDark ? 'text-slate-500' : 'text-slate-400'
                                }`}
                                title={entry.path}
                              >
                                {entry.path}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isAnalyzing}
                              aria-label={`${entry.name} 분석 대상에서 제외`}
                              onClick={() => removeFileFromSelection(entry.path)}
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
                              {item.handoverContent}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400">{item.date}</div>
                          </button>
                          <button
                            type="button"
                            disabled={isAnalyzing}
                            aria-label={`${item.handoverContent} 분석 대상에서 제외`}
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
                        {analyzePhase === 'reading'
                          ? '문서 읽는 중…'
                          : analyzePhase === 'llm'
                            ? 'LLM 요청 중…'
                            : 'AI가 선택된 지식 항목을 분석 중입니다...'}
                      </p>
                      <p
                        className={`m-0 text-xs ${
                          isDark ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        문서 본문은 최대 {MAX_DOC_FILES}개·각 {MAX_DOC_CHARS}자로 제한해 전송합니다.
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
                        {analysisError ? (
                          <div
                            role="alert"
                            className={`whitespace-pre-wrap rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${
                              isDark
                                ? 'border-rose-800/70 bg-rose-950/40 text-rose-200'
                                : 'border-rose-200 bg-rose-50 text-rose-800'
                            }`}
                          >
                            <div className="mb-1 text-xs font-bold">분석 경고 / 실패 사유</div>
                            {analysisError}
                          </div>
                        ) : null}

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
                            완료 이슈 {analysisDocs.length}건 · 대처 이력 {analysisActions.length}건 · 사내 문서 {analysisDocPaths.length}건 · 총{' '}
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
                            요약
                          </div>
                          <p style={{ margin: 0, color: uiColors.navy, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                            {analysisResult?.summary ||
                              (analysisError
                                ? '요약 카드를 만들지 못했습니다. 아래 실패 사유와 LLM 원문을 확인하세요.'
                                : '분석 결과를 불러오지 못했습니다.')}
                          </p>
                        </div>

                        {analysisResult?.insights && (
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
                              주요 인사이트
                            </div>
                            <p
                              style={{ margin: 0, color: uiColors.navy, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}
                            >
                              {analysisResult.insights}
                            </p>
                          </div>
                        )}

                        {analysisResult?.countermeasures && (
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
                              권장 대응 조치
                            </div>
                            <p
                              style={{ margin: 0, color: uiColors.navy, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}
                            >
                              {analysisResult.countermeasures}
                            </p>
                          </div>
                        )}

                        {llmRawReply ? (
                          <div
                            className={`rounded-xl border p-3.5 ${
                              isDark
                                ? 'border-slate-600 bg-slate-900/80'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            <div
                              className={`mb-1.5 text-xs font-bold ${
                                isDark ? 'text-slate-300' : 'text-slate-600'
                              }`}
                            >
                              LLM 원문
                            </div>
                            <pre
                              className={`m-0 max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed ${
                                isDark ? 'text-slate-200' : 'text-slate-800'
                              }`}
                            >
                              {llmRawReply}
                            </pre>
                          </div>
                        ) : null}

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
                          {analysisResult?.references ? (
                            <p className={`mb-2 whitespace-pre-wrap text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              {analysisResult.references}
                            </p>
                          ) : null}
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
                                <span className="truncate">{item.handoverContent}</span>
                              </button>
                            ))}
                            {analysisDocPaths.map((path) => {
                              const parts = path.replace(/\\/g, '/').split('/');
                              const name = parts[parts.length - 1] || path;
                              return (
                                <span
                                  key={path}
                                  title={path}
                                  className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                                    isDark
                                      ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
                                      : 'border-emerald-100 bg-emerald-50 text-emerald-800'
                                  }`}
                                >
                                  <span className="truncate">{name}</span>
                                </span>
                              );
                            })}
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

      {selectedCount > 0 && viewMode === 'list' && (
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
            <IssueDetailAnalysis
              issue={pastDetail ? pastIssueToAnalysisModel(pastDetail) : null}
              emptyMessage="과거 자료 상세를 불러오는 중입니다."
            />
            <div
              className={`rounded-xl p-4 leading-relaxed whitespace-pre-wrap ${
                isDark
                  ? 'bg-slate-900/60 text-slate-100'
                  : 'bg-slate-50 text-slate-800'
              }`}
            >
              <div
                className={`mb-2 text-xs font-semibold ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                조치 내용
              </div>
              {detailTarget.item.detail || '등록된 상세 조치 내용이 없습니다.'}
            </div>
            <div
              className={`overflow-hidden rounded-xl border ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}
            >
              <div
                className={`border-b px-4 py-2.5 text-sm font-semibold ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/70 text-slate-200'
                    : 'border-slate-200 bg-slate-50 text-slate-800'
                }`}
              >
                LOTS 공정 데이터
              </div>
              {pastDetail?.lot ? (
                <dl className="m-0">
                  {LOT_PROCESS_FIELDS.map((row, index) => {
                    const lot = pastDetail.lot
                    if (!lot) return null
                    return (
                    <div
                      key={row.label}
                      className={`grid grid-cols-1 gap-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-3 ${
                        index > 0
                          ? isDark
                            ? 'border-t border-slate-700'
                            : 'border-t border-slate-200'
                          : ''
                      }`}
                    >
                      <dt
                        className={`font-mono text-xs font-semibold ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {row.label}
                      </dt>
                      <dd
                        className={`m-0 break-words ${
                          isDark ? 'text-slate-100' : 'text-slate-900'
                        }`}
                      >
                        {fmtLotField(row.get(lot))}
                      </dd>
                    </div>
                    )
                  })}
                </dl>
              ) : (
                <p
                  className={`m-0 px-4 py-6 text-center text-sm ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  LOT 공정 행이 없습니다.
                </p>
              )}
            </div>
            <div
              className={`border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}
            >
              <h5
                className={`mb-3 mt-0 text-sm font-bold ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                AI 유사 이슈·대안 조치 진단
              </h5>
              {diagnosisLoading ? (
                <p className={`m-0 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  진단 준비 중입니다...
                </p>
              ) : (
                <>
                  {diagnosisError ? (
                    <p className="m-0 mb-2 whitespace-pre-wrap text-sm text-red-500">
                      {diagnosisError}
                    </p>
                  ) : null}
                  <p
                    className={`m-0 whitespace-pre-wrap text-sm leading-relaxed ${
                      isDark ? 'text-slate-200' : 'text-slate-700'
                    }`}
                  >
                    {diagnosisReply ||
                      (diagnosisError
                        ? '진단 원문이 없습니다.'
                        : '진단 준비 중입니다. 이슈 완료 직후 백그라운드로 저장됩니다.')}
                  </p>
                </>
              )}
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
                {detailTarget.item.handoverContent}
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
