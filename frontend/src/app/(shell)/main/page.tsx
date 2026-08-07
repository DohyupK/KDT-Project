'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useSelectedLot } from '@/context/SelectedLotContext';
import {
  useRefreshSettings,
  useUiSettings,
} from '@/components/layout/AppShell';
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent';
import { useShellRefresh } from '@/hooks/useShellRefresh';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type RiskGrade = '심각' | '주의' | '안정';

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

type SummaryKpi = {
  id: string;
  title: string;
  value: string;
  description: string;
};

type ToastItem = {
  id: number;
  message: string;
  variant: 'success' | 'error' | 'info';
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function riskGradeClass(grade: RiskGrade) {
  const base =
    'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold';
  if (grade === '심각') return `${base} bg-red-100 text-red-700`;
  if (grade === '주의') return `${base} bg-amber-100 text-amber-700`;
  return `${base} bg-emerald-100 text-emerald-700`;
}

function riskGradeRank(grade: RiskGrade) {
  if (grade === '심각') return 2;
  if (grade === '주의') return 1;
  return 0;
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

/** 위험 LOT Top 테이블 전용 Mock (위험등급: 심각/주의/안정) */
const TOP_RISK_LOTS_MOCK: RiskLotView[] = [
  {
    id: 'LOT-20260722-N12',
    riskScore: 0.94,
    status: '심각',
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
    status: '심각',
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
    status: '주의',
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
    status: '주의',
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
    status: '안정',
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

/** 금일 00시 기준 실시간 집계용 KPI — 값은 API 연동 전 공란 */
const SUMMARY_KPIS: SummaryKpi[] = [
  {
    id: 'yield-rate',
    title: '실시간 양품률',
    value: '—',
    description: '금일 00시부터 양품 LOT 비율',
  },
  {
    id: 'yield-count',
    title: '양품수',
    value: '—',
    description: '금일 00시부터 양품 LOT 건수',
  },
  {
    id: 'defect-rate',
    title: '불량률',
    value: '—',
    description: '금일 00시부터 불량 LOT 비율',
  },
  {
    id: 'defect-count',
    title: '불량수',
    value: '—',
    description: '금일 00시부터 불량 LOT 건수',
  },
];

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

/* -------------------------------------------------------------------------- */
/* Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function MainPage() {
  const { isDark, language } = useUiSettings();
  const { autoRefreshEnabled, refreshInterval } = useRefreshSettings();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [selectedLot, setSelectedLot] = useState<RiskLotView | null>(null);
  /** Placeholder refresh token — swap body for API fetch later */
  const [refreshKey, setRefreshKey] = useState(0);

  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const loadMainData = () => {
    setRefreshKey((k) => k + 1);
  };

  /** 심각·주의만 노출, 위험등급 높은 순 → 최신 LOT 순 */
  const topRiskLots = useMemo(() => {
    return TOP_RISK_LOTS_MOCK.filter((lot) => lot.status === '심각' || lot.status === '주의').sort(
      (a, b) => {
        const gradeDiff = riskGradeRank(b.status) - riskGradeRank(a.status);
        if (gradeDiff !== 0) return gradeDiff;
        const aTime = `${a.record.date}T${a.record.hour}`;
        const bTime = `${b.record.date}T${b.record.hour}`;
        if (aTime < bTime) return 1;
        if (aTime > bTime) return -1;
        return b.riskScore - a.riskScore;
      },
    );
    // refreshKey reserved for when mock is replaced by API data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    loadMainData();
  }, []);

  useShellRefresh(loadMainData);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const timer = window.setInterval(loadMainData, refreshInterval * 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, refreshInterval]);

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
              {language === 'en' ? 'Sintering Process Monitoring' : '소성 공정 모니터링'}
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
            {language === 'en' ? 'Sintering Process Forecast' : '소성 공정 예측 현황'}
          </h2>
          <div
            className={`mt-4 border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-5">
              {SUMMARY_KPIS.map((kpi) => (
                <div key={kpi.id} className={`${subpanelClass} p-4 md:p-5`}>
                  <div
                    className={`mb-3 text-sm font-medium ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {kpi.title}
                  </div>
                  <div
                    className={`text-xl font-bold tabular-nums tracking-tight sm:text-2xl lg:text-3xl ${
                      isDark ? 'text-slate-500' : 'text-slate-300'
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
              </div>
              <Link href="/dashboard" className={detailLinkClass}>
                상세보기
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div
              className={`mt-5 flex min-h-[280px] flex-1 items-center justify-center rounded-lg ${
                isDark ? 'bg-slate-900/40' : 'bg-slate-50/80'
              }`}
            >
              <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                표시할 내용이 없습니다.
              </p>
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
                    전체 {topRiskLots.length}건
                  </span>
                </div>
                <p className={`mt-1 text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  위험등급이 심각·주의인 LOT를 우선순위별로 확인합니다.
                </p>
              </div>
              <Link href="/issue" className={detailLinkClass}>
                상세보기
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div className="mt-5 -mx-1 min-h-0 flex-1 overflow-x-auto overflow-y-auto px-1">
              <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                <thead>
                  <tr className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <th className={`border-b pb-2.5 pr-3 ${tableBorderClass}`}>LOT</th>
                    <th className={`border-b pb-2.5 pr-3 ${tableBorderClass}`}>위험 원인</th>
                    <th className={`border-b pb-2.5 pr-3 ${tableBorderClass}`}>위험등급</th>
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
                        className={`max-w-[160px] truncate border-b py-3 pr-3 text-xs ${tableBorderClass} ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                        title={lot.riskReason}
                      >
                        {lot.riskReason}
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
                        colSpan={4}
                        className={`py-10 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                      >
                        심각·주의 등급의 위험 LOT가 없습니다.
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
