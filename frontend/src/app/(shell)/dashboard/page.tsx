'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useUiSettings } from '@/components/layout/AppShell'
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent'
import { dashboardApi, type DashboardLotRiskItem } from '@/api/dashboardApi'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type DefectType = '기계 결함' | '원자재 불량' | '작업자 실수' | '온도 이상';

type DefectBreakdown = Record<DefectType, number>;

type ProductionRecord = {
  date: string;
  production: number;
  defectCount: number;
  targetProduction: number;
  defects: DefectBreakdown;
};

type ToastState = {
  id: number;
  message: string;
  variant: 'success' | 'error' | 'info';
};

type DailyAggregate = {
  date: string;
  production: number;
  defectCount: number;
  targetProduction: number;
};

type ProductionDailyRow = {
  date: string;
  production: number;
  goodCount: number;
  defectCount: number;
  defectRate: number | null;
  metalImpurity: number | null;
  tempDevFrom800: number | null;
  humidity: number | null;
  tempXHumidity: number | null;
  dataStatus: string;
};

type SpcMetric = {
  key: string;
  label: string;
  status: string;
  currentValue: number;
  centerLine: number;
  upperControlLimit: number;
  lowerControlLimit: number;
  data: Array<{ timestamp: string; value: number }>;
};

type LotRiskApiDetail = {
  lotId: string;
  recordedAt: string;
  defectProb: number | null;
  residualLithium: number | null;
  residualMargin: number | null;
  residualUsl: number;
  spcStatus: string | null;
  riskLevel: '심각' | '주의' | '안정';
  riskReason: string | null;
  actionContent: string | null;
  spc?: { metrics?: SpcMetric[] };
};

type KpiSummary = {
  totalProduction: number;
  avgDefectRate: number | null;
  peakDate: string | null;
  peakProduction: number;
  targetAchievementRate: number | null;
};

type CathodeLot = {
  date: string;
  capacity: number;
  qualityDefect: 0 | 1;
  metalImpurity: number;
  sinteringTemp: number;
};

type KpiBadgeTone = 'ok' | 'warn';

type DetailedKpi = {
  key: string;
  label: string;
  value: string;
  unit: string;
  sub: string;
  badge?: { label: string; tone: KpiBadgeTone };
};

type DefectAnalysis = {
  dailyRates: Array<{ date: string; rate: number | null }>;
  typeTotals: DefectBreakdown;
  typeTotalSum: number;
  previousPeriodLabel: string | null;
  currentDefectRate: number | null;
  previousDefectRate: number | null;
  changeRatePercent: number | null;
  improvementEffect: string;
  topDecreaseFactor: string;
  maxDefectType: string;
  hasComparison: boolean;
};

/* -------------------------------------------------------------------------- */
/* Constants & Mock Data                                                      */
/* -------------------------------------------------------------------------- */

const DEFECT_TYPES: DefectType[] = ['기계 결함', '원자재 불량', '작업자 실수', '온도 이상'];

const CHART_COLORS = ['#2563eb', '#0d9488', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

type FeatureImportanceItem = {
  label: string;
  sub?: string;
  importance: number;
};

/** 데모용 Feature Importance — 기간 LOT가 없을 때 fallback */
const FEATURE_IMPORTANCE_MOCK: FeatureImportanceItem[] = [
  { label: '소성 온도 이탈', importance: 0.32 },
  { label: '리튬 투입비 편차', sub: 'Lithium Input', importance: 0.24 },
  { label: '전구체 입도 이상', sub: 'd50, d90', importance: 0.18 },
  { label: '금속 불순물 증가', importance: 0.14 },
];

/**
 * 전체 LOT로 Feature Importance를 추정 (화면 데모용).
 * - 소성 온도·금속 불순물: 실측 필드 편차
 * - 리튬 투입비·입도: CathodeLot에 필드가 없어 capacity 편차·날짜 시드로 대리 추정
 */
function computeFeatureImportanceFromLots(lots: CathodeLot[]): FeatureImportanceItem[] | null {
  if (lots.length === 0) return null;

  let tempScore = 0;
  let metalScore = 0;
  let lithiumScore = 0;
  let particleScore = 0;

  for (const lot of lots) {
    const w = lot.qualityDefect === 1 ? 2.4 : 1;
    const tempDev = Math.abs(lot.sinteringTemp - 800);
    const metalDev = Math.max(0, lot.metalImpurity - 0.024);
    const capacityDev = Math.abs(lot.capacity - 200);
    const daySeed =
      lot.date.split('-').reduce((acc, part) => acc + (Number(part) || 0), 0) % 11;

    tempScore += (tempDev / 12) * w;
    metalScore += (metalDev / 0.008) * w;
    // 조성(리튬) 대리: 용량 편차 + 불량 LOT 가중
    lithiumScore += (capacityDev / 8) * w * (lot.qualityDefect === 1 ? 1.15 : 0.7);
    // 입도 대리: 불순물·용량·일자 시드 조합
    particleScore += ((metalDev / 0.01 + capacityDev / 14 + daySeed * 0.08) / 2.2) * w;
  }

  const raw = [
    { label: '소성 온도 이탈', importance: tempScore },
    { label: '리튬 투입비 편차', sub: 'Lithium Input', importance: lithiumScore },
    { label: '전구체 입도 이상', sub: 'd50, d90', importance: particleScore },
    { label: '금속 불순물 증가', importance: metalScore },
  ];
  const sum = raw.reduce((acc, item) => acc + item.importance, 0);
  if (sum <= 0) return null;

  // 합계를 Mock과 비슷한 0.88 스케일로 정규화
  const targetSum = 0.88;
  return raw.map((item) => ({
    ...item,
    importance: Math.round((item.importance / sum) * targetSum * 1000) / 1000,
  }));
}

/**
 * Feature Importance 해석기.
 * - remote가 있으면 API/기간 추정 결과 사용
 * - 없으면 Mock 유지 (화면 데모용)
 */
function resolveFeatureImportance(
  remote?: FeatureImportanceItem[] | null,
): FeatureImportanceItem[] {
  const src =
    remote && remote.length > 0 ? remote : FEATURE_IMPORTANCE_MOCK;
  return [...src].sort((a, b) => b.importance - a.importance);
}

type PageSizeOption = 10 | 20 | 30 | 50;

const PAGE_SIZE_OPTIONS: Array<{ value: PageSizeOption; label: string }> = [
  { value: 10, label: '10개' },
  { value: 20, label: '20개' },
  { value: 30, label: '30개' },
  { value: 50, label: '50개' },
];

type DailyDetailRow = {
  date: string;
  totalProduction: number;
  goodCount: number;
  defectCount: number;
  defectRate: number;
  metalImpurity?: number | null;
  tempDevFrom800?: number | null;
  humidity?: number | null;
  tempXHumidity?: number | null;
  avgCapacity?: number;
  avgMetalImpurity?: number;
  avgSinteringTemp?: number;
  status: string;
};

type LiveConnectionStatus = 'connected' | 'updating' | 'error';

const LIVE_POLL_INTERVAL_MS = 30_000;


/* -------------------------------------------------------------------------- */
/* LOT 위험등급 — 독립 Mock UI (기존 생산 데이터와 분리)                        */
/* -------------------------------------------------------------------------- */

type LotRiskRow = {
  lot: string;
  prob: number;
  predLi: number | string | null;
  margin: number | null;
  spc: string;
  grade: string;
  action: string;
  reason?: string | null;
  isCritical: boolean;
};


type LotRiskFilterState = {
  lotQuery: string;
  grade: 'all' | '심각' | '주의';
  spc: 'all' | '안정' | '주의' | '이탈';
  probLevel: 'all' | 'high' | 'mid' | 'low';
  marginLevel: 'all' | 'low' | 'caution' | 'sufficient';
};

const EMPTY_LOT_RISK_FILTER: LotRiskFilterState = {
  lotQuery: '',
  grade: 'all',
  spc: 'all',
  probLevel: 'all',
  marginLevel: 'all',
};

/** LOT 위험등급 목록 페이지당 행 수 */
const LOT_RISK_PAGE_SIZE = 5;

function isLotRiskFilterActive(filter: LotRiskFilterState): boolean {
  return (
    filter.lotQuery.trim() !== '' ||
    filter.grade !== 'all' ||
    filter.spc !== 'all' ||
    filter.probLevel !== 'all' ||
    filter.marginLevel !== 'all'
  );
}

/** Mock 분석 데이터 — 기존 생산 LOT/KPI와 합치지 않음 */
const LOT_RISK_MOCK: LotRiskRow[] = [
  {
    lot: '...0823-00317',
    prob: 0.87,
    predLi: '3,915',
    margin: 85,
    spc: '이탈',
    grade: '높음',
    action: '전수검사 + 소성로 점검',
    isCritical: true,
  },
  {
    lot: '...0823-00312',
    prob: 0.46,
    predLi: '3,610',
    margin: 390,
    spc: '정상',
    grade: '중간',
    action: '샘플링 2배 강화',
    isCritical: false,
  },
  {
    lot: '...0823-00309',
    prob: 0.18,
    predLi: '3,780',
    margin: 220,
    spc: '정상',
    grade: '중간',
    action: '샘플링 2배 강화 — 합격인데 위험',
    isCritical: false,
  },
  {
    lot: '...0823-00305',
    prob: 0.12,
    predLi: '3,540',
    margin: 460,
    spc: '정상',
    grade: '낮음',
    action: '표준 샘플링',
    isCritical: false,
  },
  {
    lot: '...0823-00302',
    prob: 0.08,
    predLi: '3,480',
    margin: 520,
    spc: '정상',
    grade: '낮음',
    action: '표준 샘플링',
    isCritical: false,
  },
  {
    lot: '...0823-00298',
    prob: 0.05,
    predLi: '3,420',
    margin: 580,
    spc: '정상',
    grade: '낮음',
    action: '표준 샘플링',
    isCritical: false,
  },
  {
    lot: '...0823-00291',
    prob: 0.72,
    predLi: '3,880',
    margin: 120,
    spc: '이탈',
    grade: '높음',
    action: '전수검사 + 혼합기 점검',
    isCritical: true,
  },
  {
    lot: '...0823-00285',
    prob: 0.55,
    predLi: '3,820',
    margin: 180,
    spc: '이탈',
    grade: '높음',
    action: '전수검사',
    isCritical: true,
  },
  {
    lot: '...0823-00280',
    prob: 0.38,
    predLi: '3,700',
    margin: 300,
    spc: '정상',
    grade: '중간',
    action: '샘플링 2배 강화',
    isCritical: false,
  },
  {
    lot: '...0823-00274',
    prob: 0.29,
    predLi: '3,650',
    margin: 350,
    spc: '정상',
    grade: '중간',
    action: '샘플링 2배 강화',
    isCritical: false,
  },
  {
    lot: '...0823-00268',
    prob: 0.22,
    predLi: '3,600',
    margin: 400,
    spc: '정상',
    grade: '중간',
    action: '샘플링 강화',
    isCritical: false,
  },
  {
    lot: '...0823-00261',
    prob: 0.16,
    predLi: '3,560',
    margin: 440,
    spc: '정상',
    grade: '중간',
    action: '샘플링 강화',
    isCritical: false,
  },
  {
    lot: '...0823-00255',
    prob: 0.11,
    predLi: '3,500',
    margin: 500,
    spc: '정상',
    grade: '낮음',
    action: '표준 샘플링',
    isCritical: false,
  },
  {
    lot: '...0823-00249',
    prob: 0.09,
    predLi: '3,470',
    margin: 530,
    spc: '정상',
    grade: '낮음',
    action: '표준 샘플링',
    isCritical: false,
  },
  {
    lot: '...0823-00242',
    prob: 0.07,
    predLi: '3,450',
    margin: 550,
    spc: '정상',
    grade: '낮음',
    action: '표준 샘플링',
    isCritical: false,
  },
  {
    lot: '...0823-00236',
    prob: 0.06,
    predLi: '3,430',
    margin: 570,
    spc: '정상',
    grade: '낮음',
    action: '표준 샘플링',
    isCritical: false,
  },
  {
    lot: '...0823-00230',
    prob: 0.04,
    predLi: '3,400',
    margin: 600,
    spc: '정상',
    grade: '낮음',
    action: '표준 샘플링',
    isCritical: false,
  },
  {
    lot: '...0823-00224',
    prob: 0.03,
    predLi: '3,380',
    margin: 620,
    spc: '정상',
    grade: '낮음',
    action: '표준 샘플링',
    isCritical: false,
  },
  {
    lot: '...0823-00218',
    prob: 0.02,
    predLi: '3,360',
    margin: 640,
    spc: '정상',
    grade: '낮음',
    action: '표준 샘플링',
    isCritical: false,
  },
];

const LOT_RISK_ACTION_KEYWORDS = ['전수검사', '소성로 점검', '샘플링 2배 강화', '2배 강화', '합격인데 위험', '표준 샘플링'] as const;

type LotRiskFactor = { label: string; impact: number; note?: string };
type LotRiskProcessSignal = {
  name: string;
  value: string;
  status: 'ok' | 'warn' | 'danger';
};
type LotRiskDetail = {
  lot: string;
  summary: string;
  processSignals: LotRiskProcessSignal[];
  riskFactors: LotRiskFactor[];
  analysisSteps: string[];
  recommendedActions: string[];
};

/** LOT별 상세 분석 Mock — 없으면 buildLotRiskDetail 로 생성 */
const LOT_RISK_DETAIL_MOCK: Record<string, Partial<LotRiskDetail>> = {
  '...0823-00317': {
    summary: '불량확률 87% · SPC 이탈 · 여유 85ppm → 등급 높음. 전수검사·소성로 점검.',
    processSignals: [
      { name: '소성 온도(3구역)', value: '812 ℃', status: 'danger' },
      { name: '금속 불순물', value: '0.041', status: 'danger' },
      { name: '리튬 투입비', value: '1.08', status: 'warn' },
      { name: '습도', value: '42 %', status: 'ok' },
    ],
    riskFactors: [
      { label: '소성 온도 이탈', impact: 0.42, note: '3구역 UCL 초과' },
      { label: '금속 불순물 증가', impact: 0.31, note: '기준선 대비 +38%' },
      { label: '리튬 투입비 편차', impact: 0.18 },
      { label: '전구체 입도', impact: 0.09 },
    ],
    analysisSteps: [
      '3단계: 불량확률 0.87 (≥0.50) → 위험도 높음',
      '4단계: SPC 이탈 + 잔류Li 여유 85ppm (<100) → 등급 높음',
      '5단계: 전수검사 + 소성로 점검 권고',
    ],
    recommendedActions: [
      '전수검사 즉시 실시',
      '소성로 온도 점검',
    ],
  },
  '...0823-00312': {
    summary: '불량확률 46% · SPC 정상 · 잔류Li 근접 → 등급 중간. 샘플링 2배 강화.',
    processSignals: [
      { name: '소성 온도(3구역)', value: '798 ℃', status: 'warn' },
      { name: '금속 불순물', value: '0.028', status: 'warn' },
      { name: '리튬 투입비', value: '1.04', status: 'ok' },
      { name: '습도', value: '39 %', status: 'ok' },
    ],
    riskFactors: [
      { label: '소성 온도 편차', impact: 0.34 },
      { label: '금속 불순물', impact: 0.28 },
      { label: '리튬 투입비', impact: 0.22 },
      { label: '공정시간', impact: 0.16 },
    ],
  },
  '...0823-00309': {
    summary: '불량확률 18% · 합격 가능하나 등급 중간. 샘플링 강화 권고.',
    riskFactors: [
      { label: '잔류Li 여유 축소', impact: 0.36, note: '여유 220ppm' },
      { label: '리튬 투입비 편차', impact: 0.27 },
      { label: '전구체 입도', impact: 0.21 },
      { label: '습도 변동', impact: 0.16 },
    ],
  },
};

function buildLotRiskDetail(row: LotRiskRow): LotRiskDetail {
  const override = LOT_RISK_DETAIL_MOCK[row.lot] ?? {};
  const defaultSummary =
    row.grade === '높음'
      ? `불량 ${(row.prob * 100).toFixed(0)}% · SPC ${row.spc} · 여유 ${row.margin}ppm → 등급 높음. 즉시 조치.`
      : row.grade === '중간'
        ? `불량 ${(row.prob * 100).toFixed(0)}% · 여유 ${row.margin}ppm → 등급 중간. 검사 강화.`
        : `불량 ${(row.prob * 100).toFixed(0)}% · 여유 ${row.margin}ppm → 등급 낮음. 표준 모니터링.`;
  const defaultSignals: LotRiskProcessSignal[] =
    row.grade === '높음'
      ? [
          { name: '소성 온도(3구역)', value: '810 ℃', status: 'danger' },
          { name: '금속 불순물', value: '0.038', status: 'danger' },
          { name: '리튬 투입비', value: '1.06', status: 'warn' },
          { name: '습도', value: '41 %', status: 'ok' },
        ]
      : row.grade === '중간'
        ? [
            { name: '소성 온도(3구역)', value: '795 ℃', status: 'warn' },
            { name: '금속 불순물', value: '0.026', status: 'warn' },
            { name: '리튬 투입비', value: '1.03', status: 'ok' },
            { name: '습도', value: '38 %', status: 'ok' },
          ]
        : [
            { name: '소성 온도(3구역)', value: '788 ℃', status: 'ok' },
            { name: '금속 불순물', value: '0.021', status: 'ok' },
            { name: '리튬 투입비', value: '1.01', status: 'ok' },
            { name: '습도', value: '37 %', status: 'ok' },
          ];
  const defaultFactors: LotRiskFactor[] =
    row.grade === '높음'
      ? [
          { label: '소성 온도 이탈', impact: 0.4 },
          { label: '금속 불순물', impact: 0.3 },
          { label: '리튬 투입비', impact: 0.18 },
          { label: '전구체 입도', impact: 0.12 },
        ]
      : row.grade === '중간'
        ? [
            { label: '잔류Li 여유 축소', impact: 0.34 },
            { label: '소성 온도 편차', impact: 0.28 },
            { label: '리튬 투입비', impact: 0.22 },
            { label: '공정시간', impact: 0.16 },
          ]
        : [
            { label: '공정 변동(경미)', impact: 0.28 },
            { label: '리튬 투입비', impact: 0.26 },
            { label: '습도', impact: 0.24 },
            { label: '전구체 입도', impact: 0.22 },
          ];
  const defaultSteps =
    row.grade === '높음'
      ? [
          `3단계: 불량확률 ${row.prob.toFixed(2)} (≥0.50) → 위험도 높음`,
          `4단계: SPC ${row.spc} + 잔류Li 여유 ${row.margin}ppm → 등급 높음`,
          '5단계: 전수검사 및 공정 점검 권고',
        ]
      : row.grade === '중간'
        ? [
            `3단계: 불량확률 ${row.prob.toFixed(2)} (0.15~0.50) → 주의`,
            `4단계: SPC ${row.spc} + 잔류Li 여유 ${row.margin}ppm → 등급 중간`,
            '5단계: 샘플링 강화 권고',
          ]
        : [
            `3단계: 불량확률 ${row.prob.toFixed(2)} (<0.15) → 낮음`,
            `4단계: SPC ${row.spc} + 잔류Li 여유 ${row.margin}ppm → 등급 낮음`,
            '5단계: 표준 모니터링 유지',
          ];

  return {
    lot: row.lot,
    summary: override.summary?.trim() || defaultSummary,
    processSignals: override.processSignals?.length ? override.processSignals : defaultSignals,
    riskFactors: override.riskFactors?.length ? override.riskFactors : defaultFactors,
    analysisSteps: override.analysisSteps?.length ? override.analysisSteps : defaultSteps,
    recommendedActions: override.recommendedActions?.length
      ? override.recommendedActions
      : row.action
          .split(/[+,—–-]/)
          .map((s) => s.trim())
          .filter(Boolean),
  };
}

function lotRiskSignalTone(status: LotRiskProcessSignal['status'], isDark: boolean): string {
  if (status === 'danger') return isDark ? 'text-red-400' : 'text-red-600';
  if (status === 'warn') return isDark ? 'text-amber-400' : 'text-amber-600';
  return isDark ? 'text-emerald-400' : 'text-emerald-700';
}


function lotRiskMarginClass(margin: number | null, isDark: boolean): string {
  if (margin == null) return isDark ? 'text-slate-400' : 'text-slate-500';
  if (margin < 100) return 'text-red-600';
  if (margin < 300) return 'text-orange-500';
  return isDark ? 'text-slate-100' : 'text-gray-900';
}

function formatSpecDistance(margin: number | null, includeUnit = false): string {
  if (margin == null) return '-';
  const amount = formatNumber(Math.round(Math.abs(margin)));
  const unit = includeUnit ? ' ppm' : '';
  return `${amount}${unit} ${margin < 0 ? '초과' : '이내'}`;
}

function lotRiskProbPercent(prob: number): number {
  const pct = prob * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

function renderLotRiskAction(action: string): ReactNode {
  const escaped = LOT_RISK_ACTION_KEYWORDS.map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('|');
  const pattern = new RegExp('(' + escaped + ')', 'g');
  const parts = action.split(pattern);
  return parts.map((part, i) => {
    if ((LOT_RISK_ACTION_KEYWORDS as readonly string[]).includes(part)) {
      return (
        <strong
          key={part + '-' + i}
          className="font-semibold text-blue-600"
        >
          {part}
        </strong>
      );
    }
    return <span key={'t-' + i}>{part}</span>;
  });
}






function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDate(value: string): Date {
  const [y, m, day] = value.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function daysBetweenInclusive(start: string, end: string): number {
  const ms = parseDate(end).getTime() - parseDate(start).getTime();
  return Math.floor(ms / 86400000) + 1;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** 양극재 LOT 단위 Mock — KPI·차트·상세 테이블 공통 원천 (초기 집계: 10003 / 9152 / 91.5%) */
function buildCathodeLots(): CathodeLot[] {
  const rand = seededRandom(20260520);
  const lots: CathodeLot[] = [];
  const start = parseDate('2026-05-01');
  const dayCount = 45;
  const totalLots = 10003;
  const goodTarget = 9152;
  const defectTarget = totalLots - goodTarget; // 851
  const peakDay = 19; // 2026-05-20

  const weights: number[] = [];
  for (let d = 0; d < dayCount; d += 1) {
    const dist = Math.abs(d - peakDay);
    weights.push(Math.exp(-(dist * dist) / (2 * 1.72 * 1.72)));
  }
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const dayCounts: number[] = weights.map((w) => Math.floor((totalLots * w) / weightSum));
  const assigned = dayCounts.reduce((s, n) => s + n, 0);
  dayCounts[peakDay] += totalLots - assigned;

  // 불량 LOT 개수를 정확히 851개로 고정 (셔플)
  const defectFlags: Array<0 | 1> = Array.from({ length: totalLots }, (_, i) =>
    i < defectTarget ? 1 : 0,
  );
  for (let i = defectFlags.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = defectFlags[i];
    defectFlags[i] = defectFlags[j];
    defectFlags[j] = tmp;
  }

  let lotIndex = 0;
  let capacitySum = 0;
  let metalSum = 0;
  let sinterSum = 0;

  for (let dayOffset = 0; dayOffset < dayCount; dayOffset += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + dayOffset);
    const date = formatDate(d);
    const count = dayCounts[dayOffset];

    for (let i = 0; i < count; i += 1) {
      const qualityDefect = defectFlags[lotIndex] ?? 0;
      // 목표 평균(200.0 / 0.024 / 799.9) 주변의 작은 노이즈
      const capacity = 200 + (rand() - 0.5) * 2.4;
      const metalImpurity = 0.024 + (rand() - 0.5) * 0.006 + (qualityDefect ? 0.001 : 0);
      const sinteringTemp = 799.9 + (rand() - 0.5) * 6;

      const roundedCapacity = Math.round(capacity * 10) / 10;
      const roundedMetal = Math.round(metalImpurity * 1e6) / 1e6;
      const roundedSinter = Math.round(sinteringTemp * 10) / 10;

      capacitySum += roundedCapacity;
      metalSum += roundedMetal;
      sinterSum += roundedSinter;

      lots.push({
        date,
        capacity: roundedCapacity,
        qualityDefect,
        metalImpurity: roundedMetal,
        sinteringTemp: roundedSinter,
      });
      lotIndex += 1;
    }
  }

  // 마지막 LOT로 평균을 목표값에 맞춤
  if (lots.length > 0) {
    const last = lots[lots.length - 1];
    const n = lots.length;
    last.capacity =
      Math.round((200 * n - (capacitySum - last.capacity)) * 10) / 10;
    last.metalImpurity =
      Math.round((0.024 * n - (metalSum - last.metalImpurity)) * 1e6) / 1e6;
    last.sinteringTemp =
      Math.round((799.9 * n - (sinterSum - last.sinteringTemp)) * 10) / 10;
  }

  return lots;
}

/** Mock 실시간 데모 — 최신 일자(수집 중)에 LOT를 누적 추가 */
function appendLiveDemoLots(prev: CathodeLot[], addCount: number): CathodeLot[] {
  if (prev.length === 0 || addCount <= 0) return prev;
  const liveToday = prev.reduce((m, l) => (l.date > m ? l.date : m), prev[0].date);
  const extras: CathodeLot[] = [];
  for (let i = 0; i < addCount; i += 1) {
    const isDefect = i % 5 === 0;
    extras.push({
      date: liveToday,
      capacity: Math.round((199.2 + (i % 4) * 0.4) * 10) / 10,
      qualityDefect: isDefect ? 1 : 0,
      metalImpurity: Math.round((0.022 + i * 0.0004) * 1e6) / 1e6,
      sinteringTemp: Math.round((799.4 + (i % 3) * 0.3) * 10) / 10,
    });
  }
  return [...prev, ...extras];
}

function aggregateDailyDetailRows(lots: CathodeLot[], liveToday: string): DailyDetailRow[] {
  type Acc = {
    totalProduction: number;
    goodCount: number;
    defectCount: number;
    capacitySum: number;
    capacityN: number;
    metalSum: number;
    metalN: number;
    sinterSum: number;
    sinterN: number;
  };
  const map = new Map<string, Acc>();

  for (const lot of lots) {
    const cur = map.get(lot.date) ?? {
      totalProduction: 0,
      goodCount: 0,
      defectCount: 0,
      capacitySum: 0,
      capacityN: 0,
      metalSum: 0,
      metalN: 0,
      sinterSum: 0,
      sinterN: 0,
    };
    cur.totalProduction += 1;
    if (lot.qualityDefect === 0) cur.goodCount += 1;
    else cur.defectCount += 1;
    if (Number.isFinite(lot.capacity)) {
      cur.capacitySum += lot.capacity;
      cur.capacityN += 1;
    }
    if (Number.isFinite(lot.metalImpurity)) {
      cur.metalSum += lot.metalImpurity;
      cur.metalN += 1;
    }
    if (Number.isFinite(lot.sinteringTemp)) {
      cur.sinterSum += lot.sinteringTemp;
      cur.sinterN += 1;
    }
    map.set(lot.date, cur);
  }

  return Array.from(map.entries())
    .map(([date, v]) => {
      const defectCount = v.totalProduction - v.goodCount;
      return {
        date,
        totalProduction: v.totalProduction,
        goodCount: v.goodCount,
        defectCount,
        defectRate: v.totalProduction === 0 ? 0 : defectCount / v.totalProduction,
        avgCapacity: v.capacityN === 0 ? 0 : v.capacitySum / v.capacityN,
        avgMetalImpurity: v.metalN === 0 ? 0 : v.metalSum / v.metalN,
        avgSinteringTemp: v.sinterN === 0 ? 0 : v.sinterSum / v.sinterN,
        status: date === liveToday ? ('수집 중' as const) : ('집계 완료' as const),
      };
    })
    .sort((a, b) => (a.date === b.date ? 0 : a.date > b.date ? -1 : 1));
}

function formatClock(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function buildPaginationItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'ellipsis', total];
  if (current >= total - 3) {
    return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}

function lotsToProductionRecords(lots: CathodeLot[]): ProductionRecord[] {
  const byDate = new Map<
    string,
    { production: number; defectCount: number; defects: DefectBreakdown }
  >();

  for (const lot of lots) {
    const cur = byDate.get(lot.date) ?? {
      production: 0,
      defectCount: 0,
      defects: emptyDefectBreakdown(),
    };
    cur.production += 1;
    if (lot.qualityDefect === 1) {
      cur.defectCount += 1;
      // 분류 라벨이 없어 불량 LOT는 원자재/온도 축으로만 배분 (합계 = defectCount)
      if (lot.metalImpurity > 0.028) cur.defects['원자재 불량'] += 1;
      else if (lot.sinteringTemp < 785 || lot.sinteringTemp > 815) cur.defects['온도 이상'] += 1;
      else if (lot.capacity < 195) cur.defects['기계 결함'] += 1;
      else cur.defects['작업자 실수'] += 1;
    }
    byDate.set(lot.date, cur);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      production: v.production,
      defectCount: v.defectCount,
      targetProduction: Math.max(1, Math.round(v.production * 1.05)),
      defects: v.defects,
    }));
}

function computeDetailedKpis(lots: CathodeLot[]): DetailedKpi[] {
  if (lots.length === 0) {
    return [
      { key: 'total', label: '총 생산량 (LOT)', value: '-', unit: '', sub: '전체 생산 실적' },
      {
        key: 'capacity',
        label: '평균 방전 용량',
        value: '-',
        unit: '',
        sub: '양극재 방전 용량 평균 (목표 195~205)',
      },
      {
        key: 'pass',
        label: '공정 합격률',
        value: '-',
        unit: '',
        sub: '품질 검사 통과 비율',
      },
      {
        key: 'metal',
        label: '금속 불순물 농도',
        value: '-',
        unit: '',
        sub: '금속 이물 함량 (기준치 0.03% 이하)',
      },
      {
        key: 'sinter',
        label: '평균 소성 온도',
        value: '-',
        unit: '',
        sub: '열처리 소성로 평균 온도 (목표 800°C)',
      },
      {
        key: 'good',
        label: '양품 수',
        value: '-',
        unit: '',
        sub: '품질 검사 통과 LOT 수',
      },
    ];
  }

  const total = lots.length;
  let capacitySum = 0;
  let passCount = 0;
  let metalSum = 0;
  let sinterSum = 0;

  for (const lot of lots) {
    capacitySum += lot.capacity;
    if (lot.qualityDefect === 0) passCount += 1;
    metalSum += lot.metalImpurity;
    sinterSum += lot.sinteringTemp;
  }

  const avgCapacity = capacitySum / total;
  const passRate = passCount / total;
  const avgMetal = metalSum / total;
  const avgSinter = sinterSum / total;

  const capacityOk = avgCapacity >= 195 && avgCapacity <= 205;
  const passOk = passRate >= 0.9;
  const metalWarn = avgMetal > 0.03;

  return [
    {
      key: 'total',
      label: '총 생산량 (LOT)',
      value: formatNumber(total),
      unit: '개',
      sub: '전체 생산 실적',
    },
    {
      key: 'capacity',
      label: '평균 방전 용량',
      value: avgCapacity.toFixed(1),
      unit: 'mAh/g',
      sub: '양극재 방전 용량 평균 (목표 195~205)',
      badge: { label: capacityOk ? '정상' : '주의', tone: capacityOk ? 'ok' : 'warn' },
    },
    {
      key: 'pass',
      label: '공정 합격률',
      value: (passRate * 100).toFixed(1),
      unit: '%',
      sub: '품질 검사 통과 비율',
      badge: { label: passOk ? '정상' : '주의', tone: passOk ? 'ok' : 'warn' },
    },
    {
      key: 'metal',
      label: '금속 불순물 농도',
      value: avgMetal.toFixed(3),
      unit: '%',
      sub: '금속 이물 함량 (기준치 0.03% 이하)',
      badge: { label: metalWarn ? '주의' : '정상', tone: metalWarn ? 'warn' : 'ok' },
    },
    {
      key: 'sinter',
      label: '평균 소성 온도',
      value: avgSinter.toFixed(1),
      unit: '°C',
      sub: '열처리 소성로 평균 온도 (목표 800°C)',
    },
    {
      key: 'good',
      label: '양품 수',
      value: formatNumber(passCount),
      unit: '개',
      sub: '품질 검사 통과 LOT 수',
    },
  ];
}

const MOCK_LOTS: CathodeLot[] = buildCathodeLots();
const MOCK_RECORDS: ProductionRecord[] = lotsToProductionRecords(MOCK_LOTS);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function formatPercent(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '-';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('ko-KR');
}

/** Chart axis only — rounds domain to clean tick intervals (e.g. 0, 500, 1000…). */
function niceChartMax(rawMax: number, tickCount = 5): number {
  if (rawMax <= 0) return tickCount * 100;
  const roughStep = rawMax / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const niceFactor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  const step = niceFactor * magnitude;
  return Math.ceil(rawMax / step) * step;
}

function emptyDefectBreakdown(): DefectBreakdown {
  return {
    '기계 결함': 0,
    '원자재 불량': 0,
    '작업자 실수': 0,
    '온도 이상': 0,
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getPreviousPeriodRange(
  start: string,
  end: string,
): { start: string; end: string } | null {
  const length = daysBetweenInclusive(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(length - 1));
  return { start: prevStart, end: prevEnd };
}

/* -------------------------------------------------------------------------- */
/* Local UI Components                                                        */
/* -------------------------------------------------------------------------- */

function Toast({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: (id: number) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onClose(toast.id), 3000);
    return () => window.clearTimeout(timer);
  }, [toast.id, onClose]);

  const bg =
    toast.variant === 'success'
      ? 'bg-emerald-600'
      : toast.variant === 'error'
        ? 'bg-red-600'
        : 'bg-slate-800';

  return (
    <div
      className={`pointer-events-auto flex min-w-[280px] max-w-md items-start gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${bg}`}
      role="status"
    >
      <span className="flex-1 leading-relaxed">{toast.message}</span>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        className="rounded px-1.5 py-0.5 text-white/80 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
        aria-label="닫기"
      >
        ×
      </button>
    </div>
  );
}

function KpiCard({
  label,
  value,
  unit,
  sub,
  badge,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  badge?: { label: string; tone: KpiBadgeTone };
}) {
  const { isDark } = useUiSettings();
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200/80 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {label}
        </p>
        {badge ? (
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
              badge.tone === 'warn'
                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/80'
                : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80'
            }`}
          >
            {badge.label}
          </span>
        ) : null}
      </div>
      <p
        className={`mt-2 flex items-baseline gap-1.5 tracking-tight ${
          isDark ? 'text-slate-100' : 'text-slate-800'
        }`}
      >
        <span className="text-2xl font-bold">{value}</span>
        {unit ? <span className="text-xs font-medium text-slate-400">{unit}</span> : null}
      </p>
      {sub ? (
        <p
          className={`mt-1.5 text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  const { isDark } = useUiSettings();
  return (
    <div
      className={`flex h-full min-h-[140px] items-center justify-center rounded-lg border border-dashed px-4 py-8 text-sm ${
        isDark
          ? 'border-slate-700 bg-slate-900/70 text-slate-400'
          : 'border-slate-300 bg-slate-50 text-slate-500'
      }`}
    >
      {message}
    </div>
  );
}

function ProductionTrendChart({
  daily,
  dailyRates = [],
  forecastRates = [],
  isDark = false,
}: {
  daily: DailyAggregate[];
  dailyRates?: Array<{ date: string; rate: number | null }>;
  forecastRates?: Array<{ date: string; rate: number }>;
  isDark?: boolean;
}) {
  const width = 720;
  const height = 280;
  const pad = { top: 24, right: 52, bottom: 40, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  if (daily.length === 0) {
    return <EmptyState message="표시할 생산 데이터가 없습니다." />;
  }

  const rateByDate = new Map(
    dailyRates.filter((d) => d.rate !== null).map((d) => [d.date, d.rate as number]),
  );
  const rawMaxY = Math.max(...daily.map((d) => d.production), 1);
  const tickCount = 5;
  const maxY = niceChartMax(rawMaxY, tickCount);
  const maxRate = Math.max(
    ...Array.from(rateByDate.values()),
    ...forecastRates.map((point) => point.rate),
    0.001,
  );
  const n = daily.length + forecastRates.length;
  const barW = Math.min(34, Math.max(12, (innerW / n) * 0.52));
  const slotX = (i: number) => pad.left + (innerW / n) * i + (innerW / n) / 2;

  const points = daily.map((d, i) => {
    const x = slotX(i);
    const y = pad.top + innerH - (d.production / maxY) * innerH;
    const rate = rateByDate.get(d.date) ?? null;
    const rateY =
      rate === null ? null : pad.top + innerH - (rate / maxRate) * innerH;
    return { ...d, x, y, rate, rateY };
  });

  const forecastPoints = forecastRates.map((point, index) => ({
    ...point,
    x: slotX(daily.length + index),
    rateY: pad.top + innerH - (point.rate / maxRate) * innerH,
  }));

  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const v = (maxY / tickCount) * i;
    const y = pad.top + innerH - (v / maxY) * innerH;
    return { v, y };
  });

  const rateTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    v: maxRate * r,
    y: pad.top + innerH - r * innerH,
  }));

  const defectPoints = points.filter((p) => p.rateY !== null);
  const lastActualRatePoint = [...points].reverse().find((point) => point.rateY !== null);
  const forecastLinePoints = [
    ...(lastActualRatePoint
      ? [{ x: lastActualRatePoint.x, rateY: lastActualRatePoint.rateY as number }]
      : []),
    ...forecastPoints.map((p) => ({ x: p.x, rateY: p.rateY })),
  ];
  const chartDates = [...daily.map((point) => point.date), ...forecastRates.map((point) => point.date)];
  const gridStroke = isDark ? '#334155' : '#e2e8f0';
  const tickFill = isDark ? '#cbd5e1' : undefined;
  const labelFill = isDark ? '#cbd5e1' : undefined;
  const pointStroke = isDark ? '#1e293b' : '#ffffff';

  return (
    <div className="overflow-x-auto pb-1">
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[280px] w-full"
      style={{ minWidth: `${width}px` }}
      role="img"
      aria-label="최근 5일 양품량과 실측 불량률, 미래 2일 예측 불량률 차트"
    >
      {yTicks.map((t) => (
        <g key={`prod-${t.v}`}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={t.y}
            y2={t.y}
            stroke={gridStroke}
            strokeWidth={1}
          />
          <text
            x={pad.left - 8}
            y={t.y + 4}
            textAnchor="end"
            className={isDark ? 'text-[10px]' : 'fill-slate-400 text-[10px]'}
            fill={tickFill}
          >
            {formatNumber(Math.round(t.v))}
          </text>
        </g>
      ))}
      {rateTicks.map((t) => (
        <text
          key={`rate-${t.v}`}
          x={width - pad.right + 8}
          y={t.y + 4}
          textAnchor="start"
          className="fill-amber-500 text-[10px]"
        >
          {formatPercent(t.v)}
        </text>
      ))}
      {points.map((p) => (
        <rect
          key={p.date}
          x={p.x - barW / 2}
          y={p.y}
          width={barW}
          height={pad.top + innerH - p.y}
          fill="#2563eb"
          rx={1.5}
        >
          <title>{`${p.date}: 양품량 ${formatNumber(p.production)} LOT`}</title>
        </rect>
      ))}
      {defectPoints.length > 0 ? (
        <>
          <polyline
            fill="none"
            stroke="#ea580c"
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={defectPoints.map((p) => `${p.x},${p.rateY}`).join(' ')}
          />
          {defectPoints.map((p) => (
            <circle
              key={`rate-${p.date}`}
              cx={p.x}
              cy={p.rateY as number}
              r={3}
              fill="#ea580c"
              stroke={pointStroke}
              strokeWidth={2}
            >
              <title>{`${p.date}: 불량률 ${formatPercent(p.rate)}`}</title>
            </circle>
          ))}
        </>
      ) : null}
      {forecastLinePoints.length > 1 ? (
        <>
          <polyline
            fill="none"
            stroke="#7c3aed"
            strokeWidth={2.5}
            strokeDasharray="6 5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={forecastLinePoints.map((p) => `${p.x},${p.rateY}`).join(' ')}
          />
          {forecastPoints.map((p) => (
            <circle
              key={`ai-${p.date}`}
              cx={p.x}
              cy={p.rateY}
              r={2.5}
              fill="#7c3aed"
              stroke={pointStroke}
              strokeWidth={1.5}
            >
              <title>{`${p.date}: 예측 불량률 ${formatPercent(p.rate)}`}</title>
            </circle>
          ))}
        </>
      ) : null}
      {Array.from({ length: n }, (_, i) => {
        const date = chartDates[i];
        const x = slotX(i);
        return (
          <text
            key={`label-${date}`}
            x={x}
            y={height - 12}
            textAnchor="middle"
            className={isDark ? 'text-xs' : 'fill-slate-500 text-xs'}
            fill={labelFill}
          >
            {date.slice(5)}
          </text>
        );
      })}
    </svg>
    </div>
  );
}

function FeatureImportancePanel({
  items,
  isDark,
}: {
  items: FeatureImportanceItem[];
  isDark: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2
          className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
        >
          AI 도출 주요 불량 유발 변수
        </h2>
        <span className="text-sm font-normal text-gray-400">Feature Importance</span>
      </div>
      <p className={`mb-4 mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        전체 LOT 기준 추정 중요도 · 양극재 공정 변수
      </p>
      <ul className="space-y-4">
        {items.map((item, i) => {
          const pct = Math.round(Math.min(1, Math.max(0, item.importance)) * 100);
          return (
            <li key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>
                  {item.label}
                  {item.sub ? (
                    <span
                      className={`ml-1 text-xs font-normal ${
                        isDark ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      {item.sub}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`tabular-nums font-semibold ${
                    isDark ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {pct}%
                </span>
              </div>
              <div
                className={`h-2.5 overflow-hidden rounded-full ${
                  isDark ? 'bg-slate-700' : 'bg-slate-100'
                }`}
              >
                <div
                  className="h-full rounded-full"
                  style={
                    {
                      width: `${pct}%`,
                      backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                    } as CSSProperties
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SpcChartCard({ metric, isDark }: { metric: SpcMetric; isDark: boolean }) {
  const width = 420;
  const height = 132;
  const pad = { top: 14, right: 12, bottom: 22, left: 38 };
  const data = metric.data.slice(-24);
  const values = [
    ...data.map((point) => point.value),
    metric.lowerControlLimit,
    metric.centerLine,
    metric.upperControlLimit,
  ];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.000001);
  const x = (index: number) =>
    pad.left + (index / Math.max(data.length - 1, 1)) * (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top + ((max - value) / range) * (height - pad.top - pad.bottom);
  const tone =
    metric.status.includes('이탈') ? '#dc2626' : metric.status.includes('주의') ? '#d97706' : '#2563eb';

  return (
    <div
      className={`rounded-lg border p-2.5 ${
        isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={isDark ? 'text-xs font-semibold text-slate-200' : 'text-xs font-semibold text-slate-700'}>
          {metric.label}
        </span>
        <span className="text-[11px] font-semibold" style={{ color: tone }}>
          {metric.status}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[132px] w-full" role="img" aria-label={`${metric.label} SPC 관리도`}>
        {[
          { label: 'UCL', value: metric.upperControlLimit, color: '#dc2626' },
          { label: 'CL', value: metric.centerLine, color: '#64748b' },
          { label: 'LCL', value: metric.lowerControlLimit, color: '#dc2626' },
        ].map((line) => (
          <g key={line.label}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(line.value)}
              y2={y(line.value)}
              stroke={line.color}
              strokeWidth={1}
              strokeDasharray={line.label === 'CL' ? '3 3' : '5 4'}
              opacity={0.8}
            />
            <text x={pad.left - 4} y={y(line.value) + 3} textAnchor="end" fill={line.color} fontSize="9">
              {line.label}
            </text>
          </g>
        ))}
        {data.length > 1 ? (
          <polyline
            fill="none"
            stroke={tone}
            strokeWidth={2}
            strokeLinejoin="round"
            points={data.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')}
          />
        ) : null}
        {data.map((point, index) => (
          <circle key={`${point.timestamp}-${index}`} cx={x(index)} cy={y(point.value)} r={index === data.length - 1 ? 3.5 : 2} fill={tone}>
            <title>{`${point.timestamp}: ${point.value}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}


export default function DashBoardPage() {
  const { isDark } = useUiSettings();
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const toastIdRef = useRef(0);

  /** 생산 원천 — KPI / 차트 / 상세 테이블 공유 */
  const [liveLots] = useState<CathodeLot[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveConnectionStatus>('connected');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const fetchingRef = useRef(false);
  const [lotRiskRows, setLotRiskRows] = useState<LotRiskRow[]>([]);
  const [lotRiskTotal, setLotRiskTotal] = useState(0);
  const [lotRiskTotalPages, setLotRiskTotalPages] = useState(1);
  const [selectedLotRiskDetail, setSelectedLotRiskDetail] = useState<LotRiskApiDetail | null>(null);
  const [trendPoints, setTrendPoints] = useState<Array<{
    date: string;
    production: number;
    goodCount: number;
    defectCount: number;
    defectRate: number | null;
    aiDefectRate: number | null;
  }>>([]);
  const [trendForecastPoints, setTrendForecastPoints] = useState<Array<{
    date: string;
    defectRate: number;
  }>>([]);
  const [dailyApiRows, setDailyApiRows] = useState<ProductionDailyRow[]>([]);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [dailyTotalPages, setDailyTotalPages] = useState(1);
  const [featureImportanceItems, setFeatureImportanceItems] = useState<FeatureImportanceItem[]>([]);

  const [tablePage, setTablePage] = useState(1);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);
  const [selectedLotRiskId, setSelectedLotRiskId] = useState<string | null>(null);
  const [lotRiskFilterDraft, setLotRiskFilterDraft] =
    useState<LotRiskFilterState>(EMPTY_LOT_RISK_FILTER);
  const [lotRiskFilterApplied, setLotRiskFilterApplied] =
    useState<LotRiskFilterState>(EMPTY_LOT_RISK_FILTER);
  const [lotRiskPage, setLotRiskPage] = useState(1);
  const [lotRiskPageInput, setLotRiskPageInput] = useState('1');

  const filteredLotRiskRows = lotRiskRows;
  const lotRiskFilterActive = isLotRiskFilterActive(lotRiskFilterApplied);
  const lotRiskSafePage = Math.min(lotRiskPage, lotRiskTotalPages);
  const pagedLotRiskRows = filteredLotRiskRows;
  /** 페이지당 5행 고정 슬롯 (부족분은 null placeholder) */
  const lotRiskTableSlots = useMemo(() => {
    const slots: Array<LotRiskRow | null> = [...pagedLotRiskRows];
    while (slots.length < LOT_RISK_PAGE_SIZE) slots.push(null);
    return slots;
  }, [pagedLotRiskRows]);
  const lotRiskPageNumbers = useMemo(
    () => buildPaginationItems(lotRiskSafePage, lotRiskTotalPages),
    [lotRiskSafePage, lotRiskTotalPages],
  );
  const lotRiskRangeLabel = useMemo(() => {
    if (lotRiskTotal === 0) return null;
    const start = (lotRiskSafePage - 1) * LOT_RISK_PAGE_SIZE + 1;
    const end = Math.min(lotRiskSafePage * LOT_RISK_PAGE_SIZE, lotRiskTotal);
    return `${start}-${end}`;
  }, [lotRiskSafePage, lotRiskTotal]);

  useEffect(() => {
    setSelectedLotRiskId((prev) => {
      if (prev && filteredLotRiskRows.some((r) => r.lot === prev)) return prev;
      return filteredLotRiskRows[0]?.lot ?? null;
    });
  }, [filteredLotRiskRows]);

  useEffect(() => {
    if (lotRiskPage > lotRiskTotalPages) {
      setLotRiskPage(lotRiskTotalPages);
      setLotRiskPageInput(String(lotRiskTotalPages));
    }
  }, [lotRiskPage, lotRiskTotalPages]);

  const selectedLotRisk = useMemo(
    () => filteredLotRiskRows.find((r) => r.lot === selectedLotRiskId) ?? null,
    [filteredLotRiskRows, selectedLotRiskId],
  );
  useEffect(() => {
    if (!selectedLotRiskId) {
      setSelectedLotRiskDetail(null);
      return;
    }
    let cancelled = false;
    dashboardApi.getLotRiskDetail(selectedLotRiskId)
      .then(({ data }) => {
        if (!cancelled) setSelectedLotRiskDetail(data.item as unknown as LotRiskApiDetail);
      })
      .catch(() => {
        if (!cancelled) setSelectedLotRiskDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedLotRiskId]);

  const selectedSpcCounts = useMemo(() => {
    const metrics = selectedLotRiskDetail?.spc?.metrics || [];
    return {
      out: metrics.filter((metric) => metric.status.includes('이탈')).length,
      caution: metrics.filter((metric) => metric.status.includes('주의')).length,
    };
  }, [selectedLotRiskDetail]);

  const selectedRiskSummary = useMemo(() => {
    if (!selectedLotRisk || !selectedLotRiskDetail) return '';
    const probability = selectedLotRiskDetail.defectProb ?? selectedLotRisk.prob;
    const margin = selectedLotRiskDetail.residualMargin ?? selectedLotRisk.margin;
    const marginText =
      margin == null
        ? '규격 대비 산출 불가'
        : margin < 0
          ? `USL 대비 ${formatNumber(Math.round(Math.abs(margin)))} ppm 초과`
          : `규격까지 ${formatNumber(Math.round(margin))} ppm`;
    return `불량확률 ${(probability * 100).toFixed(1)}%, ${marginText}, SPC 이탈 ${selectedSpcCounts.out}개, 주의 ${selectedSpcCounts.caution}개`;
  }, [selectedLotRisk, selectedLotRiskDetail, selectedSpcCounts]);

  const pushToast = useCallback((message: string, variant: ToastState['variant']) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const applyLotRiskFilters = useCallback(() => {
    setLotRiskFilterApplied({ ...lotRiskFilterDraft });
    setLotRiskPage(1);
    setLotRiskPageInput('1');
    pushToast('LOT 위험등급 검색 결과가 적용되었습니다.', 'success');
  }, [lotRiskFilterDraft, pushToast]);

  const resetLotRiskFilters = useCallback(() => {
    setLotRiskFilterDraft(EMPTY_LOT_RISK_FILTER);
    setLotRiskFilterApplied(EMPTY_LOT_RISK_FILTER);
    setLotRiskPage(1);
    setLotRiskPageInput('1');
    pushToast('LOT 위험등급 필터가 초기화되었습니다.', 'info');
  }, [pushToast]);

  const handleLotRiskPageChange = (page: number) => {
    const nextPage = Math.min(lotRiskTotalPages, Math.max(1, Math.trunc(page)));
    setLotRiskPage(nextPage);
    setLotRiskPageInput(String(nextPage));
  };

  const handleLotRiskPageInputSubmit = () => {
    const requestedPage = Number(lotRiskPageInput);
    if (!Number.isFinite(requestedPage)) {
      setLotRiskPageInput(String(lotRiskSafePage));
      return;
    }
    handleLotRiskPageChange(requestedPage);
  };

  const liveToday = useMemo(() => {
    if (liveLots.length === 0) return formatDate(new Date());
    return liveLots.reduce((m, l) => (l.date > m ? l.date : m), liveLots[0].date);
  }, [liveLots]);

  const { startDate, endDate } = useMemo(() => {
    if (liveLots.length === 0) {
      const today = formatDate(new Date());
      return { startDate: today, endDate: today };
    }
    let start = liveLots[0].date;
    let end = liveLots[0].date;
    for (const lot of liveLots) {
      if (lot.date < start) start = lot.date;
      if (lot.date > end) end = lot.date;
    }
    return { startDate: start, endDate: end };
  }, [liveLots]);

  const periodLots = liveLots;

  const filteredRecords = useMemo(() => lotsToProductionRecords(periodLots), [periodLots]);
  const hasData = (trendPoints?.length ?? 0) > 0 || dailyApiRows.length > 0;
  const detailedKpis = useMemo(() => computeDetailedKpis(periodLots), [periodLots]);

  const dailyDetailRows: DailyDetailRow[] = useMemo(
    () => dailyApiRows.map((row) => ({
      date: row.date,
      totalProduction: row.production,
      goodCount: row.goodCount,
      defectCount: row.defectCount,
      defectRate: row.defectRate ?? 0,
      metalImpurity: row.metalImpurity,
      tempDevFrom800: row.tempDevFrom800,
      humidity: row.humidity,
      tempXHumidity: row.tempXHumidity,
      status: row.dataStatus,
    })),
    [dailyApiRows],
  );

  const dailyAggregates: DailyAggregate[] = useMemo(
    () => (trendPoints || []).map((row) => ({
      date: row.date,
      production: row.goodCount,
      defectCount: row.defectCount,
      targetProduction: row.goodCount,
    })),
    [trendPoints],
  );

  const trendHasData = dailyAggregates.length > 0;
  const trendDailyAggregates = dailyAggregates;
  const trendDailyRates = useMemo(
    () => (trendPoints || []).map((row) => ({ date: row.date, rate: row.defectRate })),
    [trendPoints],
  );
  const trendForecastRates = useMemo(
    () => (trendForecastPoints || []).map((row) => ({ date: row.date, rate: row.defectRate })),
    [trendForecastPoints],
  );

  const kpi: KpiSummary = useMemo(() => {
    if (!hasData) {
      return {
        totalProduction: 0,
        avgDefectRate: null,
        peakDate: null,
        peakProduction: 0,
        targetAchievementRate: null,
      };
    }

    let totalProduction = 0;
    let totalDefects = 0;
    let totalTarget = 0;

    for (const r of filteredRecords) {
      totalProduction += r.production;
      totalDefects += r.defectCount;
      totalTarget += r.targetProduction;
    }

    const peak =
      dailyAggregates.length === 0
        ? null
        : dailyAggregates.reduce((a, b) => (b.production > a.production ? b : a));

    return {
      totalProduction,
      avgDefectRate: safeRate(totalDefects, totalProduction),
      peakDate: peak?.date ?? null,
      peakProduction: peak?.production ?? 0,
      targetAchievementRate: safeRate(totalProduction, totalTarget),
    };
  }, [filteredRecords, dailyAggregates, hasData]);

  const searchedDetailRows = dailyDetailRows;

  const tableTotalPages = dailyTotalPages;
  const tableSafePage = Math.min(tablePage, tableTotalPages);
  const pagedDetailRows = searchedDetailRows;
  const visibleDetailIds = useMemo(
    () => pagedDetailRows.map((r) => r.date),
    [pagedDetailRows],
  );
  const allVisibleSelected =
    visibleDetailIds.length > 0 &&
    visibleDetailIds.every((id) => selectedItems.includes(id));
  const someVisibleSelected = visibleDetailIds.some((id) =>
    selectedItems.includes(id),
  );
  const tablePageNumbers = useMemo(
    () => buildPaginationItems(tableSafePage, tableTotalPages),
    [tableSafePage, tableTotalPages],
  );

  const tableRangeStart =
    dailyTotal === 0 ? 0 : (tableSafePage - 1) * 5 + 1;
  const tableRangeEnd = Math.min(tableSafePage * 5, dailyTotal);
  const tableStatusText =
    dailyTotal === 0
      ? '표시할 데이터가 없습니다.'
      : `총 ${formatNumber(dailyTotal)}건 중 ${formatNumber(tableRangeStart)}–${formatNumber(tableRangeEnd)}건 표시`;

  useEffect(() => {
    if (tablePage > tableTotalPages) setTablePage(tableTotalPages);
  }, [tablePage, tableTotalPages]);

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const refreshDashboardData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLiveStatus('updating');
    try {
      const probParams =
        lotRiskFilterApplied.probLevel === 'high'
          ? { minProb: 0.4 }
          : lotRiskFilterApplied.probLevel === 'mid'
            ? { minProb: 0.2, maxProb: 0.4 }
            : lotRiskFilterApplied.probLevel === 'low'
              ? { maxProb: 0.2 }
              : {};
      const [lotResponse, trendResponse, dailyResponse, fiResponse] = await Promise.all([
        dashboardApi.listLotRisks({
          page: lotRiskPage,
          pageSize: LOT_RISK_PAGE_SIZE,
          search: lotRiskFilterApplied.lotQuery || undefined,
          riskLevel: lotRiskFilterApplied.grade,
          spc: lotRiskFilterApplied.spc,
          marginLevel:
            lotRiskFilterApplied.marginLevel === 'all'
              ? undefined
              : lotRiskFilterApplied.marginLevel,
          ...probParams,
        }),
        dashboardApi.getProductionTrend(),
        dashboardApi.getProductionDaily(tablePage, 5),
        dashboardApi.getFeatureImportance(4),
      ]);
      const mappedLots = lotResponse.data.items.map((row: DashboardLotRiskItem): LotRiskRow => ({
        lot: row.lotId,
        prob: row.defectProb ?? 0,
        predLi: row.residualLithium,
        margin: row.residualMargin,
        spc: row.spcStatus || '안정',
        grade: row.riskLevel,
        action: '',
        reason: row.riskReason,
        isCritical: row.riskLevel === '심각',
      }));
      setLotRiskRows(mappedLots);
      setLotRiskTotal(lotResponse.data.total);
      setLotRiskTotalPages(lotResponse.data.totalPages);
      setTrendPoints(trendResponse.data.actualPoints || []);
      setTrendForecastPoints(trendResponse.data.forecastPoints || []);
      setDailyApiRows(dailyResponse.data.items as unknown as ProductionDailyRow[]);
      setDailyTotal(dailyResponse.data.total);
      setDailyTotalPages(dailyResponse.data.totalPages);
      const importanceTotal = fiResponse.data.items.reduce(
        (sum, item) => sum + Math.max(0, Number(item.importance) || 0),
        0,
      );
      setFeatureImportanceItems(
        fiResponse.data.items.map((item) => ({
          label: item.label,
          importance:
            importanceTotal > 0 ? Math.max(0, Number(item.importance) || 0) / importanceTotal : 0,
        })),
      );
      setLastUpdatedAt(new Date());
      setLiveStatus('connected');
    } catch {
      setLiveStatus('error');
    } finally {
      fetchingRef.current = false;
      setInitialLoading(false);
    }
  }, [lotRiskFilterApplied, lotRiskPage, tablePage]);

  useEffect(() => {
    void refreshDashboardData();
  }, [refreshDashboardData]);

  const defectAnalysis: DefectAnalysis = useMemo(() => {
    const dailyRates = dailyAggregates.map((d) => ({
      date: d.date,
      rate: safeRate(d.defectCount, d.production),
    }));

    const typeTotals = emptyDefectBreakdown();
    let totalProd = 0;
    let totalDef = 0;
    for (const r of filteredRecords) {
      totalProd += r.production;
      totalDef += r.defectCount;
      for (const t of DEFECT_TYPES) {
        typeTotals[t] += r.defects[t];
      }
    }
    const typeTotalSum = DEFECT_TYPES.reduce((s, t) => s + typeTotals[t], 0);
    const currentDefectRate = safeRate(totalDef, totalProd);

    let maxDefectType = '해당 없음';
    let maxTypeCount = -1;
    for (const t of DEFECT_TYPES) {
      if (typeTotals[t] > maxTypeCount) {
        maxTypeCount = typeTotals[t];
        maxDefectType = t;
      }
    }

    const prevRange = getPreviousPeriodRange(startDate, endDate);
    let previousDefectRate: number | null = null;
    let hasComparison = false;
    let previousPeriodLabel: string | null = null;
    const prevTypeTotals = emptyDefectBreakdown();

    if (prevRange && startDate <= endDate) {
      previousPeriodLabel = `${prevRange.start} ~ ${prevRange.end}`;
      const prevLots = liveLots.filter(
        (l) => l.date >= prevRange.start && l.date <= prevRange.end,
      );
      const prevRecords = lotsToProductionRecords(prevLots);

      if (prevRecords.length > 0) {
        hasComparison = true;
        let pp = 0;
        let pd = 0;
        for (const r of prevRecords) {
          pp += r.production;
          pd += r.defectCount;
          for (const t of DEFECT_TYPES) {
            prevTypeTotals[t] += r.defects[t];
          }
        }
        previousDefectRate = safeRate(pd, pp);
      }
    }

    let changeRatePercent: number | null = null;
    let improvementEffect = '비교 데이터 없음';
    let topDecreaseFactor = '비교 데이터 없음';

    if (hasComparison && currentDefectRate !== null && previousDefectRate !== null) {
      if (previousDefectRate === 0) {
        changeRatePercent = currentDefectRate === 0 ? 0 : null;
        improvementEffect =
          currentDefectRate === 0
            ? '이전·현재 모두 불량률 0%로 유지'
            : '이전 기간 불량률이 0%여 변화율을 산출할 수 없음';
      } else {
        changeRatePercent = ((currentDefectRate - previousDefectRate) / previousDefectRate) * 100;
        if (changeRatePercent < 0) {
          improvementEffect = `불량률 ${Math.abs(changeRatePercent).toFixed(1)}% 개선 (감소)`;
        } else if (changeRatePercent > 0) {
          improvementEffect = `불량률 ${changeRatePercent.toFixed(1)}% 악화 (증가)`;
        } else {
          improvementEffect = '불량률 변화 없음';
        }
      }

      let bestType: DefectType | null = null;
      let bestDelta = 0;
      for (const t of DEFECT_TYPES) {
        const delta = prevTypeTotals[t] - typeTotals[t];
        if (delta > bestDelta) {
          bestDelta = delta;
          bestType = t;
        }
      }
      topDecreaseFactor =
        bestType && bestDelta > 0
          ? `${bestType} ${formatNumber(bestDelta)}건 감소가 주요 개선 요인`
          : '뚜렷한 감소 요인 없음';
    }

    return {
      dailyRates,
      typeTotals,
      typeTotalSum,
      previousPeriodLabel,
      currentDefectRate,
      previousDefectRate,
      changeRatePercent,
      improvementEffect,
      topDecreaseFactor,
      maxDefectType: hasData
        ? `${maxDefectType} (${formatNumber(Math.max(maxTypeCount, 0))}건)`
        : '해당 없음',
      hasComparison,
    };
  }, [dailyAggregates, filteredRecords, hasData, startDate, endDate, liveLots]);

  const handleSelectRow = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSelectAll = () => {
    setSelectedItems((prev) => {
      const allSelected =
        visibleDetailIds.length > 0 &&
        visibleDetailIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !visibleDetailIds.includes(id));
      }
      const next = [...prev];
      for (const id of visibleDetailIds) {
        if (!next.includes(id)) next.push(id);
      }
      return next;
    });
  };

  const handleExportCsv = () => {
    if (selectedItems.length === 0) {
      alert('다운로드할 항목을 체크박스로 선택해주세요.');
      return;
    }
    selectedItems.forEach((date) => {
      const link = document.createElement('a');
      link.href = dashboardApi.lotsCsvPath(date);
      link.download = `lots_${date}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
    pushToast(`${selectedItems.length}개 날짜의 LOT CSV 다운로드를 시작했습니다.`, 'success');
  };

  const cardClass = isDark
    ? 'rounded-xl border border-slate-700 bg-slate-800 shadow-sm'
    : 'rounded-xl border border-slate-200 bg-white shadow-sm';

  const liveStatusLabel =
    liveStatus === 'updating'
      ? '업데이트 중'
      : liveStatus === 'error'
        ? '업데이트 지연'
        : 'API 연결됨';

  return (
    <div
      className={`h-full overflow-y-auto ${
        isDark
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800'
          : 'bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50'
      }`}
    >
      <div className={`${SHELL_CONTENT_CLASS} py-6 pb-28`}>
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="mb-6 flex flex-col gap-1">
            <p
              className={`text-sm font-bold tracking-wide ${
                isDark ? 'text-blue-400' : 'text-blue-600'
              }`}
            >
              Production Operations
            </p>
            <h1
              className={`mt-1 text-3xl font-bold tracking-tight ${
                isDark ? 'text-slate-100' : 'text-gray-900'
              }`}
            >
              생산 대시보드
            </h1>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              생산 KPI, 추이, 불량 분석을 한눈에 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`inline-flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                isDark
                  ? 'border-slate-700 bg-slate-900/60 text-slate-300'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
              aria-live="polite"
            >
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span
                  className={`h-2 w-2 rounded-full ${
                    liveStatus === 'error'
                      ? 'bg-amber-500'
                      : liveStatus === 'updating'
                        ? 'bg-blue-500'
                        : 'bg-emerald-500'
                  }`}
                  aria-hidden="true"
                />
                {liveStatusLabel}
              </span>
              <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>·</span>
              <span className="tabular-nums">
                최근 업데이트{' '}
                {isMounted && lastUpdatedAt != null
                  ? formatClock(lastUpdatedAt)
                  : '--:--:--'}
              </span>
              <button
                type="button"
                onClick={() => void refreshDashboardData()}
                disabled={liveStatus === 'updating'}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDark
                    ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                }`}
              >
                새로고침
              </button>
            </div>
          </div>
        </header>

        {/* LOT 위험등급 — 좌측 목록 / 우측 핵심 상세 (생산 추이 위) */}
        <section className={`col-span-full mb-6 w-full p-5 ${cardClass}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2
                className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
              >
                LOT 위험등급
              </h2>
              <span className="text-sm font-normal text-gray-400">
                분류확률 + 잔류Li 여유 + SPC 결합
              </span>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
            <label className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-xs sm:max-w-[280px] sm:flex-none">
              <span className={`shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                LOT
              </span>
              <input
                type="search"
                aria-label="LOT 검색 필터"
                placeholder="LOT 검색"
                value={lotRiskFilterDraft.lotQuery}
                onChange={(e) =>
                  setLotRiskFilterDraft((prev) => ({ ...prev, lotQuery: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyLotRiskFilters();
                  }
                }}
                className={`h-9 w-full min-w-0 rounded-lg border px-2.5 text-sm outline-none ${
                  isDark
                    ? 'border-slate-700 bg-slate-950/40 text-slate-100 placeholder:text-slate-500'
                    : 'border-slate-200 bg-white text-slate-700 placeholder:text-slate-400'
                }`}
              />
            </label>

            <label className="inline-flex items-center gap-1.5 text-xs">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>불량확률</span>
              <select
                aria-label="불량확률 필터"
                value={lotRiskFilterDraft.probLevel}
                onChange={(e) =>
                  setLotRiskFilterDraft((prev) => ({
                    ...prev,
                    probLevel: e.target.value as LotRiskFilterState['probLevel'],
                  }))
                }
                className={`h-9 rounded-lg border px-2 text-sm ${
                  isDark
                    ? 'border-slate-700 bg-slate-950/40 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="all">전체</option>
                <option value="high">40% 이상</option>
                <option value="mid">20~40%</option>
                <option value="low">20% 미만</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-1.5 text-xs">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>규격 대비</span>
              <select
                aria-label="여유량 필터"
                value={lotRiskFilterDraft.marginLevel}
                onChange={(e) =>
                  setLotRiskFilterDraft((prev) => ({
                    ...prev,
                    marginLevel: e.target.value as LotRiskFilterState['marginLevel'],
                  }))
                }
                className={`h-9 rounded-lg border px-2 text-sm ${
                  isDark
                    ? 'border-slate-700 bg-slate-950/40 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="all">전체</option>
                <option value="low">500ppm 이하</option>
                <option value="caution">500ppm 초과~1,000ppm</option>
                <option value="sufficient">1,000ppm 초과</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-1.5 text-xs">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>SPC</span>
              <select
                aria-label="SPC 필터"
                value={lotRiskFilterDraft.spc}
                onChange={(e) =>
                  setLotRiskFilterDraft((prev) => ({
                    ...prev,
                    spc: e.target.value as LotRiskFilterState['spc'],
                  }))
                }
                className={`h-9 rounded-lg border px-2 text-sm ${
                  isDark
                    ? 'border-slate-700 bg-slate-950/40 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="all">전체</option>
                <option value="안정">안정</option>
                <option value="주의">주의</option>
                <option value="이탈">이탈</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-1.5 text-xs">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>위험등급</span>
              <select
                aria-label="위험등급 필터"
                value={lotRiskFilterDraft.grade}
                onChange={(e) =>
                  setLotRiskFilterDraft((prev) => ({
                    ...prev,
                    grade: e.target.value as LotRiskFilterState['grade'],
                  }))
                }
                className={`h-9 rounded-lg border px-2 text-sm ${
                  isDark
                    ? 'border-slate-700 bg-slate-950/40 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="all">전체</option>
                <option value="심각">심각</option>
                <option value="주의">주의</option>
              </select>
            </label>

            <button
              type="button"
              onClick={applyLotRiskFilters}
              className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
            >
              검색
            </button>
            <button
              type="button"
              onClick={resetLotRiskFilters}
              disabled={
                !lotRiskFilterActive &&
                lotRiskFilterDraft.lotQuery === '' &&
                lotRiskFilterDraft.grade === 'all' &&
                lotRiskFilterDraft.spc === 'all' &&
                lotRiskFilterDraft.probLevel === 'all' &&
                lotRiskFilterDraft.marginLevel === 'all'
              }
              className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                isDark
                  ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              초기화
            </button>
            </div>

            <span
              className={`ml-auto text-xs tabular-nums ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              {lotRiskFilterActive
                ? `검색 결과 ${lotRiskTotal}건`
                : `총 ${lotRiskTotal}건`}
              {lotRiskRangeLabel
                ? ` · ${lotRiskRangeLabel} 표시 · ${lotRiskSafePage}/${lotRiskTotalPages}페이지`
                : ''}
            </span>
          </div>

          <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
            <div className="flex min-w-0 flex-col xl:col-span-8">
              <div
                className={`flex h-[356px] min-h-0 flex-col overflow-hidden rounded-lg border ${
                  isDark ? 'border-slate-700' : 'border-slate-200'
                }`}
              >
              <div className="min-h-0 flex-1 overflow-x-auto">
              <table className="w-full min-w-[860px] table-fixed border-collapse text-sm">
                <thead
                  className={`text-sm font-normal text-gray-500 ${
                    isDark ? 'bg-slate-900/80' : 'bg-slate-100/70'
                  }`}
                >
                  <tr className="h-[44px]">
                    <th scope="col" className="w-[190px] px-3 py-3 text-left font-normal">
                      LOT ID
                    </th>
                    <th scope="col" className="px-3 py-3 text-left font-normal">
                      불량확률
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-normal">
                      잔류리튬
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-normal">
                      규격 대비
                    </th>
                    <th scope="col" className="px-3 py-3 text-center font-normal">
                      SPC
                    </th>
                    <th scope="col" className="px-3 py-3 text-center font-normal">
                      위험등급
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLotRiskRows.length === 0 ? (
                    <>
                      <tr className={`h-[52px] border-b ${isDark ? 'border-slate-700/80' : 'border-slate-100'}`}>
                        <td
                          colSpan={6}
                          rowSpan={LOT_RISK_PAGE_SIZE}
                          className={`px-4 text-center text-sm align-middle ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          {lotRiskFilterActive
                            ? '검색 조건에 해당하는 LOT가 없습니다. 조건을 바꾼 뒤 검색을 눌러 주세요.'
                            : '표시할 LOT 위험등급 데이터가 없습니다.'}
                        </td>
                      </tr>
                      {Array.from({ length: LOT_RISK_PAGE_SIZE - 1 }, (_, i) => (
                        <tr
                          key={`empty-pad-${i}`}
                          className="h-[52px]"
                          aria-hidden="true"
                        />
                      ))}
                    </>
                  ) : (
                  lotRiskTableSlots.map((row, slotIdx) => {
                    if (!row) {
                      return (
                        <tr
                          key={`pad-${slotIdx}`}
                          className={`h-[52px] border-b ${
                            isDark ? 'border-slate-700/40' : 'border-slate-50'
                          }`}
                          aria-hidden="true"
                        >
                          <td className="px-3 py-3" colSpan={6} />
                        </tr>
                      );
                    }
                    const pct = lotRiskProbPercent(row.prob);
                    const spcOut = row.spc.includes('이탈');
                    const spcWarn = row.spc.includes('주의');
                    const isSelected = row.lot === selectedLotRiskId;
                    return (
                      <tr
                        key={row.lot}
                        role="row"
                        tabIndex={0}
                        aria-selected={isSelected}
                        onClick={() => setSelectedLotRiskId(row.lot)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedLotRiskId(row.lot);
                          }
                        }}
                        className={`h-[52px] cursor-pointer border-b transition-colors ${
                          isSelected
                            ? isDark
                              ? 'border-blue-800/60 bg-blue-950/40 ring-1 ring-inset ring-blue-700/50'
                              : 'border-blue-100 bg-blue-50 ring-1 ring-inset ring-blue-200'
                            : row.isCritical
                              ? isDark
                                ? 'border-slate-700/80 bg-red-950/20 hover:bg-red-950/35'
                                : 'border-slate-100 bg-red-50/70 hover:bg-red-50'
                              : isDark
                                ? 'border-slate-700/80 hover:bg-slate-800/60'
                                : 'border-slate-100 hover:bg-gray-50'
                        }`}
                      >
                        <td
                          className={`min-w-[190px] whitespace-nowrap px-3 py-3 font-medium ${
                            isDark ? 'text-slate-200' : 'text-slate-700'
                          }`}
                        >
                          {row.lot}
                        </td>
                        <td className="px-3 py-3">
                          <div
                            className="flex min-w-0 items-center gap-2"
                            aria-label={`${row.lot} 불량확률 ${Math.round(pct)}%`}
                          >
                            <div
                              className={`h-2 min-w-0 flex-1 overflow-hidden rounded-full ${
                                isDark ? 'bg-slate-700' : 'bg-slate-200'
                              }`}
                            >
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span
                              className={`min-w-[2.25rem] shrink-0 tabular-nums ${
                                isDark ? 'text-slate-200' : 'text-slate-700'
                              }`}
                            >
                              {Math.round(pct)}%
                            </span>
                          </div>
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${
                            isDark ? 'text-slate-200' : 'text-slate-700'
                          }`}
                        >
                          {typeof row.predLi === 'number'
                            ? formatNumber(Math.round(row.predLi))
                            : row.predLi || '-'}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${lotRiskMarginClass(
                            row.margin,
                            isDark,
                          )}`}
                        >
                          {formatSpecDistance(row.margin)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                              spcOut
                                ? 'bg-red-100 text-red-600'
                                : spcWarn
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-green-100 text-green-700'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                spcOut ? 'bg-red-500' : spcWarn ? 'bg-orange-500' : 'bg-green-600'
                              }`}
                              aria-hidden="true"
                            />
                            {row.spc}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                              row.grade === '심각'
                                ? 'bg-red-50 text-red-600'
                                : row.grade === '주의'
                                  ? 'bg-orange-50 text-orange-600'
                                  : 'bg-green-50 text-green-600'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                row.grade === '심각'
                                  ? 'bg-red-500'
                                  : row.grade === '주의'
                                    ? 'bg-orange-500'
                                    : 'bg-green-600'
                              }`}
                              aria-hidden="true"
                            />
                            {row.grade}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
              </div>

              <div
                className={`flex min-h-[52px] shrink-0 flex-wrap items-center justify-between gap-2 border-t px-3 py-2 ${
                  isDark ? 'border-slate-700' : 'border-slate-200'
                }`}
              >
                <span
                  className={`text-xs tabular-nums ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {lotRiskTotal > 0 && lotRiskRangeLabel
                    ? `${lotRiskRangeLabel} / 총 ${lotRiskTotal}건`
                    : `0 / 총 ${lotRiskTotal}건`}
                </span>
                <div className="flex flex-wrap items-center justify-center gap-3">
                <nav aria-label="LOT 위험등급 목록 페이지" className="flex w-[440px] shrink-0 items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleLotRiskPageChange(lotRiskSafePage - 1)}
                    disabled={lotRiskSafePage <= 1 || filteredLotRiskRows.length === 0}
                    className={`min-w-12 shrink-0 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    이전
                  </button>
                  {lotRiskPageNumbers.map((page, index) => {
                    if (page === 'ellipsis') {
                      return (
                        <span key={`lot-ellipsis-${index}`} className={`inline-flex w-10 shrink-0 items-center justify-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          …
                        </span>
                      );
                    }
                    const active = page === lotRiskSafePage;
                    return (
                      <button
                        key={page}
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => handleLotRiskPageChange(page)}
                        disabled={filteredLotRiskRows.length === 0}
                        className={`w-10 shrink-0 rounded-lg px-1 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          active
                            ? 'bg-blue-600 text-white'
                            : isDark
                              ? 'border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => handleLotRiskPageChange(lotRiskSafePage + 1)}
                    disabled={
                      lotRiskSafePage >= lotRiskTotalPages ||
                      filteredLotRiskRows.length === 0
                    }
                    className={`min-w-12 shrink-0 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    다음
                  </button>
                </nav>
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleLotRiskPageInputSubmit();
                  }}
                >
                  <label
                    htmlFor="lot-risk-page-jump"
                    className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
                  >
                    페이지
                  </label>
                  <input
                    id="lot-risk-page-jump"
                    type="number"
                    min={1}
                    max={lotRiskTotalPages}
                    value={lotRiskPageInput}
                    onChange={(event) => setLotRiskPageInput(event.target.value)}
                    aria-label="이동할 LOT 위험등급 페이지 번호"
                    className={`h-8 w-16 rounded-lg border px-2 text-center text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/40 ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-200'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  />
                  <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    / {lotRiskTotalPages}
                  </span>
                  <button
                    type="submit"
                    className={`h-8 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    이동
                  </button>
                </form>
                </div>
              </div>
              </div>
            </div>

            <aside
              className={`flex h-[356px] min-h-0 flex-col overflow-hidden rounded-lg border p-4 xl:col-span-4 ${
                isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50/60'
              }`}
            >
              {!selectedLotRisk || !selectedLotRiskDetail ? (
                <div
                  className={`flex flex-1 flex-col items-center justify-center gap-2 text-center ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  <p className="text-sm font-medium">
                    LOT를 선택하면 핵심 분석이 표시됩니다.
                  </p>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3
                        className={`text-base font-semibold ${
                          isDark ? 'text-slate-100' : 'text-slate-900'
                        }`}
                      >
                        LOT 상세 분석
                      </h3>
                      <p
                        className={`mt-0.5 truncate text-xs ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {selectedLotRisk.lot}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        selectedLotRisk.grade === '심각'
                          ? 'bg-red-50 text-red-600'
                          : selectedLotRisk.grade === '주의'
                            ? 'bg-orange-50 text-orange-600'
                            : 'bg-green-50 text-green-600'
                      }`}
                    >
                      {selectedLotRisk.grade}
                    </span>
                  </div>

                  <p
                    className={`mb-3 rounded-lg border-l-4 px-3 py-2 text-sm leading-snug ${
                      selectedLotRisk.isCritical
                        ? isDark
                          ? 'border-red-500 bg-red-950/40 text-red-200'
                          : 'border-red-500 bg-red-50 text-red-900'
                        : isDark
                          ? 'border-amber-500 bg-amber-950/30 text-amber-100'
                          : 'border-amber-400 bg-amber-50 text-amber-950'
                    }`}
                  >
                    {selectedRiskSummary}
                  </p>

                  <div className="mb-3 grid grid-cols-2 gap-2">
                    {[
                      {
                        label: '불량확률',
                        value: `${Math.round(lotRiskProbPercent(selectedLotRisk.prob))}%`,
                      },
                      {
                        label: '예측 잔류리튬',
                        value: typeof selectedLotRisk.predLi === 'number'
                          ? `${formatNumber(Math.round(selectedLotRisk.predLi))} ppm`
                          : selectedLotRisk.predLi || '-',
                      },
                      {
                        label: '규격 대비',
                        value: formatSpecDistance(selectedLotRisk.margin, true),
                        valueClass: lotRiskMarginClass(selectedLotRisk.margin, isDark),
                      },
                      { label: 'SPC', value: selectedLotRisk.spc },
                    ].map((m) => (
                      <div
                        key={m.label}
                        className={`rounded-lg border px-2.5 py-2 ${
                          isDark
                            ? 'border-slate-700/80 bg-slate-800/60'
                            : 'border-slate-100 bg-white/90'
                        }`}
                      >
                        <div
                          className={`text-[11px] ${
                            isDark ? 'text-slate-500' : 'text-slate-400'
                          }`}
                        >
                          {m.label}
                        </div>
                        <div
                          className={`mt-0.5 text-sm font-bold tabular-nums ${
                            m.valueClass ?? (isDark ? 'text-slate-50' : 'text-slate-900')
                          }`}
                        >
                          {m.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mb-3 space-y-2">
                    <p
                      className={`mb-1.5 text-xs font-semibold ${
                        isDark ? 'text-slate-300' : 'text-slate-700'
                      }`}
                    >
                      SPC 관리도
                    </p>
                    {(selectedLotRiskDetail.spc?.metrics || [])
                      .filter((metric) => metric.status.includes('이탈') || metric.status.includes('주의'))
                      .map((metric) => (
                        <SpcChartCard key={metric.key} metric={metric} isDark={isDark} />
                      ))}
                    {(selectedLotRiskDetail.spc?.metrics || []).every(
                      (metric) => !metric.status.includes('이탈') && !metric.status.includes('주의'),
                    ) ? (
                      <p className={`rounded-md px-2.5 py-2 text-xs ${isDark ? 'bg-slate-800/70 text-slate-300' : 'bg-white text-slate-600'}`}>
                        이탈 또는 주의 파라미터가 없습니다.
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-auto pt-1">
                    <p
                      className={`mb-1.5 text-xs font-semibold ${
                        isDark ? 'text-slate-300' : 'text-slate-700'
                      }`}
                    >
                      조치
                    </p>
                    <p
                      className={`text-sm font-medium leading-snug ${
                        isDark ? 'text-slate-100' : 'text-slate-900'
                      }`}
                    >
                      &nbsp;
                    </p>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </section>

        {/* Charts: 생산 추이 + Feature Importance */}
        <section className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className={`flex min-w-0 flex-col p-5 xl:col-span-8 ${cardClass}`}>
            <div className="mb-3">
              <h2
                className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
              >
                일별 품질 동향
              </h2>
              <div
                className={`mt-2 flex flex-wrap items-center gap-3 text-[11px] font-medium ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  양품량 (좌측)
                </span>
                <span className={isDark ? 'text-slate-600' : 'text-slate-300'} aria-hidden>
                  |
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-600" />
                  불량률 (우측)
                </span>
                <span className={isDark ? 'text-slate-600' : 'text-slate-300'} aria-hidden>
                  |
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-0.5 w-4 border-t-2 border-dashed border-violet-600"
                    aria-hidden
                  />
                  예측 불량률
                </span>
              </div>
            </div>

            {trendHasData ? (
              <ProductionTrendChart
                daily={trendDailyAggregates}
                dailyRates={trendDailyRates}
                forecastRates={trendForecastRates}
                isDark={isDark}
              />
            ) : (
              <EmptyState message="표시할 생산 데이터가 없습니다." />
            )}
          </div>

          <div className={`flex min-w-0 flex-col p-5 xl:col-span-4 ${cardClass}`}>
            <FeatureImportancePanel items={featureImportanceItems} isDark={isDark} />
          </div>
        </section>

        {/* Table */}
        <section className={`mb-6 p-5 ${cardClass}`}>
          <div className="mb-3">
            <h2
              className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
            >
              생산 상세 테이블
            </h2>
            <p className={`mt-0.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              cathode_clf_data.csv 기반 일별 생산·불량 집계
            </p>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={searchedDetailRows.length === 0}
                className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDark
                    ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                CSV 다운로드
              </button>
            </div>
          </div>

          {initialLoading ? (
            <EmptyState message="생산 데이터를 불러오는 중입니다." />
          ) : !hasData ? (
            <EmptyState message="선택한 조건에 해당하는 행이 없습니다." />
          ) : searchedDetailRows.length === 0 ? (
            <EmptyState message="검색 조건에 해당하는 생산 데이터가 없습니다." />
          ) : (
            <div className="space-y-3">
              <div
                className={`overflow-x-auto rounded-lg border ${
                  isDark ? 'border-slate-700' : 'border-slate-200'
                }`}
              >
                <table className="w-full min-w-[1220px] border-collapse text-sm">
                  <thead
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      isDark
                        ? 'bg-slate-900/80 text-slate-400'
                        : 'bg-slate-100/70 text-slate-600'
                    }`}
                  >
                    <tr>
                      <th className="w-10 px-2 py-3 text-center">
                        <input
                          ref={selectAllCheckboxRef}
                          type="checkbox"
                          checked={allVisibleSelected}
                          disabled={pagedDetailRows.length === 0}
                          onChange={handleSelectAll}
                          aria-label="현재 화면의 모든 행 선택"
                          className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-3 py-3 text-left">날짜</th>
                      <th className="px-3 py-3 text-right">총생산량</th>
                      <th className="px-3 py-3 text-right">양품 수</th>
                      <th className="px-3 py-3 text-right">불량품 수</th>
                      <th className="px-3 py-3 text-right">불량률</th>
                      <th className="px-3 py-3 text-right">금속 불순물</th>
                      <th className="px-3 py-3 text-right">소성온도 이탈</th>
                      <th className="px-3 py-3 text-right">습도</th>
                      <th className="px-3 py-3 text-right">소성온도×습도</th>
                      <th className="px-3 py-3 text-center">데이터 상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedDetailRows.map((r) => {
                      const highDefect = r.defectRate >= 0.1;
                      const midDefect = r.defectRate >= 0.07 && r.defectRate < 0.1;
                      const defectTone = highDefect
                        ? 'text-rose-600'
                        : midDefect
                          ? 'text-orange-500'
                          : isDark
                            ? 'text-slate-200'
                            : 'text-slate-700';
                      return (
                        <tr
                          key={r.date}
                          className={`border-b transition-colors ${
                            highDefect
                              ? isDark
                                ? 'border-slate-700/80 bg-red-950/15 hover:bg-red-950/25'
                                : 'border-slate-100 bg-red-50/40 hover:bg-red-50/70'
                              : isDark
                                ? 'border-slate-700/80 hover:bg-slate-800/60'
                                : 'border-slate-100 hover:bg-gray-50'
                          }`}
                        >
                          <td className="w-10 px-2 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedItems.includes(r.date)}
                              onChange={() => handleSelectRow(r.date)}
                              aria-label={`${r.date} 행 선택`}
                              className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td
                            className={`whitespace-nowrap px-3 py-3 text-left font-medium ${
                              isDark ? 'text-slate-200' : 'text-slate-700'
                            }`}
                          >
                            {r.date}
                          </td>
                          <td
                            className={`px-3 py-3 text-right font-semibold tabular-nums ${
                              isDark ? 'text-slate-100' : 'text-slate-800'
                            }`}
                          >
                            {formatNumber(r.totalProduction)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right font-semibold tabular-nums ${
                              isDark ? 'text-slate-100' : 'text-slate-800'
                            }`}
                          >
                            {formatNumber(r.goodCount)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right font-semibold tabular-nums ${
                              isDark ? 'text-slate-100' : 'text-slate-800'
                            }`}
                          >
                            {formatNumber(r.defectCount)}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">
                            <span className={defectTone}>
                              {formatPercent(r.defectRate)}
                            </span>
                          </td>
                          <td
                            className={`px-3 py-3 text-right tabular-nums ${
                              isDark ? 'text-slate-200' : 'text-slate-700'
                            }`}
                          >
                            {r.metalImpurity == null ? '-' : r.metalImpurity.toFixed(3)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right tabular-nums ${
                              isDark ? 'text-slate-200' : 'text-slate-700'
                            }`}
                          >
                            {r.tempDevFrom800 == null ? '-' : r.tempDevFrom800.toFixed(2)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right tabular-nums ${
                              isDark ? 'text-slate-200' : 'text-slate-700'
                            }`}
                          >
                            {r.humidity == null ? '-' : r.humidity.toFixed(2)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right tabular-nums ${
                              isDark ? 'text-slate-200' : 'text-slate-700'
                            }`}
                          >
                            {r.tempXHumidity == null ? '-' : r.tempXHumidity.toFixed(1)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span
                              className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                r.status === '수집 중' || r.status === '부분 채점'
                                  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                                  : isDark
                                    ? 'bg-slate-800 text-slate-300 ring-1 ring-slate-600'
                                    : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div
                className={`mb-2 flex flex-col items-center gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:justify-between ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/70'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <p
                  className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
                >
                  {tableStatusText}
                </p>
                <nav
                  aria-label="생산 상세 테이블 페이지"
                  className="flex flex-wrap items-center justify-center gap-1.5"
                >
                  <button
                    type="button"
                    onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                    disabled={tableSafePage <= 1}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    이전
                  </button>
                  {tablePageNumbers.map((item, idx) =>
                    item === 'ellipsis' ? (
                      <span
                        key={`e-${idx}`}
                        className={`px-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        aria-current={item === tableSafePage ? 'page' : undefined}
                        onClick={() => setTablePage(item)}
                        className={`min-w-8 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          item === tableSafePage
                            ? 'bg-blue-600 text-white'
                            : isDark
                              ? 'border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => setTablePage((p) => Math.min(tableTotalPages, p + 1))}
                    disabled={tableSafePage >= tableTotalPages}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    다음
                  </button>
                </nav>
              </div>
            </div>
          )}
        </section>

      </div>

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={dismissToast} />
        ))}
      </div>

    </div>
  );
};
