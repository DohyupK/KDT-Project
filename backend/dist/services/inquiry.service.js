"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInquiry = createInquiry;
exports.getInquiriesByUser = getInquiriesByUser;
exports.getAllInquiries = getAllInquiries;
exports.getInquiryById = getInquiryById;
exports.updateInquiryStatus = updateInquiryStatus;
exports.submitInquiryReply = submitInquiryReply;
const connection_1 = require("../db/connection");
const errorHandler_1 = require("../middleware/errorHandler");
const db_1 = require("../utils/db");
const INQUIRY_STATUSES = ['대기', '진행중', '완료'];
const INQUIRY_PRIORITIES = ['높음', '보통', '낮음'];
const memoryInquiries = [];
let memoryCounter = 0;
function parseAttachments(value) {
    if (!value)
        return [];
    if (Array.isArray(value))
        return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    }
    catch {
        return [];
    }
}
function mapRow(row) {
    const hasReply = Boolean(row.reply_content && row.reply_assignee);
    return {
        id: row.id,
        userId: row.user_id,
        authorName: row.author_name,
        email: row.email,
        phone: row.phone,
        category: row.category,
        title: row.title,
        content: row.content,
        isPrivate: row.is_private === 1,
        attachments: parseAttachments(row.attachments),
        status: row.status,
        priority: row.priority ?? '보통',
        department: row.department ?? null,
        reply: hasReply
            ? {
                content: row.reply_content ?? '',
                assignee: row.reply_assignee ?? '',
                replyStatus: row.reply_status ?? '완료',
                repliedAt: row.replied_at ? new Date(row.replied_at).toISOString() : null,
                internalMemo: row.reply_internal_memo ?? null,
                priority: row.priority ?? '보통',
                adminConfirmed: row.reply_admin_confirmed === 1,
            }
            : null,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
    };
}
function generateInquiryId() {
    memoryCounter += 1;
    return `INQ-${String(memoryCounter).padStart(3, '0')}`;
}
function upsertMemoryInquiry(inquiry) {
    const index = memoryInquiries.findIndex((item) => item.id === inquiry.id);
    if (index >= 0)
        memoryInquiries[index] = inquiry;
    else
        memoryInquiries.unshift(inquiry);
}
function findMemoryInquiry(id) {
    return memoryInquiries.find((item) => item.id === id) ?? null;
}
function validateCreateInput(input) {
    if (!db_1.INQUIRY_CATEGORIES.includes(input.category)) {
        throw new errorHandler_1.AppError(400, '유효하지 않은 문의 카테고리입니다.');
    }
    if (!input.title.trim()) {
        throw new errorHandler_1.AppError(400, '문의 제목을 입력해주세요.');
    }
    if (!input.content.trim()) {
        throw new errorHandler_1.AppError(400, '문의 내용을 입력해주세요.');
    }
    if (input.attachments && input.attachments.length > 10) {
        throw new errorHandler_1.AppError(400, '첨부 파일은 최대 10개까지 등록할 수 있습니다.');
    }
}
function validatePriority(priority) {
    if (!INQUIRY_PRIORITIES.includes(priority)) {
        throw new errorHandler_1.AppError(400, '유효하지 않은 우선순위입니다.');
    }
}
function validateStatus(status) {
    if (!INQUIRY_STATUSES.includes(status)) {
        throw new errorHandler_1.AppError(400, '유효하지 않은 문의 상태입니다.');
    }
}
async function fetchInquiryById(id) {
    try {
        const rows = await (0, connection_1.query)('SELECT * FROM inquiries WHERE id = ? LIMIT 1', [id]);
        return rows[0] ? mapRow(rows[0]) : null;
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_INQUIRIES') || (0, db_1.isDbUnavailableError)(err)) {
            return findMemoryInquiry(id);
        }
        throw err;
    }
}
async function createInquiry(input) {
    validateCreateInput(input);
    const now = new Date().toISOString();
    const inquiry = {
        id: generateInquiryId(),
        userId: input.userId,
        authorName: input.authorName.trim(),
        email: input.email.trim(),
        phone: input.phone.trim(),
        category: input.category,
        title: input.title.trim(),
        content: input.content.trim(),
        isPrivate: input.isPrivate,
        attachments: input.attachments,
        status: '대기',
        priority: '보통',
        department: null,
        reply: null,
        createdAt: now,
        updatedAt: now,
    };
    try {
        await (0, connection_1.query)(`INSERT INTO inquiries
        (id, user_id, author_name, email, phone, category, title, content, is_private, attachments, status, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            inquiry.id,
            inquiry.userId,
            inquiry.authorName,
            inquiry.email,
            inquiry.phone,
            inquiry.category,
            inquiry.title,
            inquiry.content,
            inquiry.isPrivate ? 1 : 0,
            JSON.stringify(inquiry.attachments),
            inquiry.status,
            inquiry.priority,
        ]);
        const saved = await fetchInquiryById(inquiry.id);
        if (saved) {
            upsertMemoryInquiry(saved);
            return saved;
        }
        upsertMemoryInquiry(inquiry);
        return inquiry;
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_INQUIRIES') || (0, db_1.isDbUnavailableError)(err)) {
            upsertMemoryInquiry(inquiry);
            return inquiry;
        }
        throw err;
    }
}
async function getInquiriesByUser(userId) {
    try {
        const rows = await (0, connection_1.query)('SELECT * FROM inquiries WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        return rows.map(mapRow);
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_INQUIRIES') || (0, db_1.isDbUnavailableError)(err)) {
            return memoryInquiries.filter((item) => item.userId === userId);
        }
        throw err;
    }
}
async function getAllInquiries() {
    try {
        const rows = await (0, connection_1.query)('SELECT * FROM inquiries ORDER BY created_at DESC');
        return rows.map(mapRow);
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_INQUIRIES') || (0, db_1.isDbUnavailableError)(err)) {
            return [...memoryInquiries];
        }
        throw err;
    }
}
async function getInquiryById(id) {
    const inquiry = await fetchInquiryById(id);
    if (!inquiry)
        throw new errorHandler_1.AppError(404, '문의를 찾을 수 없습니다.');
    return inquiry;
}
async function updateInquiryStatus(id, status) {
    validateStatus(status);
    const existing = await getInquiryById(id);
    const now = new Date().toISOString();
    const updated = { ...existing, status, updatedAt: now };
    try {
        await (0, connection_1.query)('UPDATE inquiries SET status = ? WHERE id = ?', [status, id]);
        const saved = await fetchInquiryById(id);
        if (saved) {
            upsertMemoryInquiry(saved);
            return saved;
        }
        upsertMemoryInquiry(updated);
        return updated;
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_INQUIRIES') || (0, db_1.isDbUnavailableError)(err)) {
            upsertMemoryInquiry(updated);
            return updated;
        }
        throw err;
    }
}
async function submitInquiryReply(id, input) {
    if (!input.content.trim())
        throw new errorHandler_1.AppError(400, '답변 내용을 입력해주세요.');
    if (!input.assignee.trim())
        throw new errorHandler_1.AppError(400, '담당자를 입력해주세요.');
    validatePriority(input.priority);
    await getInquiryById(id);
    const now = new Date().toISOString();
    const reply = {
        content: input.content.trim(),
        assignee: input.assignee.trim(),
        replyStatus: '완료',
        repliedAt: now,
        internalMemo: input.internalMemo?.trim() || null,
        priority: input.priority,
        adminConfirmed: input.adminConfirmed,
    };
    try {
        await (0, connection_1.query)(`UPDATE inquiries SET
        status = '완료',
        priority = ?,
        reply_content = ?,
        reply_assignee = ?,
        reply_status = ?,
        reply_internal_memo = ?,
        reply_admin_confirmed = ?,
        replied_at = ?
       WHERE id = ?`, [
            reply.priority,
            reply.content,
            reply.assignee,
            reply.replyStatus,
            reply.internalMemo,
            reply.adminConfirmed ? 1 : 0,
            now,
            id,
        ]);
        const saved = await fetchInquiryById(id);
        if (saved) {
            upsertMemoryInquiry(saved);
            return saved;
        }
        const fallback = await getInquiryById(id);
        const merged = { ...fallback, status: '완료', priority: reply.priority, reply, updatedAt: now };
        upsertMemoryInquiry(merged);
        return merged;
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_INQUIRIES') || (0, db_1.isDbUnavailableError)(err)) {
            const existing = await getInquiryById(id);
            const merged = {
                ...existing,
                status: '완료',
                priority: reply.priority,
                reply,
                updatedAt: now,
            };
            upsertMemoryInquiry(merged);
            return merged;
        }
        throw err;
    }
}
