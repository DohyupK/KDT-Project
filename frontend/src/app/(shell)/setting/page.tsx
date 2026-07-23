'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import dayjs from 'dayjs'
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
  Phone,
  RotateCcw,
  Save,
  Settings,
  Sun,
  Moon,
  Type,
  Languages,
  RefreshCw,
  User,
  UserX,
} from 'lucide-react'
import { authApi } from '@/api/authApi'
import { settingsApi } from '@/api/settingsApi'
import {
  clearAuthSession,
  isLoggedIn,
  updateAuthUser,
} from '@/lib/authStorage'
import {
  applyGlobalFontSize,
  applyGlobalThemeMode,
  DEFAULT_FONT_SIZE,
  DEFAULT_LANGUAGE,
  DEFAULT_REFRESH_INTERVAL,
  DEFAULT_THEME_MODE,
  FONT_SIZE_OPTIONS,
  getDefaultSettingsState,
  REFRESH_INTERVAL_OPTIONS,
  type FontSize,
  type Language,
  type RefreshInterval,
  type ThemeMode,
} from '@/lib/userSettings'
import type { AuthUser } from '@/types'

const PHONE_REGEX = /^01[016789]-?\d{3,4}-?\d{4}$/
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/

function getApiErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined
    if (data?.message) return data.message
  }
  return fallback
}

function isValidPhone(phone: string) {
  return PHONE_REGEX.test(phone.replace(/\s/g, ''))
}

function isValidPassword(password: string) {
  return PASSWORD_REGEX.test(password)
}

export default function SettingPage() {
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [profile, setProfile] = useState<AuthUser | null>(null)
  const [phone, setPhone] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [withdrawPassword, setWithdrawPassword] = useState('')
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)

  const [fontSize, setFontSize] = useState<FontSize>(DEFAULT_FONT_SIZE)
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_THEME_MODE)
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE)
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(DEFAULT_REFRESH_INTERVAL)

  const [saveMessage, setSaveMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [accountMessage, setAccountMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isUpdatingAccount, setIsUpdatingAccount] = useState(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  useEffect(() => {
    applyGlobalThemeMode(themeMode)
  }, [themeMode])

  useEffect(() => {
    const loadPageData = async () => {
      setIsLoading(true)
      setErrorMessage('')

      if (!isLoggedIn()) {
        setLoggedIn(false)
        setIsLoading(false)
        applyGlobalFontSize(DEFAULT_FONT_SIZE)
        applyGlobalThemeMode(DEFAULT_THEME_MODE)
        return
      }

      setLoggedIn(true)

      try {
        const [profileRes, settingsRes] = await Promise.all([
          authApi.getProfile(),
          settingsApi.getSettings(),
        ])

        const user = profileRes.data.user
        setProfile(user)
        setPhone(user.phone)

        const settings = settingsRes.data.settings
        if (FONT_SIZE_OPTIONS.includes(settings.fontSize as FontSize)) {
          setFontSize(settings.fontSize as FontSize)
          applyGlobalFontSize(settings.fontSize as FontSize)
        }
        if (settings.themeMode === 0 || settings.themeMode === 1) {
          setThemeMode(settings.themeMode)
        }
        if (settings.language === 'ko' || settings.language === 'en') {
          setLanguage(settings.language)
        }
        if (REFRESH_INTERVAL_OPTIONS.some((opt) => opt.value === settings.refreshInterval)) {
          setRefreshInterval(settings.refreshInterval as RefreshInterval)
        }
      } catch (err) {
        setErrorMessage(getApiErrorMessage(err, '설정 정보를 불러오지 못했습니다.'))
        const defaults = getDefaultSettingsState()
        setFontSize(defaults.fontSize)
        setThemeMode(defaults.themeMode)
        setLanguage(defaults.language)
        setRefreshInterval(defaults.refreshInterval)
        applyGlobalFontSize(defaults.fontSize)
        applyGlobalThemeMode(defaults.themeMode)
      } finally {
        setIsLoading(false)
      }
    }

    loadPageData()
  }, [])

  const passwordsMatch =
    newPasswordConfirm.length > 0 && newPassword === newPasswordConfirm
  const passwordsMismatch =
    newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm

  const handleSaveSettings = async () => {
    setIsSaving(true)
    setSaveMessage('')
    setErrorMessage('')

    try {
      const { data } = await settingsApi.saveSettings({
        fontSize,
        themeMode,
        language,
        refreshInterval,
      })

      applyGlobalFontSize(fontSize)
      applyGlobalThemeMode(themeMode)

      const updatedAt = data.settings.updateAt
        ? dayjs(data.settings.updateAt).format('YYYY-MM-DD HH:mm:ss')
        : dayjs().format('YYYY-MM-DD HH:mm:ss')

      setSaveMessage(data.message ?? `설정이 저장되었습니다. (${updatedAt})`)
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, '설정 저장에 실패했습니다.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetSettings = async () => {
    const defaults = getDefaultSettingsState()
    setFontSize(defaults.fontSize)
    setThemeMode(defaults.themeMode)
    setLanguage(defaults.language)
    setRefreshInterval(defaults.refreshInterval)
    setSaveMessage('')
    setErrorMessage('')

    applyGlobalFontSize(defaults.fontSize)
    applyGlobalThemeMode(defaults.themeMode)

    if (!loggedIn) return

    setIsSaving(true)
    try {
      await settingsApi.saveSettings(defaults)
      setSaveMessage('설정이 초기화되었습니다.')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, '설정 초기화에 실패했습니다.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateAccount = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAccountMessage('')
    setErrorMessage('')

    const wantsPhoneUpdate = phone.trim() !== (profile?.phone ?? '')
    const wantsPasswordUpdate = newPassword.length > 0 || currentPassword.length > 0

    if (!wantsPhoneUpdate && !wantsPasswordUpdate) {
      setAccountMessage('변경할 항목을 입력해주세요.')
      return
    }

    if (wantsPhoneUpdate && !isValidPhone(phone)) {
      setErrorMessage('연락처 형식이 올바르지 않습니다.')
      return
    }

    if (wantsPasswordUpdate) {
      if (!currentPassword) {
        setErrorMessage('현재 비밀번호를 입력해주세요.')
        return
      }
      if (!isValidPassword(newPassword)) {
        setErrorMessage('새 비밀번호는 8자 이상, 대·소문자, 숫자, 특수문자를 포함해야 합니다.')
        return
      }
      if (newPassword !== newPasswordConfirm) {
        setErrorMessage('새 비밀번호가 일치하지 않습니다.')
        return
      }
    }

    setIsUpdatingAccount(true)
    try {
      const payload: { phone?: string; password?: string; currentPassword?: string } = {}
      if (wantsPhoneUpdate) payload.phone = phone.trim()
      if (wantsPasswordUpdate) {
        payload.password = newPassword
        payload.currentPassword = currentPassword
      }

      const { data } = await authApi.updateProfile(payload)
      setProfile(data.user)
      updateAuthUser(data.user)
      setPhone(data.user.phone)
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordConfirm('')
      setAccountMessage(data.message)
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, '계정 정보 수정에 실패했습니다.'))
    } finally {
      setIsUpdatingAccount(false)
    }
  }

  const handleWithdrawAccount = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrorMessage('')

    if (!withdrawPassword.trim()) {
      setErrorMessage('탈퇴 확인을 위해 비밀번호를 입력해주세요.')
      return
    }

    setIsWithdrawing(true)
    try {
      await authApi.withdrawAccount(withdrawPassword)
      clearAuthSession()
      setShowWithdrawModal(false)
      router.push('/login')
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, '회원탈퇴에 실패했습니다.'))
    } finally {
      setIsWithdrawing(false)
    }
  }

  const isDarkMode = themeMode === 0
  const previewFontSize = `${fontSize}px`
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-gray-800'
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-gray-500'
  const textMuted = isDarkMode ? 'text-slate-400' : 'text-gray-400'
  const cardClass = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
  const inputClass = isDarkMode
    ? 'border-slate-600 bg-slate-700 text-slate-100 focus:ring-blue-500'
    : 'border-gray-300 bg-gray-50 text-gray-800 focus:ring-blue-500'

  if (isLoading) {
    return (
      <div className={`h-full w-full flex items-center justify-center ${textPrimary}`}>
        <p className="text-sm text-gray-500">설정 정보를 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div
      className={`h-full w-full overflow-y-auto p-4 md:p-6 font-sans ${textPrimary} ${
        isDarkMode ? 'bg-slate-900' : 'bg-transparent'
      }`}
    >
      <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
        <header>
          <div className="flex items-center gap-3 mb-1">
            <Settings size={28} className="text-blue-500" />
            <h1 className={`text-2xl font-bold ${textPrimary}`}>설정</h1>
          </div>
          <p className={`text-sm ml-10 ${textSecondary}`}>
            계정 정보 및 시스템 환경을 사용자에 맞게 조정합니다.
          </p>
        </header>

        {!loggedIn && (
          <div
            role="alert"
            className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl"
          >
            <AlertCircle className="text-amber-500 shrink-0" size={20} />
            <span className="text-sm text-amber-800">
              로그인 후 계정 정보 및 설정을 저장할 수 있습니다.{' '}
              <Link href="/login" className="font-bold text-blue-600 hover:underline">
                로그인하기
              </Link>
            </span>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl"
          >
            <AlertCircle className="text-red-500 shrink-0" size={20} />
            <span className="font-bold text-red-700 text-sm">{errorMessage}</span>
          </div>
        )}

        {loggedIn && profile && (
          <section className={`p-6 rounded-2xl shadow-sm border ${cardClass}`}>
            <div className="mb-4 flex items-center gap-2">
              <User size={20} className="text-blue-500" />
              <h2 className={`text-lg font-bold ${textPrimary}`}>계정 정보</h2>
            </div>
            <p className={`mb-6 text-sm ${textSecondary}`}>
              성명과 아이디는 변경할 수 없으며, 연락처와 비밀번호만 수정할 수 있습니다.
            </p>

            <form onSubmit={handleUpdateAccount} noValidate className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${textSecondary}`}>성명</label>
                  <input
                    type="text"
                    value={profile.name}
                    readOnly
                    className={`w-full px-4 py-2 border rounded-lg cursor-default ${inputClass} opacity-70`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${textSecondary}`}>아이디</label>
                  <input
                    type="text"
                    value={profile.userId}
                    readOnly
                    className={`w-full px-4 py-2 border rounded-lg cursor-default ${inputClass} opacity-70`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="setting-phone" className={`block text-sm font-medium mb-2 ${textSecondary}`}>
                  연락처
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    id="setting-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      setAccountMessage('')
                    }}
                    placeholder="010-1234-5678"
                    className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${inputClass}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="setting-current-pw" className={`block text-sm font-medium mb-2 ${textSecondary}`}>
                    현재 비밀번호
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      id="setting-current-pw"
                      type={showCurrentPw ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className={`w-full pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 ${inputClass}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showCurrentPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="setting-new-pw" className={`block text-sm font-medium mb-2 ${textSecondary}`}>
                    새 비밀번호
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      id="setting-new-pw"
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="변경 시에만 입력"
                      className={`w-full pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 ${inputClass}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showNewPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="setting-new-pw2" className={`block text-sm font-medium mb-2 ${textSecondary}`}>
                  새 비밀번호 확인
                </label>
                <input
                  id="setting-new-pw2"
                  type="password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  placeholder="새 비밀번호 재입력"
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${inputClass}`}
                />
                {passwordsMatch && (
                  <p className="mt-2 text-sm font-medium text-blue-600 inline-flex items-center gap-1">
                    <CheckCircle size={14} /> 비밀번호가 동일합니다.
                  </p>
                )}
                {passwordsMismatch && (
                  <p className="mt-2 text-sm font-medium text-red-600 inline-flex items-center gap-1">
                    <AlertCircle size={14} /> 비밀번호가 일치하지 않습니다.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isUpdatingAccount}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-60"
                >
                  <Save size={16} />
                  {isUpdatingAccount ? '저장 중...' : '계정 정보 저장'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 border-2 border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 transition"
                >
                  <UserX size={16} />
                  회원탈퇴
                </button>
              </div>

              {accountMessage && (
                <p className="text-sm font-medium text-green-500">{accountMessage}</p>
              )}
            </form>
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full">
          <section className={`p-6 rounded-2xl shadow-sm border ${cardClass}`}>
            <div className="mb-4 flex items-center gap-2">
              <Type size={20} className="text-blue-500" />
              <h2 className={`text-lg font-bold ${textPrimary}`}>폰트 크기</h2>
            </div>
            <p className={`mb-6 text-sm ${textSecondary}`}>
              슬라이더로 크기를 확인한 뒤, 설정 저장 시 페이지 전체에 적용됩니다.
            </p>
            <div className="flex items-center gap-4">
              <span className={`shrink-0 font-bold leading-none select-none ${textPrimary}`} style={{ fontSize: '14px' }} aria-hidden>A</span>
              <input
                type="range"
                min={0}
                max={FONT_SIZE_OPTIONS.length - 1}
                step={1}
                value={FONT_SIZE_OPTIONS.indexOf(fontSize)}
                onChange={(e) => {
                  setFontSize(FONT_SIZE_OPTIONS[Number(e.target.value)])
                  setSaveMessage('')
                }}
                disabled={!loggedIn}
                aria-label="폰트 크기"
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-gray-300 accent-blue-600 disabled:opacity-50"
              />
              <span className={`shrink-0 font-bold leading-none select-none ${textPrimary}`} style={{ fontSize: '24px' }} aria-hidden>A</span>
            </div>
            <div className={`mt-4 p-4 rounded-xl border ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
              <p className={`text-xs mb-2 ${textMuted}`}>미리보기</p>
              <p className={textPrimary} style={{ fontSize: previewFontSize, lineHeight: '24px' }}>
                양극재 품질 AI 예측 시스템의 텍스트 크기 미리보기입니다.
              </p>
            </div>
          </section>

          <section className={`p-6 rounded-2xl shadow-sm border ${cardClass}`}>
            <div className="mb-4 flex items-center gap-2">
              <Sun size={20} className="text-yellow-500" />
              <h2 className={`text-lg font-bold ${textPrimary}`}>테마 설정</h2>
            </div>
            <p className={`mb-6 text-sm ${textSecondary}`}>원하는 테마 모드를 선택합니다.</p>
            <div className="flex gap-4">
              {([
                { mode: 1 as ThemeMode, label: '라이트 모드', icon: Sun },
                { mode: 0 as ThemeMode, label: '다크 모드', icon: Moon },
              ]).map(({ mode, label, icon: Icon }) => (
                <button
                  key={mode}
                  type="button"
                  disabled={!loggedIn}
                  onClick={() => { setThemeMode(mode); setSaveMessage('') }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 py-3 font-bold transition disabled:opacity-50 ${
                    themeMode === mode
                      ? mode === 1
                        ? isDarkMode ? 'border-blue-400 bg-blue-900/40 text-blue-300' : 'border-blue-600 bg-blue-50 text-blue-600'
                        : 'border-blue-400 bg-blue-600 text-white'
                      : isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full">
          <section className={`p-6 rounded-2xl shadow-sm border ${cardClass}`}>
            <div className="mb-4 flex items-center gap-2">
              <Languages size={20} className="text-green-500" />
              <h2 className={`text-lg font-bold ${textPrimary}`}>언어 설정</h2>
            </div>
            <div className="flex gap-4">
              {(['ko', 'en'] as Language[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  disabled={!loggedIn}
                  onClick={() => { setLanguage(lang); setSaveMessage('') }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 py-3 font-bold transition disabled:opacity-50 ${
                    language === lang
                      ? isDarkMode ? 'border-green-400 bg-green-900/30 text-green-300' : 'border-green-600 bg-green-50 text-green-700'
                      : isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {lang === 'ko' ? '한국어' : 'English'}
                </button>
              ))}
            </div>
          </section>

          <section className={`p-6 rounded-2xl shadow-sm border ${cardClass}`}>
            <div className="mb-4 flex items-center gap-2">
              <RefreshCw size={20} className="text-purple-500" />
              <h2 className={`text-lg font-bold ${textPrimary}`}>자동 새로고침 주기</h2>
            </div>
            <select
              value={refreshInterval}
              disabled={!loggedIn}
              onChange={(e) => {
                setRefreshInterval(Number(e.target.value) as RefreshInterval)
                setSaveMessage('')
              }}
              className={`w-full py-3 px-4 rounded-xl border-2 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 ${inputClass}`}
            >
              {REFRESH_INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </section>
        </div>

        <div className="flex flex-col items-end gap-2 mt-2">
          <p className={`text-xs ${textMuted}`}>* 설정 저장은 로그인 후 서버에 저장됩니다.</p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleResetSettings}
              disabled={!loggedIn || isSaving}
              className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 font-bold transition disabled:opacity-50 ${
                isDarkMode ? 'border-slate-500 text-slate-200 hover:bg-slate-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <RotateCcw size={18} />
              초기화
            </button>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={!loggedIn || isSaving}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 font-bold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={18} />
              {isSaving ? '저장 중...' : '설정 저장'}
            </button>
          </div>
          {saveMessage && <p className="text-sm font-medium text-green-500">{saveMessage}</p>}
        </div>
      </div>

      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowWithdrawModal(false)} role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-2">회원탈퇴</h3>
            <p className="text-sm text-gray-500 mb-4">탈퇴 시 계정 정보가 삭제됩니다. 비밀번호를 입력해주세요.</p>
            <form onSubmit={handleWithdrawAccount} className="flex flex-col gap-4">
              <input
                type="password"
                value={withdrawPassword}
                onChange={(e) => setWithdrawPassword(e.target.value)}
                placeholder="비밀번호"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowWithdrawModal(false)} className="flex-1 py-2.5 border-2 border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-50">
                  취소
                </button>
                <button type="submit" disabled={isWithdrawing} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-60">
                  {isWithdrawing ? '처리 중...' : '탈퇴하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
