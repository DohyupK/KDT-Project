'use client'

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useUiSettings } from '@/components/layout/AppShell';

interface ProcessData {
  time: string;
  temperature: number;
  pressure: number;
  speed: number;
  riskBefore: number;
  riskAfter: number;
}

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
}

interface FilterState {
  search: string;
  date: string;
  lot: string;
  risk: '' | Issue['risk'];
  status: '' | Issue['status'];
}

interface HandoverData {
  period: string;
  averageTemperature: number;
  averagePressure: number;
  averageSpeed: number;
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
  filters: FilterState;
  lots: string[];
  selectedId: string | null;
  onFilterChange: (key: keyof FilterState, value: string) => void;
  onApplyFilter: () => void;
  onResetFilter: () => void;
  onSelect: (id: string) => void;
}

interface DetailAnalysisSectionProps {
  issue: Issue | null;
}

interface ManagementSectionProps {
  issue: Issue | null;
  form: ManagementForm;
  message: string;
  canSave: boolean;
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
}

interface HandoverNoteSectionProps {
  notes: HandoverNote[];
  onAdd: (note: Omit<HandoverNote, 'id' | 'createdAt'>) => void;
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
    speed: 34 + (index % 3),
    riskBefore: before[index],
    riskAfter: after[index],
  }));

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
  },
  {
    id: 'ISS-260721-016',
    occurredAt: '2026-07-21 11:05',
    date: '2026-07-21',
    lot: 'LOT-CA-260721-05',
    risk: '낮음',
    status: '완료',
    title: '혼합기 진동 센서 일시 이상',
    assignee: '이도윤',
    action: '센서 커넥터를 재체결하고 정상 신호 수신을 확인했습니다.',
    completed: true,
    anomaly: '진동 센서 신호가 4분간 단절되었으나 설비 실측 진동값은 정상 범위였습니다.',
    processData: createProcessData(
      [735, 736, 737, 738, 737, 736],
      [1.7, 1.7, 1.8, 1.8, 1.7, 1.7],
      [24, 28, 36, 33, 27, 22],
      [20, 22, 25, 23, 20, 18],
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
  },
];

const HANDOVER_DATA: HandoverData = {
  period: '2026-07-21 08:00 ~ 16:00',
  averageTemperature: 742.6,
  averagePressure: 1.94,
  averageSpeed: 35.2,
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
  const metrics = [
    { label: language === 'en' ? 'Avg. Temp' : '평균 온도', value: `${data.averageTemperature}°C`, alert: false },
    { label: language === 'en' ? 'Avg. Pressure' : '평균 압력', value: `${data.averagePressure} bar`, alert: false },
    { label: language === 'en' ? 'Avg. Speed' : '평균 속도', value: `${data.averageSpeed} rpm`, alert: false },
    { label: language === 'en' ? 'AI Risk' : 'AI 예측 위험', value: `${data.aiRiskPredictions}`, alert: false },
    { label: language === 'en' ? 'Risky LOTs' : '위험 LOT', value: `${data.riskyLots}`, alert: true },
    { label: language === 'en' ? 'Issues' : '발생 이슈', value: `${data.issueCount}`, alert: true },
  ];

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
        <div>
          <h1 style={{ margin: 0, color: c.navy, fontSize: 30, letterSpacing: '-0.03em' }}>
            {language === 'en' ? 'Issue Management' : '이슈 관리'}
          </h1>
          <p style={{ margin: '9px 0 0', color: c.slate, fontSize: 15 }}>
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
      <div style={getPanelStyle(c)}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 18,
          }}
        >
          <h2 style={{ margin: 0, color: c.navy, fontSize: 18 }}>이전 8시간 공정 요약</h2>
          <span style={{ color: c.muted, fontSize: 12 }}>{data.period}</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className={`rounded-xl border p-4 shadow-sm ${
                isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200/80 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {metric.label}
                </div>
                {metric.alert ? (
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                      isDark
                        ? 'border-rose-800 bg-rose-950/40 text-rose-300'
                        : 'border-rose-100 bg-rose-50 text-rose-600'
                    }`}
                  >
                    주의
                  </span>
                ) : null}
              </div>
              <div
                className={`mt-2 text-xl font-bold tracking-tight ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                {metric.value}
              </div>
            </div>
          ))}
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
  const [handoverFrom, setHandoverFrom] = useState('김현수');
  const [handoverTo, setHandoverTo] = useState('박서연');
  const [partyError, setPartyError] = useState('');

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
                    onChange={(event) => {
                      setHandoverFrom(event.target.value);
                      if (partyError) setPartyError('');
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none focus:border-blue-400 ${
                      isDark
                        ? 'border-slate-600 bg-slate-950/40 text-slate-100'
                        : 'border-slate-200 bg-white text-slate-900'
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
                    onChange={(event) => {
                      setHandoverTo(event.target.value);
                      if (partyError) setPartyError('');
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none focus:border-blue-400 ${
                      isDark
                        ? 'border-slate-600 bg-slate-950/40 text-slate-100'
                        : 'border-slate-200 bg-white text-slate-900'
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

const CURRENT_USER_STORAGE_KEY = 'kdt-current-user';
/** 로그인 미연동 시 데모용 기본 로그인 사용자 */
const FALLBACK_LOGGED_IN_USER = '김현수';

function getLoggedInUserName(): string {
  if (typeof window === 'undefined') return FALLBACK_LOGGED_IN_USER;
  try {
    const raw = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { name?: string; userName?: string };
      const name = parsed.name?.trim() || parsed.userName?.trim();
      if (name) return name;
    }
  } catch {
    // ignore parse errors — fall through to default
  }
  return FALLBACK_LOGGED_IN_USER;
}

function formatShiftRange(start: string, end: string): string {
  if (!start && !end) return '';
  return `${start || '--:--'} ~ ${end || '--:--'}`;
}

const HandoverNoteSection = ({ notes, onAdd, onRemove, onClose }: HandoverNoteSectionProps) => {
  const { isDark } = useUiSettings();
  const c = getUiColors(isDark);
  const [author] = useState(() => getLoggedInUserName());
  const [category, setCategory] = useState<HandoverNote['category']>('특이사항');
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('16:00');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!author.trim()) {
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
    onAdd({
      author: author.trim(),
      category,
      content: content.trim(),
      shiftStart,
      shiftEnd,
    });
    setContent('');
    setError('');
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
            style={{
              border: 0,
              borderRadius: 10,
              background: c.blue,
              color: '#fff',
              padding: '11px 18px',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            인수인계 사항 등록
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
  filters,
  lots,
  selectedId,
  onFilterChange,
  onApplyFilter,
  onResetFilter,
  onSelect,
}: IssueListSectionProps) => {
  const { isDark } = useUiSettings();
  const c = getUiColors(isDark);

  return (
  <section style={getPanelStyle(c)}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
      <h2 style={{ margin: 0, color: c.navy, fontSize: 19 }}>이슈 목록</h2>
      <span style={{ color: c.slate, fontSize: 13, fontWeight: 700 }}>
        검색 결과 {issues.length}건
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
        <input
          id="issue-date"
          type="date"
          value={filters.date}
          onChange={(event) => onFilterChange('date', event.target.value)}
          style={{ ...getFilterControlStyle(c), colorScheme: isDark ? 'dark' : 'light' }}
          className={isDark ? '[color-scheme:dark]' : '[color-scheme:light]'}
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
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[880px] border-collapse text-left">
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
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => {
              const selected = issue.id === selectedId;
              return (
                <tr
                  key={issue.id}
                  onClick={() => onSelect(issue.id)}
                  className={`cursor-pointer border-b border-l-4 transition-all ${
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </section>
  );
};

const LineChart = ({
  data,
  dataKey,
  color,
  min,
  max,
}: {
  data: ProcessData[];
  dataKey: 'temperature' | 'pressure';
  color: string;
  min: number;
  max: number;
}) => {
  const { isDark } = useUiSettings();
  const c = getUiColors(isDark);
  const width = 560;
  const height = 180;
  const pad = 26;
  const range = max - min;
  const points = data
    .map((item, index) => {
      const x = pad + (index * (width - pad * 2)) / Math.max(data.length - 1, 1);
      const y = height - pad - ((item[dataKey] - min) / range) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${dataKey} 시계열 그래프`}
      style={{ width: '100%', height: 180, display: 'block' }}
    >
      {[0, 1, 2, 3].map((line) => {
        const y = pad + (line * (height - pad * 2)) / 3;
        return <line key={line} x1={pad} y1={y} x2={width - pad} y2={y} stroke={c.line} />;
      })}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((item, index) => {
        const x = pad + (index * (width - pad * 2)) / Math.max(data.length - 1, 1);
        const y = height - pad - ((item[dataKey] - min) / range) * (height - pad * 2);
        return (
          <g key={item.time}>
            <circle cx={x} cy={y} r="5" fill={isDark ? c.panel : '#fff'} stroke={color} strokeWidth="3" />
            <text x={x} y={height - 5} textAnchor="middle" fontSize="11" fill={c.slate}>
              {item.time}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const DetailAnalysisSection = ({ issue }: DetailAnalysisSectionProps) => {
  const { isDark } = useUiSettings();
  const c = getUiColors(isDark);

  if (!issue) {
    return (
      <section style={{ ...getPanelStyle(c), minHeight: 220, display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', color: c.slate }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>⌁</div>
          <strong>목록에서 이슈를 선택하면 상세 분석 데이터가 표시됩니다.</strong>
        </div>
      </section>
    );
  }

  return (
    <section style={getPanelStyle(c)}>
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
            {issue.id} · {issue.lot}
          </div>
        </div>
        <span style={{ ...badgeBase, ...riskStyle(issue.risk, isDark) }}>위험도 {issue.risk}</span>
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
          marginBottom: 20,
        }}
      >
        <strong>이상 징후 요약</strong>
        <div style={{ marginTop: 4 }}>{issue.anomaly}</div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ border: `1px solid ${c.line}`, borderRadius: 14, padding: 16 }}>
          <h3 style={{ margin: 0, color: c.navy, fontSize: 14 }}>시간대별 온도 변화 (°C)</h3>
          <LineChart data={issue.processData} dataKey="temperature" color={c.red} min={720} max={765} />
        </div>
        <div style={{ border: `1px solid ${c.line}`, borderRadius: 14, padding: 16 }}>
          <h3 style={{ margin: 0, color: c.navy, fontSize: 14 }}>시간대별 압력 변화 (bar)</h3>
          <LineChart data={issue.processData} dataKey="pressure" color={c.cyan} min={1.3} max={3} />
        </div>
      </div>

      <div style={{ border: `1px solid ${c.line}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 14px', color: c.navy, fontSize: 14 }}>
          AI 위험 점수 Before / After
        </h3>
        <div style={{ display: 'grid', gap: 11 }}>
          {issue.processData.map((item) => (
            <div
              key={item.time}
              style={{
                display: 'grid',
                gridTemplateColumns: '34px 1fr 1fr',
                alignItems: 'center',
                gap: 10,
                fontSize: 11,
                color: c.slate,
              }}
            >
              <strong>{item.time}</strong>
              <div
                style={{
                  height: 18,
                  background: isDark ? 'rgba(76, 5, 25, 0.4)' : '#fee2e2',
                  borderRadius: 999,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${item.riskBefore}%`,
                    height: '100%',
                    background: c.red,
                    borderRadius: 999,
                  }}
                  title={`Before ${item.riskBefore}`}
                />
              </div>
              <div
                style={{
                  height: 18,
                  background: isDark ? 'rgba(6, 78, 59, 0.4)' : '#dcfce7',
                  borderRadius: 999,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${item.riskAfter}%`,
                    height: '100%',
                    background: c.green,
                    borderRadius: 999,
                  }}
                  title={`After ${item.riskAfter}`}
                />
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, fontSize: 11 }}>
            <span style={{ color: c.red }}>■ Before</span>
            <span style={{ color: c.green }}>■ After</span>
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620, fontSize: 13 }}>
          <thead>
            <tr style={{ background: isDark ? '#0f172a' : '#f8fafc', color: c.slate }}>
              {['시간', '온도(°C)', '압력(bar)', '속도(rpm)', '위험 Before', '위험 After'].map((heading) => (
                <th
                  key={heading}
                  style={{ padding: 11, borderBottom: `1px solid ${c.line}`, textAlign: 'center' }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {issue.processData.map((item) => (
              <tr key={item.time} style={{ color: c.navy }}>
                <td style={{ padding: 10, borderBottom: `1px solid ${c.line}`, textAlign: 'center' }}>{item.time}</td>
                <td style={{ padding: 10, borderBottom: `1px solid ${c.line}`, textAlign: 'center' }}>{item.temperature}</td>
                <td style={{ padding: 10, borderBottom: `1px solid ${c.line}`, textAlign: 'center' }}>{item.pressure}</td>
                <td style={{ padding: 10, borderBottom: `1px solid ${c.line}`, textAlign: 'center' }}>{item.speed}</td>
                <td style={{ padding: 10, borderBottom: `1px solid ${c.line}`, textAlign: 'center', color: c.red, fontWeight: 800 }}>{item.riskBefore}</td>
                <td style={{ padding: 10, borderBottom: `1px solid ${c.line}`, textAlign: 'center', color: c.green, fontWeight: 800 }}>{item.riskAfter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const ManagementSection = ({
  issue,
  form,
  message,
  canSave,
  onChange,
  onSave,
}: ManagementSectionProps) => {
  const { isDark } = useUiSettings();
  const c = getUiColors(isDark);

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
              onChange={(event) => onChange('assignee', event.target.value)}
              placeholder="담당자 이름"
              style={getInputStyle(c)}
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
          disabled={!issue || !canSave}
          style={{
            width: '100%',
            border: 0,
            borderRadius: 11,
            background: issue && canSave ? (isDark ? c.blue : c.navy) : c.muted,
            color: '#fff',
            padding: '12px 18px',
            fontSize: 14,
            fontWeight: 800,
            cursor: issue && canSave ? 'pointer' : 'not-allowed',
            opacity: issue && canSave ? 1 : 0.65,
          }}
        >
          저장
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
};

const COMPLETED_KNOWLEDGE_STORAGE_KEY = 'completed_knowledge_logs';
const HANDOVER_ACTION_STORAGE_KEY = 'handover_action_logs';

type TransferredKnowledgeLog = {
  id: string;
  sourceIssueId: string;
  manager: string;
  date: string;
  title: string;
  summary: string;
  process: string;
  lot: string;
  detail: string;
};

type HandoverActionLog = {
  id: number;
  sourceNoteId: number;
  situation: string;
  action: string;
  cause: string;
  manager: string;
  date: string;
  category: HandoverNote['category'];
  handoverFrom: string;
  handoverTo: string;
};

function formatKnowledgeDate() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTransferredKnowledgeId(issueId: string) {
  return `DOC-${issueId}`;
}

function readCompletedKnowledgeLogs(): TransferredKnowledgeLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(COMPLETED_KNOWLEDGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TransferredKnowledgeLog => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Record<string, unknown>;
      return typeof row.id === 'string' && row.id.length > 0;
    });
  } catch {
    return [];
  }
}

function mapIssueToKnowledgeLog(issue: Issue): TransferredKnowledgeLog {
  const actionText = issue.action.trim();
  const anomalyText = issue.anomaly.trim();
  const detailParts = [
    `원본 이슈: ${issue.id}`,
    `제목: ${issue.title}`,
    issue.lot ? `LOT: ${issue.lot}` : '',
    issue.assignee ? `담당자: ${issue.assignee}` : '',
    anomalyText ? `이상 징후: ${anomalyText}` : '',
    actionText ? `조치 내용: ${actionText}` : '',
  ].filter(Boolean);

  return {
    id: toTransferredKnowledgeId(issue.id),
    sourceIssueId: issue.id,
    manager: issue.assignee,
    date: formatKnowledgeDate(),
    title: issue.title,
    summary: actionText || anomalyText || issue.title,
    process: '',
    lot: issue.lot,
    detail: detailParts.join('\n'),
  };
}

/** @returns 'added' | 'exists' | 'failed' */
function appendCompletedKnowledgeLog(issue: Issue): 'added' | 'exists' | 'failed' {
  if (typeof window === 'undefined') return 'failed';
  try {
    const current = readCompletedKnowledgeLogs();
    const nextId = toTransferredKnowledgeId(issue.id);
    const alreadyExists = current.some(
      (item) =>
        item.id === nextId ||
        (typeof item.sourceIssueId === 'string' && item.sourceIssueId === issue.id),
    );
    if (alreadyExists) return 'exists';
    const next = [mapIssueToKnowledgeLog(issue), ...current];
    window.localStorage.setItem(COMPLETED_KNOWLEDGE_STORAGE_KEY, JSON.stringify(next));
    return 'added';
  } catch {
    return 'failed';
  }
}

function readHandoverActionLogs(): HandoverActionLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HANDOVER_ACTION_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is HandoverActionLog => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Record<string, unknown>;
      return typeof row.id === 'number' && Number.isFinite(row.id);
    });
  } catch {
    return [];
  }
}

function mapHandoverNoteToActionLog(
  note: HandoverNote,
  _relatedIssue: Issue | null,
  party: { from: string; to: string },
): HandoverActionLog {
  const datePart = note.createdAt.slice(0, 10);
  return {
    id: note.id,
    sourceNoteId: note.id,
    situation: note.content.trim(),
    action: '',
    cause: '',
    manager: party.from,
    date: /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : formatKnowledgeDate(),
    category: note.category,
    handoverFrom: party.from,
    handoverTo: party.to,
  };
}

function getTransferredHandoverNoteIds(): number[] {
  const logs = readHandoverActionLogs();
  const ids = new Set<number>();
  for (const item of logs) {
    if (typeof item.sourceNoteId === 'number' && Number.isFinite(item.sourceNoteId)) {
      ids.add(item.sourceNoteId);
    } else if (typeof item.id === 'number' && Number.isFinite(item.id)) {
      ids.add(item.id);
    }
  }
  return Array.from(ids);
}

/** @returns 'added' | 'exists' | 'failed' | 'empty' */
function appendHandoverActionLogs(
  notes: HandoverNote[],
  relatedIssue: Issue | null,
  party: { from: string; to: string },
): 'added' | 'exists' | 'failed' | 'empty' {
  if (typeof window === 'undefined') return 'failed';
  if (notes.length === 0) return 'empty';
  try {
    const current = readHandoverActionLogs();
    const existingIds = new Set(
      current.flatMap((item) => [item.id, item.sourceNoteId].filter((id) => typeof id === 'number')),
    );
    const toAdd = notes
      .filter((note) => !existingIds.has(note.id))
      .map((note) => mapHandoverNoteToActionLog(note, relatedIssue, party));
    if (toAdd.length === 0) return 'exists';
    const next = [...toAdd, ...current];
    window.localStorage.setItem(HANDOVER_ACTION_STORAGE_KEY, JSON.stringify(next));
    return 'added';
  } catch {
    return 'failed';
  }
}

export default function IssuePage() {
  const { isDark } = useUiSettings();
  const [issues, setIssues] = useState<Issue[]>(INITIAL_ISSUES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [managementForm, setManagementForm] = useState<ManagementForm>(EMPTY_FORM);
  const [reportNotice, setReportNotice] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [handoverNotes, setHandoverNotes] = useState<HandoverNote[]>([]);
  const [completedHandoverNoteIds, setCompletedHandoverNoteIds] = useState<number[]>([]);
  const prevSelectedIdRef = useRef<string | null>(null);

  const refreshCompletedHandoverNoteIds = () => {
    setCompletedHandoverNoteIds(getTransferredHandoverNoteIds());
  };

  useEffect(() => {
    refreshCompletedHandoverNoteIds();
  }, []);

  useEffect(() => {
    if (isReportOpen) refreshCompletedHandoverNoteIds();
  }, [isReportOpen]);

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
      const matchesSearch =
        !keyword ||
        issue.title.toLowerCase().includes(keyword) ||
        issue.lot.toLowerCase().includes(keyword);
      const matchesDate = !appliedFilters.date || issue.date === appliedFilters.date;
      const matchesLot = !appliedFilters.lot || issue.lot === appliedFilters.lot;
      const matchesRisk = !appliedFilters.risk || issue.risk === appliedFilters.risk;
      const matchesStatus = !appliedFilters.status || issue.status === appliedFilters.status;
      return matchesSearch && matchesDate && matchesLot && matchesRisk && matchesStatus;
    });
  }, [appliedFilters, issues]);

  const canSave = useMemo(() => {
    if (!selectedIssue) return false;
    return (
      managementForm.status !== selectedIssue.status ||
      managementForm.completed !== selectedIssue.completed ||
      managementForm.assignee !== selectedIssue.assignee ||
      managementForm.action !== selectedIssue.action
    );
  }, [managementForm, selectedIssue]);

  // 행 선택이 바뀔 때만 폼을 채움 (저장으로 issues가 갱신될 때는 유지)
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

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  };

  const handleApplyFilter = () => {
    setAppliedFilters(draftFilters);
  };

  const handleResetFilter = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
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

  const handleAddNote = (note: Omit<HandoverNote, 'id' | 'createdAt'>) => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const newNote: HandoverNote = { ...note, id: Date.now(), createdAt };
    setHandoverNotes((current) => [newNote, ...current]);
  };

  const handleCompleteOneHandover = (noteId: number, party: { from: string; to: string }) => {
    const target = handoverNotes.find((note) => note.id === noteId);
    if (!target) return;
    const transferResult = appendHandoverActionLogs([target], selectedIssue, party);
    if (transferResult === 'added') {
      refreshCompletedHandoverNoteIds();
      setToastMessage(
        '✓ 선택한 인수인계 사항이 라이브러리의 인수인계 이력으로 저장되었습니다.',
      );
      setShowToast(true);
    }
  };

  const handleCompleteAllHandover = (party: { from: string; to: string }) => {
    const pending = handoverNotes.filter((note) => !completedHandoverNoteIds.includes(note.id));
    const transferResult = appendHandoverActionLogs(pending, selectedIssue, party);
    if (transferResult === 'added') {
      refreshCompletedHandoverNoteIds();
      setToastMessage(
        '✓ 인수인계 사항이 등록되어 라이브러리의 인수인계 이력으로 저장되었습니다.',
      );
      setShowToast(true);
      return;
    }
    if (transferResult === 'exists') {
      refreshCompletedHandoverNoteIds();
    }
  };

  const handleRemoveNote = (id: number) => {
    setHandoverNotes((current) => current.filter((note) => note.id !== id));
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
  <tr><th>평균 온도</th><td>${data.averageTemperature}°C</td><th>평균 압력</th><td>${data.averagePressure} bar</td><th>평균 속도</th><td>${data.averageSpeed} rpm</td></tr>
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
      toRow(['평균 온도(°C)', '평균 압력(bar)', '평균 속도(rpm)', 'AI 예측 위험(건)', '위험 LOT(개)', '발생 이슈(건)']),
      toRow([
        data.averageTemperature,
        data.averagePressure,
        data.averageSpeed,
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

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedIssue || !canSave) return;

    const nextStatus: Issue['status'] = managementForm.completed
      ? '완료'
      : managementForm.status;
    const nextCompleted = nextStatus === '완료' ? true : managementForm.completed;

    const savedData = {
      issueId: selectedIssue.id,
      assignee: managementForm.assignee,
      status: nextStatus,
      action: managementForm.action,
      completed: nextCompleted,
    };

    setIssues((current) =>
      current.map((issue) =>
        issue.id === selectedIssue.id
          ? {
              ...issue,
              assignee: savedData.assignee,
              status: savedData.status,
              action: savedData.action,
              completed: savedData.completed,
            }
          : issue,
      ),
    );
    setManagementForm({
      assignee: savedData.assignee,
      status: savedData.status,
      action: savedData.action,
      completed: savedData.completed,
    });
    setSaveMessage('이슈 처리 내역이 저장되었습니다.');

    const isCompleted = savedData.completed || savedData.status === '완료';
    if (isCompleted) {
      const transferredIssue: Issue = {
        ...selectedIssue,
        assignee: savedData.assignee,
        status: savedData.status,
        action: savedData.action,
        completed: savedData.completed,
      };
      const transferResult = appendCompletedKnowledgeLog(transferredIssue);
      if (transferResult === 'added') {
        setToastMessage('✓ 조치가 완료되어 지식 관리 라이브러리로 자동 이관되었습니다.');
        setShowToast(true);
      } else if (transferResult === 'failed') {
        setToastMessage(
          '이슈는 저장되었지만 지식 라이브러리 이관에 실패했습니다. 브라우저 저장소 권한을 확인해 주세요.',
        );
        setShowToast(true);
      } else {
        setToastMessage('✓ 이슈 처리 내역이 성공적으로 저장되었습니다.');
        setShowToast(true);
      }
    } else {
      setToastMessage('✓ 이슈 처리 내역이 성공적으로 저장되었습니다.');
      setShowToast(true);
    }
  };

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        background: isDark ? '#0f172a' : colors.background,
        color: isDark ? '#f8fafc' : colors.navy,
        padding: '36px clamp(16px, 3vw, 44px) 56px',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif",
      }}
    >
      <div style={{ width: '100%', maxWidth: 1440, margin: '0 auto' }}>
        <HeaderHandoverSection
          data={HANDOVER_DATA}
          notice={reportNotice}
          onGenerate={handleGenerateReport}
          onWrite={() => setIsNoteOpen(true)}
          onCloseNotice={() => setReportNotice('')}
        />
        <div style={{ display: 'grid', gap: 22, marginTop: 22 }}>
          <IssueListSection
            issues={filteredIssues}
            filters={draftFilters}
            lots={lots}
            selectedId={selectedId}
            onFilterChange={handleFilterChange}
            onApplyFilter={handleApplyFilter}
            onResetFilter={handleResetFilter}
            onSelect={setSelectedId}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)',
              gap: 22,
              alignItems: 'start',
            }}
          >
            <DetailAnalysisSection issue={selectedIssue} />
            <ManagementSection
              issue={selectedIssue}
              form={managementForm}
              message={saveMessage}
              canSave={canSave}
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
