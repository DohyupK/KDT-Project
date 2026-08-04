import { apiClient } from './axios'

export type InquiryApiItem = {
  id: string
  category: string
  title: string
  author: string
  date: string
  status: string
  content: string
  answer: string
  visibility: string
  answeredAt: string | null
  masked?: boolean
}

export type InquiryListParams = {
  category?: string
  status?: string
  startDate?: string
  endDate?: string
  q?: string
  page?: number
  pageSize?: number
}

export type InquiryListResponse = {
  items: InquiryApiItem[]
  total: number
  page: number
  pageSize: number
}

export type CreateInquiryBody = {
  category: string
  visibility: string
  title: string
  content: string
}

export const inquiryApi = {
  list: (params?: InquiryListParams) =>
    apiClient.get<InquiryListResponse>('/inquiries', { params }),

  getById: (id: string) => apiClient.get<{ item: InquiryApiItem }>(`/inquiries/${id}`),

  create: (body: CreateInquiryBody) =>
    apiClient.post<{ item: InquiryApiItem; message: string }>('/inquiries', body),

  answer: (id: string, content: string) =>
    apiClient.put<{ item: InquiryApiItem; message: string }>(`/inquiries/${id}/answer`, {
      content,
    }),
}
