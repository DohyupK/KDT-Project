import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'

export type InquiryStatus = '접수' | '답변완료'
export type InquiryVisibility = '공개' | '비공개'

export type InquiryRow = {
  id: string
  category: string
  title: string
  author: string
  author_user_id: string | null
  content: string
  answer: string
  status: InquiryStatus
  visibility: InquiryVisibility
  answered_at: Date | string | null
  created_at: Date | string
}

export type InquiryDto = {
  id: string
  category: string
  title: string
  author: string
  authorUserId: string | null
  content: string
  answer: string
  status: InquiryStatus
  visibility: InquiryVisibility
  date: string
  answeredAt?: string
}

function formatDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toDto(row: InquiryRow): InquiryDto {
  const date = formatDate(row.created_at) ?? ''
  const answeredAt = formatDate(row.answered_at)
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    author: row.author,
    authorUserId: row.author_user_id,
    content: row.content,
    answer: row.answer ?? '',
    status: row.status,
    visibility: row.visibility,
    date,
    ...(answeredAt ? { answeredAt } : {}),
  }
}

function parseInquirySeq(id: string): number {
  const matched = /^INQ-(\d+)$/.exec(id)
  if (!matched) return 0
  const value = Number(matched[1])
  return Number.isFinite(value) ? value : 0
}

async function allocateInquiryId(): Promise<string> {
  const rows = await query<{ id: string }[]>('SELECT id FROM inquiries ORDER BY id DESC LIMIT 50')
  const maxSeq = rows.reduce((max, row) => Math.max(max, parseInquirySeq(row.id)), 0)
  return `INQ-${String(maxSeq + 1).padStart(3, '0')}`
}

export async function listInquiries(): Promise<InquiryDto[]> {
  const rows = await query<InquiryRow[]>(
    `SELECT id, category, title, author, author_user_id, content, answer,
            status, visibility, answered_at, created_at
     FROM inquiries
     ORDER BY created_at DESC, id DESC`,
  )
  return rows.map(toDto)
}

export async function createInquiry(input: {
  category: string
  title: string
  content: string
  visibility: InquiryVisibility
  author: string
  authorUserId?: string | null
}): Promise<InquiryDto> {
  const category = input.category.trim()
  const title = input.title.trim()
  const content = input.content.trim()
  const author = input.author.trim()

  if (!category) throw new AppError(400, '문의 카테고리를 선택해주세요.')
  if (!title) throw new AppError(400, '문의 제목을 입력해주세요.')
  if (!content) throw new AppError(400, '문의 내용을 입력해주세요.')
  if (!author) throw new AppError(400, '작성자 정보가 필요합니다.')
  if (input.visibility !== '공개' && input.visibility !== '비공개') {
    throw new AppError(400, '공개 여부가 올바르지 않습니다.')
  }

  const id = await allocateInquiryId()
  await query(
    `INSERT INTO inquiries
      (id, category, title, author, author_user_id, content, answer, status, visibility)
     VALUES (?, ?, ?, ?, ?, ?, '', '접수', ?)`,
    [id, category, title, author, input.authorUserId ?? null, content, input.visibility],
  )

  const rows = await query<InquiryRow[]>(
    `SELECT id, category, title, author, author_user_id, content, answer,
            status, visibility, answered_at, created_at
     FROM inquiries WHERE id = ? LIMIT 1`,
    [id],
  )
  const created = rows[0]
  if (!created) throw new AppError(500, '문의 등록 후 조회에 실패했습니다.')
  return toDto(created)
}
