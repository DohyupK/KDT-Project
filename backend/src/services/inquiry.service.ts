import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'

const CATEGORIES = [
  '시스템 오류 제보',
  '기능 개선 제안',
  '비즈니스 협업 문의',
  '불량 검사 문의',
  '기타',
] as const

const VISIBILITIES = ['공개', '비공개'] as const
const STATUSES = ['접수', '답변완료'] as const
const ANSWER_MAX = 1000

export type InquiryCategory = (typeof CATEGORIES)[number]
export type InquiryVisibility = (typeof VISIBILITIES)[number]
export type InquiryStatus = (typeof STATUSES)[number]

interface InquiryRow {
  id: number
  inquiry_code: string
  category: string
  visibility: string
  status: string
  title: string
  content: string
  author_user_id: string | null
  author_name: string
  author_email: string
  answer: string | null
  answered_at: Date | string | null
  answered_by_user_id: string | null
  created_at: Date | string
}

export type InquiryDto = {
  id: string
  category: string
  title: string
  author: string
  date: string
  status: string
  content: string
  answer: string
  visibility: string
  answeredAt: string | null
  masked?: boolean
}

function isAdmin(userId: string | undefined): boolean {
  if (!userId) return false
  const raw = (process.env.ADMIN_USER_IDS || '').trim()
  if (!raw) return false
  const set = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  return set.has(userId)
}

function canViewFull(row: InquiryRow, viewerUserId: string | undefined): boolean {
  if (row.visibility !== '비공개') return true
  if (!viewerUserId) return false
  if (isAdmin(viewerUserId)) return true
  return row.author_user_id === viewerUserId
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateTime(value: Date | string | null): string | null {
  if (value == null) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const date = formatDate(d)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${date} ${hh}:${mm}`
}

function toDto(row: InquiryRow, viewerUserId: string | undefined): InquiryDto {
  const full = canViewFull(row, viewerUserId)
  if (!full) {
    return {
      id: row.inquiry_code,
      category: row.category,
      title: '비공개 문의',
      author: '비공개',
      date: formatDate(row.created_at),
      status: row.status,
      content: '',
      answer: '',
      visibility: row.visibility,
      answeredAt: null,
      masked: true,
    }
  }
  return {
    id: row.inquiry_code,
    category: row.category,
    title: row.title,
    author: row.author_name,
    date: formatDate(row.created_at),
    status: row.status,
    content: row.content,
    answer: row.answer ?? '',
    visibility: row.visibility,
    answeredAt: formatDateTime(row.answered_at),
    masked: false,
  }
}

async function nextInquiryCode(): Promise<string> {
  const rows = await query<{ inquiry_code: string }[]>(
    `SELECT inquiry_code FROM inquiries
     WHERE inquiry_code REGEXP '^INQ-[0-9]+$'
     ORDER BY CAST(SUBSTRING(inquiry_code, 5) AS UNSIGNED) DESC
     LIMIT 1`,
  )
  const latest = rows[0]?.inquiry_code
  let n = 1
  if (latest) {
    const parsed = Number(latest.slice(4))
    if (Number.isFinite(parsed)) n = parsed + 1
  }
  return `INQ-${String(n).padStart(3, '0')}`
}

export async function listInquiries(
  filters: {
    category?: string
    status?: string
    startDate?: string
    endDate?: string
    q?: string
    page?: number
    pageSize?: number
  },
  viewerUserId: string,
) {
  const page = Math.max(1, Number(filters.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize) || 5))
  const offset = (page - 1) * pageSize

  const where: string[] = ['1=1']
  const params: unknown[] = []

  if (filters.category && filters.category !== 'all') {
    where.push('category = ?')
    params.push(filters.category)
  }
  if (filters.status && STATUSES.includes(filters.status as InquiryStatus)) {
    where.push('status = ?')
    params.push(filters.status)
  }
  if (filters.startDate) {
    where.push('DATE(created_at) >= ?')
    params.push(filters.startDate)
  }
  if (filters.endDate) {
    where.push('DATE(created_at) <= ?')
    params.push(filters.endDate)
  }

  const q = filters.q?.trim()
  if (q) {
    // 비공개 타인의 제목·본문은 검색에 걸리지 않음
    where.push(`(
      (visibility = '공개' OR author_user_id = ? OR ?)
      AND (title LIKE ? OR content LIKE ? OR inquiry_code LIKE ?)
    )`)
    const admin = isAdmin(viewerUserId) ? 1 : 0
    const like = `%${q}%`
    params.push(viewerUserId, admin, like, like, like)
  }

  const whereSql = where.join(' AND ')

  const countRows = await query<{ cnt: number }[]>(
    `SELECT COUNT(*) AS cnt FROM inquiries WHERE ${whereSql}`,
    params,
  )
  const total = Number(countRows[0]?.cnt ?? 0)

  const rows = await query<InquiryRow[]>(
    `SELECT * FROM inquiries
     WHERE ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )

  return {
    items: rows.map((row) => toDto(row, viewerUserId)),
    total,
    page,
    pageSize,
  }
}

export async function getInquiryByCode(inquiryCode: string, viewerUserId: string) {
  const rows = await query<InquiryRow[]>(
    'SELECT * FROM inquiries WHERE inquiry_code = ? LIMIT 1',
    [inquiryCode],
  )
  const row = rows[0]
  if (!row) throw new AppError(404, '문의를 찾을 수 없습니다.')

  if (!canViewFull(row, viewerUserId)) {
    throw new AppError(403, '비공개 문의는 작성자 또는 관리자만 열람할 수 있습니다.')
  }

  return { item: toDto(row, viewerUserId) }
}

export async function createInquiry(
  input: {
    category?: string
    visibility?: string
    title?: string
    content?: string
  },
  author: { userId: string; name: string; email: string },
) {
  const category = (input.category ?? '').trim()
  const visibility = (input.visibility ?? '공개').trim()
  const title = (input.title ?? '').trim()
  const content = (input.content ?? '').trim()

  if (!CATEGORIES.includes(category as InquiryCategory)) {
    throw new AppError(400, '카테고리가 올바르지 않습니다.')
  }
  if (!VISIBILITIES.includes(visibility as InquiryVisibility)) {
    throw new AppError(400, '공개여부가 올바르지 않습니다.')
  }
  if (!title) throw new AppError(400, '제목을 입력해주세요.')
  if (!content) throw new AppError(400, '내용을 입력해주세요.')
  if (!author.email?.trim()) throw new AppError(400, '작성자 이메일을 확인할 수 없습니다.')

  const inquiryCode = await nextInquiryCode()
  await query(
    `INSERT INTO inquiries
      (inquiry_code, category, visibility, status, title, content,
       author_user_id, author_name, author_email)
     VALUES (?, ?, ?, '접수', ?, ?, ?, ?, ?)`,
    [
      inquiryCode,
      category,
      visibility,
      title,
      content,
      author.userId,
      author.name.trim() || author.userId,
      author.email.trim(),
    ],
  )

  return getInquiryByCode(inquiryCode, author.userId)
}

export async function upsertAnswer(
  inquiryCode: string,
  content: string | undefined,
  adminUserId: string,
) {
  if (!isAdmin(adminUserId)) {
    throw new AppError(403, '관리자만 답변할 수 있습니다.')
  }

  const answer = (content ?? '').trim()
  if (!answer) throw new AppError(400, '답변 내용을 입력해주세요.')
  if (answer.length > ANSWER_MAX) {
    throw new AppError(400, `답변은 ${ANSWER_MAX}자 이하여야 합니다.`)
  }

  const rows = await query<InquiryRow[]>(
    'SELECT * FROM inquiries WHERE inquiry_code = ? LIMIT 1',
    [inquiryCode],
  )
  if (!rows[0]) throw new AppError(404, '문의를 찾을 수 없습니다.')

  await query(
    `UPDATE inquiries
     SET answer = ?, answered_at = NOW(), answered_by_user_id = ?, status = '답변완료'
     WHERE inquiry_code = ?`,
    [answer, adminUserId, inquiryCode],
  )

  return getInquiryByCode(inquiryCode, adminUserId)
}

export function viewerIsAdmin(userId: string) {
  return isAdmin(userId)
}
