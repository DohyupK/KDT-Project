'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useUiSettings } from '@/components/layout/AppShell'
import { useShellRefresh } from '@/hooks/useShellRefresh'
import {
  fetchDocFileBlob,
  fetchDocsTree,
  hasSecretAck,
  isRestrictedClearance,
  setSecretAck,
  type DocClearance,
  type DocTreeNode,
} from '@/api/docsApi'

const CLEARANCE_ORDER: DocClearance[] = [
  'Public',
  'Confidential',
  'Secret',
  'TopSecret',
]

function clearanceBadgeClass(c: DocClearance, isDark: boolean): string {
  switch (c) {
    case 'Public':
      return isDark
        ? 'bg-emerald-950/60 text-emerald-300 ring-emerald-800'
        : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'Confidential':
      return isDark
        ? 'bg-sky-950/60 text-sky-300 ring-sky-800'
        : 'bg-sky-50 text-sky-700 ring-sky-200'
    case 'Secret':
      return isDark
        ? 'bg-amber-950/60 text-amber-300 ring-amber-800'
        : 'bg-amber-50 text-amber-800 ring-amber-200'
    case 'TopSecret':
      return isDark
        ? 'bg-rose-950/60 text-rose-300 ring-rose-800'
        : 'bg-rose-50 text-rose-700 ring-rose-200'
    default:
      return isDark
        ? 'bg-slate-800 text-slate-300 ring-slate-700'
        : 'bg-slate-100 text-slate-600 ring-slate-200'
  }
}

function formatSize(bytes?: number): string {
  if (bytes == null || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

type ViewerKind = 'text' | 'pdf' | 'image' | 'other'

function viewerKind(name: string, contentType: string): ViewerKind {
  const ext = extOf(name)
  if (
    ext === '.md' ||
    ext === '.txt' ||
    ext === '.csv' ||
    ext === '.json' ||
    contentType.startsWith('text/') ||
    contentType.includes('markdown') ||
    contentType.includes('json')
  ) {
    return 'text'
  }
  if (ext === '.pdf' || contentType.includes('pdf')) return 'pdf'
  if (
    ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext) ||
    contentType.startsWith('image/')
  ) {
    return 'image'
  }
  return 'other'
}

function flattenFiles(nodes: DocTreeNode[]): DocTreeNode[] {
  const out: DocTreeNode[] = []
  const walk = (list: DocTreeNode[]) => {
    for (const n of list) {
      if (n.type === 'file') out.push(n)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

function TreeRows({
  nodes,
  depth,
  expanded,
  toggleDir,
  onOpenFile,
  isDark,
}: {
  nodes: DocTreeNode[]
  depth: number
  expanded: Set<string>
  toggleDir: (path: string) => void
  onOpenFile: (node: DocTreeNode) => void
  isDark: boolean
}) {
  return (
    <>
      {nodes.map((node) => {
        const pad = 12 + depth * 16
        if (node.type === 'dir') {
          const open = expanded.has(node.relativePath)
          return (
            <div key={node.relativePath}>
              <button
                type="button"
                onClick={() => toggleDir(node.relativePath)}
                className={`flex w-full items-center gap-2 border-b py-2 pr-3 text-left text-sm transition-colors ${
                  isDark
                    ? 'border-slate-700/80 hover:bg-slate-700/40'
                    : 'border-slate-100 hover:bg-slate-50'
                }`}
                style={{ paddingLeft: pad }}
              >
                <span
                  className={`inline-block w-4 shrink-0 text-xs ${
                    isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}
                  aria-hidden
                >
                  {open ? '▾' : '▸'}
                </span>
                <span
                  className={`font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}
                >
                  {node.name}
                </span>
                {depth === 0 ? (
                  <span
                    className={`ml-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${clearanceBadgeClass(
                      node.clearance,
                      isDark,
                    )}`}
                  >
                    {node.clearance}
                  </span>
                ) : null}
              </button>
              {open && node.children?.length ? (
                <TreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  toggleDir={toggleDir}
                  onOpenFile={onOpenFile}
                  isDark={isDark}
                />
              ) : null}
            </div>
          )
        }

        return (
          <button
            key={node.relativePath}
            type="button"
            onClick={() => onOpenFile(node)}
            className={`flex w-full items-center gap-2 border-b py-2 pr-3 text-left text-sm transition-colors ${
              isDark
                ? 'border-slate-700/80 hover:bg-slate-700/50'
                : 'border-slate-100 hover:bg-blue-50/60'
            }`}
            style={{ paddingLeft: pad + 20 }}
          >
            <span
              className={`min-w-0 flex-1 truncate ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              {node.name}
            </span>
            <span
              className={`shrink-0 text-xs tabular-nums ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              {formatSize(node.size)}
            </span>
          </button>
        )
      })}
    </>
  )
}

export default function DocumentsBrowser() {
  const { isDark } = useUiSettings()
  const [tree, setTree] = useState<DocTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<DocClearance | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(CLEARANCE_ORDER))
  const [pendingAck, setPendingAck] = useState<DocTreeNode | null>(null)

  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerTitle, setViewerTitle] = useState('')
  const [viewerPath, setViewerPath] = useState('')
  const [viewerClearance, setViewerClearance] = useState<DocClearance | ''>('')
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [viewerText, setViewerText] = useState<string | null>(null)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [viewerType, setViewerType] = useState<ViewerKind>('other')

  const loadTree = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDocsTree()
      setTree(data.tree)
      setExpanded(new Set(data.clearances.length ? data.clearances : CLEARANCE_ORDER))
    } catch (err) {
      let msg = '문서 목록을 불러오지 못했습니다.'
      if (isAxiosError(err)) {
        const body = err.response?.data as { message?: string } | undefined
        if (body?.message) msg = body.message
        else if (err.response?.status === 401) msg = '로그인이 필요합니다.'
      }
      setError(msg)
      setTree([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTree()
  }, [loadTree])

  useShellRefresh(() => {
    void loadTree()
  })

  useEffect(() => {
    return () => {
      if (viewerUrl) URL.revokeObjectURL(viewerUrl)
    }
  }, [viewerUrl])

  const filteredTree = useMemo(() => {
    if (filter === 'all') return tree
    return tree.filter((n) => n.clearance === filter)
  }, [tree, filter])

  const fileCount = useMemo(() => flattenFiles(filteredTree).length, [filteredTree])

  const toggleDir = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const closeViewer = useCallback(() => {
    setViewerOpen(false)
    setViewerError(null)
    setViewerText(null)
    setViewerLoading(false)
    setViewerUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  const openViewer = useCallback(async (node: DocTreeNode) => {
    setViewerOpen(true)
    setViewerTitle(node.name)
    setViewerPath(node.relativePath)
    setViewerClearance(node.clearance)
    setViewerLoading(true)
    setViewerError(null)
    setViewerText(null)
    setViewerUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })

    try {
      const { blob, contentType } = await fetchDocFileBlob(node.relativePath)
      const kind = viewerKind(node.name, contentType)
      setViewerType(kind)
      if (kind === 'text') {
        const text = await blob.text()
        setViewerText(text)
      } else {
        const url = URL.createObjectURL(blob)
        setViewerUrl(url)
      }
    } catch (err) {
      let msg = '문서를 열 수 없습니다.'
      if (isAxiosError(err)) {
        const status = err.response?.status
        if (status === 404) msg = '문서를 찾을 수 없습니다.'
        else if (status === 403) msg = '접근이 거부되었습니다.'
        else if (status === 401) msg = '로그인이 필요합니다.'
        else if (err.response?.data instanceof Blob) {
          try {
            const t = await err.response.data.text()
            const parsed = JSON.parse(t) as { message?: string }
            if (parsed.message) msg = parsed.message
          } catch {
            /* keep default */
          }
        }
      }
      setViewerError(msg)
    } finally {
      setViewerLoading(false)
    }
  }, [])

  const requestOpenFile = useCallback(
    (node: DocTreeNode) => {
      if (isRestrictedClearance(node.clearance) && !hasSecretAck(node.relativePath)) {
        setPendingAck(node)
        return
      }
      void openViewer(node)
    },
    [openViewer],
  )

  const confirmAck = useCallback(() => {
    if (!pendingAck) return
    setSecretAck(pendingAck.relativePath)
    const node = pendingAck
    setPendingAck(null)
    void openViewer(node)
  }, [pendingAck, openViewer])

  useEffect(() => {
    if (!viewerOpen && !pendingAck) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (pendingAck) setPendingAck(null)
      else closeViewer()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [viewerOpen, pendingAck, closeViewer])

  return (
    <div
      className={`overflow-hidden rounded-xl border shadow-sm ${
        isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
      }`}
    >
      <div
        className={`border-b px-4 py-3.5 sm:px-5 ${
          isDark ? 'border-slate-700' : 'border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3
            className={`m-0 text-base font-semibold ${
              isDark ? 'text-slate-100' : 'text-slate-800'
            }`}
          >
            사내 문서
          </h3>
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              isDark
                ? 'bg-slate-700 text-slate-300'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            읽기 전용
          </span>
          <span
            className={`text-sm font-semibold tabular-nums ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            {loading ? '…' : `${fileCount}건`}
          </span>
        </div>
        <p className={`mb-0 mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Documents 폴더의 등급별 문서를 조회합니다. 편집·업로드·복제는 지원하지 않습니다.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : isDark
                  ? 'border border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-700'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            전체
          </button>
          {CLEARANCE_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                filter === c
                  ? 'bg-blue-600 text-white'
                  : isDark
                    ? 'border border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-700'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {c}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void loadTree()}
            className={`ml-auto rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
              isDark
                ? 'border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            새로고침
          </button>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {loading ? (
          <p
            className={`px-4 py-10 text-center text-sm ${
              isDark ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            문서 목록을 불러오는 중…
          </p>
        ) : error ? (
          <div className="px-4 py-10 text-center">
            <p className={`m-0 text-sm ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>{error}</p>
            <button
              type="button"
              onClick={() => void loadTree()}
              className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              다시 시도
            </button>
          </div>
        ) : filteredTree.length === 0 || fileCount === 0 ? (
          <p
            className={`px-4 py-10 text-center text-sm ${
              isDark ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            표시할 문서가 없습니다.
          </p>
        ) : (
          <TreeRows
            nodes={filteredTree}
            depth={0}
            expanded={expanded}
            toggleDir={toggleDir}
            onOpenFile={requestOpenFile}
            isDark={isDark}
          />
        )}
      </div>

      {/* Secret / TopSecret ack */}
      {pendingAck ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="docs-secret-ack-title"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/55 p-4"
          onClick={() => setPendingAck(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
              isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
            }`}
          >
            <p
              id="docs-secret-ack-title"
              className={`m-0 text-base font-semibold ${
                isDark ? 'text-amber-200' : 'text-amber-900'
              }`}
            >
              {pendingAck.clearance} 문서 열람 주의
            </p>
            <p
              className={`mt-3 text-sm leading-relaxed ${
                isDark ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              본 문서는 <strong>{pendingAck.clearance}</strong> 등급입니다.
              무단 유출·외부 반출은 금지되며, 관련 법규 및 사내 보안 규정에 따라
              법적·징계 책임이 따를 수 있습니다. 열람 목적 외 사용을 금합니다.
            </p>
            <p
              className={`mt-2 break-all text-xs ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              {pendingAck.relativePath}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingAck(null)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  isDark
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmAck}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
              >
                확인하고 열람
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Viewer */}
      {viewerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="docs-viewer-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
          onClick={closeViewer}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
            }`}
          >
            <div
              className={`flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    id="docs-viewer-title"
                    className={`m-0 truncate text-base font-semibold ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    {viewerTitle}
                  </h3>
                  {viewerClearance ? (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${clearanceBadgeClass(
                        viewerClearance,
                        isDark,
                      )}`}
                    >
                      {viewerClearance}
                    </span>
                  ) : null}
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                      isDark
                        ? 'bg-slate-700 text-slate-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    READ-ONLY
                  </span>
                </div>
                <p
                  className={`mb-0 mt-1 break-all text-xs ${
                    isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  {viewerPath}
                </p>
              </div>
              <button
                type="button"
                onClick={closeViewer}
                aria-label="모달 닫기"
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl text-slate-400 ${
                  isDark
                    ? 'hover:bg-slate-700 hover:text-slate-200'
                    : 'hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                ×
              </button>
            </div>
            <div className="min-h-[200px] flex-1 overflow-auto px-5 py-4">
              {viewerLoading ? (
                <p
                  className={`py-12 text-center text-sm ${
                    isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  불러오는 중…
                </p>
              ) : viewerError ? (
                <p
                  className={`py-12 text-center text-sm ${
                    isDark ? 'text-rose-300' : 'text-rose-600'
                  }`}
                >
                  {viewerError}
                </p>
              ) : viewerType === 'text' && viewerText != null ? (
                <pre
                  className={`m-0 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                  }`}
                >
                  {viewerText}
                </pre>
              ) : viewerType === 'pdf' && viewerUrl ? (
                <iframe
                  title={viewerTitle}
                  src={viewerUrl}
                  className="h-[70vh] w-full rounded-lg border-0 bg-slate-100"
                />
              ) : viewerType === 'image' && viewerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={viewerUrl}
                  alt={viewerTitle}
                  className="mx-auto max-h-[70vh] max-w-full object-contain"
                />
              ) : viewerUrl ? (
                <div className="py-10 text-center">
                  <p
                    className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    이 형식은 미리보기를 지원하지 않습니다.
                  </p>
                  <a
                    href={viewerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:underline"
                  >
                    새 탭에서 열기
                  </a>
                </div>
              ) : (
                <p
                  className={`py-12 text-center text-sm ${
                    isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  표시할 내용이 없습니다.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
