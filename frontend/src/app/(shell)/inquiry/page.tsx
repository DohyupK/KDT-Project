'use client';

import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, FormEvent, MouseEvent } from 'react';

type InquiryStatus = '접수' | '답변완료';
type Visibility = '공개' | '비공개';
type PageSizeOption = 10 | 50 | 100 | 'all';

type InquiryItem = {
  id: string;
  category: string;
  title: string;
  author: string;
  date: string;
  status: InquiryStatus;
  content: string;
  answer: string;
  visibility: Visibility;
};

const CATEGORIES = [
  '시스템 오류 제보',
  '기능 개선 제안',
  '비즈니스 협업 문의',
  '불량 검사 문의',
  '기타',
] as const;

const USER_NAME = '홍길동';
const USER_EMAIL = 'hong@example.com';
const COLLAPSED_COUNT = 5;

const PAGE_SIZE_OPTIONS: { value: PageSizeOption; label: string }[] = [
  { value: 10, label: '10개씩 보기' },
  { value: 50, label: '50개씩 보기' },
  { value: 100, label: '100개씩 보기' },
  { value: 'all', label: '전체 보기' },
];

const INITIAL_INQUIRIES: InquiryItem[] = [
  {
    id: 'INQ-012',
    category: '시스템 오류 제보',
    title: '대시보드 KPI 수치가 간헐적으로 0으로 표시됩니다',
    author: '김민수',
    date: '2026-07-21',
    status: '답변완료',
    content: '생산 대시보드에서 새로고침 후 KPI 카드가 잠깐 0으로 보이다가 복구됩니다.',
    answer: '캐시 갱신 지연 이슈를 확인했으며, 다음 배포에서 로딩 스켈레톤으로 개선 예정입니다.',
    visibility: '공개',
  },
  {
    id: 'INQ-011',
    category: '기능 개선 제안',
    title: '이슈 목록에 담당자 필터를 추가해 주세요',
    author: '이서연',
    date: '2026-07-20',
    status: '접수',
    content: '담당자별 이슈만 빠르게 보고 싶습니다. 다중 선택 필터면 더 좋습니다.',
    answer: '',
    visibility: '공개',
  },
  {
    id: 'INQ-010',
    category: '비즈니스 협업 문의',
    title: '외부 파트너사 계정 공유 가능 여부',
    author: '박준호',
    date: '2026-07-19',
    status: '답변완료',
    content: '협력사 QC 담당자에게 읽기 전용 계정 발급이 가능한지 문의드립니다.',
    answer: '읽기 전용 게스트 계정은 보안 승인 후 발급 가능합니다. IT 지원팀에 요청해 주세요.',
    visibility: '비공개',
  },
  {
    id: 'INQ-009',
    category: '불량 검사 문의',
    title: 'LOT-8821 수분 함량 편차 확인 요청',
    author: '정하늘',
    date: '2026-07-18',
    status: '접수',
    content: '출하 전 검사에서 수분 함량이 상한을 초과한 샘플이 있습니다. 원인 분석 부탁드립니다.',
    answer: '',
    visibility: '비공개',
  },
  {
    id: 'INQ-008',
    category: '기타',
    title: '사이트 매뉴얼 PDF 다운로드 링크가 동작하지 않습니다',
    author: '오수진',
    date: '2026-07-17',
    status: '답변완료',
    content: '헤더의 사이트 매뉴얼 버튼을 눌러도 반응이 없습니다.',
    answer: '정적 파일 경로를 수정했고, 현재는 정상 다운로드됩니다.',
    visibility: '공개',
  },
  {
    id: 'INQ-007',
    category: '시스템 오류 제보',
    title: '문의 첨부파일 업로드 시 용량 제한 안내가 없습니다',
    author: '한도윤',
    date: '2026-07-16',
    status: '접수',
    content: '대용량 파일을 올리면 실패하는데 안내 문구가 없어 원인을 알기 어렵습니다.',
    answer: '',
    visibility: '공개',
  },
  {
    id: 'INQ-006',
    category: '기능 개선 제안',
    title: '지식베이스 검색에 태그 필터를 추가해 주세요',
    author: '윤채원',
    date: '2026-07-15',
    status: '답변완료',
    content: '공정/설비 태그로 자료를 좁혀보고 싶습니다.',
    answer: '태그 필터는 백로그에 반영했으며 다음 스프린트에서 검토합니다.',
    visibility: '공개',
  },
  {
    id: 'INQ-005',
    category: '비즈니스 협업 문의',
    title: '월간 품질 리포트 자동 공유 일정 협의',
    author: '최유진',
    date: '2026-07-14',
    status: '접수',
    content: '매월 1일 품질 리포트를 메일로 공유하는 프로세스를 협의하고 싶습니다.',
    answer: '',
    visibility: '비공개',
  },
  {
    id: 'INQ-004',
    category: '불량 검사 문의',
    title: '표면 결함 판정 기준 문서 위치 문의',
    author: '강도현',
    date: '2026-07-13',
    status: '답변완료',
    content: '최신 표면 결함 판정 기준서가 어디에 있는지 알려주세요.',
    answer: '지식베이스 > 품질 기준서 폴더의 표면결함_판정기준_v3.pdf를 확인해 주세요.',
    visibility: '공개',
  },
  {
    id: 'INQ-003',
    category: '기타',
    title: '알림음 설정 초기화 방법',
    author: '서예린',
    date: '2026-07-12',
    status: '접수',
    content: '이슈 알림음이 너무 잦아 끄고 싶은데 설정 위치를 모르겠습니다.',
    answer: '',
    visibility: '공개',
  },
  {
    id: 'INQ-002',
    category: '시스템 오류 제보',
    title: '모바일에서 테이블 가로 스크롤이 끊깁니다',
    author: '남기태',
    date: '2026-07-11',
    status: '답변완료',
    content: '태블릿 가로 모드에서 문의/이슈 테이블이 중간에 끊깁니다.',
    answer: '반응형 overflow 설정을 수정해 배포했습니다. 캐시 삭제 후 재확인 부탁드립니다.',
    visibility: '공개',
  },
  {
    id: 'INQ-001',
    category: '기능 개선 제안',
    title: '챗봇 답변에 LOT 바로가기 링크 추가 요청',
    author: '문지아',
    date: '2026-07-10',
    status: '접수',
    content: '챗봇이 LOT를 언급할 때 상세 페이지로 바로 이동되면 좋겠습니다.',
    answer: '',
    visibility: '공개',
  },
];

const colors = {
  bg: '#f8fafc',
  card: '#ffffff',
  navy: '#0f172a',
  slate: '#64748b',
  line: '#e2e8f0',
  blue: '#2563eb',
  blueSoft: '#eff6ff',
  red: '#dc2626',
  redSoft: '#fef2f2',
  green: '#16a34a',
  greenSoft: '#f0fdf4',
  amber: '#d97706',
  amberSoft: '#fffbeb',
};

function formatToday() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function statusBadgeStyle(status: InquiryStatus): CSSProperties {
  if (status === '답변완료') {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 999,
      padding: '4px 10px',
      fontSize: 12,
      fontWeight: 800,
      background: colors.greenSoft,
      color: colors.green,
    };
  }
  return {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 800,
    background: colors.amberSoft,
    color: colors.amber,
  };
}

function visibilityBadgeStyle(visibility: Visibility): CSSProperties {
  if (visibility === '비공개') {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 999,
      padding: '4px 10px',
      fontSize: 12,
      fontWeight: 800,
      background: '#f1f5f9',
      color: colors.slate,
    };
  }
  return {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 800,
    background: colors.blueSoft,
    color: colors.blue,
  };
}

function getDisplayFields(item: InquiryItem) {
  if (item.visibility === '비공개') {
    return {
      title: '비공개 문의입니다.',
      author: '비공개',
      content: '비공개 문의 내용입니다.',
      answer: '비공개 문의 내용입니다.',
    };
  }
  return {
    title: item.title,
    author: item.author,
    content: item.content,
    answer: item.answer || '아직 등록된 답변이 없습니다.',
  };
}

export default function InquiryPage() {
  const [inquiries, setInquiries] = useState<InquiryItem[]>(INITIAL_INQUIRIES);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);
  const [isExpandedList, setIsExpandedList] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('공개');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    category: string;
    subject: string;
    content: string;
  }>({ category: '', subject: '', content: '' });
  const [toastMessage, setToastMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nextIdRef = useRef(13);

  const limitedInquiries = useMemo(() => {
    if (pageSize === 'all') return inquiries;
    return inquiries.slice(0, pageSize);
  }, [inquiries, pageSize]);

  const visibleInquiries = useMemo(() => {
    if (isExpandedList) return limitedInquiries;
    return limitedInquiries.slice(0, COLLAPSED_COUNT);
  }, [limitedInquiries, isExpandedList]);

  const showExpandToggle = limitedInquiries.length > COLLAPSED_COUNT;

  const displayCountLabel = useMemo(() => {
    if (inquiries.length === 0) return '표시할 문의가 없습니다.';
    return `최근 ${visibleInquiries.length}개 표시 중...`;
  }, [inquiries.length, visibleInquiries.length]);

  const selectedPageSizeLabel =
    PAGE_SIZE_OPTIONS.find((opt) => opt.value === pageSize)?.label ?? '10개씩 보기';

  const resetForm = () => {
    setCategory(null);
    setVisibility('공개');
    setSubject('');
    setContent('');
    setFiles([]);
    setErrorMessage('');
    setFieldErrors({ category: '', subject: '', content: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const closeModal = () => {
    resetForm();
    setIsModalOpen(false);
  };

  const openModal = () => {
    resetForm();
    setToastMessage('');
    setIsModalOpen(true);
  };

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(selected)]);
    e.target.value = '';
  };

  const handleFileRemove = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOverlayClick = () => {
    closeModal();
  };

  const handleModalClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const nextErrors = {
      category: !category ? '문의 카테고리를 선택해주세요.' : '',
      subject: subject.trim().length === 0 ? '문의 제목을 입력해주세요.' : '',
      content: content.trim().length === 0 ? '문의 내용을 입력해주세요.' : '',
    };
    setFieldErrors(nextErrors);

    const messages = [nextErrors.category, nextErrors.subject, nextErrors.content].filter(
      (msg) => msg.length > 0,
    );
    if (messages.length > 0) {
      setErrorMessage(
        messages.length === 1
          ? messages[0]
          : `입력하지 않은 항목이 ${messages.length}개 있습니다. 아래 표시된 항목을 확인해 주세요.`,
      );
      return;
    }

    if (!category) return;

    setErrorMessage('');

    const newId = `INQ-${String(nextIdRef.current).padStart(3, '0')}`;
    nextIdRef.current += 1;

    const payload = {
      id: newId,
      category,
      title: subject.trim(),
      author: USER_NAME,
      date: formatToday(),
      status: '접수' as const,
      content: content.trim(),
      answer: '',
      visibility,
      email: USER_EMAIL,
      files: files.map((file) => file.name),
    };

    console.log('문의 접수 데이터:', payload);

    const newItem: InquiryItem = {
      id: payload.id,
      category: payload.category,
      title: payload.title,
      author: payload.author,
      date: payload.date,
      status: payload.status,
      content: payload.content,
      answer: payload.answer,
      visibility: payload.visibility,
    };

    setInquiries((prev) => [newItem, ...prev]);
    setExpandedId(null);
    setIsExpandedList(false);
    setToastMessage('문의가 정상적으로 접수되었습니다. 빠른 시일 내에 답변드리겠습니다.');
    resetForm();
    setIsModalOpen(false);
  };

  const page: CSSProperties = {
    height: '100%',
    overflowY: 'auto',
    boxSizing: 'border-box',
    background: colors.bg,
    color: colors.navy,
    padding: '28px 24px 48px',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif",
  };

  const card: CSSProperties = {
    background: colors.card,
    border: `1px solid ${colors.line}`,
    borderRadius: 16,
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  };

  const primaryBtn: CSSProperties = {
    border: 0,
    borderRadius: 10,
    background: colors.blue,
    color: '#fff',
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
  };

  const secondaryBtn: CSSProperties = {
    border: `1px solid ${colors.line}`,
    borderRadius: 10,
    background: '#fff',
    color: colors.navy,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: 8,
    fontSize: 13,
    fontWeight: 700,
    color: colors.slate,
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${colors.line}`,
    borderRadius: 10,
    background: '#f8fafc',
    padding: '10px 12px',
    fontSize: 14,
    color: colors.navy,
    outline: 'none',
  };

  return (
    <div style={page}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            marginBottom: 20,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 28, letterSpacing: '-0.03em' }}>문의 게시판</h1>
            <p style={{ margin: '8px 0 0', color: colors.slate, fontSize: 14, lineHeight: 1.6 }}>
              서비스 이용 중 궁금한 점이나 요청 사항을 확인하고 문의를 남겨주세요.
            </p>
          </div>
          <button type="button" onClick={openModal} style={primaryBtn}>
            문의하기
          </button>
        </div>

        {toastMessage ? (
          <div
            role="status"
            style={{
              marginBottom: 16,
              border: '1px solid #bbf7d0',
              background: colors.greenSoft,
              color: colors.green,
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {toastMessage}
          </div>
        ) : null}

        <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {visibleInquiries.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.slate, fontSize: 14 }}>
              등록된 문의가 없습니다.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {visibleInquiries.map((item) => {
                const open = expandedId === item.id;
                const display = getDisplayFields(item);
                return (
                  <li key={item.id} style={{ borderBottom: `1px solid ${colors.line}` }}>
                    <button
                      type="button"
                      onClick={() => handleToggleExpand(item.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 0,
                        background: open ? colors.blueSoft : '#fff',
                        padding: '16px 18px',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          alignItems: 'flex-start',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              marginBottom: 6,
                            }}
                          >
                            <span style={statusBadgeStyle(item.status)}>{item.status}</span>
                            <span style={visibilityBadgeStyle(item.visibility)}>
                              {item.visibility}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: colors.slate,
                                background: '#f1f5f9',
                                borderRadius: 999,
                                padding: '3px 8px',
                                fontWeight: 700,
                              }}
                            >
                              {item.category}
                            </span>
                            <span style={{ fontSize: 12, color: colors.slate }}>{item.id}</span>
                          </div>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 800,
                              color: colors.navy,
                              lineHeight: 1.45,
                            }}
                          >
                            {display.title}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 12, color: colors.slate }}>
                            {display.author} · {item.date}
                          </div>
                        </div>
                        <span style={{ color: colors.slate, fontSize: 18, fontWeight: 700 }}>
                          {open ? '▾' : '▸'}
                        </span>
                      </div>
                    </button>

                    {open ? (
                      <div
                        style={{
                          padding: '0 18px 18px',
                          background: colors.blueSoft,
                        }}
                      >
                        <div
                          style={{
                            background: '#fff',
                            border: `1px solid ${colors.line}`,
                            borderRadius: 12,
                            padding: 14,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: colors.slate,
                              marginBottom: 6,
                            }}
                          >
                            문의 내용
                          </div>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 14,
                              lineHeight: 1.7,
                              color: colors.navy,
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {display.content}
                          </p>
                          <div
                            style={{
                              marginTop: 14,
                              paddingTop: 14,
                              borderTop: `1px solid ${colors.line}`,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 800,
                                color: colors.slate,
                                marginBottom: 6,
                              }}
                            >
                              답변
                            </div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 14,
                                lineHeight: 1.7,
                                color:
                                  item.visibility === '비공개' || item.answer
                                    ? colors.navy
                                    : colors.slate,
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {display.answer}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center',
              gap: 12,
              padding: '14px 18px',
              background: '#f8fafc',
            }}
          >
            <span style={{ fontSize: 13, color: colors.slate, fontWeight: 700 }}>
              {displayCountLabel}
            </span>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {showExpandToggle ? (
                <button
                  type="button"
                  onClick={() => setIsExpandedList((prev) => !prev)}
                  style={{
                    ...primaryBtn,
                    borderRadius: 999,
                    padding: '9px 20px',
                  }}
                >
                  {isExpandedList
                    ? '접기'
                    : `펼치기 (+${pageSize === 'all' ? inquiries.length : pageSize})`}
                </button>
              ) : null}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsPageSizeOpen((prev) => !prev)}
                  aria-haspopup="listbox"
                  aria-expanded={isPageSizeOpen}
                  style={{
                    ...secondaryBtn,
                    minWidth: 140,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span>{selectedPageSizeLabel}</span>
                  <span>{isPageSizeOpen ? '▴' : '▾'}</span>
                </button>

                {isPageSizeOpen ? (
                  <ul
                    role="listbox"
                    aria-label="목록 개수 선택"
                    style={{
                      position: 'absolute',
                      right: 0,
                      bottom: 'calc(100% + 8px)',
                      margin: 0,
                      padding: 6,
                      listStyle: 'none',
                      background: '#fff',
                      border: `1px solid ${colors.line}`,
                      borderRadius: 12,
                      boxShadow: '0 12px 28px rgba(15, 23, 42, 0.12)',
                      minWidth: 160,
                      zIndex: 20,
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((opt) => {
                      const active = pageSize === opt.value;
                      return (
                        <li key={opt.label} role="option" aria-selected={active}>
                          <button
                            type="button"
                            onClick={() => {
                              setPageSize(opt.value);
                              setIsPageSizeOpen(false);
                              setIsExpandedList(false);
                            }}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              border: 0,
                              borderRadius: 8,
                              background: active ? colors.blueSoft : 'transparent',
                              color: active ? colors.blue : colors.navy,
                              padding: '10px 12px',
                              fontSize: 13,
                              fontWeight: active ? 800 : 600,
                              cursor: 'pointer',
                            }}
                          >
                            {opt.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>

      {isModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="문의하기"
          onClick={handleOverlayClick}
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
            onClick={handleModalClick}
            style={{
              width: 'min(720px, 100%)',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 18,
              boxShadow: '0 24px 64px rgba(15, 23, 42, 0.35)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                padding: '16px 20px',
                borderBottom: `1px solid ${colors.line}`,
                position: 'sticky',
                top: 0,
                background: '#fff',
                zIndex: 1,
              }}
            >
              <strong style={{ fontSize: 17, color: colors.navy }}>문의하기</strong>
              <button
                type="button"
                aria-label="문의 모달 닫기"
                onClick={closeModal}
                style={{
                  border: 0,
                  background: '#f1f5f9',
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 700,
                  color: colors.slate,
                }}
              >
                X
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate style={{ padding: 20 }}>
              {errorMessage ? (
                <div
                  role="alert"
                  style={{
                    marginBottom: 16,
                    border: '1px solid #fecaca',
                    background: colors.redSoft,
                    color: colors.red,
                    borderRadius: 12,
                    padding: '12px 14px',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  <div>{errorMessage}</div>
                  {(fieldErrors.category || fieldErrors.subject || fieldErrors.content) && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontWeight: 600 }}>
                      {fieldErrors.category ? <li>{fieldErrors.category}</li> : null}
                      {fieldErrors.subject ? <li>{fieldErrors.subject}</li> : null}
                      {fieldErrors.content ? <li>{fieldErrors.content}</li> : null}
                    </ul>
                  )}
                </div>
              ) : null}

              <div style={{ marginBottom: 18 }}>
                <div style={labelStyle}>
                  문의 카테고리 <span style={{ color: colors.red }}>*</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {CATEGORIES.map((item) => {
                    const active = category === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setCategory(item);
                          setFieldErrors((prev) => ({ ...prev, category: '' }));
                        }}
                        style={{
                          border: active
                            ? `2px solid ${colors.blue}`
                            : fieldErrors.category
                              ? `2px solid ${colors.red}`
                              : `1px solid ${colors.line}`,
                          background: active ? colors.blueSoft : '#f8fafc',
                          color: active ? colors.blue : colors.navy,
                          borderRadius: 999,
                          padding: '8px 12px',
                          fontSize: 13,
                          fontWeight: active ? 800 : 600,
                          cursor: 'pointer',
                        }}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.category ? (
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: colors.red }}>
                    {fieldErrors.category}
                  </div>
                ) : null}
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={labelStyle}>공개 여부</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['공개', '비공개'] as Visibility[]).map((option) => {
                    const active = visibility === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setVisibility(option)}
                        style={{
                          border: active ? `2px solid ${colors.blue}` : `1px solid ${colors.line}`,
                          background: active ? colors.blueSoft : '#f8fafc',
                          color: active ? colors.blue : colors.navy,
                          borderRadius: 999,
                          padding: '8px 14px',
                          fontSize: 13,
                          fontWeight: active ? 800 : 600,
                          cursor: 'pointer',
                        }}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginBottom: 18,
                }}
              >
                <div>
                  <div style={labelStyle}>이름</div>
                  <div
                    style={{
                      ...inputStyle,
                      background: '#f1f5f9',
                      color: colors.slate,
                      cursor: 'default',
                    }}
                  >
                    {USER_NAME}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>이메일</div>
                  <div
                    style={{
                      ...inputStyle,
                      background: '#f1f5f9',
                      color: colors.slate,
                      cursor: 'default',
                    }}
                  >
                    {USER_EMAIL}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label htmlFor="inquiry-subject" style={labelStyle}>
                  문의 제목 <span style={{ color: colors.red }}>*</span>
                </label>
                <input
                  id="inquiry-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    if (e.target.value.trim().length > 0) {
                      setFieldErrors((prev) => ({ ...prev, subject: '' }));
                    }
                  }}
                  placeholder="문의 제목을 입력해주세요"
                  style={{
                    ...inputStyle,
                    border: fieldErrors.subject
                      ? `2px solid ${colors.red}`
                      : `1px solid ${colors.line}`,
                    background: fieldErrors.subject ? colors.redSoft : '#f8fafc',
                  }}
                />
                {fieldErrors.subject ? (
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: colors.red }}>
                    {fieldErrors.subject}
                  </div>
                ) : null}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label htmlFor="inquiry-content" style={labelStyle}>
                  문의 내용 <span style={{ color: colors.red }}>*</span>
                </label>
                <textarea
                  id="inquiry-content"
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    if (e.target.value.trim().length > 0) {
                      setFieldErrors((prev) => ({ ...prev, content: '' }));
                    }
                  }}
                  placeholder="문의 내용을 상세히 작성해주세요."
                  style={{
                    ...inputStyle,
                    minHeight: 140,
                    resize: 'vertical',
                    lineHeight: 1.6,
                    fontFamily: 'inherit',
                    border: fieldErrors.content
                      ? `2px solid ${colors.red}`
                      : `1px solid ${colors.line}`,
                    background: fieldErrors.content ? colors.redSoft : '#f8fafc',
                  }}
                />
                {fieldErrors.content ? (
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: colors.red }}>
                    {fieldErrors.content}
                  </div>
                ) : null}
              </div>

              <div style={{ marginBottom: 22 }}>
                <label htmlFor="inquiry-files" style={labelStyle}>
                  첨부 파일
                </label>
                <label
                  htmlFor="inquiry-files"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: 10,
                    background: colors.blueSoft,
                    color: colors.blue,
                    padding: '9px 12px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  파일 선택 (여러 개 가능)
                </label>
                <input
                  id="inquiry-files"
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                {files.length > 0 ? (
                  <ul
                    style={{
                      listStyle: 'none',
                      margin: '12px 0 0',
                      padding: 0,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                          border: `1px solid ${colors.line}`,
                          borderRadius: 10,
                          background: '#f8fafc',
                          padding: '8px 10px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            color: colors.navy,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleFileRemove(index)}
                          aria-label={`${file.name} 삭제`}
                          style={{
                            border: 0,
                            background: '#e2e8f0',
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            cursor: 'pointer',
                            fontWeight: 700,
                            color: colors.slate,
                            flexShrink: 0,
                          }}
                        >
                          X
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={closeModal} style={secondaryBtn}>
                  취소
                </button>
                <button type="submit" style={primaryBtn}>
                  문의 접수
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
