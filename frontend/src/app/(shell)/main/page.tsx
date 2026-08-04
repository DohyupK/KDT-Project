'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useSelectedLot } from '@/context/SelectedLotContext';
import { useUiSettings } from '@/components/layout/AppShell';
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent';
import DateInput from '@/components/DateInput';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type StatusTone = '정상' | '주의' | '경고' | '위험' | '이상';

type RiskGrade = '높음' | '중간' | '낮음';

type FilterState = {
  startDate: string;
  endDate: string;
};

type LotRecord = {
  id: string;
  date: string;
  hour: string;
  sintering_temp: number;
  lithium_input: number;
  humidity: number;
  metal_impurity: number;
  tank_pressure: number;
  process_time: number;
  additive_ratio: number;
  quality_defect: 0 | 1;
  production: number;
};

type RiskLotView = {
  id: string;
  riskScore: number;
  status: RiskGrade;
  riskReason: string;
  record: LotRecord;
};

type ProcessParam = {
  id: string;
  name: string;
  value: string;
  unit: string;
  status: StatusTone;
};

type TrendPoint = {
  time: string;
  production: number;
  passRate: number;
  failRate: number;
  riskIndex: number;
};

type ToastItem = {
  id: number;
  message: string;
  variant: 'success' | 'error' | 'info';
};

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_FILTER: FilterState = {
  startDate: '2026-07-20',
  endDate: '2026-07-22',
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toneClass(tone: StatusTone) {
  const base =
    'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium tracking-normal';
  if (tone === '정상') return `${base} border border-emerald-100 bg-emerald-50 text-emerald-600`;
  if (tone === '주의') return `${base} border border-amber-200 bg-amber-50 text-amber-700`;
  if (tone === '경고') return `${base} border border-orange-200 bg-orange-50 text-orange-700`;
  if (tone === '이상') return `${base} border border-yellow-200 bg-yellow-50 text-yellow-700`;
  return `${base} border border-red-200 bg-red-50 text-red-700`;
}

function riskGradeClass(grade: RiskGrade) {
  const base =
    'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold';
  if (grade === '높음') return `${base} bg-red-100 text-red-700`;
  if (grade === '중간') return `${base} bg-orange-100 text-orange-700`;
  return `${base} bg-emerald-100 text-emerald-700`;
}

function formatDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${y}.${m}.${d}`;
}

function makeMockLotRecord(
  partial: Pick<LotRecord, 'id' | 'date' | 'hour'> & Partial<LotRecord>,
): LotRecord {
  return {
    sintering_temp: 810,
    lithium_input: 2.4,
    humidity: 45,
    metal_impurity: 0.015,
    tank_pressure: 2.1,
    process_time: 120,
    additive_ratio: 3.2,
    quality_defect: 1,
    production: 24,
    ...partial,
  };
}

/** 위험 LOT Top 테이블 전용 Mock (위험도·위험등급 매칭) */
const TOP_RISK_LOTS_MOCK: RiskLotView[] = [
  {
    id: 'LOT-20260722-N12',
    riskScore: 0.94,
    status: '높음',
    riskReason: '소성 온도 상승, 금속 불순물 농도 초과',
    record: makeMockLotRecord({
      id: 'LOT-20260722-N12',
      date: '2026-07-22',
      hour: '14:00',
      sintering_temp: 842,
      metal_impurity: 0.042,
      quality_defect: 1,
    }),
  },
  {
    id: 'LOT-20260721-N08',
    riskScore: 0.87,
    status: '높음',
    riskReason: '공정 습도 과다, 원료 투입비 편차',
    record: makeMockLotRecord({
      id: 'LOT-20260721-N08',
      date: '2026-07-21',
      hour: '11:00',
      humidity: 68,
      lithium_input: 1.52,
      quality_defect: 1,
    }),
  },
  {
    id: 'LOT-20260722-N05',
    riskScore: 0.72,
    status: '중간',
    riskReason: '소성 온도 상승',
    record: makeMockLotRecord({
      id: 'LOT-20260722-N05',
      date: '2026-07-22',
      hour: '09:00',
      sintering_temp: 828,
      quality_defect: 1,
    }),
  },
  {
    id: 'LOT-20260720-N15',
    riskScore: 0.51,
    status: '중간',
    riskReason: '원료 투입비 편차',
    record: makeMockLotRecord({
      id: 'LOT-20260720-N15',
      date: '2026-07-20',
      hour: '16:00',
      lithium_input: 3.35,
      quality_defect: 0,
    }),
  },
  {
    id: 'LOT-20260721-N03',
    riskScore: 0.28,
    status: '낮음',
    riskReason: '품질 불량 예측',
    record: makeMockLotRecord({
      id: 'LOT-20260721-N03',
      date: '2026-07-21',
      hour: '08:00',
      sintering_temp: 808,
      quality_defect: 1,
    }),
  },
];

function buildLotDataset(seed: number): LotRecord[] {
  const rows: LotRecord[] = [];
  const dates = ['2026-07-20', '2026-07-21', '2026-07-22'];
  let seq = 1;
  for (let d = 0; d < dates.length; d += 1) {
    for (let h = 8; h <= 22; h += 1) {
      for (let n = 0; n < 6; n += 1) {
        if ((seq + seed) % 4 === 0) {
          seq += 1;
          continue;
        }
        const wobble = ((seed + seq * 13) % 11) / 10;
        const anomaly = (seed + seq) % 9 === 0;
        const sintering_temp = Math.round((anomaly ? 824 : 805) + wobble * 18);
        const lithium_input = Math.round((anomaly && seq % 2 === 0 ? 1.55 : 2.4 + wobble * 0.5) * 100) / 100;
        const humidity = Math.round((anomaly && seq % 3 === 0 ? 62 : 40 + wobble * 12) * 10) / 10;
        const metal_impurity =
          Math.round((anomaly && seq % 5 === 0 ? 0.038 : 0.012 + wobble * 0.01) * 1000) / 1000;
        const quality_defect: 0 | 1 =
          anomaly || sintering_temp > 820 || metal_impurity > 0.03 || humidity > 60 ? 1 : 0;
        rows.push({
          id: `LOT-202607${pad(20 + d)}-N${pad(seq)}`,
          date: dates[d],
          hour: `${pad(h)}:00`,
          sintering_temp,
          lithium_input,
          humidity,
          metal_impurity,
          tank_pressure: Math.round((2.05 + wobble * 0.25) * 100) / 100,
          process_time: Math.round(110 + wobble * 20 + (anomaly ? 12 : 0)),
          additive_ratio: Math.round((3.0 + wobble * 0.6) * 10) / 10,
          quality_defect,
          production: Math.round(18 + wobble * 20 + (h % 3) * 2),
        });
        seq += 1;
      }
    }
  }
  return rows;
}

function computeRiskReasons(record: LotRecord): string[] {
  const reasons: string[] = [];
  if (record.sintering_temp > 820) reasons.push('소성 온도 상승');
  if (record.lithium_input < 1.8 || record.lithium_input > 3.2) reasons.push('원료 투입비 편차');
  if (record.humidity > 60) reasons.push('공정 습도 과다');
  if (record.metal_impurity > 0.03) reasons.push('금속 불순물 농도 초과');
  if (record.quality_defect === 1 && reasons.length === 0) reasons.push('품질 불량 예측');
  return reasons;
}

function computeRiskScore(record: LotRecord): number {
  let score = 0.35;
  if (record.sintering_temp > 820) score += Math.min(0.35, (record.sintering_temp - 820) * 0.02);
  if (record.lithium_input < 1.8) score += 0.18;
  if (record.lithium_input > 3.2) score += 0.18;
  if (record.humidity > 60) score += Math.min(0.2, (record.humidity - 60) * 0.02);
  if (record.metal_impurity > 0.03) score += Math.min(0.25, (record.metal_impurity - 0.03) * 8);
  if (record.quality_defect === 1) score += 0.12;
  return Math.min(1, Math.round(score * 100) / 100);
}

function riskStatus(score: number): RiskGrade {
  if (score >= 0.85) return '높음';
  if (score >= 0.4) return '중간';
  return '낮음';
}

function toRiskLotView(record: LotRecord): RiskLotView {
  const riskScore = computeRiskScore(record);
  const reasons = computeRiskReasons(record);
  return {
    id: record.id,
    riskScore,
    status: riskStatus(riskScore),
    riskReason: reasons.join(', ') || '이상 징후 감지',
    record,
  };
}

function isAnomalous(record: LotRecord) {
  return (
    record.quality_defect === 1 ||
    record.sintering_temp > 820 ||
    record.lithium_input < 1.8 ||
    record.lithium_input > 3.2 ||
    record.humidity > 60 ||
    record.metal_impurity > 0.03
  );
}

function getTrendSlots() {
  return Array.from({ length: 15 }, (_, i) => `${pad(8 + i)}:00`);
}

function buildProcessParams(records: LotRecord[]): ProcessParam[] {
  if (records.length === 0) {
    return [
      { id: 'sinter', name: '소성온도', value: '-', unit: '℃', status: '주의' },
      { id: 'ptime', name: '공정시간', value: '-', unit: 'min', status: '주의' },
      { id: 'hum', name: '습도', value: '-', unit: '%', status: '주의' },
      { id: 'press', name: '탱크 압력', value: '-', unit: 'bar', status: '주의' },
      { id: 'li', name: '리튬 투입량', value: '-', unit: 'Li/TM', status: '주의' },
      { id: 'add', name: '첨가제 비율', value: '-', unit: '%', status: '주의' },
    ];
  }
  const avg = (picker: (r: LotRecord) => number) =>
    Math.round((records.reduce((s, r) => s + picker(r), 0) / records.length) * 100) / 100;
  const sinter = Math.round(avg((r) => r.sintering_temp));
  const ptime = Math.round(avg((r) => r.process_time));
  const hum = avg((r) => r.humidity);
  const press = avg((r) => r.tank_pressure);
  const li = avg((r) => r.lithium_input);
  const add = avg((r) => r.additive_ratio);
  return [
    {
      id: 'sinter',
      name: '소성온도',
      value: String(sinter),
      unit: '℃',
      status: sinter > 835 ? '이상' : sinter > 820 ? '주의' : '정상',
    },
    {
      id: 'ptime',
      name: '공정시간',
      value: String(ptime),
      unit: 'min',
      status: ptime > 130 ? '이상' : ptime > 125 ? '주의' : '정상',
    },
    {
      id: 'hum',
      name: '습도',
      value: String(hum),
      unit: '%',
      status: hum > 60 ? '이상' : hum > 50 ? '주의' : '정상',
    },
    {
      id: 'press',
      name: '탱크 압력',
      value: String(press),
      unit: 'bar',
      status: press > 2.4 ? '이상' : press > 2.25 ? '주의' : '정상',
    },
    {
      id: 'li',
      name: '리튬 투입량',
      value: String(li),
      unit: 'Li/TM',
      status: li < 1.8 || li > 3.2 ? '이상' : li < 2.0 || li > 3.0 ? '주의' : '정상',
    },
    {
      id: 'add',
      name: '첨가제 비율',
      value: String(add),
      unit: '%',
      status: add > 3.8 ? '이상' : add > 3.5 ? '주의' : '정상',
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Small UI pieces                                                            */
/* -------------------------------------------------------------------------- */

function ToastStack({
  toasts,
  onClose,
}: {
  toasts: ToastItem[];
  onClose: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-24 right-6 z-[70] flex w-[min(92vw,320px)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg ${
            toast.variant === 'error'
              ? 'border-red-300 bg-red-50 text-red-800'
              : toast.variant === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-blue-300 bg-blue-50 text-blue-800'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{toast.message}</span>
            <button type="button" className="text-xs opacity-70" onClick={() => onClose(toast.id)}>
              닫기
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
  wide,
  elevated,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Stack above another open modal (e.g. detail over list). */
  elevated?: boolean;
}) {
  const { isDark } = useUiSettings();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${
        elevated ? 'z-[90]' : 'z-[80]'
      } ${isDark ? 'bg-slate-950/70' : 'bg-slate-900/45'}`}
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="닫기" onClick={onClose} />
      <div
        className={`relative max-h-[85vh] w-full overflow-hidden rounded-2xl border shadow-2xl ${
          wide ? 'max-w-5xl' : 'max-w-2xl'
        } ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}
      >
        <div
          className={`flex items-center justify-between border-b px-5 py-4 ${
            isDark ? 'border-slate-700' : 'border-slate-200'
          }`}
        >
          <h3 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg px-2 py-1 text-sm font-bold ${
              isDark
                ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-100'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            X
          </button>
        </div>
        <div className="max-h-[calc(85vh-64px)] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function TrendChart({
  data,
  isDark = false,
}: {
  data: TrendPoint[];
  isDark?: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 760;
  const height = 340;
  const pad = { top: 30, right: 108, bottom: 38, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const prodMax = 60;
  const passMin = 80;
  const passMax = 100;
  const slotW = data.length > 0 ? innerW / data.length : innerW;
  const yProd = (v: number) => pad.top + innerH - (Math.min(prodMax, Math.max(0, v)) / prodMax) * innerH;
  const yPass = (v: number) =>
    pad.top + innerH - ((Math.min(passMax, Math.max(passMin, v)) - passMin) / (passMax - passMin)) * innerH;
  const yRisk = (v: number) => pad.top + innerH - Math.min(1, Math.max(0, v)) * innerH;
  const gridStroke = isDark ? '#334155' : '#eef2f7';
  const tickFill = isDark ? '#94a3b8' : '#94a3b8';
  const prodColor = '#3b82f6';
  const passColor = '#10b981';
  const riskColor = '#f59e0b';

  const passPoints = data.map((d, i) => `${pad.left + (i + 0.5) * slotW},${yPass(d.passRate)}`).join(' ');
  const riskPoints = data.map((d, i) => `${pad.left + (i + 0.5) * slotW},${yRisk(d.riskIndex)}`).join(' ');
  const linePoints = data.map((d, i) => `${pad.left + (i + 0.5) * slotW},${yProd(d.production)}`).join(' ');
  const hover = hoverIndex !== null ? data[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? pad.left + (hoverIndex + 0.5) * slotW : 0;

  return (
    <div className="relative min-w-0 overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full max-h-[360px] min-h-[320px]"
        role="img"
        aria-label="시간대별 생산량, 합격률, Risk 추이 차트"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <text x={pad.left} y={14} fill={prodColor} fontSize="10" fontWeight="600">
          생산량
        </text>
        <text x={width - pad.right + 8} y={14} fill={passColor} fontSize="10" fontWeight="600">
          합격률
        </text>
        <text x={width - 8} y={14} textAnchor="end" fill={riskColor} fontSize="10" fontWeight="600">
          Risk
        </text>
        {[0, 15, 30, 45, 60].map((tick) => {
          const y = yProd(tick);
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke={gridStroke} strokeWidth="1" />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fill={prodColor} fontSize="10" opacity="0.75">
                {tick}
              </text>
            </g>
          );
        })}
        {[100, 95, 90, 85, 80].map((pass, idx) => {
          const risk = [1, 0.75, 0.5, 0.25, 0][idx];
          const y = yPass(pass);
          return (
            <g key={pass}>
              <text x={width - pad.right + 8} y={y + 3} fill={passColor} fontSize="10" opacity="0.8">
                {pass}%
              </text>
              <text x={width - 8} y={y + 3} textAnchor="end" fill={riskColor} fontSize="10" opacity="0.8">
                {risk.toFixed(2)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => (
          <g key={d.time} onMouseEnter={() => setHoverIndex(i)}>
            <rect
              x={pad.left + i * slotW}
              y={pad.top}
              width={slotW}
              height={innerH}
              fill={hoverIndex === i ? 'rgba(37,99,235,0.06)' : 'transparent'}
            />
            <text
              x={pad.left + (i + 0.5) * slotW}
              y={height - 12}
              textAnchor="middle"
              fill={tickFill}
              fontSize="10"
            >
              {d.time}
            </text>
          </g>
        ))}
        <polyline fill="none" stroke={prodColor} strokeWidth="2" points={linePoints} />
        <polyline fill="none" stroke={passColor} strokeWidth="2" points={passPoints} />
        <polyline fill="none" stroke={riskColor} strokeWidth="2" points={riskPoints} />
        {data.map((d, i) => {
          const x = pad.left + (i + 0.5) * slotW;
          return (
            <g key={`p-${d.time}`} onMouseEnter={() => setHoverIndex(i)}>
              <circle cx={x} cy={yProd(d.production)} r="2.5" fill={prodColor} />
              <circle cx={x} cy={yPass(d.passRate)} r="2.5" fill={passColor} />
              <circle cx={x} cy={yRisk(d.riskIndex)} r="2.5" fill={riskColor} />
            </g>
          );
        })}
        {hoverIndex !== null ? (
          <line
            x1={hoverX}
            x2={hoverX}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke="#94a3b8"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
        ) : null}
      </svg>
      {hover ? (
        <div
          className={`pointer-events-none absolute top-8 z-10 w-44 rounded-lg border px-3 py-2.5 text-xs shadow-md ${
            isDark
              ? 'border-slate-700 bg-slate-800 text-slate-200'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
          style={{
            left: `${Math.min(70, Math.max(2, (hoverX / width) * 100 - 12))}%`,
          }}
        >
          <div className={`mb-1.5 font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {hover.time}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                생산량
              </span>
              <span className="tabular-nums font-medium">{hover.production}건</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                합격률
              </span>
              <span className="tabular-nums font-medium">{hover.passRate}%</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Risk
              </span>
              <span className="tabular-nums font-medium">{hover.riskIndex.toFixed(2)}</span>
            </div>
          </div>
        </div>
      ) : null}
      <div
        className={`mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs ${
          isDark ? 'text-slate-400' : 'text-slate-500'
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-3.5 rounded-full bg-blue-500" aria-hidden />
          생산량
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-3.5 rounded-full bg-emerald-500" aria-hidden />
          합격률
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-3.5 rounded-full bg-amber-500" aria-hidden />
          Risk
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function MainPage() {
  const { isDark, language } = useUiSettings();
  const [seed] = useState(7);
  /** 생산 추이 차트 전용 날짜 필터 (적용 시에만 반영) */
  const [trendFilterDraft, setTrendFilterDraft] = useState<FilterState>(DEFAULT_FILTER);
  const [trendFilterApplied, setTrendFilterApplied] = useState<FilterState>(DEFAULT_FILTER);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [selectedLot, setSelectedLot] = useState<RiskLotView | null>(null);

  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const dataset = useMemo(() => buildLotDataset(seed), [seed]);

  /** KPI·위험 LOT·공정 파라미터용 — 전체 데이터 (최상단 기간 필터 없음) */
  const filteredRecords = dataset;

  const dataRangeStart = useMemo(
    () =>
      dataset.length === 0
        ? DEFAULT_FILTER.startDate
        : dataset.reduce((m, r) => (r.date < m ? r.date : m), dataset[0].date),
    [dataset],
  );
  const dataRangeEnd = useMemo(
    () =>
      dataset.length === 0
        ? DEFAULT_FILTER.endDate
        : dataset.reduce((m, r) => (r.date > m ? r.date : m), dataset[0].date),
    [dataset],
  );

  const riskLots = useMemo(() => {
    return filteredRecords
      .filter(isAnomalous)
      .map(toRiskLotView)
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [filteredRecords]);

  const topRiskLots = TOP_RISK_LOTS_MOCK;

  const kpis = useMemo(() => {
    const totalLots = new Set(filteredRecords.map((r) => r.id)).size;
    const defectLots = filteredRecords.filter((r) => r.quality_defect === 1).length;
    const passRate =
      totalLots === 0 ? 0 : Math.round(((totalLots - defectLots) / totalLots) * 1000) / 10;
    const faultCount = filteredRecords.filter(
      (r) => r.sintering_temp > 835 || r.tank_pressure > 2.4 || r.humidity > 65,
    ).length;
    return [
      {
        id: 'pass',
        title: '실시간 합격률',
        value: `${passRate.toFixed(1)}%`,
        description: '불량 LOT 제외 비율',
        tone: (passRate >= 97.5 ? '정상' : '주의') as StatusTone,
      },
      {
        id: 'risk',
        title: '조치 필요 위험 LOT',
        value: `${riskLots.length}건`,
        description: '이상 조건 감지 LOT',
        tone: (riskLots.length >= 8 ? '위험' : riskLots.length >= 3 ? '주의' : '정상') as StatusTone,
      },
      {
        id: 'fault',
        title: '핵심 설비 이상 건수',
        value: `${faultCount}건`,
        description: '온도/압력/습도 이상',
        tone: (faultCount >= 5 ? '위험' : faultCount >= 2 ? '주의' : '정상') as StatusTone,
      },
    ];
  }, [filteredRecords, riskLots]);

  const topKpis = kpis;

  /** 생산 추이 차트 전용 — 적용된 날짜 필터 */
  const trendRecords = useMemo(() => {
    const { startDate, endDate } = trendFilterApplied;
    if (startDate > endDate) return [];
    return dataset.filter((r) => r.date >= startDate && r.date <= endDate);
  }, [dataset, trendFilterApplied]);

  const trendData = useMemo(() => {
    const slots = getTrendSlots();
    return slots.map((time) => {
      const rows = trendRecords.filter((r) => r.hour === time);
      const production = Math.min(
        60,
        Math.round(rows.reduce((s, r) => s + r.production, 0) / 3),
      );
      const defects = rows.filter((r) => r.quality_defect === 1).length;
      const passRate =
        rows.length === 0 ? 98 : Math.round(((rows.length - defects) / rows.length) * 1000) / 10;
      const riskIndex =
        rows.length === 0
          ? 0.12
          : Math.min(
              1,
              Math.round(
                (rows.reduce((s, r) => s + computeRiskScore(r), 0) / rows.length) * 100,
              ) / 100,
            );
      return {
        time,
        production,
        passRate: Math.max(80, Math.min(100, passRate)),
        failRate: Math.max(0, 100 - passRate),
        riskIndex,
      };
    });
  }, [trendRecords]);

  const params = useMemo(() => buildProcessParams(filteredRecords), [filteredRecords]);

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const pushToast = (message: string, variant: ToastItem['variant'] = 'info') => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    const timer = setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
    toastTimersRef.current.push(timer);
  };

  const handleSearchTrendFilters = () => {
    if (trendFilterDraft.startDate > trendFilterDraft.endDate) {
      pushToast('생산 추이: 시작일이 종료일보다 늦을 수 없습니다.', 'error');
      return;
    }
    setTrendFilterApplied({ ...trendFilterDraft });
    pushToast('생산 추이 날짜 필터가 적용되었습니다.', 'success');
  };

  const handleResetTrendFilters = () => {
    const reset = {
      startDate: dataRangeStart,
      endDate: dataRangeEnd,
    };
    setTrendFilterDraft(reset);
    setTrendFilterApplied(reset);
    pushToast('생산 추이 날짜 필터가 초기화되었습니다.', 'info');
  };

  const { connectLot } = useSelectedLot();

  /** Risk LOT 행 선택 → 챗봇 features 주입 + 패널 오픈 + 자동 O/X 진단 */
  const handleSelectLotForDiagnose = (lot: RiskLotView) => {
    connectLot(lot.record, { openChat: true, diagnose: true });
    pushToast(`${lot.id} 연결 · 챗봇 진단 시작`, 'info');
  };

  const handleOpenLotDetail = (lot: RiskLotView) => {
    setSelectedLot(lot);
  };
  const cardClass = isDark
    ? 'min-w-0 rounded-xl border border-slate-700 bg-slate-800 shadow-sm'
    : 'min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm';
  const subpanelClass = isDark
    ? 'rounded-xl border border-slate-700 bg-slate-900/70'
    : 'rounded-xl border border-slate-200/70 bg-slate-50/40';
  const detailLinkClass = isDark
    ? 'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40'
    : 'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40';
  const tableDetailBtnClass = isDark
    ? 'inline-flex h-7 items-center justify-center rounded-md border border-slate-600 px-2.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40'
    : 'inline-flex h-7 items-center justify-center rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40';
  const rowHoverClass = isDark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50';
  const tableBorderClass = isDark ? 'border-slate-700' : 'border-slate-100';
  const appliedPeriodLabel = `${formatDisplayDate(trendFilterApplied.startDate)} ~ ${formatDisplayDate(trendFilterApplied.endDate)}`;

  return (
    <div
      className={`h-full overflow-y-auto ${
        isDark
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800'
          : 'bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50'
      }`}
    >
      <div className={`${SHELL_CONTENT_CLASS} space-y-5 py-6 pb-40`}>
        <header className="mb-1 min-w-0">
          <div className="mb-6 flex flex-col gap-1">
            <p
              className={`text-sm font-bold tracking-wide ${
                isDark ? 'text-blue-400' : 'text-blue-600'
              }`}
            >
              Process Monitoring
            </p>
            <h1
              className={`mt-1 text-3xl font-bold tracking-tight ${
                isDark ? 'text-slate-100' : 'text-gray-900'
              }`}
            >
              {language === 'en' ? 'Overall Process Monitoring' : '종합 공정 모니터링'}
            </h1>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              {language === 'en'
                ? 'Monitor production progress and equipment status in real time.'
                : '생산 공정의 진행 현황과 설비 상태를 실시간으로 확인합니다.'}
            </p>
          </div>
        </header>

        <section
          className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${
            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200/80 bg-white'
          }`}
        >
          <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
            종합 공정 현황 요약
          </h2>
          <div
            className={`mt-4 border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 md:gap-5">
              {topKpis.map((kpi) => (
                <div key={kpi.id} className={`${subpanelClass} p-4 md:p-5`}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div
                      className={`min-w-0 text-sm font-medium ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {kpi.title}
                    </div>
                    {kpi.id === 'risk' ? (
                      <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
                        {kpi.value}
                      </span>
                    ) : (
                      <span className={toneClass(kpi.tone)}>{kpi.tone}</span>
                    )}
                  </div>
                  <div
                    className={`text-xl font-bold tabular-nums tracking-tight sm:text-2xl lg:text-3xl ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    {kpi.value}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{kpi.description}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${
            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200/80 bg-white'
          }`}
        >
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              실시간 핵심 공정 파라미터
            </h2>
            <p className="text-xs text-slate-400">실시간 평균 상태</p>
          </div>
          <div className={`border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {params.map((param) => (
                <div key={param.id} className={`${subpanelClass} p-4 md:p-5`}>
                  <div className="mb-2.5 flex items-start justify-between gap-2">
                    <div
                      className={`min-w-0 text-xs font-medium leading-tight ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {param.name}
                    </div>
                    <span className={toneClass(param.status)}>{param.status}</span>
                  </div>
                  <div
                    className={`flex flex-wrap items-baseline gap-x-1 text-xl font-bold tabular-nums tracking-tight sm:text-2xl lg:text-3xl ${
                      isDark ? 'text-slate-100' : 'text-slate-800'
                    }`}
                  >
                    <span>{param.value}</span>
                    <span className="ml-1 text-xs font-normal text-slate-500">{param.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 items-stretch gap-5 pb-8 xl:grid-cols-5">
          <section className={`${cardClass} flex h-full flex-col p-5 md:p-6 xl:col-span-3`} aria-labelledby="trend-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id="trend-heading"
                  className={`text-base font-semibold tracking-tight ${
                    isDark ? 'text-slate-100' : 'text-slate-900'
                  }`}
                >
                  생산 추이
                </h2>
                <p className={`mt-1 text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  시간대별 생산량, 합격률 및 위험도 변화
                </p>
              </div>
              <Link href="/dashboard" className={detailLinkClass}>
                상세보기
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div
              className={`mt-5 flex flex-wrap items-center gap-2 rounded-lg p-3 ${
                isDark ? 'bg-slate-900/50' : 'bg-slate-50'
              }`}
            >
              <DateInput
                aria-label="생산 추이 시작일"
                value={trendFilterDraft.startDate}
                onChange={(startDate) => setTrendFilterDraft((p) => ({ ...p, startDate }))}
                isDark={isDark}
                className="sm:w-[148px]"
              />
              <span className={`shrink-0 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                –
              </span>
              <DateInput
                aria-label="생산 추이 종료일"
                value={trendFilterDraft.endDate}
                onChange={(endDate) => setTrendFilterDraft((p) => ({ ...p, endDate }))}
                isDark={isDark}
                className="sm:w-[148px]"
              />
              <button
                type="button"
                onClick={handleSearchTrendFilters}
                className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                적용
              </button>
              <button
                type="button"
                onClick={handleResetTrendFilters}
                className={`inline-flex h-9 items-center rounded-md border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                  isDark
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                초기화
              </button>
            </div>

            <p className={`mt-3 mb-2 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              조회 기간: {appliedPeriodLabel}
            </p>

            <div className="mt-auto min-w-0">
              <TrendChart data={trendData} isDark={isDark} />
            </div>
          </section>

          <section
            className={`${cardClass} flex h-full min-h-0 flex-col p-5 md:p-6 xl:col-span-2`}
            aria-labelledby="risk-lot-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id="risk-lot-heading"
                    className={`text-base font-semibold tracking-tight ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    위험 LOT Top
                  </h2>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      isDark
                        ? 'bg-slate-700/80 text-slate-300'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    전체 {riskLots.length}건
                  </span>
                </div>
                <p className={`mt-1 text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  위험도가 높은 LOT를 우선순위별로 확인합니다.
                </p>
              </div>
              <Link href="/issue" className={detailLinkClass}>
                상세보기
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div className="mt-5 -mx-1 min-h-0 flex-1 overflow-x-auto overflow-y-auto px-1">
              <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                <thead>
                  <tr className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <th className={`border-b pb-2.5 pr-3 ${tableBorderClass}`}>LOT</th>
                    <th className={`border-b pb-2.5 pr-3 ${tableBorderClass}`}>위험 원인</th>
                    <th className={`border-b pb-2.5 pr-3 text-right ${tableBorderClass}`}>위험도</th>
                    <th className={`border-b pb-2.5 pr-3 ${tableBorderClass}`}>등급</th>
                    <th className={`border-b pb-2.5 pl-1 text-right ${tableBorderClass}`}>상세</th>
                  </tr>
                </thead>
                <tbody>
                  {topRiskLots.map((lot) => (
                    <tr
                      key={lot.id}
                      className={`group cursor-pointer transition-colors ${rowHoverClass}`}
                      onClick={() => handleSelectLotForDiagnose(lot)}
                    >
                      <td
                        className={`whitespace-nowrap border-b py-3 pr-3 text-xs font-medium ${tableBorderClass} ${
                          isDark ? 'text-slate-100' : 'text-slate-800'
                        }`}
                      >
                        {lot.id}
                      </td>
                      <td
                        className={`max-w-[140px] truncate border-b py-3 pr-3 text-xs ${tableBorderClass} ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                        title={lot.riskReason}
                      >
                        {lot.riskReason}
                      </td>
                      <td
                        className={`w-16 whitespace-nowrap border-b py-3 pr-3 text-right text-xs font-medium tabular-nums ${tableBorderClass} ${
                          isDark ? 'text-slate-100' : 'text-slate-800'
                        }`}
                      >
                        {lot.riskScore.toFixed(2)}
                      </td>
                      <td className={`border-b py-3 pr-3 ${tableBorderClass}`}>
                        <span className={riskGradeClass(lot.status)}>{lot.status}</span>
                      </td>
                      <td className={`border-b py-3 pl-1 text-right ${tableBorderClass}`}>
                        <button
                          type="button"
                          className={tableDetailBtnClass}
                          aria-label={`${lot.id} 상세 공정 데이터 보기`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenLotDetail(lot);
                          }}
                        >
                          상세
                        </button>
                      </td>
                    </tr>
                  ))}
                  {topRiskLots.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className={`py-10 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                      >
                        선택한 기간에 위험 LOT가 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>

      <ToastStack toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      <Modal open={!!selectedLot} title="LOT 상세 공정 데이터" onClose={() => setSelectedLot(null)}>
        {selectedLot ? (
          <div className={`space-y-4 text-sm ${isDark ? 'text-slate-200' : ''}`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">LOT</div>
                <div className={`font-bold break-all ${isDark ? 'text-slate-100' : ''}`}>
                  {selectedLot.id}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">위험등급</div>
                <span className={riskGradeClass(selectedLot.status)}>{selectedLot.status}</span>
              </div>
              <div>
                <div className="text-xs text-slate-500">위험도</div>
                <div className={`font-bold ${isDark ? 'text-slate-100' : ''}`}>
                  {selectedLot.riskScore.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">일시</div>
                <div className={`font-semibold ${isDark ? 'text-slate-100' : ''}`}>
                  {selectedLot.record.date} {selectedLot.record.hour}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">위험 원인</div>
              <div
                className={`mt-1 font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
              >
                {selectedLot.riskReason}
              </div>
            </div>
            <div
              className={`grid grid-cols-2 gap-3 rounded-xl p-3 ${
                isDark ? 'bg-slate-900' : 'bg-slate-50'
              }`}
            >
              {[
                ['소성온도', `${selectedLot.record.sintering_temp} ℃`],
                ['공정시간', `${selectedLot.record.process_time} min`],
                ['습도', `${selectedLot.record.humidity} %`],
                ['탱크 압력', `${selectedLot.record.tank_pressure} bar`],
                ['리튬 투입량', `${selectedLot.record.lithium_input}`],
                ['첨가제 비율', `${selectedLot.record.additive_ratio} %`],
                ['금속 불순물', `${selectedLot.record.metal_impurity}`],
                ['품질 불량', selectedLot.record.quality_defect === 1 ? 'Yes' : 'No'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-[11px] text-slate-500">{label}</div>
                  <div
                    className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                handleSelectLotForDiagnose(selectedLot);
                setSelectedLot(null);
              }}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              챗봇으로 진단
            </button>
          </div>
        ) : null}
      </Modal>

    </div>
  );
}
   