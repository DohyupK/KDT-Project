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
const express_1 = require("express");
const knowledgeController = __importStar(require("../controllers/knowledge.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/documents', auth_middleware_1.authMiddleware, knowledgeController.getDocuments);
router.get('/documents/:id', auth_middleware_1.authMiddleware, knowledgeController.getDocumentById);
router.get('/actions', auth_middleware_1.authMiddleware, knowledgeController.getActions);
router.post('/actions', auth_middleware_1.authMiddleware, knowledgeController.createAction);
router.put('/actions/:id', auth_middleware_1.authMiddleware, knowledgeController.updateAction);
router.delete('/actions/:id', auth_middleware_1.authMiddleware, knowledgeController.deleteAction);
router.get('/report', auth_middleware_1.authMiddleware, knowledgeController.getReport);
router.post('/report/refresh', auth_middleware_1.authMiddleware, knowledgeController.refreshReport);
exports.default = router;
