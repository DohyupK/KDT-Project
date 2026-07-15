import React from 'react';
import { 
  Search, Bell, User, BookText, Home, LayoutDashboard, 
  AlertCircle, BookOpen, HelpCircle, Briefcase, Settings, 
  Thermometer, Activity, CheckCircle, AlertTriangle, Send
} from 'lucide-react';

export const MainPage = () => {
  return (
    // 전체 화면 컨테이너 (스크롤 방지)
    <div className="w-screen h-screen flex overflow-hidden text-gray-800 font-sans">
      
      {/* ==========================================
          좌측: Sidebar 영역 (18%)
      ========================================== */}
      <div className="w-[18%] h-full bg-slate-900 text-white flex flex-col p-6">
        <div className="mb-10 font-bold text-xl leading-tight text-blue-400">
          양극재 품질 AI<br />예측 시스템
        </div>
        <ul className="flex flex-col gap-2 flex-1">
          {[
            { name: 'Main', icon: <Home size={20} />, active: true },
            { name: 'Dashboard', icon: <LayoutDashboard size={20} /> },
            { name: 'Issue', icon: <AlertCircle size={20} /> },
            { name: 'Knowledge', icon: <BookOpen size={20} /> },
            { name: 'Inquiry', icon: <HelpCircle size={20} /> },
            { name: 'Management', icon: <Briefcase size={20} /> },
            { name: 'Setting', icon: <Settings size={20} /> },
          ].map((menu, idx) => (
            <li 
              key={idx} 
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                menu.active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {menu.icon}
              <span className="font-medium">{menu.name}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-center gap-2 p-3 bg-slate-800 rounded-lg">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-slate-300">시스템 운영 정상</span>
        </div>
      </div>

      {/* ==========================================
          우측: Content 영역 (82%)
      ========================================== */}
      <div className="w-[82%] h-full bg-gray-50 flex flex-col">
        
        {/* --- 상단: Header 영역 (10%) --- */}
        <div className="h-[10%] w-full bg-white border-b border-gray-200 flex justify-between items-center px-8">
          {/* 검색창 */}
          <div className="w-[40%] relative flex items-center">
            <Search className="absolute left-3 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="LOT ID 또는 조건을 검색하세요..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
          </div>
          {/* 우측 메뉴 */}
          <div className="flex items-center gap-6">
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 transition-colors">
              <BookText size={18} />
              <span>사이트 메뉴얼</span>
            </button>
            <button className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
              <Bell size={24} />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="text-gray-600 font-medium whitespace-nowrap">
              2026-06-25 10:30
            </div>
            <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors bg-gray-200">
              <User size={24} />
            </button>
          </div>
        </div>

        {/* --- 하단: Body 영역 (90%) --- */}
        <div className="h-[90%] w-full flex p-6 gap-6 overflow-hidden">
          
          {/* [Body-Left] 메인 위젯 영역 (75%) */}
          <div className="w-[75%] h-full flex flex-col gap-6 overflow-y-auto pr-2 pb-6">
            
            {/* 1. 시스템 상태 카드 (StatusCards) */}
            <div className="grid grid-cols-4 gap-4 w-full">
              {[
                { title: '현재 소성 온도', val: '748', unit: '°C', icon: <Thermometer size={24} className="text-blue-500"/>, percent: 90, color: 'bg-blue-500' },
                { title: '리튬 투입량', val: '2.85', unit: 'kg/h', icon: <Activity size={24} className="text-green-500"/>, percent: 75, color: 'bg-green-500' },
                { title: '현재 불량률', val: '2.35', unit: '%', icon: <AlertTriangle size={24} className="text-red-500"/>, percent: 100, color: 'bg-red-500', isDanger: true },
                { title: '설비 상태', val: '가동 중', unit: '', icon: <CheckCircle size={24} className="text-blue-500"/>, percent: 100, color: 'bg-blue-400' },
              ].map((card, idx) => (
                <div key={idx} className={`p-5 rounded-2xl shadow-sm border bg-white flex flex-col justify-between min-h-[140px] ${card.isDanger ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-gray-600 font-medium text-sm">{card.title}</h3>
                    <div className="p-2 bg-gray-50 rounded-full">{card.icon}</div>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-bold text-gray-800">{card.val}</span>
                    <span className="text-sm text-gray-500 mb-1">{card.unit}</span>
                  </div>
                  <div className="mt-4 w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${card.color}`} style={{ width: `${card.percent}%` }}></div>
                  </div>
                </div>
              ))}
            </div>

            {/* 2. AI 불량률 감소 방안 (AIRecommendation) */}
            <div className="p-6 bg-white rounded-2xl shadow-sm border border-blue-100 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Activity className="text-blue-500" size={20} /> AI 추론 및 감소 방안
              </h2>
              <div className="bg-blue-50 p-4 rounded-xl mb-4 border border-blue-100 text-sm text-gray-700">
                <p><strong>[원인]</strong> 소성 온도 상한 초과 (748°C) 및 리튬 투입량 과다 (3.05 kg/h)</p>
                <p className="mt-1 text-gray-500">※ 과거 데이터 분석 결과, 현재 패턴은 불량률 2.5% 도달 확률이 95%입니다.</p>
              </div>
              <div className="flex items-center gap-4">
                <button className="flex-1 py-3 bg-white border-2 border-blue-600 text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition">
                  온도 740°C 하향 제안
                </button>
                <button className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition">
                  작업자 승인 및 즉시 적용
                </button>
              </div>
            </div>

            {/* 3. 이슈 알림 (IssueAlert) */}
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
                    <span className="text-sm text-red-500 mt-1">LOT L240519-045 | 불량률 2.35% (상한 2.0% 초과)</span>
                  </div>
                  <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold">진행중</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-yellow-50 border border-yellow-100 rounded-xl">
                  <div className="flex flex-col">
                    <span className="font-bold text-yellow-700">예측 위험도 높음</span>
                    <span className="text-sm text-yellow-600 mt-1">LOT L240519-048 | 10분 뒤 예측 불량률 2.10%</span>
                  </div>
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-600 rounded-full text-xs font-bold">주의</span>
                </div>
              </div>
            </div>
          </div>

          {/* [Body-Right] 챗봇 패널 영역 (25%) */}
          <div className="w-[25%] h-full bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <span className="font-bold flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div> AI 챗봇
              </span>
            </div>
            
            {/* 채팅 내용 영역 */}
            <div className="flex-1 p-4 overflow-y-auto bg-gray-50 flex flex-col gap-4">
              <div className="flex flex-col gap-1 max-w-[85%]">
                <span className="text-xs text-gray-500 ml-1">AI 시스템</span>
                <div className="p-3 bg-white border border-gray-200 rounded-2xl rounded-tl-none shadow-sm text-sm text-gray-700 leading-relaxed">
                  안녕하세요! 양극재 품질 AI 챗봇입니다.<br/>품질, 공정, LOT 관련 궁금한 점을 물어보세요.
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
                  해당 LOT는 현재 <strong>소성 온도 변동</strong>과 <strong>리튬 투입량 과다</strong>가 영향을 준 것으로 분석됩니다.
                </div>
              </div>
            </div>

            {/* 입력 영역 */}
            <div className="p-3 border-t border-gray-200 bg-white flex items-center gap-2">
              <input 
                type="text" 
                placeholder="메시지를 입력하세요..." 
                className="flex-1 py-2 px-3 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition">
                <Send size={18} />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};