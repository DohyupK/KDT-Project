export interface AppData {
  fillThreshold: number
}

export interface LoginRequest {
  userId: string
  password: string
}

export interface RegisterRequest {
  name: string
  phone: string
  email: string
  userId: string
  password: string
}

export interface FindUserIdRequest {
  name: string
  phone: string
}

export interface VerifyResetRequest {
  name: string
  phone: string
  userId: string
}

export interface ResetPasswordRequest extends VerifyResetRequest {
  newPassword: string
}

export interface AuthUser {
  userId: string
  name: string
  phone: string
  email: string
}

export interface LoginResponse {
  user: AuthUser
  token: string
}

export interface CheckIdResponse {
  available: boolean
  duplicate?: boolean
  exists?: boolean
}

export interface FindUserIdResponse {
  userId: string
}

export interface UpdateProfileRequest {
  phone?: string
  password?: string
  currentPassword?: string
}

export interface MessageResponse {
  message: string
}

export interface UserSettings {
  userId: string
  fontSize: number
  themeMode: 0 | 1
  language: 'ko' | 'en'
  refreshInterval: number
  updateAt: string | null
}

export interface UserSettingsResponse {
  settings: UserSettings
}

export interface UpdateProfileResponse {
  user: AuthUser
  message: string
}

export interface CreateInquiryRequest {
  category: string
  title: string
  content: string
  isPrivate: boolean
  attachments: string[]
  authorName: string
  email: string
  phone: string
}

export interface InquiryReply {
  content: string
  assignee: string
  replyStatus: string
  repliedAt: string | null
  internalMemo: string | null
  priority: string
  adminConfirmed: boolean
}

export interface Inquiry {
  id: string
  userId: string | null
  authorName: string
  email: string
  phone: string | null
  category: string
  title: string
  content: string
  isPrivate: boolean
  attachments: string[]
  status: string
  priority: string
  department: string | null
  reply: InquiryReply | null
  createdAt: string
  updatedAt: string
}

export interface CreateInquiryResponse {
  inquiry: Inquiry
  message: string
}

export interface InquiryListResponse {
  inquiries: Inquiry[]
}

export interface InquiryDetailResponse {
  inquiry: Inquiry
}

export interface SubmitInquiryReplyRequest {
  content: string
  assignee: string
  priority: string
  internalMemo?: string
  adminConfirmed: boolean
}

export interface SubmitInquiryReplyResponse {
  inquiry: Inquiry
  message: string
}

export interface UpdateInquiryStatusRequest {
  status: string
}

export interface UpdateInquiryStatusResponse {
  inquiry: Inquiry
  message: string
}

export interface ManagementMail {
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

export interface ManagementMailListResponse {
  mails: ManagementMail[]
}

export interface MarkMailReadResponse {
  mail: ManagementMail
  message: string
}

export interface ManagementDefectRecord {
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

export interface ManagementDefectListResponse {
  records: ManagementDefectRecord[]
}

export interface ManagementDefectSettings {
  threshold: number
  n8nEnabled: boolean
}

export interface ManagementDefectSettingsResponse {
  settings: ManagementDefectSettings
}

export interface UpdateManagementDefectSettingsRequest {
  threshold?: number
  n8nEnabled?: boolean
}

export interface UpdateManagementDefectSettingsResponse {
  settings: ManagementDefectSettings
  message: string
}

export interface MainKpi {
  sinteringTemp: number
  lithiumInput: number
  defectRate: number
  equipmentStatus: string
}

export interface MainAiInsight {
  cause: string
  probabilityNote: string
  suggestions: string[]
}

export interface MainAlert {
  id: string
  title: string
  description: string
  severity: '진행중' | '주의'
  lotId: string
}

export interface MainLatestLot {
  lotId: string
  timestamp: string
  sinteringTemp: number
  lithiumInput: number
  qualityDefect: number
}

export interface MainOverview {
  kpi: MainKpi
  aiInsight: MainAiInsight
  alerts: MainAlert[]
  latestLot: MainLatestLot
}

export interface MainOverviewResponse {
  overview: MainOverview
}

export type DashboardDefectType = '기계 결함' | '원자재 불량' | '작업자 실수' | '온도 이상'

export type DashboardDefectBreakdown = Record<DashboardDefectType, number>

export interface DashboardProductionRecord {
  date: string
  product: string
  line: string
  production: number
  defectCount: number
  targetProduction: number
  defects: DashboardDefectBreakdown
}

export interface DashboardSummaryMeta {
  minDate: string
  maxDate: string
  products: string[]
  lines: string[]
}

export interface DashboardSummaryResponse {
  records: DashboardProductionRecord[]
  meta: DashboardSummaryMeta
}

export interface IssueProcessData {
  time: string
  temperature: number
  pressure: number
  speed: number
  riskBefore: number
  riskAfter: number
}

export interface IssueItem {
  id: string
  occurredAt: string
  date: string
  lot: string
  risk: '높음' | '중간' | '낮음'
  status: '접수' | '분석 중' | '조치 중' | '완료'
  title: string
  assignee: string
  action: string
  completed: boolean
  anomaly: string
  processData: IssueProcessData[]
}

export interface IssueListResponse {
  issues: IssueItem[]
}

export interface IssueDetailResponse {
  issue: IssueItem
}

export interface UpdateIssueRequest {
  assignee: string
  status: string
  action: string
  completed: boolean
}

export interface UpdateIssueResponse {
  issue: IssueItem
  message: string
}

export interface HandoverSummary {
  period: string
  averageTemperature: number
  averagePressure: number
  averageSpeed: number
  aiRiskPredictions: number
  riskyLots: number
  issueCount: number
}

export interface HandoverSummaryResponse {
  summary: HandoverSummary
}

export interface KnowledgeDocument {
  id: string
  manager: string
  date: string
  title: string
  summary: string
  process: string
  lot: string
  detail: string
}

export interface KnowledgeAction {
  id: number
  situation: string
  action: string
  cause: string
  manager: string
  date: string
}

export interface KnowledgeReport {
  baseDate: string
  mainCause: string
  similarCase: string
  recommendation: string
  riskSummary: string
  referenceCount: number
}

export interface KnowledgeDocumentsResponse {
  documents: KnowledgeDocument[]
  managers: string[]
}

export interface KnowledgeDocumentDetailResponse {
  document: KnowledgeDocument
}

export interface KnowledgeActionsResponse {
  actions: KnowledgeAction[]
}

export interface KnowledgeActionMutationResponse {
  action: KnowledgeAction
  message: string
}

export interface KnowledgeReportResponse {
  report: KnowledgeReport
}

export interface KnowledgeReportRefreshResponse {
  report: KnowledgeReport
  message: string
}

export interface CreateKnowledgeActionRequest {
  situation: string
  action: string
  cause: string
  manager: string
  date: string
}
