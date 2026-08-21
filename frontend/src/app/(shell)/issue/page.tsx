'use client'

import axios from 'axios';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CSSProperties, FormEvent } from 'react';
import {
  issueApi,
  normalizeIssueRiskLevel,
  type IssueDetail as IssueApiDetail,
  type IssueListItem as IssueApiListItem,
  type IssueManager,
} from '@/api/issueApi';
import { IssueDetailAnalysis } from '@/components/IssueDetailAnalysis';
import { useUiSettings } from '@/components/layout/AppShell';
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent';
import DateInput from '@/components/DateInput';
import { usePageChat } from '@/context/PageChatContext';
import { getAuthToken, getAuthUser } from '@/lib/authStorage';
import { useShellRefresh } from '@/hooks/useShellRefresh';
import {
  clearIssueActionDraft,
  readIssueActionDraft,
} from '@/lib/issueActionDraft';

type SpcStatus = '이상' | '주의' | '안정';

interface Issue {
  id: string;
  createdAt: string;
  date: string;
  lot: string;
  risk: '심각' | '주의' | '안정';
  issueContent: string;
  assignee: string;
  assignedAt: string | null;
  processStatus: IssueProcessStatus;
  action: string;
  completed: boolean;
  assignmentDirty: boolean;
  /** analysis_lots (상세 API). 목록만이면 null */
  analysis: {
    lotId: string;
    probability: number | null;
    spcStatus: string | null;
    riskLevel: '심각' | '주의' | '안정';
    riskReason: string | null;
    createdAt: string | null;
    scoredAt: string | null;
  } | null;
  /** 목록 SPC 필터용 (analysis_lots.spc_status) */
  listSpcStatus: string | null;
}

interface FilterState {
  search: string;
  date: string;
  lot: string;
  risk: '' | Issue['risk'];
  /** 대표 SPC 상태 필터. 안정은 목록 제외 대상이라 옵션에 없음 */
  spc: '' | '이상' | '주의';
  assignment: '' | 'assigned' | 'unassigned';
}

type IssueProcessStatus = '미배정' | '접수' | '처리 중' | '처리 완료' | '종결';

interface ManagementForm {
  assignee: string;
  processStatus: IssueProcessStatus;
  action: string;
  completed: boolean;
}

type ReportType = 'lot' | 'weekly' | 'monthly';

type IssueGroupKey =
  | 'spc'
  | 'residualLithium'
  | 'defectRisk'
  | 'calcination'
  | 'inspection'
  | 'other';

interface IssueGroupSummary {
  key: IssueGroupKey;
  title: string;
  count: number;
  highestSeverity: Issue['risk'];
  representativeMessage: string;
  lotCount: number;
  assignedCount: number;
  unassignedCount: number;
  items: Issue[];
}

interface ReportKpi {
  issueCount: number;
  riskCritical: number;
  riskCaution: number;
  riskStable: number;
  spcAbnormal: number;
  spcCaution: number;
}

interface IssueReportPayload {
  type: ReportType;
  typeLabel: string;
  scopeLabel: string;
  author: string;
  generatedAt: string;
  issues: Issue[];
  kpi: ReportKpi;
}

interface HeaderIssueSectionProps {
  notice: string;
  onGenerate: () => void;
  onCloseNotice: () => void;
}

interface IssueReportModalProps {
  issues: Issue[];
  lots: string[];
  onClose: () => void;
  onEnrichIssues: (issues: Issue[]) => Promise<Issue[]>;
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
}

interface ManagementSectionProps {
  issue: Issue | null;
  form: ManagementForm;
  managers: IssueManager[];
  message: string;
  canSave: boolean;
  isSaving?: boolean;
  onChange: <K extends keyof ManagementForm>(key: K, value: ManagementForm[K]) => void;
  onAssign: () => void;
  onRequestUnassign: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
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

/** 목록 API → UI. 담당자·조치·analysis는 상세 API에서 채움. */
function mapIssueListItem(item: IssueApiListItem): Issue {
  const assignee = '';
  const action = '';
  return {
    id: item.issueId,
    createdAt: item.createdAt,
    date: item.createdAt.slice(0, 10),
    lot: item.lotId,
    risk: normalizeIssueRiskLevel(item.riskLevel),
    issueContent: item.issueContent,
    assignee,
    assignedAt: null,
    processStatus: deriveProcessStatus(assignee, false, action),
    action,
    completed: false,
    assignmentDirty: false,
    analysis: null,
    listSpcStatus: item.spcStatus ?? null,
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
        scoredAt: detail.analysis.scoredAt,
      }
    : null;

  const serverAssignee = detail.assigneeName?.trim() || '';
  const serverAction = detail.actionContent ?? '';
  const nextAssignee = issue.assignmentDirty ? issue.assignee : serverAssignee;
  const nextAssignedAt =
    issue.assignmentDirty ? issue.assignedAt : hasAssigneeName(serverAssignee) ? detail.createdAt : null;
  const nextProcessStatus = issue.assignmentDirty
    ? issue.processStatus
    : deriveProcessStatus(serverAssignee, detail.completed, serverAction);

  return withLoginAutoAssignee({
    ...issue,
    id: detail.issueId,
    createdAt: detail.createdAt,
    date: detail.createdAt.slice(0, 10),
    lot: detail.lotId,
    risk: normalizeIssueRiskLevel(detail.riskLevel),
    issueContent: detail.issueContent,
    assignee: nextAssignee,
    assignedAt: nextAssignedAt,
    processStatus: nextProcessStatus,
    action: serverAction,
    completed: detail.completed,
    assignmentDirty: issue.assignmentDirty,
    analysis,
    listSpcStatus: detail.analysis?.spcStatus ?? detail.spcStatus ?? issue.listSpcStatus,
  });
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return fallback;
}

const UNAUTH_USER_LABEL = '—(로그인 필요)';

/** users.name from login session (kdt-auth-user). */
function getLoggedInUserName(): string {
  const name = getAuthUser()?.name?.trim();
  return name || UNAUTH_USER_LABEL;
}

function reportTypeLabel(type: ReportType, language: 'ko' | 'en' = 'ko'): string {
  if (language === 'en') {
    if (type === 'lot') return 'LOT Report';
    if (type === 'weekly') return 'Weekly Report';
    return 'Monthly Report';
  }
  if (type === 'lot') return 'LOT 보고서';
  if (type === 'weekly') return '주간 보고서';
  return '월간 보고서';
}

const ISSUE_GROUP_KEYS: IssueGroupKey[] = [
  'spc',
  'residualLithium',
  'defectRisk',
  'calcination',
  'inspection',
  'other',
];

const ISSUE_GROUP_TITLE: Record<IssueGroupKey, string> = {
  spc: 'SPC 이상',
  residualLithium: '잔류 리튬 고위험',
  defectRisk: '불량확률 고위험',
  calcination: '소성 공정 관련',
  inspection: '검사 / 품질 판정 관련',
  other: '기타',
};

const ISSUE_GROUP_MESSAGE: Record<IssueGroupKey, string> = {
  spc: 'SPC 패턴 이상 및 관리선 이탈이 감지되었습니다.',
  residualLithium: '잔류 리튬 기준 초과 이슈가 반복 발생했습니다.',
  defectRisk: '불량확률 0.85 이상 이슈가 집중되었습니다.',
  calcination: '소성 온도 및 공정 편차 관련 이슈가 확인되었습니다.',
  inspection: '검사 결과 및 품질 판정 관련 이상이 발생했습니다.',
  other: '기타 유형의 이슈가 감지되었습니다.',
};

const ISSUE_GROUP_VISIBLE_STEP = 5;
const PRACTITIONER_NAMES = ['김실무', '이공정', '박설비', '최생산'] as const;
const ASSIGNEE_UNASSIGNED = '미배정';
const ASSIGNEE_NAME_MIN_LENGTH = 2;
const ASSIGNEE_NAME_MAX_LENGTH = 20;

function normalizeAssigneeName(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function hasAssigneeName(value: string | null | undefined): boolean {
  return normalizeAssigneeName(value).length > 0;
}

function displayAssigneeName(value: string | null | undefined): string {
  return hasAssigneeName(value) ? normalizeAssigneeName(value) : ASSIGNEE_UNASSIGNED;
}

function deriveProcessStatus(
  assignee: string | null | undefined,
  completed: boolean,
  action: string | null | undefined,
): IssueProcessStatus {
  if (!hasAssigneeName(assignee)) return '미배정';
  if (completed) return '종결';
  if ((action ?? '').trim()) return '처리 중';
  return '접수';
}

function formatCurrentDateTime(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function getLoginAssigneeName(): string | null {
  if (!getAuthToken()) return null;
  const name = getAuthUser()?.name?.trim();
  return name || null;
}

function withLoginAutoAssignee(issue: Issue): Issue {
  if (issue.assignmentDirty || hasAssigneeName(issue.assignee)) return issue;
  const loginName = getLoginAssigneeName();
  if (!loginName) return issue;
  return {
    ...issue,
    assignee: loginName,
    assignedAt: formatCurrentDateTime(),
    processStatus: issue.processStatus === '미배정' ? '접수' : issue.processStatus,
    assignmentDirty: true,
  };
}

function validateAssigneeName(name: string): string | null {
  const normalized = normalizeAssigneeName(name);
  if (!normalized) return '담당 실무자를 먼저 지정해 주세요.';
  if (normalized.length < ASSIGNEE_NAME_MIN_LENGTH) {
    return `담당자 이름은 ${ASSIGNEE_NAME_MIN_LENGTH}자 이상 입력해 주세요.`;
  }
  if (normalized.length > ASSIGNEE_NAME_MAX_LENGTH) {
    return `담당자 이름은 ${ASSIGNEE_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`;
  }
  return null;
}

function issueClassifyText(issue: Issue): string {
  return [
    issue.issueContent,
    issue.analysis?.riskReason ?? '',
    issue.analysis?.spcStatus ?? '',
    issue.listSpcStatus ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function classifyIssueGroup(issue: Issue): IssueGroupKey {
  const text = issueClassifyText(issue);
  const spc = `${issue.analysis?.spcStatus ?? ''} ${issue.listSpcStatus ?? ''}`;
  const probability = issue.analysis?.probability;

  if (
    spc.includes('이탈') ||
    spc.includes('이상') ||
    (text.includes('spc') && (text.includes('이탈') || text.includes('이상')))
  ) {
    return 'spc';
  }
  if (text.includes('잔류') || text.includes('리튬') || text.includes('residual')) {
    return 'residualLithium';
  }
  if (
    (typeof probability === 'number' && probability >= 0.85) ||
    text.includes('불량확률') ||
    text.includes('불량 확률')
  ) {
    return 'defectRisk';
  }
  if (text.includes('소성') || text.includes('sinter')) {
    return 'calcination';
  }
  if (text.includes('검사') || text.includes('품질') || text.includes('판정')) {
    return 'inspection';
  }
  return 'other';
}

function issueRiskRank(risk: Issue['risk']): number {
  if (risk === '심각') return 3;
  if (risk === '주의') return 2;
  return 1;
}

function highestIssueRisk(items: Issue[]): Issue['risk'] {
  return items.reduce<Issue['risk']>((acc, item) => {
    return issueRiskRank(item.risk) > issueRiskRank(acc) ? item.risk : acc;
  }, '안정');
}

function issueTimeMs(issue: Issue): number {
  const parsed = Date.parse(issue.createdAt) || Date.parse(issue.date);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarizeIssueLine(issue: Issue): string {
  const raw = (issue.analysis?.riskReason?.trim() || issue.issueContent || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '요약 없음';
  return raw.length > 72 ? `${raw.slice(0, 72)}…` : raw;
}

function buildIssueGroups(issues: Issue[]): IssueGroupSummary[] {
  const buckets: Record<IssueGroupKey, Issue[]> = {
    spc: [],
    residualLithium: [],
    defectRisk: [],
    calcination: [],
    inspection: [],
    other: [],
  };
  for (const issue of issues) {
    buckets[classifyIssueGroup(issue)].push(issue);
  }

  const groups: IssueGroupSummary[] = ISSUE_GROUP_KEYS.filter(
    (key) => buckets[key].length > 0,
  ).map((key) => {
    const items = [...buckets[key]].sort((a, b) => {
      const byRisk = issueRiskRank(b.risk) - issueRiskRank(a.risk);
      if (byRisk !== 0) return byRisk;
      const byTime = issueTimeMs(b) - issueTimeMs(a);
      if (byTime !== 0) return byTime;
      const byId = a.id.localeCompare(b.id, 'ko');
      if (byId !== 0) return byId;
      return a.lot.localeCompare(b.lot, 'ko');
    });
    return {
      key,
      title: ISSUE_GROUP_TITLE[key],
      count: items.length,
      highestSeverity: highestIssueRisk(items),
      representativeMessage: ISSUE_GROUP_MESSAGE[key],
      lotCount: new Set(items.map((item) => item.lot)).size,
      assignedCount: items.filter((item) => hasAssigneeName(item.assignee)).length,
      unassignedCount: items.filter((item) => !hasAssigneeName(item.assignee)).length,
      items,
    };
  });

  groups.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const byRisk = issueRiskRank(b.highestSeverity) - issueRiskRank(a.highestSeverity);
    if (byRisk !== 0) return byRisk;
    return a.title.localeCompare(b.title, 'ko');
  });
  return groups;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatDateTime(date: Date): string {
  return `${formatYmd(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Monday-start week containing the given YYYY-MM-DD (or that Monday). */
function getWeekRange(anchorYmd: string): { start: string; end: string } | null {
  const base = parseYmd(anchorYmd);
  if (!base) return null;
  const day = base.getDay(); // 0 Sun .. 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(base);
  start.setDate(base.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: formatYmd(start), end: formatYmd(end) };
}

function getMonthRange(yearMonth: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start: formatYmd(start), end: formatYmd(end) };
}

function computeReportKpi(issues: Issue[]): ReportKpi {
  let riskCritical = 0;
  let riskCaution = 0;
  let riskStable = 0;
  let spcAbnormal = 0;
  let spcCaution = 0;
  for (const issue of issues) {
    if (issue.risk === '심각') riskCritical += 1;
    else if (issue.risk === '주의') riskCaution += 1;
    else riskStable += 1;
    const spc = mapAnalysisSpcToFilter(issue.analysis?.spcStatus ?? issue.listSpcStatus);
    if (spc === '이상') spcAbnormal += 1;
    else if (spc === '주의') spcCaution += 1;
  }
  return {
    issueCount: issues.length,
    riskCritical,
    riskCaution,
    riskStable,
    spcAbnormal,
    spcCaution,
  };
}

function filterIssuesForReport(
  issues: Issue[],
  type: ReportType,
  selectedLot: string,
  weekAnchor: string,
  yearMonth: string,
): { issues: Issue[]; scopeLabel: string } {
  const open = issues.filter((issue) => !isIssueCompleted(issue));
  if (type === 'lot') {
    const lot = selectedLot.trim();
    return {
      issues: lot ? open.filter((issue) => issue.lot === lot) : [],
      scopeLabel: lot ? `LOT ${lot}` : 'LOT 미선택',
    };
  }
  if (type === 'weekly') {
    const range = getWeekRange(weekAnchor);
    if (!range) return { issues: [], scopeLabel: '주간 기간 미선택' };
    return {
      issues: open.filter((issue) => issue.date >= range.start && issue.date <= range.end),
      scopeLabel: `${range.start} ~ ${range.end}`,
    };
  }
  const range = getMonthRange(yearMonth);
  if (!range) return { issues: [], scopeLabel: '월간 기간 미선택' };
  return {
    issues: open.filter((issue) => issue.date >= range.start && issue.date <= range.end),
    scopeLabel: `${range.start} ~ ${range.end}`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildIssueReportPdfHtml(payload: IssueReportPayload): string {
  const riskColor = (risk: Issue['risk']) =>
    risk === '심각' ? colors.red : risk === '주의' ? colors.amber : colors.green;
  const { kpi } = payload;
  const issueGroups = buildIssueGroups(payload.issues);
  const groupOverview = {
    groupCount: issueGroups.length,
    largestGroupName: issueGroups[0]?.title ?? '—',
    criticalGroupCount: issueGroups.filter((group) => group.highestSeverity === '심각').length,
  };
  const groupSummaryRows = issueGroups
    .map(
      (group) => `<tr>
        <td>${escapeHtml(group.title)}</td>
        <td>${group.count}</td>
        <td style="color:${riskColor(group.highestSeverity)};font-weight:800;">${escapeHtml(group.highestSeverity)}</td>
        <td>${group.lotCount}</td>
        <td>${group.assignedCount}</td>
        <td>${group.unassignedCount}</td>
        <td>${escapeHtml(group.representativeMessage)}</td>
      </tr>`,
    )
    .join('');
  const groupedIssueSections = issueGroups
    .map((group) => {
      const rows = group.items
        .map((issue) => {
          const analysis = issue.analysis;
          const spc = analysis?.spcStatus ?? issue.listSpcStatus ?? '—';
          const prob = formatAnalysisProbability(analysis?.probability).label;
          const reason = summarizeIssueLine(issue);
          const level = analysis?.riskLevel ?? issue.risk;
          return `<tr>
        <td>${escapeHtml(issue.id)}</td>
        <td>${escapeHtml(issue.createdAt)}</td>
        <td>${escapeHtml(issue.lot)}</td>
        <td style="color:${riskColor(level)};font-weight:800;">${escapeHtml(level)}</td>
        <td>${escapeHtml(displayAssigneeName(issue.assignee))}</td>
        <td>${escapeHtml(issue.processStatus)}</td>
        <td>${escapeHtml(spc)}</td>
        <td>${escapeHtml(prob)}</td>
        <td>${escapeHtml(reason)}</td>
      </tr>`;
        })
        .join('');
      return `<h3>${escapeHtml(group.title)} (${group.count}건)</h3>
<table>
  <tr><th>이슈 ID</th><th>등록일시</th><th>LOT</th><th>위험도</th><th>담당 실무자</th><th>처리 상태</th><th>SPC</th><th>불량 확률</th><th>핵심 요약</th></tr>
  ${rows}
</table>`;
    })
    .join('');

  const lotAnalysisSection =
    payload.type === 'lot'
      ? `<h2>4. LOT 상세 분석</h2>
<table>
  <tr><th>이슈 ID</th><th>LOT</th><th>위험도</th><th>SPC</th><th>불량 확률</th><th>위험 원인</th><th>채점 시각</th></tr>
  ${
    payload.issues.length === 0
      ? '<tr><td colspan="7" style="text-align:center;">대상 이슈가 없습니다.</td></tr>'
      : payload.issues
          .map((issue) => {
            const a = issue.analysis;
            return `<tr>
              <td>${escapeHtml(issue.id)}</td>
              <td>${escapeHtml(a?.lotId ?? issue.lot)}</td>
              <td>${escapeHtml(a?.riskLevel ?? issue.risk)}</td>
              <td>${escapeHtml(a?.spcStatus ?? issue.listSpcStatus ?? '—')}</td>
              <td>${escapeHtml(formatAnalysisProbability(a?.probability).label)}</td>
              <td>${escapeHtml(a?.riskReason?.trim() || '—')}</td>
              <td>${escapeHtml(a?.scoredAt ?? a?.createdAt ?? '—')}</td>
            </tr>`;
          })
          .join('')
  }
</table>`
      : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(payload.typeLabel)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif; color: ${colors.navy}; padding: 32px; }
  h1 { font-size: 22px; text-align: center; margin: 0 0 6px; }
  .meta { text-align: center; color: ${colors.slate}; font-size: 13px; margin-bottom: 8px; }
  h2 { font-size: 15px; margin: 24px 0 10px; }
  h3 { font-size: 13px; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid ${colors.line}; padding: 8px 10px; font-size: 12px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; color: ${colors.slate}; white-space: nowrap; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>${escapeHtml(payload.typeLabel)}</h1>
<div class="meta">대상: ${escapeHtml(payload.scopeLabel)}</div>
<div class="meta">작성자: ${escapeHtml(payload.author)} · 생성: ${escapeHtml(payload.generatedAt)}</div>
<h2>1. 요약 KPI</h2>
<table>
  <tr>
    <th>이슈 수</th><td>${kpi.issueCount}</td>
    <th>심각</th><td>${kpi.riskCritical}</td>
    <th>주의</th><td>${kpi.riskCaution}</td>
    <th>안정</th><td>${kpi.riskStable}</td>
  </tr>
  <tr>
    <th>SPC 이상</th><td>${kpi.spcAbnormal}</td>
    <th>SPC 주의</th><td>${kpi.spcCaution}</td>
    <th>그룹 수</th><td>${groupOverview.groupCount}</td>
  </tr>
  <tr>
    <th>최다 그룹</th><td>${escapeHtml(groupOverview.largestGroupName)}</td>
    <th>심각 포함 그룹</th><td>${groupOverview.criticalGroupCount}</td>
    <th colspan="2"></th><td colspan="2"></td>
  </tr>
</table>
<h2>2. 이슈 유형별 요약</h2>
<table>
  <tr><th>그룹명</th><th>건수</th><th>최고 심각도</th><th>영향 LOT 수</th><th>배정 완료</th><th>미배정</th><th>대표 설명</th></tr>
  ${
    issueGroups.length === 0
      ? '<tr><td colspan="7" style="text-align:center;">대상 이슈가 없습니다.</td></tr>'
      : groupSummaryRows
  }
</table>
<h2>3. 그룹별 상세 이슈</h2>
  ${
    issueGroups.length === 0
      ? '<table><tr><td style="text-align:center;">대상 이슈가 없습니다.</td></tr></table>'
      : groupedIssueSections
  }
${lotAnalysisSection}
<script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}

function buildIssueReportCsv(payload: IssueReportPayload): string {
  const COLUMN_COUNT = 8;
  const escapeCsv = (value: string | number) => {
    const text = String(value).replace(/"/g, '""').replace(/\r?\n/g, ' ');
    return `"${text}"`;
  };
  const toRow = (cells: (string | number)[]) => {
    const padded = [...cells];
    while (padded.length < COLUMN_COUNT) padded.push('');
    return padded.map(escapeCsv).join(',');
  };
  const { kpi } = payload;
  const issueGroups = buildIssueGroups(payload.issues);
  const groupOverview = {
    groupCount: issueGroups.length,
    largestGroupName: issueGroups[0]?.title ?? '—',
    criticalGroupCount: issueGroups.filter((group) => group.highestSeverity === '심각').length,
  };
  const lines: string[] = [
    toRow([payload.typeLabel]),
    toRow(['대상', payload.scopeLabel]),
    toRow(['작성자', payload.author]),
    toRow(['생성 시각', payload.generatedAt]),
    toRow([]),
    toRow(['1. 요약 KPI']),
    toRow(['이슈 수', '심각', '주의', '안정', 'SPC 이상', 'SPC 주의']),
    toRow([
      kpi.issueCount,
      kpi.riskCritical,
      kpi.riskCaution,
      kpi.riskStable,
      kpi.spcAbnormal,
      kpi.spcCaution,
    ]),
    toRow([]),
    toRow(['그룹 수', groupOverview.groupCount, '최다 그룹', groupOverview.largestGroupName, '심각 포함 그룹', groupOverview.criticalGroupCount]),
    toRow([]),
    toRow(['2. 이슈 유형별 요약']),
    toRow(['그룹명', '건수', '최고 심각도', '영향 LOT 수', '배정 완료', '미배정', '대표 설명']),
    ...(issueGroups.length === 0
      ? [toRow(['대상 이슈가 없습니다.'])]
      : issueGroups.map((group) =>
          toRow([
            group.title,
            group.count,
            group.highestSeverity,
            group.lotCount,
            group.assignedCount,
            group.unassignedCount,
            group.representativeMessage,
          ]),
        )),
    toRow([]),
    toRow(['3. 그룹별 상세 이슈']),
  ];

  if (issueGroups.length === 0) {
    lines.push(toRow(['대상 이슈가 없습니다.']));
  } else {
    for (const group of issueGroups) {
      lines.push(toRow([group.title, `${group.count}건`]));
      lines.push(
        toRow([
          '이슈 ID',
          '등록일시',
          'LOT',
          '위험도',
          '담당 실무자',
          '처리 상태',
          'SPC',
          '불량 확률',
          '핵심 요약',
        ]),
      );
      for (const issue of group.items) {
        lines.push(
          toRow([
            issue.id,
            issue.createdAt,
            issue.lot,
            issue.analysis?.riskLevel ?? issue.risk,
            displayAssigneeName(issue.assignee),
            issue.processStatus,
            issue.analysis?.spcStatus ?? issue.listSpcStatus ?? '',
            formatAnalysisProbability(issue.analysis?.probability).label,
            summarizeIssueLine(issue),
          ]),
        );
      }
      lines.push(toRow([]));
    }
  }

  if (payload.type === 'lot') {
    lines.push(toRow([]));
    lines.push(toRow(['4. LOT 상세 분석']));
    lines.push(toRow(['이슈 ID', 'LOT', '위험도', 'SPC', '불량 확률', '위험 원인', '채점 시각']));
    if (payload.issues.length === 0) {
      lines.push(toRow(['대상 이슈가 없습니다.']));
    } else {
      for (const issue of payload.issues) {
        const a = issue.analysis;
        lines.push(
          toRow([
            issue.id,
            a?.lotId ?? issue.lot,
            a?.riskLevel ?? issue.risk,
            a?.spcStatus ?? issue.listSpcStatus ?? '',
            formatAnalysisProbability(a?.probability).label,
            a?.riskReason?.trim() || '',
            a?.scoredAt ?? a?.createdAt ?? '',
          ]),
        );
      }
    }
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

const HeaderIssueSection = ({
  notice,
  onGenerate,
  onCloseNotice,
}: HeaderIssueSectionProps) => {
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
            onClick={onGenerate}
            className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
          >
            {language === 'en' ? 'Generate Report' : '보고서 생성'}
          </button>
        </div>
      </div>
    </section>
  );
};

const IssueReportModal = ({
  issues,
  lots,
  onClose,
  onEnrichIssues,
}: IssueReportModalProps) => {
  const { isDark, language } = useUiSettings();
  const today = formatYmd(new Date());
  const currentMonth = today.slice(0, 7);
  const [reportType, setReportType] = useState<ReportType>('lot');
  const [selectedLot, setSelectedLot] = useState(lots[0] ?? '');
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [yearMonth, setYearMonth] = useState(currentMonth);
  const [previewIssues, setPreviewIssues] = useState<Issue[]>([]);
  const [scopeLabel, setScopeLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [openGroups, setOpenGroups] = useState<Partial<Record<IssueGroupKey, boolean>>>({});
  const [visibleCounts, setVisibleCounts] = useState<Partial<Record<IssueGroupKey, number>>>({});
  const [detailIssueId, setDetailIssueId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedLot && lots.length > 0) setSelectedLot(lots[0]);
  }, [lots, selectedLot]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setError('');
      const filtered = filterIssuesForReport(
        issues,
        reportType,
        selectedLot,
        weekAnchor,
        yearMonth,
      );
      setScopeLabel(filtered.scopeLabel);
      try {
        const next =
          reportType === 'lot' && filtered.issues.length > 0
            ? await onEnrichIssues(filtered.issues)
            : filtered.issues;
        if (!cancelled) setPreviewIssues(next);
      } catch (err) {
        if (!cancelled) {
          setPreviewIssues(filtered.issues);
          setError(err instanceof Error ? err.message : '이슈 상세를 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [issues, reportType, selectedLot, weekAnchor, yearMonth, onEnrichIssues]);

  const kpi = useMemo(() => computeReportKpi(previewIssues), [previewIssues]);
  const issueGroups = useMemo(() => buildIssueGroups(previewIssues), [previewIssues]);
  const groupOverview = useMemo(() => {
    const largest = issueGroups[0];
    return {
      groupCount: issueGroups.length,
      largestGroupName: largest?.title ?? '—',
      criticalGroupCount: issueGroups.filter((group) => group.highestSeverity === '심각').length,
    };
  }, [issueGroups]);

  useEffect(() => {
    setOpenGroups({});
    setVisibleCounts({});
    setDetailIssueId(null);
  }, [previewIssues]);

  const buildPayload = (): IssueReportPayload => ({
    type: reportType,
    typeLabel: reportTypeLabel(reportType, language === 'en' ? 'en' : 'ko'),
    scopeLabel,
    author: getLoggedInUserName(),
    generatedAt: formatDateTime(new Date()),
    issues: previewIssues,
    kpi,
  });

  const handleDownloadPdf = () => {
    const html = buildIssueReportPdfHtml(buildPayload());
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      setError('팝업이 차단되어 PDF 창을 열 수 없습니다. 팝업 허용 후 다시 시도해주세요.');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleDownloadCsv = () => {
    const payload = buildPayload();
    const blob = new Blob([buildIssueReportCsv(payload)], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const stamp = formatYmd(new Date()).replace(/-/g, '');
    link.download = `issue_report_${reportType}_${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const typeOptions: ReportType[] = ['lot', 'weekly', 'monthly'];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="이슈 보고서 생성"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-5"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-[88vh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl shadow-2xl ${
          isDark ? 'bg-slate-800 text-slate-100' : 'bg-white'
        }`}
      >
        <div
          className={`sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b bg-slate-900 px-5 py-3.5 text-white ${
            isDark ? 'border-slate-700' : 'border-slate-200'
          }`}
        >
          <strong className="text-sm font-semibold tracking-tight">
            {language === 'en' ? 'Issue Report' : '이슈 보고서 생성'}
          </strong>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isLoading}
              className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              PDF 다운로드
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={isLoading}
              className="inline-flex h-9 items-center rounded-lg border border-blue-300/60 bg-transparent px-3 text-xs font-bold text-blue-100 hover:bg-white/10 disabled:opacity-50"
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
          <section
            className={`mb-5 rounded-xl border p-4 ${
              isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-slate-50/80'
            }`}
          >
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
              보고서 유형
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {typeOptions.map((type) => {
                const active = reportType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setReportType(type)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold ${
                      active
                        ? 'bg-blue-600 text-white'
                        : isDark
                          ? 'border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {reportTypeLabel(type, language === 'en' ? 'en' : 'ko')}
                  </button>
                );
              })}
              </div>

            {reportType === 'lot' ? (
                <div>
                  <label
                  htmlFor="report-lot"
                    className={`mb-1.5 block text-xs font-semibold ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                  LOT 선택
                  </label>
                <select
                  id="report-lot"
                  value={selectedLot}
                  onChange={(event) => setSelectedLot(event.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none ${
                      isDark
                        ? 'border-slate-600 bg-slate-950/40 text-slate-100'
                        : 'border-slate-200 bg-white text-slate-900'
                    }`}
                >
                  {lots.length === 0 ? (
                    <option value="">선택 가능한 LOT 없음</option>
                  ) : (
                    lots.map((lot) => (
                      <option key={lot} value={lot}>
                        {lot}
                      </option>
                    ))
                  )}
                </select>
                </div>
            ) : null}

            {reportType === 'weekly' ? (
                <div>
                  <label
                  htmlFor="report-week"
                    className={`mb-1.5 block text-xs font-semibold ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                  주간 기준일 (해당 주 월~일)
                  </label>
                <DateInput
                  id="report-week"
                  value={weekAnchor}
                  onChange={setWeekAnchor}
                  className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none ${
                      isDark
                        ? 'border-slate-600 bg-slate-950/40 text-slate-100'
                        : 'border-slate-200 bg-white text-slate-900'
                    }`}
                  />
                </div>
              ) : null}

            {reportType === 'monthly' ? (
              <div>
                <label
                  htmlFor="report-month"
                  className={`mb-1.5 block text-xs font-semibold ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  대상 월
                </label>
                <input
                  id="report-month"
                  type="month"
                  value={yearMonth}
                  onChange={(event) => setYearMonth(event.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none ${
              isDark
                      ? 'border-slate-600 bg-slate-950/40 text-slate-100'
                      : 'border-slate-200 bg-white text-slate-900'
                  }`}
                />
              </div>
                        ) : null}

            <p className={`mt-3 m-0 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              대상: {scopeLabel}
              {isLoading ? ' · 불러오는 중…' : ''}
            </p>
            {error ? (
              <p className={`mt-2 m-0 text-xs font-semibold ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>
                {error}
              </p>
                ) : null}
          </section>

          <section className="mb-5">
            <h3
              className={`mb-2.5 mt-0 text-sm font-bold ${
                isDark ? 'text-slate-100' : 'text-slate-900'
              }`}
            >
              요약 KPI
            </h3>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {[
                ['이슈 수', kpi.issueCount],
                ['심각', kpi.riskCritical],
                ['주의', kpi.riskCaution],
                ['안정', kpi.riskStable],
                ['SPC 이상', kpi.spcAbnormal],
                ['SPC 주의', kpi.spcCaution],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                className={`rounded-xl border p-3.5 shadow-sm ${
                  isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200/80 bg-white'
                }`}
              >
                  <div
                    className={`text-[11px] font-semibold ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {label}
                </div>
                <div
                  className={`mt-1 text-base font-bold tabular-nums ${
                    isDark ? 'text-slate-100' : 'text-slate-900'
                  }`}
                >
                    {value}
                </div>
              </div>
              ))}
                </div>
                <div
              className={`mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              <span>전체 이슈 {kpi.issueCount}건</span>
              <span>그룹 {groupOverview.groupCount}개</span>
              <span>최다 그룹 {groupOverview.largestGroupName}</span>
              <span>심각 포함 그룹 {groupOverview.criticalGroupCount}개</span>
            </div>
          </section>

          <section>
            <h3
              className={`mb-2.5 mt-0 text-sm font-bold ${
                isDark ? 'text-slate-100' : 'text-slate-900'
              }`}
            >
              이슈 유형별 요약
            </h3>
            {previewIssues.length === 0 ? (
              <div
                className={`rounded-xl border px-4 py-5 text-center ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/70 text-slate-400'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                <p className={`m-0 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  표시할 이슈가 없습니다.
                </p>
                <p className="mt-1.5 mb-0 text-xs">
                  현재 조건에 해당하는 이슈가 생성되지 않았습니다.
                </p>
              </div>
            ) : (
              <ul className="m-0 list-none space-y-2.5 p-0">
                {issueGroups.map((group) => {
                  const isOpen = Boolean(openGroups[group.key]);
                  const visibleCount = visibleCounts[group.key] ?? ISSUE_GROUP_VISIBLE_STEP;
                  const visibleItems = isOpen ? group.items.slice(0, visibleCount) : [];
                  const canShowMore = isOpen && visibleCount < group.count;
                  return (
                    <li
                      key={group.key}
                      className={`rounded-xl border ${
                        isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 px-3.5 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenGroups((prev) => ({
                              ...prev,
                              [group.key]: !prev[group.key],
                            }))
                          }
                          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
              <span
                              className={`text-sm font-bold ${
                                isDark ? 'text-slate-100' : 'text-slate-900'
                              }`}
                            >
                              {group.title}
              </span>
              <span
                              className={`text-xs font-semibold tabular-nums ${
                                isDark ? 'text-blue-300' : 'text-blue-700'
                              }`}
                            >
                              {group.count}건
                            </span>
                            <span style={{ ...badgeBase, ...riskStyle(group.highestSeverity, isDark) }}>
                              최고 심각도: {group.highestSeverity}
                            </span>
                            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              영향 LOT {group.lotCount}개
                            </span>
                            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              배정 완료 {group.assignedCount}건 · 미배정 {group.unassignedCount}건
              </span>
            </div>
                          <p
                            className={`mt-1.5 mb-0 truncate text-xs leading-relaxed ${
                              isDark ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            대표: {group.representativeMessage}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenGroups((prev) => ({
                              ...prev,
                              [group.key]: !prev[group.key],
                            }))
                          }
                          className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
                  isDark
                              ? 'border-slate-600 bg-slate-900/60 text-slate-200 hover:bg-slate-700'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                          {isOpen ? '접기' : '펼치기'}
                        </button>
              </div>
                      {isOpen ? (
                        <div
                          className={`border-t px-3.5 py-2.5 ${
                            isDark ? 'border-slate-700' : 'border-slate-100'
                          }`}
                        >
                          <ul className="m-0 list-none space-y-1.5 p-0">
                            {visibleItems.map((issue) => {
                              const isDetailOpen = detailIssueId === issue.id;
                              const reason =
                                issue.analysis?.riskReason?.trim() ||
                                issue.issueContent ||
                                '진단 정보 없음';
                              const spc = issue.analysis?.spcStatus ?? issue.listSpcStatus ?? '—';
                              const prob = formatAnalysisProbability(issue.analysis?.probability).label;
                              return (
                  <li
                    key={issue.id}
                                  className={`rounded-lg px-2.5 py-2 ${
                                    isDark ? 'bg-slate-900/50' : 'bg-slate-50'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                    <span
                                      className={`font-semibold ${
                                        isDark ? 'text-blue-300' : 'text-blue-700'
                                      }`}
                                    >
                      {issue.id}
                    </span>
                                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                                      {issue.lot}
                    </span>
                                    <span style={{ ...badgeBase, ...riskStyle(issue.risk, isDark) }}>
                                      {issue.analysis?.riskLevel ?? issue.risk}
                                    </span>
                                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                                      {displayAssigneeName(issue.assignee)}
                                    </span>
                                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                                      {issue.processStatus}
                                    </span>
                                    <span
                                      className={`min-w-0 flex-1 truncate ${
                                        isDark ? 'text-slate-300' : 'text-slate-700'
                                      }`}
                                    >
                                      {summarizeIssueLine(issue)}
                                    </span>
                                    <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>
                                      {issue.createdAt}
            </span>
            <button
              type="button"
                                      onClick={() =>
                                        setDetailIssueId((prev) => (prev === issue.id ? null : issue.id))
                                      }
                                      className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                                        isDark
                                          ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                                          : 'border-slate-200 text-slate-600 hover:bg-white'
                                      }`}
                                    >
                                      {isDetailOpen ? '닫기' : '상세 보기'}
            </button>
          </div>
                                  {isDetailOpen ? (
                                    <p
                                      className={`mt-1.5 mb-0 break-keep text-xs leading-relaxed ${
                                        isDark ? 'text-slate-400' : 'text-slate-600'
                                      }`}
                                    >
                                      SPC {spc} · 확률 {prob}
                                      <br />
                                      {reason}
                                    </p>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {canShowMore ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setVisibleCounts((prev) => ({
                                    ...prev,
                                    [group.key]:
                                      (prev[group.key] ?? ISSUE_GROUP_VISIBLE_STEP) +
                                      ISSUE_GROUP_VISIBLE_STEP,
                                  }))
                                }
                                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
                  isDark
                                    ? 'border-slate-600 bg-slate-900/60 text-slate-200 hover:bg-slate-700'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                더 보기 (+{ISSUE_GROUP_VISIBLE_STEP})
          </button>
                            ) : null}
                  <button
                    type="button"
                              onClick={() => {
                                setVisibleCounts((prev) => ({
                                  ...prev,
                                  [group.key]: ISSUE_GROUP_VISIBLE_STEP,
                                }));
                                setOpenGroups((prev) => ({ ...prev, [group.key]: false }));
                              }}
                              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
                                isDark
                                  ? 'border-slate-600 bg-transparent text-slate-300 hover:bg-slate-700'
                                  : 'border-slate-200 bg-transparent text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              접기
                  </button>
                </div>
              </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
        )}
      </section>
        </div>
      </div>
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
}: IssueListSectionProps) => {
  const { isDark } = useUiSettings();
  const c = getUiColors(isDark);

  return (
  <section style={getPanelStyle(c)}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ margin: 0, color: c.navy, fontSize: 19 }}>이슈 목록</h2>
        <p style={{ margin: '4px 0 0', color: c.slate, fontSize: 12 }}>
          행 클릭 → 상세 선택
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
      <div className="w-[140px]">
        <label htmlFor="issue-assignment" style={getLabelStyle(c)}>
          담당 상태
        </label>
        <select
          id="issue-assignment"
          value={filters.assignment}
          onChange={(event) => onFilterChange('assignment', event.target.value)}
          style={getFilterControlStyle(c)}
        >
          <option value="">전체</option>
          <option value="assigned">배정 완료</option>
          <option value="unassigned">미배정</option>
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
        <table className="w-full min-w-[1040px] border-collapse text-left">
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
              <th className="whitespace-nowrap px-4 py-2.5 font-semibold">담당 실무자</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-semibold">처리 상태</th>
              <th className="min-w-[280px] px-4 py-2.5 font-semibold">이슈 내용</th>
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
                    className={`whitespace-nowrap px-4 py-3 text-xs font-semibold ${
                      hasAssigneeName(issue.assignee)
                        ? isDark
                          ? 'text-slate-200'
                          : 'text-slate-800'
                        : isDark
                          ? 'text-slate-500'
                          : 'text-slate-400'
                    }`}
                  >
                    {displayAssigneeName(issue.assignee)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        issue.processStatus === '미배정'
                          ? isDark
                            ? 'bg-slate-700 text-slate-300'
                            : 'bg-slate-100 text-slate-600'
                          : issue.processStatus === '접수'
                            ? isDark
                              ? 'bg-blue-950/50 text-blue-300'
                              : 'bg-blue-50 text-blue-700'
                            : issue.processStatus === '처리 중'
                              ? isDark
                                ? 'bg-amber-950/40 text-amber-300'
                                : 'bg-amber-50 text-amber-700'
                              : issue.processStatus === '처리 완료'
                                ? isDark
                                  ? 'bg-emerald-950/40 text-emerald-300'
                                  : 'bg-emerald-50 text-emerald-700'
                                : isDark
                                  ? 'bg-violet-950/40 text-violet-300'
                                  : 'bg-violet-50 text-violet-700'
                      }`}
                    >
                      {issue.processStatus}
                    </span>
                  </td>
                  <td
                    className={`max-w-[420px] px-4 py-3 text-sm font-semibold ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    <span className="line-clamp-2">{issue.issueContent}</span>
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

const ManagementSection = ({
  issue,
  form,
  managers,
  message,
  canSave,
  isSaving = false,
  onChange,
  onAssign,
  onRequestUnassign,
  onSave,
}: ManagementSectionProps) => {
  const { isDark } = useUiSettings();
  const c = getUiColors(isDark);
  const saveDisabled = !issue || !canSave || isSaving;
  const hasAssignee = hasAssigneeName(issue?.assignee);

  return (
  <section
    id="issue-management"
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
        ? `${issue.id} · 저장하면 목록에서 사라지고 과거 자료로 이동합니다.`
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
            <label htmlFor="manager-assignee" style={getLabelStyle(c)}>담당 실무자</label>
            <input
              id="manager-assignee"
              value={form.assignee}
              maxLength={ASSIGNEE_NAME_MAX_LENGTH}
              onChange={(event) => onChange('assignee', event.target.value)}
              placeholder="담당자 이름 입력"
              list="issue-practitioner-name-options"
              style={getInputStyle(c)}
            />
            <datalist id="issue-practitioner-name-options">
              {PRACTITIONER_NAMES.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 10,
              }}
            >
              <button
                type="button"
                onClick={onAssign}
                disabled={!issue || isSaving}
                className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                담당자 지정
              </button>
              <button
                type="button"
                onClick={onRequestUnassign}
                disabled={!issue || !hasAssignee || isSaving}
                className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs font-bold ${
                  isDark
                    ? 'border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800 disabled:opacity-50'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                }`}
              >
                담당자 지정 해제
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="manager-status" style={getLabelStyle(c)}>처리 상태</label>
            <select
              id="manager-status"
              value={form.processStatus}
              onChange={(event) =>
                onChange('processStatus', event.target.value as IssueProcessStatus)
              }
              style={getInputStyle(c)}
            >
              <option value="미배정">미배정</option>
              <option value="접수">접수</option>
              <option value="처리 중">처리 중</option>
              <option value="처리 완료">처리 완료</option>
              <option value="종결">종결</option>
            </select>
          </div>
          <div>
            <label style={getLabelStyle(c)}>배정 시각</label>
            <div
              style={{
                ...getInputStyle(c),
                minHeight: 42,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {issue?.assignedAt ?? '—'}
        </div>
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
  processStatus: '미배정',
  action: '',
  completed: false,
};

const EMPTY_FILTERS: FilterState = {
  search: '',
  date: '',
  lot: '',
  risk: '',
  spc: '',
  assignment: '',
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

function IssuePageContent() {
  const { isDark } = useUiSettings();
  const { setPagePayload, trackPageChatEvent } = usePageChat();
  const searchParams = useSearchParams();
  const deepLinkAppliedRef = useRef<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isListRefreshing, setIsListRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [managementForm, setManagementForm] = useState<ManagementForm>(EMPTY_FORM);
  const [managers, setManagers] = useState<IssueManager[]>([]);
  const [reportNotice, setReportNotice] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showUnassignConfirm, setShowUnassignConfirm] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const prevSelectedIdRef = useRef<string | null>(null);
  const detailRequestRef = useRef(0);

  const loadIssues = async () => {
    setIsListRefreshing(true);
    try {
      const { data } = await issueApi.list();
      setIssues((current) =>
        data.issues.map((item) => {
          const mapped = mapIssueListItem(item);
          const previous = current.find((issue) => issue.id === mapped.id);
          if (previous) {
            return {
              ...mapped,
              assignee: previous.assignee,
              assignedAt: previous.assignedAt,
              processStatus: previous.processStatus,
              assignmentDirty: previous.assignmentDirty,
              action: previous.action || mapped.action,
              analysis: previous.analysis ?? mapped.analysis,
            };
          }
          return withLoginAutoAssignee(mapped);
        }),
      );
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
  }, []);

  useEffect(() => {
    void issueApi
      .listManagers()
      .then(({ data }) => setManagers(data.managers ?? []))
      .catch(() => setManagers([]));
  }, []);

  useShellRefresh(() => {
    void loadIssues();
  });

  useEffect(() => {
    if (issues.length === 0) return;
    const issueId = searchParams.get('issueId')?.trim() || '';
    const lotId = searchParams.get('lotId')?.trim() || '';
    if (!issueId && !lotId) return;

    const key = `${issueId}|${lotId}`;
    if (deepLinkAppliedRef.current === key) return;

    const match = issueId
      ? issues.find((issue) => issue.id === issueId && !isIssueCompleted(issue))
      : issues.find((issue) => issue.lot === lotId && !isIssueCompleted(issue));

    deepLinkAppliedRef.current = key;

    if (!match) {
      setToastMessage(
        issueId
          ? `${issueId} 미완료 이슈를 찾을 수 없습니다.`
          : `${lotId}의 미완료 이슈가 없습니다.`,
      );
      setShowToast(true);
      return;
    }

    setDraftFilters((current) => ({ ...current, lot: match.lot }));
    setAppliedFilters((current) => ({ ...current, lot: match.lot }));
    setCurrentPage(1);

    const actionDraft = readIssueActionDraft(match.lot);
    void handleSelectIssue(match.id, {
      actionOverride: actionDraft,
      scrollTo: 'action',
    });
  }, [issues, searchParams]);

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
      const matchesAssignment =
        !appliedFilters.assignment ||
        (appliedFilters.assignment === 'assigned'
          ? hasAssigneeName(issue.assignee)
          : !hasAssigneeName(issue.assignee));
      return (
        matchesSearch &&
        matchesDate &&
        matchesLot &&
        matchesRisk &&
        matchesSpc &&
        matchesAssignment
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
    setPagePayload(
      '/issue',
      {
        filters: appliedFilters,
        totalOpen: filteredIssues.length,
        page: safePage,
        issues: paginatedIssues.slice(0, 15).map((issue) => ({
          issueId: issue.id,
          lotId: issue.lot,
          risk: issue.risk,
          date: issue.date,
          issueContent: issue.issueContent.slice(0, 200),
          assignee: displayAssigneeName(issue.assignee),
          processStatus: issue.processStatus,
          completed: issue.completed,
          spc: issue.analysis?.spcStatus ?? issue.listSpcStatus,
        })),
        selected: selectedIssue
          ? {
              issueId: selectedIssue.id,
              lotId: selectedIssue.lot,
              risk: selectedIssue.risk,
              issueContent: selectedIssue.issueContent.slice(0, 400),
              assignee: displayAssigneeName(selectedIssue.assignee),
              processStatus: selectedIssue.processStatus,
              action: selectedIssue.action.slice(0, 400),
              completed: selectedIssue.completed,
              analysis: selectedIssue.analysis,
            }
          : null,
      },
      ['issues'],
    );
  }, [
    setPagePayload,
    appliedFilters,
    filteredIssues.length,
    safePage,
    paginatedIssues,
    selectedIssue,
  ]);

  useEffect(() => {
    if (!selectedId) {
      trackPageChatEvent({ type: 'clear', route: '/issue', target: 'issue-row' });
      return;
    }
    if (!filteredIssues.some((issue) => issue.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredIssues, selectedId, trackPageChatEvent]);

  /** 저장 = 완료 처리. 기존 완료 API는 유지하되 담당자/조치 검증을 선행한다. */
  const canSave = useMemo(() => {
    if (!selectedIssue || isSaving) return false;
    if (!hasAssigneeName(selectedIssue.assignee)) return false;
    if (!managementForm.action.trim()) return false;
    return !selectedIssue.completed || managementForm.action !== selectedIssue.action;
  }, [isSaving, managementForm.action, selectedIssue]);

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

    const lotId = searchParams.get('lotId')?.trim();
    const copied = (lotId && issue.lot === lotId ? readIssueActionDraft(lotId) : null)?.trim() || '';
    const preserveAction =
      Boolean(copied) ||
      (deepLinkAppliedRef.current &&
        Boolean(managementForm.action) &&
        managementForm.action !== issue.action);
    const newForm = {
      assignee: issue.assignee,
      processStatus: issue.processStatus,
      completed: issue.completed,
      action: copied || (preserveAction ? managementForm.action : issue.action),
    };

    setManagementForm(newForm);
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

  const handleSelectIssue = async (
    id: string,
    options?: { actionOverride?: string | null; scrollTo?: 'analysis' | 'action' },
  ) => {
    const requestId = ++detailRequestRef.current;
    setSelectedId(id);
    trackPageChatEvent({
      type: 'row_click',
      route: '/issue',
      target: 'issue-row',
      entityId: id,
      payload: { issueId: id },
    });
    const scrollTarget =
      options?.scrollTo === 'action' ? 'manager-action' : 'issue-detail-analysis';
    window.setTimeout(() => {
      document
        .getElementById(scrollTarget)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);

    try {
      const { data } = await issueApi.getById(id);
      if (requestId !== detailRequestRef.current) return;
      let mergedIssue: Issue | null = null;
      setIssues((current) =>
        current.map((issue) => {
          if (issue.id !== id) return issue;
          mergedIssue = withLoginAutoAssignee(mergeIssueDetail(issue, data.issue));
          return mergedIssue;
        }),
      );
      trackPageChatEvent({
        type: 'row_select',
        route: '/issue',
        target: 'issue-detail',
        entityId: data.issue.issueId,
        payload: {
          issueId: data.issue.issueId,
          lotId: data.issue.lotId,
          risk: normalizeIssueRiskLevel(data.issue.riskLevel),
          issueContent: (data.issue.issueContent ?? '').slice(0, 400),
          assignee: data.issue.assigneeName?.trim() || '미배정',
          action: (data.issue.actionContent ?? '').slice(0, 400),
          completed: data.issue.completed,
          analysis: data.issue.analysis
            ? {
                lotId: data.issue.analysis.lotId,
                probability: data.issue.analysis.probability,
                spcStatus: data.issue.analysis.spcStatus,
                riskLevel: normalizeIssueRiskLevel(data.issue.analysis.riskLevel),
                riskReason: data.issue.analysis.riskReason,
                createdAt: data.issue.analysis.createdAt,
                scoredAt: data.issue.analysis.scoredAt,
              }
            : null,
        },
      });
      const copied = options?.actionOverride?.trim() || '';
      const resolvedIssue =
        mergedIssue ??
        withLoginAutoAssignee(
          mergeIssueDetail(
            {
              id: data.issue.issueId,
              createdAt: data.issue.createdAt,
              date: data.issue.createdAt.slice(0, 10),
              lot: data.issue.lotId,
              risk: normalizeIssueRiskLevel(data.issue.riskLevel),
              issueContent: data.issue.issueContent,
              assignee: '',
              assignedAt: null,
              processStatus: '미배정',
              action: data.issue.actionContent ?? '',
              completed: data.issue.completed,
              assignmentDirty: false,
              analysis: null,
              listSpcStatus: data.issue.spcStatus ?? null,
            },
            data.issue,
          ),
        );
      setManagementForm({
        assignee: resolvedIssue.assignee,
        processStatus: resolvedIssue.processStatus,
        action: copied || resolvedIssue.action,
        completed: resolvedIssue.completed,
      });
      setSaveMessage('');
      if (copied) {
        clearIssueActionDraft();
        setToastMessage('조치 내용을 이슈에 복사했습니다.');
        setShowToast(true);
      }
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
    if (key === 'processStatus') {
      const nextStatus = value as IssueProcessStatus;
      if (!selectedIssue) return;
      if (hasAssigneeName(selectedIssue.assignee) && nextStatus === '미배정') {
        setToastMessage('담당자 지정 해제를 사용해 주세요.');
        setShowToast(true);
        return;
      }
      if (!hasAssigneeName(selectedIssue.assignee) && nextStatus !== '미배정') {
        setToastMessage('담당 실무자를 먼저 지정해 주세요.');
      setShowToast(true);
        return;
      }
      if ((nextStatus === '처리 완료' || nextStatus === '종결') && !managementForm.action.trim()) {
        setToastMessage('처리 완료로 변경하려면 조치 내용을 입력해 주세요.');
        setShowToast(true);
        return;
      }
      setIssues((current) =>
        current.map((issue) =>
          issue.id === selectedIssue.id
            ? {
                ...issue,
                processStatus: hasAssigneeName(issue.assignee) ? nextStatus : '미배정',
                assignmentDirty: true,
              }
            : issue,
        ),
      );
    }
    setManagementForm((current) => ({ ...current, [key]: value }));
    setSaveMessage('');
  };

  const handleAssignPractitioner = () => {
    if (!selectedIssue) return;
    const normalized = normalizeAssigneeName(managementForm.assignee);
    const validation = validateAssigneeName(normalized);
    if (validation) {
      setToastMessage(validation);
      setShowToast(true);
      return;
    }
    const assignedAt = formatCurrentDateTime();
    setIssues((current) =>
      current.map((issue) =>
        issue.id === selectedIssue.id
          ? {
              ...issue,
              assignee: normalized,
              assignedAt,
              processStatus: issue.processStatus === '미배정' ? '접수' : issue.processStatus,
              assignmentDirty: true,
            }
          : issue,
      ),
    );
    setManagementForm((current) => ({
      ...current,
      assignee: normalized,
      processStatus: current.processStatus === '미배정' ? '접수' : current.processStatus,
    }));
    setSaveMessage(
      hasAssigneeName(selectedIssue.assignee)
        ? '담당 실무자가 변경되었습니다.'
        : '담당 실무자가 지정되었습니다.',
    );
  };

  const handleRequestUnassign = () => {
    if (!selectedIssue || !hasAssigneeName(selectedIssue.assignee)) return;
    setShowUnassignConfirm(true);
  };

  const handleConfirmUnassign = () => {
    if (!selectedIssue) return;
    setShowUnassignConfirm(false);
    setIssues((current) =>
      current.map((issue) =>
        issue.id === selectedIssue.id
          ? {
              ...issue,
              assignee: '',
              assignedAt: null,
              processStatus: '미배정',
              assignmentDirty: true,
            }
          : issue,
      ),
    );
    setManagementForm((current) => ({
      ...current,
      assignee: '',
      processStatus: '미배정',
    }));
    setSaveMessage('담당자 지정이 해제되었습니다.');
  };


  const enrichIssuesForReport = useCallback(async (targets: Issue[]): Promise<Issue[]> => {
    return Promise.all(
      targets.map(async (issue) => {
        if (issue.analysis) return issue;
        try {
          const { data } = await issueApi.getById(issue.id);
          return mergeIssueDetail(issue, data.issue);
        } catch {
          return issue;
        }
      }),
    );
  }, []);

  const handleGenerateReport = () => {
    setReportNotice('보고서 미리보기를 열었습니다.');
    setIsReportOpen(true);
  };

  const handleCompleteIssue = async () => {
    if (!selectedIssue || isSaving) return;

    const issueId = selectedIssue.id;

    setShowSaveConfirm(false);
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
    } catch (error) {
      setToastMessage(getApiErrorMessage(error, '이슈 완료 처리에 실패했습니다.'));
      setShowToast(true);
      } finally {
        setIsSaving(false);
      }
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedIssue || isSaving) return;
    if (!hasAssigneeName(selectedIssue.assignee)) {
      setToastMessage('담당 실무자를 먼저 지정해 주세요.');
      setShowToast(true);
      return;
    }
    if (!managementForm.action.trim()) {
      setToastMessage('처리 완료로 변경하려면 조치 내용을 입력해 주세요.');
    setShowToast(true);
      return;
    }
    if (!canSave) return;
    setShowSaveConfirm(true);
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
        <HeaderIssueSection
          notice={reportNotice}
          onGenerate={handleGenerateReport}
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
              <IssueDetailAnalysis
                issue={
                  selectedIssue
                    ? {
                        issueId: selectedIssue.id,
                        lotId: selectedIssue.lot,
                        createdAt: selectedIssue.createdAt,
                        issueContent: selectedIssue.issueContent,
                        riskLevel: selectedIssue.analysis?.riskLevel ?? selectedIssue.risk,
                        listSpcStatus: selectedIssue.listSpcStatus,
                        analysis: selectedIssue.analysis,
                      }
                    : null
                }
              />
            </div>
            <div style={{ minHeight: 0, height: '100%' }}>
            <ManagementSection
              issue={selectedIssue}
              form={managementForm}
                managers={managers}
              message={saveMessage}
              canSave={canSave}
              isSaving={isSaving}
              onChange={handleFormChange}
                onAssign={handleAssignPractitioner}
                onRequestUnassign={handleRequestUnassign}
              onSave={handleSave}
            />
          </div>
        </div>
      </div>
      </div>
      {isReportOpen ? (
        <IssueReportModal
          issues={issues}
          lots={lots}
          onClose={() => setIsReportOpen(false)}
          onEnrichIssues={enrichIssuesForReport}
        />
      ) : null}
      {showSaveConfirm ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-save-confirm-title"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/55 p-4"
          onClick={() => {
            if (!isSaving) setShowSaveConfirm(false);
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className={`w-[min(100%,440px)] rounded-xl border shadow-2xl ${
              isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="break-keep px-6 pb-5 pt-6 text-center">
              <p
                id="issue-save-confirm-title"
                className={`m-0 text-lg font-bold ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                저장 확인
              </p>
              <p
                className={`mt-3 m-0 text-sm leading-relaxed ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                조치 내용을 저장하고 이슈를 완료 처리합니다.
                <br />
                계속하시겠습니까?
              </p>
            </div>
            <div
              className={`grid grid-cols-2 gap-3 border-t px-6 py-4 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}
            >
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setShowSaveConfirm(false)}
                className={`rounded-lg border px-4 py-2.5 text-sm font-semibold ${
                  isDark
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-50'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50'
                }`}
              >
                아니오
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  void handleCompleteIssue();
                }}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? '저장 중...' : '예'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showUnassignConfirm ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-unassign-confirm-title"
          className="fixed inset-0 z-[111] flex items-center justify-center bg-slate-900/55 p-4"
          onClick={() => setShowUnassignConfirm(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className={`w-[min(100%,420px)] rounded-xl border shadow-2xl ${
              isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="break-keep px-6 pb-5 pt-6 text-center">
              <p
                id="issue-unassign-confirm-title"
                className={`m-0 text-lg font-bold ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                담당자 지정 해제
              </p>
              <p
                className={`mt-3 m-0 text-sm leading-relaxed ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                담당자 지정을 해제하시겠습니까?
              </p>
            </div>
            <div
              className={`grid grid-cols-2 gap-3 border-t px-6 py-4 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setShowUnassignConfirm(false)}
                className={`rounded-lg border px-4 py-2.5 text-sm font-semibold ${
                  isDark
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                아니오
              </button>
              <button
                type="button"
                onClick={handleConfirmUnassign}
                className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500"
              >
                예
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

export default function IssuePage() {
  return (
    <Suspense fallback={null}>
      <IssuePageContent />
    </Suspense>
  );
}
