import { apiClient } from './axios'
import type {
  InquiryDetailResponse,
  InquiryListResponse,
  ManagementDefectListResponse,
  ManagementDefectSettingsResponse,
  ManagementMailListResponse,
  MarkMailReadResponse,
  SubmitInquiryReplyRequest,
  SubmitInquiryReplyResponse,
  UpdateInquiryStatusRequest,
  UpdateInquiryStatusResponse,
  UpdateManagementDefectSettingsRequest,
  UpdateManagementDefectSettingsResponse,
} from '@/types'

export const managementApi = {
  getInquiries: () => apiClient.get<InquiryListResponse>('/inquiries'),

  getInquiryById: (id: string) => apiClient.get<InquiryDetailResponse>(`/inquiries/${id}`),

  submitReply: (id: string, payload: SubmitInquiryReplyRequest) =>
    apiClient.put<SubmitInquiryReplyResponse>(`/inquiries/${id}/reply`, payload),

  updateStatus: (id: string, payload: UpdateInquiryStatusRequest) =>
    apiClient.patch<UpdateInquiryStatusResponse>(`/inquiries/${id}/status`, payload),

  getMails: () => apiClient.get<ManagementMailListResponse>('/management/mails'),

  markMailRead: (id: string) => apiClient.patch<MarkMailReadResponse>(`/management/mails/${id}/read`),

  getDefectRecords: () => apiClient.get<ManagementDefectListResponse>('/management/defects'),

  getDefectSettings: () => apiClient.get<ManagementDefectSettingsResponse>('/management/defect-settings'),

  updateDefectSettings: (payload: UpdateManagementDefectSettingsRequest) =>
    apiClient.put<UpdateManagementDefectSettingsResponse>('/management/defect-settings', payload),
}
