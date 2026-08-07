'use client'

import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  issueApi,
  normalizeIssueRiskLevel,
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
import { useShellRefresh } from '@/hooks/useShellRefresh';

interface ProcessData {
  time: string;
  temperature: number;
  pressure: number;
  humidity: number;
  riskBefore: number;
  riskAfter: number;
}

type SpcStatus = '이상' | '주의' | '안정';

interface Issue {
  id: string;
  createdAt: string;
  date: string;
  lot: string;
  risk: '심각' | '주의' | '안정';
  issueContent: string;
  assignee: string;
  action: string;
  completed: boolean;
  /** analysis_lots (상세 API). 목록만이면 null */
  analysis: {
    lotId: string;
    probability: number | null;
    spcStatus: string | null;
    riskLevel: '심각' | '주의' | '안정';
    riskReason: string | null;
    createdAt: string | null;
  } | null;
  /** 목록 SPC 필터용 (analysis_lots.spc_status) */
  listSpcStatus: string | null;
  /** 챗봇 connectLot용 — 공정 시계열 API 전 placeholder */
  processData: ProcessData[];
}

interface FilterState {
  search: string;
  date: string;
  lot: string;
  risk: '' | Issue['risk'];
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
  isRefreshing?: boolean;
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
}

interface HandoverNoteSectionProps {
  notes: HandoverNote[];
  onAdd: (note: Omit<HandoverNote, 'id' | 'createdAt'>) => void | Promise<void>;
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
  if (risk === '심각' || risk === ('높음' as Issue['risk'])) {
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
  if (risk === '주의' || risk === ('중간' as Issue['risk'])) {
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

function isIssueCompleted(issue: Pick<Issue, 'completed'>) {
  return issue.completed;
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

function mapAnalysisSpcToFilter(spcStatus: string | null | undefined): SpcStatus {
  const raw = (spcStatus || '').trim();
  if (!raw) return '안정';
  if (raw.includes('이탈') || raw.includes('이상')) return '이상';
  if (raw.includes('주의')) return '주의';
  return '안정';
}

function formatAnalysisProbability(probability: number | null | undefined): {
  pct: number;
  label: string;
} {
  if (probability == null || Number.isNaN(Number(probability))) {
    return { pct: 0, label: '—' };
  }
  const n = Number(probability);
  const pct = n <= 1 ? n * 100 : n;
  const clamped = Math.max(0, Math.min(100, pct));
  return { pct: clamped, label: `${pct.toFixed(1)}%` };
}

const EMPTY_PROCESS_DATA: ProcessData[] = [];

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
  const timePart = issue.createdAt.includes(' ')
    ? issue.createdAt.split(' ')[1] ?? '00:00'
    : '00:00';
  const hour = timePart.length >= 5 ? timePart.slice(0, 5) : timePart;
  const riskBoost = issue.risk === '심각' ? 1 : issue.risk === '주의' ? 0.5 : 0;

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

/** 목록 API → UI. 담당자·조치·analysis는 상세 API에서 채움. */
function mapIssueListItem(item: IssueApiListItem): Issue {
  return {
    id: item.issueId,
    createdAt: item.createdAt,
    date: item.createdAt.slice(0, 10),
    lot: item.lotId,
    risk: normalizeIssueRiskLevel(item.riskLevel),
    issueContent: item.issueContent,
    assignee: '미배정',
    action: '',
    completed: false,
    analysis: null,
    listSpcStatus: item.spcStatus ?? null,
    processData: EMPTY_PROCESS_DATA,
  };
}

function mergeIssueDetail(issue: Issue, detail: IssueApiDetail): Issue {
  const analysis = detail.analysis
    ? {
        lotId: detail.analysis.lotId,
        probability: detail.analysis.probability,
        spcStatus: detail.analysis.spcStatus,
        riskLevel: normalizeIssueRiskLevel(detail.analysis.riskLevel),
        riskReason: detail.analysis.riskReason,
        createdAt: detail.analysis.createdAt,
      }
    : null;

  return {
    ...issue,
    id: detail.issueId,
    createdAt: detail.createdAt,
    date: detail.createdAt.slice(0, 10),
    lot: detail.lotId,
    risk: normalizeIssueRiskLevel(detail.riskLevel),
    issueContent: detail.issueContent,
    assignee: detail.assigneeName?.trim() || '미배정',
    action: detail.actionContent ?? '',
    completed: detail.completed,
    analysis,
    listSpcStatus: detail.analysis?.spcStatus ?? detail.spcStatus ?? issue.listSpcStatus,
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
  const completedCount = issues.filter((issue) => issue.completed).length;
  const openIssues = issues.filter((issue) => !issue.completed);
  const criticalOpenIssues = openIssues
    .filter((issue) => issue.risk === '심각')
    .concat(openIssues.filter((issue) => issue.risk !== '심각'))
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
                    <span className="font-medium">{issue.issueContent}</span>
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
    author: item.handoverFrom || '',
    category,
    content: item.handoverContent,
    createdAt: item.createdAt || item.archivedAt || '',
  };
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
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!author.trim() || author === UNAUTH_USER_LABEL) {
      setError('로그인 사용자 정보를 확인할 수 없습니다.');
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
                작성자
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
  isRefreshing = false,
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
        {isRefreshing ? '목록 불러오는 중…' : `검색 결과 ${totalCount}건`}
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
          <option value="심각">심각</option>
          <option value="주의">주의</option>
          <option value="안정">안정</option>
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
                    {issue.createdAt}
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
                        issue.risk === '심각'
                          ? isDark
                            ? 'inline-flex items-center rounded-full border border-rose-800 bg-rose-950/40 px-2.5 py-0.5 text-xs font-bold text-rose-300'
                            : 'inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700'
                          : issue.risk === '주의'
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
                  <td
                    className={`max-w-[420px] px-4 py-3 text-sm font-semibold ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    <span className="line-clamp-2">{issue.issueContent}</span>
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
                <td colSpan={6} className="h-[57px] px-4 py-3">
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

function renderHighlightedAnomaly(anomaly: string) {
  return anomaly;
}

const DetailAnalysisSection = ({ issue, onDiagnose }: DetailAnalysisSectionProps) => {
  const { isDark } = useUiSettings();
  const c = getUiColors(isDark);

  if (!issue) {
    return (
      <section
        id="issue-detail-analysis"
        style={{
          ...getPanelStyle(c),
          height: '100%',
          minHeight: 220,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <div style={{ textAlign: 'center', color: c.slate }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>⌁</div>
          <strong>목록에서 이슈를 선택하면 상세 분석 데이터가 표시됩니다.</strong>
        </div>
      </section>
    );
  }

  const analysis = issue.analysis;
  const spcFilter = mapAnalysisSpcToFilter(analysis?.spcStatus ?? issue.listSpcStatus);
  const risk = analysis?.riskLevel ?? issue.risk;
  const { pct: probPct, label: probLabel } = formatAnalysisProbability(analysis?.probability ?? null);
  const defectTone = !analysis || analysis.probability == null
    ? '미정'
    : probPct >= 80
      ? '위험'
      : probPct >= 40
        ? '주의'
        : '양호';
  const reason = analysis?.riskReason?.trim() || '';

  const fieldRows: Array<{ key: string; label: string; value: string }> = [
    { key: 'lot_id', label: 'lot_id', value: analysis?.lotId || issue.lot || '—' },
    { key: 'risk_level', label: 'risk_level', value: risk },
    {
      key: 'spc_status',
      label: 'spc_status',
      value: analysis?.spcStatus?.trim() || issue.listSpcStatus?.trim() || '—',
    },
    {
      key: 'probability',
      label: 'probability',
      value:
        analysis?.probability == null
          ? '—'
          : `${analysis.probability} (${probLabel})`,
    },
    {
      key: 'risk_reason',
      label: 'risk_reason',
      value: reason || '—',
    },
    {
      key: 'created_at',
      label: 'created_at',
      value: analysis?.createdAt || '—',
    },
  ];

  const cardClass = isDark
    ? 'rounded-xl border border-slate-700 bg-slate-900/40 p-4'
    : 'rounded-xl border border-slate-200 bg-white p-4';
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const strong = isDark ? 'text-slate-100' : 'text-slate-900';

  return (
    <section id="issue-detail-analysis" style={{ ...getPanelStyle(c), height: '100%' }}>
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
            {issue.id} · {issue.lot} · {issue.createdAt}
          </div>
          <div style={{ marginTop: 8, color: c.navy, fontSize: 14, fontWeight: 600 }}>
            {issue.issueContent}
          </div>
          <div style={{ marginTop: 6, color: c.slate, fontSize: 11 }}>
            소스: analysis_lots (시각화 초안 · 상세 목적은 후속 정의)
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...badgeBase, ...riskStyle(risk, isDark) }}>위험도 {risk}</span>
          <span className={spcStatusBadgeClass(spcFilter, isDark)}>
            SPC {analysis?.spcStatus?.trim() || spcFilter}
          </span>
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

      {!analysis ? (
        <div
          className={`rounded-xl border px-4 py-10 text-center text-sm ${
            isDark
              ? 'border-slate-700 bg-slate-900/40 text-slate-400'
              : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}
        >
          <p className="m-0 font-medium">analysis_lots 행이 없거나 아직 불러오는 중입니다.</p>
          <p className="mt-2 mb-0 text-xs">이슈를 다시 선택하거나 LOT 채점 데이터를 확인하세요.</p>
        </div>
      ) : (
        <>
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
            <strong>risk_reason</strong>
            <div style={{ marginTop: 4 }}>
              {reason ? renderHighlightedAnomaly(reason) : '위험 원인 문구가 비어 있습니다.'}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={cardClass}>
              <div className={`text-xs font-semibold ${muted}`}>probability</div>
              <div
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  defectTone === '위험'
                    ? 'text-rose-600'
                    : defectTone === '주의'
                      ? 'text-amber-600'
                      : defectTone === '양호'
                        ? 'text-emerald-600'
                        : strong
                }`}
              >
                {probLabel}
              </div>
              <div
                className={`mt-2 h-2 overflow-hidden rounded-full ${
                  isDark ? 'bg-slate-800' : 'bg-slate-100'
                }`}
              >
                <div
                  className={`h-full rounded-full transition-[width] ${
                    defectTone === '위험'
                      ? 'bg-rose-500'
                      : defectTone === '주의'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${probPct}%` }}
                />
              </div>
              <p className={`mt-1 text-xs ${muted}`}>불량 확률(0~1 → %)</p>
            </div>

            <div className={cardClass}>
              <div className={`text-xs font-semibold ${muted}`}>risk_level</div>
              <div className="mt-2">
                <span style={{ ...badgeBase, ...riskStyle(risk, isDark), fontSize: 14 }}>
                  {risk}
                </span>
              </div>
              <p className={`mt-3 text-xs ${muted}`}>analysis_lots.risk_level</p>
            </div>

            <div className={cardClass}>
              <div className={`text-xs font-semibold ${muted}`}>spc_status</div>
              <div className="mt-2">
                <span className={spcStatusBadgeClass(spcFilter, isDark)}>
                  {analysis.spcStatus?.trim() || '—'}
                </span>
              </div>
              <p className={`mt-3 text-xs ${muted}`}>analysis_lots.spc_status</p>
            </div>
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
              analysis_lots 필드
            </div>
            <dl className="m-0">
              {fieldRows.map((row, index) => (
                <div
                  key={row.key}
                  className={`grid grid-cols-[140px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-sm ${
                    index > 0
                      ? isDark
                        ? 'border-t border-slate-700'
                        : 'border-t border-slate-200'
                      : ''
                  }`}
                >
                  <dt className={`font-mono text-xs font-semibold ${muted}`}>{row.label}</dt>
                  <dd className={`m-0 break-words ${strong}`}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
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
  <section
    style={{
      ...getPanelStyle(c),
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    }}
  >
    <h2 style={{ margin: '0 0 6px', color: c.navy, fontSize: 19, flexShrink: 0 }}>
      이슈 처리 관리
    </h2>
    <p style={{ margin: '0 0 20px', color: c.slate, fontSize: 13, flexShrink: 0 }}>
      {issue
        ? `${issue.id} · 조치 완료 체크 후 저장하면 목록에서 사라지고 과거 자료로 이동합니다.`
        : '관리할 이슈를 먼저 선택해주세요.'}
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
          flexShrink: 0,
        }}
      >
        ✓ {message}
      </div>
    )}
    <form
      onSubmit={onSave}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <fieldset
        disabled={!issue}
        style={{
          border: 0,
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 16,
            flexShrink: 0,
          }}
        >
          <div>
            <label htmlFor="manager-assignee" style={getLabelStyle(c)}>담당자</label>
            <input
              id="manager-assignee"
              value={form.assignee}
              readOnly
              title="users.name (저장 시 로그인 사용자가 담당자로 지정됩니다)"
              placeholder="상세 조회 시 표시 · 저장 시 자동 지정"
              style={{ ...getInputStyle(c), cursor: 'default' }}
            />
          </div>
        </div>
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          }}
        >
          <label htmlFor="manager-action" style={getLabelStyle(c)}>조치 내용</label>
          <textarea
            id="manager-action"
            value={form.action}
            onChange={(event) => onChange('action', event.target.value)}
            placeholder="분석 내용과 조치 사항을 입력해주세요."
            style={{
              ...getInputStyle(c),
              flex: 1,
              minHeight: 110,
              resize: 'none',
              fontFamily: 'inherit',
            }}
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
            marginBottom: 12,
            flexShrink: 0,
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
        {!form.completed && issue ? (
          <p
            style={{
              margin: '0 0 12px',
              color: c.slate,
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            조치 완료 여부를 체크해야 저장할 수 있습니다.
          </p>
        ) : null}
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
            flexShrink: 0,
            marginTop: 'auto',
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
  action: '',
  completed: false,
};

const EMPTY_FILTERS: FilterState = {
  search: '',
  date: '',
  lot: '',
  risk: '',
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
  const [isListRefreshing, setIsListRefreshing] = useState(false);
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

  const loadIssues = async () => {
    setIsListRefreshing(true);
    try {
      const { data } = await issueApi.list();
      setIssues(data.issues.map(mapIssueListItem));
    } catch (error) {
      setIssues([]);
      setToastMessage(getApiErrorMessage(error, '이슈 목록을 불러오지 못했습니다.'));
      setShowToast(true);
    } finally {
      setIsListRefreshing(false);
    }
  };

  useEffect(() => {
    void loadIssues();
    void refreshPendingHandovers();
  }, []);

  useShellRefresh(() => {
    void loadIssues();
    void refreshPendingHandovers();
  });

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

      const overallSpc = mapAnalysisSpcToFilter(
        issue.analysis?.spcStatus ?? issue.listSpcStatus,
      );

      const matchesSearch =
        !keyword ||
        issue.id.toLowerCase().includes(keyword) ||
        issue.issueContent.toLowerCase().includes(keyword) ||
        issue.lot.toLowerCase().includes(keyword);
      const matchesDate = !appliedFilters.date || issue.date === appliedFilters.date;
      const matchesLot = !appliedFilters.lot || issue.lot === appliedFilters.lot;
      const matchesRisk = !appliedFilters.risk || issue.risk === appliedFilters.risk;
      const matchesSpc = !appliedFilters.spc || overallSpc === appliedFilters.spc;
      return (
        matchesSearch &&
        matchesDate &&
        matchesLot &&
        matchesRisk &&
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

  /** 저장 = 완료만. 조치 완료 체크 없이는 저장 불가. */
  const canSave = useMemo(() => {
    if (!selectedIssue) return false;
    if (!managementForm.completed) return false;
    return (
      managementForm.action !== selectedIssue.action ||
      managementForm.completed !== selectedIssue.completed
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
    setManagementForm((current) => ({ ...current, [key]: value }));
    setSaveMessage('');
  };

  const handleAddNote = async (note: Omit<HandoverNote, 'id' | 'createdAt'>) => {
    try {
      await issueApi.createHandover({
        category: note.category,
        content: note.content,
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
      risk === '심각' ? colors.red : risk === '주의' ? colors.amber : colors.green;
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
  <tr><th>이슈 ID</th><th>발생일시</th><th>LOT</th><th>위험도</th><th>담당자</th></tr>
  ${openIssues.length === 0
        ? '<tr><td colspan="5" style="text-align:center;">미완료 이슈가 없습니다.</td></tr>'
        : openIssues
          .map(
            (issue) =>
              `<tr><td>${issue.id}</td><td>${issue.createdAt}</td><td>${issue.lot}</td><td style="color:${riskColor(issue.risk)};font-weight:800;">${issue.risk}</td><td>${issue.assignee}</td></tr>`,
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
              `<div class="issue" style="border-left:4px solid ${noteColor(note.category)};"><strong>[${note.category}] ${note.author}</strong><div class="meta">${note.createdAt}</div><div class="action">${note.content}</div></div>`,
          )
          .join('')
      }
<h2>4. 전체 이슈 처리 현황 (${issues.length}건)</h2>
${issues
        .map(
          (issue) =>
            `<div class="issue" style="border-left:4px solid ${riskColor(issue.risk)};"><strong>[${issue.id}] ${issue.issueContent}</strong><div class="meta">${issue.createdAt} · ${issue.lot} · 담당 ${issue.assignee}</div>${issue.action ? `<div class="action">조치: ${issue.action}</div>` : ''}</div>`,
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
    const COLUMN_COUNT = 8;
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
      toRow(['구분', '작성자', '작성 시각', '내용']),
      ...(handoverNotes.length === 0
        ? [toRow(['등록된 인수인계 특이사항이 없습니다.'])]
        : handoverNotes.map((note) =>
          toRow([
            note.category,
            note.author,
            note.createdAt,
            note.content,
          ]),
        )),
      toRow([]),
      toRow(['3. 전체 이슈 처리 현황']),
      toRow(['이슈 ID', '등록일시', 'LOT', '위험도', '담당자', '이슈 내용', '조치 내용', '완료 여부']),
      ...issues.map((issue) =>
        toRow([
          issue.id,
          issue.createdAt,
          issue.lot,
          issue.risk,
          issue.assignee,
          issue.issueContent,
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

    setIsSaving(true);
    try {
      await issueApi.update(issueId, {
        actionContent: managementForm.action.trim() || null,
        completed: true,
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
    if (!managementForm.completed) {
      setToastMessage('조치 완료 여부를 체크한 뒤 저장해주세요.');
      setShowToast(true);
      return;
    }
    await handleCompleteIssue();
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
            isRefreshing={isListRefreshing}
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
              alignItems: 'stretch',
            }}
          >
            <div style={{ minHeight: 0, height: '100%' }}>
              <DetailAnalysisSection issue={selectedIssue} onDiagnose={handleDiagnoseIssue} />
            </div>
            <div style={{ minHeight: 0, height: '100%' }}>
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