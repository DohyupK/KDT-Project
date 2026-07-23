import {
  AlertCircle,
  Thermometer,
  Activity,
  CheckCircle,
  AlertTriangle,
  Send,
} from 'lucide-react'

export default function MainPage() {
  return (
    <div className="h-full w-full flex p-6 gap-6 overflow-hidden text-gray-800">
      <div className="w-[75%] h-full flex flex-col gap-6 overflow-y-auto pr-2 pb-6">
        <div className="grid grid-cols-4 gap-4 w-full">
          {[
            {
              title: '현재 소성 온도',
              val: '748',
              unit: '°C',
              icon: <Thermometer size={24} className="text-blue-500" />,
              percent: 90,
              color: 'bg-blue-500',
            },
            {
              title: '리튬 투입량',
              val: '2.85',
              unit: 'kg/h',
              icon: <Activity size={24} className="text-green-500" />,
              percent: 75,
              color: 'bg-green-500',
            },
            {
              title: '현재 불량률',
              val: '2.35',
              unit: '%',
              icon: <AlertTriangle size={24} className="text-red-500" />,
              percent: 100,
              color: 'bg-red-500',
              isDanger: true,
            },
            {
              title: '설비 상태',
              val: '가동 중',
              unit: '',
              icon: <CheckCircle size={24} className="text-blue-500" />,
              percent: 100,
              color: 'bg-blue-400',
            },
          ].map((card, idx) => (
            <div
              key={idx}
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
                <div className={`h-1.5 rounded-full ${card.color}`} style={{ width: `${card.percent}%` }} />
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
            <p>
              <strong>[원인]</strong> 소성 온도 상한 초과 (748°C) 및 리튬 투입량 과다 (3.05 kg/h)
            </p>
            <p className="mt-1 text-gray-500">
              ※ 과거 데이터 분석 결과, 현재 패턴은 불량률 2.5% 도달 확률이 95%입니다.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex-1 py-3 bg-white border-2 border-blue-600 text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition"
            >
              온도 740°C 하향 제안
            </button>
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
            <div className="flex justify-between items-center p-4 bg-red-50 border border-red-100 rounded-xl">
              <div className="flex flex-col">
                <span className="font-bold text-red-700">불량률 초과 발생</span>
                <span className="text-sm text-red-500 mt-1">
                  LOT L240519-045 | 불량률 2.35% (상한 2.0% 초과)
                </span>
              </div>
              <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold">
                진행중
              </span>
            </div>
            <div className="flex justify-between items-center p-4 bg-yellow-50 border border-yellow-100 rounded-xl">
              <div className="flex flex-col">
                <span className="font-bold text-yellow-700">예측 위험도 높음</span>
                <span className="text-sm text-yellow-600 mt-1">
                  LOT L240519-048 | 10분 뒤 예측 불량률 2.10%
                </span>
              </div>
              <span className="px-3 py-1 bg-yellow-100 text-yellow-600 rounded-full text-xs font-bold">
                주의
              </span>
            </div>
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
              L240519-045 LOT의 불량 원인은 무엇인가요?
            </div>
          </div>
          <div className="flex flex-col gap-1 max-w-[85%]">
            <span className="text-xs text-gray-500 ml-1">AI 시스템</span>
            <div className="p-3 bg-white border border-gray-200 rounded-2xl rounded-tl-none shadow-sm text-sm text-gray-700 leading-relaxed">
              해당 LOT는 현재 <strong>소성 온도 변동</strong>과 <strong>리튬 투입량 과다</strong>가
              영향을 준 것으로 분석됩니다.
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
