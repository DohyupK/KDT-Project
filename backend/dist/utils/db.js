"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INQUIRY_CATEGORIES = void 0;
exports.isDbUnavailableError = isDbUnavailableError;
exports.useMockStorage = useMockStorage;
exports.INQUIRY_CATEGORIES = [
    '시스템 오류 제보',
    '기능 개선 제안',
    '생산/출하 일정 문의',
    '불량 검사 문의',
    '기타',
];
function isDbUnavailableError(err) {
    if (!(err instanceof Error))
        return false;
    const message = err.message.toLowerCase();
    return (message.includes('connect') ||
        message.includes('econnrefused') ||
        message.includes("doesn't exist") ||
        message.includes('unknown database') ||
        message.includes('access denied'));
}
function useMockStorage(envKey) {
    return process.env[envKey] === 'true';
}
