import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'
import { isValidPassword, isValidPhone, normalizePhone } from '../utils/validation.js'

interface UserRow {
  id: number
  user_id: string
  password: string
  name: string
  phone: string
  email: string
}

function toAuthUser(row: UserRow) {
  return {
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
  }
}

function createToken(user: UserRow) {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new AppError(500, 'JWT 설정이 없습니다.')

  return jwt.sign({ userId: user.user_id, name: user.name }, secret, { expiresIn: '7d' })
}

export async function checkDuplicateUserId(userId: string) {
  const rows = await query<UserRow[]>('SELECT id FROM users WHERE user_id = ?', [userId])
  return rows.length === 0
}

export async function registerUser(input: {
  name: string
  phone: string
  email: string
  userId: string
  password: string
}) {
  const { name, phone, email, userId, password } = input

  if (!name.trim() || !email.trim() || !userId.trim()) {
    throw new AppError(400, '필수 입력값이 누락되었습니다.')
  }
  if (!isValidPhone(phone)) {
    throw new AppError(400, '연락처 형식이 올바르지 않습니다.')
  }
  if (!isValidPassword(password)) {
    throw new AppError(400, '비밀번호는 8자 이상, 대·소문자, 숫자, 특수문자를 포함해야 합니다.')
  }

  const available = await checkDuplicateUserId(userId.trim())
  if (!available) {
    throw new AppError(409, '이미 사용 중인 아이디입니다.')
  }

  const hashed = await bcrypt.hash(password, 10)
  await query(
    'INSERT INTO users (user_id, password, name, phone, email) VALUES (?, ?, ?, ?, ?)',
    [userId.trim(), hashed, name.trim(), normalizePhone(phone), email.trim()],
  )

  return { message: '회원가입 완료' }
}

export async function loginUser(userId: string, password: string) {
  const rows = await query<UserRow[]>('SELECT * FROM users WHERE user_id = ? LIMIT 1', [
    userId.trim(),
  ])

  const user = rows[0]
  if (!user) {
    throw new AppError(401, '아이디 또는 비밀번호가 올바르지 않습니다.')
  }

  const matched = await bcrypt.compare(password, user.password)
  if (!matched) {
    throw new AppError(401, '아이디 또는 비밀번호가 올바르지 않습니다.')
  }

  return {
    user: toAuthUser(user),
    token: createToken(user),
  }
}

export async function findUserId(name: string, phone: string) {
  const rows = await query<UserRow[]>(
    'SELECT user_id FROM users WHERE name = ? AND phone = ? LIMIT 1',
    [name.trim(), normalizePhone(phone)],
  )

  const user = rows[0]
  if (!user) {
    throw new AppError(404, '일치하는 회원 정보를 찾을 수 없습니다.')
  }

  return { userId: user.user_id }
}

async function findUserForReset(name: string, phone: string, userId: string) {
  const rows = await query<UserRow[]>(
    'SELECT * FROM users WHERE name = ? AND phone = ? AND user_id = ? LIMIT 1',
    [name.trim(), normalizePhone(phone), userId.trim()],
  )

  const user = rows[0]
  if (!user) {
    throw new AppError(404, '일치하는 회원 정보를 찾을 수 없습니다.')
  }

  return user
}

export async function verifyResetIdentity(name: string, phone: string, userId: string) {
  await findUserForReset(name, phone, userId)
  return { verified: true, message: '본인 확인이 완료되었습니다.' }
}

export async function resetPassword(
  name: string,
  phone: string,
  userId: string,
  newPassword: string,
) {
  const user = await findUserForReset(name, phone, userId)

  if (!isValidPassword(newPassword)) {
    throw new AppError(400, '비밀번호는 8자 이상, 대·소문자, 숫자, 특수문자를 포함해야 합니다.')
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  await query('UPDATE users SET password = ? WHERE id = ?', [hashed, user.id])

  return { message: '비밀번호가 변경되었습니다.' }
}

export async function updateProfile(
  userId: string,
  input: { phone?: string; password?: string; currentPassword?: string },
) {
  const rows = await query<UserRow[]>('SELECT * FROM users WHERE user_id = ? LIMIT 1', [userId])
  const user = rows[0]
  if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.')

  const updates: string[] = []
  const params: unknown[] = []

  if (input.phone !== undefined) {
    if (!isValidPhone(input.phone)) {
      throw new AppError(400, '연락처 형식이 올바르지 않습니다.')
    }
    updates.push('phone = ?')
    params.push(normalizePhone(input.phone))
  }

  if (input.password !== undefined) {
    if (!input.currentPassword) {
      throw new AppError(400, '현재 비밀번호를 입력해주세요.')
    }
    const matched = await bcrypt.compare(input.currentPassword, user.password)
    if (!matched) {
      throw new AppError(401, '현재 비밀번호가 올바르지 않습니다.')
    }
    if (!isValidPassword(input.password)) {
      throw new AppError(400, '비밀번호는 8자 이상, 대·소문자, 숫자, 특수문자를 포함해야 합니다.')
    }
    updates.push('password = ?')
    params.push(await bcrypt.hash(input.password, 10))
  }

  if (updates.length === 0) {
    throw new AppError(400, '변경할 항목이 없습니다.')
  }

  params.push(user.id)
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)

  const updated = await query<UserRow[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [user.id])
  return { user: toAuthUser(updated[0]), message: '정보가 수정되었습니다.' }
}

export async function withdrawAccount(userId: string, password: string) {
  const rows = await query<UserRow[]>('SELECT * FROM users WHERE user_id = ? LIMIT 1', [userId])
  const user = rows[0]
  if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.')

  const matched = await bcrypt.compare(password, user.password)
  if (!matched) {
    throw new AppError(401, '비밀번호가 올바르지 않습니다.')
  }

  await query('DELETE FROM users WHERE id = ?', [user.id])
  return { message: '회원탈퇴가 완료되었습니다.' }
}

export async function getUserProfile(userId: string) {
  const rows = await query<UserRow[]>('SELECT * FROM users WHERE user_id = ? LIMIT 1', [userId])
  const user = rows[0]
  if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.')
  return { user: toAuthUser(user) }
}
