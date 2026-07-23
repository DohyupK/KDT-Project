"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDocuments = getDocuments;
exports.getDocumentById = getDocumentById;
exports.getActions = getActions;
exports.createAction = createAction;
exports.updateAction = updateAction;
exports.deleteAction = deleteAction;
exports.getReport = getReport;
exports.refreshReport = refreshReport;
const connection_1 = require("../db/connection");
const errorHandler_1 = require("../middleware/errorHandler");
const db_1 = require("../utils/db");
function buildInitialDocuments() {
    return [
        {
            id: 'DOC-2026-041',
            manager: '김현수',
            date: '2026-07-18',
            title: '소성로 2호기 온도 프로파일 최적화 결과',
            summary: '온도 상한 초과 재발 방지를 위한 구간별 설정값 조정 결과 정리',
            process: '소성',
            lot: 'LOT-CA-260718-11',
            detail: '소성로 2호기의 구간별 온도 프로파일을 재설계하여 3구간 목표 온도를 748°C에서 742°C로 하향 조정했습니다. 조정 후 72시간 동안 불량률이 2.4%에서 1.7%로 감소했으며, 결정 구조 분석 결과 리튬 잔류량도 기준치 이내로 확인되었습니다. 동절기에는 승온 속도를 5% 낮추는 보정이 추가로 필요합니다.',
        },
        {
            id: 'DOC-2026-040',
            manager: '박서연',
            date: '2026-07-15',
            title: '리튬 계량기 교정 주기 개선 보고',
            summary: '투입량 편차 원인이었던 계량기 드리프트 보정 주기 단축안',
            process: '원료 투입',
            lot: 'LOT-CA-260715-04',
            detail: '리튬 계량기의 월 1회 교정 주기를 2주 1회로 단축한 결과, 투입량 표준편차가 0.021에서 0.008로 감소했습니다. 드리프트는 주로 호퍼 진동에 의한 로드셀 미세 변형에서 발생하며, 방진 패드 교체 시 교정 주기를 다시 완화할 수 있습니다.',
        },
        {
            id: 'DOC-2026-039',
            manager: '이도윤',
            date: '2026-07-12',
            title: '혼합 공정 임펠러 마모 점검 이력',
            summary: '혼합 균일도 저하와 임펠러 마모의 상관관계 분석',
            process: '혼합',
            lot: 'LOT-CA-260712-08',
            detail: '임펠러 날개 끝단 마모가 1.2mm를 초과하면 혼합 균일도 지수가 급격히 저하되는 것을 확인했습니다. 마모 측정을 월 점검 항목에 추가했고, 예비품 재고 기준을 2개에서 4개로 상향했습니다.',
        },
        {
            id: 'DOC-2026-038',
            manager: '최유진',
            date: '2026-07-10',
            title: '입도 분포 관리 기준 개정안',
            summary: 'D50 관리 상한 초과 사례 분석 및 분쇄 조건 표준화',
            process: '분쇄',
            lot: 'LOT-CA-260710-03',
            detail: '최근 3개월간 D50 상한 접근 사례 7건을 분석한 결과, 분쇄기 회전수와 원료 수분 함량의 조합이 주요 변수였습니다. 수분 0.25% 초과 시 회전수를 3% 하향하는 조건표를 작성하여 표준 작업 지침에 반영했습니다.',
        },
        {
            id: 'DOC-2026-037',
            manager: '김현수',
            date: '2026-07-08',
            title: '냉각 구간 압력 이상 대응 매뉴얼',
            summary: '냉각수 압력 급상승 시 단계별 조치 절차 정리',
            process: '냉각',
            lot: 'LOT-CA-260708-12',
            detail: '냉각수 압력이 2.5bar를 초과하면 1단계로 바이패스 밸브를 개방하고, 2.8bar 초과 시 라인 절환 후 열교환기 스케일 점검을 수행합니다. 7월 초 발생한 압력 급상승은 열교환기 스케일 축적이 원인이었으며, 세정 후 정상화되었습니다.',
        },
        {
            id: 'DOC-2026-036',
            manager: '정민재',
            date: '2026-07-05',
            title: '표면 검사 카메라 조도 보정 기록',
            summary: '오검출률 개선을 위한 조명 세팅 변경 이력',
            process: '검사',
            lot: 'LOT-CA-260705-06',
            detail: '검사 부스 조도를 4200lux에서 4800lux로 상향하고 카메라 노출 시간을 재조정하여 표면 결함 오검출률을 3.1%에서 1.2%로 낮췄습니다. 조도 센서 값이 4500lux 아래로 내려가면 알람이 발생하도록 설정했습니다.',
        },
        {
            id: 'DOC-2026-035',
            manager: '한지우',
            date: '2026-07-02',
            title: '전구체 보관 습도 관리 개선 보고',
            summary: '수분 함량 변동 저감을 위한 보관 환경 기준 강화',
            process: '원료 보관',
            lot: 'LOT-CA-260702-01',
            detail: '전구체 보관 창고의 상대습도 기준을 45%에서 35%로 강화하고 제습기 가동 로직을 자동화했습니다. 개선 후 입고 로트 간 수분 함량 편차가 절반 이하로 감소했습니다.',
        },
        {
            id: 'DOC-2026-034',
            manager: '박서연',
            date: '2026-06-28',
            title: '소성 배가스 산소 농도 트렌드 분석',
            summary: '산소 농도와 결정성 상관 분석 및 급기 제어 개선',
            process: '소성',
            lot: 'LOT-CA-260628-09',
            detail: '배가스 산소 농도가 19.2% 아래로 내려간 구간에서 결정성 저하가 관측되었습니다. 급기 팬 제어를 수동에서 PID 자동 제어로 전환하여 산소 농도 변동 폭을 ±0.5%에서 ±0.15%로 줄였습니다.',
        },
        {
            id: 'DOC-2026-033',
            manager: '이도윤',
            date: '2026-06-24',
            title: '설비 예지보전 진동 데이터 리뷰',
            summary: '혼합기·분쇄기 베어링 진동 스펙트럼 월간 리뷰',
            process: '설비 관리',
            lot: '-',
            detail: '분쇄기 2호기 베어링에서 외륜 결함 주파수 성분이 미세하게 증가하는 추세가 확인되었습니다. 8월 정기 보전 시 교체를 권고하며, 그 전까지 주 1회 정밀 측정을 수행합니다.',
        },
    ];
}
function buildInitialActions() {
    return [
        {
            id: 1,
            situation: '소성로 2호기 온도 상한(750°C) 3회 연속 초과',
            action: '목표 온도 742°C 하향 및 냉각 계통 긴급 점검',
            cause: '온도 센서 열화로 인한 제어 지연',
            manager: '김현수',
            date: '2026-07-18',
        },
        {
            id: 2,
            situation: '리튬 투입량 편차 급증으로 조성 불균일 경보 발생',
            action: '계량기 즉시 재교정 및 투입 속도 수동 제어 전환',
            cause: '계량기 로드셀 드리프트',
            manager: '박서연',
            date: '2026-07-15',
        },
        {
            id: 3,
            situation: '냉각수 압력 2.7bar 급상승',
            action: '바이패스 밸브 개방 후 열교환기 세정',
            cause: '열교환기 스케일 축적',
            manager: '김현수',
            date: '2026-07-08',
        },
        {
            id: 4,
            situation: '표면 검사 오검출률 3% 초과',
            action: '검사 부스 조도 상향 및 카메라 노출 재조정',
            cause: '조명 열화로 인한 조도 저하',
            manager: '정민재',
            date: '2026-07-05',
        },
        {
            id: 5,
            situation: '전구체 수분 함량 상승으로 잔류 리튬 증가 우려',
            action: '보관 습도 기준 강화 및 건조 시간 10% 연장',
            cause: '장마철 보관 창고 습도 상승',
            manager: '한지우',
            date: '2026-07-02',
        },
    ];
}
const INITIAL_REPORT = {
    baseDate: '2026-07-21',
    mainCause: '소성 온도 상한 근접 운전(747°C 이상) 구간에서의 결정성 저하가 최근 불량률 상승분의 62%를 설명합니다.',
    similarCase: '2026-07-18 소성로 2호기 온도 초과 사례(DOC-2026-041)와 공정 패턴이 91% 유사합니다.',
    recommendation: '3구간 목표 온도를 742°C로 유지하고, 승온 속도를 5% 하향한 상태에서 4시간 간격으로 결정성 샘플링을 권장합니다.',
    riskSummary: '현재 위험도 중간 — 조치 미이행 시 48시간 내 불량률 2.5% 초과 확률 78%',
    referenceCount: 126,
};
const memoryDocuments = buildInitialDocuments();
const memoryActions = buildInitialActions();
let memoryReport = { ...INITIAL_REPORT };
let actionIdCounter = 5;
function formatDate(value) {
    if (value instanceof Date) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    return String(value).slice(0, 10);
}
function mapDocumentRow(row) {
    return {
        id: row.id,
        manager: row.manager,
        date: formatDate(row.doc_date),
        title: row.title,
        summary: row.summary,
        process: row.process,
        lot: row.lot,
        detail: row.detail,
    };
}
function mapActionRow(row) {
    return {
        id: row.id,
        situation: row.situation,
        action: row.action,
        cause: row.cause,
        manager: row.manager,
        date: formatDate(row.action_date),
    };
}
function filterDocuments(documents, params) {
    const keyword = params.keyword?.trim().toLowerCase() ?? '';
    return documents.filter((doc) => {
        const matchesManager = !params.manager || doc.manager === params.manager;
        const matchesDate = !params.date || doc.date === params.date;
        const matchesKeyword = !keyword ||
            doc.title.toLowerCase().includes(keyword) ||
            doc.summary.toLowerCase().includes(keyword) ||
            doc.process.toLowerCase().includes(keyword) ||
            doc.lot.toLowerCase().includes(keyword);
        return matchesManager && matchesDate && matchesKeyword;
    });
}
async function loadDocumentsFromDb() {
    const rows = await (0, connection_1.query)('SELECT * FROM knowledge_documents ORDER BY doc_date DESC, id DESC');
    return rows.map(mapDocumentRow);
}
async function loadActionsFromDb() {
    const rows = await (0, connection_1.query)('SELECT * FROM knowledge_actions ORDER BY action_date DESC, id DESC');
    return rows.map(mapActionRow);
}
async function ensureMemoryLoaded() {
    try {
        const dbDocs = await loadDocumentsFromDb();
        if (dbDocs.length > 0) {
            memoryDocuments.splice(0, memoryDocuments.length, ...dbDocs);
        }
        const dbActions = await loadActionsFromDb();
        if (dbActions.length > 0) {
            memoryActions.splice(0, memoryActions.length, ...dbActions);
            actionIdCounter = Math.max(actionIdCounter, ...dbActions.map((a) => a.id));
        }
    }
    catch (err) {
        if (!((0, db_1.useMockStorage)('MOCK_KNOWLEDGE') || (0, db_1.isDbUnavailableError)(err)))
            throw err;
    }
    if (memoryDocuments.length === 0)
        memoryDocuments.push(...buildInitialDocuments());
    if (memoryActions.length === 0)
        memoryActions.push(...buildInitialActions());
}
function getManagers(documents) {
    return Array.from(new Set(documents.map((doc) => doc.manager))).sort();
}
async function getDocuments(params) {
    try {
        await ensureMemoryLoaded();
        const documents = filterDocuments([...memoryDocuments], params);
        return { documents, managers: getManagers(memoryDocuments) };
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_KNOWLEDGE') || (0, db_1.isDbUnavailableError)(err)) {
            const documents = filterDocuments(buildInitialDocuments(), params);
            return { documents, managers: getManagers(buildInitialDocuments()) };
        }
        throw err;
    }
}
async function getDocumentById(id) {
    await ensureMemoryLoaded();
    const doc = memoryDocuments.find((item) => item.id === id);
    if (!doc)
        throw new errorHandler_1.AppError(404, '문서를 찾을 수 없습니다.');
    return doc;
}
async function getActions() {
    try {
        await ensureMemoryLoaded();
        return [...memoryActions];
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_KNOWLEDGE') || (0, db_1.isDbUnavailableError)(err)) {
            return buildInitialActions();
        }
        throw err;
    }
}
async function createAction(input) {
    if (!input.situation.trim())
        throw new errorHandler_1.AppError(400, '발생 상황을 입력해주세요.');
    if (!input.action.trim())
        throw new errorHandler_1.AppError(400, '대처 방안을 입력해주세요.');
    if (!input.cause.trim())
        throw new errorHandler_1.AppError(400, '원인을 입력해주세요.');
    if (!input.manager.trim())
        throw new errorHandler_1.AppError(400, '담당자를 입력해주세요.');
    if (!input.date)
        throw new errorHandler_1.AppError(400, '날짜를 입력해주세요.');
    await ensureMemoryLoaded();
    actionIdCounter += 1;
    const created = {
        id: actionIdCounter,
        situation: input.situation.trim(),
        action: input.action.trim(),
        cause: input.cause.trim(),
        manager: input.manager.trim(),
        date: input.date,
    };
    try {
        const result = (await (0, connection_1.query)(`INSERT INTO knowledge_actions (situation, action, cause, manager, action_date)
       VALUES (?, ?, ?, ?, ?)`, [created.situation, created.action, created.cause, created.manager, created.date]));
        if (result.insertId)
            created.id = Number(result.insertId);
        memoryActions.unshift(created);
        return created;
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_KNOWLEDGE') || (0, db_1.isDbUnavailableError)(err)) {
            memoryActions.unshift(created);
            return created;
        }
        throw err;
    }
}
async function updateAction(id, input) {
    if (!input.situation.trim())
        throw new errorHandler_1.AppError(400, '발생 상황을 입력해주세요.');
    if (!input.action.trim())
        throw new errorHandler_1.AppError(400, '대처 방안을 입력해주세요.');
    if (!input.cause.trim())
        throw new errorHandler_1.AppError(400, '원인을 입력해주세요.');
    if (!input.manager.trim())
        throw new errorHandler_1.AppError(400, '담당자를 입력해주세요.');
    if (!input.date)
        throw new errorHandler_1.AppError(400, '날짜를 입력해주세요.');
    await ensureMemoryLoaded();
    const index = memoryActions.findIndex((item) => item.id === id);
    if (index < 0)
        throw new errorHandler_1.AppError(404, '상황 대처 이력을 찾을 수 없습니다.');
    const updated = {
        id,
        situation: input.situation.trim(),
        action: input.action.trim(),
        cause: input.cause.trim(),
        manager: input.manager.trim(),
        date: input.date,
    };
    try {
        await (0, connection_1.query)(`UPDATE knowledge_actions SET situation = ?, action = ?, cause = ?, manager = ?, action_date = ? WHERE id = ?`, [updated.situation, updated.action, updated.cause, updated.manager, updated.date, id]);
        memoryActions[index] = updated;
        return updated;
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_KNOWLEDGE') || (0, db_1.isDbUnavailableError)(err)) {
            memoryActions[index] = updated;
            return updated;
        }
        throw err;
    }
}
async function deleteAction(id) {
    await ensureMemoryLoaded();
    const index = memoryActions.findIndex((item) => item.id === id);
    if (index < 0)
        throw new errorHandler_1.AppError(404, '상황 대처 이력을 찾을 수 없습니다.');
    try {
        await (0, connection_1.query)('DELETE FROM knowledge_actions WHERE id = ?', [id]);
        memoryActions.splice(index, 1);
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_KNOWLEDGE') || (0, db_1.isDbUnavailableError)(err)) {
            memoryActions.splice(index, 1);
        }
        else {
            throw err;
        }
    }
}
async function getReport() {
    await ensureMemoryLoaded();
    return { ...memoryReport };
}
async function refreshReport() {
    await ensureMemoryLoaded();
    memoryReport = {
        ...memoryReport,
        baseDate: '2026-07-21',
        referenceCount: memoryReport.referenceCount + memoryActions.length,
    };
    return { ...memoryReport };
}
