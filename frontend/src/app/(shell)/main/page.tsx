'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Thermometer,
  Activity,
  CheckCircle,
  AlertTriangle,
  Send,
} from 'lucide-react'
import { mainApi } from '@/api/mainApi'
import type { MainOverview } from '@/types'

const DEFECT_RATE_THRESHOLD = 2.0

function tempPercent(temp: number) {
  const min = 700
  const max = 850
  return Math.min(100, Math.max(0, ((temp - min) / (max - min)) * 100))
}

function lithiumPercent(value: number) {
  const min = 1.5
  const max = 3.5
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
}

function defectPercent(rate: number) {
  return Math.min(100, Math.max(0, (rate / DEFECT_RATE_THRESHOLD) * 100))
}

function alertStyles(severity: '진행중' | '주의') {
  if (severity === '진행중') {
    return {
      container: 'bg-red-50 border-red-100',
      title: 'text-red-700',
      description: 'text-red-500',
      badge: 'bg-red-100 text-red-600',
    }
  }
  return {
    container: 'bg-yellow-50 border-yellow-100',
    title: 'text-yellow-700',
    description: 'text-yellow-600',
    badge: 'bg-yellow-100 text-yellow-600',
  }
}

export default function MainPage() {
  const [overview, setOverview] = useState<MainOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await mainApi.getOverview()
      setOverview(data.overview)
    } catch {
      setError('메인 대시보드 데이터를 불러오지 못했습니다. 로그인 상태와 백엔드 연결을 확인해주세요.')
      setOverview(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  const kpiCards = useMemo(() => {
    if (!overview) return []

    const { kpi } = overview
    const isDefectDanger = kpi.defectRate > DEFECT_RATE_THRESHOLD

    return [
      {
        title: '현재 소성 온도',
        val: String(Math.round(kpi.sinteringTemp)),
        unit: '°C',
        icon: <Thermometer size={24} className="text-blue-500" />,
        percent: tempPercent(kpi.sinteringTemp),
        color: 'bg-blue-500',
      },
      {
        title: '리튬 투입량',
        val: kpi.lithiumInput.toFixed(2),
        unit: 'kg/h',
        icon: <Activity size={24} className="text-green-500" />,
        percent: lithiumPercent(kpi.lithiumInput),
        color: 'bg-green-500',
      },
      {
        title: '현재 불량률',
        val: kpi.defectRate.toFixed(2),
        unit: '%',
        icon: <AlertTriangle size={24} className="text-red-500" />,
        percent: defectPercent(kpi.defectRate),
        color: 'bg-red-500',
        isDanger: isDefectDanger,
      },
      {
        title: '설비 상태',
        val: kpi.equipmentStatus,
        unit: '',
        icon: <CheckCircle size={24} className="text-blue-500" />,
        percent: 100,
        color: 'bg-blue-400',
      },
    ]
  }, [overview])

  return (
    <div className="h-full w-full flex p-6 gap-6 overflow-hidden text-gray-800">
      <div className="w-[75%] h-full flex flex-col gap-6 overflow-y-auto pr-2 pb-6">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 shrink-0">
            {error}
          </div>
        )}

        <div className="grid grid-cols-4 gap-4 w-full">
          {(loading && !overview
            ? Array.from({ length: 4 }, (_, idx) => ({
                title: '불러오는 중…',
                val: '-',
                unit: '',
                icon: <Activity size={24} className="text-gray-300" />,
                percent: 0,
                color: 'bg-gray-300',
                key: `skeleton-${idx}`,
              }))
            : kpiCards.map((card, idx) => ({ ...card, key: `kpi-${idx}` }))
          ).map((card) => (
            <div
              key={card.key}
              className={`p-5 rounded-2xl shadow-sm border bg-white flex flex-col justify-between min-h-[140px] ${
                card.isDanger ? 'border-red-400 bg-red-50' : 'border-gray-200'
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-gray-600 font-medium text-sm">{card.title}</h3>
                <div className="p-2 bg-gray-50 rounded-full">{card.icon}</div>
              </div>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-bold text-gray-800">{card.val}</span>
                <span className="text-sm text-gray-500 mb-1">{card.unit}</span>
              </div>
              <div className="mt-4 w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${card.color}`}
                  style={{ width: `${card.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-white rounded-2xl shadow-sm border border-blue-100 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Activity className="text-blue-500" size={20} /> AI 추론 및 감소 방안
          </h2>
          <div className="bg-blue-50 p-4 rounded-xl mb-4 border border-blue-100 text-sm text-gray-700">
            {loading && !overview ? (
              <p className="text-gray-400">AI 분석 결과를 불러오는 중…</p>
            ) : (
              <>
                <p>
                  <strong>[원인]</strong> {overview?.aiInsight.cause}
                </p>
                <p className="mt-1 text-gray-500">※ {overview?.aiInsight.probabilityNote}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            {(overview?.aiInsight.suggestions ?? ['온도 740°C 하향 제안']).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="flex-1 py-3 bg-white border-2 border-blue-600 text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition"
              >
                {suggestion}
              </button>
            ))}
            <button
              type="button"
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition"
            >
              작업자 승인 및 즉시 적용
            </button>
          </div>
        </div>

        <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <AlertCircle className="text-red-500" size={20} /> 실시간 이슈 알림
            </h2>
            <span className="text-sm text-gray-500 cursor-pointer hover:underline">전체 보기</span>
          </div>
          <div className="flex flex-col gap-3">
            {loading && !overview ? (
              <p className="text-sm text-gray-400 py-4 text-center">알림을 불러오는 중…</p>
            ) : overview?.alerts.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">현재 표시할 알림이 없습니다.</p>
            ) : (
              overview?.alerts.map((alert) => {
                const styles = alertStyles(alert.severity)
                return (
                  <div
                    key={alert.id}
                    className={`flex justify-between items-center p-4 border rounded-xl ${styles.container}`}
                  >
                    <div className="flex flex-col">
                      <span className={`font-bold ${styles.title}`}>{alert.title}</span>
                      <span className={`text-sm mt-1 ${styles.description}`}>{alert.description}</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${styles.badge}`}>
                      {alert.severity}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="w-[25%] h-full bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <span className="font-bold flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full" /> AI 챗봇
          </span>
        </div>

        <div className="flex-1 p-4 overflow-y-auto bg-gray-50 flex flex-col gap-4">
          <div className="flex flex-col gap-1 max-w-[85%]">
            <span className="text-xs text-gray-500 ml-1">AI 시스템</span>
            <div className="p-3 bg-white border border-gray-200 rounded-2xl rounded-tl-none shadow-sm text-sm text-gray-700 leading-relaxed">
              안녕하세요! 양극재 품질 AI 챗봇입니다.
              <br />
              품질, 공정, LOT 관련 궁금한 점을 물어보세요.
            </div>
          </div>
          <div className="flex flex-col gap-1 max-w-[85%] self-end">
            <span className="text-xs text-gray-500 mr-1 text-right">사용자</span>
            <div className="p-3 bg-blue-600 text-white rounded-2xl rounded-tr-none shadow-sm text-sm leading-relaxed">
              {overview?.latestLot.lotId ?? 'LOT-...'} LOT의 불량 원인은 무엇인가요?
            </div>
          </div>
          <div className="flex flex-col gap-1 max-w-[85%]">
            <span className="text-xs text-gray-500 ml-1">AI 시스템</span>
            <div className="p-3 bg-white border border-gray-200 rounded-2xl rounded-tl-none shadow-sm text-sm text-gray-700 leading-relaxed">
              해당 LOT는 현재{' '}
              <strong>
                {overview?.aiInsight.cause.includes('소성')
                  ? '소성 온도 변동'
                  : '공정 변수 이상'}
              </strong>
              과{' '}
              <strong>
                {overview?.aiInsight.cause.includes('리튬')
                  ? '리튬 투입량 과다'
                  : '품질 지표 변동'}
              </strong>
              이 영향을 준 것으로 분석됩니다.
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-gray-200 bg-white flex items-center gap-2">
          <input
            type="text"
            placeholder="메시지를 입력하세요..."
            className="flex-1 py-2 px-3 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button type="button" className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
