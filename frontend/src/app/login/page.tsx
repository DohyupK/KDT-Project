'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  Phone,
  User,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import { authApi } from '@/api/authApi'
import { saveAuthSession } from '@/lib/authStorage'
import {
  applyDocumentTheme,
  readStoredUiSettings,
  useUiSettings,
} from '@/components/layout/AppShell'

type AuthView = 'login' | 'signup' | 'findId' | 'resetPassword'
type ResetStep = 'verify' | 'newPassword'
type PolicyModal = 'terms' | 'privacy' | null
type IdCheckStatus = 'idle' | 'checking' | 'available' | 'duplicate' | 'error'

const PHONE_REGEX = /^01[016789]-?\d{3,4}-?\d{4}$/
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/

const TERMS_OF_SERVICE = `제1조 (목적)
본 약관은 양극재 품질 AI 예측 시스템(이하 "서비스")의 이용 조건 및 절차, 이용자와 운영자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.

제2조 (회원가입)
① 이용자는 성명, 연락처, 이메일, 아이디, 비밀번호를 제공하여 회원가입을 신청합니다.
② 운영자는 신청을 승낙함으로써 회원가입 계약이 성립됩니다.

제3조 (서비스 이용)
① 회원은 본 서비스를 통해 양극재 품질 데이터 조회, AI 예측 분석, 생산 관리 기능을 이용할 수 있습니다.
② 회원은 타인의 정보를 도용하거나 서비스 운영을 방해하는 행위를 해서는 안 됩니다.

제4조 (회원의 의무)
회원은 관계 법령, 본 약관, 서비스 이용 안내를 준수해야 하며, 계정 정보를 안전하게 관리할 책임이 있습니다.

제5조 (서비스 변경 및 중단)
운영자는 서비스 개선 또는 시스템 점검을 위해 사전 공지 후 서비스의 전부 또는 일부를 변경·중단할 수 있습니다.`

const PRIVACY_POLICY = `1. 수집하는 개인정보 항목
- 필수: 성명, 연락처, 이메일, 아이디, 비밀번호
- 자동 수집: 접속 IP, 접속 일시, 서비스 이용 기록

2. 개인정보의 수집·이용 목적
- 회원 가입 및 본인 확인
- 서비스 제공 및 품질 예측 기능 운영
- 고객 문의 응대 및 공지사항 전달

3. 개인정보의 보유 및 이용 기간
회원 탈퇴 시까지 보유하며, 관련 법령에 따라 일정 기간 보관이 필요한 경우 해당 기간 동안 보관합니다.

4. 개인정보의 제3자 제공
원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만, 법령에 따른 요청이 있는 경우 예외로 합니다.

5. 이용자의 권리
이용자는 언제든지 개인정보 열람, 수정, 삭제, 처리 정지를 요청할 수 있습니다.`

function validatePhone(phone: string) {
  return PHONE_REGEX.test(phone.replace(/\s/g, ''))
}

function validatePassword(password: string) {
  return PASSWORD_REGEX.test(password)
}

function getApiErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data as { message?: string } | undefined
    if (message?.message) return message.message
  }
  return fallback
}

function FieldLabel({
  htmlFor,
  children,
  required,
  isDark,
}: {
  htmlFor: string
  children: React.ReactNode
  required?: boolean
  isDark: boolean
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}
    >
      {children} {required && <span className="text-red-500">*</span>}
    </label>
  )
}

function IconInput({
  id,
  type,
  value,
  onChange,
  placeholder,
  icon: Icon,
  rightSlot,
  isDark,
}: {
  id: string
  type: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  icon: LucideIcon
  rightSlot?: React.ReactNode
  isDark: boolean
}) {
  return (
    <div className="relative flex items-center">
      <Icon className={`absolute left-3 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} size={18} />
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          isDark
            ? 'border-slate-600 bg-slate-800 text-slate-100 placeholder:text-slate-500'
            : 'border-gray-300 bg-gray-50 text-gray-800'
        }`}
      />
      {rightSlot && <div className="absolute right-3">{rightSlot}</div>}
    </div>
  )
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
    >
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  )
}

function PolicyModalDialog({
  title,
  content,
  onClose,
  isDark,
}: {
  title: string
  content: string
  onClose: () => void
  isDark: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="policy-modal-title"
        className={`w-full max-w-lg max-h-[80vh] rounded-2xl shadow-lg border flex flex-col ${
          isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isDark ? 'border-slate-700' : 'border-gray-200'
          }`}
        >
          <h2
            id="policy-modal-title"
            className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-800'}`}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`p-1 rounded-lg transition-colors ${
              isDark
                ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>
        <div
          className={`px-6 py-4 overflow-y-auto text-sm leading-relaxed whitespace-pre-line ${
            isDark ? 'text-slate-300' : 'text-gray-600'
          }`}
        >
          {content}
        </div>
        <div
          className={`px-6 py-4 border-t shrink-0 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const { isDark } = useUiSettings()

  useEffect(() => {
    const stored = readStoredUiSettings()
    applyDocumentTheme(stored.themeMode)
  }, [])

  const [view, setView] = useState<AuthView>('login')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [loginId, setLoginId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginPw, setShowLoginPw] = useState(false)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showSignupPw, setShowSignupPw] = useState(false)
  const [idChecked, setIdChecked] = useState(false)
  const [idCheckStatus, setIdCheckStatus] = useState<IdCheckStatus>('idle')
  const [idCheckMessage, setIdCheckMessage] = useState('')
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [policyModal, setPolicyModal] = useState<PolicyModal>(null)

  const [findName, setFindName] = useState('')
  const [findPhone, setFindPhone] = useState('')
  const [resetId, setResetId] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [showResetPw, setShowResetPw] = useState(false)
  const [resetStep, setResetStep] = useState<ResetStep>('verify')

  const resetMessages = () => {
    setErrorMessage('')
    setSuccessMessage('')
  }

  const switchView = (nextView: AuthView) => {
    resetMessages()
    if (nextView === 'resetPassword') {
      setResetStep('verify')
      setResetPassword('')
      setResetPasswordConfirm('')
    } else if (view === 'resetPassword') {
      setResetStep('verify')
      setFindName('')
      setFindPhone('')
      setResetId('')
      setResetPassword('')
      setResetPasswordConfirm('')
    }
    setView(nextView)
  }

  const applyIdCheckResult = (available: boolean) => {
    if (available) {
      setIdChecked(true)
      setIdCheckStatus('available')
      setIdCheckMessage('사용 가능한 아이디입니다.')
    } else {
      setIdChecked(false)
      setIdCheckStatus('duplicate')
      setIdCheckMessage('이미 사용 중인 아이디입니다.')
    }
  }

  const handleCheckDuplicateId = async () => {
    resetMessages()
    setIdCheckMessage('')

    if (!userId.trim()) {
      setIdCheckStatus('error')
      setIdCheckMessage('아이디를 입력해주세요.')
      return
    }

    setIdCheckStatus('checking')
    setIdCheckMessage('중복 확인 중...')

    try {
      const { data } = await authApi.checkDuplicateUserId(userId.trim())
      const isDuplicate = data.duplicate === true || data.available === false

      applyIdCheckResult(!isDuplicate)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        applyIdCheckResult(false)
        return
      }

      setIdChecked(false)
      setIdCheckStatus('error')
      setIdCheckMessage(getApiErrorMessage(err, '아이디 중복 확인에 실패했습니다. 잠시 후 다시 시도해주세요.'))
    }
  }

  const passwordsMatch = passwordConfirm.length > 0 && password === passwordConfirm
  const passwordsMismatch = passwordConfirm.length > 0 && password !== passwordConfirm
  const resetPasswordsMatch =
    resetPasswordConfirm.length > 0 && resetPassword === resetPasswordConfirm
  const resetPasswordsMismatch =
    resetPasswordConfirm.length > 0 && resetPassword !== resetPasswordConfirm

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    resetMessages()

    if (!loginId.trim()) {
      setErrorMessage('아이디를 입력해주세요.')
      return
    }
    if (!loginPassword.trim()) {
      setErrorMessage('비밀번호를 입력해주세요.')
      return
    }

    setIsSubmitting(true)
    try {
      const { data } = await authApi.login({ userId: loginId.trim(), password: loginPassword })
      saveAuthSession(data.token, data.user)
      router.push('/main')
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, '아이디 또는 비밀번호가 올바르지 않습니다.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    resetMessages()

    if (!name.trim()) {
      setErrorMessage('성명을 입력해주세요.')
      return
    }
    if (!validatePhone(phone)) {
      setErrorMessage('연락처 형식이 올바르지 않습니다. (예: 010-1234-5678)')
      return
    }
    if (!email.trim()) {
      setErrorMessage('이메일을 입력해주세요.')
      return
    }
    if (!userId.trim()) {
      setErrorMessage('아이디를 입력해주세요.')
      return
    }
    if (!idChecked) {
      setErrorMessage('아이디 중복 확인을 해주세요.')
      return
    }
    if (!validatePassword(password)) {
      setErrorMessage('비밀번호는 8자 이상, 대·소문자, 숫자, 특수문자를 포함해야 합니다.')
      return
    }
    if (password !== passwordConfirm) {
      setErrorMessage('비밀번호가 일치하지 않습니다.')
      return
    }
    if (!agreePrivacy || !agreeTerms) {
      setErrorMessage('약관 및 개인정보 처리방침에 동의해주세요.')
      return
    }

    setIsSubmitting(true)
    try {
      await authApi.register({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        userId: userId.trim(),
        password,
      })
      setSuccessMessage('회원가입이 완료되었습니다. 로그인해주세요.')
      switchView('login')
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, '회원가입에 실패했습니다. 입력 정보를 확인해주세요.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFindId = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    resetMessages()

    if (!findName.trim()) {
      setErrorMessage('성명을 입력해주세요.')
      return
    }
    if (!validatePhone(findPhone)) {
      setErrorMessage('연락처 형식이 올바르지 않습니다.')
      return
    }

    setIsSubmitting(true)
    try {
      const { data } = await authApi.findUserId({
        name: findName.trim(),
        phone: findPhone.trim(),
      })
      setSuccessMessage(`회원님의 아이디는 ${data.userId} 입니다.`)
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, '일치하는 회원 정보를 찾을 수 없습니다.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyReset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    resetMessages()

    if (!findName.trim()) {
      setErrorMessage('성명을 입력해주세요.')
      return
    }
    if (!validatePhone(findPhone)) {
      setErrorMessage('연락처 형식이 올바르지 않습니다.')
      return
    }
    if (!resetId.trim()) {
      setErrorMessage('아이디를 입력해주세요.')
      return
    }

    setIsSubmitting(true)
    try {
      await authApi.verifyResetIdentity({
        name: findName.trim(),
        phone: findPhone.trim(),
        userId: resetId.trim(),
      })
      setResetPassword('')
      setResetPasswordConfirm('')
      setResetStep('newPassword')
      setSuccessMessage('본인 확인이 완료되었습니다. 새 비밀번호를 설정해주세요.')
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, '일치하는 회원 정보를 찾을 수 없습니다.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    resetMessages()

    if (!validatePassword(resetPassword)) {
      setErrorMessage('비밀번호는 8자 이상, 대·소문자, 숫자, 특수문자를 포함해야 합니다.')
      return
    }
    if (resetPassword !== resetPasswordConfirm) {
      setErrorMessage('비밀번호가 일치하지 않습니다.')
      return
    }

    setIsSubmitting(true)
    try {
      await authApi.resetPassword({
        name: findName.trim(),
        phone: findPhone.trim(),
        userId: resetId.trim(),
        newPassword: resetPassword,
      })
      setFindName('')
      setFindPhone('')
      setResetId('')
      setResetPassword('')
      setResetPasswordConfirm('')
      setResetStep('verify')
      setView('login')
      setSuccessMessage('비밀번호가 변경되었습니다. 로그인해주세요.')
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, '비밀번호 변경에 실패했습니다. 다시 시도해주세요.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const tabs: { key: AuthView; label: string }[] = [
    { key: 'login', label: '로그인' },
    { key: 'signup', label: '회원가입' },
  ]

  return (
    <>
      {policyModal === 'terms' && (
        <PolicyModalDialog
          title="이용약관"
          content={TERMS_OF_SERVICE}
          onClose={() => setPolicyModal(null)}
          isDark={isDark}
        />
      )}
      {policyModal === 'privacy' && (
        <PolicyModalDialog
          title="개인정보 처리방침"
          content={PRIVACY_POLICY}
          onClose={() => setPolicyModal(null)}
          isDark={isDark}
        />
      )}

    <div className={`min-h-screen w-full font-sans flex items-center justify-center p-6 ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-gray-50 text-gray-800'
    }`}>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-bold text-xl leading-tight text-blue-400">
            양극재 품질 AI
            <br />
            예측 시스템
          </h1>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>계정으로 시스템에 접속하세요</p>
        </div>

        {(view === 'login' || view === 'signup') && (
          <div className={`flex mb-4 rounded-xl border p-1 ${
              isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
            }`}>
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => switchView(key)}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                  view === key
                    ? 'bg-blue-600 text-white'
                    : isDark
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="flex items-center gap-3 p-4 mb-4 bg-red-50 border border-red-100 rounded-xl"
          >
            <AlertCircle className="text-red-500 shrink-0" size={20} />
            <span className="font-bold text-red-700 text-sm">{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div
            role="status"
            className="flex items-center gap-3 p-4 mb-4 bg-blue-50 border border-blue-100 rounded-xl"
          >
            <CheckCircle className="text-blue-500 shrink-0" size={20} />
            <span className="font-bold text-blue-700 text-sm">{successMessage}</span>
          </div>
        )}

        <div className={`p-6 rounded-2xl shadow-sm border ${
            isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
          }`}>
          {view === 'login' && (
            <form onSubmit={handleLogin} noValidate className="flex flex-col gap-4">
              <div>
                <FieldLabel htmlFor="login-id" required isDark={isDark}>
                  아이디
                </FieldLabel>
                <IconInput
                  id="login-id"
                  type="text"
                  value={loginId}
                  onChange={setLoginId}
                  placeholder="아이디를 입력해주세요"
                  icon={User}
                 isDark={isDark} />
              </div>
              <div>
                <FieldLabel htmlFor="login-pw" required isDark={isDark}>
                  비밀번호
                </FieldLabel>
                <IconInput
                  id="login-pw"
                  type={showLoginPw ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={setLoginPassword}
                  placeholder="비밀번호를 입력해주세요"
                  icon={Lock}
                  rightSlot={
                    <PasswordToggle
                      show={showLoginPw}
                      onToggle={() => setShowLoginPw((v) => !v)}
                      isDark={isDark}
                    />
                  }
                  isDark={isDark}
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 mt-2 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <LogIn size={18} />
                {isSubmitting ? '로그인 중...' : '로그인'}
              </button>
              <div className={`flex justify-between text-sm pt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                <button
                  type="button"
                  onClick={() => switchView('findId')}
                  className="hover:text-blue-600 transition-colors"
                >
                  아이디 찾기
                </button>
                <button
                  type="button"
                  onClick={() => switchView('resetPassword')}
                  className="hover:text-blue-600 transition-colors"
                >
                  비밀번호 재설정
                </button>
              </div>
            </form>
          )}

          {view === 'signup' && (
            <form onSubmit={handleSignup} noValidate className="flex flex-col gap-4">
              <div>
                <FieldLabel htmlFor="signup-name" required isDark={isDark}>
                  성명
                </FieldLabel>
                <IconInput
                  id="signup-name"
                  type="text"
                  value={name}
                  onChange={setName}
                  placeholder="홍길동"
                  icon={User}
                 isDark={isDark} />
              </div>
              <div>
                <FieldLabel htmlFor="signup-phone" required isDark={isDark}>
                  연락처
                </FieldLabel>
                <IconInput
                  id="signup-phone"
                  type="tel"
                  value={phone}
                  onChange={setPhone}
                  placeholder="010-1234-5678"
                  icon={Phone}
                 isDark={isDark} />
              </div>
              <div>
                <FieldLabel htmlFor="signup-email" required isDark={isDark}>
                  이메일
                </FieldLabel>
                <IconInput
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="hong@example.com"
                  icon={Mail}
                 isDark={isDark} />
              </div>
              <div>
                <FieldLabel htmlFor="signup-id" required isDark={isDark}>
                  아이디
                </FieldLabel>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <IconInput
                      id="signup-id"
                      type="text"
                      value={userId}
                      onChange={(value) => {
                        setUserId(value)
                        setIdChecked(false)
                        setIdCheckStatus('idle')
                        setIdCheckMessage('')
                      }}
                      placeholder="아이디"
                      icon={User}
                     isDark={isDark} />
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckDuplicateId}
                    disabled={idCheckStatus === 'checking'}
                    className={`px-4 py-2 border-2 rounded-lg text-sm font-bold shrink-0 transition-colors disabled:opacity-60 ${
                      isDark
                        ? 'border-slate-600 hover:bg-slate-800 text-slate-200'
                        : 'border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {idCheckStatus === 'checking' ? '확인 중...' : '중복 확인'}
                  </button>
                </div>
                {idCheckMessage && (
                  <p
                    className={`mt-2 text-sm font-medium ${
                      idCheckStatus === 'available'
                        ? 'text-blue-600'
                        : idCheckStatus === 'duplicate'
                          ? 'text-red-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {idCheckStatus === 'available' && (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle size={14} /> {idCheckMessage}
                      </span>
                    )}
                    {idCheckStatus === 'duplicate' && (
                      <span className="inline-flex items-center gap-1">
                        <AlertCircle size={14} /> {idCheckMessage}
                      </span>
                    )}
                    {(idCheckStatus === 'checking' || idCheckStatus === 'error') && idCheckMessage}
                  </p>
                )}
              </div>
              <div>
                <FieldLabel htmlFor="signup-pw" required isDark={isDark}>
                  비밀번호
                </FieldLabel>
                <IconInput
                  id="signup-pw"
                  type={showSignupPw ? 'text' : 'password'}
                  value={password}
                  onChange={setPassword}
                  placeholder="8자 이상, 대·소문자·숫자·특수문자"
                  icon={Lock}
                  rightSlot={
                    <PasswordToggle
                      show={showSignupPw}
                      onToggle={() => setShowSignupPw((v) => !v)}
                      isDark={isDark}
                    />
                  }
                  isDark={isDark}
                />
              </div>
              <div>
                <FieldLabel htmlFor="signup-pw2" required isDark={isDark}>
                  비밀번호 확인
                </FieldLabel>
                <IconInput
                  id="signup-pw2"
                  type="password"
                  value={passwordConfirm}
                  onChange={setPasswordConfirm}
                  placeholder="비밀번호 재입력"
                  icon={Lock}
                 isDark={isDark} />
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
              <div className={`flex flex-col gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="accent-blue-600"
                    />
                    <span>[필수] 이용약관 동의</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setPolicyModal('terms')}
                    className="text-blue-600 font-medium hover:underline shrink-0"
                  >
                    보기
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={agreePrivacy}
                      onChange={(e) => setAgreePrivacy(e.target.checked)}
                      className="accent-blue-600"
                    />
                    <span>[필수] 개인정보 처리방침 동의</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setPolicyModal('privacy')}
                    className="text-blue-600 font-medium hover:underline shrink-0"
                  >
                    보기
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <UserPlus size={18} />
                {isSubmitting ? '가입 중...' : '회원가입'}
              </button>
            </form>
          )}

          {view === 'findId' && (
            <form onSubmit={handleFindId} noValidate className="flex flex-col gap-4">
              <h2 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>아이디 찾기</h2>
              <p className={`text-sm -mt-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                가입 시 등록한 성명과 연락처를 입력해주세요.
              </p>
              <div>
                <FieldLabel htmlFor="find-name" required isDark={isDark}>
                  성명
                </FieldLabel>
                <IconInput
                  id="find-name"
                  type="text"
                  value={findName}
                  onChange={setFindName}
                  placeholder="홍길동"
                  icon={User}
                 isDark={isDark} />
              </div>
              <div>
                <FieldLabel htmlFor="find-phone" required isDark={isDark}>
                  연락처
                </FieldLabel>
                <IconInput
                  id="find-phone"
                  type="tel"
                  value={findPhone}
                  onChange={setFindPhone}
                  placeholder="010-1234-5678"
                  icon={Phone}
                 isDark={isDark} />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-60"
              >
                {isSubmitting ? '조회 중...' : '아이디 찾기'}
              </button>
              <button
                type="button"
                onClick={() => switchView('login')}
                className={`text-sm hover:text-blue-600 text-center transition-colors ${
                  isDark ? 'text-slate-400' : 'text-gray-500'
                }`}
              >
                ← 로그인으로 돌아가기
              </button>
            </form>
          )}

          {view === 'resetPassword' && resetStep === 'verify' && (
            <form onSubmit={handleVerifyReset} noValidate className="flex flex-col gap-4">
              <h2 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>비밀번호 재설정</h2>
              <p className={`text-sm -mt-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                본인 확인을 위해 회원가입 시 입력한 정보를 입력해주세요.
              </p>
              <div>
                <FieldLabel htmlFor="reset-name" required isDark={isDark}>
                  성명
                </FieldLabel>
                <IconInput
                  id="reset-name"
                  type="text"
                  value={findName}
                  onChange={setFindName}
                  placeholder="홍길동"
                  icon={User}
                 isDark={isDark} />
              </div>
              <div>
                <FieldLabel htmlFor="reset-phone" required isDark={isDark}>
                  연락처
                </FieldLabel>
                <IconInput
                  id="reset-phone"
                  type="tel"
                  value={findPhone}
                  onChange={setFindPhone}
                  placeholder="010-1234-5678"
                  icon={Phone}
                 isDark={isDark} />
              </div>
              <div>
                <FieldLabel htmlFor="reset-id" required isDark={isDark}>
                  아이디
                </FieldLabel>
                <IconInput
                  id="reset-id"
                  type="text"
                  value={resetId}
                  onChange={setResetId}
                  placeholder="아이디"
                  icon={User}
                 isDark={isDark} />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-60"
              >
                {isSubmitting ? '확인 중...' : '본인 확인'}
              </button>
              <button
                type="button"
                onClick={() => switchView('login')}
                className={`text-sm hover:text-blue-600 text-center transition-colors ${
                  isDark ? 'text-slate-400' : 'text-gray-500'
                }`}
              >
                ← 로그인으로 돌아가기
              </button>
            </form>
          )}

          {view === 'resetPassword' && resetStep === 'newPassword' && (
            <form onSubmit={handleResetPassword} noValidate className="flex flex-col gap-4">
              <h2 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>새 비밀번호 설정</h2>
              <p className={`text-sm -mt-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                새 비밀번호를 입력해주세요.
              </p>
              <div className={`rounded-lg border px-4 py-3 text-sm ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-300'
                  : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}>
                <p>
                  <span className={`font-medium ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>아이디</span> {resetId}
                </p>
              </div>
              <div>
                <FieldLabel htmlFor="reset-pw" required isDark={isDark}>
                  새 비밀번호
                </FieldLabel>
                <IconInput
                  id="reset-pw"
                  type={showResetPw ? 'text' : 'password'}
                  value={resetPassword}
                  onChange={setResetPassword}
                  placeholder="8자 이상, 대·소문자·숫자·특수문자"
                  icon={Lock}
                  rightSlot={
                    <PasswordToggle
                      show={showResetPw}
                      onToggle={() => setShowResetPw((v) => !v)}
                      isDark={isDark}
                    />
                  }
                  isDark={isDark}
                />
              </div>
              <div>
                <FieldLabel htmlFor="reset-pw2" required isDark={isDark}>
                  비밀번호 확인
                </FieldLabel>
                <IconInput
                  id="reset-pw2"
                  type="password"
                  value={resetPasswordConfirm}
                  onChange={setResetPasswordConfirm}
                  placeholder="비밀번호 재입력"
                  icon={Lock}
                 isDark={isDark} />
                {resetPasswordsMatch && (
                  <p className="mt-2 text-sm font-medium text-blue-600 inline-flex items-center gap-1">
                    <CheckCircle size={14} /> 비밀번호가 동일합니다.
                  </p>
                )}
                {resetPasswordsMismatch && (
                  <p className="mt-2 text-sm font-medium text-red-600 inline-flex items-center gap-1">
                    <AlertCircle size={14} /> 비밀번호가 일치하지 않습니다.
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-60"
              >
                {isSubmitting ? '처리 중...' : '비밀번호 변경'}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetMessages()
                  setResetPassword('')
                  setResetPasswordConfirm('')
                  setResetStep('verify')
                }}
                className={`text-sm hover:text-blue-600 text-center transition-colors ${
                  isDark ? 'text-slate-400' : 'text-gray-500'
                }`}
              >
                ← 본인 확인으로 돌아가기
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
