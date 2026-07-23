"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhone = normalizePhone;
exports.isValidPhone = isValidPhone;
exports.isValidPassword = isValidPassword;
exports.maskUserId = maskUserId;
exports.generateTempPassword = generateTempPassword;
const PHONE_REGEX = /^01[016789]-?\d{3,4}-?\d{4}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;
function normalizePhone(phone) {
    return phone.replace(/\s/g, '');
}
function isValidPhone(phone) {
    return PHONE_REGEX.test(normalizePhone(phone));
}
function isValidPassword(password) {
    return PASSWORD_REGEX.test(password);
}
function maskUserId(userId) {
    if (userId.length <= 3)
        return '*'.repeat(userId.length);
    const visible = Math.min(3, userId.length - 1);
    return userId.slice(0, visible) + '*'.repeat(userId.length - visible);
}
function generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let result = 'Temp';
    for (let i = 0; i < 8; i += 1) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result + '1!';
}
