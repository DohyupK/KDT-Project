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

export async function fetchDocsTree(): Promise<DocsTreeResponse> {
  const { data } = await apiClient.get<DocsTreeResponse>('/docs/tree')
  return data
}

/** Authenticated blob fetch for viewer (axios responseType blob). */
export async function fetchDocFileBlob(relativePath: string): Promise<{
  blob: Blob
  contentType: string
  clearance: string
}> {
  const { data, headers } = await apiClient.get<Blob>('/docs/file', {
    params: { path: relativePath },
    responseType: 'blob',
    timeout: 120_000,
  })
  const contentType =
    (headers['content-type'] as string | undefined)?.split(';')[0]?.trim() ||
    data.type ||
    'application/octet-stream'
  const clearance = String(headers['x-doc-clearance'] || '')
  return { blob: data, contentType, clearance }
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
