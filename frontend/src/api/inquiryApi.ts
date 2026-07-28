import { apiClient } from './axios'

export type InquiryStatus = '접수' | '답변완료'
export type InquiryVisibility = '공개' | '비공개'

export type InquiryItem = {
  id: string
  category: string
  title: string
  author: string
  authorUserId?: string | null
  date: string
  status: InquiryStatus
  content: string
  answer: string
  visibility: InquiryVisibility
  answeredAt?: string
}

export type CreateInquiryRequest = {
  category: string
  title: string
  content: string
  visibility: InquiryVisibility
}

export const inquiryApi = {
  list: () => apiClient.get<{ items: InquiryItem[] }>('/inquiries'),
  create: (payload: CreateInquiryRequest) =>
    apiClient.post<{ item: InquiryItem }>('/inquiries', payload),
}
