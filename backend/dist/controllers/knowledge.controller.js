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
exports.refreshReport = exports.getReport = exports.deleteAction = exports.updateAction = exports.createAction = exports.getActions = exports.getDocumentById = exports.getDocuments = void 0;
const knowledgeService = __importStar(require("../services/knowledge.service"));
const errorHandler_1 = require("../middleware/errorHandler");
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
exports.getDocuments = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const { manager, date, keyword } = req.query;
    const result = await knowledgeService.getDocuments({
        manager: manager ? String(manager) : undefined,
        date: date ? String(date) : undefined,
        keyword: keyword ? String(keyword) : undefined,
    });
    res.status(200).json(result);
});
exports.getDocumentById = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const document = await knowledgeService.getDocumentById(String(req.params.id));
    res.status(200).json({ document });
});
exports.getActions = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const actions = await knowledgeService.getActions();
    res.status(200).json({ actions });
});
exports.createAction = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const { situation, action, cause, manager, date } = req.body;
    const created = await knowledgeService.createAction({
        situation: String(situation ?? ''),
        action: String(action ?? ''),
        cause: String(cause ?? ''),
        manager: String(manager ?? ''),
        date: String(date ?? ''),
    });
    res.status(201).json({ action: created, message: '상황 대처 이력이 등록되었습니다.' });
});
exports.updateAction = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const { situation, action, cause, manager, date } = req.body;
    const updated = await knowledgeService.updateAction(Number(req.params.id), {
        situation: String(situation ?? ''),
        action: String(action ?? ''),
        cause: String(cause ?? ''),
        manager: String(manager ?? ''),
        date: String(date ?? ''),
    });
    res.status(200).json({ action: updated, message: '상황 대처 이력이 수정되었습니다.' });
});
exports.deleteAction = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    await knowledgeService.deleteAction(Number(req.params.id));
    res.status(200).json({ message: '상황 대처 이력이 삭제되었습니다.' });
});
exports.getReport = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const report = await knowledgeService.getReport();
    res.status(200).json({ report });
});
exports.refreshReport = asyncHandler(async (req, res) => {
    if (!req.auth)
        throw new errorHandler_1.AppError(401, '인증이 필요합니다.');
    const report = await knowledgeService.refreshReport();
    res.status(200).json({ report, message: '데일리 레포트가 최신 과거 데이터 기준으로 재갱신되었습니다.' });
});
