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
exports.updateIssue = exports.getIssueById = exports.getHandoverSummary = exports.getIssues = void 0;
const issueService = __importStar(require("../services/issue.service"));
const errorHandler_1 = require("../middleware/errorHandler");
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
exports.getIssues = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const { search, date, lot, risk, status } = req.query;
    const issues = await issueService.getIssues({
        search: search ? String(search) : undefined,
        date: date ? String(date) : undefined,
        lot: lot ? String(lot) : undefined,
        risk: risk ? String(risk) : undefined,
        status: status ? String(status) : undefined,
    });
    res.status(200).json({ issues });
});
exports.getHandoverSummary = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const summary = await issueService.getHandoverSummary();
    res.status(200).json({ summary });
});
exports.getIssueById = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const issue = await issueService.getIssueById(String(req.params.id));
    res.status(200).json({ issue });
});
exports.updateIssue = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const { assignee, status, action, completed } = req.body;
    if (status === undefined || completed === undefined) {
        throw new errorHandler_1.AppError(400, '상태와 완료 여부가 필요합니다.');
    }
    const issue = await issueService.updateIssue(String(req.params.id), {
        assignee: String(assignee ?? ''),
        status: String(status),
        action: String(action ?? ''),
        completed: Boolean(completed),
    });
    res.status(200).json({ issue, message: '이슈 처리 정보가 저장되었습니다.' });
});
