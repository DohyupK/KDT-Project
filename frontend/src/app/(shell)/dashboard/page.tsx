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
  product: string;
  line: string;
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

type ChartType = 'bar' | 'line' | 'donut';

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

type ProductAggregate = {
  product: string;
  production: number;
};

type KpiSummary = {
  totalProduction: number;
  avgDefectRate: number | null;
  topLine: string | null;
  topLineProduction: number;
  targetAchievementRate: number | null;
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

const PRODUCTS = ['프레스 모듈 A', '모터 하우징 B', '센서 유닛 C', '컨트롤러 D', '배터리 팩 E'] as const;

const LINES = ['라인-1', '라인-2', '라인-3', '라인-4', '라인-5'] as const;

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

function buildMockRecords(): ProductionRecord[] {
  const rand = seededRandom(42);
  const records: ProductionRecord[] = [];
  const start = parseDate('2026-05-01');

  for (let dayOffset = 0; dayOffset < 45; dayOffset += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + dayOffset);
    const date = formatDate(d);

    for (let pi = 0; pi < PRODUCTS.length; pi += 1) {
      for (let li = 0; li < LINES.length; li += 1) {
        if (rand() > 0.55) continue;

        const base = 180 + Math.floor(rand() * 220) + pi * 12 + li * 8;
        const wave = Math.sin((dayOffset + pi + li) / 4) * 30;
        const production = Math.max(80, Math.round(base + wave + rand() * 40));
        const targetProduction = Math.round(production * (0.92 + rand() * 0.2));

        const defects: DefectBreakdown = {
          '기계 결함': Math.floor(rand() * 8),
          '원자재 불량': Math.floor(rand() * 6),
          '작업자 실수': Math.floor(rand() * 5),
          '온도 이상': Math.floor(rand() * 4),
        };

        // Slight improvement trend in later days
        if (dayOffset > 25) {
          defects['기계 결함'] = Math.max(0, defects['기계 결함'] - 2);
          defects['온도 이상'] = Math.max(0, defects['온도 이상'] - 1);
        }

        const defectCount = DEFECT_TYPES.reduce((sum, t) => sum + defects[t], 0);

        records.push({
          date,
          product: PRODUCTS[pi],
          line: LINES[li],
          production,
          defectCount,
          targetProduction,
          defects,
        });
      }
    }
  }

  return records;
}

const MOCK_RECORDS: ProductionRecord[] = buildMockRecords();

const DATA_MIN_DATE = MOCK_RECORDS.reduce(
  (min, r) => (r.date < min ? r.date : min),
  MOCK_RECORDS[0].date,
);
const DATA_MAX_DATE = MOCK_RECORDS.reduce(
  (max, r) => (r.date > max ? r.date : max),
  MOCK_RECORDS[0].date,
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
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
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
  chartType,
  daily,
  byProduct,
}: {
  chartType: ChartType;
  daily: DailyAggregate[];
  byProduct: ProductAggregate[];
}) {
  const width = 720;
  const height = 280;
  const pad = { top: 24, right: 20, bottom: 40, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  if (chartType === 'donut') {
    if (byProduct.length === 0) {
      return <EmptyState message="표시할 생산 데이터가 없습니다." />;
    }
    const total = byProduct.reduce((s, p) => s + p.production, 0);
    const cx = 160;
    const cy = 140;
    const r = 88;
    const stroke = 36;
    let angle = -Math.PI / 2;
    const arcs = byProduct.map((item, i) => {
      const ratio = total === 0 ? 0 : item.production / total;
      const sweep = ratio * Math.PI * 2;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      const large = sweep > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const path =
        ratio === 0
          ? ''
          : ratio >= 0.9999
            ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy - r}`
            : `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
      return { item, path, color: CHART_COLORS[i % CHART_COLORS.length], ratio };
    });

    return (
      <div className="flex items-center gap-8">
        <svg viewBox="0 0 320 280" className="h-[280px] w-[320px] shrink-0" role="img" aria-label="제품별 생산량 원형 차트">
          {arcs.map((a) =>
            a.path ? (
              <path
                key={a.item.product}
                d={a.path}
                fill="none"
                stroke={a.color}
                strokeWidth={stroke}
                strokeLinecap="butt"
              />
            ) : null,
          )}
          <circle cx={cx} cy={cy} r={r - stroke / 2 - 4} fill="#fff" />
          <text x={cx} y={cy - 6} textAnchor="middle" className="fill-slate-500 text-[11px]">
            총 생산량
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle" className="fill-slate-900 text-[16px] font-semibold">
            {formatNumber(total)}
          </text>
        </svg>
        <ul className="space-y-2 text-sm">
          {arcs.map((a) => (
            <li key={a.item.product} className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: a.color }} />
              <span className="text-slate-700">{a.item.product}</span>
              <span className="ml-auto tabular-nums text-slate-500">
                {formatNumber(a.item.production)} ({formatPercent(a.ratio)})
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (daily.length === 0) {
    return <EmptyState message="표시할 생산 데이터가 없습니다." />;
  }

  const maxY = Math.max(...daily.map((d) => d.production), 1);
  const n = daily.length;
  const gap = n > 1 ? innerW / (n - (chartType === 'bar' ? 0 : 1)) : innerW;
  const barW = chartType === 'bar' ? Math.max(4, (innerW / n) * 0.65) : 0;

  const points = daily.map((d, i) => {
    const x =
      chartType === 'bar'
        ? pad.left + (innerW / n) * i + (innerW / n - barW) / 2 + barW / 2
        : pad.left + (n === 1 ? innerW / 2 : gap * i);
    const y = pad.top + innerH - (d.production / maxY) * innerH;
    return { ...d, x, y };
  });

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = (maxY / ticks) * i;
    const y = pad.top + innerH - (v / maxY) * innerH;
    return { v, y };
  });

  const labelStep = Math.max(1, Math.ceil(n / 8));

  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">날짜별 총 생산량 (필터 적용)</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[280px] w-full" role="img" aria-label="날짜별 생산량 차트">
        {yTicks.map((t) => (
          <g key={t.v}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={t.y}
              y2={t.y}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text x={pad.left - 8} y={t.y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
              {Math.round(t.v)}
            </text>
          </g>
        ))}
        {chartType === 'bar'
          ? points.map((p) => (
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
            ))
          : null}
        {chartType === 'line' ? (
          <>
            <polyline
              fill="none"
              stroke="#2563eb"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            />
            {points.map((p) => (
              <circle key={p.date} cx={p.x} cy={p.y} r={3.5} fill="#2563eb">
                <title>{`${p.date}: ${formatNumber(p.production)}`}</title>
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
    </div>
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

function DefectTrendChart({ dailyRates }: { dailyRates: Array<{ date: string; rate: number | null }> }) {
  const width = 640;
  const height = 240;
  const pad = { top: 20, right: 16, bottom: 36, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const usable = dailyRates.filter((d) => d.rate !== null) as Array<{ date: string; rate: number }>;
  if (usable.length === 0) {
    return <EmptyState message="표시할 불량률 데이터가 없습니다." />;
  }

  const maxRate = Math.max(...usable.map((d) => d.rate), 0.001);
  const n = usable.length;
  const gap = n > 1 ? innerW / (n - 1) : innerW;

  const points = usable.map((d, i) => {
    const x = pad.left + (n === 1 ? innerW / 2 : gap * i);
    const y = pad.top + innerH - (d.rate / maxRate) * innerH;
    return { ...d, x, y };
  });

  const labelStep = Math.max(1, Math.ceil(n / 7));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[240px] w-full" role="img" aria-label="날짜별 불량률 선 차트">
      {[0, 0.25, 0.5, 0.75, 1].map((r) => {
        const y = pad.top + innerH - r * innerH;
        return (
          <g key={r}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e2e8f0" />
            <text x={pad.left - 6} y={y + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
              {formatPercent(maxRate * r)}
            </text>
          </g>
        );
      })}
      <polyline
        fill="none"
        stroke="#dc2626"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
      />
      {points.map((p) => (
        <circle key={p.date} cx={p.x} cy={p.y} r={3} fill="#dc2626">
          <title>{`${p.date}: ${formatPercent(p.rate)}`}</title>
        </circle>
      ))}
      {points.map((p, i) =>
        i % labelStep === 0 || i === n - 1 ? (
          <text key={`dl-${p.date}`} x={p.x} y={height - 10} textAnchor="middle" className="fill-slate-500 text-[10px]">
            {p.date.slice(5)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function DashBoardPage() {
  const [startDate, setStartDate] = useState(DATA_MIN_DATE);
  const [endDate, setEndDate] = useState(DATA_MAX_DATE);
  const [productFilter, setProductFilter] = useState('전체');
  const [lineFilter, setLineFilter] = useState('전체');
  const [chartType, setChartType] = useState<ChartType>('bar');
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
    product: '전체',
    line: '전체',
    startDate: '',
    endDate: '',
  });
  const [tableFilterApplied, setTableFilterApplied] = useState({
    product: '전체',
    line: '전체',
    startDate: '',
    endDate: '',
  });
  const [expandStep, setExpandStep] = useState<ExpandStep>(10);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  const pushToast = useCallback((message: string, variant: ToastState['variant']) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const productOptions = useMemo(() => ['전체', ...PRODUCTS], []);
  const lineOptions = useMemo(() => ['전체', ...LINES], []);

  const filteredRecords = useMemo(() => {
    if (startDate > endDate) return [];
    return MOCK_RECORDS.filter((r) => {
      if (r.date < startDate || r.date > endDate) return false;
      if (productFilter !== '전체' && r.product !== productFilter) return false;
      if (lineFilter !== '전체' && r.line !== lineFilter) return false;
      return true;
    });
  }, [startDate, endDate, productFilter, lineFilter]);

  const hasData = filteredRecords.length > 0;

  const kpi: KpiSummary = useMemo(() => {
    if (!hasData) {
      return {
        totalProduction: 0,
        avgDefectRate: null,
        topLine: null,
        topLineProduction: 0,
        targetAchievementRate: null,
      };
    }

    let totalProduction = 0;
    let totalDefects = 0;
    let totalTarget = 0;
    const lineMap = new Map<string, number>();

    for (const r of filteredRecords) {
      totalProduction += r.production;
      totalDefects += r.defectCount;
      totalTarget += r.targetProduction;
      lineMap.set(r.line, (lineMap.get(r.line) ?? 0) + r.production);
    }

    let topLine: string | null = null;
    let topLineProduction = 0;
    for (const [line, prod] of lineMap) {
      if (prod > topLineProduction) {
        topLine = line;
        topLineProduction = prod;
      }
    }

    return {
      totalProduction,
      avgDefectRate: safeRate(totalDefects, totalProduction),
      topLine,
      topLineProduction,
      targetAchievementRate: safeRate(totalProduction, totalTarget),
    };
  }, [filteredRecords, hasData]);

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

  const productAggregates: ProductAggregate[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRecords) {
      map.set(r.product, (map.get(r.product) ?? 0) + r.production);
    }
    return Array.from(map.entries())
      .map(([product, production]) => ({ product, production }))
      .sort((a, b) => b.production - a.production);
  }, [filteredRecords]);

  const tableRows = useMemo(() => {
    return filteredRecords
      .slice()
      .sort((a, b) => {
        if (a.date === b.date) return a.product.localeCompare(b.product);
        return a.date > b.date ? -1 : 1;
      })
      .map((r) => ({
        ...r,
        defectRate: safeRate(r.defectCount, r.production),
        achievementRate: safeRate(r.production, r.targetProduction),
      }));
  }, [filteredRecords]);

  const detailFilteredRows = useMemo(() => {
    const { product, line, startDate: tStart, endDate: tEnd } = tableFilterApplied;
    const hasInvalidDateRange = tStart !== '' && tEnd !== '' && tStart > tEnd;
    if (hasInvalidDateRange) return [];

    return tableRows.filter((r) => {
      if (product !== '전체' && r.product !== product) return false;
      if (line !== '전체' && r.line !== line) return false;
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
    tableFilterApplied.product !== '전체' ||
    tableFilterApplied.line !== '전체' ||
    tableFilterApplied.startDate !== '' ||
    tableFilterApplied.endDate !== '';

  const hasDraftTableFilters =
    tableFilterDraft.product !== '전체' ||
    tableFilterDraft.line !== '전체' ||
    tableFilterDraft.startDate !== '' ||
    tableFilterDraft.endDate !== '';

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
      product: '전체',
      line: '전체',
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
      : hiddenRowCount > 0
        ? `${formatNumber(clampedVisibleCount)}건 표시 중 · 나머지 ${formatNumber(hiddenRowCount)}건 숨김`
        : `전체 데이터 표시 중 (총 ${formatNumber(totalDetailCount)}건)`;

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [tableFilterApplied, startDate, endDate, productFilter, lineFilter]);

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
      const prevRecords = MOCK_RECORDS.filter((r) => {
        if (r.date < prevRange.start || r.date > prevRange.end) return false;
        if (productFilter !== '전체' && r.product !== productFilter) return false;
        if (lineFilter !== '전체' && r.line !== lineFilter) return false;
        return true;
      });

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
    productFilter,
    lineFilter,
    hasData,
  ]);

  const productionTrendSummary = useMemo(() => {
    if (!hasData || dailyAggregates.length === 0) return '데이터 없음';
    const peak = dailyAggregates.reduce((a, b) => (b.production > a.production ? b : a));
    const avg = kpi.totalProduction / dailyAggregates.length;
    const topProduct = productAggregates[0];
    return `기간 내 일평균 생산 ${formatNumber(Math.round(avg))}개, 최고일 ${peak.date} (${formatNumber(peak.production)}개)${
      topProduct ? `, 주력 제품 ${topProduct.product}` : ''
    }`;
  }, [hasData, dailyAggregates, kpi.totalProduction, productAggregates]);

  const insights = useMemo(() => {
    if (!hasData) return [] as string[];
    const list: string[] = [];
    if (kpi.topLine) {
      list.push(
        `${kpi.topLine}이(가) 생산량 ${formatNumber(kpi.topLineProduction)}개로 최고 실적을 기록했습니다. 해당 라인의 가동·배치 기준을 표준화하면 전사 생산성을 끌어올릴 수 있습니다.`,
      );
    }
    if (defectAnalysis.hasComparison && defectAnalysis.changeRatePercent !== null && defectAnalysis.changeRatePercent < 0) {
      list.push(
        `직전 동일 길이 기간 대비 불량률이 개선되었습니다. ${defectAnalysis.topDecreaseFactor}. 동일 조치를 다른 라인·제품에 확산하는 것을 권장합니다.`,
      );
    } else {
      list.push(
        `현재 최대 불량 유형은 ${defectAnalysis.maxDefectType}입니다. 원인 분석과 예방 점검을 우선 배치하면 목표 달성률 개선에 도움이 됩니다.`,
      );
    }
    if (kpi.targetAchievementRate !== null) {
      if (kpi.targetAchievementRate >= 1) {
        list.push(
          `목표 달성률이 ${formatPercent(kpi.targetAchievementRate)}로 목표를 상회합니다. 여유 생산 능력을 신제품 또는 병목 라인 지원에 배분할 수 있습니다.`,
        );
      } else {
        list.push(
          `목표 달성률이 ${formatPercent(kpi.targetAchievementRate)}로 목표에 미달합니다. 저실적 라인의 설비 비가동·자재 공급 지연을 점검하세요.`,
        );
      }
    }
    return list.slice(0, 3);
  }, [hasData, kpi, defectAnalysis]);

  const handleFilterDateChange = (which: 'start' | 'end', value: string) => {
    const nextStart = which === 'start' ? value : startDate;
    const nextEnd = which === 'end' ? value : endDate;
    if (which === 'start') setStartDate(value);
    else setEndDate(value);
    if (nextStart > nextEnd) {
      pushToast('시작일이 종료일보다 늦을 수 없습니다.', 'error');
    }
  };

  const handleResetFilters = () => {
    setStartDate(DATA_MIN_DATE);
    setEndDate(DATA_MAX_DATE);
    setProductFilter('전체');
    setLineFilter('전체');
    pushToast('필터가 초기화되었습니다.', 'info');
  };

  const handleExportCsv = () => {
    if (!hasData) {
      pushToast('내보낼 데이터가 없습니다.', 'error');
      return;
    }
    const headers = [
      '날짜',
      '제품',
      '라인',
      '생산량',
      '불량수',
      '불량률',
      '목표생산량',
      '목표달성률',
    ];
    const lines = [
      headers.map(escapeCsvCell).join(','),
      ...tableRows.map((r) =>
        [
          r.date,
          r.product,
          r.line,
          r.production,
          r.defectCount,
          r.defectRate === null ? '' : (r.defectRate * 100).toFixed(2) + '%',
          r.targetProduction,
          r.achievementRate === null ? '' : (r.achievementRate * 100).toFixed(2) + '%',
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

  const chartButtons: Array<{ type: ChartType; label: string }> = [
    { type: 'bar', label: '막대' },
    { type: 'line', label: '선형' },
    { type: 'donut', label: '원형' },
  ];

  const inputClass =
    'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';
  const btnSecondary =
    'rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
  const btnPrimary =
    'rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-300';

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50">
      <div className="mx-auto max-w-[1600px] px-8 py-8">
        <header className="mb-8 flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-blue-700">Production Operations</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">생산 대시보드</h1>
            <p className="mt-2 text-sm text-slate-600">
              기간·제품·라인 필터에 따라 KPI, 추이, 불량 분석, 리포트가 동기화됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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

        {/* Filters */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              시작일
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleFilterDateChange('start', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              종료일
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleFilterDateChange('end', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              제품
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className={`${inputClass} min-w-[180px]`}
              >
                {productOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              라인
              <select
                value={lineFilter}
                onChange={(e) => setLineFilter(e.target.value)}
                className={`${inputClass} min-w-[140px]`}
              >
                {lineOptions.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={btnSecondary} onClick={handleResetFilters}>
              초기화
            </button>
          </div>
        </section>

        {/* KPI */}
        <section className="mb-6 grid grid-cols-4 gap-4">
          {hasData ? (
            <>
              <KpiCard label="총 생산량" value={`${formatNumber(kpi.totalProduction)}개`} />
              <KpiCard
                label="평균 불량률"
                value={formatPercent(kpi.avgDefectRate)}
                sub="총 불량수 / 총 생산량"
              />
              <KpiCard
                label="최고 생산 라인"
                value={kpi.topLine ?? '-'}
                sub={kpi.topLine ? `생산량 ${formatNumber(kpi.topLineProduction)}개` : undefined}
              />
              <KpiCard
                label="목표 달성률"
                value={formatPercent(kpi.targetAchievementRate)}
                sub="총 생산량 / 목표 생산량 합계"
              />
            </>
          ) : (
            <>
              <EmptyState message="데이터 없음" />
              <EmptyState message="데이터 없음" />
              <EmptyState message="데이터 없음" />
              <EmptyState message="데이터 없음" />
            </>
          )}
        </section>

        {/* Charts + Defect side */}
        <section className="mb-6 grid grid-cols-[2fr_1fr] gap-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">생산 추이</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {chartType === 'donut' ? '제품별 생산량 비중' : '날짜별 총 생산량'}
                </p>
              </div>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {chartButtons.map((b) => (
                  <button
                    key={b.type}
                    type="button"
                    onClick={() => setChartType(b.type)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      chartType === b.type
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            {hasData ? (
              <ProductionTrendChart
                chartType={chartType}
                daily={dailyAggregates}
                byProduct={productAggregates}
              />
            ) : (
              <EmptyState message="선택한 조건에 해당하는 생산 데이터가 없습니다." />
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">불량 유형 비중</h2>
            <p className="mt-0.5 mb-4 text-xs text-slate-500">필터 기간 내 유형별 건수</p>
            {hasData && defectAnalysis.typeTotalSum > 0 ? (
              <ul className="space-y-3">
                {DEFECT_TYPES.map((t, i) => {
                  const count = defectAnalysis.typeTotals[t];
                  const ratio = safeRate(count, defectAnalysis.typeTotalSum);
                  const pct = ratio === null ? 0 : ratio * 100;
                  return (
                    <li key={t}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-slate-700">{t}</span>
                        <span className="tabular-nums text-slate-500">
                          {formatNumber(count)}건 ({formatPercent(ratio)})
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
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
              <EmptyState message="불량 유형 데이터가 없습니다." />
            )}
          </div>
        </section>

        {/* Defect analysis */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-slate-900">불량 분석</h2>
          <p className="mb-4 text-xs text-slate-500">날짜별 불량률과 직전 동일 기간 비교</p>
          {!hasData ? (
            <EmptyState message="선택한 조건에 해당하는 불량 분석 데이터가 없습니다." />
          ) : (
            <div className="grid grid-cols-3 gap-5">
              <div className="col-span-2">
                <DefectTrendChart dailyRates={defectAnalysis.dailyRates} />
              </div>
              <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-slate-500">현재 기간 불량률</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {formatPercent(defectAnalysis.currentDefectRate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">비교 기간</p>
                  <p className="mt-1 text-slate-800">
                    {defectAnalysis.hasComparison && defectAnalysis.previousPeriodLabel
                      ? defectAnalysis.previousPeriodLabel
                      : '비교 데이터 없음'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">직전 기간 불량률</p>
                  <p className="mt-1 text-slate-800">
                    {defectAnalysis.hasComparison
                      ? formatPercent(defectAnalysis.previousDefectRate)
                      : '비교 데이터 없음'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">불량률 변화율</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {defectAnalysis.hasComparison && defectAnalysis.changeRatePercent !== null
                      ? `${defectAnalysis.changeRatePercent > 0 ? '+' : ''}${defectAnalysis.changeRatePercent.toFixed(1)}%`
                      : '비교 데이터 없음'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">개선 효과</p>
                  <p className="mt-1 text-slate-800">{defectAnalysis.improvementEffect}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">주요 감소 요인</p>
                  <p className="mt-1 text-slate-800">{defectAnalysis.topDecreaseFactor}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">최대 불량 유형</p>
                  <p className="mt-1 text-slate-800">{defectAnalysis.maxDefectType}</p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Table */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">생산 상세 테이블</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {!hasData
                  ? '0건'
                  : hasAppliedTableFilters
                    ? `필터 결과 ${formatNumber(detailFilteredRows.length)}건 / 상위 필터 ${formatNumber(tableRows.length)}건`
                    : `총 ${formatNumber(tableRows.length)}건`}
              </p>
            </div>
            <button type="button" className={btnSecondary} onClick={handleExportCsv}>
              엑셀 추출 (CSV)
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              시작일 필터
              <input
                type="date"
                value={tableFilterDraft.startDate}
                min={startDate}
                max={tableFilterDraft.endDate || endDate}
                onChange={(e) =>
                  setTableFilterDraft((prev) => ({ ...prev, startDate: e.target.value }))
                }
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              종료일 필터
              <input
                type="date"
                value={tableFilterDraft.endDate}
                min={tableFilterDraft.startDate || startDate}
                max={endDate}
                onChange={(e) =>
                  setTableFilterDraft((prev) => ({ ...prev, endDate: e.target.value }))
                }
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              제품 필터
              <select
                value={tableFilterDraft.product}
                onChange={(e) =>
                  setTableFilterDraft((prev) => ({ ...prev, product: e.target.value }))
                }
                className={`${inputClass} min-w-[180px]`}
              >
                {productOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              라인 필터
              <select
                value={tableFilterDraft.line}
                onChange={(e) =>
                  setTableFilterDraft((prev) => ({ ...prev, line: e.target.value }))
                }
                className={`${inputClass} min-w-[140px]`}
              >
                {lineOptions.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={btnPrimary} onClick={handleSearchTableFilters}>
              검색
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={handleResetTableFilters}
              disabled={
                !hasAppliedTableFilters &&
                !hasDraftTableFilters &&
                expandStep === 10 &&
                visibleCount === INITIAL_VISIBLE_COUNT
              }
            >
              필터 초기화
            </button>
          </div>

          {!hasData ? (
            <EmptyState message="선택한 조건에 해당하는 행이 없습니다." />
          ) : detailFilteredRows.length === 0 ? (
            <EmptyState message="선택한 테이블 필터에 해당하는 데이터가 없습니다." />
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-[120px] px-4 py-3 font-semibold">날짜</th>
                      <th className="w-[160px] px-4 py-3 font-semibold">제품</th>
                      <th className="w-[100px] px-4 py-3 font-semibold">라인</th>
                      <th className="w-[110px] px-4 py-3 font-semibold">생산량</th>
                      <th className="w-[100px] px-4 py-3 font-semibold">불량수</th>
                      <th className="w-[110px] px-4 py-3 font-semibold">불량률</th>
                      <th className="w-[120px] px-4 py-3 font-semibold">목표생산량</th>
                      <th className="w-[120px] px-4 py-3 font-semibold">목표달성률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTableRows.map((r, idx) => (
                      <tr
                        key={`${r.date}-${r.product}-${r.line}-${idx}`}
                        className="border-t border-slate-100 hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-3 tabular-nums text-slate-700">{r.date}</td>
                        <td className="px-4 py-3 text-slate-800">{r.product}</td>
                        <td className="px-4 py-3 text-slate-700">{r.line}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-800">
                          {formatNumber(r.production)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-800">
                          {formatNumber(r.defectCount)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">
                          {formatPercent(r.defectRate)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-800">
                          {formatNumber(r.targetProduction)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">
                          {formatPercent(r.achievementRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-3 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="justify-self-start text-sm text-slate-600">{tableStatusText}</p>
                <div className="justify-self-center">
                  <button
                    type="button"
                    className={btnPrimary}
                    onClick={handleExpandRows}
                    disabled={!canExpand}
                  >
                    {expandStep === 'all' ? '전부 펼치기' : `펼치기 (+${expandStep})`}
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {canCollapse ? (
                    <button type="button" className={btnSecondary} onClick={handleCollapseRows}>
                      접기
                    </button>
                  ) : null}
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
                <dt className="text-slate-500">제품</dt>
                <dd>{productFilter}</dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">라인</dt>
                <dd>{lineFilter}</dd>
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
                  최고 생산 라인: <strong>{kpi.topLine ?? '-'}</strong>
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

