'use client'

import { useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';

interface DocumentItem {
  id: string;
  manager: string;
  date: string;
  title: string;
  summary: string;
  process: string;
  lot: string;
  detail: string;
}

interface ActionHistoryItem {
  id: number;
  situation: string;
  action: string;
  cause: string;
  manager: string;
  date: string;
}

interface ReportData {
  baseDate: string;
  mainCause: string;
  similarCase: string;
  recommendation: string;
  riskSummary: string;
  referenceCount: number;
}

interface FilterState {
  manager: string;
  date: string;
  keyword: string;
}

type TabKey = 'documents' | 'actions' | 'report';

interface ActionFormState {
  situation: string;
  action: string;
  cause: string;
  manager: string;
  date: string;
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

const primaryButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 10,
  background: colors.blue,
  color: '#fff',
  padding: '11px 18px',
  fontSize: 14,
  fontWeight: 800,
  cursor: 'pointer',
};

const ghostButtonStyle: CSSProperties = {
  border: `1px solid ${colors.line}`,
  borderRadius: 10,
  background: '#fff',
  color: colors.slate,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

const cellStyle: CSSProperties = {
  border: `1px solid ${colors.line}`,
  padding: '10px 12px',
  fontSize: 13,
  color: colors.navy,
  textAlign: 'left',
  verticalAlign: 'top',
};

const headCellStyle: CSSProperties = {
  ...cellStyle,
  background: '#f8fafc',
  color: colors.slate,
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

const DOCUMENTS: DocumentItem[] = [
  {
    id: 'DOC-2026-041',
    manager: '김현수',
    date: '2026-07-18',
    title: '소성로 2호기 온도 프로파일 최적화 결과',
    summary: '온도 상한 초과 재발 방지를 위한 구간별 설정값 조정 결과 정리',
    process: '소성',
    lot: 'LOT-CA-260718-11',
    detail:
      '소성로 2호기의 구간별 온도 프로파일을 재설계하여 3구간 목표 온도를 748°C에서 742°C로 하향 조정했습니다. 조정 후 72시간 동안 불량률이 2.4%에서 1.7%로 감소했으며, 결정 구조 분석 결과 리튬 잔류량도 기준치 이내로 확인되었습니다. 동절기에는 승온 속도를 5% 낮추는 보정이 추가로 필요합니다.',
  },
  {
    id: 'DOC-2026-040',
    manager: '박서연',
    date: '2026-07-15',
    title: '리튬 계량기 교정 주기 개선 보고',
    summary: '투입량 편차 원인이었던 계량기 드리프트 보정 주기 단축안',
    process: '원료 투입',
    lot: 'LOT-CA-260715-04',
    detail:
      '리튬 계량기의 월 1회 교정 주기를 2주 1회로 단축한 결과, 투입량 표준편차가 0.021에서 0.008로 감소했습니다. 드리프트는 주로 호퍼 진동에 의한 로드셀 미세 변형에서 발생하며, 방진 패드 교체 시 교정 주기를 다시 완화할 수 있습니다.',
  },
  {
    id: 'DOC-2026-039',
    manager: '이도윤',
    date: '2026-07-12',
    title: '혼합 공정 임펠러 마모 점검 이력',
    summary: '혼합 균일도 저하와 임펠러 마모의 상관관계 분석',
    process: '혼합',
    lot: 'LOT-CA-260712-08',
    detail:
      '임펠러 날개 끝단 마모가 1.2mm를 초과하면 혼합 균일도 지수가 급격히 저하되는 것을 확인했습니다. 마모 측정을 월 점검 항목에 추가했고, 예비품 재고 기준을 2개에서 4개로 상향했습니다.',
  },
  {
    id: 'DOC-2026-038',
    manager: '최유진',
    date: '2026-07-10',
    title: '입도 분포 관리 기준 개정안',
    summary: 'D50 관리 상한 초과 사례 분석 및 분쇄 조건 표준화',
    process: '분쇄',
    lot: 'LOT-CA-260710-03',
    detail:
      '최근 3개월간 D50 상한 접근 사례 7건을 분석한 결과, 분쇄기 회전수와 원료 수분 함량의 조합이 주요 변수였습니다. 수분 0.25% 초과 시 회전수를 3% 하향하는 조건표를 작성하여 표준 작업 지침에 반영했습니다.',
  },
  {
    id: 'DOC-2026-037',
    manager: '김현수',
    date: '2026-07-08',
    title: '냉각 구간 압력 이상 대응 매뉴얼',
    summary: '냉각수 압력 급상승 시 단계별 조치 절차 정리',
    process: '냉각',
    lot: 'LOT-CA-260708-12',
    detail:
      '냉각수 압력이 2.5bar를 초과하면 1단계로 바이패스 밸브를 개방하고, 2.8bar 초과 시 라인 절환 후 열교환기 스케일 점검을 수행합니다. 7월 초 발생한 압력 급상승은 열교환기 스케일 축적이 원인이었으며, 세정 후 정상화되었습니다.',
  },
  {
    id: 'DOC-2026-036',
    manager: '정민재',
    date: '2026-07-05',
    title: '표면 검사 카메라 조도 보정 기록',
    summary: '오검출률 개선을 위한 조명 세팅 변경 이력',
    process: '검사',
    lot: 'LOT-CA-260705-06',
    detail:
      '검사 부스 조도를 4200lux에서 4800lux로 상향하고 카메라 노출 시간을 재조정하여 표면 결함 오검출률을 3.1%에서 1.2%로 낮췄습니다. 조도 센서 값이 4500lux 아래로 내려가면 알람이 발생하도록 설정했습니다.',
  },
  {
    id: 'DOC-2026-035',
    manager: '한지우',
    date: '2026-07-02',
    title: '전구체 보관 습도 관리 개선 보고',
    summary: '수분 함량 변동 저감을 위한 보관 환경 기준 강화',
    process: '원료 보관',
    lot: 'LOT-CA-260702-01',
    detail:
      '전구체 보관 창고의 상대습도 기준을 45%에서 35%로 강화하고 제습기 가동 로직을 자동화했습니다. 개선 후 입고 로트 간 수분 함량 편차가 절반 이하로 감소했습니다.',
  },
  {
    id: 'DOC-2026-034',
    manager: '박서연',
    date: '2026-06-28',
    title: '소성 배가스 산소 농도 트렌드 분석',
    summary: '산소 농도와 결정성 상관 분석 및 급기 제어 개선',
    process: '소성',
    lot: 'LOT-CA-260628-09',
    detail:
      '배가스 산소 농도가 19.2% 아래로 내려간 구간에서 결정성 저하가 관측되었습니다. 급기 팬 제어를 수동에서 PID 자동 제어로 전환하여 산소 농도 변동 폭을 ±0.5%에서 ±0.15%로 줄였습니다.',
  },
  {
    id: 'DOC-2026-033',
    manager: '이도윤',
    date: '2026-06-24',
    title: '설비 예지보전 진동 데이터 리뷰',
    summary: '혼합기·분쇄기 베어링 진동 스펙트럼 월간 리뷰',
    process: '설비 관리',
    lot: '-',
    detail:
      '분쇄기 2호기 베어링에서 외륜 결함 주파수 성분이 미세하게 증가하는 추세가 확인되었습니다. 8월 정기 보전 시 교체를 권고하며, 그 전까지 주 1회 정밀 측정을 수행합니다.',
  },
];

const INITIAL_ACTIONS: ActionHistoryItem[] = [
  {
    id: 1,
    situation: '소성로 2호기 온도 상한(750°C) 3회 연속 초과',
    action: '목표 온도 742°C 하향 및 냉각 계통 긴급 점검',
    cause: '온도 센서 열화로 인한 제어 지연',
    manager: '김현수',
    date: '2026-07-18',
  },
  {
    id: 2,
    situation: '리튬 투입량 편차 급증으로 조성 불균일 경보 발생',
    action: '계량기 즉시 재교정 및 투입 속도 수동 제어 전환',
    cause: '계량기 로드셀 드리프트',
    manager: '박서연',
    date: '2026-07-15',
  },
  {
    id: 3,
    situation: '냉각수 압력 2.7bar 급상승',
    action: '바이패스 밸브 개방 후 열교환기 세정',
    cause: '열교환기 스케일 축적',
    manager: '김현수',
    date: '2026-07-08',
  },
  {
    id: 4,
    situation: '표면 검사 오검출률 3% 초과',
    action: '검사 부스 조도 상향 및 카메라 노출 재조정',
    cause: '조명 열화로 인한 조도 저하',
    manager: '정민재',
    date: '2026-07-05',
  },
  {
    id: 5,
    situation: '전구체 수분 함량 상승으로 잔류 리튬 증가 우려',
    action: '보관 습도 기준 강화 및 건조 시간 10% 연장',
    cause: '장마철 보관 창고 습도 상승',
    manager: '한지우',
    date: '2026-07-02',
  },
];

const INITIAL_REPORT: ReportData = {
  baseDate: '2026-07-21',
  mainCause: '소성 온도 상한 근접 운전(747°C 이상) 구간에서의 결정성 저하가 최근 불량률 상승분의 62%를 설명합니다.',
  similarCase: '2026-07-18 소성로 2호기 온도 초과 사례(DOC-2026-041)와 공정 패턴이 91% 유사합니다.',
  recommendation: '3구간 목표 온도를 742°C로 유지하고, 승온 속도를 5% 하향한 상태에서 4시간 간격으로 결정성 샘플링을 권장합니다.',
  riskSummary: '현재 위험도 중간 — 조치 미이행 시 48시간 내 불량률 2.5% 초과 확률 78%',
  referenceCount: 126,
};

const EMPTY_ACTION_FORM: ActionFormState = {
  situation: '',
  action: '',
  cause: '',
  manager: '',
  date: '',
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'documents', label: '과거 자료 조회' },
  { key: 'actions', label: '상황 대처 및 원인 분석' },
  { key: 'report', label: 'AI 데일리 레포트' },
];

export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('documents');
  const [toast, setToast] = useState('');

  const [filters, setFilters] = useState<FilterState>({ manager: '', date: '', keyword: '' });
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const [actions, setActions] = useState<ActionHistoryItem[]>(INITIAL_ACTIONS);
  const [actionSearch, setActionSearch] = useState('');
  const [actionForm, setActionForm] = useState<ActionFormState>(EMPTY_ACTION_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState('');

  const [report, setReport] = useState<ReportData>(INITIAL_REPORT);

  const managers = useMemo(
    () => Array.from(new Set(DOCUMENTS.map((doc) => doc.manager))).sort(),
    [],
  );

  const filteredDocuments = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    return DOCUMENTS.filter((doc) => {
      const matchesManager = !filters.manager || doc.manager === filters.manager;
      const matchesDate = !filters.date || doc.date === filters.date;
      const matchesKeyword =
        !keyword ||
        doc.title.toLowerCase().includes(keyword) ||
        doc.summary.toLowerCase().includes(keyword) ||
        doc.process.toLowerCase().includes(keyword) ||
        doc.lot.toLowerCase().includes(keyword);
      return matchesManager && matchesDate && matchesKeyword;
    });
  }, [filters]);

  const selectedDoc = useMemo(
    () => DOCUMENTS.find((doc) => doc.id === selectedDocId) ?? null,
    [selectedDocId],
  );

  const filteredActions = useMemo(() => {
    const keyword = actionSearch.trim().toLowerCase();
    if (!keyword) return actions;
    return actions.filter(
      (item) =>
        item.situation.toLowerCase().includes(keyword) ||
        item.action.toLowerCase().includes(keyword) ||
        item.cause.toLowerCase().includes(keyword) ||
        item.manager.toLowerCase().includes(keyword) ||
        item.date.includes(keyword),
    );
  }, [actions, actionSearch]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3000);
  };

  const resetFilters = () => {
    setFilters({ manager: '', date: '', keyword: '' });
    setActionSearch('');
    showToast('필터가 초기화되었습니다.');
  };

  const handleFormChange = (key: keyof ActionFormState, value: string) => {
    setActionForm((current) => ({ ...current, [key]: value }));
  };

  const startEdit = (item: ActionHistoryItem) => {
    setEditingId(item.id);
    setActionForm({
      situation: item.situation,
      action: item.action,
      cause: item.cause,
      manager: item.manager,
      date: item.date,
    });
    setFormError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setActionForm(EMPTY_ACTION_FORM);
    setFormError('');
  };

  const handleActionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed: ActionFormState = {
      situation: actionForm.situation.trim(),
      action: actionForm.action.trim(),
      cause: actionForm.cause.trim(),
      manager: actionForm.manager.trim(),
      date: actionForm.date,
    };
    if (!trimmed.situation || !trimmed.action || !trimmed.cause || !trimmed.manager || !trimmed.date) {
      setFormError('모든 항목(발생 상황, 대처 방안, 원인, 담당자, 날짜)을 입력해주세요.');
      return;
    }
    setFormError('');

    if (editingId !== null) {
      setActions((current) =>
        current.map((item) => (item.id === editingId ? { ...item, ...trimmed } : item)),
      );
      console.log('상황 대처 이력 수정:', { id: editingId, ...trimmed });
      showToast('상황 대처 이력이 수정되었습니다.');
    } else {
      const newItem: ActionHistoryItem = { id: Date.now(), ...trimmed };
      setActions((current) => [newItem, ...current]);
      console.log('상황 대처 이력 등록:', newItem);
      showToast('상황 대처 이력이 등록되었습니다.');
    }
    setEditingId(null);
    setActionForm(EMPTY_ACTION_FORM);
  };

  const handleDelete = (id: number) => {
    setActions((current) => current.filter((item) => item.id !== id));
    if (editingId === id) cancelEdit();
    console.log('상황 대처 이력 삭제:', { id });
    showToast('상황 대처 이력이 삭제되었습니다.');
  };

  const handleGenerateReport = () => {
    const refreshed: ReportData = {
      ...report,
      baseDate: '2026-07-21',
      referenceCount: report.referenceCount + actions.length,
    };
    setReport(refreshed);
    console.log('AI 데일리 레포트 생성:', refreshed);
    showToast('데일리 레포트가 최신 과거 데이터 기준으로 재갱신되었습니다.');
  };

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        background: colors.background,
        color: colors.navy,
        padding: '36px clamp(16px, 3vw, 44px) 56px',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif",
      }}
    >
      <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto' }}>
        {toast && (
          <div
            role="status"
            style={{
              position: 'fixed',
              top: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              background: colors.navy,
              color: '#fff',
              borderRadius: 12,
              padding: '13px 22px',
              fontSize: 14,
              fontWeight: 700,
              boxShadow: '0 12px 32px rgba(15, 23, 42, 0.35)',
            }}
          >
            ✓ {toast}
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
              지식 관리
            </h1>
            <p style={{ margin: '9px 0 0', color: colors.slate, fontSize: 15 }}>
              과거 담당 자료, 상황 대처 이력, AI 분석 레포트를 통합 관리합니다.
            </p>
          </div>
          <button type="button" onClick={resetFilters} style={ghostButtonStyle}>
            필터 초기화
          </button>
        </div>

        <div
          role="tablist"
          aria-label="지식 관리 섹션"
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 22,
            background: '#e8edf5',
            borderRadius: 14,
            padding: 6,
            width: 'fit-content',
            maxWidth: '100%',
            flexWrap: 'wrap',
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  border: 0,
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: isActive ? '#fff' : 'transparent',
                  color: isActive ? colors.blue : colors.slate,
                  boxShadow: isActive ? '0 4px 12px rgba(15, 23, 42, 0.1)' : 'none',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'documents' && (
          <section style={panelStyle}>
            <h2 style={{ margin: '0 0 18px', color: colors.navy, fontSize: 19 }}>
              과거 담당자 자료 조회
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div>
                <label htmlFor="doc-manager" style={labelStyle}>담당자</label>
                <select
                  id="doc-manager"
                  value={filters.manager}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, manager: event.target.value }))
                  }
                  style={inputStyle}
                >
                  <option value="">전체 담당자</option>
                  {managers.map((manager) => (
                    <option key={manager} value={manager}>{manager}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="doc-date" style={labelStyle}>날짜</label>
                <input
                  id="doc-date"
                  type="date"
                  value={filters.date}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, date: event.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label htmlFor="doc-keyword" style={labelStyle}>키워드 검색</label>
                <input
                  id="doc-keyword"
                  value={filters.keyword}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, keyword: event.target.value }))
                  }
                  placeholder="제목, 요약, 공정, LOT 통합 검색"
                  style={inputStyle}
                />
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 1fr)',
                gap: 18,
                alignItems: 'start',
              }}
            >
              <div style={{ display: 'grid', gap: 10 }}>
                {filteredDocuments.length === 0 ? (
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
                    검색 조건에 맞는 자료가 없습니다.
                  </div>
                ) : (
                  filteredDocuments.map((doc) => {
                    const selected = doc.id === selectedDocId;
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => setSelectedDocId(doc.id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: selected ? `2px solid ${colors.blue}` : `1px solid ${colors.line}`,
                          borderRadius: 13,
                          background: selected ? colors.blueSoft : '#fff',
                          padding: 15,
                          cursor: 'pointer',
                          boxShadow: selected ? '0 0 0 3px rgba(37, 99, 235, 0.08)' : 'none',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            flexWrap: 'wrap',
                            marginBottom: 6,
                          }}
                        >
                          <strong style={{ color: colors.blue, fontSize: 13 }}>{doc.id}</strong>
                          <span style={{ color: colors.muted, fontSize: 12 }}>
                            {doc.manager} · {doc.date}
                          </span>
                        </div>
                        <div style={{ color: colors.navy, fontSize: 15, fontWeight: 800 }}>
                          {doc.title}
                        </div>
                        <p style={{ margin: '6px 0 8px', color: colors.slate, fontSize: 13, lineHeight: 1.6 }}>
                          {doc.summary}
                        </p>
                        <span
                          style={{
                            display: 'inline-block',
                            borderRadius: 999,
                            background: '#f1f5f9',
                            color: colors.slate,
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '4px 10px',
                          }}
                        >
                          {doc.process} · {doc.lot}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div
                style={{
                  border: `1px solid ${colors.line}`,
                  borderRadius: 14,
                  background: '#f8fafc',
                  padding: 20,
                  position: 'sticky',
                  top: 20,
                }}
              >
                <h3 style={{ margin: '0 0 12px', color: colors.navy, fontSize: 15 }}>자료 상세</h3>
                {selectedDoc ? (
                  <div>
                    <div style={{ color: colors.blue, fontSize: 13, fontWeight: 800 }}>
                      {selectedDoc.id}
                    </div>
                    <h4 style={{ margin: '6px 0 8px', color: colors.navy, fontSize: 17 }}>
                      {selectedDoc.title}
                    </h4>
                    <div style={{ color: colors.muted, fontSize: 12, marginBottom: 14 }}>
                      {selectedDoc.manager} · {selectedDoc.date} · {selectedDoc.process} · {selectedDoc.lot}
                    </div>
                    <p style={{ margin: 0, color: colors.navy, fontSize: 14, lineHeight: 1.75 }}>
                      {selectedDoc.detail}
                    </p>
                  </div>
                ) : (
                  <p style={{ margin: 0, color: colors.slate, fontSize: 13, lineHeight: 1.7 }}>
                    왼쪽 목록에서 자료를 선택하면 상세 내용이 표시됩니다.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'actions' && (
          <section style={panelStyle}>
            <h2 style={{ margin: '0 0 6px', color: colors.navy, fontSize: 19 }}>
              상황 대처 및 원인 분석 관리
            </h2>
            <p style={{ margin: '0 0 18px', color: colors.slate, fontSize: 13 }}>
              {editingId !== null
                ? `ID ${editingId} 항목을 수정하고 있습니다.`
                : '새로운 상황 대처 이력을 등록하거나 기존 이력을 수정/삭제할 수 있습니다.'}
            </p>

            {formError && (
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
                {formError}
              </div>
            )}

            <form
              onSubmit={handleActionSubmit}
              style={{
                border: `1px solid ${editingId !== null ? colors.blue : colors.line}`,
                borderRadius: 14,
                background: editingId !== null ? colors.blueSoft : '#f8fafc',
                padding: 18,
                marginBottom: 22,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="action-situation" style={labelStyle}>발생 상황</label>
                  <input
                    id="action-situation"
                    value={actionForm.situation}
                    onChange={(event) => handleFormChange('situation', event.target.value)}
                    placeholder="예) 소성로 온도 상한 초과"
                    style={inputStyle}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="action-action" style={labelStyle}>대처 방안</label>
                  <input
                    id="action-action"
                    value={actionForm.action}
                    onChange={(event) => handleFormChange('action', event.target.value)}
                    placeholder="예) 목표 온도 하향 및 냉각 계통 점검"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="action-cause" style={labelStyle}>원인</label>
                  <input
                    id="action-cause"
                    value={actionForm.cause}
                    onChange={(event) => handleFormChange('cause', event.target.value)}
                    placeholder="예) 온도 센서 열화"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="action-manager" style={labelStyle}>담당자</label>
                  <input
                    id="action-manager"
                    value={actionForm.manager}
                    onChange={(event) => handleFormChange('manager', event.target.value)}
                    placeholder="담당자 이름"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="action-date" style={labelStyle}>날짜</label>
                  <input
                    id="action-date"
                    type="date"
                    value={actionForm.date}
                    onChange={(event) => handleFormChange('date', event.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" style={primaryButtonStyle}>
                  {editingId !== null ? '수정 완료' : '추가'}
                </button>
                {editingId !== null && (
                  <button type="button" onClick={cancelEdit} style={ghostButtonStyle}>
                    수정 취소
                  </button>
                )}
              </div>
            </form>

            <div style={{ marginBottom: 14, maxWidth: 360 }}>
              <label htmlFor="action-search" style={labelStyle}>키워드 검색</label>
              <input
                id="action-search"
                value={actionSearch}
                onChange={(event) => setActionSearch(event.target.value)}
                placeholder="상황, 대처, 원인, 담당자 검색"
                style={inputStyle}
              />
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={headCellStyle}>발생 상황</th>
                    <th style={headCellStyle}>대처 방안</th>
                    <th style={headCellStyle}>원인</th>
                    <th style={headCellStyle}>담당자</th>
                    <th style={headCellStyle}>날짜</th>
                    <th style={headCellStyle}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActions.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ ...cellStyle, textAlign: 'center', color: colors.slate, padding: 30 }}>
                        검색 조건에 맞는 이력이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredActions.map((item) => (
                      <tr key={item.id} style={{ background: editingId === item.id ? colors.blueSoft : '#fff' }}>
                        <td style={cellStyle}>{item.situation}</td>
                        <td style={cellStyle}>{item.action}</td>
                        <td style={cellStyle}>{item.cause}</td>
                        <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{item.manager}</td>
                        <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{item.date}</td>
                        <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            style={{
                              ...ghostButtonStyle,
                              padding: '6px 12px',
                              fontSize: 12,
                              color: colors.blue,
                              borderColor: '#bfdbfe',
                              marginRight: 6,
                            }}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            style={{
                              ...ghostButtonStyle,
                              padding: '6px 12px',
                              fontSize: 12,
                              color: colors.red,
                              borderColor: '#fca5a5',
                            }}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'report' && (
          <section style={panelStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 18,
              }}
            >
              <h2 style={{ margin: 0, color: colors.navy, fontSize: 19 }}>
                AI 기반 불량률 원인 분석 데일리 레포트
              </h2>
              <button type="button" onClick={handleGenerateReport} style={primaryButtonStyle}>
                데일리 레포트 생성
              </button>
            </div>

            <div
              style={{
                border: '1px solid #fcd34d',
                borderLeft: `4px solid ${colors.amber}`,
                borderRadius: 12,
                background: colors.amberSoft,
                color: '#92400e',
                padding: '14px 16px',
                fontSize: 14,
                fontWeight: 700,
                lineHeight: 1.65,
                marginBottom: 20,
              }}
            >
              ⚠️ 본 분석은 과거 기록만을 기반으로 하며, 아직 생성되지 않은 파일이나 미래 데이터에는 접근하지 않습니다.
            </div>

            <div
              style={{
                border: `1px solid ${colors.line}`,
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  background: colors.navy,
                  color: '#fff',
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <strong style={{ fontSize: 15 }}>당일 AI 분석 레포트</strong>
                <span style={{ fontSize: 13, color: '#cbd5e1' }}>
                  분석 기준일: {report.baseDate} · 참고 기록 {report.referenceCount}건
                </span>
              </div>
              <div style={{ padding: 20, display: 'grid', gap: 14 }}>
                {[
                  { label: '주요 불량률 상승 원인', value: report.mainCause, color: colors.red, soft: colors.redSoft },
                  { label: '과거 유사 사례', value: report.similarCase, color: colors.blue, soft: colors.blueSoft },
                  { label: 'AI 권장 조치', value: report.recommendation, color: colors.green, soft: colors.greenSoft },
                  { label: '위험도 요약', value: report.riskSummary, color: colors.amber, soft: colors.amberSoft },
                ].map((row) => (
                  <div
                    key={row.label}
                    style={{
                      border: `1px solid ${colors.line}`,
                      borderLeft: `4px solid ${row.color}`,
                      borderRadius: 12,
                      background: row.soft,
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ color: row.color, fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                      {row.label}
                    </div>
                    <p style={{ margin: 0, color: colors.navy, fontSize: 14, lineHeight: 1.7 }}>
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
