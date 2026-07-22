import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckCircle,
  ChevronDown,
  Eye,
  HelpCircle,
  Lightbulb,
  Lock,
  Mail,
  MoreHorizontal,
  Paperclip,
  SearchCheck,
  Send,
  User,
  X,
} from 'lucide-react';

const CATEGORIES = [
  { name: '시스템 오류 제보', icon: <AlertCircle size={18} /> },
  { name: '기능 개선 제안', icon: <Lightbulb size={18} /> },
  { name: '생산/출하 일정 문의', icon: <CalendarClock size={18} /> },
  { name: '불량 검사 문의', icon: <SearchCheck size={18} /> },
  { name: '기타', icon: <MoreHorizontal size={18} /> },
] as const;

const USER_NAME = '홍길동';
const USER_EMAIL = 'hong@example.com';

export const InquiryPage = () => {
  const [category, setCategory] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const categoryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isCategoryOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) {
        setIsCategoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isCategoryOpen]);

  const selectedCategory = CATEGORIES.find((item) => item.name === category) ?? null;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(selected)]);
    e.target.value = '';
  };

  const handleFileRemove = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setCategory(null);
    setSubject('');
    setContent('');
    setFiles([]);
    setIsPrivate(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!category) {
      setErrorMessage('문의 카테고리를 선택해주세요.');
      return;
    }
    if (subject.trim().length === 0) {
      setErrorMessage('문의 제목을 입력해주세요.');
      return;
    }
    if (content.trim().length === 0) {
      setErrorMessage('문의 내용을 입력해주세요.');
      return;
    }

    console.log('문의 접수 데이터:', {
      카테고리: category,
      이름: USER_NAME,
      이메일: USER_EMAIL,
      제목: subject.trim(),
      내용: content.trim(),
      파일목록: files.map((file) => file.name),
      공개여부: isPrivate ? '비공개' : '공개',
    });

    setSuccessMessage(
      isPrivate
        ? '비공개 문의가 정상적으로 접수되었습니다. 빠른 시일 내에 답변드리겠습니다.'
        : '문의가 정상적으로 접수되었습니다. 빠른 시일 내에 답변드리겠습니다.',
    );
    resetForm();
  };

  return (
    <div className="w-screen min-h-screen bg-gray-50 text-gray-800 font-sans overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 pb-16">
        {/* 페이지 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <HelpCircle className="text-blue-500" size={26} /> 문의하기
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            서비스 이용 중 궁금한 점이나 요청 사항을 남겨주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          {/* 문의 카테고리 선택 */}
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              문의 카테고리 <span className="text-red-500">*</span>
            </h2>
            <div ref={categoryRef} className="relative">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isCategoryOpen}
                onClick={() => setIsCategoryOpen((prev) => !prev)}
                className={`w-full flex justify-between items-center px-4 py-3 rounded-lg border cursor-pointer transition-colors ${isCategoryOpen
                    ? 'border-blue-500 ring-2 ring-blue-500 bg-white'
                    : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'
                  }`}
              >
                <span
                  className={`flex items-center gap-2 text-sm ${selectedCategory ? 'text-gray-800 font-medium' : 'text-gray-400'
                    }`}
                >
                  {selectedCategory ? (
                    <>
                      <span className="text-blue-500">{selectedCategory.icon}</span>
                      {selectedCategory.name}
                    </>
                  ) : (
                    '문의 카테고리를 선택해주세요'
                  )}
                </span>
                <ChevronDown
                  size={18}
                  className={`text-gray-400 transition-transform ${isCategoryOpen ? 'rotate-180' : ''
                    }`}
                />
              </button>

              {isCategoryOpen && (
                <ul
                  role="listbox"
                  aria-label="문의 카테고리 선택"
                  className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1"
                >
                  {CATEGORIES.map((item) => {
                    const isActive = category === item.name;
                    return (
                      <li key={item.name} role="option" aria-selected={isActive}>
                        <button
                          type="button"
                          onClick={() => {
                            setCategory(item.name);
                            setIsCategoryOpen(false);
                          }}
                          className={`w-full flex justify-between items-center px-4 py-3 text-sm cursor-pointer transition-colors ${isActive
                              ? 'bg-blue-50 text-blue-600 font-bold'
                              : 'text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={isActive ? 'text-blue-500' : 'text-gray-400'}>
                              {item.icon}
                            </span>
                            {item.name}
                          </span>
                          {isActive && <Check size={16} className="text-blue-600" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* 문의자 정보 (읽기 전용) */}
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4">문의자 정보</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="inquiry-name"
                  className="block text-sm font-medium text-gray-600 mb-2"
                >
                  이름
                </label>
                <div className="relative flex items-center">
                  <User className="absolute left-3 text-gray-400" size={18} />
                  <input
                    id="inquiry-name"
                    type="text"
                    value={USER_NAME}
                    readOnly
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-default focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="inquiry-email"
                  className="block text-sm font-medium text-gray-600 mb-2"
                >
                  이메일
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3 text-gray-400" size={18} />
                  <input
                    id="inquiry-email"
                    type="email"
                    value={USER_EMAIL}
                    readOnly
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-default focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 문의 내용 작성 */}
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col gap-5">
            <div>
              <label
                htmlFor="inquiry-subject"
                className="block text-sm font-medium text-gray-600 mb-2"
              >
                문의 제목 <span className="text-red-500">*</span>
              </label>
              <input
                id="inquiry-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="문의 제목을 입력해주세요"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="inquiry-content"
                className="block text-sm font-medium text-gray-600 mb-2"
              >
                문의 내용 <span className="text-red-500">*</span>
              </label>
              <textarea
                id="inquiry-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="문의 내용을 상세히 작성해주세요. 문제 상황, 요청 사항, 세부 설명 등을 입력할 수 있습니다."
                className="w-full min-h-[180px] px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 첨부 파일 */}
            <div>
              <label
                htmlFor="inquiry-files"
                className="block text-sm font-medium text-gray-600 mb-2"
              >
                첨부 파일
              </label>
              <label
                htmlFor="inquiry-files"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium cursor-pointer hover:bg-blue-100 transition-colors"
              >
                <Paperclip size={18} />
                <span>파일 선택 (여러 개 가능)</span>
              </label>
              <input
                id="inquiry-files"
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              {files.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex justify-between items-center px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl"
                    >
                      <span className="text-sm text-gray-700 truncate flex items-center gap-2">
                        <Paperclip size={14} className="text-gray-400 shrink-0" />
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleFileRemove(index)}
                        aria-label={`${file.name} 삭제`}
                        className="p-1.5 text-gray-500 hover:bg-gray-200 hover:text-red-500 rounded-full transition-colors cursor-pointer shrink-0"
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 공개 / 비공개 옵션 */}
            <div className="pt-1">
              <p className="block text-sm font-medium text-gray-600 mb-2">공개 설정</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsPrivate(false)}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    !isPrivate
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
                      : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <Eye
                    size={18}
                    className={`mt-0.5 shrink-0 ${!isPrivate ? 'text-blue-600' : 'text-gray-400'}`}
                  />
                  <span>
                    <span className={`block text-sm font-bold ${!isPrivate ? 'text-blue-700' : 'text-gray-700'}`}>
                      공개
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      다른 사용자에게 문의 내용이 공개됩니다.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrivate(true)}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    isPrivate
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
                      : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <Lock
                    size={18}
                    className={`mt-0.5 shrink-0 ${isPrivate ? 'text-blue-600' : 'text-gray-400'}`}
                  />
                  <span>
                    <span className={`block text-sm font-bold ${isPrivate ? 'text-blue-700' : 'text-gray-700'}`}>
                      비공개
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      본인과 관리자만 확인할 수 있습니다.
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* 안내 메시지 */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl"
            >
              <AlertCircle className="text-red-500 shrink-0" size={20} />
              <span className="font-bold text-red-700 text-sm">{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div
              role="status"
              className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl"
            >
              <CheckCircle className="text-blue-500 shrink-0" size={20} />
              <span className="font-bold text-blue-700 text-sm">{successMessage}</span>
            </div>
          )}

          {/* 제출 버튼 */}
          <button
            type="submit"
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Send size={18} /> 문의 접수
          </button>
        </form>
      </div>
    </div>
  );
};
