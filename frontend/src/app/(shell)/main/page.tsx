'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type StatusTone = '정상' | '주의' | '경고' | '위험' | '이상';
type ChartType = 'bar' | 'line' | 'pie';
type TrendInterval = '1h' | '2h' | 'shift';
type ChatRole = 'user' | 'ai';

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
  status: StatusTone;
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

type ChatMessage = {
  id: number;
  role: ChatRole;
  text: string;
};

type NotificationItem = {
  id: string;
  time: string;
  title: string;
  message: string;
  unread: boolean;
};

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_FILTER: FilterState = {
  startDate: '2026-07-20',
  endDate: '2026-07-22',
};

const SUGGESTED_QUESTIONS = [
  '현재 위험 LOT 알려줘',
  '오늘 불량률 요약해줘',
  '소성 온도 이상 원인 분석',
] as const;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatDateTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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

function riskStatus(score: number): StatusTone {
  if (score >= 0.8) return '위험';
  if (score >= 0.7) return '경고';
  return '주의';
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

function getTrendSlots(interval: TrendInterval) {
  if (interval === '1h') return Array.from({ length: 15 }, (_, i) => `${pad(8 + i)}:00`);
  if (interval === 'shift') return ['주간(08-20)', '야간(20-08)'];
  return ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
}

function hourToShift(hour: string) {
  const h = Number(hour.slice(0, 2));
  return h >= 8 && h < 20 ? '주간(08-20)' : '야간(20-08)';
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

function buildAiReply(input: string, riskLots: RiskLotView[], passRate: string) {
  const text = input.toLowerCase();
  const top = riskLots[0];
  if (text.includes('위험') || text.includes('lot')) {
    return top
      ? `우선 조치 대상은 ${top.id}입니다. 원인: ${top.riskReason}. 위험도 ${top.riskScore.toFixed(2)}.`
      : '현재 필터 조건에서 위험 LOT가 없습니다.';
  }
  if (text.includes('불량') || text.includes('합격') || text.includes('요약')) {
    return `현재 합격률은 ${passRate}이며 위험 LOT는 ${riskLots.length}건입니다.`;
  }
  if (text.includes('온도') || text.includes('소성')) {
    return '소성온도 상한 초과 시 히터 출력 하향, 가스/체류시간 점검 후 Risk Index를 재확인하세요.';
  }
  return '위험 LOT, 불량률, 소성 온도에 대해 질문해 주시면 현재 화면 기준으로 안내합니다.';
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
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="닫기" onClick={onClose} />
      <div
        className={`relative max-h-[85vh] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${
          wide ? 'max-w-5xl' : 'max-w-2xl'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
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
  chartType,
}: {
  data: TrendPoint[];
  chartType: ChartType;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 760;
  const height = 300;
  const pad = { top: 28, right: 118, bottom: 36, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const prodMax = 60;
  const passMin = 80;
  const passMax = 100;
  const slotW = data.length > 0 ? innerW / data.length : innerW;
  const barW = Math.max(8, slotW * 0.42);
  const yProd = (v: number) => pad.top + innerH - (Math.min(prodMax, Math.max(0, v)) / prodMax) * innerH;
  const yPass = (v: number) =>
    pad.top + innerH - ((Math.min(passMax, Math.max(passMin, v)) - passMin) / (passMax - passMin)) * innerH;
  const yRisk = (v: number) => pad.top + innerH - Math.min(1, Math.max(0, v)) * innerH;
  const totalPie = data.reduce((s, d) => s + d.production, 0) || 1;
  const colors = ['#2563eb', '#0d9488', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#059669', '#ea580c'];

  if (chartType === 'pie') {
    let cursor = -Math.PI / 2;
    const arcs = data.map((d, i) => {
      const ratio = d.production / totalPie;
      const start = cursor;
      const end = cursor + ratio * Math.PI * 2;
      cursor = end;
      const large = end - start > Math.PI ? 1 : 0;
      const x1 = 160 + Math.cos(start) * 90;
      const y1 = 140 + Math.sin(start) * 90;
      const x2 = 160 + Math.cos(end) * 90;
      const y2 = 140 + Math.sin(end) * 90;
      return { d, i, path: `M160,140 L${x1},${y1} A90,90 0 ${large} 1 ${x2},${y2} Z`, color: colors[i % colors.length] };
    });
    return (
      <div className="grid gap-4 sm:grid-cols-[minmax(0,280px)_1fr]">
        <svg viewBox="0 0 320 280" className="mx-auto h-auto w-full max-w-[320px]">
          {arcs.map((a) => (
            <path key={a.d.time} d={a.path} fill={a.color} opacity={0.9} />
          ))}
          <circle cx="160" cy="140" r="48" fill="#fff" />
          <text x="160" y="136" textAnchor="middle" className="fill-slate-700 text-[12px] font-bold">
            생산량
          </text>
          <text x="160" y="154" textAnchor="middle" className="fill-slate-500 text-[11px]">
            {totalPie}건
          </text>
        </svg>
        <ul className="space-y-2 text-sm">
          {arcs.map((a) => (
            <li key={a.d.time} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-slate-700">
                <span className="h-3 w-3 rounded-sm" style={{ background: a.color }} />
                {a.d.time}
              </span>
              <span className="font-semibold text-slate-900">
                {a.d.production}건 ({Math.round((a.d.production / totalPie) * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const passPoints = data.map((d, i) => `${pad.left + (i + 0.5) * slotW},${yPass(d.passRate)}`).join(' ');
  const riskPoints = data.map((d, i) => `${pad.left + (i + 0.5) * slotW},${yRisk(d.riskIndex)}`).join(' ');
  const linePoints = data.map((d, i) => `${pad.left + (i + 0.5) * slotW},${yProd(d.production)}`).join(' ');
  const hover = hoverIndex !== null ? data[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? pad.left + (hoverIndex + 0.5) * slotW : 0;

  return (
    <div className="relative overflow-hidden px-1 pr-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <text x={pad.left} y={14} fill="#94a3b8" fontSize="10" fontWeight="600">
          생산량
        </text>
        <text x={width - pad.right + 10} y={14} fill="#10b981" fontSize="10" fontWeight="600">
          합격률
        </text>
        <text x={width - 10} y={14} textAnchor="end" fill="#f59e0b" fontSize="10" fontWeight="600">
          Risk
        </text>
        {[0, 15, 30, 45, 60].map((tick) => {
          const y = yProd(tick);
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#f1f5f9" />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="11">
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
              <text x={width - pad.right + 10} y={y + 3} fill="#10b981" fontSize="10">
                {pass}%
              </text>
              <text x={width - 10} y={y + 3} textAnchor="end" fill="#d97706" fontSize="10">
                {risk.toFixed(2)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x = pad.left + i * slotW + (slotW - barW) / 2;
          const y = yProd(d.production);
          return (
            <g key={d.time} onMouseEnter={() => setHoverIndex(i)}>
              <rect
                x={pad.left + i * slotW}
                y={pad.top}
                width={slotW}
                height={innerH}
                fill={hoverIndex === i ? 'rgba(37,99,235,0.06)' : 'transparent'}
              />
              {chartType === 'bar' ? (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(0, pad.top + innerH - y)}
                  rx={4}
                  fill="#3b82f6"
                  opacity={0.85}
                />
              ) : null}
              <text
                x={pad.left + (i + 0.5) * slotW}
                y={height - 10}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="10"
              >
                {d.time}
              </text>
            </g>
          );
        })}
        {chartType === 'line' ? (
          <polyline fill="none" stroke="#3b82f6" strokeWidth="2.4" points={linePoints} />
        ) : null}
        <polyline fill="none" stroke="#10b981" strokeWidth="2" points={passPoints} />
        <polyline fill="none" stroke="#f59e0b" strokeWidth="2" points={riskPoints} />
        {data.map((d, i) => {
          const x = pad.left + (i + 0.5) * slotW;
          return (
            <g key={`p-${d.time}`} onMouseEnter={() => setHoverIndex(i)}>
              {chartType === 'line' ? <circle cx={x} cy={yProd(d.production)} r="3" fill="#3b82f6" /> : null}
              <circle cx={x} cy={yPass(d.passRate)} r="2.8" fill="#10b981" />
              <circle cx={x} cy={yRisk(d.riskIndex)} r="2.8" fill="#f59e0b" />
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
          />
        ) : null}
      </svg>
      {hover ? (
        <div
          className="pointer-events-none absolute top-8 z-10 w-48 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-lg"
          style={{ left: `${Math.min(68, Math.max(2, (hoverX / width) * 100 - 14))}%` }}
        >
          <div className="mb-1 font-semibold text-slate-900">{hover.time}</div>
          <div>생산량: {hover.production}건</div>
          <div>합격률: {hover.passRate}%</div>
          <div>Risk Index: {hover.riskIndex.toFixed(2)}</div>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> 생산량
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-emerald-500" /> 합격률
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-amber-500" /> Risk
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function MainPage() {
  const [now, setNow] = useState(() => formatDateTime(new Date()));
  const [seed, setSeed] = useState(7);
  const [draftFilter, setDraftFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [appliedFilter, setAppliedFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [trendInterval, setTrendInterval] = useState<TrendInterval>('2h');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [selectedLot, setSelectedLot] = useState<RiskLotView | null>(null);
  const [allRiskOpen, setAllRiskOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNotifyOpen, setIsNotifyOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'ai',
      text: '안녕하세요. AI 공정 지원 챗봇입니다. 위험 LOT, 불량률, 소성 온도에 대해 질문해 주세요.',
    },
  ]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'n1',
      time: '11:03',
      title: '위험 LOT 경고',
      message: '고위험 LOT가 감지되었습니다.',
      unread: true,
    },
    {
      id: 'n2',
      time: '10:42',
      title: '공정 습도',
      message: '습도 상한 근접 구간이 있습니다.',
      unread: true,
    },
  ]);

  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chatIdRef = useRef(2);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyRef = useRef<HTMLDivElement | null>(null);

  const dataset = useMemo(() => buildLotDataset(seed), [seed]);

  const filteredRecords = useMemo(() => {
    return dataset.filter(
      (r) => r.date >= appliedFilter.startDate && r.date <= appliedFilter.endDate,
    );
  }, [dataset, appliedFilter]);

  const riskLots = useMemo(() => {
    return filteredRecords
      .filter(isAnomalous)
      .map(toRiskLotView)
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [filteredRecords]);

  const topRiskLots = useMemo(() => riskLots.slice(0, 5), [riskLots]);

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

  const trendData = useMemo(() => {
    const slots = getTrendSlots(trendInterval);
    return slots.map((time) => {
      const rows = filteredRecords.filter((r) => {
        if (trendInterval === 'shift') return hourToShift(r.hour) === time;
        if (trendInterval === '2h') {
          const h = Number(r.hour.slice(0, 2));
          const slotH = Number(time.slice(0, 2));
          return h === slotH || h === slotH + 1;
        }
        return r.hour === time;
      });
      const production = Math.min(
        60,
        Math.round(rows.reduce((s, r) => s + r.production, 0) / Math.max(1, trendInterval === '1h' ? 3 : 2)),
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
  }, [filteredRecords, trendInterval]);

  const params = useMemo(() => buildProcessParams(filteredRecords), [filteredRecords]);
  const passKpi = kpis.find((k) => k.id === 'pass')?.value ?? '0%';
  const unreadCount = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    const timer = setInterval(() => setNow(formatDateTime(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isChatOpen) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatOpen]);

  useEffect(() => {
    if (!isNotifyOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifyRef.current && !notifyRef.current.contains(target)) setIsNotifyOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isNotifyOpen]);

  useEffect(() => {
    return () => {
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
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

  const handleSearch = () => {
    if (draftFilter.startDate > draftFilter.endDate) {
      pushToast('시작일이 종료일보다 늦을 수 없습니다.', 'error');
      return;
    }
    setAppliedFilter({ ...draftFilter });
    pushToast('필터가 적용되었습니다.', 'success');
  };

  const handleReset = () => {
    setDraftFilter(DEFAULT_FILTER);
    setAppliedFilter(DEFAULT_FILTER);
    setSeed(7);
    pushToast('필터가 초기화되었습니다.', 'info');
  };

  const handleLotAction = (lot: RiskLotView) => {
    pushToast(`${lot.id} 조치/알림이 접수되었습니다.`, 'success');
  };

  const sendMessage = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    chatIdRef.current += 1;
    setMessages((prev) => [...prev, { id: chatIdRef.current, role: 'user', text }]);
    setChatInput('');
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    replyTimerRef.current = setTimeout(() => {
      chatIdRef.current += 1;
      setMessages((prev) => [
        ...prev,
        { id: chatIdRef.current, role: 'ai', text: buildAiReply(text, riskLots, passKpi) },
      ]);
    }, 500 + Math.floor(Math.random() * 400));
  };

  const onChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(chatInput);
  };

  const onChatKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(chatInput);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-[1920px] space-y-5 px-4 py-6 pb-40 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              종합 공정 모니터링
            </h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{now}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSeed((s) => s + 1);
                pushToast('데이터가 갱신되었습니다.', 'success');
              }}
              className="inline-flex h-9 items-center rounded-lg border border-slate-200/60 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              새로고침
            </button>

            <div className="relative" ref={notifyRef}>
              <button
                type="button"
                aria-label="알림"
                onClick={() => setIsNotifyOpen((v) => !v)}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/60 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 3a5.5 5.5 0 0 0-5.5 5.5v2.1c0 .7-.2 1.4-.6 2L4.7 14.4a1.2 1.2 0 0 0 1 1.9h12.6a1.2 1.2 0 0 0 1-1.9l-1.2-1.8c-.4-.6-.6-1.3-.6-2V8.5A5.5 5.5 0 0 0 12 3Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9.2 17.6a2.8 2.8 0 0 0 5.6 0"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                {unreadCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </button>
              {isNotifyOpen ? (
                <div className="absolute right-0 top-11 z-40 w-[min(92vw,320px)] overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-lg">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <strong className="text-sm text-slate-800">알림</strong>
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-500 hover:text-slate-700"
                      onClick={() =>
                        setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))
                      }
                    >
                      모두 읽음
                    </button>
                  </div>
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                        n.unread ? 'bg-blue-50/40' : ''
                      }`}
                      onClick={() =>
                        setNotifications((prev) =>
                          prev.map((item) => (item.id === n.id ? { ...item, unread: false } : item)),
                        )
                      }
                    >
                      <div className="flex justify-between gap-2 text-sm font-semibold text-slate-800">
                        <span>{n.title}</span>
                        <span className="text-xs font-normal text-slate-400">{n.time}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{n.message}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <a
              href="/login"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200/60 bg-white pl-1.5 pr-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                나
              </span>
              프로필
            </a>
          </div>
        </header>

        <section className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 shadow-sm sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-8 w-full max-w-full items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50/80 sm:w-auto">
              <input
                type="date"
                aria-label="시작일"
                value={draftFilter.startDate}
                onChange={(e) => setDraftFilter((p) => ({ ...p, startDate: e.target.value }))}
                className="h-8 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-slate-700 outline-none sm:w-[138px] sm:flex-none sm:px-2.5"
              />
              <span className="shrink-0 px-1 text-xs text-slate-400">–</span>
              <input
                type="date"
                aria-label="종료일"
                value={draftFilter.endDate}
                onChange={(e) => setDraftFilter((p) => ({ ...p, endDate: e.target.value }))}
                className="h-8 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-slate-700 outline-none sm:w-[138px] sm:flex-none sm:px-2.5"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              className="inline-flex h-8 items-center rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
            >
              적용
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              초기화
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-semibold text-slate-700">종합 공정 현황 요약</h2>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 md:gap-5">
              {topKpis.map((kpi) => (
                <div
                  key={kpi.id}
                  className="rounded-xl border border-slate-200/70 bg-slate-50/40 p-4 md:p-5"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 text-sm font-medium text-slate-500">{kpi.title}</div>
                    {kpi.id === 'risk' ? (
                      <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
                        {kpi.value}
                      </span>
                    ) : (
                      <span className={toneClass(kpi.tone)}>{kpi.tone}</span>
                    )}
                  </div>
                  <div className="text-xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-2xl lg:text-3xl">
                    {kpi.value}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{kpi.description}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700">실시간 핵심 공정 파라미터</h2>
            <p className="text-xs text-slate-400">실시간 평균 상태</p>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {params.map((param) => (
                <div
                  key={param.id}
                  className="rounded-xl border border-slate-200/70 bg-slate-50/40 p-4 md:p-5"
                >
                  <div className="mb-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0 text-xs font-medium leading-tight text-slate-500">
                      {param.name}
                    </div>
                    <span className={toneClass(param.status)}>{param.status}</span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-1 text-xl font-bold tabular-nums tracking-tight text-slate-800 sm:text-2xl lg:text-3xl">
                    <span>{param.value}</span>
                    <span className="ml-1 text-xs font-normal text-slate-500">{param.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 pb-8 xl:grid-cols-12">
          <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm md:p-5 xl:col-span-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900">생산 추이</h2>
                <p className="mt-0.5 text-xs text-slate-400">듀얼 Y축 · 집계 주기 선택</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  {(
                    [
                      ['bar', '막대', 'M4 14h3v6H4zm6-8h3v14h-3zm6 4h3v10h-3z'],
                      ['line', '선형', 'M4 16l5-5 4 3 7-8'],
                      ['pie', '원형', 'M12 3a9 9 0 1 1-9 9h9V3z'],
                    ] as Array<[ChartType, string, string]>
                  ).map(([type, label, d]) => (
                    <button
                      key={type}
                      type="button"
                      title={label}
                      aria-label={label}
                      onClick={() => setChartType(type)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
                        chartType === type
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d={d}
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill={type === 'pie' ? 'currentColor' : 'none'}
                          fillOpacity={type === 'pie' ? 0.2 : 0}
                        />
                      </svg>
                    </button>
                  ))}
                </div>
                <select
                  value={trendInterval}
                  onChange={(e) => setTrendInterval(e.target.value as TrendInterval)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 outline-none hover:bg-slate-50"
                >
                  <option value="1h">1시간 단위</option>
                  <option value="2h">2시간 단위</option>
                  <option value="shift">Shift (주간·야간)</option>
                </select>
              </div>
            </div>
            <TrendChart data={trendData} chartType={chartType} />
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-white p-4 pb-16 shadow-sm md:p-5 xl:col-span-5 xl:pb-5">
            <h2 className="text-base font-semibold text-slate-900">위험 LOT Top</h2>
            <p className="mt-0.5 text-xs text-slate-400">위험도 내림차순 · 행 클릭 시 상세</p>
            <div className="mt-3 -mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead>
                  <tr className="text-xs text-slate-400">
                    {['LOT', '위험 원인', '위험도', '상태', ''].map((h) => (
                      <th key={h || 'action'} className="border-b border-slate-100 pb-2 pr-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topRiskLots.map((lot) => (
                    <tr
                      key={lot.id}
                      className="cursor-pointer hover:bg-slate-50/80"
                      onClick={() => setSelectedLot(lot)}
                    >
                      <td className="whitespace-nowrap border-b border-slate-50 py-2.5 pr-3 text-xs font-semibold text-slate-800">
                        {lot.id}
                      </td>
                      <td
                        className="max-w-[160px] truncate border-b border-slate-50 py-2.5 pr-3 text-xs text-slate-500"
                        title={lot.riskReason}
                      >
                        {lot.riskReason}
                      </td>
                      <td className="whitespace-nowrap border-b border-slate-50 py-2.5 pr-3 text-xs font-semibold tabular-nums text-slate-800">
                        {lot.riskScore.toFixed(2)}
                      </td>
                      <td className="border-b border-slate-50 py-2.5 pr-3">
                        <span className={toneClass(lot.status)}>{lot.status}</span>
                      </td>
                      <td className="border-b border-slate-50 py-2.5 pr-2 xl:pr-14">
                        <button
                          type="button"
                          className="whitespace-nowrap rounded-md border border-slate-200/80 bg-transparent px-2 py-1 text-[11px] font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLotAction(lot);
                          }}
                        >
                          조치
                        </button>
                      </td>
                    </tr>
                  ))}
                  {topRiskLots.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-sm text-slate-400">
                        선택한 기간에 위험 LOT가 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => setAllRiskOpen(true)}
              className="mt-3 w-full rounded-lg border border-slate-200/80 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 xl:max-w-[calc(100%-3.5rem)]"
            >
              전체 위험 LOT 조회 ({riskLots.length})
            </button>
          </div>
        </section>
      </div>

      <ToastStack toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      <Modal open={!!selectedLot} title="LOT 상세 공정 데이터" onClose={() => setSelectedLot(null)}>
        {selectedLot ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">LOT</div>
                <div className="font-bold break-all">{selectedLot.id}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">상태</div>
                <span className={toneClass(selectedLot.status)}>{selectedLot.status}</span>
              </div>
              <div>
                <div className="text-xs text-slate-500">위험도</div>
                <div className="font-bold">{selectedLot.riskScore.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">일시</div>
                <div className="font-semibold">
                  {selectedLot.record.date} {selectedLot.record.hour}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">위험 원인</div>
              <div className="mt-1 font-medium text-slate-800">{selectedLot.riskReason}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
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
                  <div className="font-semibold text-slate-900">{value}</div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                handleLotAction(selectedLot);
                setSelectedLot(null);
              }}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              조치/알림 실행
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal open={allRiskOpen} title={`전체 위험 LOT (${riskLots.length})`} onClose={() => setAllRiskOpen(false)} wide>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                {['LOT', '위험 원인', '위험도', '상태', ''].map((h) => (
                  <th key={h || 'action'} className="border-b border-slate-100 pb-2.5 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {riskLots.map((lot) => (
                <tr key={lot.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap border-b border-slate-50 py-2.5 pr-3 text-xs font-semibold">
                    {lot.id}
                  </td>
                  <td
                    className="max-w-[220px] truncate border-b border-slate-50 py-2.5 pr-3 text-xs text-slate-500"
                    title={lot.riskReason}
                  >
                    {lot.riskReason}
                  </td>
                  <td className="whitespace-nowrap border-b border-slate-50 py-2.5 pr-3 text-xs font-semibold tabular-nums">
                    {lot.riskScore.toFixed(2)}
                  </td>
                  <td className="border-b border-slate-50 py-2.5 pr-3">
                    <span className={toneClass(lot.status)}>{lot.status}</span>
                  </td>
                  <td className="border-b border-slate-50 py-2.5">
                    <button
                      type="button"
                      className="rounded-md border border-slate-200/80 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
                      onClick={() => setSelectedLot(lot)}
                    >
                      상세
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {isChatOpen ? (
        <div className="fixed bottom-24 right-4 z-[60] flex h-[min(520px,70vh)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-6">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <strong className="text-sm">AI 공정 지원 챗봇</strong>
            <button type="button" onClick={() => setIsChatOpen(false)} className="font-bold text-slate-500">
              X
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-slate-50/60 p-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-auto rounded-br-md bg-blue-600 text-white'
                    : 'mr-auto rounded-bl-md border border-slate-200 bg-white text-slate-800'
                }`}
              >
                {m.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600"
                >
                  {q}
                </button>
              ))}
            </div>
            <form onSubmit={onChatSubmit} className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={onChatKeyDown}
                placeholder="메시지를 입력하세요..."
                className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm"
              />
              <button type="submit" className="rounded-xl bg-blue-600 px-3 text-sm font-bold text-white">
                전송
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label="AI 챗봇"
        onClick={() => {
          setIsNotifyOpen(false);
          setIsChatOpen((v) => !v);
        }}
        className="fixed bottom-5 right-5 z-[65] flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-lg text-white shadow-lg hover:bg-blue-700"
      >
        💬
      </button>
    </div>
  );
}
 