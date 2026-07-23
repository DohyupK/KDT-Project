"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawAccount = exports.updateProfile = exports.getProfile = exports.logout = exports.resetPassword = exports.findUserId = exports.login = exports.register = exports.checkDuplicateUserId = void 0;
const authService = __importStar(require("../services/auth.service"));
const errorHandler_1 = require("../middleware/errorHandler");
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
exports.checkDuplicateUserId = asyncHandler(async (req, res) => {
    const userId = String(req.query.userId ?? '').trim();
    if (!userId)
        throw new errorHandler_1.AppError(400, '아이디를 입력해주세요.');
    const available = await authService.checkDuplicateUserId(userId);
    if (!available) {
        res.status(409).json({ available: false, duplicate: true });
        return;
    }
    res.status(200).json({ available: true });
});
exports.register = asyncHandler(async (req, res) => {
    const result = await authService.registerUser(req.body);
    res.status(201).json(result);
});
exports.login = asyncHandler(async (req, res) => {
    const { userId, password } = req.body;
    if (!userId?.trim() || !password) {
        throw new errorHandler_1.AppError(400, '아이디와 비밀번호를 입력해주세요.');
    }
    const result = await authService.loginUser(userId, password);
    res.status(200).json(result);
});
exports.findUserId = asyncHandler(async (req, res) => {
    const { name, phone } = req.body;
    const result = await authService.findUserId(name, phone);
    res.status(200).json(result);
});
exports.resetPassword = asyncHandler(async (req, res) => {
    const { name, phone, userId } = req.body;
    const result = await authService.resetPassword(name, phone, userId);
    res.status(200).json(result);
});
exports.logout = asyncHandler(async (_req, res) => {
    res.status(200).json({ message: '로그아웃되었습니다.' });
});
exports.getProfile = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const result = await authService.getUserProfile(req.auth.userId);
    res.status(200).json(result);
});
exports.updateProfile = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const result = await authService.updateProfile(req.auth.userId, req.body);
    res.status(200).json(result);
});
exports.withdrawAccount = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const { password } = req.body;
    if (!password)
        throw new errorHandler_1.AppError(400, '비밀번호를 입력해주세요.');
    const result = await authService.withdrawAccount(req.auth.userId, password);
    res.status(200).json(result);
});
