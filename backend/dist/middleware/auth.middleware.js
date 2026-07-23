"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errorHandler_1 = require("./errorHandler");
function authMiddleware(req, _res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        next(new errorHandler_1.AppError(401, '인증이 필요합니다.'));
        return;
    }
    const token = header.slice(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        next(new errorHandler_1.AppError(500, 'JWT 설정이 없습니다.'));
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, secret);
        req.auth = payload;
        next();
    }
    catch {
        next(new errorHandler_1.AppError(401, '유효하지 않은 토큰입니다.'));
    }
}
