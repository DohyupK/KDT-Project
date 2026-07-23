/* eslint-disable no-console */
const base = 'http://localhost:3001/api';
const proxyBase = 'http://localhost:3000/api';
const results = [];
const testUserId = `verify_${Date.now()}`;
const testPassword = 'Test1234!';
const testName = 'Integration Test';
const testPhone = '01012345678';
const testEmail = 'verify@test.local';

let token = null;
let inquiryId = null;
let issueId = null;
let actionId = null;
let mailId = null;

function addResult(page, test, status, detail) {
  results.push({ page, test, status, detail });
}

function errMsg(resp, fallback) {
  if (resp?.data?.message) return String(resp.data.message);
  if (resp?.error) return String(resp.error);
  if (resp?.statusCode) return `status ${resp.statusCode}`;
  return fallback;
}

async function invokeApi(method, path, { body, token: authToken, expectedStatus = 200 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return {
      ok: res.status === expectedStatus,
      statusCode: res.status,
      data,
      error: null,
    };
  } catch (error) {
    return { ok: false, statusCode: null, data: null, error: error.message };
  }
}

async function main() {
  const h = await invokeApi('GET', '/health');
  if (h.ok && h.data?.status === 'ok') addResult('Common', 'GET /health', 'PASS', 'status ok');
  else addResult('Common', 'GET /health', 'FAIL', errMsg(h, 'bad response'));

  const cid = await invokeApi('GET', `/auth/check-id?userId=${encodeURIComponent(testUserId)}`);
  if (cid.ok && cid.data?.available === true) addResult('Login', 'GET /auth/check-id', 'PASS', 'available=true');
  else addResult('Login', 'GET /auth/check-id', 'FAIL', errMsg(cid, 'check-id failed'));

  const reg = await invokeApi('POST', '/auth/register', {
    expectedStatus: 201,
    body: { userId: testUserId, password: testPassword, name: testName, phone: testPhone, email: testEmail },
  });
  if (reg.ok) addResult('Login', 'POST /auth/register', 'PASS', reg.data.message);
  else addResult('Login', 'POST /auth/register', 'FAIL', errMsg(reg, 'register failed'));

  const login = await invokeApi('POST', '/auth/login', {
    body: { userId: testUserId, password: testPassword },
  });
  if (login.ok && login.data?.token) {
    token = login.data.token;
    addResult('Login', 'POST /auth/login', 'PASS', 'token received');
  } else {
    addResult('Login', 'POST /auth/login', 'FAIL', errMsg(login, 'no token'));
  }

  if (!token) {
    addResult('Common', 'JWT-protected APIs', 'SKIP', 'Auth DB unavailable - remaining JWT tests skipped');
    printSummary();
    process.exit(2);
  }

  const prof = await invokeApi('GET', '/auth/profile', { token });
  if (prof.ok && prof.data?.user?.name === testName) addResult('Login', 'GET /auth/profile', 'PASS', 'profile ok');
  else addResult('Login', 'GET /auth/profile', 'FAIL', errMsg(prof, 'profile mismatch'));

  const find = await invokeApi('POST', '/auth/find-id', { body: { name: testName, phone: testPhone } });
  if (find.ok && find.data?.userId) addResult('Login', 'POST /auth/find-id', 'PASS', find.data.userId);
  else addResult('Login', 'POST /auth/find-id', 'FAIL', errMsg(find, 'no userId'));

  const gs = await invokeApi('GET', '/settings', { token });
  if (gs.ok && gs.data?.settings?.fontSize != null) {
    addResult('Setting', 'GET /settings', 'PASS', `fontSize=${gs.data.settings.fontSize}`);
  } else addResult('Setting', 'GET /settings', 'FAIL', errMsg(gs, 'missing settings'));

  const putSettings = await invokeApi('PUT', '/settings', {
    token,
    body: { fontSize: 16, themeMode: 1, language: 'ko', refreshInterval: 5 },
  });
  const gs2 = await invokeApi('GET', '/settings', { token });
  if (putSettings.ok && gs2.data?.settings?.fontSize === 16) {
    addResult('Setting', 'PUT /settings', 'PASS', 'fontSize=16 persisted');
  } else addResult('Setting', 'PUT /settings', 'FAIL', errMsg(putSettings, 'save mismatch'));

  const updProf = await invokeApi('PUT', '/auth/profile', {
    token,
    body: { name: 'Integration Updated', phone: testPhone, email: testEmail },
  });
  if (updProf.ok) addResult('Setting', 'PUT /auth/profile', 'PASS', 'profile updated');
  else addResult('Setting', 'PUT /auth/profile', 'FAIL', errMsg(updProf, 'failed'));

  const inq = await invokeApi('POST', '/inquiries', {
    token,
    expectedStatus: 201,
    body: {
      category: '\uAE30\uD0C0',
      title: 'Verify inquiry',
      content: 'Integration test content',
      isPrivate: false,
      attachments: ['test.txt'],
      authorName: testName,
      email: testEmail,
      phone: testPhone,
    },
  });
  if (inq.ok && inq.data?.inquiry?.id) {
    inquiryId = inq.data.inquiry.id;
    addResult('Inquiry', 'POST /inquiries', 'PASS', `id=${inquiryId}`);
  } else addResult('Inquiry', 'POST /inquiries', 'FAIL', errMsg(inq, 'no id'));

  const mails = await invokeApi('GET', '/management/mails', { token });
  if (mails.ok && mails.data?.mails?.length >= 1) {
    mailId = mails.data.mails[0].id;
    addResult('Management', 'GET /management/mails', 'PASS', `count=${mails.data.mails.length}`);
  } else addResult('Management', 'GET /management/mails', 'FAIL', 'empty or error');

  if (mailId) {
    const read = await invokeApi('PATCH', `/management/mails/${mailId}/read`, { token });
    if (read.ok && read.data?.mail?.isRead === true) {
      addResult('Management', 'PATCH mail read', 'PASS', mailId);
    } else addResult('Management', 'PATCH mail read', 'FAIL', 'isRead not true');
  }

  const allInq = await invokeApi('GET', '/inquiries', { token });
  let found = false;
  if (allInq.ok) {
    if (inquiryId) found = allInq.data.inquiries.some((i) => i.id === inquiryId);
    addResult('Management', 'GET /inquiries', 'PASS', `count=${allInq.data.inquiries.length} cross=${found}`);
  } else addResult('Management', 'GET /inquiries', 'FAIL', errMsg(allInq, 'error'));

  if (inquiryId) {
    const reply = await invokeApi('PUT', `/inquiries/${inquiryId}/reply`, {
      token,
      body: {
        content: 'Test reply',
        assignee: 'Tester',
        priority: '\uBCF4\uD1B5',
        internalMemo: 'memo',
        adminConfirmed: true,
      },
    });
    if (reply.ok && reply.data?.inquiry?.status === '\uC644\uB8CC') {
      addResult('Management', 'PUT inquiry reply', 'PASS', 'status=\uC644\uB8CC');
    } else addResult('Management', 'PUT inquiry reply', 'FAIL', errMsg(reply, 'status not complete'));
  }

  const def = await invokeApi('GET', '/management/defects', { token });
  if (def.ok && def.data?.records?.length >= 1) {
    addResult('Management', 'GET /management/defects', 'PASS', `count=${def.data.records.length}`);
  } else addResult('Management', 'GET /management/defects', 'FAIL', 'no records');

  const dset = await invokeApi('GET', '/management/defect-settings', { token });
  if (dset.ok) {
    addResult('Management', 'GET defect-settings', 'PASS', `threshold=${dset.data.settings.threshold}`);
  } else addResult('Management', 'GET defect-settings', 'FAIL', errMsg(dset, 'error'));

  const putDef = await invokeApi('PUT', '/management/defect-settings', { token, body: { threshold: 2.5 } });
  const dset2 = await invokeApi('GET', '/management/defect-settings', { token });
  if (putDef.ok && Number(dset2.data?.settings?.threshold) === 2.5) {
    addResult('Management', 'PUT defect-settings', 'PASS', 'threshold=2.5');
  } else addResult('Management', 'PUT defect-settings', 'FAIL', 'threshold not saved');

  const main = await invokeApi('GET', '/main/overview', { token });
  const overview = main.data?.overview;
  if (main.ok && overview?.kpi && overview?.latestLot) {
    addResult('Main', 'GET /main/overview', 'PASS', `defectRate=${overview.kpi.defectRate}`);
  } else addResult('Main', 'GET /main/overview', 'FAIL', errMsg(main, 'missing overview fields'));

  const dash = await invokeApi('GET', '/dashboard/summary?startDate=2026-05-01&endDate=2026-06-14', { token });
  if (dash.ok && dash.data?.records && dash.data?.meta?.products) {
    addResult('Dashboard', 'GET /dashboard/summary', 'PASS', `records=${dash.data.records.length}`);
  } else addResult('Dashboard', 'GET /dashboard/summary', 'FAIL', errMsg(dash, 'missing fields'));

  const dash2 = await invokeApi(
    'GET',
    `/dashboard/summary?startDate=2026-05-01&endDate=2026-06-14&product=${encodeURIComponent('\uD504\uB808\uC2A4 \uBAA8\uB4C8 A')}`,
    { token },
  );
  if (dash2.ok) addResult('Dashboard', 'GET summary filtered', 'PASS', `records=${dash2.data.records.length}`);
  else addResult('Dashboard', 'GET summary filtered', 'FAIL', errMsg(dash2, 'error'));

  addResult('Dashboard', 'STAFF/auto-send/report', 'SKIP', 'UI mock - no API');

  const issues = await invokeApi('GET', '/issues', { token });
  if (issues.ok && issues.data?.issues?.length >= 1) {
    issueId = issues.data.issues[0].id;
    addResult('Issue', 'GET /issues', 'PASS', `count=${issues.data.issues.length}`);
  } else addResult('Issue', 'GET /issues', 'FAIL', 'no issues');

  const ho = await invokeApi('GET', '/issues/handover/summary', { token });
  if (ho.ok && ho.data?.summary?.period) {
    addResult('Issue', 'GET handover/summary', 'PASS', ho.data.summary.period);
  } else addResult('Issue', 'GET handover/summary', 'FAIL', errMsg(ho, 'missing summary'));

  if (issueId) {
    const issue = issues.data.issues.find((i) => i.id === issueId);
    const upd = await invokeApi('PUT', `/issues/${issueId}`, {
      token,
      body: {
        assignee: '\uAE40\uD604\uC218',
        status: issue?.status ?? '\uC870\uCE58 \uC911',
        action: 'Verify action',
        completed: false,
      },
    });
    const det = await invokeApi('GET', `/issues/${issueId}`, { token });
    if (upd.ok && det.data?.issue?.assignee === '\uAE40\uD604\uC218') {
      addResult('Issue', 'PUT /issues/:id', 'PASS', 'assignee updated');
    } else addResult('Issue', 'PUT /issues/:id', 'FAIL', 'update not reflected');
  }

  addResult('Issue', 'handoverNotes/PDF/CSV', 'SKIP', 'UI local - no API');

  const docs = await invokeApi('GET', '/knowledge/documents', { token });
  if (docs.ok && docs.data?.documents?.length >= 1) {
    const docId = docs.data.documents[0].id;
    addResult('Knowledge', 'GET /knowledge/documents', 'PASS', `count=${docs.data.documents.length}`);
    const docDet = await invokeApi('GET', `/knowledge/documents/${docId}`, { token });
    if (docDet.ok) addResult('Knowledge', 'GET document detail', 'PASS', docId);
    else addResult('Knowledge', 'GET document detail', 'FAIL', errMsg(docDet, 'error'));
  } else addResult('Knowledge', 'GET /knowledge/documents', 'FAIL', 'no documents');

  const acts = await invokeApi('GET', '/knowledge/actions', { token });
  if (acts.ok) addResult('Knowledge', 'GET /knowledge/actions', 'PASS', `count=${acts.data.actions.length}`);
  else addResult('Knowledge', 'GET /knowledge/actions', 'FAIL', errMsg(acts, 'error'));

  const createAct = await invokeApi('POST', '/knowledge/actions', {
    token,
    expectedStatus: 201,
    body: {
      situation: 'Verify situation',
      action: 'Verify action text',
      cause: 'Test cause',
      manager: 'Tester',
      date: '2026-07-23',
    },
  });
  if (createAct.ok && createAct.data?.action?.id) {
    actionId = createAct.data.action.id;
    addResult('Knowledge', 'POST /knowledge/actions', 'PASS', actionId);
  } else addResult('Knowledge', 'POST /knowledge/actions', 'FAIL', errMsg(createAct, 'no id'));

  if (actionId) {
    const updAct = await invokeApi('PUT', `/knowledge/actions/${actionId}`, {
      token,
      body: {
        situation: 'Updated situation',
        action: 'Updated action',
        cause: 'Updated cause',
        manager: 'Tester',
        date: '2026-07-23',
      },
    });
    if (updAct.ok) addResult('Knowledge', 'PUT /knowledge/actions/:id', 'PASS', 'updated');
    else addResult('Knowledge', 'PUT /knowledge/actions/:id', 'FAIL', errMsg(updAct, 'error'));

    const delAct = await invokeApi('DELETE', `/knowledge/actions/${actionId}`, { token });
    if (delAct.ok) addResult('Knowledge', 'DELETE /knowledge/actions/:id', 'PASS', 'deleted');
    else addResult('Knowledge', 'DELETE /knowledge/actions/:id', 'FAIL', errMsg(delAct, 'error'));
  }

  const rep = await invokeApi('GET', '/knowledge/report', { token });
  if (rep.ok && rep.data?.report?.mainCause) {
    addResult('Knowledge', 'GET /knowledge/report', 'PASS', 'report ok');
  } else addResult('Knowledge', 'GET /knowledge/report', 'FAIL', errMsg(rep, 'no report'));

  const ref = await invokeApi('POST', '/knowledge/report/refresh', { token });
  if (ref.ok) addResult('Knowledge', 'POST report/refresh', 'PASS', 'refreshed');
  else addResult('Knowledge', 'POST report/refresh', 'FAIL', errMsg(ref, 'error'));

  try {
    const proxyRes = await fetch(`${proxyBase}/health`, { method: 'GET' });
    const proxyData = await proxyRes.json();
    if (proxyData?.status === 'ok') addResult('Frontend', 'proxy /api -> 3001', 'PASS', 'health via :3000');
    else addResult('Frontend', 'proxy /api -> 3001', 'FAIL', 'bad proxy response');
  } catch (error) {
    addResult('Frontend', 'proxy /api -> 3001', 'FAIL', error.message);
  }

  printSummary();
  const fail = results.filter((r) => r.status === 'FAIL').length;
  process.exit(fail > 0 ? 1 : 0);
}

function printSummary() {
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  console.log(`SUMMARY PASS=${pass} FAIL=${fail} SKIP=${skip}`);
  console.log(JSON.stringify({ summary: { pass, fail, skip }, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
