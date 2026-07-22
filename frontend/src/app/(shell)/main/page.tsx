'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react';

type StatusTone = '정상' | '주의' | '위험' | '이상' | '경고';

type FilterState = {
  period: string;
  product: string;
  line: string;
};

type KPIItem = {
  id: string;
  title: string;
  value: string;
  description: string;
  tone: StatusTone;
};

type TrendPoint = {
  time: string;
  production: number;
  passRate: number;
  failRate: number;
  riskIndex: number;
};

type RiskLot = {
  id: string;
  product: string;
  line: string;
  cause: string;
  riskScore: number;
  status: StatusTone;
};

type ProcessParam = {
  id: string;
  name: string;
  value: string;
  unit: string;
  status: StatusTone;
};

type LineStatus = {
  id: string;
  name: string;
  status: StatusTone;
  note: string;
};

type EventLog = {
  id: string;
  time: string;
  category: string;
  target: string;
  message: string;
  status: StatusTone;
};

type ToastItem = {
  id: number;
  message: string;
};

type ChatRole = 'user' | 'ai';

type ChatMessage = {
  id: number;
  role: ChatRole;
  text: string;
};

type NotificationItem = {
  id: string;
  time: string;
  title: string;
  message: string;
  unread: boolean;
};

type Theme = {
  bg: string;
  panel: string;
  panelAlt: string;
  line: string;
  text: string;
  muted: string;
  blue: string;
  green: string;
  orange: string;
  red: string;
  yellow: string;
};

const theme: Theme = {
  bg: '#ffffff',
  panel: '#ffffff',
  panelAlt: '#f8fafc',
  line: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  blue: '#3b82f6',
  green: '#22c55e',
  orange: '#f59e0b',
  red: '#ef4444',
  yellow: '#eab308',
};

const DEFAULT_FILTER: FilterState = {
  period: '오늘',
  product: '전체',
  line: '전체',
};

const PERIOD_OPTIONS = ['오늘', '최근 8시간', '최근 24시간', '이번 주'] as const;
const PRODUCT_OPTIONS = ['전체', 'NCM811', 'NCA', 'LFP'] as const;
const LINE_OPTIONS = ['전체', 'Line 1', 'Line 2', 'Line 3'] as const;

const SUGGESTED_QUESTIONS = [
  '현재 위험 LOT 알려줘',
  '오늘 불량률 요약해줘',
  '소성 온도 이상 원인 분석',
] as const;

const QUICK_ACTIONS = ['인수인계 보고서 생성', '품질 이슈 등록', '문의하기'] as const;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatDateTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toneColor(tone: StatusTone) {
  if (tone === '정상') return theme.green;
  if (tone === '주의' || tone === '경고') return theme.orange;
  if (tone === '이상') return theme.yellow;
  return theme.red;
}

function randomInRange(min: number, max: number) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function riskRank(status: StatusTone) {
  if (status === '위험') return 3;
  if (status === '이상' || status === '경고') return 2;
  if (status === '주의') return 1;
  return 0;
}

function buildTrendData(seed: number): TrendPoint[] {
  const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
  return hours.map((time, index) => {
    const wobble = ((seed + index * 17) % 9) / 10;
    const failRate = Math.round((1.2 + wobble + (index % 3 === 0 ? 1.1 : 0)) * 10) / 10;
    const passRate = Math.round((100 - failRate) * 10) / 10;
    const production = Math.round(38 + wobble * 20 + index * 2.4);
    const riskIndex = Math.round((0.12 + failRate * 0.04 + wobble * 0.05) * 100) / 100;
    return { time, production, passRate, failRate, riskIndex };
  });
}

function buildRiskLots(seed: number): RiskLot[] {
  const base: RiskLot[] = [
    {
      id: 'LOT-20260722-N04',
      product: 'NCM811',
      line: 'Line 2',
      cause: '소성 3구역 온도 상승, O2 농도 저하',
      riskScore: 0.86,
      status: '위험',
    },
    {
      id: 'LOT-20260722-N07',
      product: 'NCA',
      line: 'Line 1',
      cause: '혼합 RPM 변동',
      riskScore: 0.64,
      status: '주의',
    },
    {
      id: 'LOT-20260722-N11',
      product: 'LFP',
      line: 'Line 3',
      cause: 'N2 농도 일시 저하',
      riskScore: 0.58,
      status: '주의',
    },
    {
      id: 'LOT-20260722-N15',
      product: 'NCM811',
      line: 'Line 2',
      cause: '원료 투입비 편차',
      riskScore: 0.71,
      status: '경고',
    },
  ];

  return base
    .map((lot, index) => ({
      ...lot,
      riskScore: Math.round((lot.riskScore + ((seed + index) % 5) * 0.01) * 100) / 100,
    }))
    .sort((a, b) => b.riskScore - a.riskScore || riskRank(b.status) - riskRank(a.status));
}

function buildParams(seed: number): ProcessParam[] {
  const sintering = Math.round(742 + ((seed % 7) - 2) * 1.4);
  const o2 = Math.round((20.1 + ((seed % 5) - 2) * 0.18) * 10) / 10;
  const n2 = Math.round((78.2 + ((seed % 4) - 1) * 0.3) * 10) / 10;
  const rpm = Math.round(124 + ((seed % 6) - 2) * 1.8);
  const feed = Math.round((1.02 + ((seed % 5) - 2) * 0.01) * 100) / 100;
  const load = Math.round(72 + ((seed % 8) - 3) * 1.5);

  const items: ProcessParam[] = [
    {
      id: 'temp',
      name: '소성 온도',
      value: String(sintering),
      unit: '℃',
      status: sintering > 750 ? '이상' : sintering > 746 ? '주의' : '정상',
    },
    {
      id: 'o2',
      name: 'O2 농도',
      value: String(o2),
      unit: '%',
      status: o2 < 19.5 ? '주의' : '정상',
    },
    {
      id: 'n2',
      name: 'N2 농도',
      value: String(n2),
      unit: '%',
      status: n2 < 77 ? '주의' : '정상',
    },
    {
      id: 'rpm',
      name: '혼합 RPM',
      value: String(rpm),
      unit: 'rpm',
      status: rpm > 130 ? '주의' : '정상',
    },
    {
      id: 'feed',
      name: '원료 투입비',
      value: String(feed),
      unit: 'Li/TM',
      status: feed > 1.05 ? '주의' : '정상',
    },
    {
      id: 'load',
      name: '설비 부하',
      value: String(load),
      unit: '%',
      status: load > 85 ? '이상' : load > 78 ? '주의' : '정상',
    },
  ];
  return items;
}

function buildLineStatuses(seed: number): LineStatus[] {
  const tones: StatusTone[] = ['정상', '경고', '주의', '정상'];
  return [
    { id: 'l1', name: 'Line 1', status: tones[seed % 4], note: '혼합·코팅 안정' },
    { id: 'l2', name: 'Line 2', status: seed % 3 === 0 ? '위험' : '경고', note: '소성/분위기 점검' },
    { id: 'l3', name: 'Line 3', status: '정상', note: '목표 대비 양호' },
    { id: 'f1', name: '소성로 A', status: seed % 2 === 0 ? '주의' : '정상', note: '3구역 온도 모니터링' },
  ];
}

function buildEvents(seed: number): EventLog[] {
  const list: EventLog[] = [
    {
      id: `e-${seed}-1`,
      time: '10:42',
      category: '경고',
      target: 'Line 2',
      message: 'Line 2 O2 농도 저하 경고',
      status: '경고',
    },
    {
      id: `e-${seed}-2`,
      time: '10:55',
      category: '품질',
      target: 'LOT-240722-021',
      message: 'LOT-240722-021 불합격 예측 상승',
      status: '주의',
    },
    {
      id: `e-${seed}-3`,
      time: '11:03',
      category: '공정',
      target: '소성로 A',
      message: '소성 3구역 온도 상한 근접',
      status: '위험',
    },
    {
      id: `e-${seed}-4`,
      time: '11:18',
      category: '생산',
      target: 'Line 1',
      message: 'Line 1 시간당 생산량 목표 달성',
      status: '정상',
    },
    {
      id: `e-${seed}-5`,
      time: '11:27',
      category: '설비',
      target: '혼합기 B',
      message: '혼합 RPM 편차 +4.2% 감지',
      status: '주의',
    },
    {
      id: `e-${seed}-6`,
      time: '11:41',
      category: '품질',
      target: 'LOT-20260722-N04',
      message: '위험 LOT 사전 경고 발송',
      status: '위험',
    },
    {
      id: `e-${seed}-7`,
      time: '11:58',
      category: '공정',
      target: 'Line 3',
      message: 'N2 공급 압력 정상 회복',
      status: '정상',
    },
    {
      id: `e-${seed}-8`,
      time: '12:06',
      category: '경고',
      target: '소성로 A',
      message: '분위기 가스 유량 미세 변동',
      status: '경고',
    },
  ];
  return list;
}

function buildKpis(riskLots: RiskLot[], trend: TrendPoint[], seed: number): KPIItem[] {
  const totalLots = Math.round(118 + (seed % 12));
  const passRate = Math.round((97.2 + (seed % 8) * 0.1) * 10) / 10;
  const riskCount = riskLots.filter((lot) => lot.riskScore >= 0.6).length;
  const avgRisk =
    Math.round((trend.reduce((sum, point) => sum + point.riskIndex, 0) / Math.max(trend.length, 1)) * 100) /
    100;
  const production = Math.round((82 + (seed % 10) * 0.4) * 10) / 10;
  const faultCount = 1 + (seed % 3);

  return [
    {
      id: 'lots',
      title: '총 생산 LOT 수',
      value: `${totalLots}`,
      description: '금일 라인 합산 생산 LOT',
      tone: '정상',
    },
    {
      id: 'pass',
      title: '합격률',
      value: `${passRate.toFixed(1)}%`,
      description: 'AI 예측 기준 합격률',
      tone: passRate >= 97.5 ? '정상' : '주의',
    },
    {
      id: 'risk',
      title: '위험 LOT 수',
      value: `${riskCount}건`,
      description: '즉시 조치 권고 대상',
      tone: riskCount >= 4 ? '위험' : riskCount >= 2 ? '주의' : '정상',
    },
    {
      id: 'avgRisk',
      title: '평균 위험지수',
      value: avgRisk.toFixed(2),
      description: '시간대별 Risk Index 평균',
      tone: avgRisk >= 0.28 ? '위험' : avgRisk >= 0.2 ? '주의' : '정상',
    },
    {
      id: 'goal',
      title: '목표 대비 생산량',
      value: `${production.toFixed(1)}%`,
      description: '계획 대비 실적 달성률',
      tone: production >= 85 ? '정상' : '주의',
    },
    {
      id: 'fault',
      title: '설비 이상 건수',
      value: `${faultCount}건`,
      description: '금일 설비 이상/경고 합계',
      tone: faultCount >= 3 ? '위험' : faultCount >= 2 ? '주의' : '정상',
    },
  ];
}

function buildAiReply(input: string, riskLots: RiskLot[], kpis: KPIItem[]) {
  const text = input.toLowerCase();
  const topRisk = riskLots[0];
  const pass = kpis.find((item) => item.id === 'pass')?.value ?? '97.8%';
  const riskCount = kpis.find((item) => item.id === 'risk')?.value ?? '4건';

  if (text.includes('위험') || text.includes('lot')) {
    return `현재 우선 조치 대상은 ${topRisk?.id ?? 'LOT-20260722-N04'}입니다. 제품 ${topRisk?.product ?? 'NCM811'} / ${topRisk?.line ?? 'Line 2'}에서 "${topRisk?.cause ?? '소성 온도·O2 편차'}"가 확인되었습니다. 위험도 ${topRisk?.riskScore ?? 0.86} 기준으로 즉시 점검이 필요합니다.`;
  }
  if (text.includes('불량') || text.includes('합격') || text.includes('요약')) {
    return `오늘 기준 합격률은 ${pass}, 위험 LOT는 ${riskCount}입니다. 불량 기여 인자는 소성 3구역 온도 편차와 O2 농도 저하가 큽니다. 야간 교대 전 인수인계에 해당 LOT를 명시하세요.`;
  }
  if (text.includes('온도') || text.includes('소성')) {
    return '소성 온도 이상 시 1) 3구역 설정온도 -5~-10℃ 조정, 2) O2 공급량 소폭 상향, 3) 15분 후 Risk Index 재확인 순서로 조치하세요. 상한 근접 상태가 지속되면 설비 점검 티켓을 생성합니다.';
  }
  return '질문을 확인했습니다. 위험 LOT, 불량률, 소성 온도 관련 질문을 주시면 현재 대시보드 기준으로 바로 요약해 드리겠습니다.';
}

function TrendChart({ data }: { data: TrendPoint[] }) {
  const width = 640;
  const height = 280;
  const pad = { top: 22, right: 18, bottom: 36, left: 42 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxProd = Math.max(...data.map((d) => d.production), 1);
  const maxRisk = Math.max(...data.map((d) => d.riskIndex), 0.01);
  const barW = (innerW / data.length) * 0.42;

  const riskPoints = data
    .map((d, i) => {
      const x = pad.left + (i + 0.5) * (innerW / data.length);
      const y = pad.top + innerH - (d.riskIndex / maxRisk) * innerH;
      return `${x},${y}`;
    })
    .join(' ');

  const passPoints = data
    .map((d, i) => {
      const x = pad.left + (i + 0.5) * (innerW / data.length);
      const y = pad.top + innerH - (d.passRate / 100) * innerH;
      return `${x},${y}`;
    })
    .join(' ');

  const latest = data[data.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = pad.top + innerH - ratio * innerH;
          return (
            <g key={ratio}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke={theme.line} strokeWidth={1} />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fill={theme.muted} fontSize="11">
                {Math.round(maxProd * ratio)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const x = pad.left + i * (innerW / data.length) + (innerW / data.length - barW) / 2;
          const h = (d.production / maxProd) * innerH;
          return (
            <g key={d.time}>
              <rect
                x={x}
                y={pad.top + innerH - h}
                width={barW}
                height={h}
                rx={4}
                fill={theme.blue}
                opacity={0.75}
              />
              <text x={x + barW / 2} y={height - 12} textAnchor="middle" fill={theme.muted} fontSize="11">
                {d.time}
              </text>
            </g>
          );
        })}

        <polyline
          fill="none"
          stroke={theme.green}
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={passPoints}
        />
        <polyline
          fill="none"
          stroke={theme.orange}
          strokeWidth={2.4}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={riskPoints}
        />
        {data.map((d, i) => {
          const x = pad.left + (i + 0.5) * (innerW / data.length);
          const y = pad.top + innerH - (d.riskIndex / maxRisk) * innerH;
          return <circle key={`r-${d.time}`} cx={x} cy={y} r={3.2} fill={theme.orange} />;
        })}
      </svg>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 10,
          fontSize: 12,
          color: theme.muted,
          alignItems: 'center',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: theme.blue }} />
          생산량
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 3, borderRadius: 999, background: theme.green }} />
          합격률
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 3, borderRadius: 999, background: theme.orange }} />
          위험지수
        </span>
        <span style={{ marginLeft: 'auto', color: theme.text, fontWeight: 700 }}>
          현재 생산 {latest.production} · 합격 {latest.passRate}% · Risk {latest.riskIndex}
        </span>
      </div>
    </div>
  );
}

export default function MainPage() {
  const [now, setNow] = useState(() => formatDateTime(new Date()));
  const [isNarrow, setIsNarrow] = useState(false);
  const [seed, setSeed] = useState(7);
  const [draftFilter, setDraftFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [appliedFilter, setAppliedFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [hovered, setHovered] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNotifyOpen, setIsNotifyOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'n1',
      time: '11:03',
      title: '위험 LOT 경고',
      message: 'LOT-20260722-N04 소성 3구역 온도 상한 근접',
      unread: true,
    },
    {
      id: 'n2',
      time: '10:55',
      title: '품질 예측',
      message: 'LOT-240722-021 불합격 예측 상승',
      unread: true,
    },
    {
      id: 'n3',
      time: '10:42',
      title: '라인 경고',
      message: 'Line 2 O2 농도 저하 경고',
      unread: false,
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'ai',
      text: '안녕하세요. AI 공정 지원 챗봇입니다. 위험 LOT, 불량률, 소성 온도에 대해 질문해 주세요.',
    },
  ]);

  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chatIdRef = useRef(2);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyPanelRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.unread).length,
    [notifications],
  );

  const trendData = useMemo(() => buildTrendData(seed), [seed]);
  const riskLots = useMemo(() => buildRiskLots(seed), [seed]);
  const params = useMemo(() => buildParams(seed), [seed]);
  const lineStatuses = useMemo(() => buildLineStatuses(seed), [seed]);
  const events = useMemo(() => buildEvents(seed), [seed]);
  const kpis = useMemo(() => buildKpis(riskLots, trendData, seed), [riskLots, trendData, seed]);

  const filteredRiskLots = useMemo(() => {
    return riskLots.filter((lot) => {
      const productOk = appliedFilter.product === '전체' || lot.product === appliedFilter.product;
      const lineOk = appliedFilter.line === '전체' || lot.line === appliedFilter.line;
      return productOk && lineOk;
    });
  }, [riskLots, appliedFilter]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (appliedFilter.line === '전체') return true;
      return event.target.includes(appliedFilter.line) || event.message.includes(appliedFilter.line);
    });
  }, [events, appliedFilter]);

  useEffect(() => {
    const timer = setInterval(() => setNow(formatDateTime(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < 980);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!isChatOpen) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatOpen]);

  useEffect(() => {
    if (!isNotifyOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (notifyPanelRef.current && target && !notifyPanelRef.current.contains(target)) {
        setIsNotifyOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isNotifyOpen]);

  useEffect(() => {
    return () => {
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
      toastTimersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const pushToast = (message: string) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { id, message }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 2600);
    toastTimersRef.current.push(timer);
  };

  const handleRefresh = () => {
    setSeed((prev) => prev + 1 + Math.floor(randomInRange(1, 4)));
    pushToast('대시보드 데이터가 갱신되었습니다.');
  };

  const handleSearch = () => {
    setAppliedFilter({ ...draftFilter });
    setSeed((prev) => prev + 1);
    pushToast(
      `필터 적용: ${draftFilter.period} / ${draftFilter.product} / ${draftFilter.line}`,
    );
  };

  const handleResetFilter = () => {
    setDraftFilter(DEFAULT_FILTER);
    setAppliedFilter(DEFAULT_FILTER);
    setSeed(7);
    pushToast('필터가 초기화되었습니다.');
  };

  const toggleNotifyPanel = () => {
    setIsNotifyOpen((prev) => {
      const next = !prev;
      if (next) setIsChatOpen(false);
      return next;
    });
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, unread: false } : item)),
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, unread: false })));
  };

  const sendMessage = (raw: string) => {
    const text = raw.trim();
    if (!text) return;

    chatIdRef.current += 1;
    setMessages((prev) => [...prev, { id: chatIdRef.current, role: 'user', text }]);
    setChatInput('');

    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    const delay = 500 + Math.floor(Math.random() * 400);
    replyTimerRef.current = setTimeout(() => {
      chatIdRef.current += 1;
      setMessages((prev) => [
        ...prev,
        { id: chatIdRef.current, role: 'ai', text: buildAiReply(text, filteredRiskLots, kpis) },
      ]);
    }, delay);
  };

  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage(chatInput);
  };

  const handleChatKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(chatInput);
    }
  };

  const pageStyle: CSSProperties = {
    height: '100%',
    overflowY: 'auto',
    boxSizing: 'border-box',
    background: theme.bg,
    color: theme.text,
    padding: isNarrow ? '18px 14px 110px' : '24px 22px 120px',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', Arial, sans-serif",
  };

  const panelStyle: CSSProperties = {
    background: theme.panel,
    border: `1px solid ${theme.line}`,
    borderRadius: 16,
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
  };

  const gridTwo: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isNarrow ? '1fr' : '1.25fr 1fr',
    gap: 14,
  };

  const selectStyle: CSSProperties = {
    border: `1px solid ${theme.line}`,
    borderRadius: 10,
    background: theme.panelAlt,
    color: theme.text,
    padding: '9px 12px',
    fontSize: 13,
    minWidth: isNarrow ? '100%' : 140,
  };

  const labelStyle: CSSProperties = {
    display: 'grid',
    gap: 6,
    fontSize: 12,
    color: theme.muted,
    fontWeight: 700,
    flex: isNarrow ? '1 1 100%' : '0 0 auto',
  };

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1480, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 14,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: isNarrow ? 24 : 30, letterSpacing: '-0.03em' }}>
              종합 공정 대시보드
            </h1>
            <p style={{ margin: '8px 0 0', color: theme.muted, fontSize: 14, lineHeight: 1.55 }}>
              생산 현황, 품질 위험, 공정 상태, 최근 이벤트를 통합 모니터링
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                ...panelStyle,
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {now}
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              onMouseEnter={() => setHovered('refresh')}
              onMouseLeave={() => setHovered(null)}
              style={{
                border: 0,
                borderRadius: 12,
                padding: '10px 16px',
                background: hovered === 'refresh' ? '#2563eb' : theme.blue,
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: hovered === 'refresh' ? '0 8px 18px rgba(37,99,235,0.4)' : 'none',
              }}
            >
              새로고침
            </button>
            <div ref={notifyPanelRef} style={{ position: 'relative' }}>
              <button
                type="button"
                aria-label="알림"
                aria-expanded={isNotifyOpen}
                onMouseEnter={() => setHovered('notify')}
                onMouseLeave={() => setHovered(null)}
                onClick={toggleNotifyPanel}
                style={{
                  position: 'relative',
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  border: `1px solid ${
                    isNotifyOpen || hovered === 'notify' ? theme.blue : theme.line
                  }`,
                  background:
                    isNotifyOpen || hovered === 'notify' ? theme.panelAlt : theme.panel,
                  color: theme.text,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M12 3a5.5 5.5 0 0 0-5.5 5.5v2.1c0 .7-.2 1.4-.6 2L4.7 14.4a1.2 1.2 0 0 0 1 1.9h12.6a1.2 1.2 0 0 0 1-1.9l-1.2-1.8c-.4-.6-.6-1.3-.6-2V8.5A5.5 5.5 0 0 0 12 3Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9.2 17.6a2.8 2.8 0 0 0 5.6 0"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                {unreadCount > 0 ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 999,
                      background: theme.red,
                      color: '#fff',
                      border: `2px solid ${theme.panel}`,
                      fontSize: 10,
                      fontWeight: 800,
                      lineHeight: '12px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 3px',
                    }}
                  >
                    {unreadCount}
                  </span>
                ) : null}
              </button>

              {isNotifyOpen ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 50,
                    right: 0,
                    width: 'min(92vw, 340px)',
                    zIndex: 50,
                    ...panelStyle,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 14px',
                      borderBottom: `1px solid ${theme.line}`,
                      background: theme.panelAlt,
                    }}
                  >
                    <strong style={{ fontSize: 14 }}>알림</strong>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        style={{
                          border: `1px solid ${theme.line}`,
                          borderRadius: 8,
                          background: theme.panel,
                          color: theme.muted,
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '5px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        모두 읽음
                      </button>
                      <button
                        type="button"
                        aria-label="알림 닫기"
                        onClick={() => setIsNotifyOpen(false)}
                        style={{
                          border: 0,
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: theme.panel,
                          color: theme.text,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        X
                      </button>
                    </div>
                  </div>

                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div
                        style={{
                          padding: 20,
                          textAlign: 'center',
                          color: theme.muted,
                          fontSize: 13,
                        }}
                      >
                        새 알림이 없습니다.
                      </div>
                    ) : (
                      notifications.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => markNotificationRead(item.id)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            border: 0,
                            borderBottom: `1px solid ${theme.line}`,
                            background: item.unread ? 'rgba(59,130,246,0.08)' : theme.panel,
                            padding: '12px 14px',
                            cursor: 'pointer',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 8,
                              marginBottom: 4,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 800,
                                color: theme.text,
                              }}
                            >
                              {item.title}
                            </span>
                            <span style={{ fontSize: 11, color: theme.muted }}>{item.time}</span>
                          </div>
                          <div style={{ fontSize: 12, color: theme.muted, lineHeight: 1.5 }}>
                            {item.message}
                          </div>
                          {item.unread ? (
                            <span
                              style={{
                                display: 'inline-block',
                                marginTop: 8,
                                fontSize: 10,
                                fontWeight: 800,
                                color: theme.blue,
                              }}
                            >
                              NEW
                            </span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <a
              href="/login"
              aria-label="프로필"
              onMouseEnter={() => setHovered('profile')}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                height: 42,
                padding: '0 12px 0 8px',
                borderRadius: 999,
                border: `1px solid ${hovered === 'profile' ? theme.blue : theme.line}`,
                background: hovered === 'profile' ? theme.panelAlt : theme.panel,
                color: theme.text,
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: 'rgba(59,130,246,0.2)',
                  color: theme.blue,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                나
              </span>
              프로필
            </a>
          </div>
        </header>

        <section
          style={{
            ...panelStyle,
            padding: 14,
            marginBottom: 14,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <label style={labelStyle}>
            기간
            <select
              value={draftFilter.period}
              onChange={(e) => setDraftFilter((prev) => ({ ...prev, period: e.target.value }))}
              style={selectStyle}
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            제품
            <select
              value={draftFilter.product}
              onChange={(e) => setDraftFilter((prev) => ({ ...prev, product: e.target.value }))}
              style={selectStyle}
            >
              {PRODUCT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            라인
            <select
              value={draftFilter.line}
              onChange={(e) => setDraftFilter((prev) => ({ ...prev, line: e.target.value }))}
              style={selectStyle}
            >
              {LINE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, marginLeft: isNarrow ? 0 : 'auto' }}>
            <button
              type="button"
              onClick={handleSearch}
              onMouseEnter={() => setHovered('search')}
              onMouseLeave={() => setHovered(null)}
              style={{
                border: 0,
                borderRadius: 10,
                padding: '10px 16px',
                background: hovered === 'search' ? '#2563eb' : theme.blue,
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              검색
            </button>
            <button
              type="button"
              onClick={handleResetFilter}
              onMouseEnter={() => setHovered('reset')}
              onMouseLeave={() => setHovered(null)}
              style={{
                border: `1px solid ${theme.line}`,
                borderRadius: 10,
                padding: '10px 16px',
                background: hovered === 'reset' ? theme.panelAlt : 'transparent',
                color: theme.text,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              초기화
            </button>
          </div>
          <div style={{ width: '100%', fontSize: 12, color: theme.muted }}>
            적용 필터: {appliedFilter.period} · {appliedFilter.product} · {appliedFilter.line}
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: isNarrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(6, minmax(0, 1fr))',
            gap: 12,
            marginBottom: 14,
          }}
        >
          {kpis.map((kpi) => {
            const active = hovered === `kpi-${kpi.id}`;
            return (
              <div
                key={kpi.id}
                onMouseEnter={() => setHovered(`kpi-${kpi.id}`)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  ...panelStyle,
                  padding: 14,
                  transform: active ? 'translateY(-2px)' : 'none',
                  borderColor: active ? toneColor(kpi.tone) : theme.line,
                  background: active ? theme.panelAlt : theme.panel,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ color: theme.muted, fontSize: 12, fontWeight: 700 }}>{kpi.title}</div>
                  <span
                    style={{
                      borderRadius: 999,
                      padding: '3px 8px',
                      fontSize: 10,
                      fontWeight: 800,
                      color: '#0b1220',
                      background: toneColor(kpi.tone),
                    }}
                  >
                    {kpi.tone}
                  </span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em' }}>{kpi.value}</div>
                <div style={{ marginTop: 6, color: theme.muted, fontSize: 11, lineHeight: 1.45 }}>
                  {kpi.description}
                </div>
              </div>
            );
          })}
        </section>

        <section style={{ ...gridTwo, marginBottom: 14 }}>
          <div style={{ ...panelStyle, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17 }}>시간별 생산 / 판정 / 위험도 추이</h2>
                <p style={{ margin: '6px 0 0', color: theme.muted, fontSize: 12 }}>
                  생산량 · 합격률 · 위험지수 시계열
                </p>
              </div>
            </div>
            <TrendChart data={trendData} />
          </div>

          <div style={{ ...panelStyle, padding: 16 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 17 }}>위험 LOT / 이상 대상 Top</h2>
            <p style={{ margin: '0 0 12px', color: theme.muted, fontSize: 12 }}>
              위험도 높은 순 · 즉시 조치 권고
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr style={{ color: theme.muted, fontSize: 11, textAlign: 'left' }}>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${theme.line}` }}>LOT</th>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${theme.line}` }}>제품</th>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${theme.line}` }}>라인</th>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${theme.line}` }}>위험 원인</th>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${theme.line}` }}>위험도</th>
                    <th style={{ padding: '8px 6px', borderBottom: `1px solid ${theme.line}` }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRiskLots.map((lot) => (
                    <tr key={lot.id} style={{ fontSize: 12 }}>
                      <td style={{ padding: '10px 6px', borderBottom: `1px solid ${theme.line}`, fontWeight: 700 }}>
                        {lot.id}
                      </td>
                      <td style={{ padding: '10px 6px', borderBottom: `1px solid ${theme.line}` }}>{lot.product}</td>
                      <td style={{ padding: '10px 6px', borderBottom: `1px solid ${theme.line}` }}>{lot.line}</td>
                      <td style={{ padding: '10px 6px', borderBottom: `1px solid ${theme.line}`, color: theme.muted }}>
                        {lot.cause}
                      </td>
                      <td style={{ padding: '10px 6px', borderBottom: `1px solid ${theme.line}`, fontWeight: 800 }}>
                        {lot.riskScore.toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 6px', borderBottom: `1px solid ${theme.line}` }}>
                        <span
                          style={{
                            borderRadius: 999,
                            padding: '3px 8px',
                            fontSize: 10,
                            fontWeight: 800,
                            color: '#0b1220',
                            background: toneColor(lot.status),
                          }}
                        >
                          {lot.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredRiskLots.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{ padding: 16, textAlign: 'center', color: theme.muted, fontSize: 13 }}
                      >
                        선택한 필터에 해당하는 위험 LOT가 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section style={{ ...gridTwo, marginBottom: 14 }}>
          <div style={{ ...panelStyle, padding: 16 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 17 }}>핵심 공정 파라미터 상태</h2>
            <p style={{ margin: '0 0 12px', color: theme.muted, fontSize: 12 }}>
              소성 / 분위기 가스 / 혼합 / 투입 / 부하
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isNarrow ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              {params.map((param) => (
                <div
                  key={param.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '14px 1fr auto',
                    gap: 10,
                    alignItems: 'center',
                    background: theme.panelAlt,
                    borderRadius: 12,
                    border: `1px solid ${theme.line}`,
                    padding: '12px 14px',
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: toneColor(param.status),
                      boxShadow: `0 0 10px ${toneColor(param.status)}`,
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{param.name}</div>
                    <div style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>{param.status}</div>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                    {param.value}
                    <span style={{ marginLeft: 4, color: theme.muted, fontSize: 11, fontWeight: 700 }}>
                      {param.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...panelStyle, padding: 16 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 17 }}>라인 / 설비 상태</h2>
            <p style={{ margin: '0 0 12px', color: theme.muted, fontSize: 12 }}>실시간 라인·설비 요약</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {lineStatuses.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'center',
                    background: theme.panelAlt,
                    borderRadius: 12,
                    border: `1px solid ${theme.line}`,
                    padding: '10px 12px',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{item.name}</div>
                    <div style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>{item.note}</div>
                  </div>
                  <span
                    style={{
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#0b1220',
                      background: toneColor(item.status),
                    }}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ ...panelStyle, padding: 16 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 17 }}>최근 이벤트 / 데이터 요약</h2>
          <p style={{ margin: '0 0 12px', color: theme.muted, fontSize: 12 }}>
            경고 · 품질 · 공정 · 생산 이력
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={{ color: theme.muted, fontSize: 11, textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px', borderBottom: `1px solid ${theme.line}` }}>시각</th>
                  <th style={{ padding: '8px 6px', borderBottom: `1px solid ${theme.line}` }}>구분</th>
                  <th style={{ padding: '8px 6px', borderBottom: `1px solid ${theme.line}` }}>대상</th>
                  <th style={{ padding: '8px 6px', borderBottom: `1px solid ${theme.line}` }}>메시지</th>
                  <th style={{ padding: '8px 6px', borderBottom: `1px solid ${theme.line}` }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event) => (
                  <tr key={event.id} style={{ fontSize: 12 }}>
                    <td style={{ padding: '10px 6px', borderBottom: `1px solid ${theme.line}`, fontWeight: 700 }}>
                      {event.time}
                    </td>
                    <td style={{ padding: '10px 6px', borderBottom: `1px solid ${theme.line}` }}>
                      {event.category}
                    </td>
                    <td style={{ padding: '10px 6px', borderBottom: `1px solid ${theme.line}` }}>{event.target}</td>
                    <td style={{ padding: '10px 6px', borderBottom: `1px solid ${theme.line}`, color: theme.muted }}>
                      {event.message}
                    </td>
                    <td style={{ padding: '10px 6px', borderBottom: `1px solid ${theme.line}` }}>
                      <span
                        style={{
                          borderRadius: 999,
                          padding: '3px 8px',
                          fontSize: 10,
                          fontWeight: 800,
                          color: '#0b1220',
                          background: toneColor(event.status),
                        }}
                      >
                        {event.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 60,
          display: 'grid',
          gap: 8,
          width: 'min(92vw, 320px)',
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              background: '#ffffff',
              border: `1px solid ${theme.blue}`,
              color: theme.text,
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: 700,
              boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {isChatOpen ? (
        <div
          style={{
            position: 'fixed',
            right: 24,
            bottom: 96,
            width: 'min(92vw, 380px)',
            height: 520,
            maxHeight: '70vh',
            zIndex: 70,
            ...panelStyle,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              padding: '14px 16px',
              borderBottom: `1px solid ${theme.line}`,
              background: '#f8fafc',
            }}
          >
            <strong style={{ fontSize: 14 }}>AI 공정 지원 챗봇</strong>
            <button
              type="button"
              aria-label="챗봇 닫기"
              onClick={() => setIsChatOpen(false)}
              style={{
                border: 0,
                width: 30,
                height: 30,
                borderRadius: 999,
                background: theme.panelAlt,
                color: theme.text,
                cursor: 'pointer',
                fontWeight: 800,
              }}
            >
              X
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: '#ffffff',
            }}
          >
            {messages.map((message) => {
              const isUser = message.role === 'user';
              return (
                <div
                  key={message.id}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    background: isUser ? theme.blue : theme.panelAlt,
                    color: isUser ? '#ffffff' : theme.text,
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    padding: '10px 12px',
                    fontSize: 13,
                    lineHeight: 1.6,
                    border: `1px solid ${isUser ? '#60a5fa' : theme.line}`,
                  }}
                >
                  {message.text}
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          <div style={{ padding: '10px 12px', borderTop: `1px solid ${theme.line}` }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => sendMessage(question)}
                  style={{
                    border: `1px solid ${theme.line}`,
                    background: theme.panelAlt,
                    color: theme.muted,
                    borderRadius: 999,
                    padding: '6px 10px',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {question}
                </button>
              ))}
            </div>
            <form onSubmit={handleChatSubmit} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="메시지를 입력하세요..."
                style={{
                  flex: 1,
                  border: `1px solid ${theme.line}`,
                  borderRadius: 12,
                  background: theme.panelAlt,
                  color: theme.text,
                  padding: '10px 12px',
                  outline: 'none',
                  fontSize: 13,
                }}
              />
              <button
                type="submit"
                style={{
                  border: 0,
                  borderRadius: 12,
                  background: theme.blue,
                  color: '#fff',
                  padding: '0 14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                전송
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label="AI 챗봇 열기"
        onClick={() => {
          setIsNotifyOpen(false);
          setIsChatOpen((prev) => !prev);
        }}
        onMouseEnter={() => setHovered('fab')}
        onMouseLeave={() => setHovered(null)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 60,
          height: 60,
          borderRadius: '50%',
          border: 0,
          background: hovered === 'fab' ? '#2563eb' : theme.blue,
          color: '#fff',
          fontSize: 22,
          cursor: 'pointer',
          zIndex: 80,
          boxShadow:
            hovered === 'fab'
              ? '0 14px 28px rgba(37,99,235,0.55)'
              : '0 10px 24px rgba(37,99,235,0.4)',
          transform: hovered === 'fab' ? 'translateY(-2px) scale(1.04)' : 'none',
        }}
      >
        💬
      </button>
    </div>
  );
}
