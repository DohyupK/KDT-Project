const PHONE_REGEX = /^01[016789]-?\d{3,4}-?\d{4}$/
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/

export function normalizePhone(phone: string) {
  return phone.replace(/\s/g, '')
}

export function isValidPhone(phone: string) {
  return PHONE_REGEX.test(normalizePhone(phone))
}

export function isValidPassword(password: string) {
  return PASSWORD_REGEX.test(password)
}

export function maskUserId(userId: string) {
  if (userId.length <= 3) return '*'.repeat(userId.length)
  const visible = Math.min(3, userId.length - 1)
  return userId.slice(0, visible) + '*'.repeat(userId.length - visible)
}

export function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$'
  let result = 'Temp'
  for (let i = 0; i < 8; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result + '1!'
}
