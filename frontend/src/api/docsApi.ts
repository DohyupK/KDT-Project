import { apiClient } from '@/api/axios'

export type DocClearance = 'Public' | 'Confidential' | 'Secret' | 'TopSecret'

export type DocTreeNode = {
  name: string
  relativePath: string
  clearance: DocClearance
  type: 'file' | 'dir'
  size?: number
  children?: DocTreeNode[]
}

export type DocsTreeResponse = {
  root: string
  clearances: DocClearance[]
  tree: DocTreeNode[]
}

export type DocPreviewMeta = {
  docNo: string
  revision: string
  date: string
  security: string
  author: string
  reviewer: string
  approver: string
  retentionYears: string
}

export type DocPreviewData = {
  html: string
  toc: Array<{ id: string; label: string }>
  meta: DocPreviewMeta
  title?: string
  subtitle?: string
}

export async function fetchDocsTree(): Promise<DocsTreeResponse> {
  const { data } = await apiClient.get<DocsTreeResponse>('/docs/tree')
  return data
}

export async function fetchDocPreview(opts: {
  path?: string
  docId?: string
}): Promise<DocPreviewData | string> {
  const { data } = await apiClient.get<DocPreviewData | string>('/docs/preview', {
    params: {
      ...(opts.path ? { path: opts.path } : {}),
      ...(opts.docId ? { docId: opts.docId } : {}),
    },
  })
  return data
}

/** Authenticated blob fetch for viewer (axios responseType blob). */
export async function fetchDocFileBlob(
  relativePath: string,
  docId?: string,
): Promise<{
  blob: Blob
  contentType: string
  clearance: string
  filename: string
}> {
  const { data, headers } = await apiClient.get<Blob>('/docs/file', {
    params: {
      ...(relativePath ? { path: relativePath } : {}),
      ...(docId ? { docId } : {}),
    },
    responseType: 'blob',
    timeout: 120_000,
  })
  const contentType =
    (headers['content-type'] as string | undefined)?.split(';')[0]?.trim() ||
    data.type ||
    'application/octet-stream'
  const clearance = String(headers['x-doc-clearance'] || '')
  const disposition = String(headers['content-disposition'] || '')
  const star = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  const plain = disposition.match(/filename="?([^";]+)"?/i)
  let filename = ''
  try {
    filename = decodeURIComponent(star?.[1] || plain?.[1] || '')
  } catch {
    filename = star?.[1] || plain?.[1] || ''
  }
  return { blob: data, contentType, clearance, filename }
}

export function isRestrictedClearance(c: DocClearance | string): boolean {
  return c === 'Secret' || c === 'TopSecret'
}

const ACK_PREFIX = 'docs_secret_ack::'

export function hasSecretAck(relativePath: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(ACK_PREFIX + relativePath) === '1'
  } catch {
    return false
  }
}

export function setSecretAck(relativePath: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ACK_PREFIX + relativePath, '1')
  } catch {
    /* ignore quota */
  }
}
