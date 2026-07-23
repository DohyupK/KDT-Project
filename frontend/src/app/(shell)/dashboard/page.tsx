'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';

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

type StaffMember = {
  id: string;
  name: string;
  department: string;
  rank: string;
  email: string;
};

type AutoSendFrequency = '일일' | '주간' | '월간';

type AutoSendConfig = {
  frequency: AutoSendFrequency;
  time: string;
  email: string;
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
/* Process 2.5D Visualization Types                                           */
/* -------------------------------------------------------------------------- */

type ProcessStageStatus = '정상' | '주의' | '위험';

type StageMetric = {
  label: string;
  value: string;
  normalRange?: string;
};

type StageIssue = {
  cause: string;
  detail: string;
  recommendation: string;
  aiSummary: string;
};

type ProcessStage = {
  id: string;
  name: string;
  shortLabel: string;
  status: ProcessStageStatus;
  metrics: StageMetric[];
  issue?: StageIssue;
  affectedLots: number;
  lastUpdated: string;
  delta: string;
};

type ProcessViewMode = 'all' | 'issues';

type ProcessVizTheme = {
  panel: string;
  panelAlt: string;
  line: string;
  text: string;
  muted: string;
  blue: string;
  green: string;
  orange: string;
  red: string;
  yellow: string;
};

/* -------------------------------------------------------------------------- */
/* Constants & Mock Data                                                      */
/* -------------------------------------------------------------------------- */

const DEFECT_TYPES: DefectType[] = ['기계 결함', '원자재 불량', '작업자 실수', '온도 이상'];

const STAFF_MEMBERS: StaffMember[] = [
  { id: 's1', name: '김민수', department: '생산관리', rank: '과장', email: 'minsu.kim@factory.com' },
  { id: 's2', name: '이서연', department: '품질보증', rank: '대리', email: 'seoyeon.lee@factory.com' },
  { id: 's3', name: '박준호', department: '설비보전', rank: '차장', email: 'junho.park@factory.com' },
  { id: 's4', name: '최유진', department: '공정개선', rank: '사원', email: 'yujin.choi@factory.com' },
  { id: 's5', name: '정하늘', department: '생산관리', rank: '팀장', email: 'haneul.jung@factory.com' },
  { id: 's6', name: '한도윤', department: '품질보증', rank: '과장', email: 'doyoon.han@factory.com' },
];

const CHART_COLORS = ['#2563eb', '#0d9488', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

type ExpandStep = 10 | 50 | 100 | 'all';

const EXPAND_STEP_OPTIONS: Array<{ value: ExpandStep; label: string }> = [
  { value: 10, label: '10개씩' },
  { value: 50, label: '50개씩' },
  { value: 100, label: '100개씩' },
  { value: 'all', label: '전부 펼치기' },
];

const INITIAL_VISIBLE_COUNT = 10;

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

/** 양극재 LOT 단위 Mock — 날짜 필터·KPI·차트 공통 원천 */
function buildCathodeLots(): CathodeLot[] {
  const rand = seededRandom(20260520);
  const lots: CathodeLot[] = [];
  const start = parseDate('2026-05-01');
  const dayCount = 45;
  const totalLots = 10000;
  const peakDay = 19; // 2026-05-20

  // 일별 가중치: 5/20 전후 피크 (~2,400 LOT)
  const weights: number[] = [];
  for (let d = 0; d < dayCount; d += 1) {
    const dist = Math.abs(d - peakDay);
    weights.push(Math.exp(-(dist * dist) / (2 * 1.72 * 1.72)));
  }
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const dayCounts: number[] = weights.map((w) => Math.floor((totalLots * w) / weightSum));
  let assigned = dayCounts.reduce((s, n) => s + n, 0);
  dayCounts[peakDay] += totalLots - assigned;

  for (let dayOffset = 0; dayOffset < dayCount; dayOffset += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + dayOffset);
    const date = formatDate(d);
    const count = dayCounts[dayOffset];

    for (let i = 0; i < count; i += 1) {
      // ~91.3% 합격 (quality_defect === 0)
      const qualityDefect: 0 | 1 = rand() < 0.087 ? 1 : 0;
      const capacity = 190 + rand() * 20 + (rand() - 0.5) * 4;
      const metalImpurity = 0.016 + rand() * 0.016 + (qualityDefect ? 0.004 : 0);
      const sinteringTemp = 780 + rand() * 40 + (rand() - 0.5) * 6;

      lots.push({
        date,
        capacity: Math.round(capacity * 10) / 10,
        qualityDefect,
        metalImpurity: Math.round(metalImpurity * 1e6) / 1e6,
        sinteringTemp: Math.round(sinteringTemp * 10) / 10,
      });
    }
  }

  return lots;
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
      { key: 'total', label: '총 생산량 (LOT)', value: '-', unit: '', sub: '선택 기간 총 생산 실적' },
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
        key: 'peak',
        label: '최고 생산일 & 실적',
        value: '-',
        unit: '',
        sub: '일간 최고 실적',
      },
    ];
  }

  const total = lots.length;
  let capacitySum = 0;
  let passCount = 0;
  let metalSum = 0;
  let sinterSum = 0;
  const daily = new Map<string, number>();

  for (const lot of lots) {
    capacitySum += lot.capacity;
    if (lot.qualityDefect === 0) passCount += 1;
    metalSum += lot.metalImpurity;
    sinterSum += lot.sinteringTemp;
    daily.set(lot.date, (daily.get(lot.date) ?? 0) + 1);
  }

  const avgCapacity = capacitySum / total;
  const passRate = passCount / total;
  const avgMetal = metalSum / total;
  const avgSinter = sinterSum / total;

  let peakDate = '';
  let peakCount = 0;
  for (const [date, count] of daily) {
    if (count > peakCount) {
      peakCount = count;
      peakDate = date;
    }
  }

  const passOk = passRate >= 0.9;
  const metalWarn = avgMetal > 0.028;

  return [
    {
      key: 'total',
      label: '총 생산량 (LOT)',
      value: formatNumber(total),
      unit: '개',
      sub: '선택 기간 총 생산 실적',
    },
    {
      key: 'capacity',
      label: '평균 방전 용량',
      value: avgCapacity.toFixed(1),
      unit: 'mAh/g',
      sub: '양극재 방전 용량 평균 (목표 195~205)',
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
      key: 'peak',
      label: '최고 생산일 & 실적',
      value: formatNumber(peakCount),
      unit: '개',
      sub: peakDate ? `${peakDate} 달성 (일간 최고)` : '일간 최고 실적',
    },
  ];
}

const MOCK_LOTS: CathodeLot[] = buildCathodeLots();
const MOCK_RECORDS: ProductionRecord[] = lotsToProductionRecords(MOCK_LOTS);

const DATA_MIN_DATE = MOCK_LOTS.reduce(
  (min, r) => (r.date < min ? r.date : min),
  MOCK_LOTS[0].date,
);
const DATA_MAX_DATE = MOCK_LOTS.reduce(
  (max, r) => (r.date > max ? r.date : max),
  MOCK_LOTS[0].date,
);

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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
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

function Modal({
  open,
  title,
  onClose,
  children,
  widthClass = 'w-[920px]',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const handleBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-6 py-10"
      onClick={handleBackdrop}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative ${widthClass} max-h-[calc(100vh-5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2.5 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="모달 닫기"
          >
            닫기
          </button>
        </div>
        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto px-6 py-5">{children}</div>
      </div>
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
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
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
      <p className="mt-2 flex items-baseline gap-1.5 tracking-tight text-slate-800">
        <span className="text-2xl font-bold">{value}</span>
        {unit ? <span className="text-xs font-medium text-slate-400">{unit}</span> : null}
      </p>
      {sub ? <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{sub}</p> : null}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[140px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
      {message}
    </div>
  );
}

function ProductionTrendChart({
  daily,
  dailyRates = [],
}: {
  daily: DailyAggregate[];
  dailyRates?: Array<{ date: string; rate: number | null }>;
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
  const maxRate = Math.max(...Array.from(rateByDate.values()), 0.001);
  const n = daily.length;
  const barW = Math.max(4, (innerW / n) * 0.65);

  const points = daily.map((d, i) => {
    const x = pad.left + (innerW / n) * i + (innerW / n - barW) / 2 + barW / 2;
    const y = pad.top + innerH - (d.production / maxY) * innerH;
    const rate = rateByDate.get(d.date) ?? null;
    const rateY =
      rate === null ? null : pad.top + innerH - (rate / maxRate) * innerH;
    return { ...d, x, y, rate, rateY };
  });

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
  const labelStep = Math.max(1, Math.ceil(n / 8));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[280px] w-full"
      role="img"
      aria-label="날짜별 생산량 및 불량률 이중 축 차트"
    >
      {yTicks.map((t) => (
        <g key={`prod-${t.v}`}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={t.y}
            y2={t.y}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
          <text x={pad.left - 8} y={t.y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
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
          rx={2}
        >
          <title>{`${p.date}: ${formatNumber(p.production)}`}</title>
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
              r={4.5}
              fill="#ea580c"
              stroke="#ffffff"
              strokeWidth={2}
            >
              <title>{`${p.date}: 불량률 ${formatPercent(p.rate)}`}</title>
            </circle>
          ))}
        </>
      ) : null}
      {points.map((p, i) =>
        i % labelStep === 0 || i === n - 1 ? (
          <text
            key={`label-${p.date}`}
            x={p.x}
            y={height - 12}
            textAnchor="middle"
            className="fill-slate-500 text-[10px]"
          >
            {p.date.slice(5)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function ExpandStepDropdown({
  value,
  onChange,
}: {
  value: ExpandStep;
  onChange: (next: ExpandStep) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: globalThis.MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const selectedLabel =
    EXPAND_STEP_OPTIONS.find((opt) => opt.value === value)?.label ?? '10개씩';

  return (
    <div ref={rootRef} className="relative z-20 shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex min-w-[120px] items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
          open
            ? 'border-blue-500 text-blue-700 ring-2 ring-blue-500/20'
            : 'border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        <span>{selectedLabel}</span>
        <svg
          viewBox="0 0 16 16"
          className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        className={`absolute bottom-full right-0 mb-2 w-full min-w-[140px] origin-bottom overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg transition-all duration-150 ${
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-1 scale-95 opacity-0'
        }`}
        role="listbox"
        aria-hidden={!open}
      >
        <ul className="py-1">
          {EXPAND_STEP_OPTIONS.map((opt) => {
            const selected = opt.value === value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-50 focus:outline-none ${
                    selected ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700'
                  }`}
                >
                  <span>{opt.label}</span>
                  {selected ? (
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3.5 8.5l3 3 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Process 2.5D Visualization                                                 */
/* -------------------------------------------------------------------------- */

const PROCESS_VIZ_THEME: ProcessVizTheme = {
  panel: '#ffffff',
  panelAlt: '#f8fafc',
  line: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  blue: '#3b82f6',
  green: '#22c55e',
  orange: '#f59e0b',
  red: '#ef4444',
  yellow: '#eab308',
};

function processStatusColor(status: ProcessStageStatus) {
  if (status === '정상') return PROCESS_VIZ_THEME.green;
  if (status === '주의') return PROCESS_VIZ_THEME.orange;
  return PROCESS_VIZ_THEME.red;
}

function processStatusRank(status: ProcessStageStatus) {
  if (status === '위험') return 3;
  if (status === '주의') return 2;
  return 1;
}

function buildProcessStages(seed: number): ProcessStage[] {
  const sinterTemp = 830 + (seed % 5) * 3;
  const sinterRisk: ProcessStageStatus = sinterTemp >= 840 ? '위험' : sinterTemp >= 834 ? '주의' : '정상';
  const rpm = 1220 + (seed % 7) * 5;
  const rpmStatus: ProcessStageStatus = rpm >= 1245 ? '주의' : '정상';
  const feed = Math.round((99.0 + (seed % 4) * 0.15) * 10) / 10;
  const ni = Math.round((0.8 + (seed % 3) * 0.005) * 100) / 100;
  const cool = Math.round((1.6 + (seed % 5) * 0.2) * 10) / 10;
  const pass = Math.round((97.2 + (seed % 6) * 0.15) * 10) / 10;
  const waitLots = 8 + (seed % 9);

  return [
    {
      id: 'feed',
      name: '원료 투입',
      shortLabel: feed >= 99.5 ? '투입 안정' : '투입비 편차 모니터링',
      status: feed < 99.1 ? '주의' : '정상',
      metrics: [
        { label: '투입비', value: `${feed}%`, normalRange: '99.0~100.5%' },
        { label: '계량 편차', value: `${Math.round((100.2 - feed) * 10) / 10}%` },
      ],
      issue: {
        cause: '원료 투입비 편차',
        detail: '계량기 보정 주기 지연으로 배합비 미세 이탈이 관찰됩니다.',
        recommendation: '계량기 보정, 배합비 재확인',
        aiSummary: '투입비 편차가 후단 조성/소성 품질 변동으로 전파될 수 있습니다.',
      },
      affectedLots: feed < 99.1 ? 1 : 0,
      lastUpdated: '2026-07-22 10:38:02',
      delta: feed < 99.1 ? '-0.4%p' : '+0.1%p',
    },
    {
      id: 'mix',
      name: '혼합 / 분쇄',
      shortLabel: rpmStatus === '주의' ? 'RPM 변동 감지' : '혼합 안정',
      status: rpmStatus,
      metrics: [
        { label: 'RPM', value: String(rpm), normalRange: '1180~1240' },
        { label: '혼합 시간', value: `${28 + (seed % 3)}분` },
      ],
      issue: {
        cause: 'RPM 변동, 혼합 시간 편차',
        detail: '모터 부하 변동으로 회전수 편차가 발생했습니다.',
        recommendation: '회전수 재조정, 모터/베어링 점검',
        aiSummary: 'RPM 상향이 지속되면 입도 분포가 넓어져 검사 불량률이 증가할 수 있습니다.',
      },
      affectedLots: rpmStatus === '주의' ? 1 : 0,
      lastUpdated: '2026-07-22 10:39:41',
      delta: rpmStatus === '주의' ? `+${rpm - 1240}` : '+8',
    },
    {
      id: 'compose',
      name: '조성 단계 / 전구체 준비',
      shortLabel: ni > 0.81 ? 'Ni 비율 상한 근접' : '조성 비율 양호',
      status: ni > 0.812 ? '주의' : '정상',
      metrics: [
        { label: 'Ni 비율', value: String(ni), normalRange: '0.79~0.81' },
        { label: '수분', value: `${0.18 + (seed % 3) * 0.01}%` },
      ],
      issue: {
        cause: '조성 비율 이탈',
        detail: '원재료 lot 편차로 Ni 비율이 목표 상한을 초과했습니다.',
        recommendation: '레시피 재검토, 원재료 lot 확인',
        aiSummary: '조성 비율 이탈은 소성 후 용량/안전성 지표에 영향을 줄 수 있습니다.',
      },
      affectedLots: ni > 0.812 ? 1 : 0,
      lastUpdated: '2026-07-22 10:40:18',
      delta: ni > 0.81 ? `+${Math.round((ni - 0.81) * 1000) / 1000}` : '0.00',
    },
    {
      id: 'sinter',
      name: '소성',
      shortLabel: sinterRisk === '위험' ? '3구역 온도 상한 초과' : '소성 온도 모니터링',
      status: sinterRisk,
      metrics: [
        { label: '3구역 온도', value: `${sinterTemp}℃`, normalRange: '810~830℃' },
        { label: 'O2 농도', value: `${(19.4 - (seed % 3) * 0.2).toFixed(1)}%` },
      ],
      issue: {
        cause: 'zone 온도 상승, O2 농도 저하, 체류시간 편차',
        detail: '히터 출력 편차와 산소 공급 저하가 동시에 관찰됩니다.',
        recommendation: '히터 출력 5% 감쇠, 가스 유량 점검, conveyor 속도 점검, 센서 교정 확인',
        aiSummary: '온도 상승과 산소 농도 저하가 동시에 발생하여 불량 위험이 증가하는 패턴입니다.',
      },
      affectedLots: sinterRisk === '위험' ? 2 : sinterRisk === '주의' ? 1 : 0,
      lastUpdated: '2026-07-22 10:42:15',
      delta: `+${sinterTemp - 830}℃`,
    },
    {
      id: 'classify',
      name: '분급 / 냉각',
      shortLabel: cool > 2.2 ? '냉각 편차 확대' : '냉각 안정',
      status: cool > 2.4 ? '주의' : '정상',
      metrics: [
        { label: '냉각 편차', value: `${cool}%`, normalRange: '0~2.2%' },
        { label: '분급 수율', value: `${96.5 + (seed % 4) * 0.2}%` },
      ],
      issue: {
        cause: '냉각 속도 불균형, 분급 편차',
        detail: '냉각팬 풍량 편차로 배치 간 온도 하강 속도가 불균형합니다.',
        recommendation: '냉각팬 상태 확인, 분급기 세팅 조정',
        aiSummary: '냉각 편차가 커지면 입자 응집/입도 불량이 증가할 수 있습니다.',
      },
      affectedLots: cool > 2.4 ? 1 : 0,
      lastUpdated: '2026-07-22 10:43:02',
      delta: cool > 2.2 ? `+${(cool - 2.0).toFixed(1)}%p` : '+0.2%p',
    },
    {
      id: 'inspect',
      name: '검사 / 품질 판정',
      shortLabel: pass < 97.5 ? '합격률 하락' : '검사 양호',
      status: pass < 97.4 ? '주의' : '정상',
      metrics: [
        { label: '합격률', value: `${pass}%`, normalRange: '97.5% 이상' },
        { label: '입도 Cv', value: `${(3.1 + (seed % 4) * 0.1).toFixed(1)}%` },
      ],
      issue: {
        cause: '불량률 상승, 입도/밀도 편차',
        detail: '이전 공정(소성/분급) 편차가 최종 검사 지표로 전이되었습니다.',
        recommendation: '이전 공정 이력 추적, 검사 기준 및 샘플링 재점검',
        aiSummary: '합격률 하락은 단일 검사 이슈보다 상류 공정 누적 편차 가능성이 큽니다.',
      },
      affectedLots: pass < 97.4 ? 2 : 0,
      lastUpdated: '2026-07-22 10:44:11',
      delta: pass < 97.5 ? `${(pass - 98).toFixed(1)}%p` : '+0.2%p',
    },
    {
      id: 'pack',
      name: '포장 / 출하 대기',
      shortLabel: waitLots > 12 ? '출하 적체' : '출하 대기 정상',
      status: waitLots > 14 ? '주의' : '정상',
      metrics: [
        { label: '출하 대기', value: `${waitLots} LOT`, normalRange: '10 LOT 이하' },
        { label: '라벨링 지연', value: `${seed % 4}건` },
      ],
      issue: {
        cause: '라벨링 지연, 출하 적체',
        detail: '포장 라인 처리량 대비 대기 LOT가 증가했습니다.',
        recommendation: '포장 라인 처리량 확인, 출하 스케줄 조정',
        aiSummary: '출하 적체는 품질 이슈보다 물류 병목일 가능성이 높습니다.',
      },
      affectedLots: waitLots > 14 ? 1 : 0,
      lastUpdated: '2026-07-22 10:45:00',
      delta: waitLots > 12 ? `+${waitLots - 10} LOT` : '0 LOT',
    },
  ];
}

function pickDefaultProcessStage(stages: ProcessStage[]) {
  const sorted = [...stages].sort(
    (a, b) => processStatusRank(b.status) - processStatusRank(a.status) || b.affectedLots - a.affectedLots,
  );
  return sorted[0]?.id ?? stages[0]?.id ?? '';
}

function processStatusBadgeClass(status: ProcessStageStatus): string {
  if (status === '위험') {
    return 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200';
  }
  if (status === '주의') {
    return 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200';
  }
  return 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200';
}

function ProcessStageNode({
  stage,
  step,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  stage: ProcessStage;
  step: number;
  selected: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const color = processStatusColor(stage.status);
  const lift = hovered || selected;
  const face = selected ? '#eff6ff' : PROCESS_VIZ_THEME.panel;
  const topFace =
    stage.status === '위험' ? '#ffe4e6' : stage.status === '주의' ? '#fffbeb' : '#ecfdf5';
  const sideFace =
    stage.status === '위험' ? '#fecdd3' : stage.status === '주의' ? '#fde68a' : '#dbeafe';

  return (
    <button
      type="button"
      onClick={() => onSelect(stage.id)}
      onMouseEnter={() => onHover(stage.id)}
      onMouseLeave={() => onHover(null)}
      title={`${stage.name} · ${stage.status} · ${stage.metrics[0]?.value ?? ''}`}
      className={`relative w-full min-w-0 rounded-xl text-left transition duration-150 ${
        selected ? 'z-10 ring-2 ring-blue-500 shadow-md' : 'ring-0 shadow-sm'
      }`}
      style={{
        border: 0,
        background: 'transparent',
        padding: 0,
        cursor: 'pointer',
        transform: lift ? 'translateY(-3px)' : 'translateY(0)',
        filter:
          stage.status === '위험'
            ? `drop-shadow(0 0 ${selected ? 10 : 6}px rgba(244,63,94,0.3))`
            : stage.status === '주의'
              ? `drop-shadow(0 0 ${selected ? 8 : 5}px rgba(245,158,11,0.25))`
              : undefined,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 6,
          right: 0,
          top: 7,
          bottom: -3,
          background: sideFace,
          borderRadius: 10,
          transform: 'skewY(-3deg)',
        }}
      />
      <div
        className="relative overflow-hidden rounded-xl"
        style={{
          border: `1.5px solid ${
            selected
              ? PROCESS_VIZ_THEME.blue
              : stage.status === '주의'
                ? '#f59e0b'
                : stage.status === '위험'
                  ? '#f43f5e'
                  : '#cbd5e1'
          }`,
          background: face,
        }}
      >
        <div
          style={{
            height: 10,
            background: topFace,
            borderBottom: `1px solid ${PROCESS_VIZ_THEME.line}`,
          }}
        />
        <div className="px-2.5 pb-2.5 pt-2 sm:px-3">
          <div className="mb-1.5 flex items-center justify-between gap-1.5">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-extrabold text-white">
              {step}
            </span>
            <span
              className={`shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold ${processStatusBadgeClass(stage.status)}`}
            >
              {stage.status}
            </span>
          </div>
          <strong
            className="mb-1 block truncate text-[11px] font-bold leading-tight text-slate-800 sm:text-xs"
            title={stage.name}
          >
            {stage.name}
          </strong>
          <div
            className="line-clamp-2 min-h-[28px] text-[10px] leading-snug text-slate-500"
            title={stage.shortLabel}
          >
            {stage.shortLabel}
          </div>
          <div className="mt-2 grid gap-1">
            {stage.metrics.slice(0, 2).map((metric) => (
              <div
                key={metric.label}
                className="flex items-baseline justify-between gap-1 text-[10px]"
              >
                <span className="truncate text-slate-400">{metric.label}</span>
                <span className="shrink-0 font-extrabold text-slate-800">{metric.value}</span>
              </div>
            ))}
          </div>
        </div>
        {stage.status === '위험' || stage.status === '주의' ? (
          <span
            className="absolute left-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black text-white"
            style={{ background: color, boxShadow: `0 0 6px ${color}` }}
          >
            !
          </span>
        ) : null}
      </div>
    </button>
  );
}

function ProcessFlowVisualizationSection({ seed }: { seed: number }) {
  const [viewMode, setViewMode] = useState<ProcessViewMode>('all');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const stages = useMemo(() => buildProcessStages(seed), [seed]);
  const [selectedId, setSelectedId] = useState(() =>
    pickDefaultProcessStage(buildProcessStages(seed)),
  );

  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < 980);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const next = buildProcessStages(seed);
    setSelectedId(pickDefaultProcessStage(next));
  }, [seed]);

  const issueStages = useMemo(
    () => stages.filter((stage) => stage.status !== '정상'),
    [stages],
  );

  const visibleStages = useMemo(() => {
    if (viewMode === 'issues') return issueStages;
    return stages;
  }, [stages, issueStages, viewMode]);

  useEffect(() => {
    if (visibleStages.length === 0) return;
    if (!visibleStages.some((s) => s.id === selectedId)) {
      setSelectedId(pickDefaultProcessStage(visibleStages));
    }
  }, [visibleStages, selectedId]);

  const selectedStage = useMemo(() => {
    return stages.find((stage) => stage.id === selectedId) ?? stages[0] ?? null;
  }, [stages, selectedId]);

  const selectedStep = useMemo(() => {
    if (!selectedStage) return 0;
    const idx = stages.findIndex((s) => s.id === selectedStage.id);
    return idx >= 0 ? idx + 1 : 0;
  }, [stages, selectedStage]);

  const dangerCount = stages.filter((stage) => stage.status === '위험').length;
  const warnCount = stages.filter((stage) => stage.status === '주의').length;
  const issueCount = warnCount + dangerCount;
  const affectedLots = stages.reduce((sum, stage) => sum + stage.affectedLots, 0);
  const overallStatus: ProcessStageStatus =
    dangerCount > 0 ? '위험' : warnCount > 0 ? '주의' : '정상';
  const lastUpdated =
    stages.slice().sort((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1))[0]?.lastUpdated ??
    '2026-07-22 10:42:15';

  const stageIndexById = useMemo(() => {
    const map = new Map<string, number>();
    stages.forEach((s, i) => map.set(s.id, i + 1));
    return map;
  }, [stages]);

  return (
    <section className="mb-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">양극재 생산 공정 시각화</h2>
          <p className="mt-1 text-sm text-slate-500">
            공정 흐름, 이상 위치, 추정 원인, 권장 대처방안을 직관적으로 확인
          </p>
        </div>
      </div>

      <div
        className={`mb-3.5 grid gap-2.5 ${isNarrow ? 'grid-cols-2' : 'grid-cols-4'}`}
      >
        {[
          { label: '전체 공정 상태', value: overallStatus, accent: true },
          { label: '주의/위험 공정', value: `${issueCount}` },
          { label: '영향 LOT', value: `${affectedLots}` },
          { label: '마지막 갱신', value: lastUpdated, compact: true },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3"
          >
            <div className="text-[11px] font-semibold text-slate-500">{item.label}</div>
            <div
              className={`mt-1.5 font-extrabold tracking-tight ${
                item.compact ? 'text-sm text-slate-800' : 'text-xl text-slate-900'
              }`}
              style={
                item.accent ? { color: processStatusColor(overallStatus) } : undefined
              }
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {(['정상', '주의', '위험'] as ProcessStageStatus[]).map((status) => (
            <span
              key={status}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  status === '정상'
                    ? 'bg-emerald-500'
                    : status === '주의'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                }`}
              />
              {status}
            </span>
          ))}
        </div>

        <div
          role="tablist"
          aria-label="공정 표시 필터"
          className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'all'}
            onClick={() => setViewMode('all')}
            className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold transition ${
              viewMode === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            전체 ({stages.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'issues'}
            onClick={() => setViewMode('issues')}
            className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold transition ${
              viewMode === 'issues'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            이상 공정만 ({issueCount})
          </button>
        </div>
      </div>

      <div className="grid gap-3.5">
        <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-indigo-50/40 p-3 sm:p-4">
          {visibleStages.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500">
              이상 공정이 없습니다. 전체 보기로 전환해 주세요.
            </div>
          ) : (
            <div
              className={`grid gap-2.5 ${
                isNarrow ? 'grid-cols-2' : 'grid-cols-7'
              }`}
            >
              {visibleStages.map((stage) => (
                <ProcessStageNode
                  key={stage.id}
                  stage={stage}
                  step={stageIndexById.get(stage.id) ?? 0}
                  selected={selectedId === stage.id}
                  hovered={hoveredId === stage.id}
                  onHover={setHoveredId}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
          {selectedStage ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">
                  {selectedStep}. {selectedStage.name} 공정 세부 모니터링
                </h3>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${processStatusBadgeClass(selectedStage.status)}`}
                >
                  {selectedStage.status}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {/* Card A — metrics */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold text-slate-500">현재 측정값 & 기준범위</p>
                  <div className="mt-3 space-y-2.5">
                    {selectedStage.metrics.map((m) => (
                      <div
                        key={m.label}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-slate-500">{m.label}</p>
                          <p className="text-sm font-bold text-slate-800">{m.value}</p>
                        </div>
                        <span className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200/80">
                          {m.normalRange ?? '-'}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                      <span className="text-[11px] font-semibold text-blue-700">편차</span>
                      <span className="rounded-md bg-white px-2 py-0.5 text-xs font-bold text-blue-800 ring-1 ring-blue-200/70">
                        {selectedStage.delta}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      최근 이벤트 · {selectedStage.lastUpdated}
                    </p>
                  </div>
                </div>

                {/* Card B — cause & recommendation */}
                <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-4 shadow-sm">
                  <p className="text-xs font-semibold text-amber-800">추정 원인 & 권장 대처방안</p>
                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg border border-amber-200/50 bg-white/70 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700/80">
                        추정 원인
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {selectedStage.issue?.cause ?? '특이 이상 없음'}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        {selectedStage.issue?.detail ??
                          '현재 측정값이 허용 범위 내에서 안정적으로 유지되고 있습니다.'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-blue-200/50 bg-blue-50/70 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700/80">
                        권장 대처방안
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-700">
                        {selectedStage.issue?.recommendation ??
                          '현재 정상 범위입니다. 주기 점검만 유지하세요.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card C — AI summary */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-[11px] font-black text-white"
                      aria-hidden
                    >
                      AI
                    </span>
                    <p className="text-xs font-semibold text-slate-500">AI 분석 요약 & 영향 LOT</p>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-700">
                    {selectedStage.issue?.aiSummary ??
                      '선택 공정은 안정 구간입니다. 상류/하류 연계 지표만 주기적으로 확인하면 됩니다.'}
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200/80">
                    <span className="text-[11px] font-medium text-slate-500">영향 LOT 수</span>
                    <span className="text-sm font-extrabold text-slate-900">
                      {selectedStage.affectedLots}건
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500">표시할 공정이 없습니다.</div>
          )}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function DashBoardPage() {
  const [draftFilter, setDraftFilter] = useState({
    startDate: DATA_MIN_DATE,
    endDate: DATA_MAX_DATE,
  });
  const [appliedFilter, setAppliedFilter] = useState({
    startDate: DATA_MIN_DATE,
    endDate: DATA_MAX_DATE,
  });
  const { startDate, endDate } = appliedFilter;
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const toastIdRef = useRef(0);

  const [reportOpen, setReportOpen] = useState(false);
  const [autoSendOpen, setAutoSendOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);

  const [autoSendDraft, setAutoSendDraft] = useState<AutoSendConfig>({
    frequency: '주간',
    time: '09:00',
    email: '',
  });
  const [autoSendSaved, setAutoSendSaved] = useState<AutoSendConfig | null>(null);
  const [tableFilterDraft, setTableFilterDraft] = useState({
    startDate: '',
    endDate: '',
  });
  const [tableFilterApplied, setTableFilterApplied] = useState({
    startDate: '',
    endDate: '',
  });
  const [expandStep, setExpandStep] = useState<ExpandStep>(10);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [processSeed, setProcessSeed] = useState(3);

  const pushToast = useCallback((message: string, variant: ToastState['variant']) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const filteredLots = useMemo(() => {
    if (startDate > endDate) return [];
    return MOCK_LOTS.filter((lot) => lot.date >= startDate && lot.date <= endDate);
  }, [startDate, endDate]);

  const filteredRecords = useMemo(() => {
    if (startDate > endDate) return [];
    return MOCK_RECORDS.filter((r) => r.date >= startDate && r.date <= endDate);
  }, [startDate, endDate]);

  const hasData = filteredLots.length > 0;
  const detailedKpis = useMemo(() => computeDetailedKpis(filteredLots), [filteredLots]);

  const dailyAggregates: DailyAggregate[] = useMemo(() => {
    const map = new Map<string, DailyAggregate>();
    for (const r of filteredRecords) {
      const cur = map.get(r.date) ?? {
        date: r.date,
        production: 0,
        defectCount: 0,
        targetProduction: 0,
      };
      cur.production += r.production;
      cur.defectCount += r.defectCount;
      cur.targetProduction += r.targetProduction;
      map.set(r.date, cur);
    }
    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [filteredRecords]);

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

  const tableRows = useMemo(() => {
    return filteredRecords
      .slice()
      .sort((a, b) => (a.date === b.date ? 0 : a.date > b.date ? -1 : 1))
      .map((r) => ({
        ...r,
        defectRate: safeRate(r.defectCount, r.production),
        achievementRate: safeRate(r.production, r.targetProduction),
      }));
  }, [filteredRecords]);

  const detailFilteredRows = useMemo(() => {
    const { startDate: tStart, endDate: tEnd } = tableFilterApplied;
    const hasInvalidDateRange = tStart !== '' && tEnd !== '' && tStart > tEnd;
    if (hasInvalidDateRange) return [];

    return tableRows.filter((r) => {
      if (tStart !== '' && r.date < tStart) return false;
      if (tEnd !== '' && r.date > tEnd) return false;
      return true;
    });
  }, [tableRows, tableFilterApplied]);

  const visibleTableRows = useMemo(() => {
    return detailFilteredRows.slice(0, visibleCount);
  }, [detailFilteredRows, visibleCount]);

  const totalDetailCount = detailFilteredRows.length;
  const clampedVisibleCount = Math.min(visibleCount, totalDetailCount);
  const hiddenRowCount = Math.max(0, totalDetailCount - clampedVisibleCount);
  const canExpand = hiddenRowCount > 0;
  const canCollapse = clampedVisibleCount > INITIAL_VISIBLE_COUNT;

  const hasAppliedTableFilters =
    tableFilterApplied.startDate !== '' || tableFilterApplied.endDate !== '';

  const hasDraftTableFilters =
    tableFilterDraft.startDate !== '' || tableFilterDraft.endDate !== '';

  const handleSearchTableFilters = () => {
    const { startDate: tStart, endDate: tEnd } = tableFilterDraft;
    if (tStart !== '' && tEnd !== '' && tStart > tEnd) {
      pushToast('테이블 필터: 시작일이 종료일보다 늦을 수 없습니다.', 'error');
      return;
    }
    setTableFilterApplied({ ...tableFilterDraft });
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  };

  const handleResetTableFilters = () => {
    const empty = {
      startDate: '',
      endDate: '',
    };
    setTableFilterDraft(empty);
    setTableFilterApplied(empty);
    setExpandStep(10);
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  };

  const handleExpandRows = () => {
    if (expandStep === 'all') {
      setVisibleCount(totalDetailCount);
      return;
    }
    setVisibleCount((prev) => Math.min(prev + expandStep, totalDetailCount));
  };

  const handleCollapseRows = () => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  };

  const tableStatusText =
    totalDetailCount === 0
      ? '표시할 데이터가 없습니다.'
      : `총 ${formatNumber(totalDetailCount)}건 중 ${formatNumber(clampedVisibleCount)}건 표시`;

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [tableFilterApplied, startDate, endDate]);

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
      const prevRecords = MOCK_RECORDS.filter(
        (r) => r.date >= prevRange.start && r.date <= prevRange.end,
      );

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
      maxDefectType: hasData ? `${maxDefectType} (${formatNumber(Math.max(maxTypeCount, 0))}건)` : '해당 없음',
      hasComparison,
    };
  }, [
    dailyAggregates,
    filteredRecords,
    startDate,
    endDate,
    hasData,
  ]);

  const productionTrendSummary = useMemo(() => {
    if (!hasData || dailyAggregates.length === 0) return '데이터 없음';
    const peak = dailyAggregates.reduce((a, b) => (b.production > a.production ? b : a));
    const avg = kpi.totalProduction / dailyAggregates.length;
    return `기간 내 일평균 생산 ${formatNumber(Math.round(avg))}개, 최고일 ${peak.date} (${formatNumber(peak.production)}개)`;
  }, [hasData, dailyAggregates, kpi.totalProduction]);

  const insights = useMemo(() => {
    if (!hasData) return [] as string[];
    const list: string[] = [];
    if (kpi.peakDate) {
      list.push(
        `${kpi.peakDate}에 생산량 ${formatNumber(kpi.peakProduction)}개로 최고 실적을 기록했습니다. 해당 일의 가동·배치 기준을 표준화하면 전사 생산성을 끌어올릴 수 있습니다.`,
      );
    }
    if (defectAnalysis.hasComparison && defectAnalysis.changeRatePercent !== null && defectAnalysis.changeRatePercent < 0) {
      list.push(
        `직전 동일 길이 기간 대비 불량률이 개선되었습니다. ${defectAnalysis.topDecreaseFactor}. 동일 조치를 다른 구간에도 확산하는 것을 권장합니다.`,
      );
    } else {
      list.push(
        `현재 최대 불량 유형은 ${defectAnalysis.maxDefectType}입니다. 원인 분석과 예방 점검을 우선 배치하면 목표 달성률 개선에 도움이 됩니다.`,
      );
    }
    if (kpi.targetAchievementRate !== null) {
      if (kpi.targetAchievementRate >= 1) {
        list.push(
          `목표 달성률이 ${formatPercent(kpi.targetAchievementRate)}로 목표를 상회합니다. 여유 생산 능력을 병목 공정 지원에 배분할 수 있습니다.`,
        );
      } else {
        list.push(
          `목표 달성률이 ${formatPercent(kpi.targetAchievementRate)}로 목표에 미달합니다. 설비 비가동·자재 공급 지연을 점검하세요.`,
        );
      }
    }
    return list.slice(0, 3);
  }, [hasData, kpi, defectAnalysis]);

  const handleSearchFilters = () => {
    if (draftFilter.startDate > draftFilter.endDate) {
      pushToast('시작일이 종료일보다 늦을 수 없습니다.', 'error');
      return;
    }
    setAppliedFilter({ ...draftFilter });
    pushToast('필터가 적용되었습니다.', 'success');
  };

  const handleResetFilters = () => {
    const reset = {
      startDate: DATA_MIN_DATE,
      endDate: DATA_MAX_DATE,
    };
    setDraftFilter(reset);
    setAppliedFilter(reset);
    pushToast('필터가 초기화되었습니다.', 'info');
  };

  const handleExportCsv = () => {
    if (!hasData) {
      pushToast('내보낼 데이터가 없습니다.', 'error');
      return;
    }
    const headers = [
      '날짜',
      '총 생산량',
      '양품 수',
      '불량수',
      '불량률',
    ];
    const lines = [
      headers.map(escapeCsvCell).join(','),
      ...tableRows.map((r) =>
        [
          r.date,
          r.production,
          Math.max(0, r.production - r.defectCount),
          r.defectCount,
          r.defectRate === null ? '' : (r.defectRate * 100).toFixed(2) + '%',
        ]
          .map(escapeCsvCell)
          .join(','),
      ),
    ];
    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production-trend_${startDate}_${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    pushToast('CSV 파일이 다운로드되었습니다.', 'success');
  };

  const toggleStaff = (id: string) => {
    setSelectedStaff((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSendReport = () => {
    if (selectedStaff.length === 0) return;
    pushToast(`리포트가 ${selectedStaff.length}명의 담당자에게 전송되었습니다.`, 'success');
    setSelectedStaff([]);
    setReportOpen(false);
  };

  const handleSaveAutoSend = () => {
    if (!isValidEmail(autoSendDraft.email)) {
      pushToast('올바른 이메일 형식을 입력하세요.', 'error');
      return;
    }
    if (!autoSendDraft.time) {
      pushToast('발송 시간을 입력하세요.', 'error');
      return;
    }
    setAutoSendSaved({ ...autoSendDraft, email: autoSendDraft.email.trim() });
    setAutoSendOpen(false);
    pushToast('자동 전송 설정이 저장되었습니다.', 'success');
  };

  const handleClearAutoSend = () => {
    setAutoSendSaved(null);
    setAutoSendOpen(false);
    pushToast('자동 전송 예약이 해제되었습니다.', 'info');
  };

  const inputClass =
    'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';
  const btnSecondary =
    'rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
  const btnPrimary =
    'rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-300';

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50">
      <div className="mx-auto max-w-[1600px] px-6 py-6 lg:px-8">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-blue-700">Production Operations</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 lg:text-3xl">
              생산 대시보드
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              기간 필터에 따라 KPI, 추이, 불량 분석, 리포트가 동기화됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setProcessSeed((prev) => prev + 1);
                pushToast('공정 데이터가 갱신되었습니다.', 'success');
              }}
            >
              새로고침
            </button>
            <button type="button" className={btnSecondary} onClick={() => setAutoSendOpen(true)}>
              자동 전송 설정
            </button>
            <button type="button" className={btnPrimary} onClick={() => setReportOpen(true)}>
              리포트 생성
            </button>
          </div>
        </header>

        {autoSendSaved ? (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            자동 전송: {autoSendSaved.frequency} / {autoSendSaved.time} / {autoSendSaved.email}
          </div>
        ) : null}

        {/* Filters — slim bar (main page style) */}
        <section className="mb-5 rounded-xl border border-slate-200/70 bg-white px-4 py-2.5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-8 w-full max-w-full items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50/80 sm:w-auto">
              <input
                type="date"
                aria-label="시작일"
                value={draftFilter.startDate}
                onChange={(e) =>
                  setDraftFilter((prev) => ({ ...prev, startDate: e.target.value }))
                }
                className="h-8 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-slate-700 outline-none sm:w-[138px] sm:flex-none sm:px-2.5"
              />
              <span className="shrink-0 px-1 text-xs text-slate-400">–</span>
              <input
                type="date"
                aria-label="종료일"
                value={draftFilter.endDate}
                onChange={(e) =>
                  setDraftFilter((prev) => ({ ...prev, endDate: e.target.value }))
                }
                className="h-8 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-slate-700 outline-none sm:w-[138px] sm:flex-none sm:px-2.5"
              />
            </div>
            <button
              type="button"
              onClick={handleSearchFilters}
              className="inline-flex h-8 items-center rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
            >
              적용
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              초기화
            </button>
          </div>
        </section>

        {/* KPI — 6 detailed data-driven cards */}
        <section className="mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-6">
          {detailedKpis.map((card) => (
            <KpiCard
              key={card.key}
              label={card.label}
              value={card.value}
              unit={card.unit}
              sub={card.sub}
              badge={card.badge}
            />
          ))}
        </section>

        <ProcessFlowVisualizationSection seed={processSeed} />

        {/* Charts + Defect summary — compact 12-col grid */}
        <section className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-8">
            <div className="mb-3">
              <h2 className="text-base font-semibold text-slate-900">생산 추이</h2>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  생산량 (좌측)
                </span>
                <span className="text-slate-300" aria-hidden>
                  |
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-600" />
                  불량률 (우측)
                </span>
              </div>
            </div>
            {hasData ? (
              <ProductionTrendChart
                daily={dailyAggregates}
                dailyRates={defectAnalysis.dailyRates}
              />
            ) : (
              <EmptyState message="선택한 조건에 해당하는 생산 데이터가 없습니다." />
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-4">
            <h2 className="text-base font-semibold text-slate-900">불량 유형 비중</h2>
            <p className="mt-0.5 text-xs text-slate-500">필터 기간 내 요약 · 유형별 건수</p>

            {hasData ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="inline-flex min-w-0 flex-1 items-baseline gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-2">
                    <span className="shrink-0 text-[11px] font-medium text-slate-500">현재 불량률</span>
                    <span className="truncate text-sm font-bold tabular-nums text-slate-900">
                      {formatPercent(defectAnalysis.currentDefectRate)}
                    </span>
                  </div>
                  <div className="inline-flex min-w-0 flex-[1.4] items-baseline gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-2">
                    <span className="shrink-0 text-[11px] font-medium text-slate-500">최대 원인</span>
                    <span className="truncate text-sm font-bold text-slate-900">
                      {defectAnalysis.maxDefectType}
                      {DEFECT_TYPES.includes(defectAnalysis.maxDefectType as DefectType)
                        ? ` (${formatNumber(defectAnalysis.typeTotals[defectAnalysis.maxDefectType as DefectType])}건)`
                        : ''}
                    </span>
                  </div>
                </div>

                {defectAnalysis.typeTotalSum > 0 ? (
                  <ul className="mt-4 space-y-2.5">
                    {DEFECT_TYPES.map((t, i) => {
                      const count = defectAnalysis.typeTotals[t];
                      const ratio = safeRate(count, defectAnalysis.typeTotalSum);
                      const pct = ratio === null ? 0 : ratio * 100;
                      return (
                        <li key={t}>
                          <div className="mb-0.5 flex justify-between text-sm">
                            <span className="text-slate-700">{t}</span>
                            <span className="tabular-nums text-slate-500">
                              {formatNumber(count)}건 ({formatPercent(ratio)})
                            </span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
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
                ) : (
                  <div className="mt-4">
                    <EmptyState message="불량 유형 데이터가 없습니다." />
                  </div>
                )}
              </>
            ) : (
              <div className="mt-4">
                <EmptyState message="선택한 조건에 해당하는 불량 데이터가 없습니다." />
              </div>
            )}
          </div>
        </section>

        {/* Table */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">생산 상세 테이블</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {!hasData ? '0건' : `총 ${formatNumber(tableRows.length)}건`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!hasData}
              className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              CSV 다운로드
            </button>
          </div>

          {!hasData ? (
            <EmptyState message="선택한 조건에 해당하는 행이 없습니다." />
          ) : detailFilteredRows.length === 0 ? (
            <EmptyState message="선택한 테이블 필터에 해당하는 데이터가 없습니다." />
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className="bg-slate-100/70 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="w-[140px] px-4 py-3 text-left">날짜</th>
                      <th className="w-[130px] px-4 py-3 text-right">총 생산량</th>
                      <th className="w-[120px] px-4 py-3 text-right">양품 수</th>
                      <th className="w-[110px] px-4 py-3 text-right">불량수</th>
                      <th className="w-[120px] px-4 py-3 text-right">불량률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTableRows.map((r, idx) => {
                      const goodUnits = Math.max(0, r.production - r.defectCount);
                      const highDefect = r.defectRate !== null && r.defectRate >= 0.1;
                      return (
                        <tr
                          key={`${r.date}-${idx}`}
                          className="border-b border-slate-100 transition-colors hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-3 text-left font-medium text-slate-700">
                            {r.date}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                            {formatNumber(r.production)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                            {formatNumber(goodUnits)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                            {formatNumber(r.defectCount)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            <span className={highDefect ? 'text-rose-600' : 'text-slate-700'}>
                              {formatPercent(r.defectRate)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-3">
                <p className="justify-self-start text-sm text-slate-600">{tableStatusText}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    className={btnPrimary}
                    onClick={handleExpandRows}
                    disabled={!canExpand}
                  >
                    {expandStep === 'all' ? '전부 펼치기' : `펼치기 (+${expandStep})`}
                  </button>
                  {canCollapse ? (
                    <button type="button" className={btnSecondary} onClick={handleCollapseRows}>
                      접기
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <ExpandStepDropdown
                    value={expandStep}
                    onChange={(next) => {
                      setExpandStep(next);
                      if (next === 'all') {
                        setVisibleCount(totalDetailCount);
                      }
                    }}
                  />
                </div>
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

      {/* Report Modal */}
      <Modal open={reportOpen} title="생산 리포트" onClose={() => setReportOpen(false)} widthClass="w-[960px]">
        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-slate-900">조회 조건</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-slate-700">
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">기간</dt>
                <dd>
                  {startDate} ~ {endDate}
                </dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">데이터 건수</dt>
                <dd>{formatNumber(filteredRecords.length)}건</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">KPI 요약</h3>
            {hasData ? (
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  총 생산량: <strong>{formatNumber(kpi.totalProduction)}개</strong>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  평균 불량률: <strong>{formatPercent(kpi.avgDefectRate)}</strong>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  최고 생산일: <strong>{kpi.peakDate ? `${formatNumber(kpi.peakProduction)}개 (${kpi.peakDate})` : '-'}</strong>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  목표 달성률: <strong>{formatPercent(kpi.targetAchievementRate)}</strong>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">데이터 없음</p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">생산 추이 요약</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{productionTrendSummary}</p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">불량 분석 및 개선 효과</h3>
            {hasData ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>현재 불량률: {formatPercent(defectAnalysis.currentDefectRate)}</li>
                <li>
                  비교:{' '}
                  {defectAnalysis.hasComparison
                    ? `${defectAnalysis.previousPeriodLabel} (불량률 ${formatPercent(defectAnalysis.previousDefectRate)})`
                    : '비교 데이터 없음'}
                </li>
                <li>개선 효과: {defectAnalysis.improvementEffect}</li>
                <li>주요 감소 요인: {defectAnalysis.topDecreaseFactor}</li>
                <li>최대 불량 유형: {defectAnalysis.maxDefectType}</li>
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">데이터 없음</p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">운영 인사이트</h3>
            {insights.length > 0 ? (
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
                {insights.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-slate-500">데이터 없음</p>
            )}
          </section>

          <section className="border-t border-slate-200 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">담당자 전송</h3>
            <p className="mt-1 text-xs text-slate-500">1명 이상 선택 후 전송할 수 있습니다.</p>
            <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {STAFF_MEMBERS.map((s) => {
                const checked = selectedStaff.includes(s.id);
                return (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStaff(s.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="flex-1 text-sm">
                        <span className="font-medium text-slate-900">{s.name}</span>
                        <span className="text-slate-500">
                          {' '}
                          · {s.department} · {s.rank}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">{s.email}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setReportOpen(false)}>
                닫기
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={selectedStaff.length === 0}
                onClick={handleSendReport}
              >
                전송 ({selectedStaff.length})
              </button>
            </div>
          </section>
        </div>
      </Modal>

      {/* Auto send modal */}
      <Modal
        open={autoSendOpen}
        title="자동 전송 설정"
        onClose={() => setAutoSendOpen(false)}
        widthClass="w-[560px]"
      >
        <div className="space-y-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
            주기
            <select
              value={autoSendDraft.frequency}
              onChange={(e) =>
                setAutoSendDraft((prev) => ({
                  ...prev,
                  frequency: e.target.value as AutoSendFrequency,
                }))
              }
              className={inputClass}
            >
              <option value="일일">일일</option>
              <option value="주간">주간</option>
              <option value="월간">월간</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
            발송 시간
            <input
              type="time"
              value={autoSendDraft.time}
              onChange={(e) => setAutoSendDraft((prev) => ({ ...prev, time: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
            수신 이메일
            <input
              type="email"
              value={autoSendDraft.email}
              onChange={(e) => setAutoSendDraft((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="ops@factory.com"
              className={inputClass}
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={btnSecondary} onClick={handleClearAutoSend}>
              예약 해제
            </button>
            <button type="button" className={btnPrimary} onClick={handleSaveAutoSend}>
              저장
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

