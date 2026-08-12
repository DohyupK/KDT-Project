'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { mainApi, RISK_TOP_PAGE_SIZE, type RiskTopLot } from '@/api/mainApi';
import { issueApi } from '@/api/issueApi';
import {
  IssueDetailAnalysis,
  issueDetailToAnalysisModel,
  type IssueDetailAnalysisModel,
} from '@/components/IssueDetailAnalysis';
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

type LotProcessRecord = {
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
};

type RiskLotView = {
  id: string;
  riskScore: number;
  status: RiskGrade;
  riskReason: string;
  record: LotProcessRecord;
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

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function splitRecordedAt(recordedAt: string): { date: string; hour: string } {
  const trimmed = (recordedAt || '').trim();
  if (!trimmed) return { date: '—', hour: '' };
  const [datePart, timePart = ''] = trimmed.split(/\s+/);
  const hour = timePart.slice(0, 5) || timePart;
  return { date: datePart || trimmed, hour };
}

function numOrZero(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? value : 0;
}

function toRiskLotView(lot: RiskTopLot): RiskLotView {
  const { date, hour } = splitRecordedAt(lot.recordedAt);
  return {
    id: lot.lotId,
    riskScore: lot.defectProb ?? 0,
    status: lot.riskLevel,
    riskReason: lot.riskReason?.trim() || '—',
    record: {
      id: lot.lotId,
      date,
      hour,
      sintering_temp: numOrZero(lot.sinteringTemp),
      lithium_input: numOrZero(lot.lithiumInput),
      humidity: numOrZero(lot.humidity),
      metal_impurity: numOrZero(lot.metalImpurity),
      tank_pressure: numOrZero(lot.tankPressure),
      process_time: numOrZero(lot.processTime),
      additive_ratio: numOrZero(lot.additiveRatio),
      quality_defect: lot.qualityDefect ? 1 : 0,
    },
  };
}

function buildPaginationItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 3) return [1, 2, 3, 'ellipsis', total];
  if (current >= total - 2) return [1, 'ellipsis', total - 2, total - 1, total];
  return [1, 'ellipsis', current, 'ellipsis', total];
}

/** 금일 00시 기준 · analysis_lots.probability · 임계 0.8 (기준 시각은 섹션 헤더에 표시) */
const SUMMARY_KPI_META: Omit<SummaryKpi, 'value'>[] = [
  {
    id: 'yield-rate',
    title: '실시간 양품률',
    description: '불량확률 < 0.8',
  },
  {
    id: 'yield-count',
    title: '양품수',
    description: '불량확률 < 0.8',
  },
  {
    id: 'defect-rate',
    title: '불량률',
    description: '불량확률 ≥ 0.8',
  },
  {
    id: 'defect-count',
    title: '불량수',
    description: '불량확률 ≥ 0.8',
  },
];

function formatDailyKpis(kpi: {
  total: number
  goodCount: number
  defectCount: number
  goodRate: number | null
  defectRate: number | null
} | null): SummaryKpi[] {
  const empty = (id: string) => SUMMARY_KPI_META.find((m) => m.id === id)!
  if (!kpi || kpi.total <= 0) {
    return SUMMARY_KPI_META.map((m) => ({ ...m, value: '—' }))
  }
  return [
    { ...empty('yield-rate'), value: `${kpi.goodRate ?? 0}%` },
    { ...empty('yield-count'), value: String(kpi.goodCount) },
    { ...empty('defect-rate'), value: `${kpi.defectRate ?? 0}%` },
    { ...empty('defect-count'), value: String(kpi.defectCount) },
  ]
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

/* -------------------------------------------------------------------------- */
/* Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function MainPage() {
  const { isDark, language } = useUiSettings();
  const { autoRefreshEnabled, refreshInterval } = useRefreshSettings();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [selectedLot, setSelectedLot] = useState<RiskLotView | null>(null);
  const [issueAnalysis, setIssueAnalysis] = useState<IssueDetailAnalysisModel | null>(null);
  const [issueAnalysisLoading, setIssueAnalysisLoading] = useState(false);
  const [issueAnalysisError, setIssueAnalysisError] = useState<string | null>(null);
  const issueDetailSeqRef = useRef(0);
  const [topRiskLots, setTopRiskLots] = useState<RiskLotView[]>([]);
  const [riskLotsLoading, setRiskLotsLoading] = useState(true);
  const [riskTopPage, setRiskTopPage] = useState(1);
  const [riskTopTotal, setRiskTopTotal] = useState(0);
  const [riskTopTotalPages, setRiskTopTotalPages] = useState(1);
  const [summaryKpis, setSummaryKpis] = useState<SummaryKpi[]>(() => formatDailyKpis(null));

  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const loadSeqRef = useRef(0);

  const pushToast = useCallback((message: string, variant: ToastItem['variant'] = 'info') => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    const timer = setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
    toastTimersRef.current.push(timer);
  }, []);

  const loadMainData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setRiskLotsLoading(true);
    const [riskSettled, kpiSettled] = await Promise.allSettled([
      mainApi.getRiskTop({
        page: riskTopPage,
        pageSize: RISK_TOP_PAGE_SIZE,
      }),
      mainApi.getDailyKpi(),
    ]);
    if (seq !== loadSeqRef.current) return;

    if (riskSettled.status === 'fulfilled') {
      const data = riskSettled.value.data;
      setTopRiskLots((data.lots ?? []).map(toRiskLotView));
      setRiskTopTotal(data.total ?? 0);
      const pages = Math.max(1, data.totalPages ?? 1);
      setRiskTopTotalPages(pages);
      if (data.page != null && data.page !== riskTopPage) {
        setRiskTopPage(data.page);
      } else if (riskTopPage > pages) {
        setRiskTopPage(pages);
      }
    } else {
      setTopRiskLots([]);
      setRiskTopTotal(0);
      setRiskTopTotalPages(1);
      pushToast(
        getApiErrorMessage(riskSettled.reason, '위험 LOT 목록을 불러오지 못했습니다.'),
        'error',
      );
    }

    if (kpiSettled.status === 'fulfilled') {
      setSummaryKpis(formatDailyKpis(kpiSettled.value.data));
    } else {
      setSummaryKpis(formatDailyKpis(null));
      pushToast(
        getApiErrorMessage(kpiSettled.reason, '당일 KPI를 불러오지 못했습니다.'),
        'error',
      );
    }

    if (seq === loadSeqRef.current) setRiskLotsLoading(false);
  }, [pushToast, riskTopPage]);

  useEffect(() => {
    void loadMainData();
  }, [loadMainData]);

  useShellRefresh(loadMainData);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const timer = window.setInterval(() => {
      void loadMainData();
    }, refreshInterval * 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, refreshInterval, loadMainData]);

  const riskTopPageItems = useMemo(
    () => buildPaginationItems(riskTopPage, riskTopTotalPages),
    [riskTopPage, riskTopTotalPages],
  );

  const handleRiskTopPageChange = (next: number) => {
    const clamped = Math.min(riskTopTotalPages, Math.max(1, next));
    setRiskTopPage(clamped);
  };

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleOpenLotDetail = (lot: RiskLotView) => {
    setSelectedLot(lot);
    setIssueAnalysis(null);
    setIssueAnalysisError(null);
    setIssueAnalysisLoading(true);
    const seq = ++issueDetailSeqRef.current;
    void (async () => {
      try {
        const { data: listData } = await issueApi.list({ lotId: lot.id });
        const first = listData.issues[0];
        if (!first) {
          if (seq !== issueDetailSeqRef.current) return;
          setIssueAnalysis(null);
          setIssueAnalysisError('해당 LOT의 이슈가 없습니다.');
          return;
        }
        const { data: detailData } = await issueApi.getById(first.issueId);
        if (seq !== issueDetailSeqRef.current) return;
        setIssueAnalysis(issueDetailToAnalysisModel(detailData.issue));
        setIssueAnalysisError(null);
      } catch (error) {
        if (seq !== issueDetailSeqRef.current) return;
        setIssueAnalysis(null);
        setIssueAnalysisError(getApiErrorMessage(error, '이슈 상세 분석을 불러오지 못했습니다.'));
      } finally {
        if (seq === issueDetailSeqRef.current) setIssueAnalysisLoading(false);
      }
    })();
  };

  const handleCloseLotDetail = () => {
    issueDetailSeqRef.current += 1;
    setSelectedLot(null);
    setIssueAnalysis(null);
    setIssueAnalysisError(null);
    setIssueAnalysisLoading(false);
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              {language === 'en' ? 'Sintering Process Forecast' : '소성 공정 예측 현황'}
            </h2>
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              금일 00시 기준
            </span>
          </div>
          <div
            className={`mt-4 border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-5">
              {summaryKpis.map((kpi) => (
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
                      kpi.value === '—'
                        ? isDark
                          ? 'text-slate-500'
                          : 'text-slate-300'
                        : isDark
                          ? 'text-slate-100'
                          : 'text-slate-900'
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
                    전체 {riskTopTotal}건
                  </span>
                </div>
                <p className={`mt-1 text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  최근 3일 · 위험등급 심각 LOT를 확인합니다.
                </p>
              </div>
              <Link href="/issue" className={detailLinkClass}>
                상세보기
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div className="mt-5 -mx-1 min-h-0 flex-1 overflow-x-auto overflow-y-auto px-1">
              <table className="w-full min-w-[400px] border-collapse text-left text-sm">
                <thead>
                  <tr className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <th className={`border-b pb-2.5 pr-3 ${tableBorderClass}`}>LOT</th>
                    <th className={`border-b pb-2.5 pr-3 ${tableBorderClass}`}>위험 원인</th>
                    <th className={`border-b pb-2.5 pl-1 text-right ${tableBorderClass}`}>상세보기</th>
                  </tr>
                </thead>
                <tbody>
                  {topRiskLots.map((lot) => (
                    <tr key={lot.id} className={`group transition-colors ${rowHoverClass}`}>
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
                      <td className={`border-b py-3 pl-1 text-right ${tableBorderClass}`}>
                        <button
                          type="button"
                          className={tableDetailBtnClass}
                          aria-label={`${lot.id} 이슈 상세 분석 보기`}
                          onClick={() => handleOpenLotDetail(lot)}
                        >
                          상세보기
                        </button>
                      </td>
                    </tr>
                  ))}
                  {riskLotsLoading && topRiskLots.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className={`py-10 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                      >
                        불러오는 중…
                      </td>
                    </tr>
                  ) : null}
                  {!riskLotsLoading && topRiskLots.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className={`py-10 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                      >
                        표시할 위험 LOT가 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {riskTopTotalPages > 1 ? (
              <div
                className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/70'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  {riskTopTotal === 0
                    ? '0건'
                    : `${(riskTopPage - 1) * RISK_TOP_PAGE_SIZE + 1}–${Math.min(
                        riskTopPage * RISK_TOP_PAGE_SIZE,
                        riskTopTotal,
                      )} / ${riskTopTotal}건`}
                </span>
                <nav
                  aria-label="위험 LOT Top 페이지"
                  className="flex flex-wrap items-center justify-end gap-1"
                >
                  <button
                    type="button"
                    onClick={() => handleRiskTopPageChange(riskTopPage - 1)}
                    disabled={riskTopPage <= 1 || riskLotsLoading}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    이전
                  </button>
                  {riskTopPageItems.map((item, index) =>
                    item === 'ellipsis' ? (
                      <span
                        key={`risk-top-ellipsis-${index}`}
                        className={`inline-flex min-w-6 items-center justify-center px-0.5 text-[11px] ${
                          isDark ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        aria-current={item === riskTopPage ? 'page' : undefined}
                        disabled={riskLotsLoading}
                        onClick={() => handleRiskTopPageChange(item)}
                        className={`min-w-6 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                          item === riskTopPage
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
                    onClick={() => handleRiskTopPageChange(riskTopPage + 1)}
                    disabled={riskTopPage >= riskTopTotalPages || riskLotsLoading}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDark
                        ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    다음
                  </button>
                </nav>
              </div>
            ) : null}
          </section>
        </section>
      </div>

      <ToastStack toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      <Modal open={!!selectedLot} title="이슈 상세 분석" onClose={handleCloseLotDetail} wide>
        {issueAnalysisLoading ? (
          <p className={`py-10 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            불러오는 중…
          </p>
        ) : issueAnalysisError ? (
          <p className={`py-10 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {issueAnalysisError}
          </p>
        ) : (
          <IssueDetailAnalysis
            issue={issueAnalysis}
            emptyMessage="해당 LOT의 이슈가 없습니다."
          />
        )}
      </Modal>

    </div>
  );
}
