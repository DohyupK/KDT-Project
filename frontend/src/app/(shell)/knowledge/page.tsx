'use client'

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { knowledgeApi } from '@/api/knowledgeApi';

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterState>({ manager: '', date: '', keyword: '' });
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const [actions, setActions] = useState<ActionHistoryItem[]>([]);
  const [actionSearch, setActionSearch] = useState('');
  const [actionForm, setActionForm] = useState<ActionFormState>(EMPTY_ACTION_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState('');

  const [report, setReport] = useState<ReportData>({
    baseDate: '',
    mainCause: '',
    similarCase: '',
    recommendation: '',
    riskSummary: '',
    referenceCount: 0,
  });

  const loadKnowledge = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [docsRes, actionsRes, reportRes] = await Promise.all([
        knowledgeApi.getDocuments(),
        knowledgeApi.getActions(),
        knowledgeApi.getReport(),
      ]);
      setDocuments(docsRes.data.documents);
      setManagers(docsRes.data.managers);
      setActions(actionsRes.data.actions);
      setReport(reportRes.data.report);
    } catch {
      setLoadError('지식 관리 데이터를 불러오지 못했습니다. 로그인 상태와 백엔드 연결을 확인해주세요.');
      setDocuments([]);
      setManagers([]);
      setActions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKnowledge();
  }, [loadKnowledge]);

  const filteredDocuments = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    return documents.filter((doc) => {
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
  }, [filters, documents]);

  const selectedDoc = useMemo(
    () => documents.find((doc) => doc.id === selectedDocId) ?? null,
    [documents, selectedDocId],
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

  const handleActionSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
    setSubmitting(true);

    try {
      if (editingId !== null) {
        const { data } = await knowledgeApi.updateAction(editingId, trimmed);
        setActions((current) =>
          current.map((item) => (item.id === editingId ? data.action : item)),
        );
        showToast(data.message);
      } else {
        const { data } = await knowledgeApi.createAction(trimmed);
        setActions((current) => [data.action, ...current]);
        showToast(data.message);
      }
      setEditingId(null);
      setActionForm(EMPTY_ACTION_FORM);
    } catch {
      setFormError('저장에 실패했습니다. 서버 연결을 확인해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const { data } = await knowledgeApi.deleteAction(id);
      setActions((current) => current.filter((item) => item.id !== id));
      if (editingId === id) cancelEdit();
      showToast(data.message);
    } catch {
      showToast('삭제에 실패했습니다.');
    }
  };

  const handleGenerateReport = async () => {
    try {
      const { data } = await knowledgeApi.refreshReport();
      setReport(data.report);
      showToast(data.message);
    } catch {
      showToast('레포트 갱신에 실패했습니다.');
    }
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
      <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto' }}>
        {loadError && (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              borderRadius: 12,
              background: colors.redSoft,
              color: colors.red,
              fontSize: 14,
            }}
          >
            {loadError}
          </div>
        )}
        {loading && (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              borderRadius: 12,
              background: colors.blueSoft,
              color: colors.blue,
              fontSize: 14,
            }}
          >
            지식 관리 데이터를 불러오는 중…
          </div>
        )}
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
    </main>
  );
};
