'use client'

import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  issueApi,
  type HandoverHistoryItem,
  type IssueDetail as IssueApiDetail,
  type IssueListItem as IssueApiListItem,
} from '@/api/issueApi';
import { useUiSettings } from '@/components/layout/AppShell';
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent';
import { useSelectedLot } from '@/context/SelectedLotContext';
import type { LotSensorRecord } from '@/lib/lotToChatFeatures';
import DateInput from '@/components/DateInput';
import { getAuthUser } from '@/lib/authStorage';

interface ProcessData {
  time: string;
  temperature: number;
  pressure: number;
  humidity: number;
  riskBefore: number;
  riskAfter: number;
}

type SpcMetricKey =
  | 'd50'
  | 'd90'
  | 'metal_impurity'
  | 'lithium_input'
  | 'additive_ratio'
  | 'process_time'
  | 'sintering_temp'
  | 'humidity'
  | 'tank_pressure';

type SpcStatus = '이상' | '주의' | '안정';

type SpcDataPoint = {
  timestamp: string;
  value: number;
};

type SpcMetric = {
  key: SpcMetricKey;
  label: string;
  unit: string;
  status: SpcStatus;
  currentValue: number;
  centerLine: number;
  upperControlLimit: number;
  lowerControlLimit: number;
  data: SpcDataPoint[];
};

interface Issue {
  id: string;
  occurredAt: string;
  date: string;
  lot: string;
  risk: '높음' | '중간' | '낮음';
  status: '접수' | '분석 중' | '조치 중' | '완료';
  title: string;
  assignee: string;
  action: string;
  completed: boolean;
  anomaly: string;
  processData: ProcessData[];
  /** Mock SPC 9항목 — 향후 실데이터 교체용 */
  spcMetrics: SpcMetric[];
  /** Mock 잔류 Li 여유 (%) */
  residualLiMargin: number;
  /** Mock 불량 확률 (%) */
  defectProbability: number;
}

interface FilterState {
  search: string;
  date: string;
  lot: string;
  risk: '' | Issue['risk'];
  status: '' | Issue['status'];
  /** 대표 SPC 상태 필터. 안정은 목록 제외 대상이라 옵션에 없음 */
  spc: '' | '이상' | '주의';
}

interface HandoverData {
  period: string;
  averageTemperature: number;
  averagePressure: number;
  averageHumidity: number;
  aiRiskPredictions: number;
  riskyLots: number;
  issueCount: number;
}

interface ManagementForm {
  assignee: string;
  status: Issue['status'];
  action: string;
  completed: boolean;
}

interface HeaderHandoverSectionProps {
  data: HandoverData;
  notice: string;
  onGenerate: () => void;
  onWrite: () => void;
  onCloseNotice: () => void;
}

interface IssueListSectionProps {
  issues: Issue[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageItems: Array<number | 'ellipsis'>;
  pageInput: string;
  rangeLabel: string;
  filters: FilterState;
  lots: string[];
  selectedId: string | null;
  onFilterChange: (key: keyof FilterState, value: string) => void;
  onApplyFilter: () => void;
  onResetFilter: () => void;
  onPageChange: (page: number) => void;
  onPageInputChange: (value: string) => void;
  onPageInputSubmit: () => void;
  onSelect: (id: string) => void;
  /** 메인「위험 LOT Top」과 동일 — 챗봇 features 주입 + 자동 진단 */
  onDiagnose: (issue: Issue) => void;
}

interface DetailAnalysisSectionProps {
  issue: Issue | null;
  onDiagnose?: (issue: Issue) => void;
}

interface ManagementSectionProps {
  issue: Issue | null;
  form: ManagementForm;
  message: string;
  canSave: boolean;
  isSaving?: boolean;
  onChange: <K extends keyof ManagementForm>(key: K, value: ManagementForm[K]) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}

interface HandoverNote {
  id: number;
  author: string;
  category: '특이사항' | '전달사항' | '주의사항';
  content: string;
  createdAt: string;
  /** 근무 시작 시각 (HH:mm) */
  shiftStart: string;
  /** 근무 종료 시각 (HH:mm) */
  shiftEnd: string;
  issueId?: string;
}

interface HandoverNoteSectionProps {
  notes: HandoverNote[];
  onAdd: (note: Omit<HandoverNote, 'id' | 'createdAt' | 'issueId'>) => void | Promise<void>;
  onRemove: (id: number) => void;
  onClose: () => void;
}

interface HandoverReportModalProps {
  data: HandoverData;
  issues: Issue[];
  notes: HandoverNote[];
  completedNoteIds: number[];
  onClose: () => void;
  onDownloadPdf: () => void;
  onDownloadCsv: () => void;
  onCompleteOne: (noteId: number, party: { from: string; to: string }) => void;
  onCompleteAll: (party: { from: string; to: string }) => void;
  isCompleting?: boolean;
}

/** Light palette — also used by PDF HTML builder (always light). */
const colors = {
  background: '#f1f5f9',
  panel: '#ffffff',
  navy: '#0f172a',
  slate: '#475569',
  muted: '#94a3b8',
  line: '#e2e8f0',
  blue: '#2563eb',
  blueSoft: '#eff6ff',
  cyan: '#06b6d4',
  green: '#16a34a',
  greenSoft: '#f0fdf4',
  red: '#dc2626',
  redSoft: '#fef2f2',
  amber: '#d97706',
  amberSoft: '#fffbeb',
};

type UiColors = typeof colors;

const darkColors: UiColors = {
  background: '#0f172a',
  panel: '#1e293b',
  navy: '#f1f5f9',
  slate: '#94a3b8',
  muted: '#94a3b8',
  line: '#334155',
  blue: '#60a5fa',
  blueSoft: 'rgba(23, 37, 84, 0.4)',
  cyan: '#22d3ee',
  green: '#34d399',
  greenSoft: 'rgba(6, 78, 59, 0.4)',
  red: '#fb7185',
  redSoft: 'rgba(76, 5, 25, 0.4)',
  amber: '#fbbf24',
  amberSoft: 'rgba(69, 26, 3, 0.4)',
};

const getUiColors = (isDark: boolean): UiColors => (isDark ? darkColors : colors);

const getPanelStyle = (c: UiColors): CSSProperties => ({
  background: c.panel,
  border: `1px solid ${c.line}`,
  borderRadius: 18,
  boxShadow:
    c.panel === darkColors.panel
      ? '0 8px 24px rgba(0, 0, 0, 0.35)'
      : '0 8px 24px rgba(15, 23, 42, 0.06)',
  padding: 24,
});

const getInputStyle = (c: UiColors): CSSProperties => {
  const isDark = c.panel === darkColors.panel;
  return {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${isDark ? '#475569' : c.line}`,
    borderRadius: 10,
    background: isDark ? '#0f172a' : '#f8fafc',
    color: c.navy,
    fontSize: 14,
    padding: '10px 12px',
    outlineColor: c.blue,
  };
};

const getLabelStyle = (c: UiColors): CSSProperties => ({
  display: 'block',
  marginBottom: 7,
  color: c.slate,
  fontSize: 13,
  fontWeight: 700,
});

const riskStyle = (risk: Issue['risk'], isDark = false): CSSProperties => {
  if (risk === '높음') {
    return isDark
      ? {
          background: 'rgba(76, 5, 25, 0.4)',
          color: '#fda4af',
          border: '1px solid #9f1239',
          fontWeight: 700,
        }
      : {
          background: '#fff1f2',
          color: '#be123c',
          border: '1px solid #fecdd3',
          fontWeight: 700,
        };
  }
  if (risk === '중간') {
    return isDark
      ? {
          background: 'rgba(69, 26, 3, 0.4)',
          color: '#fcd34d',
          border: '1px solid #b45309',
          fontWeight: 700,
        }
      : {
          background: '#fffbeb',
          color: '#b45309',
          border: '1px solid #fde68a',
          fontWeight: 700,
        };
  }
  return isDark
    ? {
        background: 'rgba(6, 78, 59, 0.4)',
        color: '#6ee7b7',
        border: '1px solid #047857',
        fontWeight: 700,
      }
    : {
        background: '#ecfdf5',
        color: '#047857',
        border: '1px solid #a7f3d0',
        fontWeight: 700,
      };
};

const statusStyle = (status: Issue['status'], isDark = false): CSSProperties => {
  const c = getUiColors(isDark);
  if (status === '완료') {
    return isDark
      ? {
          background: c.greenSoft,
          color: '#6ee7b7',
          border: '1px solid #047857',
        }
      : {
          background: colors.greenSoft,
          color: colors.green,
          border: `1px solid #bbf7d0`,
        };
  }
  if (status === '조치 중') {
    return isDark
      ? {
          background: 'rgba(46, 16, 101, 0.4)',
          color: '#c4b5fd',
          border: '1px solid #6d28d9',
        }
      : {
          background: '#f5f3ff',
          color: '#7c3aed',
          border: '1px solid #ddd6fe',
        };
  }
  if (status === '분석 중') {
    return isDark
      ? {
          background: c.blueSoft,
          color: '#93c5fd',
          border: '1px solid #1d4ed8',
        }
      : {
          background: colors.blueSoft,
          color: colors.blue,
          border: '1px solid #bfdbfe',
        };
  }
  return isDark
    ? {
        background: 'rgba(15, 23, 42, 0.7)',
        color: c.slate,
        border: `1px solid ${c.line}`,
      }
    : {
        background: '#f1f5f9',
        color: colors.slate,
        border: `1px solid ${colors.line}`,
      };
};

const badgeBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

/** 처리 상태 — 위험도 pill과 구분되는 rounded-md 태그 */
const statusTagBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const getFilterControlStyle = (c: UiColors): CSSProperties => {
  const isDark = c.panel === darkColors.panel;
  return {
    width: '100%',
    boxSizing: 'border-box',
    height: 36,
    border: `1px solid ${isDark ? '#475569' : '#e2e8f0'}`,
    borderRadius: 8,
    background: isDark ? '#0f172a' : '#fff',
    color: c.navy,
    fontSize: 13,
    padding: '0 10px',
    outlineColor: c.blue,
  };
};

const noteCategoryStyle = (
  category: HandoverNote['category'],
  isDark = false,
): CSSProperties => {
  const c = getUiColors(isDark);
  if (category === '주의사항') return { background: c.redSoft, color: c.red };
  if (category === '전달사항') return { background: c.blueSoft, color: c.blue };
  return { background: c.amberSoft, color: c.amber };
};

const SPC_METRIC_KEYS: SpcMetricKey[] = [
  'd50',
  'd90',
  'metal_impurity',
  'lithium_input',
  'additive_ratio',
  'process_time',
  'sintering_temp',
  'humidity',
  'tank_pressure',
];

/** Mock SPC 한계선·표시명 (고정값, 렌더마다 변하지 않음) */
const SPC_METRIC_META: Record<
  SpcMetricKey,
  { label: string; unit: string; centerLine: number; upperControlLimit: number; lowerControlLimit: number }
> = {
  d50: { label: 'D50', unit: 'μm', centerLine: 12.0, upperControlLimit: 13.5, lowerControlLimit: 10.5 },
  d90: { label: 'D90', unit: 'μm', centerLine: 28.0, upperControlLimit: 32.0, lowerControlLimit: 24.0 },
  metal_impurity: {
    label: '금속 불순물',
    unit: '%',
    centerLine: 0.015,
    upperControlLimit: 0.025,
    lowerControlLimit: 0.005,
  },
  lithium_input: {
    label: '리튬 투입량',
    unit: 'eq',
    centerLine: 1.05,
    upperControlLimit: 1.12,
    lowerControlLimit: 0.98,
  },
  additive_ratio: {
    label: '첨가제 비율',
    unit: '%',
    centerLine: 2.5,
    upperControlLimit: 3.0,
    lowerControlLimit: 2.0,
  },
  process_time: {
    label: '공정 시간',
    unit: 'min',
    centerLine: 120,
    upperControlLimit: 135,
    lowerControlLimit: 105,
  },
  sintering_temp: {
    label: '소결 온도',
    unit: '°C',
    centerLine: 742,
    upperControlLimit: 750,
    lowerControlLimit: 730,
  },
  humidity: { label: '습도', unit: '%', centerLine: 45, upperControlLimit: 55, lowerControlLimit: 35 },
  tank_pressure: {
    label: '탱크 압력',
    unit: 'bar',
    centerLine: 2.0,
    upperControlLimit: 2.4,
    lowerControlLimit: 1.6,
  },
};

const SPC_TIMESTAMPS = ['0h', '2h', '4h', '6h', '8h', '10h'] as const;

function getOverallSpcStatus(metrics: SpcMetric[]): SpcStatus {
  if (metrics.some((metric) => metric.status === '이상')) return '이상';
  if (metrics.some((metric) => metric.status === '주의')) return '주의';
  return '안정';
}

function isIssueCompleted(issue: Pick<Issue, 'completed' | 'status'>) {
  return issue.completed || issue.status === '완료';
}

function countSpcByStatus(metrics: SpcMetric[]) {
  return {
    이상: metrics.filter((m) => m.status === '이상').length,
    주의: metrics.filter((m) => m.status === '주의').length,
    안정: metrics.filter((m) => m.status === '안정').length,
  };
}

function formatSpcValue(key: SpcMetricKey, value: number) {
  if (key === 'metal_impurity' || key === 'lithium_input') return value.toFixed(3);
  if (key === 'd50' || key === 'd90' || key === 'additive_ratio' || key === 'tank_pressure') {
    return value.toFixed(1);
  }
  return String(Math.round(value * 10) / 10);
}

function spcStatusBadgeClass(status: SpcStatus, isDark = false) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold';
  if (status === '이상') {
    return isDark
      ? `${base} bg-rose-950/50 text-rose-300`
      : `${base} bg-rose-100 text-rose-700`;
  }
  if (status === '주의') {
    return isDark
      ? `${base} bg-amber-950/50 text-amber-300`
      : `${base} bg-amber-100 text-amber-700`;
  }
  return isDark
    ? `${base} bg-emerald-950/50 text-emerald-300`
    : `${base} bg-emerald-100 text-emerald-700`;
}

/**
 * Mock SPC 9항목 생성.
 * statusOverrides에 없는 키는 안정, valuesOverrides에 없으면 CL 근처 고정 시계열.
 */
function buildSpcMetrics(
  statusOverrides: Partial<Record<SpcMetricKey, SpcStatus>> = {},
  valuesOverrides: Partial<Record<SpcMetricKey, number[]>> = {},
): SpcMetric[] {
  return SPC_METRIC_KEYS.map((key) => {
    const meta = SPC_METRIC_META[key];
    const status = statusOverrides[key] ?? '안정';
    const defaultStable = SPC_TIMESTAMPS.map((_, i) => {
      const wobble = ((i % 3) - 1) * (meta.upperControlLimit - meta.centerLine) * 0.08;
      return Math.round((meta.centerLine + wobble) * 1000) / 1000;
    });
    const values = valuesOverrides[key] ?? defaultStable;
    const data: SpcDataPoint[] = SPC_TIMESTAMPS.map((timestamp, index) => ({
      timestamp,
      value: values[index] ?? meta.centerLine,
    }));
    return {
      key,
      label: meta.label,
      unit: meta.unit,
      status,
      currentValue: data[data.length - 1]?.value ?? meta.centerLine,
      centerLine: meta.centerLine,
      upperControlLimit: meta.upperControlLimit,
      lowerControlLimit: meta.lowerControlLimit,
      data,
    };
  });
}

const createProcessData = (
  temperatures: number[],
  pressures: number[],
  before: number[],
  after: number[],
): ProcessData[] =>
  temperatures.map((temperature, index) => ({
    time: `${index * 2}h`,
    temperature,
    pressure: pressures[index],
    humidity: [45.2, 46.1, 44.8, 47.3, 48.6, 43.9, 49.2, 46.7, 45.5, 44.3][index % 10],
    riskBefore: before[index],
    riskAfter: after[index],
  }));

/**
 * 이슈 processData → 챗봇 LotSensorRecord.
 * 메인 위험 LOT 연결과 동일한 connectLot 입력 형태.
 */
function issueToLotSensorRecord(issue: Issue): LotSensorRecord {
  const points = issue.processData;
  const last = points[points.length - 1];
  const peakTemp =
    points.length > 0 ? Math.max(...points.map((p) => p.temperature)) : 740;
  const peakPressure =
    points.length > 0 ? Math.max(...points.map((p) => p.pressure)) : 1.8;
  const timePart = issue.occurredAt.includes(' ')
    ? issue.occurredAt.split(' ')[1] ?? '00:00'
    : '00:00';
  const hour = timePart.length >= 5 ? timePart.slice(0, 5) : timePart;
  const riskBoost = issue.risk === '높음' ? 1 : issue.risk === '중간' ? 0.5 : 0;

  return {
    id: issue.lot,
    date: issue.date,
    hour,
    sintering_temp: last?.temperature ?? peakTemp,
    tank_pressure: last?.pressure ?? peakPressure,
    process_time: Math.max(60, points.length * 20),
    lithium_input: Math.round((1.02 + riskBoost * 0.04) * 1000) / 1000,
    humidity: Math.round(38 + riskBoost * 4),
    metal_impurity: Math.round((0.022 + riskBoost * 0.01) * 1000) / 1000,
    additive_ratio: Math.round((2.5 + riskBoost * 0.3) * 10) / 10,
  };
}

const INITIAL_ISSUES: Issue[] = [
  {
    id: 'ISS-260721-018',
    occurredAt: '2026-07-21 15:42',
    date: '2026-07-21',
    lot: 'LOT-CA-260721-08',
    risk: '높음',
    status: '조치 중',
    title: '소성로 2호기 온도 상한 지속 초과',
    assignee: '김현수',
    action: '소성 온도를 742°C로 하향 조정하고 냉각 계통을 점검 중입니다.',
    completed: false,
    anomaly: '14시 이후 온도가 관리 상한 750°C를 3회 초과했으며 AI 위험 점수가 91점까지 상승했습니다.',
    processData: createProcessData(
      [738, 742, 748, 754, 752, 746],
      [1.8, 1.9, 2.1, 2.4, 2.3, 2.0],
      [42, 51, 68, 91, 86, 72],
      [38, 43, 52, 61, 48, 35],
    ),
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
    id: 'ISS-260721-017',
    occurredAt: '2026-07-21 14:18',
    date: '2026-07-21',
    lot: 'LOT-CA-260721-07',
    risk: '중간',
    status: '분석 중',
    title: '리튬 투입 속도 편차 증가',
    assignee: '박서연',
    action: '공급기 센서 로그와 계량기 교정 이력을 비교 분석하고 있습니다.',
    completed: false,
    anomaly: '리튬 투입 속도의 표준편차가 기준 대비 32% 증가하여 조성 불균일 가능성이 감지되었습니다.',
    processData: createProcessData(
      [736, 739, 741, 743, 740, 738],
      [1.7, 1.8, 2.0, 2.1, 1.9, 1.8],
      [31, 39, 55, 66, 58, 47],
      [28, 32, 41, 46, 39, 31],
    ),
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
    id: 'ISS-260721-016',
    occurredAt: '2026-07-21 11:05',
    date: '2026-07-21',
    lot: 'LOT-CA-260721-05',
    risk: '낮음',
    status: '완료',
    title: '혼합기 습도 센서 일시 이상',
    assignee: '이도윤',
    action: '센서 커넥터를 재체결하고 정상 신호 수신을 확인했습니다.',
    completed: true,
    anomaly: '내부 습도(Humidity)가 일시적으로 50%를 초과하였으나 즉시 정상 범위로 복구되었습니다.',
    processData: createProcessData(
      [735, 736, 737, 738, 737, 736],
      [1.7, 1.7, 1.8, 1.8, 1.7, 1.7],
      [24, 28, 36, 33, 27, 22],
      [20, 22, 25, 23, 20, 18],
    ),
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
    id: 'ISS-260720-015',
    occurredAt: '2026-07-20 23:36',
    date: '2026-07-20',
    lot: 'LOT-CA-260720-12',
    risk: '높음',
    status: '접수',
    title: '냉각 구간 압력 급상승',
    assignee: '미배정',
    action: '',
    completed: false,
    anomaly: '냉각수 압력이 2.7bar까지 급상승하고 배출 온도 안정화 시간이 평소보다 18분 지연되었습니다.',
    processData: createProcessData(
      [741, 744, 747, 749, 746, 742],
      [1.9, 2.0, 2.3, 2.7, 2.5, 2.2],
      [45, 53, 71, 94, 83, 67],
      [41, 47, 58, 69, 54, 42],
    ),
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
    id: 'ISS-260720-014',
    occurredAt: '2026-07-20 18:12',
    date: '2026-07-20',
    lot: 'LOT-CA-260720-09',
    risk: '중간',
    status: '완료',
    title: '입도 분포 D50 기준치 접근',
    assignee: '최유진',
    action: '분쇄기 회전수를 3% 낮추고 재측정하여 정상 범위를 확인했습니다.',
    completed: true,
    anomaly: 'D50 측정값이 관리 상한에 근접했으나 공정 조정 후 정상 중앙값으로 회복되었습니다.',
    processData: createProcessData(
      [737, 738, 740, 741, 739, 738],
      [1.8, 1.9, 2.0, 2.0, 1.9, 1.8],
      [34, 42, 57, 63, 48, 37],
      [29, 34, 40, 43, 33, 26],
    ),
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
    id: 'ISS-260719-013',
    occurredAt: '2026-07-19 16:48',
    date: '2026-07-19',
    lot: 'LOT-CA-260719-06',
    risk: '낮음',
    status: '완료',
    title: '검사 장비 이미지 수집 지연',
    assignee: '정민재',
    action: '카메라 캐시를 초기화하고 네트워크 지연 상태를 점검했습니다.',
    completed: true,
    anomaly: '표면 검사 이미지 수집이 평균 1.2초 지연되었으나 검사 결과 누락은 없었습니다.',
    processData: createProcessData(
      [734, 735, 736, 736, 735, 734],
      [1.6, 1.7, 1.7, 1.8, 1.7, 1.6],
      [18, 22, 29, 31, 25, 20],
      [16, 18, 21, 22, 19, 15],
    ),
    residualLiMargin: 0.35,
    defectProbability: 8.4,
    // Mock: 9개 모두 안정 → 이슈 목록에서 제외되어 표시되지 않음
    spcMetrics: buildSpcMetrics(),
  },
  {
    id: 'ISS-260719-012',
    occurredAt: '2026-07-19 09:22',
    date: '2026-07-19',
    lot: 'LOT-CA-260719-02',
    risk: '중간',
    status: '조치 중',
    title: '전구체 수분 함량 변동 감지',
    assignee: '한지우',
    action: '원료 보관 습도와 건조 공정 시간을 재조정하고 있습니다.',
    completed: false,
    anomaly: '수분 함량이 0.03%p 상승하여 소성 후 잔류 리튬 증가 가능성이 확인되었습니다.',
    processData: createProcessData(
      [736, 738, 742, 744, 742, 739],
      [1.7, 1.8, 2.0, 2.2, 2.1, 1.9],
      [30, 38, 54, 69, 61, 49],
      [27, 33, 42, 49, 41, 34],
    ),
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
    id: 'ISS-260718-011',
    occurredAt: '2026-07-18 21:10',
    date: '2026-07-18',
    lot: 'LOT-CA-260718-11',
    risk: '높음',
    status: '분석 중',
    title: '예측 불량률 2.5% 초과',
    assignee: '김현수',
    action: '동일 조건 과거 LOT와 공정 파라미터를 교차 분석 중입니다.',
    completed: false,
    anomaly: '온도와 투입량 복합 영향으로 AI 예측 불량률이 2.73%까지 상승했습니다.',
    processData: createProcessData(
      [739, 743, 749, 753, 751, 747],
      [1.8, 2.0, 2.2, 2.5, 2.4, 2.1],
      [44, 56, 74, 92, 87, 73],
      [39, 46, 58, 65, 55, 43],
    ),
    residualLiMargin: 0.08,
    defectProbability: 78.9,
    spcMetrics: buildSpcMetrics(
      {
        sintering_temp: '이상',
        lithium_input: '이상',
        metal_impurity: '이상',
        tank_pressure: '주의',
      },
      {
        sintering_temp: [739, 743, 749, 753, 751, 752],
        lithium_input: [1.07, 1.1, 1.13, 1.16, 1.15, 1.17],
        metal_impurity: [0.018, 0.022, 0.026, 0.029, 0.028, 0.03],
        tank_pressure: [1.9, 2.1, 2.2, 2.3, 2.35, 2.38],
      },
    ),
  },
];

const MOCK_ISSUES_BY_ID = new Map(INITIAL_ISSUES.map((issue) => [issue.id, issue]));
const EMPTY_PROCESS_DATA: ProcessData[] = [];
const EMPTY_SPC_METRICS = buildSpcMetrics();

function mapIssueListItem(item: IssueApiListItem): Issue {
  const mock = MOCK_ISSUES_BY_ID.get(item.issueId);
  return {
    ...(mock ?? {
      assignee: '미배정',
      action: '',
      completed: false,
      anomaly: '상세 분석 데이터는 준비 중입니다.',
      processData: EMPTY_PROCESS_DATA,
      spcMetrics: EMPTY_SPC_METRICS,
      residualLiMargin: 0,
      defectProbability: 0,
    }),
    id: item.issueId,
    occurredAt: item.occurredAt,
    date: item.occurredAt.slice(0, 10),
    lot: item.lotId,
    risk: item.riskLevel,
    status: item.status,
    title: item.title,
    completed: item.status === '완료',
  };
}

function mergeIssueDetail(issue: Issue, detail: IssueApiDetail): Issue {
  return {
    ...issue,
    id: detail.issueId,
    occurredAt: detail.occurredAt,
    date: detail.occurredAt.slice(0, 10),
    lot: detail.lotId,
    risk: detail.riskLevel,
    status: detail.status,
    title: detail.title,
    assignee: detail.assigneeName?.trim() || '미배정',
    action: detail.actionContent ?? '',
    completed: detail.completed,
  };
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return fallback;
}

const HANDOVER_DATA: HandoverData = {
  period: '2026-07-21 08:00 ~ 16:00',
  averageTemperature: 742.6,
  averagePressure: 1.94,
  averageHumidity: 45.8,
  aiRiskPredictions: 5,
  riskyLots: 3,
  issueCount: 4,
};

const HeaderHandoverSection = ({
  data,
  notice,
  onGenerate,
  onWrite,
  onCloseNotice,
}: HeaderHandoverSectionProps) => {
  const { isDark, language } = useUiSettings();
  const c = getUiColors(isDark);
  return (
    <section>
      {notice && (
        <div
          role="status"
          style={{
            ...getPanelStyle(c),
            marginBottom: 18,
            padding: '13px 16px',
            borderColor: isDark ? '#047857' : '#86efac',
            background: c.greenSoft,
            color: isDark ? '#6ee7b7' : '#166534',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <span>✓ {notice}</span>
          <button
            type="button"
            onClick={onCloseNotice}
            aria-label="알림 닫기"
            style={{
              border: 0,
              background: 'transparent',
              color: isDark ? '#6ee7b7' : '#166534',
              cursor: 'pointer',
              fontSize: 20,
            }}
          >
            ×
          </button>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 20,
          flexWrap: 'wrap',
          marginBottom: 22,
        }}
      >
        <div className="flex flex-col gap-1">
          <p
            className={`text-sm font-bold tracking-wide ${
              isDark ? 'text-blue-400' : 'text-blue-600'
            }`}
          >
            Issue Operations
          </p>
          <h1
            className={`mt-1 text-3xl font-bold tracking-tight ${
              isDark ? 'text-slate-100' : 'text-gray-900'
            }`}
          >
            {language === 'en' ? 'Issue Management' : '이슈 관리'}
          </h1>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            {language === 'en'
              ? 'Review process issues, analyze them, and manage resolution status.'
              : '공정 이슈를 조회하고 분석하며 처리 현황을 관리할 수 있습니다.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onWrite}
            className={`inline-flex h-9 items-center rounded-lg border-2 border-blue-600 px-3 text-xs font-bold text-blue-600 ${
              isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-blue-50'
            }`}
          >
            {language === 'en' ? '+ Write Handover' : '+ 인수인계 작성'}
          </button>
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
          >
            {language === 'en' ? 'View / Download Handover' : '인수인계 조회/다운로드'}
          </button>
        </div>
      </div>
    </section>
  );
};

const HandoverReportModal = ({
  data,
  issues,
  notes,
  completedNoteIds,
  onClose,
  onDownloadPdf,
  onDownloadCsv,
  onCompleteOne,
  onCompleteAll,
  isCompleting = false,
}: HandoverReportModalProps) => {
  const { isDark } = useUiSettings();
  const loginName = getLoggedInUserName();
  const noteAuthor =
    notes.map((n) => n.author.trim()).find((name) => name && name !== UNAUTH_USER_LABEL) ||
    loginName;
  const [handoverFrom, setHandoverFrom] = useState(noteAuthor);
  const [handoverTo, setHandoverTo] = useState(loginName);
  const [partyError, setPartyError] = useState('');

  useEffect(() => {
    const nextFrom =
      notes.map((n) => n.author.trim()).find((name) => name && name !== UNAUTH_USER_LABEL) ||
      getLoggedInUserName();
    const nextTo = getLoggedInUserName();
    setHandoverFrom(nextFrom);
    setHandoverTo(nextTo);
    setPartyError('');
  }, [notes]);

  const totalCount = issues.length;
  const completedCount = issues.filter((issue) => issue.completed || issue.status === '완료').length;
  const openIssues = issues.filter((issue) => !issue.completed && issue.status !== '완료');
  const criticalOpenIssues = openIssues
    .filter((issue) => issue.risk === '높음')
    .concat(openIssues.filter((issue) => issue.risk !== '높음'))
    .slice(0, 2);

  const shiftLabel = '2026-07-21 주간 조 (08:00 ~ 16:00)';
  const writtenAt = '2026-07-21 15:55';
  const defaultBriefing = '소성로 2호기 온도 트렌드 30분 간격 추적 필요';
  const completedIdSet = useMemo(() => new Set(completedNoteIds), [completedNoteIds]);
  const pendingNotes = useMemo(
    () => notes.filter((note) => !completedIdSet.has(note.id)),
    [notes, completedIdSet],
  );
  const transferredCount = notes.length - pendingNotes.length;
  const canCompleteAll = pendingNotes.length > 0 && !isCompleting;

  const resolveParty = (): { from: string; to: string } | null => {
    const from = handoverFrom.trim();
    const to = handoverTo.trim();
    if (!from || !to) {
      setPartyError('인계자와 인수자를 모두 입력해주세요.');
      return null;
    }
    setPartyError('');
    return { from, to };
  };

  const handleCompleteAllClick = () => {
    const party = resolveParty();
    if (!party) return;
    onCompleteAll(party);
  };

  const handleCompleteOneClick = (noteId: number) => {
    const party = resolveParty();
    if (!party) return;
    onCompleteOne(noteId, party);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="인수인계 보고서"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl shadow-2xl ${
          isDark ? 'bg-slate-800 text-slate-100' : 'bg-white'
        }`}
      >
        {/* Pinned top bar */}
        <div
          className={`sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b bg-slate-900 px-5 py-3.5 text-white ${
            isDark ? 'border-slate-700' : 'border-slate-200'
          }`}
        >
          <strong className="text-sm font-semibold tracking-tight">교대 인수인계 브리핑</strong>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDownloadPdf}
              className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700"
            >
              PDF 다운로드
            </button>
            <button
              type="button"
              onClick={onDownloadCsv}
              className="inline-flex h-9 items-center rounded-lg border border-blue-300/60 bg-transparent px-3 text-xs font-bold text-blue-100 hover:bg-white/10"
            >
              CSV 다운로드
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="보고서 닫기"
              className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-xl text-slate-300 hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {/* 1. Shift Header */}
          <section
            className={`mb-5 rounded-xl border p-4 ${
              isDark
                ? 'border-slate-700 bg-slate-900/70'
                : 'border-slate-200 bg-slate-50/80'
            }`}
          >
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
              교대 정보
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <dt
                  className={`w-24 shrink-0 text-xs font-semibold ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  교대 구분
                </dt>
                <dd className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {shiftLabel}
                </dd>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="handover-from"
                    className={`mb-1.5 block text-xs font-semibold ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    인계자
                  </label>
                  <input
                    id="handover-from"
                    value={handoverFrom}
                    readOnly
                    className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none ${
                      isDark
                        ? 'border-slate-600 bg-slate-950/40 text-slate-100'
                        : 'border-slate-200 bg-slate-50 text-slate-900'
                    }`}
                    placeholder="인계자 이름"
                  />
                </div>
                <div>
                  <label
                    htmlFor="handover-to"
                    className={`mb-1.5 block text-xs font-semibold ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    인수자
                  </label>
                  <input
                    id="handover-to"
                    value={handoverTo}
                    readOnly
                    className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none ${
                      isDark
                        ? 'border-slate-600 bg-slate-950/40 text-slate-100'
                        : 'border-slate-200 bg-slate-50 text-slate-900'
                    }`}
                    placeholder="인수자 이름"
                  />
                </div>
              </div>
              {partyError ? (
                <p
                  className={`m-0 text-xs font-semibold ${isDark ? 'text-rose-300' : 'text-rose-600'}`}
                  role="alert"
                >
                  {partyError}
                </p>
              ) : null}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <dt
                  className={`w-24 shrink-0 text-xs font-semibold ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  작성 일시
                </dt>
                <dd className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {writtenAt}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-slate-400">대상 기간 · {data.period}</p>
          </section>

          {/* 2. Top Notice / Callout — 다음 조 전달사항 */}
          <section
            className={`mb-5 rounded-xl border p-4 ${
              isDark
                ? 'border-amber-800/60 bg-amber-950/40'
                : 'border-amber-200/80 bg-amber-50/80'
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3
                className={`m-0 text-sm font-bold ${isDark ? 'text-amber-200' : 'text-amber-900'}`}
              >
                3. 교대 전달 및 주의사항
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                    isDark
                      ? 'border-amber-800 bg-slate-800/70 text-amber-200'
                      : 'border-amber-200 bg-white/70 text-amber-800'
                  }`}
                >
                  전체 {notes.length}건 · 완료 {transferredCount}건 · 대기 {pendingNotes.length}건
                </span>
                <button
                  type="button"
                  onClick={handleCompleteAllClick}
                  disabled={!canCompleteAll}
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isCompleting ? '저장 중…' : '전체 완료'}
                </button>
              </div>
            </div>
            {notes.length === 0 ? (
              <p
                className={`m-0 text-sm font-semibold leading-relaxed ${
                  isDark ? 'text-amber-100' : 'text-amber-950'
                }`}
              >
                ⚠ {defaultBriefing}
              </p>
            ) : (
              <ul className="m-0 list-none space-y-2.5 p-0">
                {notes.map((note) => {
                  const isDone = completedIdSet.has(note.id);
                  return (
                    <li
                      key={note.id}
                      className={`rounded-lg border px-3 py-2.5 ${
                        isDone
                          ? isDark
                            ? 'border-emerald-800 bg-emerald-950/40'
                            : 'border-emerald-100 bg-emerald-50/70'
                          : isDark
                            ? 'border-amber-800/60 bg-slate-800/70'
                            : 'border-amber-100/80 bg-white/70'
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                          style={noteCategoryStyle(note.category, isDark)}
                        >
                          {note.category}
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            isDark ? 'text-slate-300' : 'text-slate-700'
                          }`}
                        >
                          {note.author}
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${
                            isDark ? 'text-blue-300' : 'text-blue-700'
                          }`}
                        >
                          {formatShiftRange(note.shiftStart, note.shiftEnd)}
                        </span>
                        <span className="text-[11px] text-slate-400">{note.createdAt}</span>
                        {isDone ? (
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                              isDark
                                ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300'
                                : 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            완료됨
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleCompleteOneClick(note.id)}
                          disabled={isDone || isCompleting}
                          className={`ml-auto inline-flex h-7 items-center rounded-md bg-emerald-600 px-2.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed ${
                            isDark
                              ? 'disabled:bg-emerald-950/40 disabled:text-emerald-400'
                              : 'disabled:bg-emerald-200 disabled:text-emerald-700'
                          }`}
                        >
                          {isDone ? '완료됨' : '완료'}
                        </button>
                      </div>
                      <p
                        className={`m-0 text-sm font-medium leading-relaxed ${
                          isDark ? 'text-slate-100' : 'text-slate-900'
                        }`}
                      >
                        {note.content}
                      </p>
                    </li>
                  );
                })}
                {!notes.some((note) => note.content.includes('소성로')) ? (
                  <li
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                      isDark
                        ? 'border-rose-800 bg-rose-950/40 text-rose-300'
                        : 'border-rose-100 bg-rose-50/60 text-rose-800'
                    }`}
                  >
                    ⚠ {defaultBriefing}
                  </li>
                ) : null}
              </ul>
            )}
          </section>

          {/* 3. Production Brief */}
          <section className="mb-5">
            <h3
              className={`mb-2.5 mt-0 text-sm font-bold ${
                isDark ? 'text-slate-100' : 'text-slate-900'
              }`}
            >
              공정 실적 요약
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div
                className={`rounded-xl border p-3.5 shadow-sm ${
                  isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200/80 bg-white'
                }`}
              >
                <div className={`text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  주간 생산량
                </div>
                <div
                  className={`mt-1 text-base font-bold tabular-nums ${
                    isDark ? 'text-slate-100' : 'text-slate-900'
                  }`}
                >
                  1,958 LOT
                </div>
                <div
                  className={`mt-0.5 text-[11px] font-medium ${
                    isDark ? 'text-emerald-300' : 'text-emerald-700'
                  }`}
                >
                  목표 95.2% 달성
                </div>
              </div>
              <div
                className={`rounded-xl border p-3.5 shadow-sm ${
                  isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200/80 bg-white'
                }`}
              >
                <div className={`text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  평균 불량률
                </div>
                <div
                  className={`mt-1 text-base font-bold tabular-nums ${
                    isDark ? 'text-slate-100' : 'text-slate-900'
                  }`}
                >
                  8.8%
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">교대 집계</div>
              </div>
              <div
                className={`rounded-xl border p-3.5 shadow-sm ${
                  isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200/80 bg-white'
                }`}
              >
                <div className={`text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  특이 설비
                </div>
                <div
                  className={`mt-1 text-base font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                >
                  소성로 2호기
                </div>
                <div
                  className={`mt-0.5 text-[11px] font-medium ${
                    isDark ? 'text-amber-300' : 'text-amber-700'
                  }`}
                >
                  점검중
                </div>
              </div>
            </div>
          </section>

          {/* 4. Unresolved Issues (Compact) */}
          <section>
            <h3
              className={`mb-2.5 mt-0 text-sm font-bold ${
                isDark ? 'text-slate-100' : 'text-slate-900'
              }`}
            >
              야간 이관 이슈
            </h3>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  isDark
                    ? 'border-slate-600 bg-slate-900/70 text-slate-300'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                총 발생: {totalCount || data.issueCount}건
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  isDark
                    ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                완료: {completedCount}건
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  isDark
                    ? 'border-rose-800 bg-rose-950/40 text-rose-300'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                야간 이관(미완료): {openIssues.length}건
              </span>
            </div>

            {criticalOpenIssues.length === 0 ? (
              <div
                className={`rounded-xl border px-4 py-3 text-center text-sm ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/70 text-slate-400'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                야간 이관이 필요한 미완료 이슈가 없습니다.
              </div>
            ) : (
              <ul className="m-0 list-none space-y-2 p-0">
                {criticalOpenIssues.map((issue) => (
                  <li
                    key={issue.id}
                    className={`rounded-lg border px-3.5 py-2.5 text-sm ${
                      isDark
                        ? 'border-slate-700 bg-slate-800 text-slate-200'
                        : 'border-slate-200 bg-white text-slate-800'
                    }`}
                  >
                    <span className={`font-semibold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                      {issue.id}
                    </span>
                    <span className={`mx-1.5 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>|</span>
                    <span className="font-medium">{issue.title}</span>
                    <span className={`mx-1.5 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>|</span>
                    <span className={`font-semibold ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>
                      야간점검 필요
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

const UNAUTH_USER_LABEL = '—(로그인 필요)';

/** users.name from login session (kdt-auth-user). */
function getLoggedInUserName(): string {
  const name = getAuthUser()?.name?.trim();
  return name || UNAUTH_USER_LABEL;
}

function mapHandoverItemToNote(item: HandoverHistoryItem): HandoverNote {
  const category: HandoverNote['category'] =
    item.category === '전달사항' || item.category === '주의사항' || item.category === '특이사항'
      ? item.category
      : '특이사항';
  return {
    id: item.historyId,
    author: item.handoverFrom || item.manager || '',
    category,
    content: item.situation,
    createdAt: item.archivedAt || item.date,
    shiftStart: item.shiftStart || '',
    shiftEnd: item.shiftEnd || '',
    issueId: item.issueId,
  };
}

function formatShiftRange(start: string, end: string): string {
  if (!start && !end) return '';
  return `${start || '--:--'} ~ ${end || '--:--'}`;
}

const HandoverNoteSection = ({
  notes,
  onAdd,
  onRemove,
  onClose,
}: HandoverNoteSectionProps) => {
  const { isDark } = useUiSettings();
  const c = getUiColors(isDark);
  const [author] = useState(() => getLoggedInUserName());
  const [category, setCategory] = useState<HandoverNote['category']>('특이사항');
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('16:00');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!author.trim() || author === UNAUTH_USER_LABEL) {
      setError('로그인 사용자 정보를 확인할 수 없습니다.');
      return;
    }
    if (!shiftStart || !shiftEnd) {
      setError('근무 시작·종료 시각을 입력해주세요.');
      return;
    }
    if (content.trim().length === 0) {
      setError('인수인계 내용을 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onAdd({
        author: author.trim(),
        category,
        content: content.trim(),
        shiftStart,
        shiftEnd,
      });
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '인수인계 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="인수인계 사항 작성"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <section
        onClick={(event) => event.stopPropagation()}
        style={{
          ...getPanelStyle(c),
          width: 'min(680px, 100%)',
          maxHeight: '88vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.35)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ margin: 0, color: c.navy, fontSize: 19 }}>인수인계 사항 작성</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: c.slate, fontSize: 13, fontWeight: 700 }}>
              등록 {notes.length}건
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="작성 창 닫기"
              style={{
                border: 0,
                background: 'transparent',
                color: c.muted,
                cursor: 'pointer',
                fontSize: 22,
                lineHeight: 1,
                padding: 2,
              }}
            >
              ×
            </button>
          </div>
        </div>
        <p style={{ margin: '0 0 18px', color: c.slate, fontSize: 13 }}>
          다음 교대 근무자에게 전달할 특이사항과 주의사항을 기록하면 인수인계 보고서에 함께 포함됩니다.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              border: isDark ? '1px solid #9f1239' : '1px solid #fca5a5',
              borderRadius: 10,
              background: c.redSoft,
              color: c.red,
              padding: '11px 13px',
              marginBottom: 16,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <label htmlFor="note-author" style={getLabelStyle(c)}>
                작성자 (로그인)
              </label>
              <input
                id="note-author"
                value={author}
                readOnly
                aria-readonly="true"
                title="로그인 계정 정보가 자동 입력됩니다"
                style={{
                  ...getInputStyle(c),
                  background: isDark ? '#0f172a' : '#f1f5f9',
                  color: c.navy,
                  fontWeight: 700,
                  cursor: 'default',
                }}
              />
              <p style={{ margin: '6px 0 0', color: c.muted, fontSize: 11 }}>
                로그인 정보로 자동 입력됩니다.
              </p>
            </div>
            <div>
              <label htmlFor="note-category" style={getLabelStyle(c)}>
                구분
              </label>
              <select
                id="note-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as HandoverNote['category'])}
                style={getInputStyle(c)}
              >
                <option value="특이사항">특이사항</option>
                <option value="전달사항">전달사항</option>
                <option value="주의사항">주의사항</option>
              </select>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <label htmlFor="note-shift-start" style={getLabelStyle(c)}>
                근무 시작
              </label>
              <input
                id="note-shift-start"
                type="time"
                value={shiftStart}
                onChange={(event) => setShiftStart(event.target.value)}
                style={getInputStyle(c)}
              />
            </div>
            <div>
              <label htmlFor="note-shift-end" style={getLabelStyle(c)}>
                근무 종료
              </label>
              <input
                id="note-shift-end"
                type="time"
                value={shiftEnd}
                onChange={(event) => setShiftEnd(event.target.value)}
                style={getInputStyle(c)}
              />
            </div>
            <div className="flex items-end">
              <div
                className={`mb-0.5 w-full rounded-lg border px-3 py-2.5 text-xs font-semibold ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/70 text-slate-400'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                근무 구간{' '}
                <span className={isDark ? 'text-slate-100' : 'text-slate-900'}>
                  {formatShiftRange(shiftStart, shiftEnd)}
                </span>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="note-content" style={getLabelStyle(c)}>
              인수인계 내용
            </label>
            <textarea
              id="note-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="예) 소성로 2호기 냉각 계통 점검 중이므로 온도 트렌드를 30분 간격으로 확인해주세요."
              style={{ ...getInputStyle(c), minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            style={{
              border: 0,
              borderRadius: 10,
              background: c.blue,
              color: '#fff',
              padding: '11px 18px',
              fontSize: 14,
              fontWeight: 800,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? '등록 중…' : '인수인계 사항 등록'}
          </button>
        </form>

        {notes.length > 0 && (
          <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
            {notes.map((note) => (
              <div
                key={note.id}
                style={{
                  border: `1px solid ${c.line}`,
                  borderRadius: 12,
                  padding: '12px 15px',
                  background: isDark ? '#0f172a' : '#f8fafc',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ ...badgeBase, ...noteCategoryStyle(note.category, isDark) }}>
                      {note.category}
                    </span>
                    <strong style={{ color: c.navy, fontSize: 13 }}>{note.author}</strong>
                    <span style={{ color: c.blue, fontSize: 12, fontWeight: 700 }}>
                      {formatShiftRange(note.shiftStart, note.shiftEnd)}
                    </span>
                    <span style={{ color: c.muted, fontSize: 12 }}>{note.createdAt}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(note.id)}
                    aria-label={`${note.category} 삭제`}
                    style={{
                      border: 0,
                      borderRadius: 8,
                      background: 'transparent',
                      color: c.muted,
                      cursor: 'pointer',
                      fontSize: 17,
                      lineHeight: 1,
                      padding: 4,
                    }}
                  >
                    ×
                  </button>
                </div>
                <p style={{ margin: '8px 0 0', color: c.navy, fontSize: 13, lineHeight: 1.65 }}>
                  {note.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const IssueListSection = ({
  issues,
  totalCount,
  currentPage,
  totalPages,
  pageItems,
  pageInput,
  rangeLabel,
  filters,
  lots,
  selectedId,
  onFilterChange,
  onApplyFilter,
  onResetFilter,
  onPageChange,
  onPageInputChange,
  onPageInputSubmit,
  onSelect,
  onDiagnose,
}: IssueListSectionProps) => {
  const { isDark } = useUiSettings();
  const c = getUiColors(isDark);

  return (
  <section style={getPanelStyle(c)}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ margin: 0, color: c.navy, fontSize: 19 }}>이슈 목록</h2>
        <p style={{ margin: '4px 0 0', color: c.slate, fontSize: 12 }}>
          행 클릭 → 상세 선택 · 「진단」으로 챗봇 자동 진단
        </p>
      </div>
      <span style={{ color: c.slate, fontSize: 13, fontWeight: 700 }}>
        검색 결과 {totalCount}건
      </span>
    </div>
    <form
      className={`mb-5 flex flex-wrap items-end gap-2.5 rounded-xl border p-3 ${
        isDark
          ? 'border-slate-700 bg-slate-900/70'
          : 'border-slate-200/80 bg-slate-50/60'
      }`}
      onSubmit={(event) => {
        event.preventDefault();
        onApplyFilter();
      }}
    >
      <div className="min-w-[180px] flex-1">
        <label htmlFor="issue-search" style={getLabelStyle(c)}>
          검색어
        </label>
        <input
          id="issue-search"
          value={filters.search}
          onChange={(event) => onFilterChange('search', event.target.value)}
          placeholder="제목 또는 LOT 번호"
          style={getFilterControlStyle(c)}
        />
      </div>
      <div className="w-[150px]">
        <label htmlFor="issue-date" style={getLabelStyle(c)}>
          날짜
        </label>
        <DateInput
          id="issue-date"
          value={filters.date}
          onChange={(date) => onFilterChange('date', date)}
          isDark={isDark}
          style={getFilterControlStyle(c)}
          aria-label="날짜"
        />
      </div>
      <div className="min-w-[150px] flex-1">
        <label htmlFor="issue-lot" style={getLabelStyle(c)}>
          LOT
        </label>
        <select
          id="issue-lot"
          value={filters.lot}
          onChange={(event) => onFilterChange('lot', event.target.value)}
          style={getFilterControlStyle(c)}
        >
          <option value="">전체 LOT</option>
          {lots.map((lot) => (
            <option key={lot} value={lot}>
              {lot}
            </option>
          ))}
        </select>
      </div>
      <div className="w-[120px]">
        <label htmlFor="issue-risk" style={getLabelStyle(c)}>
          위험도
        </label>
        <select
          id="issue-risk"
          value={filters.risk}
          onChange={(event) => onFilterChange('risk', event.target.value)}
          style={getFilterControlStyle(c)}
        >
          <option value="">전체 위험도</option>
          <option value="높음">높음</option>
          <option value="중간">중간</option>
          <option value="낮음">낮음</option>
        </select>
      </div>
      <div className="w-[130px]">
        <label htmlFor="issue-status" style={getLabelStyle(c)}>
          처리 상태
        </label>
        <select
          id="issue-status"
          value={filters.status}
          onChange={(event) => onFilterChange('status', event.target.value)}
          style={getFilterControlStyle(c)}
        >
          <option value="">전체 상태</option>
          <option value="접수">접수</option>
          <option value="분석 중">분석 중</option>
          <option value="조치 중">조치 중</option>
          <option value="완료">완료</option>
        </select>
      </div>
      <div className="w-[120px]">
        <label htmlFor="issue-spc" style={getLabelStyle(c)}>
          SPC
        </label>
        <select
          id="issue-spc"
          value={filters.spc}
          onChange={(event) => onFilterChange('spc', event.target.value)}
          style={getFilterControlStyle(c)}
          aria-label="SPC 상태 필터"
        >
          <option value="">전체</option>
          <option value="이상">이상</option>
          <option value="주의">주의</option>
        </select>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="submit"
          className={`inline-flex h-9 items-center rounded-lg px-4 text-xs font-semibold text-white ${
            isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-900 hover:bg-slate-800'
          }`}
        >
          적용하기
        </button>
        <button
          type="button"
          onClick={onResetFilter}
          className={`inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold ${
            isDark
              ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          }`}
        >
          전체보기
        </button>
      </div>
    </form>

    {issues.length === 0 ? (
      <div
        style={{
          padding: '54px 20px',
          borderRadius: 14,
          background: isDark ? '#0f172a' : '#f8fafc',
          color: c.slate,
          textAlign: 'center',
          fontWeight: 700,
        }}
      >
        조건에 맞는 이슈가 없습니다.
      </div>
    ) : (
      <>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead>
            <tr
              className={`border-y text-xs font-semibold ${
                isDark
                  ? 'border-slate-700 bg-slate-900/70 text-slate-400'
                  : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}
            >
              <th className="whitespace-nowrap px-4 py-2.5 font-semibold">이슈 ID</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-semibold">일시</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-semibold">관련 LOT</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-semibold">위험도</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-semibold">처리상태</th>
              <th className="min-w-[280px] px-4 py-2.5 font-semibold">이슈 내용</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">진단</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => {
              const selected = issue.id === selectedId;
              return (
                <tr
                  key={issue.id}
                  onClick={() => onSelect(issue.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(issue.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selected}
                  className={`cursor-pointer border-b border-l-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40 ${
                    isDark ? 'border-slate-700 hover:bg-slate-900/50' : 'border-slate-100 hover:bg-slate-50/80'
                  } ${
                    selected
                      ? isDark
                        ? 'border-l-blue-400 bg-blue-950/30 font-medium'
                        : 'border-l-blue-600 bg-blue-50/70 font-medium'
                      : isDark
                        ? 'border-l-transparent bg-slate-800'
                        : 'border-l-transparent bg-white'
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(issue.id);
                      }}
                      className={`cursor-pointer font-semibold hover:underline ${
                        isDark ? 'text-blue-300' : 'text-blue-600'
                      }`}
                    >
                      {issue.id}
                    </button>
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-xs ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {issue.occurredAt}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-xs font-semibold ${
                      isDark ? 'text-slate-200' : 'text-slate-800'
                    }`}
                  >
                    {issue.lot}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={
                        issue.risk === '높음'
                          ? isDark
                            ? 'inline-flex items-center rounded-full border border-rose-800 bg-rose-950/40 px-2.5 py-0.5 text-xs font-bold text-rose-300'
                            : 'inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700'
                          : issue.risk === '중간'
                            ? isDark
                              ? 'inline-flex items-center rounded-full border border-amber-800 bg-amber-950/40 px-2.5 py-0.5 text-xs font-bold text-amber-300'
                              : 'inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700'
                            : isDark
                              ? 'inline-flex items-center rounded-full border border-emerald-800 bg-emerald-950/40 px-2.5 py-0.5 text-xs font-bold text-emerald-300'
                              : 'inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700'
                      }
                    >
                      {issue.risk}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span style={{ ...statusTagBase, ...statusStyle(issue.status, isDark) }}>
                      {issue.status}
                    </span>
                  </td>
                  <td
                    className={`max-w-[420px] px-4 py-3 text-sm font-semibold ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    <span className="line-clamp-2">{issue.title}</span>
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
                        onDiagnose(issue);
                      }}
                    >
                      챗봇으로 진단
                    </button>
                  </td>
                </tr>
              );
            })}
            {Array.from({ length: Math.max(0, ISSUE_PAGE_SIZE - issues.length) }, (_, index) => (
              <tr
                key={`issue-empty-row-${index}`}
                aria-hidden="true"
                className={isDark ? 'border-b border-slate-700' : 'border-b border-slate-100'}
              >
                <td colSpan={7} className="h-[57px] px-4 py-3">
                  &nbsp;
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className={`mt-3 flex flex-col items-center gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:justify-between ${
          isDark
            ? 'border-slate-700 bg-slate-900/70'
            : 'border-slate-200 bg-slate-50'
        }`}
      >
        <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          {rangeLabel} / 총 {totalCount}건
        </span>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <nav
            aria-label="이슈 목록 페이지"
            className="flex flex-wrap items-center justify-center gap-1.5"
          >
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              isDark
                ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            이전
          </button>
          {pageItems.map((item, index) =>
            item === 'ellipsis' ? (
              <span
                key={`issue-page-ellipsis-${index}`}
                className={`inline-flex min-w-8 items-center justify-center px-1 text-xs ${
                  isDark ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-current={item === currentPage ? 'page' : undefined}
                onClick={() => onPageChange(item)}
                className={`min-w-8 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  item === currentPage
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
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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
              onPageInputSubmit();
            }}
          >
            <label
              htmlFor="issue-page-jump"
              className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
            >
              페이지
            </label>
            <input
              id="issue-page-jump"
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(event) => onPageInputChange(event.target.value)}
              aria-label="이동할 페이지 번호"
              className={`h-8 w-16 rounded-lg border px-2 text-center text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/40 ${
                isDark
                  ? 'border-slate-600 bg-slate-800 text-slate-200'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            />
            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              / {totalPages}
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
      </>
    )}
  </section>
  );
};

const SpcControlChart = ({ metric }: { metric: SpcMetric }) => {
  const { isDark } = useUiSettings();
  const width = 560;
  const height = 240;
  const pad = { top: 28, right: 16, bottom: 36, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const values = metric.data.map((d) => d.value);
  const minVal = Math.min(metric.lowerControlLimit, ...values) - (metric.upperControlLimit - metric.lowerControlLimit) * 0.1;
  const maxVal = Math.max(metric.upperControlLimit, ...values) + (metric.upperControlLimit - metric.lowerControlLimit) * 0.1;
  const range = Math.max(maxVal - minVal, 0.0001);
  const toX = (index: number) => pad.left + (index * innerW) / Math.max(metric.data.length - 1, 1);
  const toY = (value: number) => pad.top + innerH - ((value - minVal) / range) * innerH;
  const linePoints = metric.data.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ');
  const gridStroke = isDark ? '#334155' : '#eef2f7';
  const tickFill = isDark ? '#94a3b8' : '#94a3b8';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full max-h-[260px] min-h-[220px]"
      role="img"
      aria-label={`${metric.label} SPC 관리도`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const value = minVal + range * (1 - ratio);
        const y = pad.top + innerH * ratio;
        return (
          <g key={ratio}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke={gridStroke} />
            <text x={pad.left - 8} y={y + 3} textAnchor="end" fill={tickFill} fontSize="10">
              {formatSpcValue(metric.key, value)}
            </text>
          </g>
        );
      })}
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={toY(metric.upperControlLimit)}
        y2={toY(metric.upperControlLimit)}
        stroke="#ef4444"
        strokeDasharray="5 4"
        strokeWidth="1.5"
      />
      <text x={width - pad.right} y={toY(metric.upperControlLimit) - 4} textAnchor="end" fill="#ef4444" fontSize="10">
        UCL
      </text>
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={toY(metric.centerLine)}
        y2={toY(metric.centerLine)}
        stroke="#94a3b8"
        strokeDasharray="4 4"
        strokeWidth="1.5"
      />
      <text x={width - pad.right} y={toY(metric.centerLine) - 4} textAnchor="end" fill="#64748b" fontSize="10">
        CL
      </text>
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={toY(metric.lowerControlLimit)}
        y2={toY(metric.lowerControlLimit)}
        stroke="#f59e0b"
        strokeDasharray="5 4"
        strokeWidth="1.5"
      />
      <text x={width - pad.right} y={toY(metric.lowerControlLimit) - 4} textAnchor="end" fill="#d97706" fontSize="10">
        LCL
      </text>
      <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={linePoints} />
      {metric.data.map((point, index) => {
        const outOfControl =
          point.value > metric.upperControlLimit || point.value < metric.lowerControlLimit;
        return (
          <g key={`${metric.key}-${point.timestamp}`}>
            <circle
              cx={toX(index)}
              cy={toY(point.value)}
              r={outOfControl ? 4 : 3}
              fill={outOfControl ? '#ef4444' : '#3b82f6'}
            >
              <title>{`${point.timestamp}: ${formatSpcValue(metric.key, point.value)}${metric.unit}`}</title>
            </circle>
            <text
              x={toX(index)}
              y={height - 12}
              textAnchor="middle"
              fill={tickFill}
              fontSize="10"
            >
              {point.timestamp}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const SpcChartCard = ({ metric, isDark }: { metric: SpcMetric; isDark: boolean }) => {
  const c = getUiColors(isDark);
  return (
    <div
      className={`rounded-xl border p-4 ${
        isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <h4 className={`m-0 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
          {metric.label}
        </h4>
        <span className={spcStatusBadgeClass(metric.status, isDark)}>{metric.status}</span>
      </div>
      <p className={`m-0 mb-3 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        현재 {formatSpcValue(metric.key, metric.currentValue)}
        {metric.unit} · UCL {formatSpcValue(metric.key, metric.upperControlLimit)}
        {metric.unit} · CL {formatSpcValue(metric.key, metric.centerLine)}
        {metric.unit} · LCL {formatSpcValue(metric.key, metric.lowerControlLimit)}
        {metric.unit}
      </p>
      <SpcControlChart metric={metric} />
      <p className={`mt-1 text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`} style={{ color: c.muted }}>
        관리 한계 초과 포인트는 빨간색으로 표시됩니다.
      </p>
    </div>
  );
};

function renderHighlightedAnomaly(anomaly: string) {
  const highlightTokens = ['750°C', '3회', '91점'] as const;
  const pattern = new RegExp(
    `(${highlightTokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'g',
  );
  const parts = anomaly.split(pattern);
  return parts.map((part, index) =>
    highlightTokens.includes(part as (typeof highlightTokens)[number]) ? (
      <span key={`${part}-${index}`} className="font-bold text-red-600">
        {part}
      </span>
    ) : (
      <span key={`text-${index}`}>{part}</span>
    ),
  );
}

const DetailAnalysisSection = ({ issue, onDiagnose }: DetailAnalysisSectionProps) => {
  const { isDark } = useUiSettings();
  const c = getUiColors(isDark);

  if (!issue) {
    return (
      <section
        id="issue-detail-analysis"
        style={{ ...getPanelStyle(c), minHeight: 220, display: 'grid', placeItems: 'center' }}
      >
        <div style={{ textAlign: 'center', color: c.slate }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>⌁</div>
          <strong>목록에서 이슈를 선택하면 상세 분석 데이터가 표시됩니다.</strong>
        </div>
      </section>
    );
  }

  const overallSpc = getOverallSpcStatus(issue.spcMetrics);
  const spcCounts = countSpcByStatus(issue.spcMetrics);
  const abnormalSpcMetrics = issue.spcMetrics.filter((metric) => metric.status === '이상');
  // Mock KPI 색상 임계값 (업무 규칙 아님, UI 검증용)
  const residualTone =
    issue.residualLiMargin < 0.12 ? '위험' : issue.residualLiMargin < 0.2 ? '주의' : '양호';
  const defectTone =
    issue.defectProbability >= 60 ? '위험' : issue.defectProbability >= 35 ? '주의' : '양호';

  return (
    <section id="issue-detail-analysis" style={getPanelStyle(c)}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: c.navy, fontSize: 19 }}>이슈 상세 분석</h2>
          <div style={{ marginTop: 6, color: c.slate, fontSize: 13 }}>
            {issue.id} · {issue.lot} · {issue.occurredAt}
          </div>
          <div style={{ marginTop: 8, color: c.navy, fontSize: 14, fontWeight: 600 }}>
            {issue.title}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...badgeBase, ...riskStyle(issue.risk, isDark) }}>위험도 {issue.risk}</span>
          <span className={spcStatusBadgeClass(overallSpc, isDark)}>SPC {overallSpc}</span>
          {onDiagnose ? (
            <button
              type="button"
              onClick={() => onDiagnose(issue)}
              className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold text-white ${
                isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              챗봇으로 진단
            </button>
          ) : null}
        </div>
      </div>

      <div
        style={{
          border: isDark ? '1px solid #b45309' : '1px solid #fed7aa',
          borderLeft: `4px solid ${c.amber}`,
          borderRadius: 12,
          background: c.amberSoft,
          padding: 15,
          color: isDark ? '#fcd34d' : '#92400e',
          fontSize: 14,
          lineHeight: 1.65,
          marginBottom: 16,
        }}
      >
        <strong>이상 징후 요약</strong>
        <div style={{ marginTop: 4 }}>{renderHighlightedAnomaly(issue.anomaly)}</div>
      </div>

      <div
        className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          isDark ? 'border-slate-700 bg-slate-900/50 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}
      >
        <strong className={isDark ? 'text-slate-100' : 'text-slate-800'}>SPC 상태 요약</strong>
        <div className="mt-1">
          이상 {spcCounts.이상} · 주의 {spcCounts.주의} · 안정 {spcCounts.안정}
          <span className={`ml-2 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            (합계 {spcCounts.이상 + spcCounts.주의 + spcCounts.안정}개)
          </span>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          className={`rounded-xl border p-4 ${
            isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-white'
          }`}
        >
          <div className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            잔류 Li 여유
          </div>
          <div
            className={`mt-1 text-2xl font-bold tabular-nums ${
              residualTone === '위험'
                ? 'text-rose-600'
                : residualTone === '주의'
                  ? 'text-amber-600'
                  : 'text-emerald-600'
            }`}
          >
            {issue.residualLiMargin.toFixed(2)}%
          </div>
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            기준 하한까지 남은 여유
          </p>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-white'
          }`}
        >
          <div className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            불량 확률
          </div>
          <div
            className={`mt-1 text-2xl font-bold tabular-nums ${
              defectTone === '위험'
                ? 'text-rose-600'
                : defectTone === '주의'
                  ? 'text-amber-600'
                  : 'text-emerald-600'
            }`}
          >
            {issue.defectProbability.toFixed(1)}%
          </div>
          <div
            className={`mt-2 h-1.5 overflow-hidden rounded-full ${
              isDark ? 'bg-slate-800' : 'bg-slate-100'
            }`}
          >
            <div
              className={`h-full rounded-full ${
                defectTone === '위험'
                  ? 'bg-rose-500'
                  : defectTone === '주의'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, issue.defectProbability))}%` }}
            />
          </div>
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {defectTone === '위험'
              ? '높은 불량 가능성'
              : defectTone === '주의'
                ? '중간 수준의 불량 가능성'
                : '낮은 불량 가능성'}
          </p>
        </div>
      </div>
      <p className={`mb-5 text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        현재 값은 화면 검증을 위한 Mock 데이터입니다.
      </p>

      <div className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className={`m-0 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              SPC 이상 항목 분석
            </h3>
            <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              9개 항목 중 {abnormalSpcMetrics.length}개 이상 감지
            </p>
          </div>
        </div>
        {abnormalSpcMetrics.length === 0 ? (
          <div
            className={`rounded-xl border px-4 py-8 text-center text-sm ${
              isDark
                ? 'border-slate-700 bg-slate-900/40 text-slate-400'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            <p className="m-0 font-medium">이 이슈에서 관리 한계를 벗어난 SPC 항목이 없습니다.</p>
            {spcCounts.주의 > 0 ? (
              <p className="mt-2 mb-0 text-xs">
                주의 항목은 존재하지만, 현재 화면은 이상 항목만 표시합니다.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {abnormalSpcMetrics.map((metric) => (
              <SpcChartCard key={metric.key} metric={metric} isDark={isDark} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const ManagementSection = ({
  issue,
  form,
  message,
  canSave,
  isSaving = false,
  onChange,
  onSave,
}: ManagementSectionProps) => {
  const { isDark } = useUiSettings();
  const c = getUiColors(isDark);
  const saveDisabled = !issue || !canSave || isSaving;

  return (
  <section style={getPanelStyle(c)}>
    <h2 style={{ margin: '0 0 6px', color: c.navy, fontSize: 19 }}>이슈 처리 관리</h2>
    <p style={{ margin: '0 0 20px', color: c.slate, fontSize: 13 }}>
      {issue ? `${issue.id}의 담당자와 처리 현황을 관리합니다.` : '관리할 이슈를 먼저 선택해주세요.'}
    </p>
    {message && (
      <div
        role="status"
        style={{
          border: isDark ? '1px solid #047857' : '1px solid #86efac',
          borderRadius: 10,
          background: c.greenSoft,
          color: isDark ? '#6ee7b7' : '#166534',
          padding: '11px 13px',
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        ✓ {message}
      </div>
    )}
    <form onSubmit={onSave}>
      <fieldset disabled={!issue} style={{ border: 0, margin: 0, padding: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <label htmlFor="manager-assignee" style={getLabelStyle(c)}>담당자</label>
            <input
              id="manager-assignee"
              value={form.assignee}
              readOnly
              title="저장 시 현재 로그인 사용자가 담당자로 지정됩니다."
              placeholder="저장 시 자동 지정"
              style={{ ...getInputStyle(c), cursor: 'default' }}
            />
          </div>
          <div>
            <label htmlFor="manager-status" style={getLabelStyle(c)}>처리 상태</label>
            <select
              id="manager-status"
              value={form.status}
              onChange={(event) => onChange('status', event.target.value as Issue['status'])}
              style={getInputStyle(c)}
            >
              <option value="접수">접수</option>
              <option value="분석 중">분석 중</option>
              <option value="조치 중">조치 중</option>
              <option value="완료">완료</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="manager-action" style={getLabelStyle(c)}>조치 내용</label>
          <textarea
            id="manager-action"
            value={form.action}
            onChange={(event) => onChange('action', event.target.value)}
            placeholder="분석 내용과 조치 사항을 입력해주세요."
            style={{ ...getInputStyle(c), minHeight: 110, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: c.navy,
            fontSize: 14,
            fontWeight: 700,
            cursor: issue ? 'pointer' : 'not-allowed',
            marginBottom: 20,
          }}
        >
          <input
            type="checkbox"
            checked={form.completed}
            onChange={(event) => onChange('completed', event.target.checked)}
            style={{ width: 18, height: 18, accentColor: c.blue, cursor: 'pointer' }}
          />
          조치 완료 여부
        </label>
        <button
          type="submit"
          disabled={saveDisabled}
          style={{
            width: '100%',
            border: 0,
            borderRadius: 11,
            padding: '12px 18px',
            fontSize: 14,
            cursor: !saveDisabled ? 'pointer' : 'not-allowed',
          }}
          className="bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:hover:bg-gray-300"
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>
      </fieldset>
    </form>
  </section>
  );
};

const EMPTY_FORM: ManagementForm = {
  assignee: '',
  status: '접수',
  action: '',
  completed: false,
};

const EMPTY_FILTERS: FilterState = {
  search: '',
  date: '',
  lot: '',
  risk: '',
  status: '',
  spc: '',
};

const ISSUE_PAGE_SIZE = 5;

function buildPaginationItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'ellipsis', total];
  if (current >= total - 3) {
    return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}

const HANDOVER_ACTION_STORAGE_KEY = 'handover_action_logs';

/** Clear legacy localStorage handover logs once (Knowledge now uses DB). */
function clearLegacyHandoverActionLogs() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(HANDOVER_ACTION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export default function IssuePage() {
  const { isDark } = useUiSettings();
  const { connectLot } = useSelectedLot();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [managementForm, setManagementForm] = useState<ManagementForm>(EMPTY_FORM);
  const [reportNotice, setReportNotice] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [handoverNotes, setHandoverNotes] = useState<HandoverNote[]>([]);
  const [completedHandoverNoteIds, setCompletedHandoverNoteIds] = useState<number[]>([]);
  const prevSelectedIdRef = useRef<string | null>(null);
  const detailRequestRef = useRef(0);

  useEffect(() => {
    clearLegacyHandoverActionLogs();
  }, []);

  const refreshPendingHandovers = async () => {
    try {
      const { data } = await issueApi.listHandoverHistory('pending');
      setHandoverNotes(data.items.map(mapHandoverItemToNote));
    } catch {
      /* keep current notes on transient errors */
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadIssues = async () => {
      try {
        const { data } = await issueApi.list();
        if (!cancelled) {
          setIssues(data.issues.map(mapIssueListItem));
        }
      } catch (error) {
        if (cancelled) return;
        setIssues([]);
        setToastMessage(getApiErrorMessage(error, '이슈 목록을 불러오지 못했습니다.'));
        setShowToast(true);
      }
    };

    void loadIssues();
    void refreshPendingHandovers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isNoteOpen && !isReportOpen) return;
    void refreshPendingHandovers();
  }, [isNoteOpen, isReportOpen]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshPendingHandovers();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedId) ?? null,
    [issues, selectedId],
  );

  const lots = useMemo(
    () => Array.from(new Set(issues.map((issue) => issue.lot))).sort(),
    [issues],
  );

  const filteredIssues = useMemo(() => {
    const keyword = appliedFilters.search.trim().toLowerCase();
    return issues.filter((issue) => {
      // 완료 이슈는 백엔드의 미완료 목록 정책과 동일하게 표시하지 않음
      if (isIssueCompleted(issue)) return false;

      const overallSpc = getOverallSpcStatus(issue.spcMetrics);

      const matchesSearch =
        !keyword ||
        issue.id.toLowerCase().includes(keyword) ||
        issue.title.toLowerCase().includes(keyword) ||
        issue.lot.toLowerCase().includes(keyword);
      const matchesDate = !appliedFilters.date || issue.date === appliedFilters.date;
      const matchesLot = !appliedFilters.lot || issue.lot === appliedFilters.lot;
      const matchesRisk = !appliedFilters.risk || issue.risk === appliedFilters.risk;
      const matchesStatus = !appliedFilters.status || issue.status === appliedFilters.status;
      const matchesSpc = !appliedFilters.spc || overallSpc === appliedFilters.spc;
      return (
        matchesSearch &&
        matchesDate &&
        matchesLot &&
        matchesRisk &&
        matchesStatus &&
        matchesSpc
      );
    });
  }, [appliedFilters, issues]);

  const totalPages = Math.max(1, Math.ceil(filteredIssues.length / ISSUE_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedIssues = useMemo(() => {
    const start = (safePage - 1) * ISSUE_PAGE_SIZE;
    return filteredIssues.slice(start, start + ISSUE_PAGE_SIZE);
  }, [filteredIssues, safePage]);
  const pageItems = useMemo(
    () => buildPaginationItems(safePage, totalPages),
    [safePage, totalPages],
  );
  const pageRangeStart =
    filteredIssues.length === 0 ? 0 : (safePage - 1) * ISSUE_PAGE_SIZE + 1;
  const pageRangeEnd = Math.min(safePage * ISSUE_PAGE_SIZE, filteredIssues.length);
  const pageRangeLabel = `${pageRangeStart}–${pageRangeEnd}`;

  useEffect(() => {
    if (!selectedId) return;
    if (!filteredIssues.some((issue) => issue.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredIssues, selectedId]);

  const canSave = useMemo(() => {
    if (!selectedIssue) return false;
    return (
      managementForm.status !== selectedIssue.status ||
      managementForm.completed !== selectedIssue.completed ||
      managementForm.assignee !== selectedIssue.assignee ||
      managementForm.action !== selectedIssue.action
    );
  }, [managementForm, selectedIssue]);

  // 행 선택이 바뀔 때만 폼을 채움
  useEffect(() => {
    if (selectedId === prevSelectedIdRef.current) return;
    prevSelectedIdRef.current = selectedId;

    if (!selectedId) {
      setManagementForm(EMPTY_FORM);
      setSaveMessage('');
      return;
    }

    const issue = issues.find((item) => item.id === selectedId);
    if (!issue) {
      setManagementForm(EMPTY_FORM);
      setSaveMessage('');
      return;
    }

    setManagementForm({
      assignee: issue.assignee,
      status: issue.status,
      action: issue.action,
      completed: issue.completed,
    });
    setSaveMessage('');
  }, [selectedId, issues]);

  useEffect(() => {
    if (!reportNotice) return;
    const timer = window.setTimeout(() => setReportNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [reportNotice]);

  useEffect(() => {
    if (!saveMessage) return;
    const timer = window.setTimeout(() => setSaveMessage(''), 2800);
    return () => window.clearTimeout(timer);
  }, [saveMessage]);

  useEffect(() => {
    if (!showToast) return;
    const timer = window.setTimeout(() => setShowToast(false), 2500);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  const handleSelectIssue = async (id: string) => {
    const requestId = ++detailRequestRef.current;
    setSelectedId(id);
    window.setTimeout(() => {
      document
        .getElementById('issue-detail-analysis')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);

    try {
      const { data } = await issueApi.getById(id);
      if (requestId !== detailRequestRef.current) return;
      setIssues((current) =>
        current.map((issue) => (issue.id === id ? mergeIssueDetail(issue, data.issue) : issue)),
      );
      setManagementForm({
        assignee: data.issue.assigneeName?.trim() || '미배정',
        status: data.issue.status,
        action: data.issue.actionContent ?? '',
        completed: data.issue.completed,
      });
      setSaveMessage('');
    } catch (error) {
      if (requestId !== detailRequestRef.current) return;
      setToastMessage(getApiErrorMessage(error, '이슈 상세를 불러오지 못했습니다.'));
      setShowToast(true);
    }
  };

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  };

  const handlePageChange = (page: number) => {
    const nextPage = Math.min(totalPages, Math.max(1, Math.trunc(page)));
    setCurrentPage(nextPage);
    setPageInput(String(nextPage));
  };

  const handlePageInputSubmit = () => {
    const requestedPage = Number(pageInput);
    if (!Number.isFinite(requestedPage)) {
      setPageInput(String(safePage));
      return;
    }
    handlePageChange(requestedPage);
  };

  const handleApplyFilter = () => {
    setAppliedFilters(draftFilters);
    setCurrentPage(1);
    setPageInput('1');
  };

  /** 메인 위험 LOT Top과 동일 — 챗봇 패널 오픈 + 자동 O/X 진단 */
  const handleDiagnoseIssue = (issue: Issue) => {
    connectLot(issueToLotSensorRecord(issue), { openChat: true, diagnose: true });
    setSelectedId(issue.id);
    setToastMessage(`${issue.lot} 연결 · 챗봇 진단 시작`);
    setShowToast(true);
  };

  const handleResetFilter = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setCurrentPage(1);
    setPageInput('1');
  };

  const handleFormChange = <K extends keyof ManagementForm>(
    key: K,
    value: ManagementForm[K],
  ) => {
    setManagementForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'completed' && value === true) next.status = '완료';
      if (key === 'completed' && value === false && current.status === '완료') {
        next.status = '조치 중';
      }
      if (key === 'status' && value !== '완료') next.completed = false;
      if (key === 'status' && value === '완료') next.completed = true;
      return next;
    });
    setSaveMessage('');
  };

  const handleAddNote = async (note: Omit<HandoverNote, 'id' | 'createdAt' | 'issueId'>) => {
    try {
      await issueApi.createHandover({
        category: note.category,
        content: note.content,
        shiftStart: note.shiftStart,
        shiftEnd: note.shiftEnd,
      });
      await refreshPendingHandovers();
      setToastMessage('✓ 인수인계 사항이 등록되었습니다. (ISS 번호 자동 발급)');
      setShowToast(true);
    } catch (error) {
      throw new Error(getApiErrorMessage(error, '인수인계 등록에 실패했습니다.'));
    }
  };

  const handleCompleteOneHandover = async (
    noteId: number,
    party: { from: string; to: string },
  ) => {
    void party;
    try {
      await issueApi.completeHandover(noteId);
      await refreshPendingHandovers();
      setCompletedHandoverNoteIds((current) =>
        current.includes(noteId) ? current : [...current, noteId],
      );
      setToastMessage('✓ 인수인계 사항을 완료 처리했습니다. Knowledge에서 확인할 수 있습니다.');
      setShowToast(true);
    } catch (error) {
      setToastMessage(getApiErrorMessage(error, '인수인계 완료 처리에 실패했습니다.'));
      setShowToast(true);
    }
  };

  const handleCompleteAllHandover = async (party: { from: string; to: string }) => {
    void party;
    const pending = handoverNotes.filter((note) => !completedHandoverNoteIds.includes(note.id));
    if (pending.length === 0) return;
    try {
      for (const note of pending) {
        await issueApi.completeHandover(note.id);
      }
      await refreshPendingHandovers();
      setCompletedHandoverNoteIds((current) => {
        const next = new Set(current);
        pending.forEach((note) => next.add(note.id));
        return Array.from(next);
      });
      setToastMessage('✓ 대기 중인 인수인계를 모두 완료 처리했습니다.');
      setShowToast(true);
    } catch (error) {
      await refreshPendingHandovers();
      setToastMessage(getApiErrorMessage(error, '인수인계 일괄 완료에 실패했습니다.'));
      setShowToast(true);
    }
  };

  const handleRemoveNote = (_id: number) => {
    setToastMessage('등록된 인수인계는 서버에서 삭제할 수 없습니다.');
    setShowToast(true);
  };

  const handleGenerateReport = () => {
    console.log('인수인계 보고서 생성 데이터:', {
      ...HANDOVER_DATA,
      openIssues: issues.filter((issue) => !issue.completed),
      handoverNotes,
    });
    setReportNotice('인수인계 보고서 생성 요청이 완료되었습니다.');
    setIsReportOpen(true);
  };

  const handleDownloadPdf = () => {
    const data = HANDOVER_DATA;
    const openIssues = issues.filter((issue) => !issue.completed);
    const riskColor = (risk: Issue['risk']) =>
      risk === '높음' ? colors.red : risk === '중간' ? colors.amber : colors.green;
    const noteColor = (category: HandoverNote['category']) =>
      category === '주의사항' ? colors.red : category === '전달사항' ? colors.blue : colors.amber;

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>공정 이슈 인수인계 보고서</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif; color: ${colors.navy}; padding: 32px; }
  h1 { font-size: 22px; text-align: center; margin: 0 0 6px; }
  .period { text-align: center; color: ${colors.slate}; font-size: 13px; margin-bottom: 28px; }
  h2 { font-size: 15px; margin: 24px 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid ${colors.line}; padding: 8px 12px; font-size: 13px; text-align: left; }
  th { background: #f8fafc; color: ${colors.slate}; white-space: nowrap; }
  .issue { border: 1px solid ${colors.line}; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; }
  .meta { color: ${colors.slate}; font-size: 12px; margin-top: 4px; }
  .action { font-size: 13px; margin-top: 4px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>공정 이슈 인수인계 보고서</h1>
<div class="period">대상 기간: ${data.period}</div>
<h2>1. 공정 요약</h2>
<table>
  <tr><th>평균 온도</th><td>${data.averageTemperature}°C</td><th>평균 압력</th><td>${data.averagePressure} bar</td><th>평균 습도</th><td>${data.averageHumidity}%</td></tr>
  <tr><th>AI 예측 위험</th><td>${data.aiRiskPredictions}건</td><th>위험 LOT</th><td>${data.riskyLots}개</td><th>발생 이슈</th><td>${data.issueCount}건</td></tr>
</table>
<h2>2. 미완료 이슈 (${openIssues.length}건)</h2>
<table>
  <tr><th>이슈 ID</th><th>발생일시</th><th>LOT</th><th>위험도</th><th>상태</th><th>담당자</th></tr>
  ${openIssues.length === 0
        ? '<tr><td colspan="6" style="text-align:center;">미완료 이슈가 없습니다.</td></tr>'
        : openIssues
          .map(
            (issue) =>
              `<tr><td>${issue.id}</td><td>${issue.occurredAt}</td><td>${issue.lot}</td><td style="color:${riskColor(issue.risk)};font-weight:800;">${issue.risk}</td><td>${issue.status}</td><td>${issue.assignee}</td></tr>`,
          )
          .join('')
      }
</table>
<h2>3. 인수인계 특이사항 (${handoverNotes.length}건)</h2>
${handoverNotes.length === 0
        ? '<div class="issue" style="text-align:center;color:#475569;">등록된 인수인계 특이사항이 없습니다.</div>'
        : handoverNotes
          .map(
            (note) =>
              `<div class="issue" style="border-left:4px solid ${noteColor(note.category)};"><strong>[${note.category}] ${note.author}</strong><div class="meta">${formatShiftRange(note.shiftStart, note.shiftEnd)} · ${note.createdAt}</div><div class="action">${note.content}</div></div>`,
          )
          .join('')
      }
<h2>4. 전체 이슈 처리 현황 (${issues.length}건)</h2>
${issues
        .map(
          (issue) =>
            `<div class="issue" style="border-left:4px solid ${riskColor(issue.risk)};"><strong>[${issue.id}] ${issue.title}</strong> — ${issue.status}<div class="meta">${issue.occurredAt} · ${issue.lot} · 담당 ${issue.assignee}</div>${issue.action ? `<div class="action">조치: ${issue.action}</div>` : ''}</div>`,
        )
        .join('')}
<script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      setReportNotice('팝업이 차단되어 PDF 창을 열 수 없습니다. 팝업 허용 후 다시 시도해주세요.');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    console.log('인수인계 보고서 PDF 다운로드 요청:', {
      ...data,
      issueTotal: issues.length,
      noteTotal: handoverNotes.length,
    });
  };

  const handleDownloadCsv = () => {
    const data = HANDOVER_DATA;
    const COLUMN_COUNT = 9;
    const escapeCsv = (value: string | number) => {
      const text = String(value).replace(/"/g, '""').replace(/\r?\n/g, ' ');
      return `"${text}"`;
    };
    // 모든 행의 열 개수를 동일하게 맞춰 파서 호환성을 확보
    const toRow = (cells: (string | number)[]) => {
      const padded = [...cells];
      while (padded.length < COLUMN_COUNT) padded.push('');
      return padded.map(escapeCsv).join(',');
    };

    const lines: string[] = [
      toRow(['공정 이슈 인수인계 보고서']),
      toRow(['대상 기간', data.period]),
      toRow([]),
      toRow(['1. 공정 요약']),
      toRow(['평균 온도(°C)', '평균 압력(bar)', '평균 습도(%)', 'AI 예측 위험(건)', '위험 LOT(개)', '발생 이슈(건)']),
      toRow([
        data.averageTemperature,
        data.averagePressure,
        data.averageHumidity,
        data.aiRiskPredictions,
        data.riskyLots,
        data.issueCount,
      ]),
      toRow([]),
      toRow(['2. 인수인계 특이사항']),
      toRow(['구분', '작성자', '근무 시간', '작성 시각', '내용']),
      ...(handoverNotes.length === 0
        ? [toRow(['등록된 인수인계 특이사항이 없습니다.'])]
        : handoverNotes.map((note) =>
          toRow([
            note.category,
            note.author,
            formatShiftRange(note.shiftStart, note.shiftEnd),
            note.createdAt,
            note.content,
          ]),
        )),
      toRow([]),
      toRow(['3. 전체 이슈 처리 현황']),
      toRow(['이슈 ID', '발생일시', 'LOT', '위험도', '처리 상태', '담당자', '제목', '조치 내용', '완료 여부']),
      ...issues.map((issue) =>
        toRow([
          issue.id,
          issue.occurredAt,
          issue.lot,
          issue.risk,
          issue.status,
          issue.assignee,
          issue.title,
          issue.action,
          issue.completed ? '완료' : '미완료',
        ]),
      ),
    ];

    // BOM을 붙여 Excel에서 한글이 깨지지 않도록 처리
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `handover_report_${data.period.slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // 다운로드가 시작되기 전에 URL이 해제되지 않도록 지연 후 정리
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    console.log('인수인계 보고서 CSV 다운로드 요청:', {
      ...data,
      issueTotal: issues.length,
      noteTotal: handoverNotes.length,
    });
  };

  const handleCompleteIssue = async () => {
    if (!selectedIssue || !managementForm.completed || isSaving) return;

    const issueId = selectedIssue.id;
    const loginName = getLoggedInUserName();
    const handoverFrom =
      handoverNotes
        .map((n) => n.author.trim())
        .find((name) => name && name !== UNAUTH_USER_LABEL) ||
      (loginName !== UNAUTH_USER_LABEL ? loginName : '');
    const handoverTo = loginName !== UNAUTH_USER_LABEL ? loginName : '';

    setIsSaving(true);
    try {
      await issueApi.update(issueId, {
        status: '완료',
        actionContent: managementForm.action.trim() || null,
        completed: true,
        handoverFrom: handoverFrom || null,
        handoverTo: handoverTo || null,
      });
      setIssues((current) => current.filter((issue) => issue.id !== issueId));
      const nextTotalPages = Math.max(
        1,
        Math.ceil(Math.max(0, filteredIssues.length - 1) / ISSUE_PAGE_SIZE),
      );
      const nextPage = Math.min(safePage, nextTotalPages);
      setCurrentPage(nextPage);
      setPageInput(String(nextPage));
      setSelectedId(null);
      setSaveMessage('');
      setToastMessage('✓ 이슈가 완료 처리되어 목록에서 제거되었습니다.');
      setShowToast(true);
      void refreshPendingHandovers();
    } catch (error) {
      setToastMessage(getApiErrorMessage(error, '이슈 완료 처리에 실패했습니다.'));
      setShowToast(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedIssue || !canSave || isSaving) return;

    if (managementForm.completed) {
      await handleCompleteIssue();
      return;
    }

    setIsSaving(true);
    try {
      const { data } = await issueApi.update(selectedIssue.id, {
        status: managementForm.status,
        actionContent: managementForm.action.trim() || null,
        completed: false,
      });
      const savedIssue = mergeIssueDetail(selectedIssue, data.issue);
      setIssues((current) =>
        current.map((issue) => (issue.id === selectedIssue.id ? savedIssue : issue)),
      );
      setManagementForm({
        assignee: savedIssue.assignee,
        status: savedIssue.status,
        action: savedIssue.action,
        completed: savedIssue.completed,
      });
      setSaveMessage(data.message || '이슈 처리 내역이 저장되었습니다.');
      setToastMessage('✓ 이슈 처리 내역이 성공적으로 저장되었습니다.');
      setShowToast(true);
    } catch (error) {
      setToastMessage(getApiErrorMessage(error, '이슈 처리 내역 저장에 실패했습니다.'));
      setShowToast(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={
        isDark
          ? 'h-full overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800'
          : 'h-full overflow-y-auto bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50'
      }
      style={{
        boxSizing: 'border-box',
        color: isDark ? '#f8fafc' : colors.navy,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif",
      }}
    >
      <div className={`${SHELL_CONTENT_CLASS} py-6 pb-14`}>
        <HeaderHandoverSection
          data={HANDOVER_DATA}
          notice={reportNotice}
          onGenerate={handleGenerateReport}
          onWrite={() => setIsNoteOpen(true)}
          onCloseNotice={() => setReportNotice('')}
        />
        <div style={{ display: 'grid', gap: 22, marginTop: 22 }}>
          <IssueListSection
            issues={paginatedIssues}
            totalCount={filteredIssues.length}
            currentPage={safePage}
            totalPages={totalPages}
            pageItems={pageItems}
            pageInput={pageInput}
            rangeLabel={pageRangeLabel}
            filters={draftFilters}
            lots={lots}
            selectedId={selectedId}
            onFilterChange={handleFilterChange}
            onApplyFilter={handleApplyFilter}
            onResetFilter={handleResetFilter}
            onPageChange={handlePageChange}
            onPageInputChange={setPageInput}
            onPageInputSubmit={handlePageInputSubmit}
            onSelect={handleSelectIssue}
            onDiagnose={handleDiagnoseIssue}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)',
              gap: 22,
              alignItems: 'start',
            }}
          >
            <DetailAnalysisSection issue={selectedIssue} onDiagnose={handleDiagnoseIssue} />
            <ManagementSection
              issue={selectedIssue}
              form={managementForm}
              message={saveMessage}
              canSave={canSave}
              isSaving={isSaving}
              onChange={handleFormChange}
              onSave={handleSave}
            />
          </div>
        </div>
      </div>
      {isNoteOpen && (
        <HandoverNoteSection
          notes={handoverNotes}
          onAdd={handleAddNote}
          onRemove={handleRemoveNote}
          onClose={() => setIsNoteOpen(false)}
        />
      )}
      {isReportOpen && (
        <HandoverReportModal
          data={HANDOVER_DATA}
          issues={issues}
          notes={handoverNotes}
          completedNoteIds={completedHandoverNoteIds}
          onClose={() => setIsReportOpen(false)}
          onDownloadPdf={handleDownloadPdf}
          onDownloadCsv={handleDownloadCsv}
          onCompleteOne={handleCompleteOneHandover}
          onCompleteAll={handleCompleteAllHandover}
        />
      )}
      {showToast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[120] max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg sm:left-auto sm:right-6 sm:translate-x-0"
          style={{ animation: 'issue-toast-fade-in 0.25s ease-out' }}
        >
          {toastMessage}
        </div>
      ) : null}
      <style>{`
        @keyframes issue-toast-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};