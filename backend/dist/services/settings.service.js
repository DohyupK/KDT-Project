"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserSettings = getUserSettings;
exports.saveUserSettings = saveUserSettings;
exports.deleteUserSettings = deleteUserSettings;
const connection_1 = require("../db/connection");
const errorHandler_1 = require("../middleware/errorHandler");
const FONT_SIZE_OPTIONS = [10, 12, 14, 16, 18, 20, 22, 24];
const REFRESH_INTERVAL_OPTIONS = [1, 5, 10, 30];
const DEFAULT_SETTINGS = {
    fontSize: 18,
    themeMode: 1,
    language: 'ko',
    refreshInterval: 1,
};
const memorySettings = new Map();
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
function mapRow(row) {
    return {
        userId: row.user_id,
        fontSize: row.font_size,
        themeMode: row.theme_mode === 0 ? 0 : 1,
        language: row.language === 'en' ? 'en' : 'ko',
        refreshInterval: row.refresh_interval,
        updateAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
}
function validateSettings(input) {
    if (!FONT_SIZE_OPTIONS.includes(input.fontSize)) {
        throw new errorHandler_1.AppError(400, '유효하지 않은 폰트 크기입니다.');
    }
    if (input.themeMode !== 0 && input.themeMode !== 1) {
        throw new errorHandler_1.AppError(400, '유효하지 않은 테마 모드입니다.');
    }
    if (input.language !== 'ko' && input.language !== 'en') {
        throw new errorHandler_1.AppError(400, '유효하지 않은 언어 설정입니다.');
    }
    if (!REFRESH_INTERVAL_OPTIONS.includes(input.refreshInterval)) {
        throw new errorHandler_1.AppError(400, '유효하지 않은 새로고침 주기입니다.');
    }
}
async function getUserSettings(userId) {
    try {
        const rows = await (0, connection_1.query)('SELECT * FROM user_settings WHERE user_id = ? LIMIT 1', [userId]);
        if (rows[0])
            return mapRow(rows[0]);
        return {
            userId,
            ...DEFAULT_SETTINGS,
            updateAt: null,
        };
    }
    catch (err) {
        if (process.env.MOCK_SETTINGS === 'true' || isDbUnavailableError(err)) {
            return (memorySettings.get(userId) ?? {
                userId,
                ...DEFAULT_SETTINGS,
                updateAt: null,
            });
        }
        throw err;
    }
}
async function saveUserSettings(userId, input) {
    validateSettings(input);
    const payload = {
        userId,
        fontSize: input.fontSize,
        themeMode: input.themeMode === 0 ? 0 : 1,
        language: input.language === 'en' ? 'en' : 'ko',
        refreshInterval: input.refreshInterval,
        updateAt: new Date().toISOString(),
    };
    try {
        await (0, connection_1.query)(`INSERT INTO user_settings (user_id, font_size, theme_mode, language, refresh_interval)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         font_size = VALUES(font_size),
         theme_mode = VALUES(theme_mode),
         language = VALUES(language),
         refresh_interval = VALUES(refresh_interval)`, [userId, payload.fontSize, payload.themeMode, payload.language, payload.refreshInterval]);
        const saved = await getUserSettings(userId);
        memorySettings.set(userId, saved);
        return saved;
    }
    catch (err) {
        if (process.env.MOCK_SETTINGS === 'true' || isDbUnavailableError(err)) {
            memorySettings.set(userId, payload);
            return payload;
        }
        throw err;
    }
}
async function deleteUserSettings(userId) {
    memorySettings.delete(userId);
    try {
        await (0, connection_1.query)('DELETE FROM user_settings WHERE user_id = ?', [userId]);
    }
    catch (err) {
        if (!(process.env.MOCK_SETTINGS === 'true' || isDbUnavailableError(err))) {
            throw err;
        }
    }
}
