'use client'

import { useEffect, useId, useState } from 'react'
import axios from 'axios'
import { AlertCircle, CheckCircle, Eye, EyeOff, Save, X } from 'lucide-react'
import { authApi } from '@/api/authApi'
import { getAuthToken, getAuthUser, isLoggedIn, saveAuthSession } from '@/lib/authStorage'
import { useUiSettings } from '@/components/layout/AppShell'
import type { AuthUser } from '@/types'

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/

function getApiErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; error?: string } | string | undefined
    if (typeof data === 'string' && data.trim()) return data
    if (data && typeof data === 'object') {
      if (data.message) return data.message
      if (data.error) return data.error
    }
  }
  return fallback
}

function PasswordToggle({
  show,
  onToggle,
  isDark,
}: {
  show: boolean
  onToggle: () => void
  isDark: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={isDark ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}
      aria-label={show ? '비밀번호 숨기기' : '비밀번호 표시'}
      tabIndex={0}
    >
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  )
}

type PersonalInfoModalProps = {
  open: boolean
  onClose: () => void
}

export default function PersonalInfoModal({ open, onClose }: PersonalInfoModalProps) {
  const { isDark } = useUiSettings()
  const titleId = useId()

  const [profileUser, setProfileUser] = useState<AuthUser | null>(null)
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [currentPwStatus, setCurrentPwStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [currentPwHint, setCurrentPwHint] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const newPasswordValid = newPassword.length > 0 && PASSWORD_RULE.test(newPassword)
  const newPasswordInvalid = newPassword.length > 0 && !PASSWORD_RULE.test(newPassword)
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword

  useEffect(() => {
    if (!open) return

    let cancelled = false
    ;(async () => {
      if (!isLoggedIn()) {
        setProfileUser(null)
        setError('로그인이 필요합니다.')
        return
      }

      setLoading(true)
      setError('')
      setMessage('')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowCurrentPw(false)
      setShowNewPw(false)
      setShowConfirmPw(false)
      setCurrentPwStatus('idle')
      setCurrentPwHint('')
      try {
        const { data } = await authApi.getProfile()
        if (cancelled) return
        setProfileUser(data.user)
        setProfileEmail(data.user.email ?? '')
        setProfilePhone(data.user.phone ?? '')
      } catch {
        if (cancelled) return
        const fallback = getAuthUser()
        if (fallback) {
          setProfileUser(fallback)
          setProfileEmail(fallback.email ?? '')
          setProfilePhone(fallback.phone ?? '')
          setError('서버 프로필을 불러오지 못해 로컬 정보를 표시합니다.')
        } else {
          setProfileUser(null)
          setError('프로필을 불러오지 못했습니다.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  // 현재 비밀번호 실시간 서버 확인
  useEffect(() => {
    if (!open) return

    if (!currentPassword) {
      setCurrentPwStatus('idle')
      setCurrentPwHint('')
      return
    }

    let cancelled = false
    setCurrentPwStatus('checking')
    setCurrentPwHint('확인 중...')

    const timer = window.setTimeout(async () => {
      try {
        const { data } = await authApi.verifyCurrentPassword(currentPassword)
        if (cancelled) return
        setCurrentPwStatus(data.valid ? 'valid' : 'invalid')
        setCurrentPwHint(data.message)
      } catch (err) {
        if (cancelled) return
        setCurrentPwStatus('invalid')
        setCurrentPwHint(getApiErrorMessage(err, '현재 비밀번호 확인에 실패했습니다.'))
      }
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [currentPassword, open])

  const handleSave = async () => {
    if (!isLoggedIn() || !getAuthUser()) {
      setError('개인정보 수정에는 로그인이 필요합니다.')
      return
    }

    const emailTrimmed = profileEmail.trim()
    const phoneTrimmed = profilePhone.trim()
    const currentPw = currentPassword
    const nextPw = newPassword
    const confirmPw = confirmPassword
    const passwordFieldTouched = Boolean(currentPw || nextPw || confirmPw)

    if (!emailTrimmed) {
      setError('이메일을 입력해주세요.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setError('이메일 형식이 올바르지 않습니다.')
      return
    }

    if (passwordFieldTouched) {
      if (!currentPw) {
        setError('현재 비밀번호를 입력해주세요.')
        setCurrentPwStatus('invalid')
        setCurrentPwHint('현재 비밀번호를 입력해주세요.')
        return
      }
      if (currentPwStatus === 'invalid') {
        setError(currentPwHint || '현재 비밀번호가 올바르지 않습니다.')
        return
      }
      if (currentPwStatus !== 'valid') {
        setError('현재 비밀번호 확인이 완료될 때까지 기다려주세요.')
        return
      }
      if (!nextPw) {
        setError('새 비밀번호를 입력해주세요.')
        return
      }
      if (!PASSWORD_RULE.test(nextPw)) {
        setError('새 비밀번호는 8자 이상, 대·소문자, 숫자, 특수문자(!@#$%^&*)를 포함해야 합니다.')
        return
      }
      if (nextPw !== confirmPw) {
        setError('새 비밀번호가 일치하지 않습니다.')
        return
      }
    }

    const originalEmail = profileUser?.email ?? ''
    const originalPhone = profileUser?.phone ?? ''
    const emailChanged = emailTrimmed !== originalEmail
    const phoneChanged = phoneTrimmed !== originalPhone
    if (!emailChanged && !phoneChanged && !passwordFieldTouched) {
      setError('변경할 항목이 없습니다.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')
    try {
      const { data } = await authApi.updateProfile({
        ...(emailChanged ? { email: emailTrimmed } : {}),
        ...(phoneChanged ? { phone: phoneTrimmed } : {}),
        ...(passwordFieldTouched
          ? { password: nextPw, currentPassword: currentPw }
          : {}),
      })
      const token = getAuthToken()
      if (token) saveAuthSession(token, data.user)
      setProfileUser(data.user)
      setProfileEmail(data.user.email ?? '')
      setProfilePhone(data.user.phone ?? '')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setCurrentPwStatus('idle')
      setCurrentPwHint('')
      setMessage(
        passwordFieldTouched
          ? '비밀번호가 변경되었습니다.'
          : data.message || '정보가 수정되었습니다.',
      )
    } catch (err) {
      const apiMessage = getApiErrorMessage(err, '개인정보 저장에 실패했습니다.')
      setError(apiMessage)
      if (apiMessage.includes('현재 비밀번호')) {
        setCurrentPwStatus('invalid')
        setCurrentPwHint(apiMessage)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const panelClass = isDark
    ? 'border-slate-700 bg-slate-900 text-slate-100'
    : 'border-gray-200 bg-white text-gray-800'
  const labelClass = isDark ? 'text-slate-400' : 'text-gray-500'
  const fieldClass = isDark
    ? 'w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40'
    : 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40'
  const passwordFieldClass = `${fieldClass} pr-10`
  const readonlyClass = isDark
    ? 'w-full rounded-xl border border-slate-600 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-300'
    : 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600'
  const okHintClass = 'mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-600'
  const badHintClass = 'mt-2 inline-flex items-center gap-1 text-sm font-medium text-red-600'
  const checkingHintClass = isDark
    ? 'mt-2 text-sm font-medium text-slate-400'
    : 'mt-2 text-sm font-medium text-gray-500'

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl ${panelClass}`}
      >
        <div
          className={`flex items-center justify-between border-b px-5 py-4 ${
            isDark ? 'border-slate-700' : 'border-gray-100'
          }`}
        >
          <h2 id={titleId} className="text-lg font-bold">
            내 정보
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className={`rounded-lg p-2 transition-colors ${
              isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'
            }`}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className={`text-sm ${labelClass}`}>프로필을 불러오는 중...</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="modal-profile-user-id" className={`mb-1.5 block text-sm font-medium ${labelClass}`}>
                  아이디
                </label>
                <input
                  id="modal-profile-user-id"
                  type="text"
                  readOnly
                  value={profileUser?.userId ?? ''}
                  className={readonlyClass}
                />
              </div>
              <div>
                <label htmlFor="modal-profile-name" className={`mb-1.5 block text-sm font-medium ${labelClass}`}>
                  성명
                </label>
                <input
                  id="modal-profile-name"
                  type="text"
                  readOnly
                  value={profileUser?.name ?? ''}
                  className={readonlyClass}
                />
              </div>
              <div>
                <label htmlFor="modal-profile-email" className={`mb-1.5 block text-sm font-medium ${labelClass}`}>
                  이메일
                </label>
                <input
                  id="modal-profile-email"
                  type="email"
                  autoComplete="email"
                  value={profileEmail}
                  onChange={(e) => {
                    setProfileEmail(e.target.value)
                    setError('')
                    setMessage('')
                  }}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="modal-profile-phone" className={`mb-1.5 block text-sm font-medium ${labelClass}`}>
                  연락처
                </label>
                <input
                  id="modal-profile-phone"
                  type="tel"
                  value={profilePhone}
                  onChange={(e) => {
                    setProfilePhone(e.target.value)
                    setError('')
                    setMessage('')
                  }}
                  placeholder="01012345678"
                  className={fieldClass}
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="modal-profile-current-password"
                  className={`mb-1.5 block text-sm font-medium ${labelClass}`}
                >
                  현재 비밀번호
                </label>
                <div className="relative">
                  <input
                    id="modal-profile-current-password"
                    type={showCurrentPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value)
                      setError('')
                      setMessage('')
                    }}
                    placeholder="비밀번호 변경 시에만"
                    className={passwordFieldClass}
                  />
                  <div className="absolute inset-y-0 right-3 flex items-center">
                    <PasswordToggle
                      show={showCurrentPw}
                      onToggle={() => setShowCurrentPw((v) => !v)}
                      isDark={isDark}
                    />
                  </div>
                </div>
                {currentPwStatus === 'checking' && (
                  <p className={checkingHintClass}>{currentPwHint}</p>
                )}
                {currentPwStatus === 'valid' && (
                  <p className={okHintClass}>
                    <CheckCircle size={14} /> {currentPwHint || '현재 비밀번호가 확인되었습니다.'}
                  </p>
                )}
                {currentPwStatus === 'invalid' && (
                  <p className={badHintClass}>
                    <AlertCircle size={14} /> {currentPwHint || '현재 비밀번호가 올바르지 않습니다.'}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="modal-profile-new-password"
                  className={`mb-1.5 block text-sm font-medium ${labelClass}`}
                >
                  새 비밀번호
                </label>
                <div className="relative">
                  <input
                    id="modal-profile-new-password"
                    type={showNewPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      setError('')
                      setMessage('')
                    }}
                    placeholder="8자 이상, 대·소문자·숫자·특수문자"
                    className={passwordFieldClass}
                  />
                  <div className="absolute inset-y-0 right-3 flex items-center">
                    <PasswordToggle
                      show={showNewPw}
                      onToggle={() => setShowNewPw((v) => !v)}
                      isDark={isDark}
                    />
                  </div>
                </div>
                {newPasswordValid && (
                  <p className={okHintClass}>
                    <CheckCircle size={14} /> 사용 가능한 비밀번호입니다.
                  </p>
                )}
                {newPasswordInvalid && (
                  <p className={badHintClass}>
                    <AlertCircle size={14} /> 비밀번호는 8자 이상, 대·소문자, 숫자, 특수문자를 포함해야
                    합니다.
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="modal-profile-confirm-password"
                  className={`mb-1.5 block text-sm font-medium ${labelClass}`}
                >
                  새 비밀번호 확인
                </label>
                <div className="relative">
                  <input
                    id="modal-profile-confirm-password"
                    type={showConfirmPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      setError('')
                      setMessage('')
                    }}
                    placeholder="새 비밀번호 재입력"
                    className={passwordFieldClass}
                  />
                  <div className="absolute inset-y-0 right-3 flex items-center">
                    <PasswordToggle
                      show={showConfirmPw}
                      onToggle={() => setShowConfirmPw((v) => !v)}
                      isDark={isDark}
                    />
                  </div>
                </div>
                {passwordsMatch && (
                  <p className={okHintClass}>
                    <CheckCircle size={14} /> 비밀번호가 동일합니다.
                  </p>
                )}
                {passwordsMismatch && (
                  <p className={badHintClass}>
                    <AlertCircle size={14} /> 비밀번호가 일치하지 않습니다.
                  </p>
                )}
              </div>

              {(error || message) && (
                <p
                  className={`sm:col-span-2 text-sm font-medium ${
                    error ? 'text-red-500' : isDark ? 'text-emerald-400' : 'text-emerald-600'
                  }`}
                  role="status"
                >
                  {error || message}
                </p>
              )}
            </div>
          )}
        </div>

        <div
          className={`flex justify-end gap-2 border-t px-5 py-4 ${
            isDark ? 'border-slate-700' : 'border-gray-100'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex min-h-10 items-center rounded-xl border px-4 text-sm font-medium ${
              isDark
                ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || !profileUser}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={16} aria-hidden />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
