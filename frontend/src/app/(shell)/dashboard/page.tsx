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
import DateInput from '@/components/DateInput'
import { dashboardApi, type DashboardLotRiskItem } from '@/api/dashboardApi'
import { useShellRefresh } from '@/hooks/useShellRefresh'
import { Ruler, UserRound } from 'lucide-react'

/**
 * 하단 Grafana 패널 Embed URL (구 생산 상세 테이블 자리).
 * Share → Embed의 src만 넣으세요.
 */
const GRAFANA_BOTTOM_PANEL_URL = 'http://3.36.100.128:4000/d-solo/adwh4tx/d50?orgId=1&from=1785471624684&to=1786076424684&timezone=browser&refresh=5m&panelId=panel-10'

/**
 * 실시간 생산 게이지 Embed URL.
 * Share → Embed의 src만 넣으세요. theme=light 권장(패널 검정 배경 완화).
 */
const GRAFANA_GAUGE_PANEL_URL =
  'http://3.36.100.128:4000/d-solo/adw5ngg/new-dashboard?orgId=1&from=1786345370672&to=1786431770672&timezone=browser&refresh=5m&theme=light&panelId=panel-1'

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
  goodCount: number;
  defectCount: number;
  defectRate: number | null;
};

type ProductionDailyRow = {
  date: string;
  production: number;
  goodCount: number;
  defectCount: number;
  defectRate: number | null;
  metalImpurity: number | null;
  sinteringTemp: number | null;
  humidity: number | null;
  lithiumInput: number | null;
  additiveRatio: number | null;
  tankPressure: number | null;
  processTime: number | null;
};

type SpcMetric = {
  key: string;
  label: string;
  status: string;
  currentValue: number;
  centerLine: number;
  upperControlLimit: number;
  lowerControlLimit: number;
  violatedRules?: Array<{ rule: number; description: string }>;
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
  riskLevel: '심각' | '주의' | '안정' | null;
  riskReason: string | null;
  actionContent: string | null;
  spc?: { metrics?: SpcMetric[] } | null;
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
  primary?: boolean;
};

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
  sinteringTemp?: number | null;
  humidity?: number | null;
  lithiumInput?: number | null;
  additiveRatio?: number | null;
  tankPressure?: number | null;
  processTime?: number | null;
};

type ProductionDailyFilterState = {
  operatorId: string;
  d50Enabled: boolean;
  d50Min: string;
  d50Max: string;
  d90Enabled: boolean;
  d90Min: string;
  d90Max: string;
};

const EMPTY_PRODUCTION_DAILY_FILTER: ProductionDailyFilterState = {
  operatorId: '',
  d50Enabled: false,
  d50Min: '',
  d50Max: '',
  d90Enabled: false,
  d90Min: '',
  d90Max: '',
};

const PRODUCTION_DAILY_PAGE_SIZE = 7;

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function productionDailyApiFilters(f: ProductionDailyFilterState) {
  return {
    ...(f.operatorId.trim() ? { operatorId: f.operatorId.trim() } : {}),
    ...(f.d50Enabled
      ? {
          ...(parseOptionalNumber(f.d50Min) != null
            ? { d50Min: parseOptionalNumber(f.d50Min) }
            : {}),
          ...(parseOptionalNumber(f.d50Max) != null
            ? { d50Max: parseOptionalNumber(f.d50Max) }
            : {}),
        }
      : {}),
    ...(f.d90Enabled
      ? {
          ...(parseOptionalNumber(f.d90Min) != null
            ? { d90Min: parseOptionalNumber(f.d90Min) }
            : {}),
          ...(parseOptionalNumber(f.d90Max) != null
            ? { d90Max: parseOptionalNumber(f.d90Max) }
            : {}),
        }
      : {}),
  };
}

type LiveConnectionStatus = 'connected' | 'updating' | 'error';

const LIVE_POLL_INTERVAL_MS = 30_000;


/* -------------------------------------------------------------------------- */
/* LOT 위험등급 — judgment_lots (LOT·잔류·규격대비·probability); SPC/위험 후속 */
/* -------------------------------------------------------------------------- */

type LotRiskRow = {
  lot: string;
  /** Deferred (SPC/risk) — null until wired; probability from judgment_lots */
  prob: number | null;
  predLi: number | string | null;
  margin: number | null;
  spc: string | null;
  grade: string | null;
  action: string;
  reason?: string | null;
  isCritical: boolean;
};


type LotRiskFilterState = {
  lotQuery: string;
  grade: 'all' | '심각' | '주의' | '안정';
  spc: 'all' | '안정' | '주의' | '이탈';
  probLevel: 'all' | 'high' | 'mid' | 'low';
  residualLevel: 'all' | 'low' | 'mid' | 'high';
  marginLevel: 'all' | 'low' | 'caution' | 'sufficient';
};

const EMPTY_LOT_RISK_FILTER: LotRiskFilterState = {
  lotQuery: '',
  grade: 'all',
  spc: 'all',
  probLevel: 'all',
  residualLevel: 'all',
  marginLevel: 'all',
};

/** LOT 위험등급 목록 페이지당 행 수 */
const LOT_RISK_PAGE_SIZE = 8;
/** 헤더 44 + 행 52×8 + 푸터 ~52 */
const LOT_RISK_TABLE_HEIGHT_CLASS = 'h-[512px]';

type DataPanelTab = 'lot-risk' | 'production-daily';

function isLotRiskFilterActive(filter: LotRiskFilterState): boolean {
  return (
    filter.lotQuery.trim() !== '' ||
    filter.marginLevel !== 'all' ||
    filter.residualLevel !== 'all' ||
    filter.probLevel !== 'all' ||
    filter.grade !== 'all' ||
    filter.spc !== 'all'
  );
}

const LOT_RISK_ACTION_KEYWORDS = ['전수검사', '소성로 점검', '샘플링 2배 강화', '2배 강화', '합격인데 위험', '표준 샘플링'] as const;
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
  if (margin < 0) return `${amount}${unit} 초과`;
  return `${amount}${unit}`;
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

function mapDashboardLotRiskItem(row: DashboardLotRiskItem): LotRiskRow {
  return {
    lot: row.lotId,
    prob: row.defectProb,
    predLi: row.residualLithium,
    margin: row.residualMargin,
    spc: row.spcStatus,
    grade: row.riskLevel,
    action: '',
    reason: row.riskReason,
    isCritical: false,
  };
}

function lotRiskListParams(filter: LotRiskFilterState, page: number, pageSize: number) {
  const probParams =
    filter.probLevel === 'high'
      ? { minProb: 0.4 }
      : filter.probLevel === 'mid'
        ? { minProb: 0.2, maxProb: 0.4 }
        : filter.probLevel === 'low'
          ? { maxProb: 0.2 }
          : {};
  return {
    page,
    pageSize,
    search: filter.lotQuery || undefined,
    marginLevel: filter.marginLevel === 'all' ? undefined : filter.marginLevel,
    residualLevel: filter.residualLevel === 'all' ? undefined : filter.residualLevel,
    riskLevel: filter.grade === 'all' ? undefined : filter.grade,
    spc: filter.spc === 'all' ? undefined : filter.spc,
    ...probParams,
  };
}

async function fetchAllLotRiskRows(filter: LotRiskFilterState): Promise<LotRiskRow[]> {
  const pageSize = 50;
  const first = await dashboardApi.listLotRisks(lotRiskListParams(filter, 1, pageSize));
  const totalPages = Math.max(1, first.data.totalPages || 1);
  const rows = first.data.items.map(mapDashboardLotRiskItem);
  for (let page = 2; page <= totalPages; page++) {
    const res = await dashboardApi.listLotRisks(lotRiskListParams(filter, page, pageSize));
    rows.push(...res.data.items.map(mapDashboardLotRiskItem));
  }
  return rows;
}

function escapeCsvCell(value: string | number): string {
  const text = String(value).replace(/"/g, '""').replace(/\r?\n/g, ' ');
  return `"${text}"`;
}

function downloadLotRiskCsv(rows: LotRiskRow[]) {
  const header = ['LOT ID', '불량확률(%)', '잔류리튬', '여유량', 'SPC', '위험등급', '위험 원인'];
  const lines = [
    header.map(escapeCsvCell).join(','),
    ...rows.map((r) =>
      [
        r.lot,
        r.prob != null && Number.isFinite(r.prob) ? Math.round(lotRiskProbPercent(r.prob)) : '',
        typeof r.predLi === 'number' ? Math.round(r.predLi) : r.predLi || '',
        formatSpecDistance(r.margin),
        r.spc || '',
        r.grade || '',
        r.reason || '',
      ]
        .map(escapeCsvCell)
        .join(','),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `lot_risk_${formatDate(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadLotRiskPdf(rows: LotRiskRow[]) {
  const tableRows =
    rows.length === 0
      ? '<tr><td colspan="7" style="text-align:center;">데이터가 없습니다.</td></tr>'
      : rows
          .map((r) => {
            const prob =
              r.prob != null && Number.isFinite(r.prob)
                ? `${Math.round(lotRiskProbPercent(r.prob))}%`
                : '—';
            const residual =
              typeof r.predLi === 'number' ? String(Math.round(r.predLi)) : r.predLi || '—';
            return `<tr>
              <td>${r.lot}</td>
              <td>${prob}</td>
              <td>${residual}</td>
              <td>${formatSpecDistance(r.margin)}</td>
              <td>${r.spc || '—'}</td>
              <td>${r.grade || '—'}</td>
              <td>${(r.reason || '—').replace(/</g, '&lt;')}</td>
            </tr>`;
          })
          .join('');
  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8" />
<title>LOT 위험등급</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif; color: #0f172a; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 12px; text-align: left; }
  th { background: #f8fafc; color: #475569; white-space: nowrap; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>LOT 위험등급</h1>
<div class="meta">내보내기 시각: ${formatDate(new Date())} · ${rows.length}건</div>
<table>
<tr><th>LOT ID</th><th>불량확률</th><th>잔류리튬</th><th>여유량</th><th>SPC</th><th>위험등급</th><th>위험 원인</th></tr>
${tableRows}
</table>
<script>window.onload = function () { window.print(); };</script>
</body></html>`;
  const printWindow = window.open('', '_blank', 'width=960,height=720');
  if (!printWindow) {
    throw new Error('팝업이 차단되어 PDF 창을 열 수 없습니다.');
  }
  printWindow.document.write(html);
  printWindow.document.close();
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

/* -------------------------------------------------------------------------- */
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

function addCalendarDaysIso(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTrendXLabel(date: string, grain: 'day' | 'week' | 'month'): string {
  if (grain === 'week') {
    const start = date.length >= 10 ? date.slice(5) : date;
    const end = addCalendarDaysIso(date, 6).slice(5);
    return `${start}~${end}`;
  }
  if (grain === 'month') return date;
  return date.length >= 10 ? date.slice(5) : date;
}

function formatTrendTooltipTitle(date: string, grain: 'day' | 'week' | 'month'): string {
  if (grain === 'week') return `${date} ~ ${addCalendarDaysIso(date, 6)}`;
  return date;
}

function productionVolumeLabel(grain: 'day' | 'week' | 'month'): string {
  return grain === 'day' ? '생산량' : '누적 생산량';
}

function emptyDefectBreakdown(): DefectBreakdown {
  return {
    '기계 결함': 0,
    '원자재 불량': 0,
    '작업자 실수': 0,
    '온도 이상': 0,
  };
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

function EmptyState({
  message,
  plain = false,
}: {
  message: string;
  /** No dashed border / fill — use inside flat white cards. */
  plain?: boolean;
}) {
  const { isDark } = useUiSettings();
  if (plain) {
    return (
      <div
        className={`flex h-full min-h-[160px] flex-1 items-center justify-center px-2 text-sm ${
          isDark ? 'text-slate-400' : 'text-slate-500'
        }`}
      >
        {message}
      </div>
    );
  }
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
  points,
  isDark = false,
  trendGrain = 'day',
  onBarClick,
}: {
  points: DailyAggregate[];
  isDark?: boolean;
  trendGrain?: 'day' | 'week' | 'month';
  /** Reserved for Feature Importance linkage (green panel) — unused for now. */
  onBarClick?: (bucket: DailyAggregate) => void;
}) {
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    point: DailyAggregate;
  } | null>(null);

  const width = 720;
  const height = 332;
  const pad = { top: 48, right: 58, bottom: 44, left: 58 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  if (points.length === 0) {
    return <EmptyState plain message="표시할 생산 데이터가 없습니다." />;
  }

  const rawMaxY = Math.max(...points.map((d) => d.production), 1);
  const tickCount = 5;
  const maxY = niceChartMax(rawMaxY, tickCount);
  const rawMaxRate = Math.max(
    ...points.map((d) => (d.defectRate != null ? d.defectRate : 0)),
    0,
  );
  const maxRate = niceChartMax(Math.max(rawMaxRate * 2, 0.2), 4);
  const n = points.length;
  const barW = Math.min(34, Math.max(12, (innerW / n) * 0.52));
  const slotX = (i: number) => pad.left + (innerW / n) * i + (innerW / n) / 2;
  const labelStep = n <= 6 ? 1 : n <= 12 ? 2 : Math.ceil(n / 6);

  const plotted = points.map((d, i) => {
    const x = slotX(i);
    const y = pad.top + innerH - (d.production / maxY) * innerH;
    const rate = d.defectRate;
    const rateY =
      rate == null ? null : pad.top + innerH - (rate / maxRate) * innerH;
    return { ...d, x, y, rate, rateY };
  });

  const peakProduction = Math.max(...plotted.map((p) => p.production));
  const ratedPoints = plotted.filter((p) => p.rate != null);
  const maxRateValue =
    ratedPoints.length > 0
      ? Math.max(...ratedPoints.map((p) => p.rate as number))
      : null;
  const minRateValue =
    ratedPoints.length > 0
      ? Math.min(...ratedPoints.map((p) => p.rate as number))
      : null;

  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const v = (maxY / tickCount) * i;
    const y = pad.top + innerH - (v / maxY) * innerH;
    return { v, y };
  });

  const rateTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    v: maxRate * r,
    y: pad.top + innerH - r * innerH,
  }));

  const defectPoints = plotted.filter((p) => p.rateY !== null);
  const gridStroke = isDark ? '#475569' : '#e2e8f0';
  const tickFillLeft = isDark ? '#94a3b8' : '#64748b';
  const tickFillRight = isDark ? '#f87171' : '#dc2626';
  const axisTitleLeft = isDark ? '#94a3b8' : '#64748b';
  const axisTitleRight = isDark ? '#f87171' : '#dc2626';
  const pointStroke = isDark ? '#1e293b' : '#ffffff';
  const legendText = isDark ? 'text-slate-300' : 'text-slate-600';

  const showTooltip = (
    e: React.MouseEvent<SVGElement, MouseEvent>,
    point: DailyAggregate,
  ) => {
    const parent = (e.currentTarget.ownerSVGElement as SVGElement).parentElement as HTMLElement;
    const prect = parent.getBoundingClientRect();
    setHover({
      x: e.clientX - prect.left,
      y: e.clientY - prect.top,
      point,
    });
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-x-auto pb-1">
      <div
        className={`mb-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 px-0.5 sm:px-1 ${legendText}`}
        aria-hidden
      >
        <div className="inline-flex items-center gap-2 text-sm font-medium">
          <span className="inline-block h-3 w-3 rounded-sm bg-blue-600" />
          생산량
        </div>
        <div className="inline-flex items-center gap-2 text-sm font-medium">
          <span className="relative inline-flex h-3 w-5 items-center" aria-hidden>
            <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-red-600" />
            <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600 ring-2 ring-white dark:ring-slate-900" />
          </span>
          불량률
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[300px] w-full lg:h-[320px]"
        style={{ minWidth: `${Math.min(width, 360 + n * 48)}px` }}
        role="img"
        aria-label="생산량 막대와 불량률 선 차트"
      >
        <text
          x={pad.left}
          y={20}
          className="text-xs font-semibold"
          fill={axisTitleLeft}
        >
          생산량
        </text>
        <text
          x={width - pad.right}
          y={20}
          textAnchor="end"
          className="text-xs font-semibold"
          fill={axisTitleRight}
        >
          불량률 (%)
        </text>
        {yTicks.map((t) => (
          <g key={`prod-${t.v}`}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={t.y}
              y2={t.y}
              stroke={gridStroke}
              strokeWidth={1}
              strokeDasharray={t.v === 0 ? undefined : '4 4'}
              opacity={t.v === 0 ? 1 : 0.85}
            />
            <text
              x={pad.left - 10}
              y={t.y + 4}
              textAnchor="end"
              className="text-[11px]"
              fill={tickFillLeft}
            >
              {formatNumber(Math.round(t.v))}
            </text>
          </g>
        ))}
        {rateTicks.map((t) => (
          <text
            key={`rate-${t.v}`}
            x={width - pad.right + 10}
            y={t.y + 4}
            textAnchor="start"
            className="text-[11px] font-medium"
            fill={tickFillRight}
          >
            {formatPercent(t.v)}
          </text>
        ))}
        {plotted.map((p) => {
          const isPeak = p.production === peakProduction && peakProduction > 0;
          const barHeight = Math.max(0, pad.top + innerH - p.y);
          return (
            <g key={p.date}>
              <rect
                x={p.x - barW / 2}
                y={p.y}
                width={barW}
                height={barHeight}
                fill={isPeak ? '#1d4ed8' : '#2563eb'}
                rx={3}
                ry={3}
                className="cursor-pointer transition-opacity hover:opacity-90"
                onMouseEnter={(e) => showTooltip(e, p)}
                onMouseMove={(e) => showTooltip(e, p)}
                onMouseLeave={() => setHover(null)}
                onClick={() =>
                  onBarClick?.({
                    date: p.date,
                    production: p.production,
                    goodCount: p.goodCount,
                    defectCount: p.defectCount,
                    defectRate: p.defectRate,
                  })
                }
              />
              {isPeak ? (
                <text
                  x={p.x}
                  y={Math.max(pad.top + 12, p.y - 8)}
                  textAnchor="middle"
                  className="text-[10px] font-semibold"
                  fill={isDark ? '#93c5fd' : '#1d4ed8'}
                  pointerEvents="none"
                >
                  {formatNumber(p.production)}
                </text>
              ) : null}
            </g>
          );
        })}
        {defectPoints.length > 0 ? (
          <>
            <polyline
              fill="none"
              stroke="#dc2626"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={defectPoints.map((p) => `${p.x},${p.rateY}`).join(' ')}
              pointerEvents="none"
            />
            {defectPoints.map((p) => {
              const rate = p.rate as number;
              const isMaxRate = maxRateValue != null && rate === maxRateValue;
              const isMinRate =
                minRateValue != null &&
                rate === minRateValue &&
                minRateValue !== maxRateValue;
              const isZero = rate === 0;
              const r = isMaxRate || isMinRate ? 4.5 : isZero ? 3.5 : 3;
              return (
                <g key={`rate-${p.date}`}>
                  <circle
                    cx={p.x}
                    cy={p.rateY as number}
                    r={12}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={(e) => showTooltip(e, p)}
                    onMouseMove={(e) => showTooltip(e, p)}
                    onMouseLeave={() => setHover(null)}
                  />
                  <circle
                    cx={p.x}
                    cy={p.rateY as number}
                    r={r}
                    fill="#dc2626"
                    stroke={pointStroke}
                    strokeWidth={isMaxRate || isMinRate ? 2.5 : 2}
                    pointerEvents="none"
                  />
                  {isMaxRate || isMinRate ? (
                    <text
                      x={p.x}
                      y={(p.rateY as number) - 10}
                      textAnchor="middle"
                      className="text-[9px] font-semibold"
                      fill={tickFillRight}
                      pointerEvents="none"
                    >
                      {formatPercent(rate)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </>
        ) : null}
        {plotted.map((p, i) =>
          i % labelStep === 0 || i === n - 1 ? (
            <text
              key={`label-${p.date}`}
              x={p.x}
              y={height - 14}
              textAnchor="middle"
              className="text-[11px]"
              fill={isDark ? '#94a3b8' : '#64748b'}
            >
              {formatTrendXLabel(p.date, trendGrain)}
            </text>
          ) : null,
        )}
      </svg>
      {hover ? (
        <div
          className={`pointer-events-none absolute z-10 min-w-[148px] rounded-lg border px-3 py-2.5 text-xs shadow-md ${
            isDark
              ? 'border-slate-600 bg-slate-800 text-slate-100'
              : 'border-slate-200 bg-white text-slate-700'
          }`}
          style={{
            left: Math.min(hover.x + 12, 240),
            top: Math.max(8, hover.y - 88),
          }}
        >
          <div
            className={`mb-1.5 border-b pb-1.5 text-sm font-semibold ${
              isDark ? 'border-slate-600 text-slate-100' : 'border-slate-100 text-slate-900'
            }`}
          >
            {formatTrendTooltipTitle(hover.point.date, trendGrain)}
          </div>
          <div className={`font-medium ${isDark ? 'text-sky-300' : 'text-blue-700'}`}>
            생산량: {formatNumber(hover.point.production)}
          </div>
          <div className={`mt-1 font-medium ${isDark ? 'text-red-400' : 'text-red-600'}`}>
            불량률:{' '}
            {hover.point.defectRate != null
              ? formatPercent(hover.point.defectRate)
              : '0.0%'}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeatureImportancePanel({
  items,
  isDark,
  periodLabel,
  selected,
  onClearSelection,
}: {
  items: FeatureImportanceItem[];
  isDark: boolean;
  periodLabel: string;
  selected: boolean;
  onClearSelection: () => void;
}) {
  const mainItems = items.some((i) => i.primary === true)
    ? items.filter((i) => i.primary)
    : items.slice(0, 4);
  const subItems = items.some((i) => i.primary === true)
    ? items.filter((i) => !i.primary)
    : items.slice(4);

  const renderItem = (item: FeatureImportanceItem, i: number, large: boolean) => {
    const pct = Math.round(Math.min(1, Math.max(0, item.importance)) * 100);
    return (
      <li key={item.label}>
        <div
          className={`mb-1 flex items-center justify-between gap-2 ${
            large ? 'text-sm' : 'text-xs'
          }`}
        >
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
              large
                ? isDark
                  ? 'text-slate-300'
                  : 'text-slate-600'
                : isDark
                  ? 'text-slate-400'
                  : 'text-slate-500'
            }`}
          >
            {pct}%
          </span>
        </div>
        <div
          className={`overflow-hidden rounded-full ${
            large ? 'h-2.5' : 'h-1.5'
          } ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}
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
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2
          className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
        >
          불량 유발 변수
        </h2>
        <span className="text-sm font-normal text-gray-400">Feature Importance</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {periodLabel || '기간 선택'}
        </p>
        {selected ? (
          <button
            type="button"
            aria-label="기간 선택 해제"
            onClick={onClearSelection}
            className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${
              isDark
                ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            ×
          </button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          해당 기간 불량 LOT 데이터가 없습니다.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <ul className="space-y-4">
            {mainItems.map((item, i) => renderItem(item, i, true))}
          </ul>
          {subItems.length > 0 ? (
            <ul className="space-y-2 border-t border-dashed pt-3 opacity-90 dark:border-slate-700">
              {subItems.map((item, i) => renderItem(item, i + 4, false))}
            </ul>
          ) : null}
        </div>
      )}
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
  const [trendPoints, setTrendPoints] = useState<DailyAggregate[]>([]);
  /** Selected production-trend bar → Feature Importance period. */
  const [selectedTrendBucket, setSelectedTrendBucket] = useState<DailyAggregate | null>(null);
  const [trendGrain, setTrendGrain] = useState<'day' | 'week' | 'month'>('day');
  const [featureImportanceLabel, setFeatureImportanceLabel] = useState('당일');
  const [trendFilterDraft, setTrendFilterDraft] = useState({ startDate: '', endDate: '' });
  const [trendFilterApplied, setTrendFilterApplied] = useState({ startDate: '', endDate: '' });
  const [dailyApiRows, setDailyApiRows] = useState<ProductionDailyRow[]>([]);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [dailyTotalPages, setDailyTotalPages] = useState(1);
  const [dailyOperators, setDailyOperators] = useState<string[]>([]);
  const [productionDailyFilter, setProductionDailyFilter] = useState<ProductionDailyFilterState>(
    EMPTY_PRODUCTION_DAILY_FILTER,
  );
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
  const [dataPanelTab, setDataPanelTab] = useState<DataPanelTab>('lot-risk');
  const [lotRiskFullscreenOpen, setLotRiskFullscreenOpen] = useState(false);
  const [lotRiskFullscreenRows, setLotRiskFullscreenRows] = useState<LotRiskRow[]>([]);
  const [lotRiskFullscreenLoading, setLotRiskFullscreenLoading] = useState(false);

  const filteredLotRiskRows = lotRiskRows;
  const lotRiskFilterActive = isLotRiskFilterActive(lotRiskFilterApplied);
  const lotRiskSafePage = Math.min(lotRiskPage, lotRiskTotalPages);
  const pagedLotRiskRows = filteredLotRiskRows;
  /** 페이지당 8행 고정 슬롯 (부족분은 null placeholder) */
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
    setSelectedLotRiskDetail(null);
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

  const selectedRiskSummary = useMemo(() => {
    if (!selectedLotRisk || !selectedLotRiskDetail) return '';
    const margin = selectedLotRiskDetail.residualMargin ?? selectedLotRisk.margin;
    const marginText =
      margin == null
        ? '여유량 산출 불가'
        : margin < 0
          ? `USL 대비 ${formatNumber(Math.round(Math.abs(margin)))} ppm 초과`
          : `규격까지 ${formatNumber(Math.round(margin))} ppm`;
    const residual = selectedLotRiskDetail.residualLithium ?? selectedLotRisk.predLi;
    const residualText =
      typeof residual === 'number'
        ? `${formatNumber(Math.round(residual))} ppm`
        : residual || '-';
    const probability = selectedLotRiskDetail.defectProb ?? selectedLotRisk.prob;
    const probPart =
      probability != null && Number.isFinite(probability)
        ? `불량확률 ${(probability * 100).toFixed(1)}%, `
        : '';
    return `${probPart}잔류리튬 ${residualText}, ${marginText}`;
  }, [selectedLotRisk, selectedLotRiskDetail]);

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

  const openLotRiskFullscreen = useCallback(async (filterOverride?: LotRiskFilterState) => {
    const filter = filterOverride ?? lotRiskFilterApplied;
    setLotRiskFullscreenOpen(true);
    setLotRiskFullscreenLoading(true);
    try {
      const rows = await fetchAllLotRiskRows(filter);
      setLotRiskFullscreenRows(rows);
    } catch {
      setLotRiskFullscreenRows([]);
      pushToast('LOT 위험등급 전체 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLotRiskFullscreenLoading(false);
    }
  }, [lotRiskFilterApplied, pushToast]);

  const closeLotRiskFullscreen = useCallback(() => {
    setLotRiskFullscreenOpen(false);
  }, []);

  useEffect(() => {
    if (!lotRiskFullscreenOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLotRiskFullscreen();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lotRiskFullscreenOpen, closeLotRiskFullscreen]);

  const handleLotRiskExportCsv = useCallback(async () => {
    try {
      const rows = lotRiskFullscreenOpen
        ? lotRiskFullscreenRows
        : await fetchAllLotRiskRows(lotRiskFilterApplied);
      if (rows.length === 0) {
        pushToast('내보낼 LOT 위험등급 데이터가 없습니다.', 'info');
        return;
      }
      downloadLotRiskCsv(rows);
      pushToast(`LOT 위험등급 CSV ${rows.length}건 다운로드를 시작했습니다.`, 'success');
    } catch {
      pushToast('LOT 위험등급 CSV를 만들지 못했습니다.', 'error');
    }
  }, [
    lotRiskFilterApplied,
    lotRiskFullscreenOpen,
    lotRiskFullscreenRows,
    pushToast,
  ]);

  const handleLotRiskExportPdf = useCallback(async () => {
    try {
      const rows = lotRiskFullscreenOpen
        ? lotRiskFullscreenRows
        : await fetchAllLotRiskRows(lotRiskFilterApplied);
      if (rows.length === 0) {
        pushToast('내보낼 LOT 위험등급 데이터가 없습니다.', 'info');
        return;
      }
      downloadLotRiskPdf(rows);
      pushToast('LOT 위험등급 PDF 인쇄 창을 열었습니다.', 'success');
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'PDF 창을 열 수 없습니다.',
        'error',
      );
    }
  }, [
    lotRiskFilterApplied,
    lotRiskFullscreenOpen,
    lotRiskFullscreenRows,
    pushToast,
  ]);

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
      sinteringTemp: row.sinteringTemp,
      humidity: row.humidity,
      lithiumInput: row.lithiumInput,
      additiveRatio: row.additiveRatio,
      tankPressure: row.tankPressure,
      processTime: row.processTime,
    })),
    [dailyApiRows],
  );

  const dailyAggregates: DailyAggregate[] = trendPoints;
  const trendHasData = dailyAggregates.length > 0;

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
    dailyTotal === 0 ? 0 : (tableSafePage - 1) * PRODUCTION_DAILY_PAGE_SIZE + 1;
  const tableRangeEnd = Math.min(tableSafePage * PRODUCTION_DAILY_PAGE_SIZE, dailyTotal);
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

  const refreshDashboardData = useCallback(async (options?: { force?: boolean }) => {
    if (fetchingRef.current && !options?.force) return;
    fetchingRef.current = true;
    setLiveStatus('updating');
    try {
      const trendParams =
        trendFilterApplied.startDate && trendFilterApplied.endDate
          ? {
              from: trendFilterApplied.startDate,
              to: trendFilterApplied.endDate,
              grain: trendGrain,
            }
          : { grain: trendGrain };
      const fiParams =
        selectedTrendBucket != null
          ? {
              grain: trendGrain,
              bucket: selectedTrendBucket.date,
              mode: 'selected' as const,
            }
          : { grain: trendGrain, mode: 'default' as const };
      const [lotResponse, trendResponse, dailyResponse, fiResponse] = await Promise.all([
        dashboardApi.listLotRisks(
          lotRiskListParams(lotRiskFilterApplied, lotRiskPage, LOT_RISK_PAGE_SIZE),
        ),
        dashboardApi.getProductionTrend(trendParams),
        dashboardApi.getProductionDaily(
          tablePage,
          PRODUCTION_DAILY_PAGE_SIZE,
          productionDailyApiFilters(productionDailyFilter),
        ),
        dashboardApi.getFeatureImportance(fiParams),
      ]);
      const mappedLots = lotResponse.data.items.map(mapDashboardLotRiskItem);
      setLotRiskRows(mappedLots);
      setLotRiskTotal(lotResponse.data.total);
      setLotRiskTotalPages(lotResponse.data.totalPages);
      setTrendPoints(
        (trendResponse.data.points || []).map((row) => ({
          date: row.date,
          production: row.production,
          goodCount: row.goodCount,
          defectCount: row.defectCount,
          defectRate: row.defectRate,
        })),
      );
      if (!trendFilterApplied.startDate || !trendFilterApplied.endDate) {
        setTrendFilterDraft({
          startDate: trendResponse.data.from,
          endDate: trendResponse.data.to,
        });
        setTrendFilterApplied({
          startDate: trendResponse.data.from,
          endDate: trendResponse.data.to,
        });
      }
      setDailyApiRows(dailyResponse.data.items as unknown as ProductionDailyRow[]);
      setDailyTotal(dailyResponse.data.total);
      setDailyTotalPages(dailyResponse.data.totalPages);
      setDailyOperators(dailyResponse.data.operators ?? []);
      const importanceTotal = fiResponse.data.items.reduce(
        (sum, item) => sum + Math.max(0, Number(item.importance) || 0),
        0,
      );
      setFeatureImportanceItems(
        fiResponse.data.items.map((item, idx) => ({
          label: item.label,
          importance:
            importanceTotal > 0 ? Math.max(0, Number(item.importance) || 0) / importanceTotal : 0,
          primary: item.primary ?? idx < 4,
        })),
      );
      setFeatureImportanceLabel(fiResponse.data.label || '당일');
      setLastUpdatedAt(new Date());
      setLiveStatus('connected');
    } catch {
      setLiveStatus('error');
    } finally {
      fetchingRef.current = false;
      setInitialLoading(false);
    }
  }, [
    lotRiskFilterApplied,
    lotRiskPage,
    tablePage,
    productionDailyFilter,
    trendFilterApplied,
    trendGrain,
    selectedTrendBucket,
  ]);

  useEffect(() => {
    void refreshDashboardData();
  }, [refreshDashboardData]);

  useShellRefresh(() => {
    void refreshDashboardData({ force: true });
  });

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

        {/* LOT 위험등급 / 생산 상세 — 탭 스위치 */}
        <section className={`col-span-full mb-6 w-full p-5 ${cardClass}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div
                className={`inline-flex rounded-lg border p-0.5 ${
                  isDark ? 'border-slate-600' : 'border-slate-200'
                }`}
                role="tablist"
                aria-label="데이터 패널 전환"
              >
                {(
                  [
                    { id: 'lot-risk' as const, label: 'LOT 위험등급' },
                    { id: 'production-daily' as const, label: '생산 상세' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={dataPanelTab === tab.id}
                    onClick={() => setDataPanelTab(tab.id)}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                      dataPanelTab === tab.id
                        ? 'bg-blue-600 text-white'
                        : isDark
                          ? 'text-slate-300 hover:bg-slate-800'
                          : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {dataPanelTab === 'lot-risk' ? (
                <span className="text-sm font-normal text-gray-400">
                  분류확률 + 잔류Li 여유 + SPC 결합
                </span>
              ) : (
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  analysis_lots · lots 기반 최근 7일 일별 집계 (불량 판정 확률 ≥ 0.8)
                </span>
              )}
            </div>
            {dataPanelTab === 'lot-risk' ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openLotRiskFullscreen()}
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium ${
                    isDark
                      ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  전체보기
                </button>
                <button
                  type="button"
                  onClick={() => void handleLotRiskExportCsv()}
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium ${
                    isDark
                      ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => void handleLotRiskExportPdf()}
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium ${
                    isDark
                      ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  PDF
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2 text-xs ${
                    isDark ? 'border-slate-600 bg-slate-800' : 'border-slate-200 bg-white'
                  }`}
                  title="작업자 필터"
                >
                  <UserRound
                    className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                    aria-hidden
                  />
                  <select
                    aria-label="작업자 필터"
                    value={productionDailyFilter.operatorId}
                    onChange={(e) => {
                      setTablePage(1);
                      setProductionDailyFilter((prev) => ({
                        ...prev,
                        operatorId: e.target.value,
                      }));
                    }}
                    className={`max-w-[140px] bg-transparent text-xs font-medium outline-none ${
                      isDark ? 'text-slate-200' : 'text-slate-700'
                    }`}
                  >
                    <option value="">전체 작업자</option>
                    {dailyOperators.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                </label>

                <div
                  className={`inline-flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1 ${
                    isDark ? 'border-slate-600 bg-slate-800' : 'border-slate-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={productionDailyFilter.d50Enabled}
                    title="d50 필터"
                    onClick={() => {
                      setTablePage(1);
                      setProductionDailyFilter((prev) => ({
                        ...prev,
                        d50Enabled: !prev.d50Enabled,
                      }));
                    }}
                    className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold ${
                      productionDailyFilter.d50Enabled
                        ? 'bg-blue-600 text-white'
                        : isDark
                          ? 'text-slate-300 hover:bg-slate-700'
                          : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Ruler className="h-3.5 w-3.5" aria-hidden />
                    d50
                  </button>
                  {productionDailyFilter.d50Enabled ? (
                    <>
                      <input
                        type="number"
                        step="any"
                        aria-label="d50 최소"
                        placeholder="min"
                        value={productionDailyFilter.d50Min}
                        onChange={(e) => {
                          setTablePage(1);
                          setProductionDailyFilter((prev) => ({
                            ...prev,
                            d50Min: e.target.value,
                          }));
                        }}
                        className={`h-7 w-16 rounded border px-1.5 text-[11px] tabular-nums ${
                          isDark
                            ? 'border-slate-600 bg-slate-900 text-slate-200'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      />
                      <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        ~
                      </span>
                      <input
                        type="number"
                        step="any"
                        aria-label="d50 최대"
                        placeholder="max"
                        value={productionDailyFilter.d50Max}
                        onChange={(e) => {
                          setTablePage(1);
                          setProductionDailyFilter((prev) => ({
                            ...prev,
                            d50Max: e.target.value,
                          }));
                        }}
                        className={`h-7 w-16 rounded border px-1.5 text-[11px] tabular-nums ${
                          isDark
                            ? 'border-slate-600 bg-slate-900 text-slate-200'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      />
                    </>
                  ) : null}
                </div>

                <div
                  className={`inline-flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1 ${
                    isDark ? 'border-slate-600 bg-slate-800' : 'border-slate-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={productionDailyFilter.d90Enabled}
                    title="d90 필터"
                    onClick={() => {
                      setTablePage(1);
                      setProductionDailyFilter((prev) => ({
                        ...prev,
                        d90Enabled: !prev.d90Enabled,
                      }));
                    }}
                    className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold ${
                      productionDailyFilter.d90Enabled
                        ? 'bg-blue-600 text-white'
                        : isDark
                          ? 'text-slate-300 hover:bg-slate-700'
                          : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Ruler className="h-3.5 w-3.5" aria-hidden />
                    d90
                  </button>
                  {productionDailyFilter.d90Enabled ? (
                    <>
                      <input
                        type="number"
                        step="any"
                        aria-label="d90 최소"
                        placeholder="min"
                        value={productionDailyFilter.d90Min}
                        onChange={(e) => {
                          setTablePage(1);
                          setProductionDailyFilter((prev) => ({
                            ...prev,
                            d90Min: e.target.value,
                          }));
                        }}
                        className={`h-7 w-16 rounded border px-1.5 text-[11px] tabular-nums ${
                          isDark
                            ? 'border-slate-600 bg-slate-900 text-slate-200'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      />
                      <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        ~
                      </span>
                      <input
                        type="number"
                        step="any"
                        aria-label="d90 최대"
                        placeholder="max"
                        value={productionDailyFilter.d90Max}
                        onChange={(e) => {
                          setTablePage(1);
                          setProductionDailyFilter((prev) => ({
                            ...prev,
                            d90Max: e.target.value,
                          }));
                        }}
                        className={`h-7 w-16 rounded border px-1.5 text-[11px] tabular-nums ${
                          isDark
                            ? 'border-slate-600 bg-slate-900 text-slate-200'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      />
                    </>
                  ) : null}
                </div>

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
            )}
          </div>

          {dataPanelTab === 'lot-risk' ? (
          <>
          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-2">
            <label className="inline-flex w-[140px] shrink-0 items-center gap-1.5 text-xs">
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
                className={`h-9 w-full min-w-0 rounded-lg border px-1.5 text-xs outline-none ${
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
                className={`h-9 rounded-lg border px-1.5 text-xs ${
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
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>잔류리튬</span>
              <select
                aria-label="잔류리튬 필터"
                value={lotRiskFilterDraft.residualLevel}
                onChange={(e) =>
                  setLotRiskFilterDraft((prev) => ({
                    ...prev,
                    residualLevel: e.target.value as LotRiskFilterState['residualLevel'],
                  }))
                }
                className={`h-9 rounded-lg border px-1.5 text-xs ${
                  isDark
                    ? 'border-slate-700 bg-slate-950/40 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="all">전체</option>
                <option value="low">3,000 미만</option>
                <option value="mid">3,000~3,500</option>
                <option value="high">3,500 이상</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-1.5 text-xs">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>여유량</span>
              <select
                aria-label="여유량 필터"
                value={lotRiskFilterDraft.marginLevel}
                onChange={(e) =>
                  setLotRiskFilterDraft((prev) => ({
                    ...prev,
                    marginLevel: e.target.value as LotRiskFilterState['marginLevel'],
                  }))
                }
                className={`h-9 max-w-[7.5rem] rounded-lg border px-1.5 text-xs ${
                  isDark
                    ? 'border-slate-700 bg-slate-950/40 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="all">전체</option>
                <option value="low">≤500</option>
                <option value="caution">500~1,000</option>
                <option value="sufficient">{`>1,000`}</option>
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
                className={`h-9 rounded-lg border px-1.5 text-xs ${
                  isDark
                    ? 'border-slate-700 bg-slate-950/40 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="all">전체</option>
                <option value="이탈">이탈</option>
                <option value="주의">주의</option>
                <option value="안정">안정</option>
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
                className={`h-9 rounded-lg border px-1.5 text-xs ${
                  isDark
                    ? 'border-slate-700 bg-slate-950/40 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="all">전체</option>
                <option value="심각">심각</option>
                <option value="주의">주의</option>
                <option value="안정">안정</option>
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
                lotRiskFilterDraft.marginLevel === 'all' &&
                lotRiskFilterDraft.residualLevel === 'all' &&
                lotRiskFilterDraft.probLevel === 'all'
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
                className={`flex ${LOT_RISK_TABLE_HEIGHT_CLASS} min-h-0 flex-col overflow-hidden rounded-lg border ${
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
                      여유량
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
                          {row.prob != null && Number.isFinite(row.prob) ? (
                            <div
                              className="flex min-w-0 items-center gap-2"
                              aria-label={`${row.lot} 불량확률 ${Math.round(lotRiskProbPercent(row.prob))}%`}
                            >
                              <div
                                className={`h-2 min-w-0 flex-1 overflow-hidden rounded-full ${
                                  isDark ? 'bg-slate-700' : 'bg-slate-200'
                                }`}
                              >
                                <div
                                  className="h-full rounded-full bg-blue-500"
                                  style={{ width: `${lotRiskProbPercent(row.prob)}%` }}
                                />
                              </div>
                              <span
                                className={`min-w-[2.25rem] shrink-0 tabular-nums ${
                                  isDark ? 'text-slate-200' : 'text-slate-700'
                                }`}
                              >
                                {Math.round(lotRiskProbPercent(row.prob))}%
                              </span>
                            </div>
                          ) : (
                            <span
                              className={`tabular-nums ${
                                isDark ? 'text-slate-500' : 'text-slate-400'
                              }`}
                            >
                              —
                            </span>
                          )}
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
                            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                              row.spc === '이탈'
                                ? 'text-red-600'
                                : row.spc === '주의'
                                  ? 'text-amber-600'
                                  : row.spc === '안정'
                                    ? isDark
                                      ? 'text-slate-300'
                                      : 'text-slate-700'
                                    : isDark
                                      ? 'text-slate-500'
                                      : 'text-slate-400'
                            }`}
                          >
                            {row.spc === '이탈' || row.spc === '주의' || row.spc === '안정' ? (
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  row.spc === '이탈'
                                    ? 'bg-red-500'
                                    : row.spc === '주의'
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                }`}
                              />
                            ) : null}
                            {row.spc || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                              row.grade === '심각'
                                ? 'text-red-600'
                                : row.grade === '주의'
                                  ? 'text-amber-600'
                                  : row.grade === '안정'
                                    ? isDark
                                      ? 'text-slate-300'
                                      : 'text-slate-700'
                                    : isDark
                                      ? 'text-slate-500'
                                      : 'text-slate-400'
                            }`}
                          >
                            {row.grade === '심각' || row.grade === '주의' || row.grade === '안정' ? (
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  row.grade === '심각'
                                    ? 'bg-red-500'
                                    : row.grade === '주의'
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                }`}
                              />
                            ) : null}
                            {row.grade || '—'}
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
                    className={`h-8 w-16 rounded-lg border px-2 text-center text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
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
              className={`flex ${LOT_RISK_TABLE_HEIGHT_CLASS} min-h-0 flex-col overflow-hidden rounded-lg border p-4 xl:col-span-4 ${
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
                          ? isDark
                            ? 'bg-red-950/50 text-red-400'
                            : 'bg-red-50 text-red-700'
                          : selectedLotRisk.grade === '주의'
                            ? isDark
                              ? 'bg-amber-950/40 text-amber-400'
                              : 'bg-amber-50 text-amber-700'
                            : selectedLotRisk.grade === '안정'
                              ? isDark
                                ? 'bg-emerald-950/40 text-emerald-400'
                                : 'bg-emerald-50 text-emerald-700'
                              : isDark
                                ? 'bg-slate-800 text-slate-500'
                                : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {selectedLotRisk.grade || '—'}
                    </span>
                  </div>

                  <p
                    className={`mb-3 rounded-lg border-l-4 px-3 py-2 text-sm leading-snug ${
                      isDark
                        ? 'border-slate-600 bg-slate-800/60 text-slate-200'
                        : 'border-slate-300 bg-white text-slate-800'
                    }`}
                  >
                    {selectedRiskSummary}
                  </p>

                  <div className="mb-3 grid grid-cols-2 gap-2">
                    {[
                      {
                        label: '불량확률',
                        value:
                          selectedLotRisk.prob != null && Number.isFinite(selectedLotRisk.prob)
                            ? `${Math.round(lotRiskProbPercent(selectedLotRisk.prob))}%`
                            : '—',
                      },
                      {
                        label: '예측 잔류리튬',
                        value: typeof selectedLotRisk.predLi === 'number'
                          ? `${formatNumber(Math.round(selectedLotRisk.predLi))} ppm`
                          : selectedLotRisk.predLi || '-',
                      },
                      {
                        label: '여유량',
                        value: formatSpecDistance(selectedLotRisk.margin, true),
                        valueClass: lotRiskMarginClass(selectedLotRisk.margin, isDark),
                      },
                      {
                        label: 'SPC',
                        value:
                          selectedLotRiskDetail?.spcStatus ??
                          selectedLotRisk.spc ??
                          '—',
                      },
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

                  {(selectedLotRiskDetail?.spcStatus ?? selectedLotRisk.spc) !== '-' ? (
                  <div className="mb-3 space-y-2">
                    <p
                      className={`mb-1.5 text-xs font-semibold ${
                        isDark ? 'text-slate-300' : 'text-slate-700'
                      }`}
                    >
                      SPC 관리도
                    </p>
                    {selectedLotRiskDetail?.spc?.metrics &&
                    selectedLotRiskDetail.spc.metrics.length > 0 ? (
                      <div className="space-y-3">
                        {selectedLotRiskDetail.spc.metrics.map((metric) => (
                          <div key={metric.key}>
                            <SpcChartCard metric={metric} isDark={isDark} />
                            {metric.violatedRules && metric.violatedRules.length > 0 ? (
                              <ul
                                className={`mt-2 space-y-1.5 rounded-md px-2 py-1.5 text-sm leading-relaxed ${
                                  isDark
                                    ? 'bg-amber-950/40 text-amber-100'
                                    : 'bg-amber-50 text-amber-950'
                                }`}
                              >
                                {metric.violatedRules.map((rule) => (
                                  <li
                                    key={`${metric.key}-${rule.rule}`}
                                    className={`font-medium ${
                                      isDark ? 'text-amber-50' : 'text-amber-900'
                                    }`}
                                  >
                                    RULE {rule.rule} : {rule.description}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p
                        className={`rounded-md px-2.5 py-2 text-xs ${
                          isDark ? 'bg-slate-800/70 text-slate-400' : 'bg-white text-slate-500'
                        }`}
                      >
                        표시할 SPC 관리도 데이터가 없습니다.
                      </p>
                    )}
                  </div>
                  ) : null}

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
                      {selectedLotRiskDetail.actionContent?.trim() || '\u00A0'}
                    </p>
                  </div>
                </div>
              )}
            </aside>
          </div>
          </>
          ) : (
            <>
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
                <table className="w-full min-w-[1400px] border-collapse text-sm">
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
                      <th className="px-3 py-3 text-right">소성 온도</th>
                      <th className="px-3 py-3 text-right">습도</th>
                      <th className="px-3 py-3 text-right">리튬 투입량</th>
                      <th className="px-3 py-3 text-right">첨가제 비율</th>
                      <th className="px-3 py-3 text-right">압력</th>
                      <th className="px-3 py-3 text-right">공정시간</th>
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
                            {r.sinteringTemp == null ? '-' : r.sinteringTemp.toFixed(2)}
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
                            {r.lithiumInput == null ? '-' : r.lithiumInput.toFixed(2)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right tabular-nums ${
                              isDark ? 'text-slate-200' : 'text-slate-700'
                            }`}
                          >
                            {r.additiveRatio == null ? '-' : r.additiveRatio.toFixed(3)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right tabular-nums ${
                              isDark ? 'text-slate-200' : 'text-slate-700'
                            }`}
                          >
                            {r.tankPressure == null ? '-' : r.tankPressure.toFixed(2)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right tabular-nums ${
                              isDark ? 'text-slate-200' : 'text-slate-700'
                            }`}
                          >
                            {r.processTime == null ? '-' : r.processTime.toFixed(2)}
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
            </>
          )}
        </section>

        {/* Charts: 게이지 | 생산 추이 | Feature Importance */}
        <section className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div
            className={`flex min-h-[360px] min-w-0 flex-col p-5 xl:col-span-3 ${cardClass}`}
          >
            <h2
              className={`mb-3 text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
            >
              실시간 생산 게이지
            </h2>
            <div className="flex min-h-[280px] w-full flex-1 items-center justify-center">
              {GRAFANA_GAUGE_PANEL_URL.trim() ? (
                <div className="relative aspect-square w-full max-w-[300px] overflow-hidden rounded-full bg-transparent shadow-none ring-0">
                  <iframe
                    src={GRAFANA_GAUGE_PANEL_URL}
                    title="실시간 생산 게이지"
                    scrolling="no"
                    className="pointer-events-auto absolute left-1/2 top-1/2 h-[118%] w-[118%] max-w-none -translate-x-1/2 -translate-y-1/2 border-0 bg-transparent"
                  />
                </div>
              ) : (
                <div className="flex h-full min-h-[280px] w-full items-center justify-center px-3">
                  <p
                    className={`m-0 text-center text-xs leading-relaxed ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    GRAFANA_GAUGE_PANEL_URL에 Embed URL을 넣으세요.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div
            className={`flex min-h-[380px] min-w-0 flex-col p-5 xl:col-span-5 ${cardClass}`}
          >
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 flex-col gap-3">
                <h2
                  className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                >
                  생산 추이 그래프
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <DateInput
                    aria-label="생산 추이 시작일"
                    value={trendFilterDraft.startDate}
                    onChange={(startDate) => {
                      setTrendFilterDraft((prev) => {
                        const next = { ...prev, startDate };
                        if (next.startDate && next.endDate) {
                          setTrendFilterApplied(next);
                        }
                        return next;
                      });
                    }}
                    isDark={isDark}
                    compact
                    className="!h-9 !w-[112px] !max-w-[112px] shrink-0"
                  />
                  <span
                    className={`shrink-0 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                  >
                    –
                  </span>
                  <DateInput
                    aria-label="생산 추이 종료일"
                    value={trendFilterDraft.endDate}
                    onChange={(endDate) => {
                      setTrendFilterDraft((prev) => {
                        const next = { ...prev, endDate };
                        if (next.startDate && next.endDate) {
                          setTrendFilterApplied(next);
                        }
                        return next;
                      });
                    }}
                    isDark={isDark}
                    compact
                    className="!h-9 !w-[112px] !max-w-[112px] shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTrendFilterDraft({ startDate: '', endDate: '' });
                      setTrendFilterApplied({ startDate: '', endDate: '' });
                      setTrendGrain('day');
                    }}
                    className={`inline-flex h-9 shrink-0 items-center rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                      isDark
                        ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    초기화
                  </button>
                </div>
              </div>
              <div
                className={`inline-flex shrink-0 rounded-xl border p-1 ${
                  isDark ? 'border-slate-600 bg-slate-900/60' : 'border-slate-200 bg-white'
                }`}
                role="group"
                aria-label="생산 추이 조회 단위"
              >
                {(
                  [
                    { id: 'day', label: '일 별' },
                    { id: 'week', label: '주간 별' },
                    { id: 'month', label: '월 별' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSelectedTrendBucket(null);
                      setTrendGrain(opt.id);
                    }}
                    className={`inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                      trendGrain === opt.id
                        ? isDark
                          ? 'bg-slate-700 text-white shadow-sm'
                          : 'bg-slate-900 text-white shadow-sm'
                        : isDark
                          ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              {trendHasData ? (
                <ProductionTrendChart
                  points={dailyAggregates}
                  isDark={isDark}
                  trendGrain={trendGrain}
                  onBarClick={setSelectedTrendBucket}
                />
              ) : (
                <EmptyState plain message="표시할 생산 데이터가 없습니다." />
              )}
            </div>
          </div>

          <div className={`flex min-w-0 flex-col p-5 xl:col-span-4 ${cardClass}`}>
            <FeatureImportancePanel
              items={featureImportanceItems}
              isDark={isDark}
              periodLabel={featureImportanceLabel}
              selected={selectedTrendBucket != null}
              onClearSelection={() => setSelectedTrendBucket(null)}
            />
          </div>
        </section>


        {/* Grafana 하단 패널 */}
        <section className={`mb-6 p-5 ${cardClass}`}>
          <h2
            className={`mb-3 text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
          >
            실시간 잔류 리튬 분석
          </h2>
          <div
            className={`relative min-h-[520px] h-[520px] w-full overflow-hidden rounded-md ${
              isDark ? 'bg-slate-900' : 'bg-white'
            }`}
          >
            {GRAFANA_BOTTOM_PANEL_URL.trim() ? (
              <iframe
                src={GRAFANA_BOTTOM_PANEL_URL}
                title="실시간 잔류 리튬 분석"
                scrolling="no"
                className="absolute inset-0 block h-full w-full border-0"
              />
            ) : (
              <div className="flex h-full min-h-[520px] items-center justify-center px-4">
                <p
                  className={`m-0 text-center text-sm leading-relaxed ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  GRAFANA_BOTTOM_PANEL_URL에 Embed URL을 넣으세요.
                </p>
              </div>
            )}
          </div>
        </section>

      </div>

      {lotRiskFullscreenOpen ? (
        <div className="fixed inset-0 z-[90] flex flex-col bg-slate-950/70 p-3 sm:p-5">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="전체보기 닫기"
            onClick={closeLotRiskFullscreen}
          />
          <div
            className={`relative z-[1] flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
            }`}
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}
            >
              <div>
                <h2
                  className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                >
                  LOT 위험등급 전체보기
                </h2>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  현재 필터 결과 · 마우스 휠로 스크롤
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleLotRiskExportCsv()}
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium ${
                    isDark
                      ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => void handleLotRiskExportPdf()}
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium ${
                    isDark
                      ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={closeLotRiskFullscreen}
                  className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-bold ${
                    isDark
                      ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  닫기
                </button>
              </div>
            </div>

            <div
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}
            >
              <label className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-xs sm:max-w-[240px]">
                <span className={`shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  LOT
                </span>
                <input
                  type="search"
                  value={lotRiskFilterDraft.lotQuery}
                  onChange={(e) =>
                    setLotRiskFilterDraft((prev) => ({ ...prev, lotQuery: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const next = { ...lotRiskFilterDraft };
                      setLotRiskFilterApplied(next);
                      setLotRiskPage(1);
                      setLotRiskPageInput('1');
                      void openLotRiskFullscreen(next);
                    }
                  }}
                  className={`h-9 w-full rounded-lg border px-2.5 text-sm outline-none ${
                    isDark
                      ? 'border-slate-700 bg-slate-950/40 text-slate-100'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                />
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs">
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>불량확률</span>
                <select
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
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>위험등급</span>
                <select
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
                  <option value="안정">안정</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  const next = { ...lotRiskFilterDraft };
                  setLotRiskFilterApplied(next);
                  setLotRiskPage(1);
                  setLotRiskPageInput('1');
                  void openLotRiskFullscreen(next);
                }}
                className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
              >
                검색
              </button>
              <span className={`ml-auto text-xs tabular-nums ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {lotRiskFullscreenLoading
                  ? '불러오는 중…'
                  : `총 ${lotRiskFullscreenRows.length}건`}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
              {lotRiskFullscreenLoading ? (
                <p className={`py-16 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  불러오는 중…
                </p>
              ) : lotRiskFullscreenRows.length === 0 ? (
                <p className={`py-16 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  표시할 LOT가 없습니다.
                </p>
              ) : (
                <table className="w-full min-w-[960px] border-collapse text-sm">
                  <thead
                    className={`sticky top-0 text-xs font-semibold ${
                      isDark ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <tr>
                      <th className="px-3 py-2.5 text-left">LOT ID</th>
                      <th className="px-3 py-2.5 text-left">불량확률</th>
                      <th className="px-3 py-2.5 text-right">잔류리튬</th>
                      <th className="px-3 py-2.5 text-right">여유량</th>
                      <th className="px-3 py-2.5 text-center">SPC</th>
                      <th className="px-3 py-2.5 text-center">위험등급</th>
                      <th className="px-3 py-2.5 text-left">위험 원인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotRiskFullscreenRows.map((row) => (
                      <tr
                        key={row.lot}
                        className={`border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}
                      >
                        <td className={`px-3 py-2.5 font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {row.lot}
                        </td>
                        <td className={`px-3 py-2.5 tabular-nums ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                          {row.prob != null && Number.isFinite(row.prob)
                            ? `${Math.round(lotRiskProbPercent(row.prob))}%`
                            : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                          {typeof row.predLi === 'number'
                            ? formatNumber(Math.round(row.predLi))
                            : row.predLi || '—'}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right font-semibold tabular-nums ${lotRiskMarginClass(
                            row.margin,
                            isDark,
                          )}`}
                        >
                          {formatSpecDistance(row.margin)}
                        </td>
                        <td className="px-3 py-2.5 text-center">{row.spc || '—'}</td>
                        <td className="px-3 py-2.5 text-center font-semibold">{row.grade || '—'}</td>
                        <td
                          className={`max-w-[280px] truncate px-3 py-2.5 ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                          title={row.reason || undefined}
                        >
                          {row.reason || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={dismissToast} />
        ))}
      </div>

    </div>
  );
};
