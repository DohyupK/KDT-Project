import {
  NOTIFICATION_TYPE_SPEC,
  type HeaderNotification,
} from '@/config/headerNotificationSpec'

/**
 * Visual QA mocks covering all recommended notification types.
 * Replace with GET /api/notifications/summary using the same HeaderNotification shape.
 */
export const MOCK_HEADER_NOTIFICATIONS: HeaderNotification[] = [
  {
    id: 'mock-high-risk-1',
    type: 'high_risk_lot',
    priority: NOTIFICATION_TYPE_SPEC.high_risk_lot.priority,
    time: '방금 전',
    title: NOTIFICATION_TYPE_SPEC.high_risk_lot.titleTemplate,
    message: 'LOT-20260208-00421 위험등급 심각. SPC 이탈, 불량확률 상승',
    unread: true,
    href: NOTIFICATION_TYPE_SPEC.high_risk_lot.defaultHref,
  },
  {
    id: 'mock-spc-1',
    type: 'spc_breach',
    priority: NOTIFICATION_TYPE_SPEC.spc_breach.priority,
    time: '3분 전',
    title: NOTIFICATION_TYPE_SPEC.spc_breach.titleTemplate,
    message: 'LOT-20260208-00418 소성온도 UCL 초과 (882.4°C)',
    unread: true,
    href: NOTIFICATION_TYPE_SPEC.spc_breach.defaultHref,
  },
  {
    id: 'mock-high-risk-2',
    type: 'high_risk_lot',
    priority: NOTIFICATION_TYPE_SPEC.high_risk_lot.priority,
    time: '8분 전',
    title: NOTIFICATION_TYPE_SPEC.high_risk_lot.titleTemplate,
    message: 'LOT-20260208-00412 위험등급 주의. 잔류리튬 여유량 부족',
    unread: true,
    href: NOTIFICATION_TYPE_SPEC.high_risk_lot.defaultHref,
  },
  {
    id: 'mock-issue-1',
    type: 'pending_issue',
    priority: NOTIFICATION_TYPE_SPEC.pending_issue.priority,
    time: '15분 전',
    title: NOTIFICATION_TYPE_SPEC.pending_issue.titleTemplate,
    message: 'ISS-20260208-003 소성온도 이탈 대응 — 담당 확인 필요',
    unread: true,
    href: NOTIFICATION_TYPE_SPEC.pending_issue.defaultHref,
  },
  {
    id: 'mock-handover-1',
    type: 'handover_pending',
    priority: NOTIFICATION_TYPE_SPEC.handover_pending.priority,
    time: '32분 전',
    title: NOTIFICATION_TYPE_SPEC.handover_pending.titleTemplate,
    message: 'LOT-20260207-00987 야간 교대 미완료 이슈 인계',
    unread: true,
    href: NOTIFICATION_TYPE_SPEC.handover_pending.defaultHref,
  },
  {
    id: 'mock-inquiry-1',
    type: 'inquiry_unanswered',
    priority: NOTIFICATION_TYPE_SPEC.inquiry_unanswered.priority,
    time: '1시간 전',
    title: NOTIFICATION_TYPE_SPEC.inquiry_unanswered.titleTemplate,
    message: 'INQ-20260208-012 설비 문의 미처리',
    unread: false,
    href: NOTIFICATION_TYPE_SPEC.inquiry_unanswered.defaultHref,
  },
  {
    id: 'mock-scoring-1',
    type: 'scoring_delay',
    priority: NOTIFICATION_TYPE_SPEC.scoring_delay.priority,
    time: '2시간 전',
    title: NOTIFICATION_TYPE_SPEC.scoring_delay.titleTemplate,
    message: '최근 생산 LOT 5건 미채점',
    unread: false,
    href: NOTIFICATION_TYPE_SPEC.scoring_delay.defaultHref,
  },
]
