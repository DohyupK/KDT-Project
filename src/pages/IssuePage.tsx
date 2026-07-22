import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';

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
  onSelect: (id: string) => void;
}

interface DetailAnalysisSectionProps {
  issue: Issue | null;
}

interface ManagementSectionProps {
  issue: Issue | null;
  form: ManagementForm;
  message: string;
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
  onAdd: (note: Omit<HandoverNote, 'id' | 'createdAt'>) => void;
  onRemove: (id: number) => void;
  onClose: () => void;
}

interface HandoverReportModalProps {
  data: HandoverData;
  issues: Issue[];
  notes: HandoverNote[];
  onClose: () => void;
  onDownloadPdf: () => void;
  onDownloadCsv: () => void;
}

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

const panelStyle: CSSProperties = {
  background: colors.panel,
  border: `1px solid ${colors.line}`,
  borderRadius: 18,
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
  padding: 24,
};

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: `1px solid ${colors.line}`,
  borderRadius: 10,
  background: '#f8fafc',
  color: colors.navy,
  fontSize: 14,
  padding: '10px 12px',
  outlineColor: colors.blue,
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 7,
  color: colors.slate,
  fontSize: 13,
  fontWeight: 700,
};

const riskStyle = (risk: Issue['risk']): CSSProperties => {
  if (risk === '높음') return { background: colors.redSoft, color: colors.red };
  if (risk === '중간') return { background: colors.amberSoft, color: colors.amber };
  return { background: colors.greenSoft, color: colors.green };
};

const statusStyle = (status: Issue['status']): CSSProperties => {
  if (status === '완료') return { background: colors.greenSoft, color: colors.green };
  if (status === '조치 중') return { background: '#f5f3ff', color: '#7c3aed' };
  if (status === '분석 중') return { background: colors.blueSoft, color: colors.blue };
  return { background: '#f1f5f9', color: colors.slate };
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
  const metrics = [
    { label: '평균 온도', value: `${data.averageTemperature}°C`, color: colors.blue },
    { label: '평균 압력', value: `${data.averagePressure} bar`, color: colors.cyan },
    { label: '평균 속도', value: `${data.averageSpeed} rpm`, color: '#8b5cf6' },
    { label: 'AI 예측 위험', value: `${data.aiRiskPredictions}건`, color: colors.amber },
    { label: '위험 LOT', value: `${data.riskyLots}개`, color: colors.red },
    { label: '발생 이슈', value: `${data.issueCount}건`, color: colors.slate },
  ];

  return (
    <section>
      {notice && (
        <div
          role="status"
          style={{
            ...panelStyle,
            marginBottom: 18,
            padding: '13px 16px',
            borderColor: '#86efac',
            background: colors.greenSoft,
            color: '#166534',
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
              color: '#166534',
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
          <h1 style={{ margin: 0, color: colors.navy, fontSize: 30, letterSpacing: '-0.03em' }}>
            이슈 관리
          </h1>
          <p style={{ margin: '9px 0 0', color: colors.slate, fontSize: 15 }}>
            공정 이슈를 조회하고 분석하며 처리 현황을 관리할 수 있습니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onWrite}
            style={{
              border: `2px solid ${colors.blue}`,
              borderRadius: 11,
              background: '#fff',
              color: colors.blue,
              padding: '11px 18px',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            인수인계 사항 작성
          </button>
          <button
            type="button"
            onClick={onGenerate}
            style={{
              border: 0,
              borderRadius: 11,
              background: colors.blue,
              color: '#fff',
              padding: '12px 18px',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 8px 18px rgba(37, 99, 235, 0.24)',
            }}
          >
            인수인계 사항 조회 및 다운로드
          </button>
        </div>
      </div>
      <div style={panelStyle}>
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
          <h2 style={{ margin: 0, color: colors.navy, fontSize: 18 }}>이전 8시간 공정 요약</h2>
          <span style={{ color: colors.muted, fontSize: 12 }}>{data.period}</span>
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
              style={{
                border: `1px solid ${colors.line}`,
                borderRadius: 13,
                padding: 16,
                background: '#f8fafc',
                borderTop: `3px solid ${metric.color}`,
              }}
            >
              <div style={{ color: colors.slate, fontSize: 12, fontWeight: 700 }}>
                {metric.label}
              </div>
              <div style={{ marginTop: 7, color: colors.navy, fontSize: 22, fontWeight: 900 }}>
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const reportCellStyle: CSSProperties = {
  border: `1px solid ${colors.line}`,
  padding: '9px 12px',
  fontSize: 13,
  color: colors.navy,
  textAlign: 'left',
};

const reportHeadCellStyle: CSSProperties = {
  ...reportCellStyle,
  background: '#f8fafc',
  color: colors.slate,
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

const HandoverReportModal = ({
  data,
  issues,
  notes,
  onClose,
  onDownloadPdf,
  onDownloadCsv,
}: HandoverReportModalProps) => {
  const openIssues = issues.filter((issue) => !issue.completed);

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
        style={{
          background: '#fff',
          borderRadius: 18,
          width: 'min(860px, 100%)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.35)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '18px 24px',
            borderBottom: `1px solid ${colors.line}`,
            background: colors.navy,
            color: '#fff',
          }}
        >
          <strong style={{ fontSize: 16 }}>교대 인수인계 보고서</strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={onDownloadPdf}
              style={{
                border: 0,
                borderRadius: 9,
                background: colors.blue,
                color: '#fff',
                padding: '9px 15px',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ⬇ PDF 다운로드
            </button>
            <button
              type="button"
              onClick={onDownloadCsv}
              style={{
                border: `2px solid ${colors.blue}`,
                borderRadius: 9,
                background: 'transparent',
                color: '#dbeafe',
                padding: '7px 15px',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ⬇ CSV 다운로드
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="보고서 닫기"
              style={{
                border: 0,
                background: 'transparent',
                color: '#cbd5e1',
                cursor: 'pointer',
                fontSize: 22,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ padding: 28, overflowY: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h2 style={{ margin: 0, color: colors.navy, fontSize: 22, letterSpacing: '-0.02em' }}>
              공정 이슈 인수인계 보고서
            </h2>
            <div style={{ marginTop: 8, color: colors.slate, fontSize: 13 }}>
              대상 기간: {data.period}
            </div>
          </div>

          <h3 style={{ margin: '0 0 10px', color: colors.navy, fontSize: 15 }}>1. 공정 요약</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
            <tbody>
              <tr>
                <th style={reportHeadCellStyle}>평균 온도</th>
                <td style={reportCellStyle}>{data.averageTemperature}°C</td>
                <th style={reportHeadCellStyle}>평균 압력</th>
                <td style={reportCellStyle}>{data.averagePressure} bar</td>
                <th style={reportHeadCellStyle}>평균 속도</th>
                <td style={reportCellStyle}>{data.averageSpeed} rpm</td>
              </tr>
              <tr>
                <th style={reportHeadCellStyle}>AI 예측 위험</th>
                <td style={reportCellStyle}>{data.aiRiskPredictions}건</td>
                <th style={reportHeadCellStyle}>위험 LOT</th>
                <td style={reportCellStyle}>{data.riskyLots}개</td>
                <th style={reportHeadCellStyle}>발생 이슈</th>
                <td style={reportCellStyle}>{data.issueCount}건</td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ margin: '0 0 10px', color: colors.navy, fontSize: 15 }}>
            2. 미완료 이슈 ({openIssues.length}건)
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead>
              <tr>
                <th style={reportHeadCellStyle}>이슈 ID</th>
                <th style={reportHeadCellStyle}>발생일시</th>
                <th style={reportHeadCellStyle}>LOT</th>
                <th style={reportHeadCellStyle}>위험도</th>
                <th style={reportHeadCellStyle}>상태</th>
                <th style={reportHeadCellStyle}>담당자</th>
              </tr>
            </thead>
            <tbody>
              {openIssues.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...reportCellStyle, textAlign: 'center', color: colors.slate }}>
                    미완료 이슈가 없습니다.
                  </td>
                </tr>
              ) : (
                openIssues.map((issue) => (
                  <tr key={issue.id}>
                    <td style={reportCellStyle}>{issue.id}</td>
                    <td style={reportCellStyle}>{issue.occurredAt}</td>
                    <td style={reportCellStyle}>{issue.lot}</td>
                    <td style={{ ...reportCellStyle, fontWeight: 800, color: riskStyle(issue.risk).color }}>
                      {issue.risk}
                    </td>
                    <td style={reportCellStyle}>{issue.status}</td>
                    <td style={reportCellStyle}>{issue.assignee}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <h3 style={{ margin: '0 0 10px', color: colors.navy, fontSize: 15 }}>
            3. 인수인계 특이사항 ({notes.length}건)
          </h3>
          {notes.length === 0 ? (
            <div
              style={{
                border: `1px solid ${colors.line}`,
                borderRadius: 10,
                padding: '14px 16px',
                color: colors.slate,
                fontSize: 13,
                textAlign: 'center',
                marginBottom: 24,
              }}
            >
              등록된 인수인계 특이사항이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
              {notes.map((note) => (
                <div
                  key={note.id}
                  style={{
                    border: `1px solid ${colors.line}`,
                    borderLeft: `4px solid ${noteCategoryStyle(note.category).color}`,
                    borderRadius: 10,
                    padding: '12px 15px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ ...badgeBase, ...noteCategoryStyle(note.category) }}>
                      {note.category}
                    </span>
                    <strong style={{ color: colors.navy, fontSize: 13 }}>{note.author}</strong>
                    <span style={{ color: colors.muted, fontSize: 12 }}>{note.createdAt}</span>
                  </div>
                  <p style={{ margin: '8px 0 0', color: colors.navy, fontSize: 13, lineHeight: 1.65 }}>
                    {note.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ margin: '0 0 10px', color: colors.navy, fontSize: 15 }}>
            4. 전체 이슈 처리 현황 ({issues.length}건)
          </h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {issues.map((issue) => (
              <div
                key={issue.id}
                style={{
                  border: `1px solid ${colors.line}`,
                  borderLeft: `4px solid ${riskStyle(issue.risk).color}`,
                  borderRadius: 10,
                  padding: '12px 15px',
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
                  <strong style={{ color: colors.navy, fontSize: 14 }}>
                    [{issue.id}] {issue.title}
                  </strong>
                  <span style={{ ...badgeBase, ...statusStyle(issue.status) }}>{issue.status}</span>
                </div>
                <div style={{ marginTop: 6, color: colors.slate, fontSize: 12 }}>
                  {issue.occurredAt} · {issue.lot} · 담당 {issue.assignee}
                </div>
                {issue.action && (
                  <div style={{ marginTop: 6, color: colors.navy, fontSize: 13, lineHeight: 1.6 }}>
                    조치: {issue.action}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const noteCategoryStyle = (category: HandoverNote['category']): CSSProperties => {
  if (category === '주의사항') return { background: colors.redSoft, color: colors.red };
  if (category === '전달사항') return { background: colors.blueSoft, color: colors.blue };
  return { background: colors.amberSoft, color: colors.amber };
};

const HandoverNoteSection = ({ notes, onAdd, onRemove, onClose }: HandoverNoteSectionProps) => {
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState<HandoverNote['category']>('특이사항');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (author.trim().length === 0) {
      setError('작성자를 입력해주세요.');
      return;
    }
    if (content.trim().length === 0) {
      setError('인수인계 내용을 입력해주세요.');
      return;
    }
    onAdd({ author: author.trim(), category, content: content.trim() });
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
          ...panelStyle,
          width: 'min(680px, 100%)',
          maxHeight: '88vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.35)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ margin: 0, color: colors.navy, fontSize: 19 }}>인수인계 사항 작성</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: colors.slate, fontSize: 13, fontWeight: 700 }}>
              등록 {notes.length}건
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="작성 창 닫기"
              style={{
                border: 0,
                background: 'transparent',
                color: colors.muted,
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
        <p style={{ margin: '0 0 18px', color: colors.slate, fontSize: 13 }}>
          다음 교대 근무자에게 전달할 특이사항과 주의사항을 기록하면 인수인계 보고서에 함께 포함됩니다.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              border: '1px solid #fca5a5',
              borderRadius: 10,
              background: colors.redSoft,
              color: colors.red,
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <label htmlFor="note-author" style={labelStyle}>작성자</label>
              <input
                id="note-author"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="작성자 이름"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="note-category" style={labelStyle}>구분</label>
              <select
                id="note-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as HandoverNote['category'])}
                style={inputStyle}
              >
                <option value="특이사항">특이사항</option>
                <option value="전달사항">전달사항</option>
                <option value="주의사항">주의사항</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="note-content" style={labelStyle}>인수인계 내용</label>
            <textarea
              id="note-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="예) 소성로 2호기 냉각 계통 점검 중이므로 온도 트렌드를 30분 간격으로 확인해주세요."
              style={{ ...inputStyle, minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <button
            type="submit"
            style={{
              border: 0,
              borderRadius: 10,
              background: colors.blue,
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
                  border: `1px solid ${colors.line}`,
                  borderRadius: 12,
                  padding: '12px 15px',
                  background: '#f8fafc',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...badgeBase, ...noteCategoryStyle(note.category) }}>
                      {note.category}
                    </span>
                    <strong style={{ color: colors.navy, fontSize: 13 }}>{note.author}</strong>
                    <span style={{ color: colors.muted, fontSize: 12 }}>{note.createdAt}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(note.id)}
                    aria-label={`${note.category} 삭제`}
                    style={{
                      border: 0,
                      borderRadius: 8,
                      background: 'transparent',
                      color: colors.muted,
                      cursor: 'pointer',
                      fontSize: 17,
                      lineHeight: 1,
                      padding: 4,
                    }}
                  >
                    ×
                  </button>
                </div>
                <p style={{ margin: '8px 0 0', color: colors.navy, fontSize: 13, lineHeight: 1.65 }}>
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
  onSelect,
}: IssueListSectionProps) => (
  <section style={panelStyle}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
      <h2 style={{ margin: 0, color: colors.navy, fontSize: 19 }}>이슈 목록</h2>
      <span style={{ color: colors.slate, fontSize: 13, fontWeight: 700 }}>
        검색 결과 {issues.length}건
      </span>
    </div>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}
    >
      <div style={{ gridColumn: 'span 2' }}>
        <label htmlFor="issue-search" style={labelStyle}>검색어</label>
        <input
          id="issue-search"
          value={filters.search}
          onChange={(event) => onFilterChange('search', event.target.value)}
          placeholder="제목 또는 LOT 번호"
          style={inputStyle}
        />
      </div>
      <div>
        <label htmlFor="issue-date" style={labelStyle}>날짜</label>
        <input
          id="issue-date"
          type="date"
          value={filters.date}
          onChange={(event) => onFilterChange('date', event.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label htmlFor="issue-lot" style={labelStyle}>LOT</label>
        <select
          id="issue-lot"
          value={filters.lot}
          onChange={(event) => onFilterChange('lot', event.target.value)}
          style={inputStyle}
        >
          <option value="">전체 LOT</option>
          {lots.map((lot) => <option key={lot} value={lot}>{lot}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="issue-risk" style={labelStyle}>위험도</label>
        <select
          id="issue-risk"
          value={filters.risk}
          onChange={(event) => onFilterChange('risk', event.target.value)}
          style={inputStyle}
        >
          <option value="">전체 위험도</option>
          <option value="높음">높음</option>
          <option value="중간">중간</option>
          <option value="낮음">낮음</option>
        </select>
      </div>
      <div>
        <label htmlFor="issue-status" style={labelStyle}>처리 상태</label>
        <select
          id="issue-status"
          value={filters.status}
          onChange={(event) => onFilterChange('status', event.target.value)}
          style={inputStyle}
        >
          <option value="">전체 상태</option>
          <option value="접수">접수</option>
          <option value="분석 중">분석 중</option>
          <option value="조치 중">조치 중</option>
          <option value="완료">완료</option>
        </select>
      </div>
    </div>

    {issues.length === 0 ? (
      <div
        style={{
          padding: '54px 20px',
          borderRadius: 14,
          background: '#f8fafc',
          color: colors.slate,
          textAlign: 'center',
          fontWeight: 700,
        }}
      >
        조건에 맞는 이슈가 없습니다.
      </div>
    ) : (
      <div style={{ display: 'grid', gap: 10 }}>
        {issues.map((issue) => {
          const selected = issue.id === selectedId;
          return (
            <button
              key={issue.id}
              type="button"
              onClick={() => onSelect(issue.id)}
              style={{
                width: '100%',
                border: selected ? `2px solid ${colors.blue}` : `1px solid ${colors.line}`,
                borderRadius: 13,
                background: selected ? colors.blueSoft : '#fff',
                padding: 15,
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: selected ? '0 0 0 3px rgba(37, 99, 235, 0.08)' : 'none',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '130px 145px minmax(145px, 1fr) 68px 78px minmax(220px, 2fr)',
                  gap: 12,
                  alignItems: 'center',
                  overflowX: 'auto',
                }}
              >
                <strong style={{ color: colors.blue, fontSize: 13 }}>{issue.id}</strong>
                <span style={{ color: colors.slate, fontSize: 12 }}>{issue.occurredAt}</span>
                <span style={{ color: colors.navy, fontSize: 13, fontWeight: 700 }}>{issue.lot}</span>
                <span style={{ ...badgeBase, ...riskStyle(issue.risk) }}>{issue.risk}</span>
                <span style={{ ...badgeBase, ...statusStyle(issue.status) }}>{issue.status}</span>
                <span style={{ color: colors.navy, fontSize: 14, fontWeight: 700 }}>{issue.title}</span>
              </div>
            </button>
          );
        })}
      </div>
    )}
  </section>
);

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
        return <line key={line} x1={pad} y1={y} x2={width - pad} y2={y} stroke={colors.line} />;
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
            <circle cx={x} cy={y} r="5" fill="#fff" stroke={color} strokeWidth="3" />
            <text x={x} y={height - 5} textAnchor="middle" fontSize="11" fill={colors.slate}>
              {item.time}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const DetailAnalysisSection = ({ issue }: DetailAnalysisSectionProps) => {
  if (!issue) {
    return (
      <section style={{ ...panelStyle, minHeight: 220, display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', color: colors.slate }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>⌁</div>
          <strong>목록에서 이슈를 선택하면 상세 분석 데이터가 표시됩니다.</strong>
        </div>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
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
          <h2 style={{ margin: 0, color: colors.navy, fontSize: 19 }}>이슈 상세 분석</h2>
          <div style={{ marginTop: 6, color: colors.slate, fontSize: 13 }}>
            {issue.id} · {issue.lot}
          </div>
        </div>
        <span style={{ ...badgeBase, ...riskStyle(issue.risk) }}>위험도 {issue.risk}</span>
      </div>

      <div
        style={{
          border: '1px solid #fed7aa',
          borderLeft: `4px solid ${colors.amber}`,
          borderRadius: 12,
          background: colors.amberSoft,
          padding: 15,
          color: '#92400e',
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
        <div style={{ border: `1px solid ${colors.line}`, borderRadius: 14, padding: 16 }}>
          <h3 style={{ margin: 0, color: colors.navy, fontSize: 14 }}>시간대별 온도 변화 (°C)</h3>
          <LineChart data={issue.processData} dataKey="temperature" color={colors.red} min={720} max={765} />
        </div>
        <div style={{ border: `1px solid ${colors.line}`, borderRadius: 14, padding: 16 }}>
          <h3 style={{ margin: 0, color: colors.navy, fontSize: 14 }}>시간대별 압력 변화 (bar)</h3>
          <LineChart data={issue.processData} dataKey="pressure" color={colors.cyan} min={1.3} max={3} />
        </div>
      </div>

      <div style={{ border: `1px solid ${colors.line}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 14px', color: colors.navy, fontSize: 14 }}>
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
                color: colors.slate,
              }}
            >
              <strong>{item.time}</strong>
              <div style={{ height: 18, background: '#fee2e2', borderRadius: 999, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${item.riskBefore}%`,
                    height: '100%',
                    background: colors.red,
                    borderRadius: 999,
                  }}
                  title={`Before ${item.riskBefore}`}
                />
              </div>
              <div style={{ height: 18, background: '#dcfce7', borderRadius: 999, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${item.riskAfter}%`,
                    height: '100%',
                    background: colors.green,
                    borderRadius: 999,
                  }}
                  title={`After ${item.riskAfter}`}
                />
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, fontSize: 11 }}>
            <span style={{ color: colors.red }}>■ Before</span>
            <span style={{ color: colors.green }}>■ After</span>
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620, fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', color: colors.slate }}>
              {['시간', '온도(°C)', '압력(bar)', '속도(rpm)', '위험 Before', '위험 After'].map((heading) => (
                <th
                  key={heading}
                  style={{ padding: 11, borderBottom: `1px solid ${colors.line}`, textAlign: 'center' }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {issue.processData.map((item) => (
              <tr key={item.time} style={{ color: colors.navy }}>
                <td style={{ padding: 10, borderBottom: `1px solid ${colors.line}`, textAlign: 'center' }}>{item.time}</td>
                <td style={{ padding: 10, borderBottom: `1px solid ${colors.line}`, textAlign: 'center' }}>{item.temperature}</td>
                <td style={{ padding: 10, borderBottom: `1px solid ${colors.line}`, textAlign: 'center' }}>{item.pressure}</td>
                <td style={{ padding: 10, borderBottom: `1px solid ${colors.line}`, textAlign: 'center' }}>{item.speed}</td>
                <td style={{ padding: 10, borderBottom: `1px solid ${colors.line}`, textAlign: 'center', color: colors.red, fontWeight: 800 }}>{item.riskBefore}</td>
                <td style={{ padding: 10, borderBottom: `1px solid ${colors.line}`, textAlign: 'center', color: colors.green, fontWeight: 800 }}>{item.riskAfter}</td>
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
  onChange,
  onSave,
}: ManagementSectionProps) => (
  <section style={panelStyle}>
    <h2 style={{ margin: '0 0 6px', color: colors.navy, fontSize: 19 }}>이슈 처리 관리</h2>
    <p style={{ margin: '0 0 20px', color: colors.slate, fontSize: 13 }}>
      {issue ? `${issue.id}의 담당자와 처리 현황을 관리합니다.` : '관리할 이슈를 먼저 선택해주세요.'}
    </p>
    {message && (
      <div
        role="status"
        style={{
          border: '1px solid #86efac',
          borderRadius: 10,
          background: colors.greenSoft,
          color: '#166534',
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
            <label htmlFor="manager-assignee" style={labelStyle}>담당자</label>
            <input
              id="manager-assignee"
              value={form.assignee}
              onChange={(event) => onChange('assignee', event.target.value)}
              placeholder="담당자 이름"
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="manager-status" style={labelStyle}>처리 상태</label>
            <select
              id="manager-status"
              value={form.status}
              onChange={(event) => onChange('status', event.target.value as Issue['status'])}
              style={inputStyle}
            >
              <option value="접수">접수</option>
              <option value="분석 중">분석 중</option>
              <option value="조치 중">조치 중</option>
              <option value="완료">완료</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="manager-action" style={labelStyle}>조치 내용</label>
          <textarea
            id="manager-action"
            value={form.action}
            onChange={(event) => onChange('action', event.target.value)}
            placeholder="분석 내용과 조치 사항을 입력해주세요."
            style={{ ...inputStyle, minHeight: 110, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: colors.navy,
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
            style={{ width: 18, height: 18, accentColor: colors.blue, cursor: 'pointer' }}
          />
          조치 완료 여부
        </label>
        <button
          type="submit"
          style={{
            width: '100%',
            border: 0,
            borderRadius: 11,
            background: issue ? colors.navy : colors.muted,
            color: '#fff',
            padding: '12px 18px',
            fontSize: 14,
            fontWeight: 800,
            cursor: issue ? 'pointer' : 'not-allowed',
          }}
        >
          저장
        </button>
      </fieldset>
    </form>
  </section>
);

const EMPTY_FORM: ManagementForm = {
  assignee: '',
  status: '접수',
  action: '',
  completed: false,
};

export const IssuePage = () => {
  const [issues, setIssues] = useState<Issue[]>(INITIAL_ISSUES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    date: '',
    lot: '',
    risk: '',
    status: '',
  });
  const [managementForm, setManagementForm] = useState<ManagementForm>(EMPTY_FORM);
  const [reportNotice, setReportNotice] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [handoverNotes, setHandoverNotes] = useState<HandoverNote[]>([]);

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedId) ?? null,
    [issues, selectedId],
  );

  const lots = useMemo(
    () => Array.from(new Set(issues.map((issue) => issue.lot))).sort(),
    [issues],
  );

  const filteredIssues = useMemo(() => {
    const keyword = filters.search.trim().toLowerCase();
    return issues.filter((issue) => {
      const matchesSearch =
        !keyword ||
        issue.title.toLowerCase().includes(keyword) ||
        issue.lot.toLowerCase().includes(keyword);
      const matchesDate = !filters.date || issue.date === filters.date;
      const matchesLot = !filters.lot || issue.lot === filters.lot;
      const matchesRisk = !filters.risk || issue.risk === filters.risk;
      const matchesStatus = !filters.status || issue.status === filters.status;
      return matchesSearch && matchesDate && matchesLot && matchesRisk && matchesStatus;
    });
  }, [filters, issues]);

  useEffect(() => {
    if (!selectedIssue) {
      setManagementForm(EMPTY_FORM);
      return;
    }
    setManagementForm({
      assignee: selectedIssue.assignee,
      status: selectedIssue.status,
      action: selectedIssue.action,
      completed: selectedIssue.completed,
    });
    setSaveMessage('');
  }, [selectedIssue]);

  useEffect(() => {
    if (!reportNotice) return;
    const timer = window.setTimeout(() => setReportNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [reportNotice]);

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handleFormChange = <K extends keyof ManagementForm>(
    key: K,
    value: ManagementForm[K],
  ) => {
    setManagementForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'completed' && value === true) next.status = '완료';
      if (key === 'status' && value !== '완료') next.completed = false;
      if (key === 'status' && value === '완료') next.completed = true;
      return next;
    });
  };

  const handleAddNote = (note: Omit<HandoverNote, 'id' | 'createdAt'>) => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setHandoverNotes((current) => [{ ...note, id: Date.now(), createdAt }, ...current]);
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
              `<div class="issue" style="border-left:4px solid ${noteColor(note.category)};"><strong>[${note.category}] ${note.author}</strong><div class="meta">${note.createdAt}</div><div class="action">${note.content}</div></div>`,
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
      toRow(['구분', '작성자', '작성 시각', '내용']),
      ...(handoverNotes.length === 0
        ? [toRow(['등록된 인수인계 특이사항이 없습니다.'])]
        : handoverNotes.map((note) =>
          toRow([note.category, note.author, note.createdAt, note.content]),
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
    if (!selectedIssue) return;
    const savedData = {
      issueId: selectedIssue.id,
      ...managementForm,
      status: managementForm.completed ? ('완료' as const) : managementForm.status,
    };
    console.log('이슈 처리 저장 데이터:', savedData);
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
    setSaveMessage('이슈 처리 정보가 저장되었습니다.');
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        background: colors.background,
        color: colors.navy,
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
            filters={filters}
            lots={lots}
            selectedId={selectedId}
            onFilterChange={handleFilterChange}
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
          onClose={() => setIsReportOpen(false)}
          onDownloadPdf={handleDownloadPdf}
          onDownloadCsv={handleDownloadCsv}
        />
      )}
    </main>
  );
};
