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
exports.submitInquiryReply = exports.updateInquiryStatus = exports.getInquiryById = exports.getAllInquiries = exports.getMyInquiries = exports.createInquiry = void 0;
const inquiryService = __importStar(require("../services/inquiry.service"));
const errorHandler_1 = require("../middleware/errorHandler");
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
exports.createInquiry = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const { category, title, content, isPrivate, attachments, authorName, email, phone } = req.body;
    const inquiry = await inquiryService.createInquiry({
        userId: req.auth.userId,
        authorName: authorName ?? req.auth.name,
        email: email ?? '',
        phone: phone ?? '',
        category: String(category ?? ''),
        title: String(title ?? ''),
        content: String(content ?? ''),
        isPrivate: Boolean(isPrivate),
        attachments: Array.isArray(attachments) ? attachments.map(String) : [],
    });
    res.status(201).json({
        inquiry,
        message: inquiry.isPrivate
            ? '비공개 문의가 정상적으로 접수되었습니다.'
            : '문의가 정상적으로 접수되었습니다.',
    });
});
exports.getMyInquiries = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const inquiries = await inquiryService.getInquiriesByUser(req.auth.userId);
    res.status(200).json({ inquiries });
});
exports.getAllInquiries = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const inquiries = await inquiryService.getAllInquiries();
    res.status(200).json({ inquiries });
});
exports.getInquiryById = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const inquiry = await inquiryService.getInquiryById(String(req.params.id));
    res.status(200).json({ inquiry });
});
exports.updateInquiryStatus = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const { status } = req.body;
    if (!status)
        throw new errorHandler_1.AppError(400, '상태 값이 필요합니다.');
    const inquiry = await inquiryService.updateInquiryStatus(String(req.params.id), String(status));
    res.status(200).json({ inquiry, message: '문의 상태가 변경되었습니다.' });
});
exports.submitInquiryReply = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const { content, assignee, priority, internalMemo, adminConfirmed } = req.body;
    const inquiry = await inquiryService.submitInquiryReply(String(req.params.id), {
        content: String(content ?? ''),
        assignee: String(assignee ?? ''),
        priority: String(priority ?? '보통'),
        internalMemo: internalMemo ? String(internalMemo) : undefined,
        adminConfirmed: Boolean(adminConfirmed),
    });
    res.status(200).json({ inquiry, message: '답변이 등록되었습니다.' });
});
