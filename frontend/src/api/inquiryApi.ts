import { apiClient } from './axios'
import type {
  CreateInquiryRequest,
  CreateInquiryResponse,
  InquiryListResponse,
} from '@/types'

export const inquiryApi = {
  createInquiry: (payload: CreateInquiryRequest) =>
    apiClient.post<CreateInquiryResponse>('/inquiries', payload),

  getMyInquiries: () => apiClient.get<InquiryListResponse>('/inquiries/mine'),
}
