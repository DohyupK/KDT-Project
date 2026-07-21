import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import {
  Search,
  Bell,
  User,
  BookText,
  Home,
  LayoutDashboard,
  AlertCircle,
  BookOpen,
  HelpCircle,
  Briefcase,
  Settings,
  RotateCcw,
  Save,
  Sun,
  Moon,
  Type,
  Languages,
  RefreshCw,
} from 'lucide-react';

/* ==========================================
   SettingPage01 ~ 04 + 추가 설정 상수
   ========================================== */

const FONT_SIZE_OPTIONS = [10, 12, 14, 16, 18, 20, 22, 24] as const;
const DEFAULT_FONT_SIZE = 18;

const LEGACY_FONT_SCALE_MAP: Record<number, (typeof FONT_SIZE_OPTIONS)[number]> = {
  80: 12,
  90: 14,
  100: 16,
  110: 18,
  120: 20,
};
const DEFAULT_THEME_MODE = 1;
const DEFAULT_LANGUAGE = 'ko' as const;
const DEFAULT_REFRESH_INTERVAL = 1;

const SETTINGS_STORAGE_KEY = 'kdt-user-settings';
const DEFAULT_USER_ID = 'guest';
const FONT_SCALE_STYLE_ID = 'kdt-font-scale-style';

const REFRESH_INTERVAL_OPTIONS = [
  { label: '1분', value: 1 },
  { label: '5분', value: 5 },
  { label: '10분', value: 10 },
  { label: '30분', value: 30 },
] as const;

type FontSize = (typeof FONT_SIZE_OPTIONS)[number];
type ThemeMode = 0 | 1;
type Language = 'ko' | 'en';
type RefreshInterval = (typeof REFRESH_INTERVAL_OPTIONS)[number]['value'];

interface UserSettings {
  UserId: string;
  FontSize: FontSize;
  ThemeMode: ThemeMode;
  Language: Language;
  RefreshInterval: RefreshInterval;
  UpdateAt: string;
}

type SavedSettings = UserSettings & { FontScale?: number };

/* ==========================================
   전역(GLOBAL) 스타일 적용
   ========================================== */

const applyGlobalFontSize = (fontSize: FontSize) => {
  const scale = fontSize / DEFAULT_FONT_SIZE;

  document.documentElement.style.fontSize = '16px';
  document.documentElement.style.setProperty('--font-scale', String(scale));

  let styleEl = document.getElementById(FONT_SCALE_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = FONT_SCALE_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
    html { font-size: 16px !important; }
    body { font-size: 16px !important; line-height: 1.5 !important; }
    .text-xs   { font-size: calc(0.75rem  * var(--font-scale, 1)) !important; line-height: 1rem    !important; }
    .text-sm   { font-size: calc(0.875rem * var(--font-scale, 1)) !important; line-height: 1.25rem !important; }
    .text-base { font-size: calc(1rem     * var(--font-scale, 1)) !important; line-height: 1.5rem  !important; }
    .text-lg   { font-size: calc(1.125rem * var(--font-scale, 1)) !important; line-height: 1.75rem !important; }
    .text-xl   { font-size: calc(1.25rem  * var(--font-scale, 1)) !important; line-height: 1.75rem !important; }
    .text-2xl  { font-size: calc(1.5rem   * var(--font-scale, 1)) !important; line-height: 2rem    !important; }
    .text-3xl  { font-size: calc(1.875rem * var(--font-scale, 1)) !important; line-height: 2.25rem !important; }
    [data-sidebar] .sidebar-title  { font-size: calc(1.25rem  * var(--font-scale, 1)) !important; line-height: 1.75rem !important; }
    [data-sidebar] .sidebar-menu   { font-size: calc(1rem     * var(--font-scale, 1)) !important; line-height: 1.5rem  !important; }
    [data-sidebar] .sidebar-status { font-size: calc(0.875rem * var(--font-scale, 1)) !important; line-height: 1.25rem !important; }
  `;
};

const parseSavedFontSize = (saved: SavedSettings): FontSize | null => {
  if (FONT_SIZE_OPTIONS.includes(saved.FontSize)) return saved.FontSize;
  if (saved.FontScale !== undefined && LEGACY_FONT_SCALE_MAP[saved.FontScale]) {
    return LEGACY_FONT_SCALE_MAP[saved.FontScale];
  }
  return null;
};

const applyGlobalThemeMode = (themeMode: ThemeMode) => {
  const isDark = themeMode === 0;

  document.documentElement.setAttribute('data-theme-mode', String(themeMode));
  document.documentElement.style.backgroundColor = isDark ? '#0f172a' : '';
  document.documentElement.style.color = isDark ? '#f8fafc' : '';
  document.body.style.backgroundColor = isDark ? '#0f172a' : '';
  document.body.style.color = isDark ? '#f8fafc' : '';
};

const loadSavedSettings = (): SavedSettings | null => {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SavedSettings;
  } catch {
    return null;
  }
};

const SIDEBAR_MENUS = [
  { name: 'Main', icon: Home, active: false },
  { name: 'Dashboard', icon: LayoutDashboard, active: false },
  { name: 'Issue', icon: AlertCircle, active: false },
  { name: 'Knowledge', icon: BookOpen, active: false },
  { name: 'Inquiry', icon: HelpCircle, active: false },
  { name: 'Management', icon: Briefcase, active: false },
  { name: 'Setting', icon: Settings, active: true },
];

export const SettingPage = () => {
  const [fontSize, setFontSize] = useState<FontSize>(DEFAULT_FONT_SIZE);
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(DEFAULT_REFRESH_INTERVAL);
  const [saveMessage, setSaveMessage] = useState<string>('');

  useEffect(() => {
    const saved = loadSavedSettings();
    if (!saved) {
      applyGlobalFontSize(DEFAULT_FONT_SIZE);
      return;
    }

    const savedFontSize = parseSavedFontSize(saved);
    if (savedFontSize) {
      setFontSize(savedFontSize);
      applyGlobalFontSize(savedFontSize);
    } else {
      applyGlobalFontSize(DEFAULT_FONT_SIZE);
    }
    if (saved.ThemeMode === 0 || saved.ThemeMode === 1) setThemeMode(saved.ThemeMode);
    if (saved.Language === 'ko' || saved.Language === 'en') setLanguage(saved.Language);
    if (REFRESH_INTERVAL_OPTIONS.some((opt) => opt.value === saved.RefreshInterval)) {
      setRefreshInterval(saved.RefreshInterval);
    }
  }, []);

  useEffect(() => { applyGlobalThemeMode(themeMode); }, [themeMode]);

  const handleThemeModeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    setSaveMessage('');
  };

  const handleSaveSettings = () => {
    const settings: UserSettings = {
      UserId: DEFAULT_USER_ID,
      FontSize: fontSize,
      ThemeMode: themeMode,
      Language: language,
      RefreshInterval: refreshInterval,
      UpdateAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    };

    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    applyGlobalFontSize(fontSize);
    setSaveMessage(`설정이 저장되었습니다. (${settings.UpdateAt})`);
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleResetSettings = () => {
    setFontSize(DEFAULT_FONT_SIZE);
    setThemeMode(DEFAULT_THEME_MODE);
    setLanguage(DEFAULT_LANGUAGE);
    setRefreshInterval(DEFAULT_REFRESH_INTERVAL);
    setSaveMessage('');
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    applyGlobalFontSize(DEFAULT_FONT_SIZE);
    applyGlobalThemeMode(DEFAULT_THEME_MODE);
  };

  const isDarkMode = themeMode === 0;
  const currentDateTime = dayjs().format('YYYY-MM-DD HH:mm');
  const previewFontSize = `${fontSize}px`;

  // 다크모드 공통 텍스트 색상 헬퍼
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-gray-800';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-gray-500';
  const textMuted = isDarkMode ? 'text-slate-400' : 'text-gray-400';
  const cardClass = isDarkMode
    ? 'bg-slate-800 border-slate-700'
    : 'bg-white border-gray-200';

  return (
    <div className={`min-h-screen w-full flex flex-col lg:flex-row font-sans ${textPrimary}`}>

      {/* Sidebar */}
      <div data-sidebar className="w-full lg:w-[18%] lg:shrink-0 bg-slate-900 text-white flex flex-col p-4 lg:p-6">
        <div className="sidebar-title mb-10 font-bold leading-tight text-blue-400">
          양극재 품질 AI<br />예측 시스템
        </div>
        <ul className="flex flex-col gap-2 flex-1">
          {SIDEBAR_MENUS.map((menu) => {
            const Icon = menu.icon;
            return (
              <li
                key={menu.name}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  menu.active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon size={20} />
                <span className="sidebar-menu font-medium">{menu.name}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto flex items-center gap-2 p-3 bg-slate-800 rounded-lg">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
          <span className="sidebar-status font-medium text-slate-300">시스템 운영 정상</span>
        </div>
      </div>

      {/* Content */}
      <div className={`w-full lg:w-[82%] lg:min-w-0 flex flex-col ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>

        {/* Header */}
        <div className={`w-full border-b flex flex-col md:flex-row md:justify-between md:items-center gap-4 px-4 md:px-8 py-4 shrink-0 ${
          isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <div className="w-full md:w-[40%] relative flex items-center">
            <Search className={`absolute left-3 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`} size={20} />
            <input
              type="text"
              placeholder="LOT ID 또는 조건을 검색하세요..."
              className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDarkMode
                  ? 'border-slate-600 bg-slate-700 text-slate-100 placeholder-slate-400'
                  : 'border-gray-300 bg-gray-50 text-gray-800 placeholder-gray-400'
              }`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 md:gap-6">
            <button className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isDarkMode
                ? 'bg-blue-900/40 text-blue-300 hover:bg-blue-900/60'
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
            }`}>
              <BookText size={18} />
              <span className="hidden sm:inline">사이트 메뉴얼</span>
            </button>
            <button className={`relative p-2 rounded-full transition-colors ${
              isDarkMode
                ? 'text-slate-300 hover:bg-slate-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}>
              <Bell size={24} />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
            </button>
            <div className={`hidden sm:block font-medium whitespace-nowrap ${isDarkMode ? 'text-slate-200' : 'text-gray-600'}`}>
              {currentDateTime}
            </div>
            <button className={`p-2 rounded-full transition-colors ${
              isDarkMode
                ? 'text-slate-300 bg-slate-700 hover:bg-slate-600'
                : 'text-gray-600 bg-gray-200 hover:bg-gray-100'
            }`}>
              <User size={24} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 w-full p-4 md:p-6 overflow-y-auto">
          <div className="flex flex-col gap-6 w-full">

            <header>
              <div className="flex items-center gap-3 mb-1">
                <Settings size={28} className="text-blue-500" />
                <h1 className={`text-2xl font-bold ${textPrimary}`}>설정</h1>
              </div>
              <p className={`text-sm ml-10 ${textSecondary}`}>
                시스템 환경을 사용자에 맞게 조정합니다.
              </p>
            </header>

            {/* 1행: 폰트 크기 + 테마 설정 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full">

              {/* 폰트 크기 */}
              <section className={`p-6 rounded-2xl shadow-sm border ${cardClass}`}>
                <div className="mb-4 flex items-center gap-2">
                  <Type size={20} className="text-blue-500" />
                  <h2 className={`text-lg font-bold ${textPrimary}`}>폰트 크기</h2>
                </div>
                <p className={`mb-6 text-sm ${textSecondary}`}>
                  슬라이더로 크기를 확인한 뒤, 설정 저장 시 페이지 전체에 적용됩니다.
                </p>
                <div className="flex items-center gap-4">
                  <span
                    className={`shrink-0 font-bold leading-none select-none ${textPrimary}`}
                    style={{ fontSize: '14px' }}
                    aria-hidden
                  >
                    A
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={FONT_SIZE_OPTIONS.length - 1}
                    step={1}
                    value={FONT_SIZE_OPTIONS.indexOf(fontSize)}
                    onChange={(e) => {
                      setFontSize(FONT_SIZE_OPTIONS[Number(e.target.value)]);
                      setSaveMessage('');
                    }}
                    aria-label="폰트 크기"
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-gray-300 accent-blue-600"
                  />
                  <span
                    className={`shrink-0 font-bold leading-none select-none ${textPrimary}`}
                    style={{ fontSize: '24px' }}
                    aria-hidden
                  >
                    A
                  </span>
                </div>
                <div className={`mt-4 p-4 rounded-xl border ${
                  isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'
                }`}>
                  <p className={`text-xs mb-2 ${textMuted}`}>미리보기</p>
                  <p className={textPrimary} style={{ fontSize: previewFontSize, lineHeight: '24px' }}>
                    양극재 품질 AI 예측 시스템의 텍스트 크기 미리보기입니다.
                  </p>
                </div>
              </section>

              {/* 테마 설정 */}
              <section className={`p-6 rounded-2xl shadow-sm border ${cardClass}`}>
                <div className="mb-4 flex items-center gap-2">
                  <Sun size={20} className="text-yellow-500" />
                  <h2 className={`text-lg font-bold ${textPrimary}`}>테마 설정</h2>
                </div>
                <p className={`mb-6 text-sm ${textSecondary}`}>
                  원하는 테마 모드를 선택합니다.
                </p>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => handleThemeModeChange(1)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 py-3 font-bold transition ${
                      themeMode === 1
                        ? isDarkMode
                          ? 'border-blue-400 bg-blue-900/40 text-blue-300'
                          : 'border-blue-600 bg-blue-50 text-blue-600'
                        : isDarkMode
                          ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Sun size={18} />
                    라이트 모드
                  </button>
                  <button
                    type="button"
                    onClick={() => handleThemeModeChange(0)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 py-3 font-bold transition ${
                      themeMode === 0
                        ? 'border-blue-400 bg-blue-600 text-white'
                        : isDarkMode
                          ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Moon size={18} />
                    다크 모드
                  </button>
                </div>
              </section>
            </div>

            {/* 2행: 언어 설정 + 자동 새로고침 (추가 기능) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full">

              {/* 언어 설정 */}
              <section className={`p-6 rounded-2xl shadow-sm border ${cardClass}`}>
                <div className="mb-4 flex items-center gap-2">
                  <Languages size={20} className="text-green-500" />
                  <h2 className={`text-lg font-bold ${textPrimary}`}>언어 설정</h2>
                </div>
                <p className={`mb-6 text-sm ${textSecondary}`}>
                  시스템 표시 언어를 선택합니다.
                </p>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => { setLanguage('ko'); setSaveMessage(''); }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 py-3 font-bold transition ${
                      language === 'ko'
                        ? isDarkMode
                          ? 'border-green-400 bg-green-900/30 text-green-300'
                          : 'border-green-600 bg-green-50 text-green-700'
                        : isDarkMode
                          ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    한국어
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLanguage('en'); setSaveMessage(''); }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 py-3 font-bold transition ${
                      language === 'en'
                        ? isDarkMode
                          ? 'border-green-400 bg-green-900/30 text-green-300'
                          : 'border-green-600 bg-green-50 text-green-700'
                        : isDarkMode
                          ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    English
                  </button>
                </div>
                <p className={`mt-4 text-sm ${textSecondary}`}>
                  현재 언어: <strong className="text-green-500">{language === 'ko' ? '한국어' : 'English'}</strong>
                </p>
              </section>

              {/* 자동 새로고침 주기 */}
              <section className={`p-6 rounded-2xl shadow-sm border ${cardClass}`}>
                <div className="mb-4 flex items-center gap-2">
                  <RefreshCw size={20} className="text-purple-500" />
                  <h2 className={`text-lg font-bold ${textPrimary}`}>자동 새로고침 주기</h2>
                </div>
                <p className={`mb-6 text-sm ${textSecondary}`}>
                  대시보드 및 데이터의 자동 새로고침 간격을 설정합니다.
                </p>
                <select
                  value={refreshInterval}
                  onChange={(e) => {
                    setRefreshInterval(Number(e.target.value) as RefreshInterval);
                    setSaveMessage('');
                  }}
                  className={`w-full py-3 px-4 rounded-xl border-2 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                    isDarkMode
                      ? 'border-slate-600 bg-slate-700 text-slate-100'
                      : 'border-gray-200 bg-white text-gray-800'
                  }`}
                >
                  {REFRESH_INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className={`mt-4 text-sm ${textSecondary}`}>
                  현재 주기: <strong className="text-purple-500">{refreshInterval}분</strong>
                </p>
              </section>
            </div>

            {/* 저장 / 초기화 */}
            <div className="flex flex-col items-end gap-2 mt-2">
              <p className={`text-xs ${textMuted}`}>
                * 설정 저장 시 모든 항목이 함께 저장됩니다.
              </p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleResetSettings}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 font-bold transition ${
                    isDarkMode
                      ? 'border-slate-500 text-slate-200 hover:bg-slate-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <RotateCcw size={18} />
                  초기화
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 font-bold text-white shadow-md transition hover:bg-blue-700"
                >
                  <Save size={18} />
                  설정 저장
                </button>
              </div>
              {saveMessage && (
                <p className="text-sm font-medium text-green-500">{saveMessage}</p>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};