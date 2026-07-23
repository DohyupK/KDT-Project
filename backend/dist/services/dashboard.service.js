"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardSummary = getDashboardSummary;
const connection_1 = require("../db/connection");
const db_1 = require("../utils/db");
const DEFECT_TYPES = ['기계 결함', '원자재 불량', '작업자 실수', '온도 이상'];
const PRODUCTS = ['프레스 모듈 A', '모터 하우징 B', '센서 유닛 C', '컨트롤러 D', '배터리 팩 E'];
const LINES = ['라인-1', '라인-2', '라인-3', '라인-4', '라인-5'];
const OPERATOR_LINE_MAP = {
    OP_A: '라인-1',
    OP_B: '라인-2',
    OP_C: '라인-3',
};
function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
}
function formatDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseDate(value) {
    const [y, m, day] = value.split('-').map(Number);
    return new Date(y, m - 1, day);
}
function seededRandom(seed) {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}
function buildMockRecords() {
    const rand = seededRandom(42);
    const records = [];
    const start = parseDate('2026-05-01');
    for (let dayOffset = 0; dayOffset < 45; dayOffset += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + dayOffset);
        const date = formatDate(d);
        for (let pi = 0; pi < PRODUCTS.length; pi += 1) {
            for (let li = 0; li < LINES.length; li += 1) {
                if (rand() > 0.55)
                    continue;
                const base = 180 + Math.floor(rand() * 220) + pi * 12 + li * 8;
                const wave = Math.sin((dayOffset + pi + li) / 4) * 30;
                const production = Math.max(80, Math.round(base + wave + rand() * 40));
                const targetProduction = Math.round(production * (0.92 + rand() * 0.2));
                const defects = {
                    '기계 결함': Math.floor(rand() * 8),
                    '원자재 불량': Math.floor(rand() * 6),
                    '작업자 실수': Math.floor(rand() * 5),
                    '온도 이상': Math.floor(rand() * 4),
                };
                if (dayOffset > 25) {
                    defects['기계 결함'] = Math.max(0, defects['기계 결함'] - 2);
                    defects['온도 이상'] = Math.max(0, defects['온도 이상'] - 1);
                }
                const defectCount = DEFECT_TYPES.reduce((sum, t) => sum + defects[t], 0);
                records.push({
                    date,
                    product: PRODUCTS[pi],
                    line: LINES[li],
                    production,
                    defectCount,
                    targetProduction,
                    defects,
                });
            }
        }
    }
    return records;
}
function buildMeta(records) {
    if (records.length === 0) {
        return {
            minDate: '2026-05-01',
            maxDate: '2026-06-14',
            products: [...PRODUCTS],
            lines: [...LINES],
        };
    }
    return {
        minDate: records.reduce((min, r) => (r.date < min ? r.date : min), records[0].date),
        maxDate: records.reduce((max, r) => (r.date > max ? r.date : max), records[0].date),
        products: [...PRODUCTS],
        lines: [...LINES],
    };
}
function filterRecords(records, params) {
    return records.filter((r) => {
        if (params.startDate && r.date < params.startDate)
            return false;
        if (params.endDate && r.date > params.endDate)
            return false;
        if (params.product && params.product !== '전체' && r.product !== params.product)
            return false;
        if (params.line && params.line !== '전체' && r.line !== params.line)
            return false;
        return true;
    });
}
function mapOperatorToLine(operatorId, index) {
    if (operatorId && OPERATOR_LINE_MAP[operatorId])
        return OPERATOR_LINE_MAP[operatorId];
    return LINES[index % LINES.length];
}
function mapIndexToProduct(index) {
    return PRODUCTS[index % PRODUCTS.length];
}
function buildRecordsFromDbRows(rows) {
    return rows.map((row, index) => {
        const production = Number(row.production) || 0;
        const defectCount = Number(row.defect_count) || 0;
        const date = row.record_date instanceof Date
            ? formatDate(row.record_date)
            : String(row.record_date).slice(0, 10);
        const tempDefects = Number(row.temp_high) || 0;
        const metalDefects = Number(row.metal_high) || 0;
        const lithiumDefects = Number(row.lithium_high) || 0;
        const remaining = Math.max(0, defectCount - tempDefects - metalDefects - lithiumDefects);
        const defects = {
            '온도 이상': tempDefects,
            '원자재 불량': metalDefects,
            '작업자 실수': lithiumDefects,
            '기계 결함': remaining,
        };
        return {
            date,
            product: mapIndexToProduct(index),
            line: mapOperatorToLine(row.operator_id, index),
            production,
            defectCount,
            targetProduction: Math.round(production * 1.05),
            defects,
        };
    });
}
async function fetchRecordsFromDb() {
    const rows = await (0, connection_1.query)(`SELECT
       DATE(post_sintering_at) AS record_date,
       operator_id,
       COUNT(*) AS production,
       SUM(CASE WHEN quality_defect = 1 THEN 1 ELSE 0 END) AS defect_count,
       SUM(CASE WHEN sintering_temp >= 820 THEN 1 ELSE 0 END) AS temp_high,
       SUM(CASE WHEN metal_impurity >= 0.03 THEN 1 ELSE 0 END) AS metal_high,
       SUM(CASE WHEN lithium_input >= 2.8 THEN 1 ELSE 0 END) AS lithium_high
     FROM cathode_classification_data
     WHERE post_sintering_at IS NOT NULL
     GROUP BY DATE(post_sintering_at), operator_id
     ORDER BY record_date ASC`);
    if (rows.length === 0)
        return [];
    return buildRecordsFromDbRows(rows);
}
async function getAllRecords() {
    try {
        const dbRecords = await fetchRecordsFromDb();
        if (dbRecords.length > 0)
            return dbRecords;
        if ((0, db_1.useMockStorage)('MOCK_DASHBOARD'))
            return buildMockRecords();
        return buildMockRecords();
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_DASHBOARD') || (0, db_1.isDbUnavailableError)(err)) {
            return buildMockRecords();
        }
        throw err;
    }
}
async function getDashboardSummary(params) {
    const allRecords = await getAllRecords();
    const meta = buildMeta(allRecords);
    const records = filterRecords(allRecords, params);
    return { records, meta };
}
