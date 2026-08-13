import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AppError } from '../middleware/errorHandler.js'

export const CLEARANCES = [
  'Public',
  'Confidential',
  'Secret',
  'TopSecret',
] as const

export type DocClearance = (typeof CLEARANCES)[number]

const HIDDEN_NAMES = new Set([
  '.gitkeep',
  '.ds_store',
  'thumbs.db',
  'readme.md',
])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** backend/src/services → monorepo root */
const REPO_ROOT = path.resolve(__dirname, '../../..')

export function docsRoot(): string {
  const env = (process.env.SECURE_DOCS_DIR || '').trim()
  if (env) return path.resolve(env)
  return path.join(REPO_ROOT, 'Documents')
}

export function isClearance(name: string): name is DocClearance {
  return (CLEARANCES as readonly string[]).includes(name)
}

export type DocTreeNode = {
  name: string
  relativePath: string
  clearance: DocClearance
  type: 'file' | 'dir'
  size?: number
  children?: DocTreeNode[]
}

function shouldHide(name: string): boolean {
  if (name.startsWith('.')) return true
  return HIDDEN_NAMES.has(name.toLowerCase())
}

/**
 * Resolve a relative path under Documents/<Clearance>/...
 * Rejects traversal and paths outside allowed clearances.
 */
export function resolveSafeDocPath(relativePath: string): {
  absolute: string
  clearance: DocClearance
  relativePosix: string
} {
  const raw = (relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!raw || raw.includes('\0')) {
    throw new AppError(400, '잘못된 문서 경로입니다.')
  }
  const parts = raw.split('/').filter(Boolean)
  if (parts.some((p) => p === '..' || p === '.')) {
    throw new AppError(400, '잘못된 문서 경로입니다.')
  }
  const clearance = parts[0]
  if (!isClearance(clearance)) {
    throw new AppError(400, '허용되지 않은 등급 경로입니다.')
  }
  if (parts.length < 2) {
    throw new AppError(400, '파일 경로가 필요합니다.')
  }

  const rootResolved = path.resolve(docsRoot())
  const absolute = path.resolve(rootResolved, ...parts)
  const relToRoot = path.relative(rootResolved, absolute).replace(/\\/g, '/')
  if (
    relToRoot.startsWith('..') ||
    path.isAbsolute(relToRoot) ||
    !relToRoot.startsWith(`${clearance}/`)
  ) {
    throw new AppError(403, '문서 루트 밖은 접근할 수 없습니다.')
  }

  return {
    absolute,
    clearance,
    relativePosix: parts.join('/'),
  }
}

async function walkDir(
  absDir: string,
  relativePosix: string,
  clearance: DocClearance,
): Promise<DocTreeNode[]> {
  let entries
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true })
  } catch {
    return []
  }
  const nodes: DocTreeNode[] = []
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
    return a.name.localeCompare(b.name, 'ko')
  })
  for (const ent of sorted) {
    if (shouldHide(ent.name)) continue
    const childRel = relativePosix ? `${relativePosix}/${ent.name}` : ent.name
    const childAbs = path.join(absDir, ent.name)
    if (ent.isDirectory()) {
      const children = await walkDir(childAbs, childRel, clearance)
      nodes.push({
        name: ent.name,
        relativePath: childRel,
        clearance,
        type: 'dir',
        children,
      })
    } else if (ent.isFile()) {
      let size = 0
      try {
        const st = await fs.stat(childAbs)
        size = st.size
      } catch {
        /* skip size */
      }
      nodes.push({
        name: ent.name,
        relativePath: childRel,
        clearance,
        type: 'file',
        size,
      })
    }
  }
  return nodes
}

export async function listDocsTree(): Promise<{
  root: string
  clearances: DocClearance[]
  tree: DocTreeNode[]
}> {
  const root = docsRoot()
  const tree: DocTreeNode[] = []
  for (const c of CLEARANCES) {
    const abs = path.join(root, c)
    const children = await walkDir(abs, c, c)
    tree.push({
      name: c,
      relativePath: c,
      clearance: c,
      type: 'dir',
      children,
    })
  }
  return { root, clearances: [...CLEARANCES], tree }
}

export function mimeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
  }
  return map[ext] || 'application/octet-stream'
}

export async function assertReadableFile(absolute: string): Promise<void> {
  let st
  try {
    st = await fs.stat(absolute)
  } catch {
    throw new AppError(404, '문서를 찾을 수 없습니다.')
  }
  if (!st.isFile()) {
    throw new AppError(400, '파일이 아닙니다.')
  }
}

const QMS_DOC_ID_RE = /^QMS-[A-Z]+-\d{3}$/i

/**
 * Resolve a QMS source .docx by document id (ASCII), ignoring Korean filename variants.
 * Looks under Documents/Confidential/qms-source/{docId}*.docx
 */
export async function resolveQmsDocById(docId: string): Promise<{
  absolute: string
  clearance: DocClearance
  relativePosix: string
} | null> {
  const id = (docId || '').trim()
  if (!QMS_DOC_ID_RE.test(id)) return null
  const dir = path.join(docsRoot(), 'Confidential', 'qms-source')
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return null
  }
  const prefix = id.toUpperCase()
  const match = names.find(
    (n) => n.toUpperCase().startsWith(prefix) && n.toLowerCase().endsWith('.docx'),
  )
  if (!match) return null
  return {
    absolute: path.join(dir, match),
    clearance: 'Confidential',
    relativePosix: `Confidential/qms-source/${match}`,
  }
}
