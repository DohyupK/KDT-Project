const PHONE_REGEX = /^01[016789]-?\d{3,4}-?\d{4}$/
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizePhone(phone: string) {
  return phone.replace(/\s/g, '')
}

export function isValidPhone(phone: string) {
  return PHONE_REGEX.test(normalizePhone(phone))
}

export function isValidPassword(password: string) {
  return PASSWORD_REGEX.test(password)
}

export function isValidEmail(email: string) {
  return EMAIL_REGEX.test(email.trim())
}
