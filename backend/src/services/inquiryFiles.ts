import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_INQUIRY_FILES = 5
export const MAX_INQUIRY_FILE_BYTES = 10 * 1024 * 1024

export const ALLOWED_INQUIRY_EXTS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.pdf',
  '.xlsx',
  '.xls',
  '.csv',
  '.docx',
  '.txt',
] as const

const ALLOWED_SET = new Set<string>(ALLOWED_INQUIRY_EXTS)

export function inquiryFileExt(originalName: string): string {
  const ext = path.extname(originalName || '').toLowerCase()
  return ALLOWED_SET.has(ext) ? ext : ''
}

export function isAllowedInquiryFile(originalName: string): boolean {
  return Boolean(inquiryFileExt(originalName))
}

export function inquiryUploadsRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/inquiries')
}

export function sanitizeOriginalName(originalName: string): string {
  const base = path.basename(originalName || 'file').replace(/[\r\n"]/g, '_')
  return base.slice(0, 255) || 'file'
}
