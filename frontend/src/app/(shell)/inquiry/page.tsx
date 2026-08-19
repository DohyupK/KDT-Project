'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, MouseEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Paperclip } from 'lucide-react';
import { useUiSettings } from '@/components/layout/AppShell';
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent';
import DateInput from '@/components/DateInput';
import axios from 'axios';
import { authApi } from '@/api/authApi';
import { inquiryApi, type InquiryApiItem, type InquiryAttachment } from '@/api/inquiryApi';
import {
  AUTH_CHANGED_EVENT,
  getAuthToken,
  getAuthUser,
  isLoggedIn,
  saveAuthSession,
} from '@/lib/authStorage';
import type { AuthUser } from '@/types';
import { useShellRefresh } from '@/hooks/useShellRefresh';
import { usePageChat } from '@/context/PageChatContext';

function getApiErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return fallback;
}

type InquiryStatus = '접수' | '답변완료';
type Visibility = '공개' | '비공개';
type CategoryFilterKey = 'all' | 'system' | 'feature' | 'business' | 'etc';
type StatusFilterKey = 'all' | InquiryStatus;

type InquiryFilterState = {
  category: CategoryFilterKey;
  status: StatusFilterKey;
  search: string;
  startDate: string;
  endDate: string;
};

const EMPTY_INQUIRY_FILTERS: InquiryFilterState = {
  category: 'all',
  status: 'all',
  search: '',
  startDate: '',
  endDate: '',
};

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
  masked?: boolean;
  attachmentCount: number;
  attachments: InquiryAttachment[];
};

function mapApiItem(item: InquiryApiItem): InquiryItem {
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    author: item.author,
    date: item.date,
    status: item.status === '답변완료' ? '답변완료' : '접수',
    content: item.content,
    answer: item.answer ?? '',
    visibility: item.visibility === '비공개' ? '비공개' : '공개',
    ...(item.answeredAt ? { answeredAt: item.answeredAt } : {}),
    masked: Boolean(item.masked),
    attachmentCount: item.masked ? 0 : item.attachmentCount ?? item.attachments?.length ?? 0,
    attachments: item.masked ? [] : item.attachments ?? [],
  };
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

const PAGE_SIZE = 5;

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

function matchesCategoryFilter(category: string, filter: CategoryFilterKey) {
  if (filter === 'all') return true;
  if (filter === 'system') return category === '시스템 오류 제보';
  if (filter === 'feature') return category === '기능 개선 제안';
  if (filter === 'business') return category === '비즈니스 협업 문의';
  // 기타: 명시적 기타 + 필터 라벨에 직접 대응되지 않는 기존 카테고리
  return category === '기타' || category === '불량 검사 문의';
}

/**
 * 목록·검색용. 백엔드가 비공개 타인 문의를 masked=true 로 내려 주면 본문을 숨깁니다.
 * 작성자·관리자의 비공개 문의는 masked=false 이므로 제목·첨부가 그대로 보입니다.
 */
function canViewInquiry(item: InquiryItem) {
  return !item.masked;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const { setPagePayload, trackPageChatEvent } = usePageChat();
  const searchParams = useSearchParams();
  const deepLinkInquiryRef = useRef<string | null>(null);
  const [inquiries, setInquiries] = useState<InquiryItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [draftFilters, setDraftFilters] = useState<InquiryFilterState>(EMPTY_INQUIRY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<InquiryFilterState>(EMPTY_INQUIRY_FILTERS);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');
  const [answerError, setAnswerError] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [isEditingAnswer, setIsEditingAnswer] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('공개');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    category: string;
    subject: string;
    content: string;
  }>({ category: '', subject: '', content: '' });
  const [toastMessage, setToastMessage] = useState('');
  const [toastTone, setToastTone] = useState<'success' | 'warning'>('success');
  const [isSubmittingInquiry, setIsSubmittingInquiry] = useState(false);
  const [writerProfile, setWriterProfile] = useState<AuthUser | null>(null);
  const [isLoadingWriter, setIsLoadingWriter] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const categoryFieldRef = useRef<HTMLDivElement | null>(null);
  const subjectInputRef = useRef<HTMLInputElement | null>(null);
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const answerTimerRef = useRef<number | null>(null);
  const answerSectionRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollToAnswerRef = useRef(false);

  const filteredInquiries = useMemo(() => {
    const keyword = appliedFilters.search.trim().toLowerCase();
    return inquiries.filter((item) => {
      if (!matchesCategoryFilter(item.category, appliedFilters.category)) return false;
      if (appliedFilters.status !== 'all' && item.status !== appliedFilters.status) return false;
      if (appliedFilters.startDate && item.date < appliedFilters.startDate) return false;
      if (appliedFilters.endDate && item.date > appliedFilters.endDate) return false;

      if (!keyword) return true;

      if (!canViewInquiry(item)) {
        // 권한 없는 비공개: 실제 제목·본문으로 검색 매칭하지 않음
        return false;
      }

      return (
        item.title.toLowerCase().includes(keyword) || item.content.toLowerCase().includes(keyword)
      );
    });
  }, [inquiries, appliedFilters]);

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

  const selectedInquiry = useMemo(
    () => inquiries.find((item) => item.id === selectedInquiryId) ?? null,
    [inquiries, selectedInquiryId],
  );

  useEffect(() => {
    setPagePayload(
      '/inquiry',
      {
        page: 'inquiry',
        filters: appliedFilters,
        total: inquiries.length,
        filteredTotal: filteredInquiries.length,
        pageSize: PAGE_SIZE,
        currentPage: safePage,
        displayLabel: displayCountLabel,
        items: visibleInquiries.slice(0, 10).map((item) => ({
          id: item.id,
          title: canViewInquiry(item) ? item.title.slice(0, 120) : '비공개 문의',
          status: item.status,
          category: item.category,
          visibility: item.visibility,
          date: item.date,
        })),
        selection: selectedInquiry
          ? {
              id: selectedInquiry.id,
              title: canViewInquiry(selectedInquiry)
                ? selectedInquiry.title.slice(0, 160)
                : '비공개 문의',
              status: selectedInquiry.status,
              category: selectedInquiry.category,
            }
          : null,
      },
      ['inquiry'],
    );
  }, [
    setPagePayload,
    appliedFilters,
    inquiries.length,
    filteredInquiries.length,
    safePage,
    displayCountLabel,
    visibleInquiries,
    selectedInquiry,
  ]);

  useEffect(() => {
    if (selectedInquiry && canViewInquiry(selectedInquiry)) {
      trackPageChatEvent({
        type: 'row_select',
        route: '/inquiry',
        target: 'inquiry-item',
        entityId: selectedInquiry.id,
        payload: {
          id: selectedInquiry.id,
          title: selectedInquiry.title.slice(0, 160),
          status: selectedInquiry.status,
          category: selectedInquiry.category,
        },
      });
    } else {
      trackPageChatEvent({ type: 'clear', route: '/inquiry', target: 'inquiry-item' });
    }
  }, [selectedInquiry, trackPageChatEvent]);

  const showAnswerForm =
    !!selectedInquiry &&
    (selectedInquiry.status === '접수' || isEditingAnswer || !selectedInquiry.answer);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!selectedInquiryId) return;
    if (filteredInquiries.some((item) => item.id === selectedInquiryId)) return;
    const deepId = searchParams.get('id')?.trim();
    if (deepId && deepId === selectedInquiryId) return;
    setSelectedInquiryId(null);
  }, [filteredInquiries, selectedInquiryId, searchParams]);

  useEffect(() => {
    if (inquiries.length === 0) return;
    const id = searchParams.get('id')?.trim();
    if (!id) return;
    if (deepLinkInquiryRef.current === id && selectedInquiryId === id) return;

    const match = inquiries.find((item) => item.id === id);
    if (!match) {
      deepLinkInquiryRef.current = id;
      setToastTone('warning');
      setToastMessage(`${id} 문의를 찾을 수 없습니다.`);
      return;
    }

    deepLinkInquiryRef.current = id;
    setDraftFilters(EMPTY_INQUIRY_FILTERS);
    setAppliedFilters(EMPTY_INQUIRY_FILTERS);
    setSelectedInquiryId(id);
  }, [inquiries, searchParams, selectedInquiryId]);

  useEffect(() => {
    const id = searchParams.get('id')?.trim();
    if (!id || selectedInquiryId !== id) return;
    const idx = filteredInquiries.findIndex((item) => item.id === id);
    if (idx < 0) return;
    setCurrentPage(Math.floor(idx / PAGE_SIZE) + 1);
  }, [filteredInquiries, searchParams, selectedInquiryId]);

  useEffect(() => {
    setAnswerDraft('');
    setAnswerError('');
    setIsEditingAnswer(false);
  }, [selectedInquiryId]);

  useEffect(() => {
    if (!pendingScrollToAnswerRef.current || !selectedInquiry) return;
    pendingScrollToAnswerRef.current = false;

    if (selectedInquiry.answer && selectedInquiry.status === '답변완료') {
      setAnswerDraft(selectedInquiry.answer);
      setIsEditingAnswer(true);
    }

    const timer = window.setTimeout(() => {
      answerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const textarea = document.getElementById('admin-answer') as HTMLTextAreaElement | null;
      textarea?.focus({ preventScroll: true });
    }, 50);

    return () => window.clearTimeout(timer);
  }, [selectedInquiryId, selectedInquiry]);

  const clearToastTimer = () => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  };

  const clearAnswerTimer = () => {
    if (answerTimerRef.current !== null) {
      window.clearTimeout(answerTimerRef.current);
      answerTimerRef.current = null;
    }
  };

  const showToast = (message: string, tone: 'success' | 'warning' = 'success') => {
    clearToastTimer();
    setToastTone(tone);
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('');
      toastTimerRef.current = null;
    }, 3200);
  };

  const showSuccessToast = (message?: string) => {
    const text =
      message ?? '✓ 문의가 정상 접수되었습니다. 관리자 확인 후 답변드릴 예정입니다.';
    const tone =
      text.includes('로그인') || text.includes('실패') || text.includes('불러오지')
        ? 'warning'
        : 'success';
    showToast(text, tone);
  };

  const loadInquiriesFromApi = async () => {
    if (!isLoggedIn()) {
      setInquiries([]);
      return;
    }
    setIsLoadingList(true);
    try {
      const { data } = await inquiryApi.list({ page: 1, pageSize: 50 });
      setInquiries(data.items.map(mapApiItem));
    } catch (err) {
      setInquiries([]);
      showToast(getApiErrorMessage(err, '문의 목록을 불러오지 못했습니다.'), 'warning');
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    const syncLocalUser = () => {
      const loggedIn = isLoggedIn();
      setWriterProfile(getAuthUser());
      setIsAuthenticated(loggedIn);
      setAuthReady(true);
      if (loggedIn) void loadInquiriesFromApi();
      else setInquiries([]);
    };
    syncLocalUser();
    window.addEventListener(AUTH_CHANGED_EVENT, syncLocalUser);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncLocalUser);
  }, []);

  useShellRefresh(() => {
    void loadInquiriesFromApi();
  });

  useEffect(() => {
    return () => {
      clearToastTimer();
      clearAnswerTimer();
    };
  }, []);

  const resetForm = () => {
    setCategory(null);
    setVisibility('공개');
    setSubject('');
    setContent('');
    setErrorMessage('');
    setFieldErrors({ category: '', subject: '', content: '' });
  };

  const closeModal = () => {
    resetForm();
    setIsModalOpen(false);
    setIsLoadingWriter(false);
  };

  useEffect(() => {
    if (!isModalOpen && !selectedInquiryId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isModalOpen) {
        resetForm();
        setIsModalOpen(false);
        setIsLoadingWriter(false);
      } else {
        setSelectedInquiryId(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isModalOpen, selectedInquiryId]);

  const openModal = async () => {
    if (!isAuthenticated) {
      showSuccessToast('문의하려면 로그인이 필요합니다.');
      return;
    }

    resetForm();
    setIsModalOpen(true);
    setIsLoadingWriter(true);

    const localUser = getAuthUser();
    if (localUser) setWriterProfile(localUser);

    try {
      const { data } = await authApi.getProfile();
      setWriterProfile(data.user);
      const token = getAuthToken();
      if (token) saveAuthSession(token, data.user);
    } catch {
      if (!localUser) {
        setIsModalOpen(false);
        showSuccessToast('프로필을 불러오지 못했습니다. 다시 로그인해 주세요.');
      }
    } finally {
      setIsLoadingWriter(false);
    }
  };

  const resetFilters = () => {
    setDraftFilters(EMPTY_INQUIRY_FILTERS);
    setAppliedFilters(EMPTY_INQUIRY_FILTERS);
    setCurrentPage(1);
  };

  const applyInstantFilters = (
    patch: Partial<Pick<InquiryFilterState, 'category' | 'status' | 'startDate' | 'endDate'>>,
  ) => {
    setDraftFilters((prev) => ({ ...prev, ...patch }));
    setAppliedFilters((prev) => ({ ...prev, ...patch }));
    setCurrentPage(1);
  };

  const handleApplySearch = () => {
    setAppliedFilters((prev) => ({ ...prev, search: draftFilters.search }));
    setCurrentPage(1);
  };

  const handleOverlayClick = () => {
    closeModal();
  };

  const handleModalClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  const handleRowClick = (item: InquiryItem) => {
    setSelectedInquiryId(item.id);
  };

  const handleDownloadAttachment = async (attachment: InquiryAttachment) => {
    if (!selectedInquiry) return;
    try {
      const { data } = await inquiryApi.download(selectedInquiry.id, attachment.id);
      if (data.type.includes('application/json')) {
        const text = await data.text();
        try {
          const parsed = JSON.parse(text) as { message?: string };
          showToast(parsed.message || '첨부파일을 내려받지 못했습니다.', 'warning');
        } catch {
          showToast('첨부파일을 내려받지 못했습니다.', 'warning');
        }
        return;
      }
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(getApiErrorMessage(err, '첨부파일을 내려받지 못했습니다.'), 'warning');
    }
  };

  const scrollToAnswerSection = () => {
    window.setTimeout(() => {
      answerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const textarea = document.getElementById('admin-answer') as HTMLTextAreaElement | null;
      textarea?.focus({ preventScroll: true });
    }, 50);
  };

  const handleArrowClick = (event: MouseEvent<HTMLButtonElement>, item: InquiryItem) => {
    event.stopPropagation();
    pendingScrollToAnswerRef.current = true;

    if (selectedInquiryId === item.id) {
      pendingScrollToAnswerRef.current = false;
      if (item.answer && item.status === '답변완료') {
        setAnswerDraft(item.answer);
        setIsEditingAnswer(true);
      }
      scrollToAnswerSection();
      return;
    }

    setSelectedInquiryId(item.id);
  };

  const handleResetAnswer = () => {
    setAnswerDraft('');
    setAnswerError('');
  };

  const handleStartEditAnswer = () => {
    if (!selectedInquiry) return;
    setAnswerDraft(selectedInquiry.answer);
    setAnswerError('');
    setIsEditingAnswer(true);
  };

  const handleSubmitAnswer = async () => {
    if (!selectedInquiry || isSubmittingAnswer) return;

    const trimmed = answerDraft.trim();
    if (!trimmed) {
      setAnswerError('답변 내용을 입력해 주세요.');
      return;
    }
    if (trimmed.length > 1000) {
      setAnswerError('답변은 최대 1,000자까지 입력할 수 있습니다.');
      return;
    }

    const inquiryId = selectedInquiry.id;
    const isEdit = selectedInquiry.status === '답변완료' && !!selectedInquiry.answer;
    setAnswerError('');
    setIsSubmittingAnswer(true);

    try {
      const { data } = await inquiryApi.answer(inquiryId, trimmed);
      const updated = mapApiItem(data.item);
      setInquiries((prev) => prev.map((item) => (item.id === inquiryId ? updated : item)));
      setAnswerDraft('');
      setIsEditingAnswer(false);
      showSuccessToast(
        isEdit ? '✅ 문의 답변이 수정되었습니다.' : '✅ 문의 답변이 등록되었습니다.',
      );
    } catch (err) {
      setAnswerError(getApiErrorMessage(err, '답변 등록에 실패했습니다.'));
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
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

    if (!isAuthenticated || !writerProfile?.name?.trim() || !writerProfile?.email?.trim()) {
      setErrorMessage('로그인 계정 정보를 확인할 수 없습니다. 다시 로그인해 주세요.');
      return;
    }

    setErrorMessage('');
    setIsSubmittingInquiry(true);
    try {
      const { data } = await inquiryApi.create({
        category,
        visibility,
        title: subject.trim(),
        content: content.trim(),
      });
      const created = mapApiItem(data.item);
      setInquiries((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setCurrentPage(1);
      resetForm();
      setIsModalOpen(false);
      showSuccessToast();
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, '문의 접수에 실패했습니다.'));
    } finally {
      setIsSubmittingInquiry(false);
    }
  };

  const page: CSSProperties = {
    height: '100%',
    overflowY: 'auto',
    boxSizing: 'border-box',
    color: isDark ? '#f8fafc' : colors.navy,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif",
  };

  const pageBgClass = isDark
    ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800'
    : 'bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50';

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
    <div className={pageBgClass} style={page}>
      <div className={`${SHELL_CONTENT_CLASS} py-6 pb-12`}>
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
          <div className="flex flex-col gap-1">
            <p
              className={`text-sm font-bold tracking-wide ${
                isDark ? 'text-blue-400' : 'text-blue-600'
              }`}
            >
              Inquiry Board
            </p>
            <h1
              className={`mt-1 text-3xl font-bold tracking-tight ${
                isDark ? 'text-slate-100' : 'text-gray-900'
              }`}
            >
              {language === 'en' ? 'Inquiry Board' : '문의 게시판'}
            </h1>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
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
            className="fixed inset-0 z-[220] flex items-center justify-center bg-black/35 p-4"
            role="presentation"
          >
            <div
              role="status"
              aria-live="polite"
              className={`max-w-[min(440px,calc(100vw-2rem))] rounded-2xl border px-5 py-4 text-center text-sm font-semibold shadow-2xl ${
                toastTone === 'warning'
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              {toastMessage}
            </div>
          </div>
        ) : null}

        <div
          className={`mb-4 rounded-xl border p-3 shadow-sm sm:p-4 ${
            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
          }`}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              handleApplySearch();
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`w-14 shrink-0 text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                카테고리
              </span>
              {CATEGORY_FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => applyInstantFilters({ category: item.key })}
                  className={filterChipClass(draftFilters.category === item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className={`w-14 shrink-0 text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  상태
                </span>
                {STATUS_FILTERS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => applyInstantFilters({ status: item.key })}
                    className={filterChipClass(draftFilters.status === item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div
                className="flex flex-wrap items-center gap-2"
                aria-label="문의 기간"
              >
                <span className={`shrink-0 text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  기간
                </span>
                <div className="w-[9.75rem] shrink-0">
                  <DateInput
                    id="inquiry-start-date"
                    aria-label="문의 시작일"
                    value={draftFilters.startDate}
                    onChange={(startDate) => applyInstantFilters({ startDate })}
                    isDark={isDark}
                  />
                </div>
                <span className={`shrink-0 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  ~
                </span>
                <div className="w-[9.75rem] shrink-0">
                  <DateInput
                    id="inquiry-end-date"
                    aria-label="문의 종료일"
                    value={draftFilters.endDate}
                    onChange={(endDate) => applyInstantFilters({ endDate })}
                    isDark={isDark}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="inquiry-search"
                className={`w-14 shrink-0 text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
              >
                검색
              </label>
              <input
                id="inquiry-search"
                type="search"
                value={draftFilters.search}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, search: event.target.value }))
                }
                placeholder="제목 또는 내용 검색..."
                className={`h-9 min-w-[200px] flex-1 rounded-md border px-3 text-sm outline-none focus:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                  isDark
                    ? 'border-slate-600 bg-slate-900 text-slate-100 placeholder:text-slate-500'
                    : 'border-slate-200 bg-white text-slate-800'
                }`}
              />
              <button
                type="submit"
                className="inline-flex h-9 shrink-0 items-center rounded-md bg-slate-900 px-3.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                검색
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className={`inline-flex h-9 shrink-0 items-center rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                  isDark
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                초기화
              </button>
            </div>
            <div className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              검색 결과 {filteredInquiries.length}건
            </div>
          </form>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {visibleInquiries.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: mutedText, fontSize: 14 }}>
              {isLoadingList
                ? '문의 목록을 불러오는 중...'
                : !authReady
                  ? '로그인 상태를 확인하는 중...'
                  : !isAuthenticated
                  ? '로그인 후 문의 목록을 확인할 수 있습니다.'
                  : inquiries.length === 0
                    ? '등록된 문의가 없습니다.'
                    : '조건에 맞는 문의가 없습니다.'}
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {visibleInquiries.map((item) => {
                const display = getDisplayFields(item);
                const isPrivate = item.visibility === '비공개';
                const isSelected = item.id === selectedInquiryId;
                return (
                  <li key={item.id} style={{ borderBottom: `1px solid ${lineColor}` }}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onClick={() => handleRowClick(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleRowClick(item);
                        }
                      }}
                      className={`flex w-full cursor-pointer items-start gap-2 border-0 px-[18px] py-4 text-left transition-colors ${
                        isSelected
                          ? isDark
                            ? 'border-l-4 border-l-blue-500 bg-blue-950/40'
                            : 'border-l-4 border-l-blue-500 bg-blue-50'
                          : isDark
                            ? 'bg-slate-800 hover:bg-slate-700/80'
                            : 'bg-white hover:bg-slate-50/80'
                      }`}
                    >
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
                          {item.attachmentCount > 0 ? (
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold ${
                                isDark ? 'text-slate-300' : 'text-slate-500'
                              }`}
                              title={`첨부 ${item.attachmentCount}개`}
                            >
                              <Paperclip className="h-3.5 w-3.5" aria-hidden />
                              {item.attachmentCount}
                            </span>
                          ) : null}
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
                      <button
                        type="button"
                        aria-label={`${item.id} 답변 작성으로 이동`}
                        onClick={(event) => handleArrowClick(event, item)}
                        className={`mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm transition-colors ${
                          isDark
                            ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                      >
                        →
                      </button>
                    </div>
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

        <aside
          className={`rounded-xl border shadow-sm ${
            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
          }`}
        >
          {!selectedInquiry ? (
            <div className="px-5 py-16 text-center text-sm text-slate-400">
              목록에서 문의를 선택하면 상세 내용과 답변을 등록할 수 있습니다.
            </div>
          ) : (
            <div className="flex max-h-[min(80vh,820px)] flex-col">
              <div
                className={`flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4 ${
                  isDark ? 'border-slate-700' : 'border-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <h2
                    className={`m-0 text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                  >
                    문의 상세
                  </h2>
                  <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {selectedInquiry.id}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="상세 패널 닫기"
                  onClick={() => setSelectedInquiryId(null)}
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl ${
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
                  <span style={statusBadgeStyle(selectedInquiry.status, isDark)}>
                    {selectedInquiry.status}
                  </span>
                  <span style={visibilityBadgeStyle(selectedInquiry.visibility, isDark)}>
                    {selectedInquiry.visibility === '비공개'
                      ? '🔒 비공개'
                      : selectedInquiry.visibility}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {selectedInquiry.category}
                  </span>
                </div>

                <h3 className={`m-0 text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {selectedInquiry.title}
                </h3>
                <div className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  문의자 {selectedInquiry.author} · 등록일 {selectedInquiry.date}
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
                    {selectedInquiry.content}
                  </p>
                </div>

                {selectedInquiry.attachments.length > 0 ? (
                  <div
                    className={`mt-4 rounded-xl border p-4 ${
                      isDark ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-slate-50/80'
                    }`}
                  >
                    <div className={`mb-2 text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      첨부 파일
                    </div>
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {selectedInquiry.attachments.map((file) => (
                        <li
                          key={file.id}
                          className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="min-w-0">
                            <div
                              className={`truncate text-sm font-medium ${
                                isDark ? 'text-slate-100' : 'text-slate-800'
                              }`}
                            >
                              {file.name}
                            </div>
                            <div className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              {formatFileSize(file.size)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDownloadAttachment(file)}
                            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold ${
                              isDark
                                ? 'border-slate-600 text-slate-200 hover:bg-slate-700'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            다운로드
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {selectedInquiry.answer && !isEditingAnswer ? (
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
                      {selectedInquiry.answeredAt ? (
                        <span
                          className={`text-[11px] font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}
                        >
                          {selectedInquiry.answeredAt}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={`m-0 whitespace-pre-wrap text-sm leading-relaxed ${
                        isDark ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      {selectedInquiry.answer}
                    </p>
                    <button
                      type="button"
                      onClick={handleStartEditAnswer}
                      className={`mt-3 inline-flex h-9 items-center rounded-lg border px-3 text-xs font-semibold ${
                        isDark
                          ? 'border-slate-600 text-slate-200 hover:bg-slate-700'
                          : 'border-slate-200 text-slate-700 hover:bg-white'
                      }`}
                    >
                      답변 수정
                    </button>
                  </div>
                ) : null}

                {showAnswerForm ? (
                  <div ref={answerSectionRef} id="inquiry-answer-section" className="mt-4 space-y-3">
                    <div>
                      <label
                        htmlFor="admin-answer"
                        className={`mb-1.5 block text-xs font-bold ${
                          isDark ? 'text-slate-300' : 'text-slate-600'
                        }`}
                      >
                        {isEditingAnswer ? '답변 수정' : '관리자 답변 등록'}
                      </label>
                      <textarea
                        id="admin-answer"
                        aria-label="관리자 답변 입력"
                        placeholder="답변 내용을 입력해 주세요."
                        value={answerDraft}
                        maxLength={1000}
                        onChange={(e) => {
                          setAnswerDraft(e.target.value);
                          if (answerError) setAnswerError('');
                        }}
                        className={`min-h-[140px] w-full resize-y rounded-xl border px-3 py-2.5 text-sm outline-none ${
                          isDark
                            ? 'border-slate-600 bg-slate-900 text-slate-100 placeholder:text-slate-500'
                            : 'border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400'
                        }`}
                      />
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className={`text-xs ${answerError ? 'font-semibold text-red-500' : 'text-slate-400'}`}>
                          {answerError || `${answerDraft.length} / 1000자`}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleResetAnswer}
                        disabled={isSubmittingAnswer}
                        className={`inline-flex h-10 items-center rounded-lg border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                          isDark
                            ? 'border-slate-600 text-slate-200 hover:bg-slate-700'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        초기화
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitAnswer}
                        disabled={isSubmittingAnswer}
                        className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                      >
                        {isSubmittingAnswer
                          ? '등록 중...'
                          : isEditingAnswer
                            ? '답변 수정 완료'
                            : '답변 등록'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </aside>
        </div>
      </div>

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
                    {isLoadingWriter
                      ? '불러오는 중...'
                      : writerProfile?.name?.trim() || '—'}
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
                    {isLoadingWriter
                      ? '불러오는 중...'
                      : writerProfile?.email?.trim() || '—'}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={closeModal} style={secondaryBtn}>
                  취소
                </button>
                <button
                  type="submit"
                  style={primaryBtn}
                  disabled={isSubmittingInquiry || isLoadingWriter}
                >
                  {isSubmittingInquiry ? '접수 중...' : '문의 접수'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
