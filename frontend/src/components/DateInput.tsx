'use client'

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useUiSettings } from '@/components/layout/AppShell'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toIsoDate(year: number, monthIndex: number, day: number) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`
}

function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2]) - 1
  const d = Number(match[3])
  const date = new Date(y, m, d)
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null
  return { y, m, d }
}

function formatDisplay(value: string) {
  const parsed = parseIsoDate(value)
  if (!parsed) return value || 'YYYY-MM-DD'
  return `${parsed.y}-${pad2(parsed.m + 1)}-${pad2(parsed.d)}`
}

type DateInputProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  'aria-label'?: string
  className?: string
  style?: CSSProperties
  isDark?: boolean
  disabled?: boolean
  /** When true, omit outer border (for joined range controls). */
  bare?: boolean
  /** Shorter trigger (h-8) for dense filter bars. */
  compact?: boolean
}

export default function DateInput({
  id,
  value,
  onChange,
  'aria-label': ariaLabel,
  className = '',
  style,
  isDark: isDarkProp,
  disabled = false,
  bare = false,
  compact = false,
}: DateInputProps) {
  const { isDark: isDarkSetting } = useUiSettings()
  const isDark = isDarkProp ?? isDarkSetting
  const autoId = useId()
  const inputId = id ?? autoId
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const selected = useMemo(() => parseIsoDate(value), [value])
  const initialMonth = selected
    ? new Date(selected.y, selected.m, 1)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [viewYear, setViewYear] = useState(initialMonth.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialMonth.getMonth())

  useEffect(() => {
    if (!open) return
    if (selected) {
      setViewYear(selected.y)
      setViewMonth(selected.m)
    }
  }, [open, selected])

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    const update = () => {
      const el = rootRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const panelWidth = 320
      const left = Math.min(r.left, Math.max(8, window.innerWidth - panelWidth - 8))
      setCoords({ top: r.bottom + 6, left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      const t = event.target as Node
      if (rootRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    // Defer so the opening click does not immediately close the portal.
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown)
    }, 0)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startWeekday = new Date(viewYear, viewMonth, 1).getDay()
  const cells = useMemo(() => {
    const list: Array<{ key: string; day: number | null; iso: string | null }> = []
    for (let i = 0; i < startWeekday; i += 1) {
      list.push({ key: `e-${i}`, day: null, iso: null })
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      list.push({
        key: `d-${day}`,
        day,
        iso: toIsoDate(viewYear, viewMonth, day),
      })
    }
    while (list.length % 7 !== 0) {
      list.push({ key: `t-${list.length}`, day: null, iso: null })
    }
    return list
  }, [daysInMonth, startWeekday, viewMonth, viewYear])

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const handleSelect = (iso: string) => {
    onChange(iso)
    setOpen(false)
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!disabled) setOpen((prev) => !prev)
    }
  }

  const triggerClass = bare
    ? `inline-flex h-full w-full min-w-0 items-center px-2 text-left text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40 ${
        isDark ? 'text-slate-100' : 'text-slate-700'
      }`
    : `inline-flex ${compact ? 'h-8' : 'h-9'} w-full min-w-0 items-center rounded-md border ${compact ? 'px-2 text-xs' : 'px-2.5 text-sm'} text-left tabular-nums outline-none transition focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
        isDark
          ? 'border-slate-600 bg-slate-900/60 text-slate-100'
          : 'border-slate-200 bg-white text-slate-700'
      }`

  const panelClass = isDark
    ? 'w-[320px] rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl'
    : 'w-[320px] rounded-xl border border-slate-200 bg-white p-4 shadow-xl'

  const calendar =
    open && coords
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="달력"
            className={panelClass}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              zIndex: 10000,
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="이전 달"
                onClick={goPrevMonth}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                  isDark
                    ? 'text-slate-300 hover:bg-slate-800'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
              <div
                className={`text-base font-semibold tabular-nums ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                {viewYear}년 {viewMonth + 1}월
              </div>
              <button
                type="button"
                aria-label="다음 달"
                onClick={goNextMonth}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                  isDark
                    ? 'text-slate-300 hover:bg-slate-800'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <ChevronRight size={20} aria-hidden />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((label) => (
                <div
                  key={label}
                  className={`py-1 text-center text-xs font-medium ${
                    isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell) => {
                if (cell.day === null || !cell.iso) {
                  return <div key={cell.key} className="h-10" />
                }
                const isSelected = value === cell.iso
                const isToday =
                  cell.iso ===
                  toIsoDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => handleSelect(cell.iso!)}
                    className={`inline-flex h-10 items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                      isSelected
                        ? 'bg-blue-600 text-white hover:bg-blue-600'
                        : isToday
                          ? isDark
                            ? 'bg-slate-800 text-blue-300 hover:bg-slate-700'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          : isDark
                            ? 'text-slate-200 hover:bg-slate-800'
                            : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {cell.day}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex min-w-0 ${
        bare ? 'h-full' : compact ? 'w-[112px] max-w-[112px] shrink-0' : 'w-full'
      } ${className}`}
    >
      <button
        type="button"
        id={inputId}
        disabled={disabled}
        aria-label={ariaLabel ?? '날짜 선택'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={triggerClass}
        style={style}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev)
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={!value ? (isDark ? 'text-slate-500' : 'text-slate-400') : undefined}>
          {formatDisplay(value)}
        </span>
      </button>
      {calendar}
    </div>
  )
}
