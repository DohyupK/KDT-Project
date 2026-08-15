export const OPEN_SECURE_CHAT_EVENT = 'kdt-open-secure-chat'

export function openSecureChat() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_SECURE_CHAT_EVENT))
}
