'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
} from 'react';
import { useUiSettings } from '@/components/layout/AppShell';

type InquiryStatus = '접수' | '답변완료';
type Visibility = '공개' | '비공개';
type CategoryFilterKey = 'all' | 'system' | 'feature' | 'business' | 'etc';
type StatusFilterKey = 'all' | InquiryStatus;

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
  answeredAt?: string;
};

const INQUIRY_STORAGE_KEY = 'inquiry_records_db';

function parseInquirySeq(id: string): number {
  const matched = /^INQ-(\d+)$/.exec(id);
  if (!matched) return 0;
  const value = Number(matched[1]);
  return Number.isFinite(value) ? value : 0;
}

function readInquiryRecords(): InquiryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(INQUIRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const result: InquiryItem[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (typeof row.id !== 'string' || !row.id) continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const status = row.status === '답변완료' ? '답변완료' : '접수';
      const visibility = row.visibility === '비공개' ? '비공개' : '공개';
      result.push({
        id: row.id,
        category: typeof row.category === 'string' ? row.category : '',
        title: typeof row.title === 'string' ? row.title : '',
        author: typeof row.author === 'string' ? row.author : '',
        date: typeof row.date === 'string' ? row.date : '',
        status,
        content: typeof row.content === 'string' ? row.content : '',
        answer: typeof row.answer === 'string' ? row.answer : '',
        visibility,
        ...(typeof row.answeredAt === 'string' && row.answeredAt
          ? { answeredAt: row.answeredAt }
          : {}),
      });
    }
    return result;
  } catch {
    return [];
  }
}

function writeInquiryRecords(records: InquiryItem[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(INQUIRY_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

function appendInquiryRecord(item: InquiryItem): boolean {
  const current = readInquiryRecords();
  if (current.some((row) => row.id === item.id)) return true;
  return writeInquiryRecords([item, ...current]);
}

function allocateInquiryId(existingIds: string[]): string {
  const maxSeq = existingIds.reduce((max, id) => Math.max(max, parseInquirySeq(id)), 0);
  return `INQ-${String(maxSeq + 1).padStart(3, '0')}`;
}

function mergeInquiryBoardList(
  baseList: InquiryItem[],
  storedList: InquiryItem[],
  staticIds: Set<string>,
): InquiryItem[] {
  const byId = new Map<string, InquiryItem>();

  for (const item of baseList) {
    byId.set(item.id, item);
  }

  const storedOnly: InquiryItem[] = [];
  for (const item of storedList) {
    if (staticIds.has(item.id)) continue;
    byId.set(item.id, item);
    storedOnly.push(item);
  }

  const rest = [...byId.values()].filter(
    (item) => !storedOnly.some((stored) => stored.id === item.id),
  );
  return [...storedOnly, ...rest];
}

const CATEGORIES = [
  '시스템 오류 제보',
  '기능 개선 제안',
  '비즈니스 협업 문의',
  '불량 검사 문의',
  '기타',
] as const;

const CATEGORY_FILTERS: { key: CategoryFilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'system', label: '시스템 오류' },
  { key: 'feature', label: '기능 개선' },
  { key: 'business', label: '비즈니스' },
  { key: 'etc', label: '기타' },
];

const STATUS_FILTERS: { key: StatusFilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: '접수', label: '접수' },
  { key: '답변완료', label: '답변완료' },
];

const USER_NAME = '홍길동';
const USER_EMAIL = 'hong@example.com';
const PAGE_SIZE = 10;

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

function matchesCategoryFilter(category: string, filter: CategoryFilterKey) {
  if (filter === 'all') return true;
  if (filter === 'system') return category === '시스템 오류 제보';
  if (filter === 'feature') return category === '기능 개선 제안';
  if (filter === 'business') return category === '비즈니스 협업 문의';
  // 기타: 명시적 기타 + 필터 라벨에 직접 대응되지 않는 기존 카테고리
  return category === '기타' || category === '불량 검사 문의';
}

/**
 * 기존 코드는 비공개 문의의 제목·본문·답변을 일괄 마스킹합니다.
 * 작성자 ID / 권한 판별 함수가 없어 이름만으로 열람을 허용하지 않습니다.
 */
function canViewInquiry(item: InquiryItem) {
  return item.visibility !== '비공개';
}

function getDisplayFields(item: InquiryItem) {
  if (!canViewInquiry(item)) {
    return {
      title: '비공개 문의입니다.',
      author: '비공개',
      content: '',
      answer: '',
      showBody: false,
    };
  }
  return {
    title: item.title,
    author: item.author,
    content: item.content,
    answer: item.answer,
    showBody: true,
  };
}

function statusBadgeStyle(status: InquiryStatus, isDark: boolean): CSSProperties {
  if (status === '답변완료') {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 999,
      padding: '4px 10px',
      fontSize: 12,
      fontWeight: 800,
      background: isDark ? 'rgba(22, 163, 74, 0.2)' : colors.greenSoft,
      color: isDark ? '#4ade80' : colors.green,
    };
  }
  return {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 800,
    background: isDark ? 'rgba(217, 119, 6, 0.2)' : colors.amberSoft,
    color: isDark ? '#fbbf24' : colors.amber,
  };
}

function visibilityBadgeStyle(visibility: Visibility, isDark: boolean): CSSProperties {
  if (visibility === '비공개') {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      borderRadius: 999,
      padding: '4px 10px',
      fontSize: 12,
      fontWeight: 800,
      background: isDark ? '#334155' : '#f1f5f9',
      color: isDark ? '#94a3b8' : colors.slate,
    };
  }
  return {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 800,
    background: isDark ? 'rgba(37, 99, 235, 0.25)' : colors.blueSoft,
    color: isDark ? '#60a5fa' : colors.blue,
  };
}

export default function InquiryPage() {
  const { isDark, language } = useUiSettings();
  const [inquiries, setInquiries] = useState<InquiryItem[]>(INITIAL_INQUIRIES);
  const [currentPage, setCurrentPage] = useState(1);

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterKey>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<InquiryItem | null>(null);
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
  const [isDragActive, setIsDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const categoryFieldRef = useRef<HTMLDivElement | null>(null);
  const subjectInputRef = useRef<HTMLInputElement | null>(null);
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const nextIdRef = useRef(13);
  const toastTimerRef = useRef<number | null>(null);
  const dragDepthRef = useRef(0);

  const filteredInquiries = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return inquiries.filter((item) => {
      if (!matchesCategoryFilter(item.category, categoryFilter)) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;

      if (!keyword) return true;

      if (!canViewInquiry(item)) {
        // 권한 없는 비공개: 실제 제목·본문으로 검색 매칭하지 않음
        return false;
      }

      return (
        item.title.toLowerCase().includes(keyword) || item.content.toLowerCase().includes(keyword)
      );
    });
  }, [inquiries, categoryFilter, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredInquiries.length / PAGE_SIZE));

  const safePage = Math.min(currentPage, totalPages);

  const visibleInquiries = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredInquiries.slice(start, start + PAGE_SIZE);
  }, [filteredInquiries, safePage]);

  const pageNumbers = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages],
  );

  const displayCountLabel = useMemo(() => {
    if (filteredInquiries.length === 0) return '조건에 맞는 문의가 없습니다.';
    const start = (safePage - 1) * PAGE_SIZE + 1;
    const end = Math.min(safePage * PAGE_SIZE, filteredInquiries.length);
    return `검색 결과 ${filteredInquiries.length}건 · ${start}-${end} 표시 중`;
  }, [filteredInquiries.length, safePage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const clearToastTimer = () => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  };

  const showSuccessToast = (message?: string) => {
    clearToastTimer();
    setToastMessage(
      message ?? '✓ 문의가 정상 접수되었습니다. 관리자 확인 후 답변드릴 예정입니다.',
    );
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('');
      toastTimerRef.current = null;
    }, 2500);
  };

  const staticInquiryIds = useMemo(
    () => new Set(INITIAL_INQUIRIES.map((item) => item.id)),
    [],
  );

  const refreshStoredInquiries = () => {
    const stored = readInquiryRecords();
    setInquiries((prev) => mergeInquiryBoardList(prev, stored, staticInquiryIds));
    setDetailItem((current) => {
      if (!current) return current;
      const latest = stored.find((item) => item.id === current.id);
      return latest ?? current;
    });
  };

  useEffect(() => {
    refreshStoredInquiries();
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== INQUIRY_STORAGE_KEY) return;
      refreshStoredInquiries();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    return () => clearToastTimer();
  }, []);

  const resetForm = () => {
    setCategory(null);
    setVisibility('공개');
    setSubject('');
    setContent('');
    setFiles([]);
    setErrorMessage('');
    setFieldErrors({ category: '', subject: '', content: '' });
    setIsDragActive(false);
    dragDepthRef.current = 0;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const closeModal = () => {
    resetForm();
    setIsModalOpen(false);
  };

  useEffect(() => {
    if (!isModalOpen && !detailItem) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isModalOpen) {
        resetForm();
        setIsModalOpen(false);
      } else {
        setDetailItem(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isModalOpen, detailItem]);

  const openModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const resetFilters = () => {
    setCategoryFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
    setCurrentPage(1);
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

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleDropzoneKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFilePicker();
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    const dropped = event.dataTransfer.files;
    if (!dropped || dropped.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(dropped)]);
  };

  const handleOverlayClick = () => {
    closeModal();
  };

  const handleModalClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  const handleRowClick = (item: InquiryItem) => {
    if (!canViewInquiry(item)) {
      window.alert('작성자 본인만 확인 가능한 비공개 문의입니다.');
      return;
    }
    refreshStoredInquiries();
    const latest =
      readInquiryRecords().find((row) => row.id === item.id) ??
      inquiries.find((row) => row.id === item.id) ??
      item;
    setDetailItem(latest);
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
      if (nextErrors.category) {
        categoryFieldRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      } else if (nextErrors.subject) {
        subjectInputRef.current?.focus();
      } else if (nextErrors.content) {
        contentInputRef.current?.focus();
      }
      return;
    }

    if (!category) return;

    setErrorMessage('');

    const existingIds = [
      ...inquiries.map((item) => item.id),
      ...readInquiryRecords().map((item) => item.id),
    ];
    const newId = allocateInquiryId(existingIds);
    nextIdRef.current = Math.max(nextIdRef.current, parseInquirySeq(newId) + 1);

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

    setInquiries((prev) => [newItem, ...prev.filter((item) => item.id !== newItem.id)]);
    const saved = appendInquiryRecord(newItem);
    setCurrentPage(1);
    resetForm();
    setIsModalOpen(false);
    if (saved) {
      showSuccessToast();
    }
  };

  const page: CSSProperties = {
    height: '100%',
    overflowY: 'auto',
    boxSizing: 'border-box',
    background: isDark ? '#0f172a' : colors.bg,
    color: isDark ? '#f8fafc' : colors.navy,
    padding: '28px 24px 48px',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif",
  };

  const card: CSSProperties = {
    background: isDark ? '#1e293b' : colors.card,
    border: `1px solid ${isDark ? '#334155' : colors.line}`,
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
    border: `1px solid ${isDark ? '#334155' : colors.line}`,
    borderRadius: 10,
    background: isDark ? '#1e293b' : '#fff',
    color: isDark ? '#f1f5f9' : colors.navy,
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
    color: isDark ? '#94a3b8' : colors.slate,
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${isDark ? '#334155' : colors.line}`,
    borderRadius: 10,
    background: isDark ? '#0f172a' : '#f8fafc',
    padding: '10px 12px',
    fontSize: 14,
    color: isDark ? '#f1f5f9' : colors.navy,
    outline: 'none',
  };

  const filterChipClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? 'bg-blue-600 text-white'
        : isDark
          ? 'border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
    }`;

  const pageBtnClass = isDark
    ? 'rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40'
    : 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

  const mutedText = isDark ? '#94a3b8' : colors.slate;
  const lineColor = isDark ? '#334155' : colors.line;
  const chipInactiveBg = isDark ? '#0f172a' : '#f8fafc';
  const chipInactiveColor = isDark ? '#f1f5f9' : colors.navy;
  const chipActiveBg = isDark ? 'rgba(37, 99, 235, 0.25)' : colors.blueSoft;
  const chipActiveColor = isDark ? '#60a5fa' : colors.blue;
  const readonlyFieldBg = isDark ? '#0f172a' : '#f1f5f9';

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
            <h1 style={{ margin: 0, fontSize: 28, letterSpacing: '-0.03em' }}>
              {language === 'en' ? 'Inquiry Board' : '문의 게시판'}
            </h1>
            <p style={{ margin: '8px 0 0', color: isDark ? '#94a3b8' : colors.slate, fontSize: 14, lineHeight: 1.6 }}>
              {language === 'en'
                ? 'Review questions and leave requests about the service.'
                : '서비스 이용 중 궁금한 점이나 요청 사항을 확인하고 문의를 남겨주세요.'}
            </p>
          </div>
          <button type="button" onClick={openModal} style={primaryBtn}>
            {language === 'en' ? 'New Inquiry' : '문의하기'}
          </button>
        </div>

        {toastMessage ? (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-5 left-1/2 z-[120] max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-lg"
          >
            {toastMessage}
          </div>
        ) : null}

        <div
          className={`mb-4 rounded-xl border p-3 shadow-sm sm:p-4 ${
            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`mr-1 text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                카테고리
              </span>
              {CATEGORY_FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setCategoryFilter(item.key);
                    setCurrentPage(1);
                  }}
                  className={filterChipClass(categoryFilter === item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`mr-1 text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                상태
              </span>
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setStatusFilter(item.key);
                    setCurrentPage(1);
                  }}
                  className={filterChipClass(statusFilter === item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <label
                  htmlFor="inquiry-search"
                  className={`mb-1.5 block text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  검색
                </label>
                <input
                  id="inquiry-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="제목 또는 내용 검색..."
                  className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-blue-400 ${
                    isDark
                      ? 'border-slate-600 bg-slate-900 text-slate-100 placeholder:text-slate-500'
                      : 'border-slate-200 bg-slate-50 text-slate-800'
                  }`}
                />
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className={`inline-flex h-10 items-center rounded-lg px-3 text-xs font-semibold ${
                  isDark
                    ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                초기화
              </button>
            </div>
            <div className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              검색 결과 {filteredInquiries.length}건
            </div>
          </div>
        </div>

        <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {visibleInquiries.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: mutedText, fontSize: 14 }}>
              {inquiries.length === 0
                ? '등록된 문의가 없습니다.'
                : '조건에 맞는 문의가 없습니다.'}
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {visibleInquiries.map((item) => {
                const display = getDisplayFields(item);
                const isPrivate = item.visibility === '비공개';
                return (
                  <li key={item.id} style={{ borderBottom: `1px solid ${lineColor}` }}>
                    <button
                      type="button"
                      onClick={() => handleRowClick(item)}
                      className={`w-full cursor-pointer border-0 px-[18px] py-4 text-left transition-colors ${
                        isDark
                          ? 'bg-slate-800 hover:bg-slate-700/80'
                          : 'bg-white hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <span style={statusBadgeStyle(item.status, isDark)}>{item.status}</span>
                            <span style={visibilityBadgeStyle(item.visibility, isDark)}>
                              {isPrivate ? '🔒 비공개' : item.visibility}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {item.category}
                            </span>
                            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              {item.id}
                            </span>
                          </div>
                          <div
                            className={`line-clamp-2 text-[15px] font-extrabold leading-snug ${
                              isDark ? 'text-slate-100' : 'text-slate-900'
                            }`}
                          >
                            {display.title}
                          </div>
                          {display.showBody ? (
                            <div
                              className={`mt-1.5 line-clamp-1 text-xs ${
                                isDark ? 'text-slate-400' : 'text-slate-500'
                              }`}
                            >
                              {display.content}
                            </div>
                          ) : null}
                          <div className={`mt-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {display.author} · {item.date}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                          aria-hidden
                        >
                          →
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div
            className={`flex flex-col items-center gap-3 border-t px-4 py-4 sm:flex-row sm:justify-between ${
              isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-100 bg-slate-50'
            }`}
          >
            <span
              className={`text-xs font-semibold sm:text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
            >
              {displayCountLabel}
            </span>

            {filteredInquiries.length > 0 ? (
              <nav
                aria-label="문의 목록 페이지"
                className="flex flex-wrap items-center justify-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={safePage <= 1}
                  className={pageBtnClass}
                >
                  이전
                </button>
                {pageNumbers.map((page) => {
                  const active = page === safePage;
                  return (
                    <button
                      key={page}
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setCurrentPage(page)}
                      className={`min-w-8 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
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
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={safePage >= totalPages}
                  className={pageBtnClass}
                >
                  다음
                </button>
              </nav>
            ) : null}
          </div>
        </section>
      </div>

      {detailItem && canViewInquiry(detailItem) ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="inquiry-detail-title"
          onClick={() => setDetailItem(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div
            onClick={handleModalClick}
            className={`flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
            }`}
          >
            <div
              className={`flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}
            >
              <h2
                id="inquiry-detail-title"
                className={`m-0 text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
              >
                문의 상세
              </h2>
              <button
                type="button"
                aria-label="상세 모달 닫기"
                onClick={() => setDetailItem(null)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xl ${
                  isDark
                    ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <span style={statusBadgeStyle(detailItem.status, isDark)}>{detailItem.status}</span>
                <span style={visibilityBadgeStyle(detailItem.visibility, isDark)}>
                  {detailItem.visibility}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {detailItem.category}
                </span>
              </div>
              <h3 className={`m-0 text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {detailItem.title}
              </h3>
              <div className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {detailItem.author} · {detailItem.date} · {detailItem.id}
              </div>
              <div
                className={`mt-4 rounded-xl border p-4 ${
                  isDark ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-slate-50/80'
                }`}
              >
                <div className={`mb-2 text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  문의 내용
                </div>
                <p
                  className={`m-0 whitespace-pre-wrap text-sm leading-relaxed ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                  }`}
                >
                  {detailItem.content}
                </p>
              </div>
              {detailItem.answer ? (
                <div
                  className={`mt-4 rounded-xl border p-4 ${
                    isDark
                      ? 'border-blue-800/60 bg-blue-950/40'
                      : 'border-blue-200 bg-blue-50/70'
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-bold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                      관리자 답변
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isDark ? 'bg-blue-900/60 text-blue-300' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      관리자
                    </span>
                    {detailItem.answeredAt ? (
                      <span
                        className={`text-[11px] font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}
                      >
                        {detailItem.answeredAt}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={`m-0 whitespace-pre-wrap text-sm leading-relaxed ${
                      isDark ? 'text-slate-200' : 'text-slate-800'
                    }`}
                  >
                    {detailItem.answer}
                  </p>
                </div>
              ) : (
                <div
                  className={`mt-4 rounded-xl border border-dashed px-4 py-3 text-sm ${
                    isDark
                      ? 'border-slate-600 bg-slate-900/40 text-slate-400'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  아직 등록된 답변이 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="inquiry-write-title"
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
              background: isDark ? '#1e293b' : '#fff',
              borderRadius: 18,
              border: isDark ? '1px solid #334155' : undefined,
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
                borderBottom: `1px solid ${lineColor}`,
                position: 'sticky',
                top: 0,
                background: isDark ? '#1e293b' : '#fff',
                zIndex: 1,
              }}
            >
              <strong
                id="inquiry-write-title"
                style={{ fontSize: 17, color: isDark ? '#f1f5f9' : colors.navy }}
              >
                문의하기
              </strong>
              <button
                type="button"
                aria-label="문의 모달 닫기"
                onClick={closeModal}
                style={{
                  border: 0,
                  background: isDark ? '#334155' : '#f1f5f9',
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 700,
                  color: mutedText,
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

              <div style={{ marginBottom: 18 }} ref={categoryFieldRef}>
                <div style={labelStyle} id="inquiry-category-label">
                  문의 카테고리 <span style={{ color: colors.red }}>*</span>
                </div>
                <div
                  role="group"
                  aria-labelledby="inquiry-category-label"
                  aria-invalid={fieldErrors.category ? true : undefined}
                  aria-describedby={fieldErrors.category ? 'inquiry-category-error' : undefined}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
                >
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
                              : `1px solid ${lineColor}`,
                          background: active ? chipActiveBg : chipInactiveBg,
                          color: active ? chipActiveColor : chipInactiveColor,
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
                  <div
                    id="inquiry-category-error"
                    style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: colors.red }}
                  >
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
                          border: active ? `2px solid ${colors.blue}` : `1px solid ${lineColor}`,
                          background: active ? chipActiveBg : chipInactiveBg,
                          color: active ? chipActiveColor : chipInactiveColor,
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
                      background: readonlyFieldBg,
                      color: mutedText,
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
                      background: readonlyFieldBg,
                      color: mutedText,
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
                  ref={subjectInputRef}
                  type="text"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    if (e.target.value.trim().length > 0) {
                      setFieldErrors((prev) => ({ ...prev, subject: '' }));
                    }
                  }}
                  placeholder="문의 제목을 입력해주세요"
                  aria-invalid={fieldErrors.subject ? true : undefined}
                  aria-describedby={fieldErrors.subject ? 'inquiry-subject-error' : undefined}
                  style={{
                    ...inputStyle,
                    border: fieldErrors.subject
                      ? `2px solid ${colors.red}`
                      : `1px solid ${lineColor}`,
                    background: fieldErrors.subject
                      ? isDark
                        ? 'rgba(220, 38, 38, 0.15)'
                        : colors.redSoft
                      : inputStyle.background,
                  }}
                />
                {fieldErrors.subject ? (
                  <div
                    id="inquiry-subject-error"
                    style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: colors.red }}
                  >
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
                  ref={contentInputRef}
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    if (e.target.value.trim().length > 0) {
                      setFieldErrors((prev) => ({ ...prev, content: '' }));
                    }
                  }}
                  placeholder="문의 내용을 상세히 작성해주세요."
                  aria-invalid={fieldErrors.content ? true : undefined}
                  aria-describedby={fieldErrors.content ? 'inquiry-content-error' : undefined}
                  style={{
                    ...inputStyle,
                    minHeight: 140,
                    resize: 'vertical',
                    lineHeight: 1.6,
                    fontFamily: 'inherit',
                    border: fieldErrors.content
                      ? `2px solid ${colors.red}`
                      : `1px solid ${lineColor}`,
                    background: fieldErrors.content
                      ? isDark
                        ? 'rgba(220, 38, 38, 0.15)'
                        : colors.redSoft
                      : inputStyle.background,
                  }}
                />
                {fieldErrors.content ? (
                  <div
                    id="inquiry-content-error"
                    style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: colors.red }}
                  >
                    {fieldErrors.content}
                  </div>
                ) : null}
              </div>

              <div style={{ marginBottom: 22 }}>
                <div style={labelStyle} id="inquiry-files-label">
                  첨부 파일
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  aria-labelledby="inquiry-files-label"
                  onClick={openFilePicker}
                  onKeyDown={handleDropzoneKeyDown}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                    isDragActive
                      ? isDark
                        ? 'border-blue-400 bg-blue-950/40'
                        : 'border-blue-400 bg-blue-50/60'
                      : isDark
                        ? 'border-slate-600 bg-slate-900/50 hover:border-blue-400'
                        : 'border-slate-200 bg-slate-50/50 hover:border-blue-400'
                  }`}
                >
                  <div
                    className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
                  >
                    스크린샷 또는 파일을 여기에 드래그하거나 클릭하여 업로드
                  </div>
                  <div className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    여러 파일 선택 가능
                  </div>
                </div>
                <input
                  id="inquiry-files"
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="sr-only"
                  tabIndex={-1}
                />
                {files.length > 0 ? (
                  <ul className="mt-3 flex list-none flex-wrap gap-2 p-0">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className={`inline-flex max-w-full items-center gap-2 rounded-full border py-1 pl-3 pr-1 ${
                          isDark
                            ? 'border-slate-600 bg-slate-900'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <span
                          className={`max-w-[180px] truncate text-xs font-medium sm:max-w-[240px] ${
                            isDark ? 'text-slate-200' : 'text-slate-700'
                          }`}
                        >
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleFileRemove(index);
                          }}
                          aria-label={`${file.name} 삭제`}
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isDark
                              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          ×
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
