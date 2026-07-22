'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'

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

const INITIAL_MAILS: MailItem[] = [
  {
    id: 'MAIL-001',
    sender: 'quality@posco.com',
    subject: '[긴급] A라인 품질 이상 보고',
    body: '금일 오전 A라인에서 표면 결함률이 급증했습니다. 첨부된 측정 리포트를 확인 후 조치 부탁드립니다.',
    receivedAt: '2026-07-16 09:12',
    cc: ['plant-manager@posco.com', 'qc-lead@posco.com'],
    hasAttachment: true,
    attachments: ['A라인_품질리포트_0716.pdf', '측정데이터.xlsx'],
    importance: '높음',
    tags: ['품질', '긴급'],
    isRead: false,
  },
  {
    id: 'MAIL-002',
    sender: 'ops@partner.co.kr',
    subject: '주간 생산 실적 공유',
    body: '지난주 생산 실적 및 가동률 요약본을 공유드립니다. 특이사항은 B라인 정비로 인한 가동률 하락입니다.',
    receivedAt: '2026-07-16 08:45',
    cc: ['planning@posco.com'],
    hasAttachment: true,
    attachments: ['주간실적_0710-0715.xlsx'],
    importance: '보통',
    tags: ['생산', '주간보고'],
    isRead: false,
  },
  {
    id: 'MAIL-003',
    sender: 'safety@posco.com',
    subject: '안전점검 일정 안내',
    body: '7월 18일 전 라인 대상 정기 안전점검이 예정되어 있습니다. 담당자별 체크리스트를 사전 확인해주세요.',
    receivedAt: '2026-07-15 17:20',
    importance: '보통',
    tags: ['안전'],
    isRead: true,
    hasAttachment: false,
  },
  {
    id: 'MAIL-004',
    sender: 'vendor@material.kr',
    subject: '원자재 납품 일정 변경 요청',
    body: '기상 이슈로 인해 7월 17일 납품분이 하루 지연될 예정입니다. 양해 부탁드립니다.',
    receivedAt: '2026-07-15 14:03',
    cc: ['procurement@posco.com'],
    hasAttachment: false,
    importance: '높음',
    tags: ['구매', '납품'],
    isRead: false,
  },
  {
    id: 'MAIL-005',
    sender: 'hr@posco.com',
    subject: '7월 교육 일정 공지',
    body: '신규 입사자 대상 품질 기초 교육 일정을 안내드립니다. 참석자 명단을 회신해주세요.',
    receivedAt: '2026-07-14 11:30',
    importance: '낮음',
    tags: ['교육', 'HR'],
    isRead: true,
    hasAttachment: true,
    attachments: ['교육일정표.pdf'],
  },
  {
    id: 'MAIL-006',
    sender: 'it-support@posco.com',
    subject: 'MES 시스템 정기 점검 안내',
    body: '7월 20일 02:00~04:00 MES 정기 점검으로 일부 조회 기능이 제한됩니다.',
    receivedAt: '2026-07-14 09:05',
    importance: '보통',
    tags: ['IT', 'MES'],
    isRead: true,
    hasAttachment: false,
  },
  {
    id: 'MAIL-007',
    sender: 'customer@battery.com',
    subject: 'LOT-8821 품질 문의',
    body: '납품 LOT-8821 샘플에서 수분 함량 편차가 확인되어 원인 분석 요청드립니다.',
    receivedAt: '2026-07-13 16:40',
    cc: ['cs@posco.com'],
    hasAttachment: true,
    attachments: ['고객클레임_시료사진.zip'],
    importance: '높음',
    tags: ['고객', '클레임'],
    isRead: false,
  },
]

const INITIAL_INQUIRIES: InquiryItem[] = [
  {
    id: 'INQ-001',
    authorName: '김민수',
    email: 'minsu.kim@example.com',
    phone: '010-1234-5678',
    title: '대시보드 불량률 수치 오류 문의',
    content: '메인 대시보드의 A라인 불량률이 실제 MES 수치와 다르게 표시됩니다. 확인 부탁드립니다.',
    createdAt: '2026-07-16 10:20',
    type: '시스템',
    attachments: ['스크린샷.png'],
    priority: '높음',
    department: '품질관리팀',
    updatedAt: '2026-07-16 10:20',
    status: '대기',
  },
  {
    id: 'INQ-002',
    authorName: '이서연',
    email: 'seoyeon.lee@example.com',
    phone: '010-2345-6789',
    title: '문의 답변 알림 메일 미수신',
    content: '이전 문의에 대한 답변 알림 메일이 도착하지 않았습니다. 수신 설정을 확인하고 싶습니다.',
    createdAt: '2026-07-15 15:40',
    type: '계정/알림',
    priority: '보통',
    department: 'IT지원팀',
    updatedAt: '2026-07-15 16:10',
    status: '진행중',
  },
  {
    id: 'INQ-003',
    authorName: '박준호',
    email: 'junho.park@example.com',
    phone: '010-3456-7890',
    title: '지식베이스 문서 접근 권한 요청',
    content: '공정 매뉴얼 문서 열람 권한이 없어 업무에 어려움이 있습니다. 권한 부여를 요청합니다.',
    createdAt: '2026-07-15 09:15',
    type: '권한',
    priority: '보통',
    department: '생산기술팀',
    updatedAt: '2026-07-16 08:00',
    status: '완료',
    reply: {
      inquiryId: 'INQ-003',
      content: '생산기술팀 권한 그룹에 포함 처리 완료했습니다. 재로그인 후 확인해 주세요.',
      assignee: '관리자 최유진',
      replyStatus: '완료',
      repliedAt: '2026-07-16 08:00',
      internalMemo: '권한 그룹 TECH_PROD 추가',
      priority: '보통',
      adminConfirmed: true,
    },
  },
  {
    id: 'INQ-004',
    authorName: '정하늘',
    email: 'haneul.jung@example.com',
    phone: '010-4567-8901',
    title: 'C라인 센서 데이터 지연 현상',
    content: 'C라인 온도 센서 데이터가 약 5분 지연되어 표시됩니다. 원인 파악이 필요합니다.',
    createdAt: '2026-07-14 18:05',
    type: '설비/데이터',
    attachments: ['지연로그.txt'],
    priority: '높음',
    department: '설비보전팀',
    updatedAt: '2026-07-14 18:05',
    status: '대기',
  },
  {
    id: 'INQ-005',
    authorName: '오수진',
    email: 'sujin.oh@example.com',
    phone: '010-5678-9012',
    title: '보고서 엑셀 다운로드 실패',
    content: '주간 품질 보고서 엑셀 다운로드 시 500 오류가 발생합니다.',
    createdAt: '2026-07-14 11:22',
    type: '시스템',
    priority: '낮음',
    department: 'IT지원팀',
    updatedAt: '2026-07-15 09:30',
    status: '진행중',
  },
  {
    id: 'INQ-006',
    authorName: '한도윤',
    email: 'doyoon.han@example.com',
    phone: '010-6789-0123',
    title: '모바일 화면 레이아웃 깨짐',
    content: '태블릿에서 문의 페이지 테이블이 가로로 넘칩니다. 반응형 수정 요청드립니다.',
    createdAt: '2026-07-13 13:50',
    type: 'UI/UX',
    priority: '보통',
    department: '프론트엔드',
    updatedAt: '2026-07-13 13:50',
    status: '대기',
  },
  {
    id: 'INQ-007',
    authorName: '윤채원',
    email: 'chaewon.yoon@example.com',
    phone: '010-7890-1234',
    title: '알림 임계값 기본값 변경 요청',
    content: '불량률 알림 기본 임계값을 3%에서 2.5%로 변경하고 싶습니다.',
    createdAt: '2026-07-12 16:00',
    type: '설정',
    priority: '낮음',
    department: '품질관리팀',
    updatedAt: '2026-07-13 10:15',
    status: '완료',
    reply: {
      inquiryId: 'INQ-007',
      content: '관리자 화면에서 임계값 수정 가능하도록 안내드렸습니다. 즉시 반영됩니다.',
      assignee: '관리자 김도현',
      replyStatus: '완료',
      repliedAt: '2026-07-13 10:15',
      internalMemo: '사용자 교육 완료',
      priority: '낮음',
      adminConfirmed: true,
    },
  },
]

const DEFECT_RECORDS: DefectRecord[] = [
  { lineId: 'LINE-A', lineName: 'A라인', defectRate: 4.2, baseDate: '2026-07-14', defectCount: 42, totalCount: 1000, causeCategory: '표면결함', department: '품질관리팀', prevDefectRate: 2.1 },
  { lineId: 'LINE-A', lineName: 'A라인', defectRate: 3.8, baseDate: '2026-07-15', defectCount: 38, totalCount: 1000, causeCategory: '표면결함', department: '품질관리팀', prevDefectRate: 4.2 },
  { lineId: 'LINE-A', lineName: 'A라인', defectRate: 4.5, baseDate: '2026-07-16', defectCount: 45, totalCount: 1000, causeCategory: '치수불량', department: '품질관리팀', prevDefectRate: 3.8 },
  { lineId: 'LINE-B', lineName: 'B라인', defectRate: 1.8, baseDate: '2026-07-14', defectCount: 18, totalCount: 1000, causeCategory: '이물질', department: '생산1팀', prevDefectRate: 1.5 },
  { lineId: 'LINE-B', lineName: 'B라인', defectRate: 2.0, baseDate: '2026-07-15', defectCount: 20, totalCount: 1000, causeCategory: '이물질', department: '생산1팀', prevDefectRate: 1.8 },
  { lineId: 'LINE-B', lineName: 'B라인', defectRate: 1.6, baseDate: '2026-07-16', defectCount: 16, totalCount: 1000, causeCategory: '이물질', department: '생산1팀', prevDefectRate: 2.0 },
  { lineId: 'LINE-C', lineName: 'C라인', defectRate: 3.5, baseDate: '2026-07-14', defectCount: 35, totalCount: 1000, causeCategory: '온도편차', department: '생산2팀', prevDefectRate: 2.9 },
  { lineId: 'LINE-C', lineName: 'C라인', defectRate: 3.9, baseDate: '2026-07-15', defectCount: 39, totalCount: 1000, causeCategory: '온도편차', department: '생산2팀', prevDefectRate: 3.5 },
  { lineId: 'LINE-C', lineName: 'C라인', defectRate: 4.1, baseDate: '2026-07-16', defectCount: 41, totalCount: 1000, causeCategory: '온도편차', department: '생산2팀', prevDefectRate: 3.9 },
  { lineId: 'LINE-D', lineName: 'D라인', defectRate: 3.2, baseDate: '2026-07-14', defectCount: 32, totalCount: 1000, causeCategory: '원료편차', department: '생산3팀', prevDefectRate: 2.4 },
  { lineId: 'LINE-D', lineName: 'D라인', defectRate: 2.1, baseDate: '2026-07-15', defectCount: 21, totalCount: 1000, causeCategory: '원료편차', department: '생산3팀', prevDefectRate: 3.2 },
  { lineId: 'LINE-D', lineName: 'D라인', defectRate: 3.4, baseDate: '2026-07-16', defectCount: 34, totalCount: 1000, causeCategory: '원료편차', department: '생산3팀', prevDefectRate: 2.1 },
  { lineId: 'LINE-E', lineName: 'E라인', defectRate: 0.9, baseDate: '2026-07-14', defectCount: 9, totalCount: 1000, causeCategory: '기타', department: '생산1팀', prevDefectRate: 1.1 },
  { lineId: 'LINE-E', lineName: 'E라인', defectRate: 1.2, baseDate: '2026-07-15', defectCount: 12, totalCount: 1000, causeCategory: '기타', department: '생산1팀', prevDefectRate: 0.9 },
  { lineId: 'LINE-E', lineName: 'E라인', defectRate: 1.0, baseDate: '2026-07-16', defectCount: 10, totalCount: 1000, causeCategory: '기타', department: '생산1팀', prevDefectRate: 1.2 },
]

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

function formatNow() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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
  const [mails, setMails] = useState<MailItem[]>(INITIAL_MAILS)
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null)
  const [inquiries, setInquiries] = useState<InquiryItem[]>(INITIAL_INQUIRIES)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('전체')
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null)
  const [replyForm, setReplyForm] = useState<ReplyFormState>(EMPTY_REPLY_FORM)
  const [threshold, setThreshold] = useState(3)
  const [n8nEnabled, setN8nEnabled] = useState(true)

  const selectedMail = mails.find((m) => m.id === selectedMailId) ?? null
  const selectedInquiry = inquiries.find((i) => i.id === selectedInquiryId) ?? null
  const filteredInquiries =
    statusFilter === '전체' ? inquiries : inquiries.filter((i) => i.status === statusFilter)
  const alertLines = getAlertLines(DEFECT_RECORDS, threshold)

  const handleSelectMail = (id: string) => {
    setSelectedMailId(id)
    setMails((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)))
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

  const handleSubmitReply = () => {
    if (!selectedInquiryId || !replyForm.content.trim() || !replyForm.assignee.trim()) return
    const now = formatNow()
    const reply: InquiryReply = {
      inquiryId: selectedInquiryId,
      content: replyForm.content.trim(),
      assignee: replyForm.assignee.trim(),
      replyStatus: '완료',
      repliedAt: now,
      internalMemo: replyForm.internalMemo.trim() || undefined,
      priority: replyForm.priority,
      adminConfirmed: replyForm.adminConfirmed,
    }
    setInquiries((prev) =>
      prev.map((item) =>
        item.id === selectedInquiryId ? { ...item, status: '완료', updatedAt: now, reply } : item,
      ),
    )
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
                  <p className="text-sm text-gray-500 mt-1">수신 메일을 선택하면 상세를 확인하고 읽음 처리됩니다.</p>
                </div>
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
                            onClick={() => handleSelectMail(mail.id)}
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
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden shrink-0 max-h-[42%]">
                  <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">문의 내역 조회 (MEMO02_INQUIRY_VIEW01)</h2>
                      <p className="text-sm text-gray-500">행을 선택하면 상세와 답변 패널이 연동됩니다.</p>
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
                          onClick={handleSubmitReply}
                          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-sm hover:bg-blue-700 transition"
                        >
                          답변 등록
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'defect' && (
              <div className="h-full flex flex-col gap-4 overflow-y-auto pr-1">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 shrink-0">
                  <h2 className="text-lg font-bold text-gray-800">
                    생산라인 불량률 모니터링 및 알림 설정 (MEM03_DEFECT_ALERT01)
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">최근 3일 연속 임계값 초과 라인만 알림 대상으로 표시합니다.</p>
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
                        onClick={() => setN8nEnabled((v) => !v)}
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
                    {DEFECT_RECORDS.length === 0 ? (
                      <p className="p-6 text-sm text-gray-400">표시할 데이터가 없습니다.</p>
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
                          {DEFECT_RECORDS.map((row) => {
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
