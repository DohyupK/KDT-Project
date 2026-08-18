import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { ReadStream } from 'node:fs'
import { query, withTransaction } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'
import {
  inquiryFileExt,
  inquiryUploadsRoot,
  isAllowedInquiryFile,
  MAX_INQUIRY_FILE_BYTES,
  MAX_INQUIRY_FILES,
  sanitizeOriginalName,
} from './inquiryFiles.js'
import { isManageUser } from './userSettings.service.js'

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

interface AttachmentRow {
  id: number
  inquiry_id: number
  original_name: string
  stored_name: string
  mime_type: string
  size_bytes: number
  created_at: Date | string
}

export type InquiryAttachmentDto = {
  id: number
  name: string
  size: number
  mimeType: string
}

export type IncomingInquiryFile = {
  originalName: string
  mimeType: string
  size: number
  buffer: Buffer
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
  attachmentCount: number
  attachments: InquiryAttachmentDto[]
}

function canViewFull(
  row: InquiryRow,
  viewerUserId: string | undefined,
  viewerIsManage: boolean,
): boolean {
  if (row.visibility !== '비공개') return true
  if (!viewerUserId) return false
  if (viewerIsManage) return true
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

function toPublicAttachment(row: AttachmentRow): InquiryAttachmentDto {
  return {
    id: row.id,
    name: row.original_name,
    size: Number(row.size_bytes) || 0,
    mimeType: row.mime_type,
  }
}

function toDto(
  row: InquiryRow,
  viewerUserId: string | undefined,
  attachments: AttachmentRow[] = [],
  viewerIsManage = false,
): InquiryDto {
  const full = canViewFull(row, viewerUserId, viewerIsManage)
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
      attachmentCount: 0,
      attachments: [],
    }
  }
  const publicFiles = attachments.map(toPublicAttachment)
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
    attachmentCount: publicFiles.length,
    attachments: publicFiles,
  }
}

async function loadAttachmentsByInquiryIds(inquiryIds: number[]): Promise<Map<number, AttachmentRow[]>> {
  const map = new Map<number, AttachmentRow[]>()
  if (inquiryIds.length === 0) return map
  const placeholders = inquiryIds.map(() => '?').join(', ')
  const rows = await query<AttachmentRow[]>(
    `SELECT * FROM INQUIRY_ATTACHMENTS
     WHERE inquiry_id IN (${placeholders})
     ORDER BY id ASC`,
    inquiryIds,
  )
  for (const row of rows) {
    const list = map.get(row.inquiry_id) ?? []
    list.push(row)
    map.set(row.inquiry_id, list)
  }
  return map
}

function validateIncomingFiles(files: IncomingInquiryFile[]) {
  if (files.length > MAX_INQUIRY_FILES) {
    throw new AppError(400, `파일은 최대 ${MAX_INQUIRY_FILES}개까지 첨부할 수 있습니다.`)
  }
  for (const file of files) {
    if (!isAllowedInquiryFile(file.originalName)) {
      throw new AppError(400, '허용되지 않는 파일 형식입니다.')
    }
    if (file.size > MAX_INQUIRY_FILE_BYTES) {
      throw new AppError(400, '파일은 10MB 이하여야 합니다.')
    }
  }
}

async function removeDirIfExists(dir: string) {
  await fs.rm(dir, { recursive: true, force: true })
}

async function nextInquiryCode(): Promise<string> {
  const rows = await query<{ inquiry_code: string }[]>(
    `SELECT inquiry_code FROM INQUIRIES
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
  const viewerIsManage = await isManageUser(viewerUserId)

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
    const admin = viewerIsManage ? 1 : 0
    const like = `%${q}%`
    params.push(viewerUserId, admin, like, like, like)
  }

  const whereSql = where.join(' AND ')

  const countRows = await query<{ cnt: number }[]>(
    `SELECT COUNT(*) AS cnt FROM INQUIRIES WHERE ${whereSql}`,
    params,
  )
  const total = Number(countRows[0]?.cnt ?? 0)

  const rows = await query<InquiryRow[]>(
    `SELECT * FROM INQUIRIES
     WHERE ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )

  const attachmentMap = await loadAttachmentsByInquiryIds(rows.map((row) => row.id))

  return {
    items: rows.map((row) =>
      toDto(row, viewerUserId, attachmentMap.get(row.id) ?? [], viewerIsManage),
    ),
    total,
    page,
    pageSize,
  }
}

export async function getInquiryByCode(inquiryCode: string, viewerUserId: string) {
  const rows = await query<InquiryRow[]>(
    'SELECT * FROM INQUIRIES WHERE inquiry_code = ? LIMIT 1',
    [inquiryCode],
  )
  const row = rows[0]
  if (!row) throw new AppError(404, '문의를 찾을 수 없습니다.')

  const viewerIsManage = await isManageUser(viewerUserId)
  if (!canViewFull(row, viewerUserId, viewerIsManage)) {
    throw new AppError(403, '비공개 문의는 작성자 또는 관리자만 열람할 수 있습니다.')
  }

  const attachmentMap = await loadAttachmentsByInquiryIds([row.id])
  return { item: toDto(row, viewerUserId, attachmentMap.get(row.id) ?? [], viewerIsManage) }
}

export async function createInquiry(
  input: {
    category?: string
    visibility?: string
    title?: string
    content?: string
  },
  author: { userId: string; name: string; email: string },
  files: IncomingInquiryFile[] = [],
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

  validateIncomingFiles(files)

  const inquiryCode = await nextInquiryCode()
  const uploadDir = path.join(inquiryUploadsRoot(), inquiryCode)
  let wroteFiles = false

  try {
    await withTransaction(async (conn) => {
      const insertResult = (await conn.query(
        `INSERT INTO INQUIRIES
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
      )) as { insertId?: number | bigint }

      const inquiryId = Number(insertResult?.insertId ?? 0)
      if (!inquiryId) throw new AppError(500, '문의 저장에 실패했습니다.')

      if (files.length === 0) return

      await fs.mkdir(uploadDir, { recursive: true })
      wroteFiles = true

      for (const file of files) {
        const ext = inquiryFileExt(file.originalName)
        const storedName = `${randomUUID()}${ext}`
        const absPath = path.join(uploadDir, storedName)
        await fs.writeFile(absPath, file.buffer)
        await conn.query(
          `INSERT INTO INQUIRY_ATTACHMENTS
            (inquiry_id, original_name, stored_name, mime_type, size_bytes)
           VALUES (?, ?, ?, ?, ?)`,
          [
            inquiryId,
            sanitizeOriginalName(file.originalName),
            storedName,
            (file.mimeType || 'application/octet-stream').slice(0, 127),
            file.size,
          ],
        )
      }
    })
  } catch (err) {
    if (wroteFiles) await removeDirIfExists(uploadDir)
    throw err
  }

  return getInquiryByCode(inquiryCode, author.userId)
}

export async function openInquiryAttachment(
  inquiryCode: string,
  attachmentId: number,
  viewerUserId: string,
): Promise<{ stream: ReadStream; originalName: string; mimeType: string; size: number }> {
  if (!Number.isFinite(attachmentId) || attachmentId <= 0) {
    throw new AppError(400, '첨부파일을 찾을 수 없습니다.')
  }

  const rows = await query<InquiryRow[]>(
    'SELECT * FROM INQUIRIES WHERE inquiry_code = ? LIMIT 1',
    [inquiryCode],
  )
  const row = rows[0]
  if (!row) throw new AppError(404, '문의를 찾을 수 없습니다.')

  if (!canViewFull(row, viewerUserId, await isManageUser(viewerUserId))) {
    throw new AppError(403, '비공개 문의는 작성자 또는 관리자만 열람할 수 있습니다.')
  }

  const files = await query<AttachmentRow[]>(
    'SELECT * FROM INQUIRY_ATTACHMENTS WHERE id = ? AND inquiry_id = ? LIMIT 1',
    [attachmentId, row.id],
  )
  const file = files[0]
  if (!file) throw new AppError(404, '첨부파일을 찾을 수 없습니다.')

  const root = path.resolve(inquiryUploadsRoot())
  const absPath = path.resolve(root, row.inquiry_code, file.stored_name)
  const rel = path.relative(root, absPath)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new AppError(404, '첨부파일을 찾을 수 없습니다.')
  }

  try {
    await fs.access(absPath)
  } catch {
    throw new AppError(404, '첨부파일을 찾을 수 없습니다.')
  }

  return {
    stream: createReadStream(absPath),
    originalName: file.original_name,
    mimeType: file.mime_type || 'application/octet-stream',
    size: Number(file.size_bytes) || 0,
  }
}

export async function upsertAnswer(
  inquiryCode: string,
  content: string | undefined,
  adminUserId: string,
) {
  if (!(await isManageUser(adminUserId))) {
    throw new AppError(403, '관리자만 답변할 수 있습니다.')
  }

  const answer = (content ?? '').trim()
  if (!answer) throw new AppError(400, '답변 내용을 입력해주세요.')
  if (answer.length > ANSWER_MAX) {
    throw new AppError(400, `답변은 ${ANSWER_MAX}자 이하여야 합니다.`)
  }

  const rows = await query<InquiryRow[]>(
    'SELECT * FROM INQUIRIES WHERE inquiry_code = ? LIMIT 1',
    [inquiryCode],
  )
  if (!rows[0]) throw new AppError(404, '문의를 찾을 수 없습니다.')

  await query(
    `UPDATE INQUIRIES
     SET answer = ?, answered_at = NOW(), answered_by_user_id = ?, status = '답변완료'
     WHERE inquiry_code = ?`,
    [answer, adminUserId, inquiryCode],
  )

  return getInquiryByCode(inquiryCode, adminUserId)
}

export async function viewerIsAdmin(userId: string) {
  return isManageUser(userId)
}
