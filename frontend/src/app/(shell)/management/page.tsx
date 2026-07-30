'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { AlertCircle } from 'lucide-react'
import { useUiSettings } from '@/components/layout/AppShell'
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent'

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
  /** 보낸 메일용 수신자 (선택 필드) */
  to?: string
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

const INQUIRY_STORAGE_KEY = 'inquiry_records_db'

type StoredInquiryRecord = {
  id: string
  category: string
  title: string
  author: string
  date: string
  status: '접수' | '답변완료'
  content: string
  answer: string
  visibility: '공개' | '비공개'
  answeredAt?: string
}

function readInquiryRecords(): StoredInquiryRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(INQUIRY_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const result: StoredInquiryRecord[] = []
    const seen = new Set<string>()
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      if (typeof row.id !== 'string' || !row.id) continue
      if (seen.has(row.id)) continue
      seen.add(row.id)
      result.push({
        id: row.id,
        category: typeof row.category === 'string' ? row.category : '',
        title: typeof row.title === 'string' ? row.title : '',
        author: typeof row.author === 'string' ? row.author : '',
        date: typeof row.date === 'string' ? row.date : '',
        status: row.status === '답변완료' ? '답변완료' : '접수',
        content: typeof row.content === 'string' ? row.content : '',
        answer: typeof row.answer === 'string' ? row.answer : '',
        visibility: row.visibility === '비공개' ? '비공개' : '공개',
        ...(typeof row.answeredAt === 'string' && row.answeredAt
          ? { answeredAt: row.answeredAt }
          : {}),
      })
    }
    return result
  } catch {
    return []
  }
}

function writeInquiryRecords(records: StoredInquiryRecord[]): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(INQUIRY_STORAGE_KEY, JSON.stringify(records))
    return true
  } catch {
    return false
  }
}

function updateStoredInquiryAnswer(
  inquiryId: string,
  answer: string,
  answeredAt: string,
): boolean {
  const current = readInquiryRecords()
  const index = current.findIndex((item) => item.id === inquiryId)
  if (index < 0) return false
  const next = [...current]
  next[index] = {
    ...next[index],
    answer,
    answeredAt,
    status: '답변완료',
  }
  return writeInquiryRecords(next)
}

function mapStoredInquiryToManagement(item: StoredInquiryRecord): InquiryItem {
  const hasAnswer = item.answer.trim().length > 0 || item.status === '답변완료'
  return {
    id: item.id,
    authorName: item.author,
    email: '',
    phone: '',
    title: item.title,
    content: item.content,
    createdAt: item.date,
    type: item.category,
    priority: '보통',
    updatedAt: item.answeredAt || item.date,
    status: hasAnswer ? '완료' : '대기',
    reply: hasAnswer
      ? {
          inquiryId: item.id,
          content: item.answer,
          assignee: '',
          replyStatus: '완료',
          ...(item.answeredAt ? { repliedAt: item.answeredAt } : {}),
        }
      : undefined,
  }
}

function mergeManagementInquiries(
  current: InquiryItem[],
  stored: StoredInquiryRecord[],
): InquiryItem[] {
  const staticIds = new Set(INITIAL_INQUIRIES.map((item) => item.id))
  const staticById = new Map<string, InquiryItem>()
  for (const item of INITIAL_INQUIRIES) staticById.set(item.id, item)
  for (const item of current) {
    if (staticIds.has(item.id)) staticById.set(item.id, item)
  }

  const mappedStored = stored
    .filter((item) => !staticIds.has(item.id))
    .map(mapStoredInquiryToManagement)

  return [...mappedStored, ...Array.from(staticById.values())]
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

function badgeStatus(v?: InquiryStatus, isDark = false) {
  if (v === '대기') {
    return isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600'
  }
  if (v === '진행중') {
    return isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-600'
  }
  return isDark ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-600'
}

function badgePriority(v?: InquiryPriority | string, isDark = false) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs whitespace-nowrap border font-bold'
  if (v === '높음') {
    return isDark
      ? `${base} bg-rose-950/50 text-rose-300 border-rose-800`
      : `${base} bg-rose-50 text-rose-700 border-rose-200`
  }
  if (v === '보통') {
    return isDark
      ? `${base} bg-amber-950/40 text-amber-300 border-amber-800`
      : `${base} bg-amber-50 text-amber-700 border-amber-200`
  }
  if (v === '낮음') {
    return isDark
      ? `${base} bg-slate-700 text-slate-300 border-slate-600 font-medium`
      : `${base} bg-slate-100 text-slate-600 border-slate-200 font-medium`
  }
  return isDark
    ? `${base} bg-slate-700 text-slate-300 border-slate-600 font-medium`
    : `${base} bg-slate-100 text-slate-600 border-slate-200 font-medium`
}

function formatNow() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const SYSTEM_MAIL_LIST_KEY = 'system_mail_list'
const DEFAULT_OUTGOING_SENDER = 'admin@posco.com'

type ComposeMailForm = {
  to: string
  cc: string
  subject: string
  body: string
  attachmentNames: string[]
}

const EMPTY_COMPOSE_FORM: ComposeMailForm = {
  to: '',
  cc: '',
  subject: '',
  body: '',
  attachmentNames: [],
}

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function parseEmailList(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function normalizeStoredMail(raw: unknown): MailItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || !row.id.trim()) return null
  if (typeof row.sender !== 'string' || !row.sender.trim()) return null
  if (typeof row.subject !== 'string') return null
  if (typeof row.body !== 'string') return null
  if (typeof row.receivedAt !== 'string' || !row.receivedAt.trim()) return null

  const cc = Array.isArray(row.cc)
    ? row.cc.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : undefined
  const attachments = Array.isArray(row.attachments)
    ? row.attachments.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : undefined
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : undefined
  const importance =
    row.importance === '높음' || row.importance === '보통' || row.importance === '낮음'
      ? row.importance
      : undefined

  return {
    id: row.id.trim(),
    sender: row.sender.trim(),
    subject: row.subject,
    body: row.body,
    receivedAt: row.receivedAt.trim(),
    ...(cc && cc.length > 0 ? { cc } : {}),
    ...(typeof row.hasAttachment === 'boolean'
      ? { hasAttachment: row.hasAttachment }
      : attachments && attachments.length > 0
        ? { hasAttachment: true }
        : { hasAttachment: false }),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    ...(importance ? { importance } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    isRead: typeof row.isRead === 'boolean' ? row.isRead : true,
    ...(typeof row.to === 'string' && row.to.trim() ? { to: row.to.trim() } : {}),
  }
}

function readStoredMails(): MailItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SYSTEM_MAIL_LIST_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const result: MailItem[] = []
    const seen = new Set<string>()
    for (const item of parsed) {
      const mail = normalizeStoredMail(item)
      if (!mail) continue
      if (seen.has(mail.id)) continue
      seen.add(mail.id)
      result.push(mail)
    }
    return result
  } catch {
    return []
  }
}

function writeStoredMails(mails: MailItem[]): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(SYSTEM_MAIL_LIST_KEY, JSON.stringify(mails))
    return true
  } catch {
    return false
  }
}

function mergeMailLists(stored: MailItem[], staticMails: MailItem[]): MailItem[] {
  const staticIds = new Set(staticMails.map((mail) => mail.id))
  const seen = new Set<string>()
  const uniqueStored: MailItem[] = []
  for (const mail of stored) {
    if (staticIds.has(mail.id) || seen.has(mail.id)) continue
    seen.add(mail.id)
    uniqueStored.push(mail)
  }
  return [...uniqueStored, ...staticMails]
}

function createNextOutgoingMailId(existingIds: Iterable<string>): string {
  const idSet = new Set(existingIds)
  let max = 0
  for (const id of idSet) {
    const matched = /^MAIL-OUT-(\d+)$/.exec(id)
    if (matched) {
      const n = Number(matched[1])
      if (Number.isFinite(n)) max = Math.max(max, n)
    }
  }
  let next = max + 1
  let candidate = `MAIL-OUT-${String(next).padStart(3, '0')}`
  while (idSet.has(candidate)) {
    next += 1
    candidate = `MAIL-OUT-${String(next).padStart(3, '0')}`
  }
  return candidate
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

const TABS: { id: TabId; labelKo: string; labelEn: string }[] = [
  { id: 'mail', labelKo: '메일 관리', labelEn: 'Mail' },
  { id: 'inquiry', labelKo: '문의/답변 관리', labelEn: 'Inquiry / Replies' },
  { id: 'defect', labelKo: '불량률 모니터링', labelEn: 'Defect Monitoring' },
]

export default function ManagementPage() {
  const { isDark, language, copy } = useUiSettings()
  const [activeTab, setActiveTab] = useState<TabId>('mail')
  const [mails, setMails] = useState<MailItem[]>(INITIAL_MAILS)
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null)
  const [mailReplyDraft, setMailReplyDraft] = useState('')
  const [mailReplyError, setMailReplyError] = useState('')
  const [isSendingMailReply, setIsSendingMailReply] = useState(false)
  const [sentMailReplies, setSentMailReplies] = useState<
    Record<string, { content: string; sentAt: string }>
  >({})
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [composeForm, setComposeForm] = useState<ComposeMailForm>(EMPTY_COMPOSE_FORM)
  const [composeError, setComposeError] = useState('')
  const [isSendingCompose, setIsSendingCompose] = useState(false)
  const [inquiries, setInquiries] = useState<InquiryItem[]>(INITIAL_INQUIRIES)
  const [storedInquiryIds, setStoredInquiryIds] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('전체')
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null)
  const [replyForm, setReplyForm] = useState<ReplyFormState>(EMPTY_REPLY_FORM)
  const [threshold, setThreshold] = useState(3)
  const [n8nEnabled, setN8nEnabled] = useState(true)
  const [toastMessage, setToastMessage] = useState('')
  const [isSubmittingReply, setIsSubmittingReply] = useState(false)
  const toastTimerRef = useRef<number | null>(null)

  const controlClass = isDark
    ? 'h-10 w-full rounded-xl border border-slate-600 bg-slate-900/60 px-3 text-sm text-slate-100 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30'
    : 'h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30'

  const panelClass = isDark
    ? 'rounded-2xl border border-slate-700 bg-slate-800 shadow-sm'
    : 'rounded-2xl border border-slate-200 bg-white shadow-sm'

  const headingClass = isDark ? 'text-slate-100' : 'text-slate-800'
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-500'
  const softBorder = isDark ? 'border-slate-700' : 'border-slate-100'
  const theadClass = isDark
    ? 'sticky top-0 bg-slate-900/90 text-xs text-slate-400'
    : 'sticky top-0 bg-slate-50 text-xs text-slate-500'
  const bodyTextareaClass = isDark
    ? 'min-h-[120px] w-full resize-y rounded-xl border border-slate-600 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30'
    : 'min-h-[120px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30'
  const innerCardClass = isDark
    ? 'rounded-xl border border-slate-700 bg-slate-900/50'
    : 'rounded-xl border border-slate-200 bg-white'
  const softBoxClass = isDark
    ? 'rounded-xl border border-slate-700 bg-slate-900/50'
    : 'rounded-xl border border-slate-100 bg-slate-50'

  const selectedMail = mails.find((m) => m.id === selectedMailId) ?? null
  const selectedMailReply = selectedMailId ? sentMailReplies[selectedMailId] ?? null : null
  const selectedInquiry = inquiries.find((i) => i.id === selectedInquiryId) ?? null
  const filteredInquiries =
    statusFilter === '전체' ? inquiries : inquiries.filter((i) => i.status === statusFilter)
  const alertLines = getAlertLines(DEFECT_RECORDS, threshold)
  const storedInquiryIdSet = new Set(storedInquiryIds)

  const clearToastTimer = () => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
  }

  const showSuccessToast = (message: string) => {
    clearToastTimer()
    setToastMessage(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('')
      toastTimerRef.current = null
    }, 2500)
  }

  const refreshStoredInquiries = () => {
    const stored = readInquiryRecords()
    setStoredInquiryIds(stored.map((item) => item.id))
    setInquiries((prev) => mergeManagementInquiries(prev, stored))
  }

  useEffect(() => {
    return () => clearToastTimer()
  }, [])

  useEffect(() => {
    const stored = readStoredMails()
    setMails(mergeMailLists(stored, INITIAL_MAILS))
  }, [])

  useEffect(() => {
    if (!isComposeOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSendingCompose) {
        setIsComposeOpen(false)
        setComposeError('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isComposeOpen, isSendingCompose])

  useEffect(() => {
    if (activeTab === 'inquiry') {
      refreshStoredInquiries()
    }
  }, [activeTab])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== INQUIRY_STORAGE_KEY) return
      if (activeTab === 'inquiry') refreshStoredInquiries()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [activeTab])

  const handleSelectMail = (id: string) => {
    setSelectedMailId(id)
    setMails((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)))
    setMailReplyDraft('')
    setMailReplyError('')
  }

  const openComposeModal = () => {
    setComposeForm(EMPTY_COMPOSE_FORM)
    setComposeError('')
    setIsComposeOpen(true)
  }

  const closeComposeModal = () => {
    if (isSendingCompose) return
    setIsComposeOpen(false)
    setComposeError('')
  }

  const handleComposeAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) {
      setComposeForm((prev) => ({ ...prev, attachmentNames: [] }))
      return
    }
    const names = Array.from(files).map((file) => file.name).filter(Boolean)
    setComposeForm((prev) => ({ ...prev, attachmentNames: names }))
  }

  const handleSendComposeMail = () => {
    if (isSendingCompose) return

    const to = composeForm.to.trim()
    const subject = composeForm.subject.trim()
    const body = composeForm.body.trim()
    const ccList = parseEmailList(composeForm.cc)

    if (!to || !subject || !body) {
      setComposeError('수신자, 제목, 본문은 필수 입력 항목입니다.')
      return
    }
    if (!isValidEmailAddress(to)) {
      setComposeError('수신자 이메일 형식이 올바르지 않습니다.')
      return
    }
    if (ccList.some((email) => !isValidEmailAddress(email))) {
      setComposeError('참조(CC) 이메일 형식이 올바르지 않습니다.')
      return
    }

    setIsSendingCompose(true)
    try {
      const stored = readStoredMails()
      const existingIds = [
        ...stored.map((mail) => mail.id),
        ...mails.map((mail) => mail.id),
        ...INITIAL_MAILS.map((mail) => mail.id),
      ]
      const id = createNextOutgoingMailId(existingIds)
      if (stored.some((mail) => mail.id === id) || mails.some((mail) => mail.id === id)) {
        setComposeError('메일 ID 생성에 실패했습니다. 다시 시도해 주세요.')
        return
      }

      const attachmentNames = composeForm.attachmentNames.filter(Boolean)
      const newMail: MailItem = {
        id,
        sender: DEFAULT_OUTGOING_SENDER,
        to,
        subject,
        body,
        receivedAt: formatNow(),
        ...(ccList.length > 0 ? { cc: ccList } : {}),
        hasAttachment: attachmentNames.length > 0,
        ...(attachmentNames.length > 0 ? { attachments: attachmentNames } : {}),
        importance: '보통',
        tags: ['보낸메일'],
        isRead: true,
      }

      const nextStored = [newMail, ...stored.filter((mail) => mail.id !== id)]
      const saved = writeStoredMails(nextStored)
      if (!saved) {
        setComposeError('메일 저장에 실패했습니다. 브라우저 저장소 권한을 확인해 주세요.')
        return
      }

      setMails(mergeMailLists(nextStored, INITIAL_MAILS))
      setSelectedMailId(id)
      setMailReplyDraft('')
      setMailReplyError('')
      setComposeForm(EMPTY_COMPOSE_FORM)
      setComposeError('')
      setIsComposeOpen(false)
      showSuccessToast('✓ 메일이 성공적으로 발송되었습니다.')
    } finally {
      setIsSendingCompose(false)
    }
  }

  const handleSendMailReply = () => {
    if (isSendingMailReply || !selectedMail) return
    const content = mailReplyDraft.trim()
    if (!content) {
      setMailReplyError('답장 내용을 입력해주세요.')
      return
    }
    setIsSendingMailReply(true)
    try {
      setSentMailReplies((prev) => ({
        ...prev,
        [selectedMail.id]: { content, sentAt: formatNow() },
      }))
      setMailReplyDraft('')
      setMailReplyError('')
      showSuccessToast('✓ 답장이 전송되었습니다.')
    } finally {
      setIsSendingMailReply(false)
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

  const handleSubmitReply = () => {
    if (isSubmittingReply) return
    if (!selectedInquiryId || !replyForm.content.trim() || !replyForm.assignee.trim()) return

    setIsSubmittingReply(true)
    try {
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
      const isStoredInquiry = storedInquiryIdSet.has(selectedInquiryId)

      if (isStoredInquiry) {
        const saved = updateStoredInquiryAnswer(
          selectedInquiryId,
          reply.content,
          now,
        )
        if (!saved) return
        setInquiries((prev) =>
          prev.map((item) =>
            item.id === selectedInquiryId
              ? { ...item, status: '완료', updatedAt: now, reply }
              : item,
          ),
        )
        showSuccessToast('✓ 문의 답변이 저장 및 전송되었습니다.')
        return
      }

      setInquiries((prev) =>
        prev.map((item) =>
          item.id === selectedInquiryId ? { ...item, status: '완료', updatedAt: now, reply } : item,
        ),
      )
      showSuccessToast('✓ 문의 답변이 성공적으로 등록되었습니다.')
    } finally {
      setIsSubmittingReply(false)
    }
  }

  return (
    <div
      className={`relative flex h-full w-full flex-col gap-4 overflow-hidden py-6 ${SHELL_CONTENT_CLASS} ${
        isDark
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100'
          : 'bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 text-slate-800'
      }`}
    >
      {toastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-[120] max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-lg"
        >
          {toastMessage}
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p
            className={`text-sm font-bold tracking-wide ${
              isDark ? 'text-blue-400' : 'text-blue-600'
            }`}
          >
            Admin Operations
          </p>
          <h1
            className={`mt-1 text-3xl font-bold tracking-tight ${
              isDark ? 'text-slate-100' : 'text-gray-900'
            }`}
          >
            {copy.menus['/management']}
          </h1>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            {language === 'en'
              ? 'Mail · Inquiry / Replies · Defect Monitoring'
              : '메일 · 문의/답변 · 불량률 모니터링'}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="관리 섹션"
          className={`flex max-w-full flex-wrap gap-1 rounded-xl p-1 ${
            isDark ? 'bg-slate-900' : 'bg-slate-100/80'
          }`}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? isDark
                      ? 'bg-slate-800 font-bold text-blue-400 shadow-sm ring-1 ring-slate-600'
                      : 'bg-white font-bold text-blue-600 shadow-sm'
                    : isDark
                      ? 'font-medium text-slate-400 hover:bg-slate-700/60 hover:text-slate-100'
                      : 'font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900'
                }`}
              >
                {language === 'en' ? tab.labelEn : tab.labelKo}
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'mail' && (
          <div
            role="tabpanel"
            id="panel-mail"
            aria-labelledby="tab-mail"
            className={`flex h-full flex-col overflow-hidden ${panelClass}`}
          >
            <div className={`shrink-0 border-b px-5 py-4 ${softBorder}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className={`text-lg font-bold ${headingClass}`}>메일 조회 및 확인</h2>
                  <p className={`mt-1 text-sm ${mutedClass}`}>
                    수신 메일을 선택하면 상세를 확인하고 읽음 처리됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openComposeModal}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                  + 메일 작성
                </button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-5">
              <div
                className={`overflow-y-auto border-b lg:col-span-2 lg:border-b-0 lg:border-r ${softBorder}`}
              >
                {mails.length === 0 ? (
                  <p className={`p-6 text-sm ${mutedClass}`}>표시할 메일이 없습니다.</p>
                ) : (
                  mails.map((mail) => {
                    const selected = mail.id === selectedMailId
                    const unread = mail.isRead === false
                    return (
                      <button
                        key={mail.id}
                        type="button"
                        onClick={() => handleSelectMail(mail.id)}
                        className={`w-full cursor-pointer border-b px-4 py-3 text-left transition-colors ${
                          isDark ? 'border-slate-700/80' : 'border-slate-50'
                        } ${
                          selected
                            ? isDark
                              ? 'border-l-4 border-l-blue-500 bg-blue-950/40 hover:bg-blue-950/40'
                              : 'border-l-4 border-l-blue-600 bg-blue-50/80 hover:bg-blue-50/80'
                            : unread
                              ? isDark
                                ? 'border-l-4 border-l-transparent bg-blue-950/20 hover:bg-slate-700/50'
                                : 'border-l-4 border-l-transparent bg-blue-50/30 hover:bg-slate-50/80'
                              : isDark
                                ? 'border-l-4 border-l-transparent hover:bg-slate-700/50'
                                : 'border-l-4 border-l-transparent hover:bg-slate-50/80'
                        }`}
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          {mail.hasAttachment && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              첨부
                            </span>
                          )}
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
                              unread
                                ? isDark
                                  ? 'border-blue-800 bg-blue-950/50 text-blue-300'
                                  : 'border-blue-200 bg-blue-50 text-blue-700'
                                : isDark
                                  ? 'border-slate-600 bg-slate-700 text-slate-400'
                                  : 'border-slate-200 bg-slate-100 text-slate-500'
                            }`}
                          >
                            {unread ? '안읽음' : '읽음'}
                          </span>
                          {unread && !selected ? (
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full bg-blue-600"
                              aria-hidden
                            />
                          ) : null}
                        </div>
                        <p
                          className={`truncate text-sm ${
                            unread
                              ? isDark
                                ? 'font-bold text-slate-100'
                                : 'font-bold text-slate-900'
                              : isDark
                                ? 'font-medium text-slate-300'
                                : 'font-medium text-slate-700'
                          }`}
                        >
                          {mail.subject}
                        </p>
                        <p className={`mt-1 truncate text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {mail.to ? `To: ${mail.to}` : mail.sender} · {mail.receivedAt}
                        </p>
                      </button>
                    )
                  })
                )}
              </div>
              <div className="overflow-y-auto p-5 lg:col-span-3">
                {mails.length === 0 ? null : !selectedMail ? (
                  <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-4 text-center">
                    <div
                      className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full text-lg ${
                        isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-400'
                      }`}
                      aria-hidden
                    >
                      ✉
                    </div>
                    <h3 className={`m-0 text-base font-bold ${headingClass}`}>선택된 메일이 없습니다</h3>
                    <p className={`mt-2 max-w-sm text-sm ${mutedClass}`}>
                      좌측 목록에서 상세 내용을 확인할 메일을 선택하세요.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedMail.tags && selectedMail.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {selectedMail.tags.map((t) => (
                          <span
                            key={t}
                            className={`rounded-full px-3 py-1 text-xs ${
                              isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                    <h3 className={`text-xl font-bold ${headingClass}`}>{selectedMail.subject}</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>메일ID</p>
                        <p className="font-medium">{selectedMail.id}</p>
                      </div>
                      <div>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {selectedMail.to ? '발송일시' : '수신일시'}
                        </p>
                        <p className="font-medium">{selectedMail.receivedAt}</p>
                      </div>
                      <div>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>발신자</p>
                        <p className="font-medium">{selectedMail.sender}</p>
                      </div>
                      {selectedMail.to ? (
                        <div>
                          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>수신자</p>
                          <p className="font-medium">{selectedMail.to}</p>
                        </div>
                      ) : null}
                      <div>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>참조(CC)</p>
                        <p className="font-medium">{selectedMail.cc?.join(', ') || '-'}</p>
                      </div>
                    </div>
                    <div
                      className={`${softBoxClass} p-4 text-sm leading-relaxed whitespace-pre-wrap ${
                        isDark ? 'text-slate-300' : 'text-slate-700'
                      }`}
                    >
                      {selectedMail.body}
                    </div>
                    <div>
                      <p className={`mb-2 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        첨부파일
                      </p>
                      {selectedMail.attachments?.length ? (
                        <div className="flex flex-col gap-2">
                          {selectedMail.attachments.map((f) => (
                            <div key={f} className={`${innerCardClass} px-3 py-2 text-sm`}>
                              {f}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          첨부파일 없음
                        </p>
                      )}
                    </div>

                    <div className={`${innerCardClass} p-4`}>
                      <h4 className={`m-0 text-sm font-bold ${headingClass}`}>답장 작성</h4>
                      {selectedMailReply ? (
                        <div
                          className={`mt-3 rounded-xl border p-3.5 ${
                            isDark
                              ? 'border-emerald-800/60 bg-emerald-950/40'
                              : 'border-emerald-200 bg-emerald-50/80'
                          }`}
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                                isDark
                                  ? 'border-emerald-800 bg-emerald-900/50 text-emerald-300'
                                  : 'border-emerald-200 bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              전송됨
                            </span>
                            <span
                              className={`text-[11px] font-medium ${
                                isDark ? 'text-emerald-300' : 'text-emerald-700'
                              }`}
                            >
                              {selectedMailReply.sentAt}
                            </span>
                          </div>
                          <p
                            className={`m-0 whitespace-pre-wrap text-sm leading-relaxed ${
                              isDark ? 'text-slate-200' : 'text-slate-800'
                            }`}
                          >
                            {selectedMailReply.content}
                          </p>
                        </div>
                      ) : null}
                      <label htmlFor="mail-reply-content" className="sr-only">
                        답장 내용
                      </label>
                      <textarea
                        id="mail-reply-content"
                        value={mailReplyDraft}
                        onChange={(event) => {
                          setMailReplyDraft(event.target.value)
                          if (mailReplyError) setMailReplyError('')
                        }}
                        rows={5}
                        placeholder={
                          selectedMailReply
                            ? '추가 답장을 작성하려면 내용을 입력하세요.'
                            : '답장 내용을 입력하세요.'
                        }
                        className={`mt-3 ${bodyTextareaClass}`}
                      />
                      {mailReplyError ? (
                        <p className="mt-2 text-xs font-semibold text-rose-600" role="alert">
                          {mailReplyError}
                        </p>
                      ) : null}
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={handleSendMailReply}
                          disabled={isSendingMailReply}
                          className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSendingMailReply ? '전송 중...' : '답장 전송'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'inquiry' && (
          <div
            role="tabpanel"
            id="panel-inquiry"
            aria-labelledby="tab-inquiry"
            className="flex h-full flex-col gap-4 overflow-hidden"
          >
            <div className={`flex max-h-[42%] shrink-0 flex-col overflow-hidden ${panelClass}`}>
              <div
                className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 ${softBorder}`}
              >
                <div>
                  <h2 className={`text-lg font-bold ${headingClass}`}>문의 내역 조회</h2>
                  <p className={`text-sm ${mutedClass}`}>
                    행을 선택하면 상세와 답변 패널이 연동됩니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['전체', '대기', '진행중', '완료'] as StatusFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setStatusFilter(f)}
                      className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                        statusFilter === f
                          ? 'bg-blue-600 text-white'
                          : isDark
                            ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className={theadClass}>
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
                        <td
                          colSpan={6}
                          className={`px-4 py-8 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                        >
                          해당 조건의 문의가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredInquiries.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() => handleSelectInquiry(item.id)}
                          className={`cursor-pointer border-t transition-colors ${
                            isDark ? 'border-slate-700' : 'border-slate-50'
                          } ${
                            item.id === selectedInquiryId
                              ? isDark
                                ? 'bg-blue-950/40 hover:bg-blue-950/40'
                                : 'bg-blue-50/80 hover:bg-blue-50/80'
                              : isDark
                                ? 'hover:bg-slate-700/50'
                                : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td
                            className={`px-4 py-2.5 font-mono text-xs ${
                              isDark ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            {item.id}
                          </td>
                          <td
                            className={`max-w-[220px] px-4 py-2.5 font-medium ${
                              isDark ? 'text-slate-100' : 'text-slate-800'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              {storedInquiryIdSet.has(item.id) ? (
                                <span
                                  className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                    isDark
                                      ? 'border-indigo-800 bg-indigo-950/50 text-indigo-300'
                                      : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                  }`}
                                >
                                  신규
                                </span>
                              ) : null}
                              <span className="truncate">{item.title}</span>
                            </div>
                          </td>
                          <td className={`px-4 py-2.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            {item.authorName}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeStatus(item.status, isDark)}`}
                            >
                              {item.status ?? '대기'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={badgePriority(item.priority, isDark)}>
                              {item.priority ?? '보통'}
                            </span>
                          </td>
                          <td
                            className={`whitespace-nowrap px-4 py-2.5 ${
                              isDark ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            {item.createdAt}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-4 overflow-auto lg:grid-cols-2 lg:overflow-hidden">
              <div className={`flex h-full flex-col overflow-hidden p-5 ${panelClass}`}>
                <h3 className={`mb-3 shrink-0 font-bold ${headingClass}`}>문의 상세</h3>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {!selectedInquiry ? (
                    <p className={`py-8 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      문의를 선택하세요.
                    </p>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>문의ID</p>
                          <p className="font-medium">{selectedInquiry.id}</p>
                        </div>
                        <div>
                          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>유형</p>
                          <p className="font-medium">{selectedInquiry.type ?? '-'}</p>
                        </div>
                        <div>
                          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>작성자</p>
                          <p className="font-medium">{selectedInquiry.authorName}</p>
                        </div>
                        <div>
                          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>연락처</p>
                          <p className="font-medium">{selectedInquiry.phone}</p>
                        </div>
                        <div className="col-span-2">
                          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>이메일</p>
                          <p className="break-all font-medium">{selectedInquiry.email}</p>
                        </div>
                        <div>
                          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>처리 부서</p>
                          <p className="font-medium">{selectedInquiry.department ?? '-'}</p>
                        </div>
                        <div>
                          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            작성일 / 수정일
                          </p>
                          <p className="font-medium">
                            {selectedInquiry.createdAt}
                            {selectedInquiry.updatedAt ? ` / ${selectedInquiry.updatedAt}` : ''}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>제목</p>
                        <p className={`font-bold ${headingClass}`}>{selectedInquiry.title}</p>
                      </div>
                      <div className={`${softBoxClass} p-3 leading-relaxed whitespace-pre-wrap`}>
                        {selectedInquiry.content}
                      </div>
                      {selectedInquiry.attachments?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedInquiry.attachments.map((f) => (
                            <span
                              key={f}
                              className={`rounded-full px-3 py-1 text-xs ${
                                isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {selectedInquiry.reply && (
                        <div
                          className={`rounded-xl border p-3 ${
                            isDark
                              ? 'border-green-800/60 bg-green-950/40'
                              : 'border-green-100 bg-green-50'
                          }`}
                        >
                          <p
                            className={`mb-1 text-xs font-bold ${
                              isDark ? 'text-green-300' : 'text-green-700'
                            }`}
                          >
                            등록된 답변
                          </p>
                          <p
                            className={`whitespace-pre-wrap text-sm ${
                              isDark ? 'text-green-200' : 'text-green-900'
                            }`}
                          >
                            {selectedInquiry.reply.content}
                          </p>
                          <p className={`mt-2 text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                            {selectedInquiry.reply.assignee} · {selectedInquiry.reply.repliedAt}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className={`flex h-full flex-col overflow-hidden p-5 ${panelClass}`}>
                <div className="shrink-0">
                  <h3 className={`font-bold ${headingClass}`}>문의 답변 관리</h3>
                  <p className={`mt-1 mb-4 text-sm ${mutedClass}`}>
                    답변 등록 시 문의 상태가 완료로 변경됩니다.
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {!selectedInquiry ? (
                    <p className={`py-8 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      문의를 선택하면 답변 폼이 표시됩니다.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        value={replyForm.content}
                        onChange={(e) => setReplyForm((p) => ({ ...p, content: e.target.value }))}
                        rows={4}
                        placeholder="답변 내용"
                        className={bodyTextareaClass}
                      />
                      <input
                        type="text"
                        value={replyForm.assignee}
                        onChange={(e) => setReplyForm((p) => ({ ...p, assignee: e.target.value }))}
                        placeholder="담당자"
                        className={controlClass}
                      />
                      <select
                        value={replyForm.priority}
                        onChange={(e) =>
                          setReplyForm((p) => ({
                            ...p,
                            priority: e.target.value as InquiryPriority,
                          }))
                        }
                        className={controlClass}
                      >
                        <option value="높음">우선순위: 높음</option>
                        <option value="보통">우선순위: 보통</option>
                        <option value="낮음">우선순위: 낮음</option>
                      </select>
                      <input
                        type="text"
                        value={replyForm.internalMemo}
                        onChange={(e) =>
                          setReplyForm((p) => ({ ...p, internalMemo: e.target.value }))
                        }
                        placeholder="내부 메모"
                        className={controlClass}
                      />
                      <label
                        className={`flex items-center gap-2 text-sm ${
                          isDark ? 'text-slate-300' : 'text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={replyForm.adminConfirmed}
                          onChange={(e) =>
                            setReplyForm((p) => ({ ...p, adminConfirmed: e.target.checked }))
                          }
                          className={`rounded ${isDark ? 'border-slate-600' : 'border-slate-300'}`}
                        />
                        관리자 확인
                      </label>
                      <button
                        type="button"
                        onClick={handleSubmitReply}
                        disabled={isSubmittingReply}
                        className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-blue-600 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSubmittingReply ? '등록 중...' : '답변 등록'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'defect' && (
          <div
            role="tabpanel"
            id="panel-defect"
            aria-labelledby="tab-defect"
            className="flex h-full flex-col gap-4 overflow-y-auto pr-1"
          >
            <div className={`shrink-0 p-5 ${panelClass}`}>
              <h2 className={`text-lg font-bold ${headingClass}`}>
                생산라인 불량률 모니터링 및 알림 설정
              </h2>
              <p className={`mt-1 text-sm ${mutedClass}`}>
                최근 3일 연속 임계값 초과 라인만 알림 대상으로 표시합니다.
              </p>
              <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <label
                    className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
                    htmlFor="defect-threshold"
                  >
                    임계값 (%)
                  </label>
                  <input
                    id="defect-threshold"
                    type="number"
                    min={0}
                    step={0.1}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value) || 0)}
                    className={
                      isDark
                        ? 'h-10 w-24 rounded-xl border border-slate-600 bg-slate-900/60 px-3 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30'
                        : 'h-10 w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30'
                    }
                  />
                </div>
                <div
                  className={`flex min-w-[260px] items-center justify-between gap-4 px-4 py-3 ${softBoxClass}`}
                >
                  <div>
                    <p className={`text-sm font-medium ${headingClass}`}>n8n 일일 모니터링</p>
                    <p className={`text-xs ${mutedClass}`}>{n8nEnabled ? '활성화' : '비활성화'}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={n8nEnabled}
                    onClick={() => setN8nEnabled((v) => !v)}
                    className={`relative h-7 w-12 rounded-full transition-colors ${
                      n8nEnabled ? 'bg-blue-600' : isDark ? 'bg-slate-600' : 'bg-slate-300'
                    }`}
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

            <div className={`shrink-0 p-5 ${panelClass}`}>
              <h3 className={`mb-3 flex items-center gap-2 text-lg font-bold ${headingClass}`}>
                <AlertCircle className="text-red-500" size={20} aria-hidden />
                알림 대상 라인
              </h3>
              {alertLines.length === 0 ? (
                <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  현재 알림 대상 라인이 없습니다.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {alertLines.map((alert) => (
                    <div
                      key={alert.lineId}
                      className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                        isDark
                          ? 'border-red-900/50 bg-red-950/30'
                          : 'border-red-100 bg-red-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className={`font-bold ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                          {alert.lineName} ({alert.lineId})
                        </span>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {alert.recent.map((r, index) => (
                            <span key={`${alert.lineId}-${r.baseDate}`} className="contents">
                              {index > 0 ? (
                                <span
                                  className={`text-xs ${isDark ? 'text-red-700' : 'text-red-300'}`}
                                  aria-hidden
                                >
                                  →
                                </span>
                              ) : null}
                              <span
                                className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-1 text-xs tabular-nums ${
                                  isDark
                                    ? 'border-slate-600 bg-slate-900/60 text-slate-300'
                                    : 'border-slate-200 bg-slate-50 text-slate-700'
                                }`}
                              >
                                {r.baseDate}: {r.defectRate}%
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${
                          isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-600'
                        }`}
                      >
                        3일 연속 초과
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`flex min-h-[280px] flex-1 flex-col overflow-hidden ${panelClass}`}>
              <div className={`border-b px-5 py-3 ${softBorder}`}>
                <h3 className={`font-bold ${headingClass}`}>전체 생산 라인 기록</h3>
              </div>
              <div className="flex-1 overflow-auto">
                {DEFECT_RECORDS.length === 0 ? (
                  <p className={`p-6 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    표시할 데이터가 없습니다.
                  </p>
                ) : (
                  <table className="min-w-full text-left text-sm">
                    <thead className={theadClass}>
                      <tr>
                        <th className="px-4 py-2.5 font-medium">라인</th>
                        <th className="px-4 py-2.5 font-medium">기준일</th>
                        <th className="px-4 py-2.5 text-right font-medium">불량률</th>
                        <th className="px-4 py-2.5 text-right font-medium">불량/총생산</th>
                        <th className="px-4 py-2.5 font-medium">원인</th>
                        <th className="px-4 py-2.5 font-medium">부서</th>
                        <th className="px-4 py-2.5 text-right font-medium">전기간</th>
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
                            className={`border-t ${
                              isDark ? 'border-slate-700' : 'border-slate-50'
                            } ${
                              over
                                ? isDark
                                  ? 'bg-red-950/30'
                                  : 'bg-red-50/70'
                                : isDark
                                  ? 'hover:bg-slate-700/40'
                                  : ''
                            }`}
                          >
                            <td
                              className={`px-4 py-2.5 font-medium ${
                                isDark ? 'text-slate-100' : 'text-slate-800'
                              }`}
                            >
                              {row.lineName}
                              <span
                                className={`ml-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                              >
                                {row.lineId}
                              </span>
                            </td>
                            <td
                              className={`px-4 py-2.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
                            >
                              {row.baseDate}
                            </td>
                            <td
                              className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums ${
                                over
                                  ? isDark
                                    ? 'text-red-400'
                                    : 'text-red-600'
                                  : isDark
                                    ? 'text-slate-100'
                                    : 'text-slate-800'
                              }`}
                            >
                              {row.defectRate}%
                            </td>
                            <td
                              className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums ${
                                isDark ? 'text-slate-300' : 'text-slate-600'
                              }`}
                            >
                              {row.defectCount}/{row.totalCount}
                            </td>
                            <td
                              className={`px-4 py-2.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
                            >
                              {row.causeCategory ?? '-'}
                            </td>
                            <td
                              className={`px-4 py-2.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
                            >
                              {row.department ?? '-'}
                            </td>
                            <td
                              className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums ${
                                isDark ? 'text-slate-300' : 'text-slate-600'
                              }`}
                            >
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

      {isComposeOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="compose-mail-title"
          className={`fixed inset-0 z-[110] flex items-end justify-center p-3 sm:items-center sm:p-6 ${
            isDark ? 'bg-slate-950/70' : 'bg-slate-950/50'
          }`}
          onClick={closeComposeModal}
        >
          <div
            className={`flex max-h-[min(92vh,840px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDark
                ? 'border-slate-700 bg-slate-800 text-slate-100'
                : 'border-slate-200 bg-white text-slate-900'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}
            >
              <h3 id="compose-mail-title" className={`m-0 text-lg font-bold ${headingClass}`}>
                새 메일 작성
              </h3>
              <button
                type="button"
                onClick={closeComposeModal}
                aria-label="닫기"
                disabled={isSendingCompose}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-xl leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50 ${
                  isDark
                    ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-100'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label htmlFor="compose-to" className={`mb-1.5 block text-sm font-semibold ${headingClass}`}>
                  받는 사람 (To) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="compose-to"
                  type="email"
                  value={composeForm.to}
                  onChange={(event) => {
                    setComposeForm((prev) => ({ ...prev, to: event.target.value }))
                    if (composeError) setComposeError('')
                  }}
                  placeholder="quality@posco.com"
                  className={controlClass}
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="compose-cc" className={`mb-1.5 block text-sm font-semibold ${headingClass}`}>
                  참조 (CC)
                </label>
                <input
                  id="compose-cc"
                  type="text"
                  value={composeForm.cc}
                  onChange={(event) => {
                    setComposeForm((prev) => ({ ...prev, cc: event.target.value }))
                    if (composeError) setComposeError('')
                  }}
                  placeholder="cc1@example.com, cc2@example.com"
                  className={controlClass}
                  autoComplete="off"
                />
              </div>

              <div>
                <label
                  htmlFor="compose-subject"
                  className={`mb-1.5 block text-sm font-semibold ${headingClass}`}
                >
                  제목 (Subject) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="compose-subject"
                  type="text"
                  value={composeForm.subject}
                  onChange={(event) => {
                    setComposeForm((prev) => ({ ...prev, subject: event.target.value }))
                    if (composeError) setComposeError('')
                  }}
                  placeholder="메일 제목을 입력하세요"
                  className={controlClass}
                  autoComplete="off"
                />
              </div>

              <div>
                <label
                  htmlFor="compose-attachments"
                  className={`mb-1.5 block text-sm font-semibold ${headingClass}`}
                >
                  첨부파일
                </label>
                <div
                  className={`rounded-xl border border-dashed px-4 py-3 ${
                    isDark ? 'border-slate-600 bg-slate-900/40' : 'border-slate-300 bg-slate-50'
                  }`}
                >
                  <input
                    id="compose-attachments"
                    type="file"
                    multiple
                    onChange={handleComposeAttachmentChange}
                    className={`block w-full text-sm ${mutedClass}`}
                  />
                  {composeForm.attachmentNames.length > 0 ? (
                    <ul className={`mt-2 space-y-1 text-xs ${mutedClass}`}>
                      {composeForm.attachmentNames.map((name) => (
                        <li key={name} className="truncate">
                          {name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={`mt-2 text-xs ${mutedClass}`}>파일명만 저장되며 실제 업로드는 수행하지 않습니다.</p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="compose-body"
                  className={`mb-1.5 block text-sm font-semibold ${headingClass}`}
                >
                  본문 (Body) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="compose-body"
                  value={composeForm.body}
                  onChange={(event) => {
                    setComposeForm((prev) => ({ ...prev, body: event.target.value }))
                    if (composeError) setComposeError('')
                  }}
                  rows={8}
                  className={bodyTextareaClass}
                  placeholder="메일 본문을 입력하세요"
                />
              </div>

              {composeError ? (
                <p className="m-0 text-sm font-semibold text-rose-500" role="alert">
                  {composeError}
                </p>
              ) : null}
            </div>

            <div
              className={`flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-5 py-4 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={closeComposeModal}
                disabled={isSendingCompose}
                className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDark
                    ? 'border-slate-600 text-slate-200 hover:bg-slate-700'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSendComposeMail}
                disabled={isSendingCompose}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSendingCompose ? '발송 중...' : '발송하기'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
