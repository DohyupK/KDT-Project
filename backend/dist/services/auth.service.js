"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkDuplicateUserId = checkDuplicateUserId;
exports.registerUser = registerUser;
exports.loginUser = loginUser;
exports.findUserId = findUserId;
exports.resetPassword = resetPassword;
exports.updateProfile = updateProfile;
exports.withdrawAccount = withdrawAccount;
exports.getUserProfile = getUserProfile;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const connection_1 = require("../db/connection");
const errorHandler_1 = require("../middleware/errorHandler");
const validation_1 = require("../utils/validation");
function toAuthUser(row) {
    return {
        userId: row.user_id,
        name: row.name,
        phone: row.phone,
        email: row.email,
    };
}
function createToken(user) {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new errorHandler_1.AppError(500, 'JWT 설정이 없습니다.');
    return jsonwebtoken_1.default.sign({ userId: user.user_id, name: user.name }, secret, { expiresIn: '7d' });
}
async function checkDuplicateUserId(userId) {
    const rows = await (0, connection_1.query)('SELECT id FROM users WHERE user_id = ?', [userId]);
    return rows.length === 0;
}
async function registerUser(input) {
    const { name, phone, email, userId, password } = input;
    if (!name.trim() || !email.trim() || !userId.trim()) {
        throw new errorHandler_1.AppError(400, '필수 입력값이 누락되었습니다.');
    }
    if (!(0, validation_1.isValidPhone)(phone)) {
        throw new errorHandler_1.AppError(400, '연락처 형식이 올바르지 않습니다.');
    }
    if (!(0, validation_1.isValidPassword)(password)) {
        throw new errorHandler_1.AppError(400, '비밀번호는 8자 이상, 대·소문자, 숫자, 특수문자를 포함해야 합니다.');
    }
    const available = await checkDuplicateUserId(userId.trim());
    if (!available) {
        throw new errorHandler_1.AppError(409, '이미 사용 중인 아이디입니다.');
    }
    const hashed = await bcryptjs_1.default.hash(password, 10);
    await (0, connection_1.query)('INSERT INTO users (user_id, password, name, phone, email) VALUES (?, ?, ?, ?, ?)', [userId.trim(), hashed, name.trim(), (0, validation_1.normalizePhone)(phone), email.trim()]);
    return { message: '회원가입 완료' };
}
async function loginUser(userId, password) {
    const rows = await (0, connection_1.query)('SELECT * FROM users WHERE user_id = ? LIMIT 1', [
        userId.trim(),
    ]);
    const user = rows[0];
    if (!user) {
        throw new errorHandler_1.AppError(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    const matched = await bcryptjs_1.default.compare(password, user.password);
    if (!matched) {
        throw new errorHandler_1.AppError(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    return {
        user: toAuthUser(user),
        token: createToken(user),
    };
}
async function findUserId(name, phone) {
    const rows = await (0, connection_1.query)('SELECT user_id FROM users WHERE name = ? AND phone = ? LIMIT 1', [name.trim(), (0, validation_1.normalizePhone)(phone)]);
    const user = rows[0];
    if (!user) {
        throw new errorHandler_1.AppError(404, '일치하는 회원 정보를 찾을 수 없습니다.');
    }
    return { userId: (0, validation_1.maskUserId)(user.user_id) };
}
async function resetPassword(name, phone, userId) {
    const rows = await (0, connection_1.query)('SELECT * FROM users WHERE name = ? AND phone = ? AND user_id = ? LIMIT 1', [name.trim(), (0, validation_1.normalizePhone)(phone), userId.trim()]);
    const user = rows[0];
    if (!user) {
        throw new errorHandler_1.AppError(404, '일치하는 회원 정보를 찾을 수 없습니다.');
    }
    const tempPassword = (0, validation_1.generateTempPassword)();
    const hashed = await bcryptjs_1.default.hash(tempPassword, 10);
    await (0, connection_1.query)('UPDATE users SET password = ? WHERE id = ?', [hashed, user.id]);
    console.log(`[비밀번호 재설정] userId=${user.user_id}, phone=${user.phone}, tempPassword=${tempPassword}`);
    return { message: '임시 비밀번호 발송 완료' };
}
async function updateProfile(userId, input) {
    const rows = await (0, connection_1.query)('SELECT * FROM users WHERE user_id = ? LIMIT 1', [userId]);
    const user = rows[0];
    if (!user)
        throw new errorHandler_1.AppError(404, '사용자를 찾을 수 없습니다.');
    const updates = [];
    const params = [];
    if (input.phone !== undefined) {
        if (!(0, validation_1.isValidPhone)(input.phone)) {
            throw new errorHandler_1.AppError(400, '연락처 형식이 올바르지 않습니다.');
        }
        updates.push('phone = ?');
        params.push((0, validation_1.normalizePhone)(input.phone));
    }
    if (input.password !== undefined) {
        if (!input.currentPassword) {
            throw new errorHandler_1.AppError(400, '현재 비밀번호를 입력해주세요.');
        }
        const matched = await bcryptjs_1.default.compare(input.currentPassword, user.password);
        if (!matched) {
            throw new errorHandler_1.AppError(401, '현재 비밀번호가 올바르지 않습니다.');
        }
        if (!(0, validation_1.isValidPassword)(input.password)) {
            throw new errorHandler_1.AppError(400, '비밀번호는 8자 이상, 대·소문자, 숫자, 특수문자를 포함해야 합니다.');
        }
        updates.push('password = ?');
        params.push(await bcryptjs_1.default.hash(input.password, 10));
    }
    if (updates.length === 0) {
        throw new errorHandler_1.AppError(400, '변경할 항목이 없습니다.');
    }
    params.push(user.id);
    await (0, connection_1.query)(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await (0, connection_1.query)('SELECT * FROM users WHERE id = ? LIMIT 1', [user.id]);
    return { user: toAuthUser(updated[0]), message: '정보가 수정되었습니다.' };
}
async function withdrawAccount(userId, password) {
    const rows = await (0, connection_1.query)('SELECT * FROM users WHERE user_id = ? LIMIT 1', [userId]);
    const user = rows[0];
    if (!user)
        throw new errorHandler_1.AppError(404, '사용자를 찾을 수 없습니다.');
    const matched = await bcryptjs_1.default.compare(password, user.password);
    if (!matched) {
        throw new errorHandler_1.AppError(401, '비밀번호가 올바르지 않습니다.');
    }
    await (0, connection_1.query)('DELETE FROM users WHERE id = ?', [user.id]);
    return { message: '회원탈퇴가 완료되었습니다.' };
}
async function getUserProfile(userId) {
    const rows = await (0, connection_1.query)('SELECT * FROM users WHERE user_id = ? LIMIT 1', [userId]);
    const user = rows[0];
    if (!user)
        throw new errorHandler_1.AppError(404, '사용자를 찾을 수 없습니다.');
    return { user: toAuthUser(user) };
}
