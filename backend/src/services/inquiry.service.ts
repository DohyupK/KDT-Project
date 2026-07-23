import { query } from '../db/connection'
import { AppError } from '../middleware/errorHandler'
import { INQUIRY_CATEGORIES, isDbUnavailableError, useMockStorage } from '../utils/db'

export interface InquiryReplyPayload {
  content: string
  assignee: string
  replyStatus: string
  repliedAt: string | null
  internalMemo: string | null
  priority: string
  adminConfirmed: boolean
}

export interface InquiryPayload {
  id: string
  userId: string | null
  authorName: string
  email: string
  phone: string | null
  category: string
  title: string
  content: string
  isPrivate: boolean
  attachments: string[]
  status: string
  priority: string
  department: string | null
  reply: InquiryReplyPayload | null
  createdAt: string
  updatedAt: string
}

interface InquiryRow {
  id: string
  user_id: string | null
  author_name: string
  email: string
  phone: string | null
  category: string
  title: string
  content: string
  is_private: number
  attachments: string | string[] | null
  status: string
  priority?: string | null
  department?: string | null
  reply_content?: string | null
  reply_assignee?: string | null
  reply_status?: string | null
  reply_internal_memo?: string | null
  reply_admin_confirmed?: number | null
  replied_at?: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

const INQUIRY_STATUSES = ['대기', '진행중', '완료'] as const
const INQUIRY_PRIORITIES = ['높음', '보통', '낮음'] as const

const memoryInquiries: InquiryPayload[] = []
let memoryCounter = 0

function parseAttachments(value: string | string[] | null): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function mapRow(row: InquiryRow): InquiryPayload {
  const hasReply = Boolean(row.reply_content && row.reply_assignee)
  return {
    id: row.id,
    userId: row.user_id,
    authorName: row.author_name,
    email: row.email,
    phone: row.phone,
    category: row.category,
    title: row.title,
    content: row.content,
    isPrivate: row.is_private === 1,
    attachments: parseAttachments(row.attachments),
    status: row.status,
    priority: row.priority ?? '보통',
    department: row.department ?? null,
    reply: hasReply
      ? {
          content: row.reply_content ?? '',
          assignee: row.reply_assignee ?? '',
          replyStatus: row.reply_status ?? '완료',
          repliedAt: row.replied_at ? new Date(row.replied_at).toISOString() : null,
          internalMemo: row.reply_internal_memo ?? null,
          priority: row.priority ?? '보통',
          adminConfirmed: row.reply_admin_confirmed === 1,
        }
      : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function generateInquiryIdFromCounter() {
  memoryCounter += 1
  return `INQ-${String(memoryCounter).padStart(3, '0')}`
}

async function generateInquiryId() {
  if (useMockStorage('MOCK_INQUIRIES')) {
    return generateInquiryIdFromCounter()
  }

  try {
    const rows = await query<Array<{ id: string }>>(
      'SELECT id FROM inquiries ORDER BY id DESC LIMIT 1',
    )
    const latest = rows[0]?.id
    if (latest) {
      const matched = latest.match(/^INQ-(\d+)$/)
      if (matched) {
        const next = Number(matched[1]) + 1
        memoryCounter = Math.max(memoryCounter, next)
        return `INQ-${String(next).padStart(3, '0')}`
      }
    }
  } catch (err) {
    if (!isDbUnavailableError(err)) throw err
  }

  return generateInquiryIdFromCounter()
}

function upsertMemoryInquiry(inquiry: InquiryPayload) {
  const index = memoryInquiries.findIndex((item) => item.id === inquiry.id)
  if (index >= 0) memoryInquiries[index] = inquiry
  else memoryInquiries.unshift(inquiry)
}

function findMemoryInquiry(id: string) {
  return memoryInquiries.find((item) => item.id === id) ?? null
}

function validateCreateInput(input: {
  category: string
  title: string
  content: string
  attachments?: string[]
}) {
  if (!INQUIRY_CATEGORIES.includes(input.category as (typeof INQUIRY_CATEGORIES)[number])) {
    throw new AppError(400, '유효하지 않은 문의 카테고리입니다.')
  }
  if (!input.title.trim()) {
    throw new AppError(400, '문의 제목을 입력해주세요.')
  }
  if (!input.content.trim()) {
    throw new AppError(400, '문의 내용을 입력해주세요.')
  }
  if (input.attachments && input.attachments.length > 10) {
    throw new AppError(400, '첨부 파일은 최대 10개까지 등록할 수 있습니다.')
  }
}

function validatePriority(priority: string) {
  if (!INQUIRY_PRIORITIES.includes(priority as (typeof INQUIRY_PRIORITIES)[number])) {
    throw new AppError(400, '유효하지 않은 우선순위입니다.')
  }
}

function validateStatus(status: string) {
  if (!INQUIRY_STATUSES.includes(status as (typeof INQUIRY_STATUSES)[number])) {
    throw new AppError(400, '유효하지 않은 문의 상태입니다.')
  }
}

function toMysqlDatetime(value: Date = new Date()) {
  return value.toISOString().slice(0, 19).replace('T', ' ')
}

async function fetchInquiryById(id: string): Promise<InquiryPayload | null> {
  try {
    const rows = await query<InquiryRow[]>('SELECT * FROM inquiries WHERE id = ? LIMIT 1', [id])
    return rows[0] ? mapRow(rows[0]) : null
  } catch (err) {
    if (useMockStorage('MOCK_INQUIRIES') || isDbUnavailableError(err)) {
      return findMemoryInquiry(id)
    }
    throw err
  }
}

export async function createInquiry(input: {
  userId: string
  authorName: string
  email: string
  phone: string
  category: string
  title: string
  content: string
  isPrivate: boolean
  attachments: string[]
}) {
  validateCreateInput(input)

  const now = new Date().toISOString()
  const inquiry: InquiryPayload = {
    id: await generateInquiryId(),
    userId: input.userId,
    authorName: input.authorName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    category: input.category,
    title: input.title.trim(),
    content: input.content.trim(),
    isPrivate: input.isPrivate,
    attachments: input.attachments,
    status: '대기',
    priority: '보통',
    department: null,
    reply: null,
    createdAt: now,
    updatedAt: now,
  }

  try {
    await query(
      `INSERT INTO inquiries
        (id, user_id, author_name, email, phone, category, title, content, is_private, attachments, status, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        inquiry.id,
        inquiry.userId,
        inquiry.authorName,
        inquiry.email,
        inquiry.phone,
        inquiry.category,
        inquiry.title,
        inquiry.content,
        inquiry.isPrivate ? 1 : 0,
        JSON.stringify(inquiry.attachments),
        inquiry.status,
        inquiry.priority,
      ],
    )

    const saved = await fetchInquiryById(inquiry.id)
    if (saved) {
      upsertMemoryInquiry(saved)
      return saved
    }
    upsertMemoryInquiry(inquiry)
    return inquiry
  } catch (err) {
    if (useMockStorage('MOCK_INQUIRIES') || isDbUnavailableError(err)) {
      upsertMemoryInquiry(inquiry)
      return inquiry
    }
    throw err
  }
}

export async function getInquiriesByUser(userId: string) {
  try {
    const rows = await query<InquiryRow[]>(
      'SELECT * FROM inquiries WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
    )
    return rows.map(mapRow)
  } catch (err) {
    if (useMockStorage('MOCK_INQUIRIES') || isDbUnavailableError(err)) {
      return memoryInquiries.filter((item) => item.userId === userId)
    }
    throw err
  }
}

export async function getAllInquiries() {
  try {
    const rows = await query<InquiryRow[]>(
      'SELECT * FROM inquiries ORDER BY created_at DESC',
    )
    return rows.map(mapRow)
  } catch (err) {
    if (useMockStorage('MOCK_INQUIRIES') || isDbUnavailableError(err)) {
      return [...memoryInquiries]
    }
    throw err
  }
}

export async function getInquiryById(id: string) {
  const inquiry = await fetchInquiryById(id)
  if (!inquiry) throw new AppError(404, '문의를 찾을 수 없습니다.')
  return inquiry
}

export async function updateInquiryStatus(id: string, status: string) {
  validateStatus(status)
  const existing = await getInquiryById(id)
  const now = new Date().toISOString()
  const updated: InquiryPayload = { ...existing, status, updatedAt: now }

  try {
    await query('UPDATE inquiries SET status = ? WHERE id = ?', [status, id])
    const saved = await fetchInquiryById(id)
    if (saved) {
      upsertMemoryInquiry(saved)
      return saved
    }
    upsertMemoryInquiry(updated)
    return updated
  } catch (err) {
    if (useMockStorage('MOCK_INQUIRIES') || isDbUnavailableError(err)) {
      upsertMemoryInquiry(updated)
      return updated
    }
    throw err
  }
}

export async function submitInquiryReply(
  id: string,
  input: {
    content: string
    assignee: string
    priority: string
    internalMemo?: string
    adminConfirmed: boolean
  },
) {
  if (!input.content.trim()) throw new AppError(400, '답변 내용을 입력해주세요.')
  if (!input.assignee.trim()) throw new AppError(400, '담당자를 입력해주세요.')
  validatePriority(input.priority)

  await getInquiryById(id)
  const repliedAt = new Date()
  const now = repliedAt.toISOString()
  const reply: InquiryReplyPayload = {
    content: input.content.trim(),
    assignee: input.assignee.trim(),
    replyStatus: '완료',
    repliedAt: now,
    internalMemo: input.internalMemo?.trim() || null,
    priority: input.priority,
    adminConfirmed: input.adminConfirmed,
  }

  try {
    await query(
      `UPDATE inquiries SET
        status = '완료',
        priority = ?,
        reply_content = ?,
        reply_assignee = ?,
        reply_status = ?,
        reply_internal_memo = ?,
        reply_admin_confirmed = ?,
        replied_at = ?
       WHERE id = ?`,
      [
        reply.priority,
        reply.content,
        reply.assignee,
        reply.replyStatus,
        reply.internalMemo,
        reply.adminConfirmed ? 1 : 0,
        toMysqlDatetime(repliedAt),
        id,
      ],
    )

    const saved = await fetchInquiryById(id)
    if (saved) {
      upsertMemoryInquiry(saved)
      return saved
    }

    const fallback = await getInquiryById(id)
    const merged: InquiryPayload = { ...fallback, status: '완료', priority: reply.priority, reply, updatedAt: now }
    upsertMemoryInquiry(merged)
    return merged
  } catch (err) {
    if (useMockStorage('MOCK_INQUIRIES') || isDbUnavailableError(err)) {
      const existing = await getInquiryById(id)
      const merged: InquiryPayload = {
        ...existing,
        status: '완료',
        priority: reply.priority,
        reply,
        updatedAt: now,
      }
      upsertMemoryInquiry(merged)
      return merged
    }
    throw err
  }
}
