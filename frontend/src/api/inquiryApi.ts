import { apiClient } from './axios'

export type InquiryAttachment = {
  id: number
  name: string
  size: number
  mimeType: string
}

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
  attachmentCount?: number
  attachments?: InquiryAttachment[]
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
  files?: File[]
}

export const inquiryApi = {
  list: (params?: InquiryListParams) =>
    apiClient.get<InquiryListResponse>('/inquiries', { params }),

  getById: (id: string) => apiClient.get<{ item: InquiryApiItem }>(`/inquiries/${id}`),

  create: (body: CreateInquiryBody) => {
    const form = new FormData()
    form.append('category', body.category)
    form.append('visibility', body.visibility)
    form.append('title', body.title)
    form.append('content', body.content)
    for (const file of body.files ?? []) {
      form.append('files', file)
    }
    return apiClient.post<{ item: InquiryApiItem; message: string }>('/inquiries', form, {
      headers: { 'Content-Type': undefined },
    })
  },

  download: (inquiryId: string, attachmentId: number) =>
    apiClient.get<Blob>(`/inquiries/${inquiryId}/attachments/${attachmentId}`, {
      responseType: 'blob',
    }),

  answer: (id: string, content: string) =>
    apiClient.put<{ item: InquiryApiItem; message: string }>(`/inquiries/${id}/answer`, {
      content,
    }),
}
