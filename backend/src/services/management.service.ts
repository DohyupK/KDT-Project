import { AppError } from '../middleware/errorHandler'
import { isDbUnavailableError, useMockStorage } from '../utils/db'

export interface MailPayload {
  id: string
  sender: string
  subject: string
  body: string
  receivedAt: string
  cc?: string[]
  hasAttachment?: boolean
  attachments?: string[]
  importance?: '높음' | '보통' | '낮음'
  tags?: string[]
  isRead?: boolean
}

export interface DefectRecordPayload {
  lineId: string
  lineName: string
  defectRate: number
  baseDate: string
  defectCount: number
  totalCount: number
  causeCategory?: string
  department?: string
  prevDefectRate?: number
}

export interface DefectSettingsPayload {
  threshold: number
  n8nEnabled: boolean
}

const MOCK_MAILS: MailPayload[] = [
  {
    id: 'MAIL-001',
    sender: 'quality@posco.com',
    subject: '[긴급] A라인 품질 이상 보고',
    body: '금일 오전 A라인에서 표면 결함률이 급증했습니다. 첨부된 측정 리포트를 확인 후 조치 부탁드립니다.',
    receivedAt: '2026-07-16 09:12',
    cc: ['plant-manager@posco.com', 'qc-lead@posco.com'],
    hasAttachment: true,
    attachments: ['A라인_품질리포트_0716.pdf', '측정데이터.xlsx'],
    importance: '높음',
    tags: ['품질', '긴급'],
    isRead: false,
  },
  {
    id: 'MAIL-002',
    sender: 'ops@partner.co.kr',
    subject: '주간 생산 실적 공유',
    body: '지난주 생산 실적 및 가동률 요약본을 공유드립니다. 특이사항은 B라인 정비로 인한 가동률 하락입니다.',
    receivedAt: '2026-07-16 08:45',
    cc: ['planning@posco.com'],
    hasAttachment: true,
    attachments: ['주간실적_0710-0715.xlsx'],
    importance: '보통',
    tags: ['생산', '주간보고'],
    isRead: false,
  },
  {
    id: 'MAIL-003',
    sender: 'safety@posco.com',
    subject: '안전점검 일정 안내',
    body: '7월 18일 전 라인 대상 정기 안전점검이 예정되어 있습니다. 담당자별 체크리스트를 사전 확인해주세요.',
    receivedAt: '2026-07-15 17:20',
    importance: '보통',
    tags: ['안전'],
    isRead: true,
    hasAttachment: false,
  },
  {
    id: 'MAIL-004',
    sender: 'vendor@material.kr',
    subject: '원자재 납품 일정 변경 요청',
    body: '기상 이슈로 인해 7월 17일 납품분이 하루 지연될 예정입니다. 양해 부탁드립니다.',
    receivedAt: '2026-07-15 14:03',
    cc: ['procurement@posco.com'],
    hasAttachment: false,
    importance: '높음',
    tags: ['구매', '납품'],
    isRead: false,
  },
  {
    id: 'MAIL-005',
    sender: 'hr@posco.com',
    subject: '7월 교육 일정 공지',
    body: '신규 입사자 대상 품질 기초 교육 일정을 안내드립니다. 참석자 명단을 회신해주세요.',
    receivedAt: '2026-07-14 11:30',
    importance: '낮음',
    tags: ['교육', 'HR'],
    isRead: true,
    hasAttachment: true,
    attachments: ['교육일정표.pdf'],
  },
  {
    id: 'MAIL-006',
    sender: 'it-support@posco.com',
    subject: 'MES 시스템 정기 점검 안내',
    body: '7월 20일 02:00~04:00 MES 정기 점검으로 일부 조회 기능이 제한됩니다.',
    receivedAt: '2026-07-14 09:05',
    importance: '보통',
    tags: ['IT', 'MES'],
    isRead: true,
    hasAttachment: false,
  },
  {
    id: 'MAIL-007',
    sender: 'customer@battery.com',
    subject: 'LOT-8821 품질 문의',
    body: '납품 LOT-8821 샘플에서 수분 함량 편차가 확인되어 원인 분석 요청드립니다.',
    receivedAt: '2026-07-13 16:40',
    cc: ['cs@posco.com'],
    hasAttachment: true,
    attachments: ['고객클레임_시료사진.zip'],
    importance: '높음',
    tags: ['고객', '클레임'],
    isRead: false,
  },
]

const MOCK_DEFECT_RECORDS: DefectRecordPayload[] = [
  { lineId: 'LINE-A', lineName: 'A라인', defectRate: 4.2, baseDate: '2026-07-14', defectCount: 42, totalCount: 1000, causeCategory: '표면결함', department: '품질관리팀', prevDefectRate: 2.1 },
  { lineId: 'LINE-A', lineName: 'A라인', defectRate: 3.8, baseDate: '2026-07-15', defectCount: 38, totalCount: 1000, causeCategory: '표면결함', department: '품질관리팀', prevDefectRate: 4.2 },
  { lineId: 'LINE-A', lineName: 'A라인', defectRate: 4.5, baseDate: '2026-07-16', defectCount: 45, totalCount: 1000, causeCategory: '치수불량', department: '품질관리팀', prevDefectRate: 3.8 },
  { lineId: 'LINE-B', lineName: 'B라인', defectRate: 1.8, baseDate: '2026-07-14', defectCount: 18, totalCount: 1000, causeCategory: '이물질', department: '생산1팀', prevDefectRate: 1.5 },
  { lineId: 'LINE-B', lineName: 'B라인', defectRate: 2.0, baseDate: '2026-07-15', defectCount: 20, totalCount: 1000, causeCategory: '이물질', department: '생산1팀', prevDefectRate: 1.8 },
  { lineId: 'LINE-B', lineName: 'B라인', defectRate: 1.6, baseDate: '2026-07-16', defectCount: 16, totalCount: 1000, causeCategory: '이물질', department: '생산1팀', prevDefectRate: 2.0 },
  { lineId: 'LINE-C', lineName: 'C라인', defectRate: 3.5, baseDate: '2026-07-14', defectCount: 35, totalCount: 1000, causeCategory: '온도편차', department: '생산2팀', prevDefectRate: 2.9 },
  { lineId: 'LINE-C', lineName: 'C라인', defectRate: 3.9, baseDate: '2026-07-15', defectCount: 39, totalCount: 1000, causeCategory: '온도편차', department: '생산2팀', prevDefectRate: 3.5 },
  { lineId: 'LINE-C', lineName: 'C라인', defectRate: 4.1, baseDate: '2026-07-16', defectCount: 41, totalCount: 1000, causeCategory: '온도편차', department: '생산2팀', prevDefectRate: 3.9 },
  { lineId: 'LINE-D', lineName: 'D라인', defectRate: 3.2, baseDate: '2026-07-14', defectCount: 32, totalCount: 1000, causeCategory: '원료편차', department: '생산3팀', prevDefectRate: 2.4 },
  { lineId: 'LINE-D', lineName: 'D라인', defectRate: 2.1, baseDate: '2026-07-15', defectCount: 21, totalCount: 1000, causeCategory: '원료편차', department: '생산3팀', prevDefectRate: 3.2 },
  { lineId: 'LINE-D', lineName: 'D라인', defectRate: 3.4, baseDate: '2026-07-16', defectCount: 34, totalCount: 1000, causeCategory: '원료편차', department: '생산3팀', prevDefectRate: 2.1 },
  { lineId: 'LINE-E', lineName: 'E라인', defectRate: 0.9, baseDate: '2026-07-14', defectCount: 9, totalCount: 1000, causeCategory: '기타', department: '생산1팀', prevDefectRate: 1.1 },
  { lineId: 'LINE-E', lineName: 'E라인', defectRate: 1.2, baseDate: '2026-07-15', defectCount: 12, totalCount: 1000, causeCategory: '기타', department: '생산1팀', prevDefectRate: 0.9 },
  { lineId: 'LINE-E', lineName: 'E라인', defectRate: 1.0, baseDate: '2026-07-16', defectCount: 10, totalCount: 1000, causeCategory: '기타', department: '생산1팀', prevDefectRate: 1.2 },
]

const memoryMails: MailPayload[] = MOCK_MAILS.map((mail) => ({ ...mail }))
let memoryDefectSettings: DefectSettingsPayload = { threshold: 3, n8nEnabled: true }

function cloneMails(): MailPayload[] {
  return memoryMails.map((mail) => ({
    ...mail,
    cc: mail.cc ? [...mail.cc] : undefined,
    attachments: mail.attachments ? [...mail.attachments] : undefined,
    tags: mail.tags ? [...mail.tags] : undefined,
  }))
}

export async function getMails(): Promise<MailPayload[]> {
  try {
    if (useMockStorage('MOCK_MANAGEMENT_MAIL')) {
      return cloneMails()
    }
    throw new AppError(501, '메일 관리 DB 연동은 아직 지원되지 않습니다.')
  } catch (err) {
    if (useMockStorage('MOCK_MANAGEMENT_MAIL') || isDbUnavailableError(err)) {
      return cloneMails()
    }
    throw err
  }
}

export async function markMailRead(id: string): Promise<MailPayload> {
  try {
    if (useMockStorage('MOCK_MANAGEMENT_MAIL')) {
      const mail = memoryMails.find((item) => item.id === id)
      if (!mail) throw new AppError(404, '메일을 찾을 수 없습니다.')
      mail.isRead = true
      return { ...mail, cc: mail.cc ? [...mail.cc] : undefined, attachments: mail.attachments ? [...mail.attachments] : undefined, tags: mail.tags ? [...mail.tags] : undefined }
    }
    throw new AppError(501, '메일 관리 DB 연동은 아직 지원되지 않습니다.')
  } catch (err) {
    if (err instanceof AppError) throw err
    if (useMockStorage('MOCK_MANAGEMENT_MAIL') || isDbUnavailableError(err)) {
      const mail = memoryMails.find((item) => item.id === id)
      if (!mail) throw new AppError(404, '메일을 찾을 수 없습니다.')
      mail.isRead = true
      return { ...mail }
    }
    throw err
  }
}

export async function getDefectRecords(): Promise<DefectRecordPayload[]> {
  try {
    if (useMockStorage('MOCK_MANAGEMENT_DEFECT')) {
      return MOCK_DEFECT_RECORDS.map((record) => ({ ...record }))
    }
    throw new AppError(501, '불량률 모니터링 DB 연동은 아직 지원되지 않습니다.')
  } catch (err) {
    if (useMockStorage('MOCK_MANAGEMENT_DEFECT') || isDbUnavailableError(err)) {
      return MOCK_DEFECT_RECORDS.map((record) => ({ ...record }))
    }
    throw err
  }
}

export async function getDefectSettings(): Promise<DefectSettingsPayload> {
  try {
    if (useMockStorage('MOCK_MANAGEMENT_DEFECT')) {
      return { ...memoryDefectSettings }
    }
    throw new AppError(501, '불량률 모니터링 DB 연동은 아직 지원되지 않습니다.')
  } catch (err) {
    if (useMockStorage('MOCK_MANAGEMENT_DEFECT') || isDbUnavailableError(err)) {
      return { ...memoryDefectSettings }
    }
    throw err
  }
}

export async function updateDefectSettings(
  input: Partial<DefectSettingsPayload>,
): Promise<DefectSettingsPayload> {
  try {
    if (useMockStorage('MOCK_MANAGEMENT_DEFECT')) {
      if (input.threshold !== undefined) {
        const threshold = Number(input.threshold)
        if (Number.isNaN(threshold) || threshold < 0) {
          throw new AppError(400, '유효한 임계값이 필요합니다.')
        }
        memoryDefectSettings.threshold = threshold
      }
      if (input.n8nEnabled !== undefined) {
        memoryDefectSettings.n8nEnabled = Boolean(input.n8nEnabled)
      }
      return { ...memoryDefectSettings }
    }
    throw new AppError(501, '불량률 모니터링 DB 연동은 아직 지원되지 않습니다.')
  } catch (err) {
    if (err instanceof AppError) throw err
    if (useMockStorage('MOCK_MANAGEMENT_DEFECT') || isDbUnavailableError(err)) {
      if (input.threshold !== undefined) memoryDefectSettings.threshold = Number(input.threshold)
      if (input.n8nEnabled !== undefined) memoryDefectSettings.n8nEnabled = Boolean(input.n8nEnabled)
      return { ...memoryDefectSettings }
    }
    throw err
  }
}
