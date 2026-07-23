'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { AlertCircle } from 'lucide-react'
import { managementApi } from '@/api/managementApi'
import type { Inquiry } from '@/types'

type MailImportance = '높음' | '보통' | '낮음'
type InquiryStatus = '대기' | '진행중' | '완료'
type InquiryPriority = '높음' | '보통' | '낮음'
type TabId = 'mail' | 'inquiry' | 'defect'
type StatusFilter = '전체' | InquiryStatus

type MailItem = {
  id: string
  sender: string
  subject: string
  body: string
  receivedAt: string
  cc?: string[]
  hasAttachment?: boolean
  attachments?: string[]
  importance?: MailImportance
  tags?: string[]
  isRead?: boolean
}

type InquiryReply = {
  inquiryId: string
  content: string
  assignee: string
  replyStatus: string
  repliedAt?: string
  internalMemo?: string
  priority?: InquiryPriority
  adminConfirmed?: boolean
}

type InquiryItem = {
  id: string
  authorName: string
  email: string
  phone: string
  title: string
  content: string
  createdAt: string
  type?: string
  attachments?: string[]
  priority?: InquiryPriority
  department?: string
  updatedAt?: string
  status?: InquiryStatus
  reply?: InquiryReply
}

type DefectRecord = {
  lineId: string
  lineName: string
  defectRate: number
  baseDate: string
  defectCount: number
  totalCount: number
  causeCategory?: string
  department?: string
  prevDefectRate?: number
}

type ReplyFormState = {
  content: string
  assignee: string
  priority: InquiryPriority
  internalMemo: string
  adminConfirmed: boolean
}

const EMPTY_REPLY_FORM: ReplyFormState = {
  content: '',
  assignee: '',
  priority: '보통',
  internalMemo: '',
  adminConfirmed: false,
}

function badgeStatus(v?: InquiryStatus) {
  if (v === '대기') return 'bg-gray-100 text-gray-600'
  if (v === '진행중') return 'bg-blue-100 text-blue-600'
  return 'bg-green-100 text-green-600'
}

function badgePriority(v?: InquiryPriority) {
  if (v === '높음') return 'bg-red-100 text-red-600'
  if (v === '낮음') return 'bg-gray-100 text-gray-500'
  return 'bg-yellow-100 text-yellow-600'
}

function formatDateTime(iso: string) {
  return dayjs(iso).format('YYYY-MM-DD HH:mm')
}

function mapInquiryToItem(inquiry: Inquiry): InquiryItem {
  return {
    id: inquiry.id,
    authorName: inquiry.authorName,
    email: inquiry.email,
    phone: inquiry.phone ?? '',
    title: inquiry.title,
    content: inquiry.content,
    createdAt: formatDateTime(inquiry.createdAt),
    type: inquiry.category,
    attachments: inquiry.attachments,
    priority: (inquiry.priority as InquiryPriority) ?? '보통',
    department: inquiry.department ?? undefined,
    updatedAt: formatDateTime(inquiry.updatedAt),
    status: (inquiry.status as InquiryStatus) ?? '대기',
    reply: inquiry.reply
      ? {
          inquiryId: inquiry.id,
          content: inquiry.reply.content,
          assignee: inquiry.reply.assignee,
          replyStatus: inquiry.reply.replyStatus,
          repliedAt: inquiry.reply.repliedAt ? formatDateTime(inquiry.reply.repliedAt) : undefined,
          internalMemo: inquiry.reply.internalMemo ?? undefined,
          priority: (inquiry.reply.priority as InquiryPriority) ?? '보통',
          adminConfirmed: inquiry.reply.adminConfirmed,
        }
      : undefined,
  }
}

function getAlertLines(records: DefectRecord[], threshold: number) {
  const byLine = new Map<string, DefectRecord[]>()
  records.forEach((r) => {
    const list = byLine.get(r.lineId) ?? []
    list.push(r)
    byLine.set(r.lineId, list)
  })

  const alerts: { lineId: string; lineName: string; recent: DefectRecord[] }[] = []
  byLine.forEach((list, lineId) => {
    const sorted = [...list].sort((a, b) => a.baseDate.localeCompare(b.baseDate))
    const recent3 = sorted.slice(-3)
    if (recent3.length < 3) return
    if (recent3.every((r) => r.defectRate > threshold)) {
      alerts.push({ lineId, lineName: recent3[0].lineName, recent: recent3 })
    }
  })
  return alerts
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'mail', label: '메일 관리' },
  { id: 'inquiry', label: '문의/답변 관리' },
  { id: 'defect', label: '불량률 모니터링' },
]

export default function ManagementPage() {
  const [activeTab, setActiveTab] = useState<TabId>('mail')
  const [mails, setMails] = useState<MailItem[]>([])
  const [mailsLoading, setMailsLoading] = useState(false)
  const [mailError, setMailError] = useState('')
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null)
  const [inquiries, setInquiries] = useState<InquiryItem[]>([])
  const [inquiriesLoading, setInquiriesLoading] = useState(false)
  const [inquiryError, setInquiryError] = useState('')
  const [replySubmitting, setReplySubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('전체')
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null)
  const [replyForm, setReplyForm] = useState<ReplyFormState>(EMPTY_REPLY_FORM)
  const [defectRecords, setDefectRecords] = useState<DefectRecord[]>([])
  const [defectsLoading, setDefectsLoading] = useState(false)
  const [defectError, setDefectError] = useState('')
  const [threshold, setThreshold] = useState(3)
  const [n8nEnabled, setN8nEnabled] = useState(true)
  const settingsLoadedRef = useRef(false)

  const loadMails = useCallback(async () => {
    setMailsLoading(true)
    setMailError('')
    try {
      const { data } = await managementApi.getMails()
      setMails(data.mails)
    } catch {
      setMailError('메일 목록을 불러오지 못했습니다. 로그인 상태와 백엔드 연결을 확인해주세요.')
    } finally {
      setMailsLoading(false)
    }
  }, [])

  const loadInquiries = useCallback(async () => {
    setInquiriesLoading(true)
    setInquiryError('')
    try {
      const { data } = await managementApi.getInquiries()
      setInquiries(data.inquiries.map(mapInquiryToItem))
    } catch {
      setInquiryError('문의 목록을 불러오지 못했습니다. 로그인 상태와 백엔드 연결을 확인해주세요.')
    } finally {
      setInquiriesLoading(false)
    }
  }, [])

  const loadDefects = useCallback(async () => {
    setDefectsLoading(true)
    setDefectError('')
    try {
      const [recordsRes, settingsRes] = await Promise.all([
        managementApi.getDefectRecords(),
        managementApi.getDefectSettings(),
      ])
      setDefectRecords(recordsRes.data.records)
      setThreshold(settingsRes.data.settings.threshold)
      setN8nEnabled(settingsRes.data.settings.n8nEnabled)
      settingsLoadedRef.current = true
    } catch {
      setDefectError('불량률 데이터를 불러오지 못했습니다. 로그인 상태와 백엔드 연결을 확인해주세요.')
    } finally {
      setDefectsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'mail') {
      void loadMails()
    }
  }, [activeTab, loadMails])

  useEffect(() => {
    if (activeTab === 'inquiry') {
      void loadInquiries()
    }
  }, [activeTab, loadInquiries])

  useEffect(() => {
    if (activeTab === 'defect') {
      void loadDefects()
    }
  }, [activeTab, loadDefects])

  useEffect(() => {
    if (!settingsLoadedRef.current) return

    const timer = window.setTimeout(() => {
      void managementApi.updateDefectSettings({ threshold }).catch(() => {
        setDefectError('임계값 저장에 실패했습니다.')
      })
    }, 500)

    return () => window.clearTimeout(timer)
  }, [threshold])

  const selectedMail = mails.find((m) => m.id === selectedMailId) ?? null
  const selectedInquiry = inquiries.find((i) => i.id === selectedInquiryId) ?? null
  const filteredInquiries =
    statusFilter === '전체' ? inquiries : inquiries.filter((i) => i.status === statusFilter)
  const alertLines = getAlertLines(defectRecords, threshold)

  const handleSelectMail = async (id: string) => {
    setSelectedMailId(id)
    setMails((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)))
    try {
      await managementApi.markMailRead(id)
    } catch {
      setMailError('메일 읽음 처리에 실패했습니다.')
    }
  }

  const handleToggleN8n = async () => {
    const next = !n8nEnabled
    setN8nEnabled(next)
    try {
      await managementApi.updateDefectSettings({ n8nEnabled: next })
    } catch {
      setN8nEnabled(!next)
      setDefectError('n8n 설정 저장에 실패했습니다.')
    }
  }

  const handleSelectInquiry = (id: string) => {
    setSelectedInquiryId(id)
    const item = inquiries.find((i) => i.id === id)
    if (item?.reply) {
      setReplyForm({
        content: item.reply.content,
        assignee: item.reply.assignee,
        priority: item.reply.priority ?? '보통',
        internalMemo: item.reply.internalMemo ?? '',
        adminConfirmed: item.reply.adminConfirmed ?? false,
      })
    } else {
      setReplyForm(EMPTY_REPLY_FORM)
    }
  }

  const handleSubmitReply = async () => {
    if (!selectedInquiryId || !replyForm.content.trim() || !replyForm.assignee.trim()) return

    setReplySubmitting(true)
    setInquiryError('')
    try {
      const { data } = await managementApi.submitReply(selectedInquiryId, {
        content: replyForm.content.trim(),
        assignee: replyForm.assignee.trim(),
        priority: replyForm.priority,
        internalMemo: replyForm.internalMemo.trim() || undefined,
        adminConfirmed: replyForm.adminConfirmed,
      })
      const updated = mapInquiryToItem(data.inquiry)
      setInquiries((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch {
      setInquiryError('답변 등록에 실패했습니다. 입력값과 서버 연결을 확인해주세요.')
    } finally {
      setReplySubmitting(false)
    }
  }

  return (
    <div className="h-full w-full flex flex-col p-6 gap-4 overflow-hidden text-gray-800">
          <div className="flex items-center justify-between gap-4 shrink-0">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Management</h1>
              <p className="text-sm text-gray-500 mt-0.5">메일 · 문의/답변 · 불량률 모니터링</p>
            </div>
            <div className="flex gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === 'mail' && (
              <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 shrink-0">
                  <h2 className="text-lg font-bold text-gray-800">메일 조회 및 확인 (MEMO01_MAIL_VIEW01)</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {mailsLoading ? '메일 목록을 불러오는 중…' : '수신 메일을 선택하면 상세를 확인하고 읽음 처리됩니다.'}
                  </p>
                </div>
                {mailError && (
                  <div className="mx-5 mt-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 shrink-0">
                    {mailError}
                  </div>
                )}
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5">
                  <div className="lg:col-span-2 border-b lg:border-b-0 lg:border-r border-gray-100 overflow-y-auto">
                    {mails.length === 0 ? (
                      <p className="p-6 text-sm text-gray-500">표시할 메일이 없습니다.</p>
                    ) : (
                      mails.map((mail) => {
                        const selected = mail.id === selectedMailId
                        return (
                          <button
                            key={mail.id}
                            type="button"
                            onClick={() => void handleSelectMail(mail.id)}
                            className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                              selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {mail.hasAttachment && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">첨부</span>
                              )}
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                  mail.isRead ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'
                                }`}
                              >
                                {mail.isRead ? '읽음' : '안읽음'}
                              </span>
                            </div>
                            <p className={`text-sm truncate ${mail.isRead ? 'text-gray-700' : 'font-bold text-gray-900'}`}>
                              {mail.subject}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 truncate">{mail.sender} · {mail.receivedAt}</p>
                          </button>
                        )
                      })
                    )}
                  </div>
                  <div className="lg:col-span-3 overflow-y-auto p-5">
                    {!selectedMail ? (
                      <div className="h-full min-h-[200px] flex items-center justify-center text-sm text-gray-400">
                        좌측에서 메일을 선택하세요.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {selectedMail.tags && selectedMail.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {selectedMail.tags.map((t) => (
                              <span key={t} className="px-3 py-1 rounded-full text-xs bg-gray-100 text-gray-600">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                        <h3 className="text-xl font-bold text-gray-800">{selectedMail.subject}</h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div><p className="text-gray-400 text-xs">메일ID</p><p className="font-medium">{selectedMail.id}</p></div>
                          <div><p className="text-gray-400 text-xs">수신일시</p><p className="font-medium">{selectedMail.receivedAt}</p></div>
                          <div><p className="text-gray-400 text-xs">발신자</p><p className="font-medium">{selectedMail.sender}</p></div>
                          <div><p className="text-gray-400 text-xs">참조(CC)</p><p className="font-medium">{selectedMail.cc?.join(', ') || '-'}</p></div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                          {selectedMail.body}
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-2">첨부파일</p>
                          {selectedMail.attachments?.length ? (
                            <div className="flex flex-col gap-2">
                              {selectedMail.attachments.map((f) => (
                                <div key={f} className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm">
                                  {f}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">첨부파일 없음</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'inquiry' && (
              <div className="h-full flex flex-col gap-4 overflow-hidden">
                {inquiryError && (
                  <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 shrink-0">
                    {inquiryError}
                  </div>
                )}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden shrink-0 max-h-[42%]">
                  <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">문의 내역 조회 (MEMO02_INQUIRY_VIEW01)</h2>
                      <p className="text-sm text-gray-500">
                        {inquiriesLoading ? '문의 목록을 불러오는 중…' : '행을 선택하면 상세와 답변 패널이 연동됩니다.'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {(['전체', '대기', '진행중', '완료'] as StatusFilter[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setStatusFilter(f)}
                          className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                            statusFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-auto">
                    <table className="min-w-full text-sm text-left">
                      <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">문의ID</th>
                          <th className="px-4 py-2.5 font-medium">제목</th>
                          <th className="px-4 py-2.5 font-medium">작성자</th>
                          <th className="px-4 py-2.5 font-medium">상태</th>
                          <th className="px-4 py-2.5 font-medium">우선순위</th>
                          <th className="px-4 py-2.5 font-medium">작성일</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInquiries.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                              해당 조건의 문의가 없습니다.
                            </td>
                          </tr>
                        ) : (
                          filteredInquiries.map((item) => (
                            <tr
                              key={item.id}
                              onClick={() => handleSelectInquiry(item.id)}
                              className={`border-t border-gray-50 cursor-pointer transition-colors ${
                                item.id === selectedInquiryId ? 'bg-blue-50' : 'hover:bg-gray-50'
                              }`}
                            >
                              <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{item.id}</td>
                              <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[220px] truncate">{item.title}</td>
                              <td className="px-4 py-2.5 text-gray-600">{item.authorName}</td>
                              <td className="px-4 py-2.5"><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badgeStatus(item.status)}`}>{item.status ?? '대기'}</span></td>
                              <td className="px-4 py-2.5"><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badgePriority(item.priority)}`}>{item.priority ?? '보통'}</span></td>
                              <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{item.createdAt}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 overflow-y-auto">
                    <h3 className="font-bold text-gray-800 mb-3">문의 상세</h3>
                    {!selectedInquiry ? (
                      <p className="text-sm text-gray-400 py-8 text-center">문의를 선택하세요.</p>
                    ) : (
                      <div className="space-y-3 text-sm">
                        <div className="grid grid-cols-2 gap-3">
                          <div><p className="text-xs text-gray-400">문의ID</p><p className="font-medium">{selectedInquiry.id}</p></div>
                          <div><p className="text-xs text-gray-400">유형</p><p className="font-medium">{selectedInquiry.type ?? '-'}</p></div>
                          <div><p className="text-xs text-gray-400">작성자</p><p className="font-medium">{selectedInquiry.authorName}</p></div>
                          <div><p className="text-xs text-gray-400">연락처</p><p className="font-medium">{selectedInquiry.phone}</p></div>
                          <div className="col-span-2"><p className="text-xs text-gray-400">이메일</p><p className="font-medium break-all">{selectedInquiry.email}</p></div>
                          <div><p className="text-xs text-gray-400">처리 부서</p><p className="font-medium">{selectedInquiry.department ?? '-'}</p></div>
                          <div><p className="text-xs text-gray-400">작성일 / 수정일</p><p className="font-medium">{selectedInquiry.createdAt}{selectedInquiry.updatedAt ? ` / ${selectedInquiry.updatedAt}` : ''}</p></div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">제목</p>
                          <p className="font-bold text-gray-800">{selectedInquiry.title}</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 leading-relaxed whitespace-pre-wrap">
                          {selectedInquiry.content}
                        </div>
                        {selectedInquiry.attachments?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedInquiry.attachments.map((f) => (
                              <span key={f} className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                                {f}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {selectedInquiry.reply && (
                          <div className="p-3 bg-green-50 border border-green-100 rounded-xl">
                            <p className="text-xs font-bold text-green-700 mb-1">등록된 답변</p>
                            <p className="text-sm text-green-900 whitespace-pre-wrap">{selectedInquiry.reply.content}</p>
                            <p className="text-xs text-green-600 mt-2">
                              {selectedInquiry.reply.assignee} · {selectedInquiry.reply.repliedAt}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 overflow-y-auto">
                    <h3 className="font-bold text-gray-800">문의 답변 관리 (MEMO02_REPLY_MANAGE02)</h3>
                    <p className="text-sm text-gray-500 mt-1 mb-4">답변 등록 시 문의 상태가 완료로 변경됩니다.</p>
                    {!selectedInquiry ? (
                      <p className="text-sm text-gray-400 py-8 text-center">문의를 선택하면 답변 폼이 표시됩니다.</p>
                    ) : (
                      <div className="space-y-3">
                        <textarea
                          value={replyForm.content}
                          onChange={(e) => setReplyForm((p) => ({ ...p, content: e.target.value }))}
                          rows={4}
                          placeholder="답변 내용"
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          value={replyForm.assignee}
                          onChange={(e) => setReplyForm((p) => ({ ...p, assignee: e.target.value }))}
                          placeholder="담당자"
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                          value={replyForm.priority}
                          onChange={(e) =>
                            setReplyForm((p) => ({ ...p, priority: e.target.value as InquiryPriority }))
                          }
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="높음">우선순위: 높음</option>
                          <option value="보통">우선순위: 보통</option>
                          <option value="낮음">우선순위: 낮음</option>
                        </select>
                        <input
                          type="text"
                          value={replyForm.internalMemo}
                          onChange={(e) => setReplyForm((p) => ({ ...p, internalMemo: e.target.value }))}
                          placeholder="내부 메모"
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={replyForm.adminConfirmed}
                            onChange={(e) => setReplyForm((p) => ({ ...p, adminConfirmed: e.target.checked }))}
                            className="rounded border-gray-300"
                          />
                          관리자 확인
                        </label>
                        <button
                          type="button"
                          onClick={() => void handleSubmitReply()}
                          disabled={replySubmitting}
                          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-sm hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {replySubmitting ? '등록 중…' : '답변 등록'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'defect' && (
              <div className="h-full flex flex-col gap-4 overflow-y-auto pr-1">
                {defectError && (
                  <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 shrink-0">
                    {defectError}
                  </div>
                )}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 shrink-0">
                  <h2 className="text-lg font-bold text-gray-800">
                    생산라인 불량률 모니터링 및 알림 설정 (MEM03_DEFECT_ALERT01)
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {defectsLoading
                      ? '불량률 데이터를 불러오는 중…'
                      : '최근 3일 연속 임계값 초과 라인만 알림 대상으로 표시합니다.'}
                  </p>
                  <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-600 font-medium">임계값 (%)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={threshold}
                        onChange={(e) => setThreshold(Number(e.target.value) || 0)}
                        className="w-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 min-w-[260px]">
                      <div>
                        <p className="text-sm font-medium text-gray-800">n8n 일일 모니터링</p>
                        <p className="text-xs text-gray-500">{n8nEnabled ? '활성화' : '비활성화'}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={n8nEnabled}
                        onClick={() => void handleToggleN8n()}
                        className={`relative h-7 w-12 rounded-full transition-colors ${n8nEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                            n8nEnabled ? 'translate-x-5' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 shrink-0">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-3">
                    <AlertCircle className="text-red-500" size={20} />
                    알림 대상 라인
                  </h3>
                  {alertLines.length === 0 ? (
                    <p className="text-sm text-gray-400">현재 알림 대상 라인이 없습니다.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {alertLines.map((alert) => (
                        <div
                          key={alert.lineId}
                          className="flex justify-between items-center p-4 bg-red-50 border border-red-100 rounded-xl"
                        >
                          <div>
                            <span className="font-bold text-red-700">
                              {alert.lineName} ({alert.lineId})
                            </span>
                            <p className="text-sm text-red-500 mt-1">
                              {alert.recent.map((r) => `${r.baseDate} ${r.defectRate}%`).join(' → ')}
                            </p>
                          </div>
                          <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold whitespace-nowrap">
                            3일 연속 초과
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex-1 min-h-[280px] flex flex-col">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800">전체 생산 라인 기록</h3>
                  </div>
                  <div className="overflow-auto flex-1">
                    {defectRecords.length === 0 ? (
                      <p className="p-6 text-sm text-gray-400">
                        {defectsLoading ? '데이터를 불러오는 중…' : '표시할 데이터가 없습니다.'}
                      </p>
                    ) : (
                      <table className="min-w-full text-sm text-left">
                        <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                          <tr>
                            <th className="px-4 py-2.5 font-medium">라인</th>
                            <th className="px-4 py-2.5 font-medium">기준일</th>
                            <th className="px-4 py-2.5 font-medium">불량률</th>
                            <th className="px-4 py-2.5 font-medium">불량/총생산</th>
                            <th className="px-4 py-2.5 font-medium">원인</th>
                            <th className="px-4 py-2.5 font-medium">부서</th>
                            <th className="px-4 py-2.5 font-medium">전기간</th>
                          </tr>
                        </thead>
                        <tbody>
                          {defectRecords.map((row) => {
                            const over = row.defectRate > threshold
                            const delta =
                              row.prevDefectRate !== undefined
                                ? Number((row.defectRate - row.prevDefectRate).toFixed(1))
                                : null
                            return (
                              <tr
                                key={`${row.lineId}-${row.baseDate}`}
                                className={`border-t border-gray-50 ${over ? 'bg-red-50/70' : ''}`}
                              >
                                <td className="px-4 py-2.5 font-medium text-gray-800">
                                  {row.lineName}
                                  <span className="text-xs text-gray-400 ml-1">{row.lineId}</span>
                                </td>
                                <td className="px-4 py-2.5 text-gray-600">{row.baseDate}</td>
                                <td className={`px-4 py-2.5 font-bold ${over ? 'text-red-600' : 'text-gray-800'}`}>
                                  {row.defectRate}%
                                </td>
                                <td className="px-4 py-2.5 text-gray-600">{row.defectCount}/{row.totalCount}</td>
                                <td className="px-4 py-2.5 text-gray-600">{row.causeCategory ?? '-'}</td>
                                <td className="px-4 py-2.5 text-gray-600">{row.department ?? '-'}</td>
                                <td className="px-4 py-2.5 text-gray-600">
                                  {delta === null ? '-' : delta > 0 ? `+${delta}%p` : `${delta}%p`}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
    </div>
  )
}
