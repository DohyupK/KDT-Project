"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIssues = getIssues;
exports.getIssueById = getIssueById;
exports.updateIssue = updateIssue;
exports.getHandoverSummary = getHandoverSummary;
const connection_1 = require("../db/connection");
const errorHandler_1 = require("../middleware/errorHandler");
const db_1 = require("../utils/db");
const ISSUE_STATUSES = ['접수', '분석 중', '조치 중', '완료'];
const ISSUE_RISKS = ['높음', '중간', '낮음'];
function createProcessData(temperatures, pressures, before, after) {
    return temperatures.map((temperature, index) => ({
        time: `${index * 2}h`,
        temperature,
        pressure: pressures[index],
        speed: 34 + (index % 3),
        riskBefore: before[index],
        riskAfter: after[index],
    }));
}
const MOCK_HANDOVER = {
    period: '2026-07-21 08:00 ~ 16:00',
    averageTemperature: 742.6,
    averagePressure: 1.94,
    averageSpeed: 35.2,
    aiRiskPredictions: 5,
    riskyLots: 3,
    issueCount: 4,
};
function buildInitialIssues() {
    return [
        {
            id: 'ISS-260721-018',
            occurredAt: '2026-07-21 15:42',
            date: '2026-07-21',
            lot: 'LOT-CA-260721-08',
            risk: '높음',
            status: '조치 중',
            title: '소성로 2호기 온도 상한 지속 초과',
            assignee: '김현수',
            action: '소성 온도를 742°C로 하향 조정하고 냉각 계통을 점검 중입니다.',
            completed: false,
            anomaly: '14시 이후 온도가 관리 상한 750°C를 3회 초과했으며 AI 위험 점수가 91점까지 상승했습니다.',
            processData: createProcessData([738, 742, 748, 754, 752, 746], [1.8, 1.9, 2.1, 2.4, 2.3, 2.0], [42, 51, 68, 91, 86, 72], [38, 43, 52, 61, 48, 35]),
        },
        {
            id: 'ISS-260721-017',
            occurredAt: '2026-07-21 14:18',
            date: '2026-07-21',
            lot: 'LOT-CA-260721-07',
            risk: '중간',
            status: '분석 중',
            title: '리튬 투입 속도 편차 증가',
            assignee: '박서연',
            action: '공급기 센서 로그와 계량기 교정 이력을 비교 분석하고 있습니다.',
            completed: false,
            anomaly: '리튬 투입 속도의 표준편차가 기준 대비 32% 증가하여 조성 불균일 가능성이 감지되었습니다.',
            processData: createProcessData([736, 739, 741, 743, 740, 738], [1.7, 1.8, 2.0, 2.1, 1.9, 1.8], [31, 39, 55, 66, 58, 47], [28, 32, 41, 46, 39, 31]),
        },
        {
            id: 'ISS-260721-016',
            occurredAt: '2026-07-21 11:05',
            date: '2026-07-21',
            lot: 'LOT-CA-260721-05',
            risk: '낮음',
            status: '완료',
            title: '혼합기 진동 센서 일시 이상',
            assignee: '이도윤',
            action: '센서 커넥터를 재체결하고 정상 신호 수신을 확인했습니다.',
            completed: true,
            anomaly: '진동 센서 신호가 4분간 단절되었으나 설비 실측 진동값은 정상 범위였습니다.',
            processData: createProcessData([735, 736, 737, 738, 737, 736], [1.7, 1.7, 1.8, 1.8, 1.7, 1.7], [24, 28, 36, 33, 27, 22], [20, 22, 25, 23, 20, 18]),
        },
        {
            id: 'ISS-260720-015',
            occurredAt: '2026-07-20 23:36',
            date: '2026-07-20',
            lot: 'LOT-CA-260720-12',
            risk: '높음',
            status: '접수',
            title: '냉각 구간 압력 급상승',
            assignee: '미배정',
            action: '',
            completed: false,
            anomaly: '냉각수 압력이 2.7bar까지 급상승하고 배출 온도 안정화 시간이 평소보다 18분 지연되었습니다.',
            processData: createProcessData([741, 744, 747, 749, 746, 742], [1.9, 2.0, 2.3, 2.7, 2.5, 2.2], [45, 53, 71, 94, 83, 67], [41, 47, 58, 69, 54, 42]),
        },
        {
            id: 'ISS-260720-014',
            occurredAt: '2026-07-20 18:12',
            date: '2026-07-20',
            lot: 'LOT-CA-260720-09',
            risk: '중간',
            status: '완료',
            title: '입도 분포 D50 기준치 접근',
            assignee: '최유진',
            action: '분쇄기 회전수를 3% 낮추고 재측정하여 정상 범위를 확인했습니다.',
            completed: true,
            anomaly: 'D50 측정값이 관리 상한에 근접했으나 공정 조정 후 정상 중앙값으로 회복되었습니다.',
            processData: createProcessData([737, 738, 740, 741, 739, 738], [1.8, 1.9, 2.0, 2.0, 1.9, 1.8], [34, 42, 57, 63, 48, 37], [29, 34, 40, 43, 33, 26]),
        },
        {
            id: 'ISS-260719-013',
            occurredAt: '2026-07-19 16:48',
            date: '2026-07-19',
            lot: 'LOT-CA-260719-06',
            risk: '낮음',
            status: '완료',
            title: '검사 장비 이미지 수집 지연',
            assignee: '정민재',
            action: '카메라 캐시를 초기화하고 네트워크 지연 상태를 점검했습니다.',
            completed: true,
            anomaly: '표면 검사 이미지 수집이 평균 1.2초 지연되었으나 검사 결과 누락은 없었습니다.',
            processData: createProcessData([734, 735, 736, 736, 735, 734], [1.6, 1.7, 1.7, 1.8, 1.7, 1.6], [18, 22, 29, 31, 25, 20], [16, 18, 21, 22, 19, 15]),
        },
        {
            id: 'ISS-260719-012',
            occurredAt: '2026-07-19 09:22',
            date: '2026-07-19',
            lot: 'LOT-CA-260719-02',
            risk: '중간',
            status: '조치 중',
            title: '전구체 수분 함량 변동 감지',
            assignee: '한지우',
            action: '원료 보관 습도와 건조 공정 시간을 재조정하고 있습니다.',
            completed: false,
            anomaly: '수분 함량이 0.03%p 상승하여 소성 후 잔류 리튬 증가 가능성이 확인되었습니다.',
            processData: createProcessData([736, 738, 742, 744, 742, 739], [1.7, 1.8, 2.0, 2.2, 2.1, 1.9], [30, 38, 54, 69, 61, 49], [27, 33, 42, 49, 41, 34]),
        },
        {
            id: 'ISS-260718-011',
            occurredAt: '2026-07-18 21:10',
            date: '2026-07-18',
            lot: 'LOT-CA-260718-11',
            risk: '높음',
            status: '분석 중',
            title: '예측 불량률 2.5% 초과',
            assignee: '김현수',
            action: '동일 조건 과거 LOT와 공정 파라미터를 교차 분석 중입니다.',
            completed: false,
            anomaly: '온도와 투입량 복합 영향으로 AI 예측 불량률이 2.73%까지 상승했습니다.',
            processData: createProcessData([739, 743, 749, 753, 751, 747], [1.8, 2.0, 2.2, 2.5, 2.4, 2.1], [44, 56, 74, 92, 87, 73], [39, 46, 58, 65, 55, 43]),
        },
    ];
}
const memoryIssues = buildInitialIssues();
function parseProcessData(value) {
    if (!value)
        return [];
    if (Array.isArray(value))
        return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function formatOccurredAt(value) {
    const d = new Date(value);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function mapRow(row) {
    const occurredAt = formatOccurredAt(row.occurred_at);
    return {
        id: row.id,
        occurredAt,
        date: occurredAt.slice(0, 10),
        lot: row.lot,
        risk: row.risk,
        status: row.status,
        title: row.title,
        assignee: row.assignee,
        action: row.action ?? '',
        completed: row.completed === 1,
        anomaly: row.anomaly,
        processData: parseProcessData(row.process_data),
    };
}
function upsertMemoryIssue(issue) {
    const index = memoryIssues.findIndex((item) => item.id === issue.id);
    if (index >= 0)
        memoryIssues[index] = issue;
    else
        memoryIssues.unshift(issue);
}
function filterIssues(issues, params) {
    const keyword = params.search?.trim().toLowerCase() ?? '';
    return issues.filter((issue) => {
        const matchesSearch = !keyword ||
            issue.title.toLowerCase().includes(keyword) ||
            issue.lot.toLowerCase().includes(keyword);
        const matchesDate = !params.date || issue.date === params.date;
        const matchesLot = !params.lot || issue.lot === params.lot;
        const matchesRisk = !params.risk || issue.risk === params.risk;
        const matchesStatus = !params.status || issue.status === params.status;
        return matchesSearch && matchesDate && matchesLot && matchesRisk && matchesStatus;
    });
}
function validateStatus(status) {
    if (!ISSUE_STATUSES.includes(status)) {
        throw new errorHandler_1.AppError(400, '유효하지 않은 처리 상태입니다.');
    }
}
async function fetchAllFromDb() {
    const rows = await (0, connection_1.query)('SELECT * FROM issues ORDER BY occurred_at DESC');
    return rows.map(mapRow);
}
async function seedMemoryFromDbOrMock() {
    try {
        const dbIssues = await fetchAllFromDb();
        if (dbIssues.length > 0) {
            memoryIssues.splice(0, memoryIssues.length, ...dbIssues);
            return;
        }
    }
    catch (err) {
        if (!((0, db_1.useMockStorage)('MOCK_ISSUES') || (0, db_1.isDbUnavailableError)(err)))
            throw err;
    }
    if (memoryIssues.length === 0) {
        memoryIssues.push(...buildInitialIssues());
    }
}
async function getAllIssuesInternal() {
    await seedMemoryFromDbOrMock();
    return [...memoryIssues];
}
async function getIssues(params) {
    try {
        const all = await getAllIssuesInternal();
        return filterIssues(all, params);
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_ISSUES') || (0, db_1.isDbUnavailableError)(err)) {
            return filterIssues(buildInitialIssues(), params);
        }
        throw err;
    }
}
async function getIssueById(id) {
    const all = await getAllIssuesInternal();
    const issue = all.find((item) => item.id === id);
    if (!issue)
        throw new errorHandler_1.AppError(404, '이슈를 찾을 수 없습니다.');
    return issue;
}
async function updateIssue(id, input) {
    validateStatus(input.status);
    const existing = await getIssueById(id);
    const status = input.completed ? '완료' : input.status;
    const updated = {
        ...existing,
        assignee: input.assignee.trim() || '미배정',
        status,
        action: input.action.trim(),
        completed: input.completed || status === '완료',
    };
    try {
        await (0, connection_1.query)(`UPDATE issues SET assignee = ?, status = ?, action = ?, completed = ? WHERE id = ?`, [updated.assignee, updated.status, updated.action, updated.completed ? 1 : 0, id]);
        upsertMemoryIssue(updated);
        return updated;
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_ISSUES') || (0, db_1.isDbUnavailableError)(err)) {
            upsertMemoryIssue(updated);
            return updated;
        }
        throw err;
    }
}
async function getHandoverSummary() {
    try {
        const issues = await getAllIssuesInternal();
        const openIssues = issues.filter((issue) => !issue.completed);
        const riskyLots = new Set(openIssues.filter((i) => i.risk === '높음').map((i) => i.lot)).size;
        let tempSum = 0;
        let pressureSum = 0;
        let speedSum = 0;
        let count = 0;
        for (const issue of issues.slice(0, 4)) {
            for (const point of issue.processData) {
                tempSum += point.temperature;
                pressureSum += point.pressure;
                speedSum += point.speed;
                count += 1;
            }
        }
        if (count === 0)
            return MOCK_HANDOVER;
        return {
            ...MOCK_HANDOVER,
            averageTemperature: Math.round((tempSum / count) * 10) / 10,
            averagePressure: Math.round((pressureSum / count) * 100) / 100,
            averageSpeed: Math.round((speedSum / count) * 10) / 10,
            aiRiskPredictions: openIssues.filter((i) => i.risk !== '낮음').length,
            riskyLots,
            issueCount: openIssues.length,
        };
    }
    catch (err) {
        if ((0, db_1.useMockStorage)('MOCK_ISSUES') || (0, db_1.isDbUnavailableError)(err)) {
            return MOCK_HANDOVER;
        }
        throw err;
    }
}
