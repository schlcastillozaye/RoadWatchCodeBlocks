/**
 * RoadWatch backend API integration tests.
 *
 * Exercises the PHP API end-to-end against a running server. It is intended to
 * run against a DISPOSABLE test database, never production.
 *
 * Usage:
 *   1. Start the API against a test database, e.g.
 *        php -S 127.0.0.1:4000 -t public router.php
 *      with DATABASE_URL pointing at a scratch database.
 *   2. node tests/api_integration.mjs
 *
 * Env:
 *   RW_API_BASE   base URL of the running API (default http://127.0.0.1:4000)
 *
 * The suite creates its own uniquely-named users/reports and never touches
 * pre-existing rows.
 */

import { randomBytes } from 'node:crypto';

const BASE = (process.env.RW_API_BASE || 'http://127.0.0.1:4000').replace(/\/$/, '');
const stamp = Date.now();
const SEEDED_PASSWORDS = {
  admin: process.env.RW_SEED_ADMIN_PASSWORD || '',
  officer: process.env.RW_SEED_OFFICER_PASSWORD || '',
};
if (!SEEDED_PASSWORDS.admin || !SEEDED_PASSWORDS.officer) {
  throw new Error('Set RW_SEED_ADMIN_PASSWORD and RW_SEED_OFFICER_PASSWORD for the disposable test database.');
}
const PW = randomBytes(24).toString('hex');

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  \u2717 ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function api(method, path, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (form) {
    body = form; // FormData sets its own content-type/boundary
  } else if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const res = await fetch(BASE + path, { method, headers, body });
  let parsed = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

function pngForm(fields, fileField = 'photos') {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  fd.append(fileField, new Blob([PNG], { type: 'image/png' }), 'photo.png');
  return fd;
}

async function login(email, password) {
  const r = await api('POST', '/api/auth/login', { json: { email, password } });
  return r;
}

async function main() {
  console.log(`RoadWatch API integration tests against ${BASE}`);

  // ---------------------------------------------------------------------
  section('Health & root');
  {
    const root = await api('GET', '/');
    check('GET / returns service name', root.status === 200 && root.body?.name === 'RoadWatch API', JSON.stringify(root.body));
    const h = await api('GET', '/health');
    check('GET /health ok + database up', h.status === 200 && h.body?.database === 'up', JSON.stringify(h.body));
    check(
      'health reports storage + geocoding capability',
      typeof h.body?.storage === 'string' && typeof h.body?.geocoding === 'string',
      JSON.stringify(h.body)
    );
  }

  // ---------------------------------------------------------------------
  section('Auth: register');
  const citizenEmail = `it.citizen.${stamp}@example.com`;
  const citizen2Email = `it.citizen2.${stamp}@example.com`;
  let citizenToken, citizenId, citizen2Token, citizen2Id;

  {
    const r = await api('POST', '/api/auth/register', {
      json: { fullName: 'IT Citizen One', email: citizenEmail, password: PW },
    });
    check('register returns 201', r.status === 201, `status=${r.status} ${JSON.stringify(r.body)}`);
    check('register returns tokens + user', !!r.body?.accessToken && !!r.body?.refreshToken && r.body?.user?.role === 'CITIZEN');
    citizenToken = r.body?.accessToken;
    citizenId = r.body?.user?.id;

    const dup = await api('POST', '/api/auth/register', {
      json: { fullName: 'IT Citizen One', email: citizenEmail, password: PW },
    });
    check('duplicate email returns 409', dup.status === 409, `status=${dup.status}`);

    const badEmail = await api('POST', '/api/auth/register', {
      json: { fullName: 'Bad Email', email: 'not-an-email', password: PW },
    });
    check('invalid email returns 422', badEmail.status === 422, `status=${badEmail.status}`);

    const shortPw = await api('POST', '/api/auth/register', {
      json: { fullName: 'Short Pw', email: `it.short.${stamp}@example.com`, password: 'abc' },
    });
    check('short password returns 422', shortPw.status === 422, `status=${shortPw.status}`);

    const missing = await api('POST', '/api/auth/register', { json: { email: `it.x.${stamp}@example.com` } });
    check('missing fields return 422', missing.status === 422, `status=${missing.status}`);

    const r2 = await api('POST', '/api/auth/register', {
      json: { fullName: 'IT Citizen Two', email: citizen2Email, password: PW },
    });
    citizen2Token = r2.body?.accessToken;
    citizen2Id = r2.body?.user?.id;
    check('second citizen registered', r2.status === 201 && !!citizen2Token);
  }

  // ---------------------------------------------------------------------
  section('Auth: login / me / refresh / logout');
  let adminToken, officer1Token, officer1Id, officer2Token, officer2Id;
  {
    const admin = await login('admin@roadwatch.gov', SEEDED_PASSWORDS.admin);
    check('seed admin login 200', admin.status === 200 && admin.body?.user?.role === 'ADMIN', `status=${admin.status}`);
    adminToken = admin.body?.accessToken;

    const off1 = await login('officer1@roadwatch.gov', SEEDED_PASSWORDS.officer);
    check('seed officer1 login 200', off1.status === 200 && off1.body?.user?.role === 'MAINTENANCE_OFFICER');
    officer1Token = off1.body?.accessToken;
    officer1Id = off1.body?.user?.id;

    const off2 = await login('officer2@roadwatch.gov', SEEDED_PASSWORDS.officer);
    officer2Token = off2.body?.accessToken;
    officer2Id = off2.body?.user?.id;

    const bad = await login('admin@roadwatch.gov', 'wrong-password');
    check('wrong password returns 401', bad.status === 401, `status=${bad.status}`);

    const nonexistent = await login(`nobody.${stamp}@example.com`, PW);
    check('nonexistent user returns 401', nonexistent.status === 401, `status=${nonexistent.status}`);

    const me = await api('GET', '/api/auth/me', { token: citizenToken });
    check('GET /api/auth/me with token 200', me.status === 200 && me.body?.user?.id === citizenId, `status=${me.status}`);

    const meNoAuth = await api('GET', '/api/auth/me');
    check('GET /api/auth/me without token 401', meNoAuth.status === 401, `status=${meNoAuth.status}`);

    const meBad = await api('GET', '/api/auth/me', { token: 'garbage.token.value' });
    check('GET /api/auth/me with bad token 401', meBad.status === 401, `status=${meBad.status}`);

    // refresh rotation
    const loginAgain = await login(citizenEmail, PW);
    const rt = loginAgain.body?.refreshToken;
    const refreshed = await api('POST', '/api/auth/refresh', { json: { refreshToken: rt } });
    check('refresh returns new tokens 200', refreshed.status === 200 && !!refreshed.body?.accessToken, `status=${refreshed.status}`);
    const reuse = await api('POST', '/api/auth/refresh', { json: { refreshToken: rt } });
    check('reused refresh token rejected 401', reuse.status === 401, `status=${reuse.status}`);

    const logout = await api('POST', '/api/auth/logout', { json: { refreshToken: refreshed.body?.refreshToken } });
    check('logout returns success', logout.status === 200 && logout.body?.success === true, `status=${logout.status}`);
  }

  // ---------------------------------------------------------------------
  section('Reports: submission validation');
  let reportId, referenceNo;
  const goodReport = {
    title: 'IT pothole on Test Avenue',
    description: 'A deep pothole has opened up in the middle of the lane, hazard for motorcycles.',
    category: 'POTHOLE',
    latitude: 14.6,
    longitude: 121.0,
    addressText: 'Test Ave, Test City',
    areaLabel: 'Test City',
  };
  {
    const noPhoto = await api('POST', '/api/reports', { token: citizenToken, json: goodReport });
    check('create without photo returns 400', noPhoto.status === 400, `status=${noPhoto.status} ${JSON.stringify(noPhoto.body)}`);

    const noAuth = await api('POST', '/api/reports', { token: null, form: pngForm(goodReport) });
    check('create without auth returns 401', noAuth.status === 401, `status=${noAuth.status}`);

    const badCat = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({ ...goodReport, category: 'NOT_A_CATEGORY' }),
    });
    check('invalid category returns 422', badCat.status === 422, `status=${badCat.status}`);

    const shortTitle = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({ ...goodReport, title: 'no' }),
    });
    check('short title returns 422', shortTitle.status === 422, `status=${shortTitle.status}`);

    const badLat = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({ ...goodReport, latitude: 200 }),
    });
    check('out-of-range latitude returns 422', badLat.status === 422, `status=${badLat.status}`);

    const created = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({
        ...goodReport,
        destination: 'Road leading to San Isidro market',
        damageCause: 'Possible poor drainage after heavy rain',
        relatedCategories: JSON.stringify(['FLOODING', 'ROAD_CRACK']),
        surfaceCondition: 'UNKNOWN',
      }),
    });
    check('valid create returns 201', created.status === 201, `status=${created.status} ${JSON.stringify(created.body)}`);
    reportId = created.body?.report?.id;
    referenceNo = created.body?.report?.referenceNo;
    check('new report is PENDING_REVIEW / NOT_ASSIGNED', created.body?.report?.moderationStatus === 'PENDING_REVIEW' && created.body?.report?.repairStatus === 'NOT_ASSIGNED');
    check('reference number format RW-YYYY-NNNNNN', /^RW-\d{4}-\d{6}$/.test(referenceNo || ''), referenceNo);
    check('report has a BEFORE photo with url', created.body?.report?.photos?.length === 1 && !!created.body.report.photos[0].url);
    check(
      'optional destination and suspected cause are persisted',
      created.body?.report?.destination === 'Road leading to San Isidro market'
        && created.body?.report?.damageCause === 'Possible poor drainage after heavy rain',
      JSON.stringify({ destination: created.body?.report?.destination, damageCause: created.body?.report?.damageCause })
    );
    check(
      'related observations and unknown flood-surface condition are persisted',
      JSON.stringify(created.body?.report?.relatedCategories) === JSON.stringify(['FLOODING', 'ROAD_CRACK'])
        && created.body?.report?.surfaceCondition === 'UNKNOWN',
      JSON.stringify({ relatedCategories: created.body?.report?.relatedCategories, surfaceCondition: created.body?.report?.surfaceCondition })
    );

    const oversizedCause = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({ ...goodReport, damageCause: 'x'.repeat(501) }),
    });
    check('damage cause exceeding the optional field limit returns 422', oversizedCause.status === 422, `status=${oversizedCause.status}`);

    const badPhoto = await api('POST', '/api/reports', {
      token: citizenToken,
      form: (() => {
        const fd = new FormData();
        for (const [k, v] of Object.entries(goodReport)) fd.append(k, String(v));
        fd.append('photos', new Blob([Buffer.from('this is not an image')], { type: 'text/plain' }), 'x.txt');
        return fd;
      })(),
    });
    check('non-image upload rejected 415', badPhoto.status === 415, `status=${badPhoto.status}`);
  }

  // ---------------------------------------------------------------------
  section('Reports: issue categories (shared web/mobile rules)');
  {
    // The API validates a superset of the values the pickers offer so reports
    // created before a value was retired keep round-tripping.
    const ALL_CATEGORIES = ['POTHOLE', 'DAMAGED_PAVEMENT', 'ROAD_CRACK', 'FLOODING', 'DAMAGED_DRAINAGE', 'ROAD_OBSTRUCTION', 'OTHER'];
    for (const cat of ALL_CATEGORIES) {
      const extra = cat === 'OTHER' ? { categoryOther: 'Something not covered by the list' } : {};
      const r = await api('POST', '/api/reports', {
        token: citizenToken,
        form: pngForm({ ...goodReport, title: `IT category ${cat}`, category: cat, ...extra }),
      });
      check(`category ${cat} accepted`, r.status === 201, `status=${r.status} ${JSON.stringify(r.body)}`);
      check(`category ${cat} echoed in response`, r.body?.report?.category === cat, `got=${r.body?.report?.category}`);
      if (cat === 'POTHOLE') {
        check(
          'new optional fields default safely for legacy-style submissions',
          r.body?.report?.destination === null
            && r.body?.report?.damageCause === null
            && JSON.stringify(r.body?.report?.relatedCategories) === '[]'
            && r.body?.report?.surfaceCondition === null,
          JSON.stringify({
            destination: r.body?.report?.destination,
            damageCause: r.body?.report?.damageCause,
            relatedCategories: r.body?.report?.relatedCategories,
            surfaceCondition: r.body?.report?.surfaceCondition,
          })
        );
      }
      await api('DELETE', `/api/reports/${r.body?.report?.id}`, { token: citizenToken });
    }

    // "Other" is only meaningful with an explanation.
    const otherNoText = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({ ...goodReport, title: 'IT other without text', category: 'OTHER' }),
    });
    check('OTHER without categoryOther returns 422', otherNoText.status === 422, `status=${otherNoText.status}`);

    const otherShort = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({ ...goodReport, title: 'IT other too short', category: 'OTHER', categoryOther: 'ab' }),
    });
    check('OTHER with too-short categoryOther returns 422', otherShort.status === 422, `status=${otherShort.status}`);

    const otherOk = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({
        ...goodReport,
        title: 'IT other with text',
        category: 'OTHER',
        categoryOther: 'Overgrown hedge blocking the sidewalk',
      }),
    });
    check('OTHER with categoryOther returns 201', otherOk.status === 201, `status=${otherOk.status}`);
    check(
      'OTHER description is stored and echoed back',
      otherOk.body?.report?.categoryOther === 'Overgrown hedge blocking the sidewalk',
      `got=${JSON.stringify(otherOk.body?.report?.categoryOther)}`
    );
    await api('DELETE', `/api/reports/${otherOk.body?.report?.id}`, { token: citizenToken });

    // ...and is discarded for every other category (kept consistent, not just ignored).
    const strayText = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({ ...goodReport, title: 'IT stray other text', category: 'POTHOLE', categoryOther: 'should be ignored' }),
    });
    check(
      'categoryOther is cleared for a non-OTHER category',
      strayText.status === 201 && strayText.body?.report?.categoryOther === null,
      `status=${strayText.status} got=${JSON.stringify(strayText.body?.report?.categoryOther)}`
    );
    await api('DELETE', `/api/reports/${strayText.body?.report?.id}`, { token: citizenToken });

    const duplicateObservation = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({
        ...goodReport,
        title: 'IT duplicated main observation',
        relatedCategories: JSON.stringify(['POTHOLE']),
      }),
    });
    check('duplicate primary/related category is rejected (422)', duplicateObservation.status === 422, `status=${duplicateObservation.status}`);

    const invalidSurfaceCondition = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({
        ...goodReport,
        title: 'IT invalid surface condition',
        surfaceCondition: 'CRACKED',
      }),
    });
    check('invalid surface condition is rejected (422)', invalidSurfaceCondition.status === 422, `status=${invalidSurfaceCondition.status}`);

    const flooded = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({
        ...goodReport,
        title: 'IT flooded road with visible pothole',
        category: 'FLOODING',
        relatedCategories: JSON.stringify(['POTHOLE']),
      }),
    });
    check(
      'flooding and separately observed damage are recorded without inferring hidden damage',
      flooded.status === 201
        && flooded.body?.report?.category === 'FLOODING'
        && flooded.body?.report?.relatedCategories?.[0] === 'POTHOLE'
        && flooded.body?.report?.surfaceCondition === 'UNKNOWN',
      `status=${flooded.status} ${JSON.stringify(flooded.body?.report)}`
    );
    await api('DELETE', `/api/reports/${flooded.body?.report?.id}`, { token: citizenToken });
  }

  // ---------------------------------------------------------------------
  section('Reports: visibility & cross-user access');
  {
    const mine = await api('GET', '/api/reports/mine', { token: citizenToken });
    check('GET /api/reports/mine lists own report', mine.status === 200 && mine.body?.items?.some((r) => r.id === reportId), `status=${mine.status}`);

    const ownerView = await api('GET', `/api/reports/${reportId}`, { token: citizenToken });
    check('owner can view own report', ownerView.status === 200 && ownerView.body?.report?.id === reportId, `status=${ownerView.status}`);

    const otherCitizen = await api('GET', `/api/reports/${reportId}`, { token: citizen2Token });
    check('other citizen cannot view pending report (403)', otherCitizen.status === 403, `status=${otherCitizen.status}`);

    const anon = await api('GET', `/api/reports/${reportId}`);
    check('anonymous cannot view pending report (403)', anon.status === 403, `status=${anon.status}`);

    const notFound = await api('GET', '/api/reports/does-not-exist', { token: citizenToken });
    check('nonexistent report returns 404', notFound.status === 404, `status=${notFound.status}`);

    const otherDelete = await api('DELETE', `/api/reports/${reportId}`, { token: citizen2Token });
    check('other citizen cannot delete report (403)', otherDelete.status === 403, `status=${otherDelete.status}`);

    const citizenStaffList = await api('GET', '/api/reports', { token: citizenToken });
    check('citizen cannot list all reports (403)', citizenStaffList.status === 403, `status=${citizenStaffList.status}`);

    const officerHistory = await api('GET', `/api/reports/${reportId}/history`, { token: officer1Token });
    check('unassigned officer cannot read history (403)', officerHistory.status === 403, `status=${officerHistory.status}`);

    const ownerHistory = await api('GET', `/api/reports/${reportId}/history`, { token: citizenToken });
    check('owner sees CREATION history', ownerHistory.status === 200 && ownerHistory.body?.history?.[0]?.type === 'CREATION', `status=${ownerHistory.status}`);
  }

  // ---------------------------------------------------------------------
  section('Moderation (admin only)');
  {
    const asOfficer = await api('PATCH', `/api/reports/${reportId}/moderation`, {
      token: officer1Token,
      json: { decision: 'APPROVE' },
    });
    check('officer cannot moderate (403)', asOfficer.status === 403, `status=${asOfficer.status}`);

    const rejectNoReason = await api('PATCH', `/api/reports/${reportId}/moderation`, {
      token: adminToken,
      json: { decision: 'REJECT' },
    });
    check('reject without reason 422', rejectNoReason.status === 422, `status=${rejectNoReason.status}`);

    const badDecision = await api('PATCH', `/api/reports/${reportId}/moderation`, {
      token: adminToken,
      json: { decision: 'MAYBE' },
    });
    check('invalid decision 422', badDecision.status === 422, `status=${badDecision.status}`);

    const pendingQueue = await api('GET', '/api/reports?moderationStatus=PENDING_REVIEW', { token: adminToken });
    check(
      'submitted report appears in admin pending queue',
      pendingQueue.status === 200 && pendingQueue.body?.items?.some((report) => report.id === reportId),
      `status=${pendingQueue.status}`
    );
    const pendingDetail = await api('GET', `/api/reports/${reportId}`, { token: adminToken });
    check(
      'admin can review pending description, location, photo and submission date',
      pendingDetail.status === 200 &&
        pendingDetail.body?.report?.description === goodReport.description &&
        pendingDetail.body?.report?.latitude === Number(goodReport.latitude) &&
        pendingDetail.body?.report?.photos?.length === 1 &&
        !!pendingDetail.body?.report?.createdAt
    );

    const approve = await api('PATCH', `/api/reports/${reportId}/moderation`, {
      token: adminToken,
      json: { decision: 'APPROVE' },
    });
    check('admin approve 200 -> APPROVED', approve.status === 200 && approve.body?.report?.moderationStatus === 'APPROVED', `status=${approve.status}`);

    const again = await api('PATCH', `/api/reports/${reportId}/moderation`, {
      token: adminToken,
      json: { decision: 'APPROVE' },
    });
    check('double moderation 409', again.status === 409, `status=${again.status}`);

    const rejected = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({ ...goodReport, title: 'IT rejected issue report' }),
    });
    const rejectedId = rejected.body?.report?.id;
    const rejection = await api('PATCH', `/api/reports/${rejectedId}/moderation`, {
      token: adminToken,
      json: { decision: 'REJECT', reason: 'This report is a duplicate submission.' },
    });
    check(
      'admin rejection persists reason and REJECTED status',
      rejection.status === 200 &&
        rejection.body?.report?.moderationStatus === 'REJECTED' &&
        rejection.body?.report?.rejectionReason === 'This report is a duplicate submission.'
    );
    const rejectedPublic = await api('GET', `/api/map/reports/${rejectedId}`);
    check('rejected report is not visible on the public map (404)', rejectedPublic.status === 404);
    const rejectedAssignment = await api('POST', `/api/reports/${rejectedId}/assign`, {
      token: adminToken,
      json: { officerId: officer1Id },
    });
    check('rejected report cannot enter the maintenance queue (409)', rejectedAssignment.status === 409);
  }

  // ---------------------------------------------------------------------
  section('Public map');
  {
    const list = await api('GET', '/api/map/reports');
    check('public map list 200', list.status === 200 && Array.isArray(list.body?.items), `status=${list.status}`);
    check('public map only returns APPROVED', (list.body?.items || []).every((r) => r.moderationStatus === 'APPROVED'));
    check('public map includes newly approved report', (list.body?.items || []).some((r) => r.id === reportId));

    check('public map items expose the category', (list.body?.items || []).every((r) => typeof r.category === 'string' && r.category !== ''));

    const detail = await api('GET', `/api/map/reports/${reportId}`);
    check('map detail for approved 200', detail.status === 200 && detail.body?.report?.id === reportId, `status=${detail.status}`);
    check('map detail exposes the category', detail.body?.report?.category === 'POTHOLE', `got=${detail.body?.report?.category}`);
    check('map detail exposes categoryOther (null when unused)', detail.body?.report?.categoryOther === null, `got=${JSON.stringify(detail.body?.report?.categoryOther)}`);

    // Regression: a signed-in citizen must still be able to open an approved
    // map pin that belongs to someone else (previously returned 403).
    const signedIn = await api('GET', `/api/map/reports/${reportId}`, { token: citizen2Token });
    check('map detail for approved is visible to a signed-in citizen 200', signedIn.status === 200 && signedIn.body?.report?.id === reportId, `status=${signedIn.status}`);
    const signedInOwner = await api('GET', `/api/map/reports/${reportId}`, { token: citizenToken });
    check('map detail for approved is visible to its owner 200', signedInOwner.status === 200, `status=${signedInOwner.status}`);

    // Regression: the general report endpoint must not 403 on someone else's
    // approved report (public data) for a signed-in citizen.
    const signedInShow = await api('GET', `/api/reports/${reportId}`, { token: citizen2Token });
    check('GET /api/reports/:id shows another citizen\'s approved report 200', signedInShow.status === 200 && signedInShow.body?.report?.id === reportId, `status=${signedInShow.status}`);

    const signedInHistory = await api('GET', `/api/reports/${reportId}/history`, { token: citizen2Token });
    check('GET /api/reports/:id/history works for another citizen\'s approved report 200', signedInHistory.status === 200 && Array.isArray(signedInHistory.body?.history), `status=${signedInHistory.status}`);

    // A pending report must be invisible on the public map.
    const pending = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({ ...goodReport, title: 'IT pending hidden report' }),
    });
    const pendingId = pending.body?.report?.id;
    const hidden = await api('GET', `/api/map/reports/${pendingId}`);
    check('map detail for pending returns 404', hidden.status === 404, `status=${hidden.status}`);
    const hiddenAuth = await api('GET', `/api/map/reports/${pendingId}`, { token: citizen2Token });
    check('map detail for another citizen\'s pending stays forbidden (403)', hiddenAuth.status === 403, `status=${hiddenAuth.status}`);
    await api('DELETE', `/api/reports/${pendingId}`, { token: citizenToken });
  }

  // ---------------------------------------------------------------------
  section('Files (authorisation-gated)');
  {
    const approved = await api('GET', `/api/reports/${reportId}`, { token: citizenToken });
    const url = approved.body?.report?.photos?.[0]?.url;
    const rel = url ? new URL(url).pathname : '';
    const pub = await fetch(BASE + rel);
    check('approved photo is publicly fetchable', pub.status === 200, `status=${pub.status}`);
    const pubType = pub.headers.get('content-type') || '';
    const pubCache = pub.headers.get('cache-control') || '';
    const pubBytes = Buffer.from(await pub.arrayBuffer());
    check(
      'approved photo is served as an image with byte-identical content',
      pubType.startsWith('image/') && pubBytes.equals(PNG),
      `type=${pubType} bytes=${pubBytes.length} (uploaded ${PNG.length})`
    );
    check('approved photo is publicly cacheable', pubCache.includes('public'), `cache-control=${pubCache}`);

    // Pending file must require auth.
    const pending = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({ ...goodReport, title: 'IT private file report' }),
    });
    const pUrl = pending.body?.report?.photos?.[0]?.url;
    const pRel = pUrl ? new URL(pUrl).pathname : '';
    const pAnon = await fetch(BASE + pRel);
    check('pending photo requires auth (401)', pAnon.status === 401, `status=${pAnon.status}`);
    const pOwner = await fetch(BASE + pRel, { headers: { Authorization: `Bearer ${citizenToken}` } });
    check('pending photo visible to owner', pOwner.status === 200, `status=${pOwner.status}`);
    check(
      'private photo is not publicly cacheable',
      (pOwner.headers.get('cache-control') || '').includes('private'),
      `cache-control=${pOwner.headers.get('cache-control')}`
    );
    const pOther = await fetch(BASE + pRel, { headers: { Authorization: `Bearer ${citizen2Token}` } });
    check('pending photo hidden from another citizen (401)', pOther.status === 401, `status=${pOther.status}`);
    const pAdmin = await fetch(BASE + pRel, { headers: { Authorization: `Bearer ${adminToken}` } });
    check('pending photo visible to an admin (200)', pAdmin.status === 200, `status=${pAdmin.status}`);
    const pOfficer = await fetch(BASE + pRel, { headers: { Authorization: `Bearer ${officer1Token}` } });
    check('pending photo visible to a maintenance officer (200)', pOfficer.status === 200, `status=${pOfficer.status}`);
    await api('DELETE', `/api/reports/${pending.body?.report?.id}`, { token: citizenToken });

    // Upload size. MAX_UPLOAD_BYTES is enforced by the application, so the check
    // is asserted when the runner configures a low limit (RW_MAX_UPLOAD_MB) —
    // see the "Configured upload limit" note in docs/deployment-checklist.md.
    const maxMB = Number(process.env.RW_MAX_UPLOAD_MB || 0);
    if (maxMB > 0) {
      const oversized = Buffer.alloc(Math.ceil(maxMB * 1024 * 1024) + 64 * 1024, 7);
      const fd = new FormData();
      for (const [k, v] of Object.entries({ ...goodReport, title: 'IT oversized upload' })) fd.append(k, String(v));
      fd.append('photos', new Blob([oversized], { type: 'image/png' }), 'oversized.png');
      const tooBig = await api('POST', '/api/reports', { token: citizenToken, form: fd });
      check(
        `photo larger than the configured ${maxMB} MB limit is rejected with 413`,
        tooBig.status === 413 && /too large/i.test(tooBig.body?.error?.message || ''),
        `status=${tooBig.status} ${JSON.stringify(tooBig.body)}`
      );
    } else {
      console.log('  (upload-size check skipped: set RW_MAX_UPLOAD_MB + MAX_UPLOAD_BYTES to exercise it)');
    }
  }

  // ---------------------------------------------------------------------
  section('Assignment (admin only)');
  {
    const byOfficer = await api('POST', `/api/reports/${reportId}/assign`, {
      token: officer1Token,
      json: { officerId: officer1Id },
    });
    check('officer cannot assign (403)', byOfficer.status === 403, `status=${byOfficer.status}`);

    const toCitizen = await api('POST', `/api/reports/${reportId}/assign`, {
      token: adminToken,
      json: { officerId: citizen2Id },
    });
    check('assign to non-officer 400', toCitizen.status === 400, `status=${toCitizen.status}`);

    const badOfficer = await api('POST', `/api/reports/${reportId}/assign`, {
      token: adminToken,
      json: { officerId: 'no-such-user' },
    });
    check('assign to unknown user 400', badOfficer.status === 400, `status=${badOfficer.status}`);

    const ok = await api('POST', `/api/reports/${reportId}/assign`, {
      token: adminToken,
      json: { officerId: officer1Id, note: 'Please inspect and document the damaged edge.', priority: 'HIGH' },
    });
    check('assign to officer 200 -> AWAITING_MAINTENANCE', ok.status === 200 && ok.body?.report?.repairStatus === 'AWAITING_MAINTENANCE', `status=${ok.status}`);
    check('assignment sets officer + priority', ok.body?.report?.assignedOfficer?.id === officer1Id && ok.body?.report?.priority === 'HIGH');

    const officerAssignmentHistory = await api('GET', `/api/reports/${reportId}/history`, { token: officer1Token });
    const citizenAssignmentHistory = await api('GET', `/api/reports/${reportId}/history`, { token: citizenToken });
    check('assigned officer can retrieve administrator assignment instructions', officerAssignmentHistory.status === 200 &&
      officerAssignmentHistory.body?.history?.some((item) => item.type === 'ASSIGNMENT' &&
        item.note?.includes('Please inspect and document the damaged edge.')));
    check('citizen report history does not disclose administrator assignment instructions', citizenAssignmentHistory.status === 200 &&
      !citizenAssignmentHistory.body?.history?.some((item) => item.note?.includes('Please inspect and document the damaged edge.')));

    const notifications = await api('GET', '/api/maintenance/notifications', { token: officer1Token });
    const assignedNotification = notifications.body?.items?.find((item) => item.reportId === reportId);
    check(
      'assignment creates one persisted notification with report, category, location and status',
      notifications.status === 200 &&
        assignedNotification?.title === 'New road issue assigned' &&
        assignedNotification?.category === 'POTHOLE' &&
        !!assignedNotification?.location &&
        assignedNotification?.repairStatus === 'AWAITING_MAINTENANCE' &&
        !!assignedNotification?.createdAt &&
        notifications.body?.unreadCount > 0
    );
    const citizenNotifications = await api('GET', '/api/notifications', { token: citizenToken });
    check(
      'citizens can read their own notification list without seeing officer assignments',
      citizenNotifications.status === 200 &&
        !citizenNotifications.body?.items?.some((item) => item.reportId === reportId)
    );
    const privateRead = await api('PATCH', `/api/maintenance/notifications/${assignedNotification?.id}/read`, {
      token: officer2Token,
    });
    check('another officer cannot read or modify a private notification (404)', privateRead.status === 404);

    const retryAssignment = await api('POST', `/api/reports/${reportId}/assign`, {
      token: adminToken,
      json: { officerId: officer1Id, note: 'Retry the same assignment' },
    });
    const afterRetryNotifications = await api('GET', '/api/maintenance/notifications', { token: officer1Token });
    check(
      'retrying the same assignment does not create duplicate notifications',
      retryAssignment.status === 200 &&
        afterRetryNotifications.body?.items?.filter((item) => item.reportId === reportId).length === 1
    );
    const markRead = await api('PATCH', `/api/maintenance/notifications/${assignedNotification?.id}/read`, {
      token: officer1Token,
    });
    check(
      'officer can mark notification read and unread count decreases',
      markRead.status === 200 &&
        markRead.body?.items?.some((item) => item.id === assignedNotification?.id && item.isRead) &&
        markRead.body?.unreadCount < notifications.body?.unreadCount
    );

    const assignedList = await api('GET', '/api/maintenance/assignments', { token: officer1Token });
    check('officer sees the assignment', assignedList.status === 200 && assignedList.body?.items?.some((r) => r.id === reportId), `status=${assignedList.status}`);

    const citizenAssignments = await api('GET', '/api/maintenance/assignments', { token: citizenToken });
    check('citizen cannot list assignments (403)', citizenAssignments.status === 403, `status=${citizenAssignments.status}`);

    const summary = await api('GET', '/api/maintenance/summary', { token: officer1Token });
    check('officer summary 200', summary.status === 200 && typeof summary.body?.awaiting === 'number', `status=${summary.status}`);
  }

  // ---------------------------------------------------------------------
  section('Repair workflow');
  {
    const unauthenticatedUpdate = await api('PATCH', `/api/reports/${reportId}/repair`, {
      json: { repairStatus: 'IN_PROGRESS' },
    });
    check('unauthenticated user cannot update repair (401)', unauthenticatedUpdate.status === 401, `status=${unauthenticatedUpdate.status}`);

    const unauthenticatedAfterPhoto = await api('POST', `/api/reports/${reportId}/photos`, {
      form: pngForm({ kind: 'AFTER' }, 'afterPhotos'),
    });
    check('unauthenticated user cannot upload repair evidence (401)', unauthenticatedAfterPhoto.status === 401, `status=${unauthenticatedAfterPhoto.status}`);

    const adminMonitor = await api('GET', `/api/reports/${reportId}`, { token: adminToken });
    check(
      'admin can monitor an assigned report without changing its status',
      adminMonitor.status === 200 && adminMonitor.body?.report?.repairStatus === 'AWAITING_MAINTENANCE',
      `status=${adminMonitor.status}`
    );

    const adminStart = await api('PATCH', `/api/reports/${reportId}/repair`, {
      token: adminToken,
      json: { repairStatus: 'IN_PROGRESS', note: 'Admin must monitor, not perform repair work.' },
    });
    check('admin cannot start or update an assigned repair (403)', adminStart.status === 403, `status=${adminStart.status}`);
    const stillAwaiting = await api('GET', `/api/reports/${reportId}`, { token: adminToken });
    check('unauthorized admin update leaves repair awaiting maintenance', stillAwaiting.body?.report?.repairStatus === 'AWAITING_MAINTENANCE');

    const otherOfficer = await api('PATCH', `/api/reports/${reportId}/repair`, {
      token: officer2Token,
      json: { repairStatus: 'IN_PROGRESS' },
    });
    check('unassigned officer cannot update repair (403)', otherOfficer.status === 403, `status=${otherOfficer.status}`);

    const otherOfficerAfterPhoto = await api('POST', `/api/reports/${reportId}/photos`, {
      token: officer2Token,
      form: pngForm({ kind: 'AFTER' }, 'afterPhotos'),
    });
    check('unassigned officer cannot upload repair evidence (403)', otherOfficerAfterPhoto.status === 403, `status=${otherOfficerAfterPhoto.status}`);

    const citizen = await api('PATCH', `/api/reports/${reportId}/repair`, {
      token: citizenToken,
      json: { repairStatus: 'IN_PROGRESS' },
    });
    check('citizen cannot update repair (403)', citizen.status === 403, `status=${citizen.status}`);

    const citizenAfterPhoto = await api('POST', `/api/reports/${reportId}/photos`, {
      token: citizenToken,
      form: pngForm({ kind: 'AFTER' }, 'afterPhotos'),
    });
    check('citizen cannot upload repair evidence (403)', citizenAfterPhoto.status === 403, `status=${citizenAfterPhoto.status}`);

    const skipToComplete = await api('PATCH', `/api/reports/${reportId}/repair`, {
      token: officer1Token,
      json: { repairStatus: 'AWAITING_VERIFICATION', completionNotes: 'Attempted to skip the required in-progress stage.' },
    });
    check('server rejects skipped repair transitions (409)', skipToComplete.status === 409, `status=${skipToComplete.status}`);

    const inProgress = await api('PATCH', `/api/reports/${reportId}/repair`, {
      token: officer1Token,
      json: { repairStatus: 'IN_PROGRESS', note: 'Crew dispatched' },
    });
    check('assigned officer sets IN_PROGRESS 200', inProgress.status === 200 && inProgress.body?.report?.repairStatus === 'IN_PROGRESS', `status=${inProgress.status}`);

    const adminComplete = await api('PATCH', `/api/reports/${reportId}/repair`, {
      token: adminToken,
      json: { repairStatus: 'COMPLETED', completionNotes: 'Admin override without performing the repair.', overrideCompletion: true },
    });
    check('admin cannot complete an officer repair or override evidence (403)', adminComplete.status === 403, `status=${adminComplete.status}`);
    const stillInProgress = await api('GET', `/api/reports/${reportId}`, { token: adminToken });
    check('unauthorized admin completion leaves report in progress', stillInProgress.body?.report?.repairStatus === 'IN_PROGRESS');

    const adminAfterPhoto = await api('POST', `/api/reports/${reportId}/photos`, {
      token: adminToken,
      form: pngForm({ kind: 'AFTER' }, 'afterPhotos'),
    });
    check('admin cannot submit a repair completion photo (403)', adminAfterPhoto.status === 403, `status=${adminAfterPhoto.status}`);

    const completeNoNotes = await api('PATCH', `/api/reports/${reportId}/repair`, {
      token: officer1Token,
      json: { repairStatus: 'AWAITING_VERIFICATION' },
    });
    check('submit without notes 422', completeNoNotes.status === 422, `status=${completeNoNotes.status}`);

    const completeNoPhoto = await api('PATCH', `/api/reports/${reportId}/repair`, {
      token: officer1Token,
      json: { repairStatus: 'AWAITING_VERIFICATION', completionNotes: 'Filled and levelled the pothole completely.' },
    });
    check('submit without after photo 422 (officer)', completeNoPhoto.status === 422, `status=${completeNoPhoto.status}`);

    const evidenceNoNotes = await api('POST', `/api/reports/${reportId}/repair-evidence`, {
      token: officer1Token,
      form: pngForm({}, 'afterPhotos'),
    });
    check('atomic evidence submission requires completion notes', evidenceNoNotes.status === 422, `status=${evidenceNoNotes.status}`);

    const evidenceNoPhotoForm = new FormData();
    evidenceNoPhotoForm.append('completionNotes', 'Filled and levelled the pothole completely.');
    const evidenceNoPhoto = await api('POST', `/api/reports/${reportId}/repair-evidence`, {
      token: officer1Token,
      form: evidenceNoPhotoForm,
    });
    check('atomic evidence submission requires a new after photo', evidenceNoPhoto.status === 422, `status=${evidenceNoPhoto.status}`);
    const otherOfficerEvidence = await api('POST', `/api/reports/${reportId}/repair-evidence`, {
      token: officer2Token,
      form: pngForm({ completionNotes: 'Unauthorized officer evidence attempt.' }, 'afterPhotos'),
    });
    check('unassigned officer cannot submit atomic repair evidence', otherOfficerEvidence.status === 403, `status=${otherOfficerEvidence.status}`);
    const inProgressAfterRejectedEvidence = await api('GET', `/api/reports/${reportId}`, { token: officer1Token });
    check(
      'invalid and unauthorized evidence attempts do not change report status',
      inProgressAfterRejectedEvidence.status === 200 && inProgressAfterRejectedEvidence.body?.report?.repairStatus === 'IN_PROGRESS',
      `status=${inProgressAfterRejectedEvidence.status}`
    );

    const submitted = await api('POST', `/api/reports/${reportId}/repair-evidence`, {
      token: officer1Token,
      form: pngForm({ completionNotes: 'Filled and levelled the pothole completely.' }, 'afterPhotos'),
    });
    check('officer submits notes + after photo atomically for verification', submitted.status === 200 && submitted.body?.report?.repairStatus === 'AWAITING_VERIFICATION', `status=${submitted.status}`);
    check('atomic evidence response includes persisted after photo', submitted.body?.report?.photos?.some((photo) => photo.kind === 'AFTER'));
    check('atomic evidence response returns the saved completion notes', submitted.body?.report?.completionNotes === 'Filled and levelled the pothole completely.');
    check('officer submission does not mark verified completion', !submitted.body?.report?.completedAt);

    const duplicateSubmission = await api('POST', `/api/reports/${reportId}/repair-evidence`, {
      token: officer1Token,
      form: pngForm({ completionNotes: 'Duplicate repair submission attempt.' }, 'afterPhotos'),
    });
    check('duplicate evidence submission cannot transition an already pending report', duplicateSubmission.status === 409, `status=${duplicateSubmission.status}`);

    const adminNotifications = await api('GET', '/api/notifications', { token: adminToken });
    check(
      'admin receives evidence-submission notification with five-minute expiry',
      adminNotifications.status === 200 &&
        adminNotifications.body?.items?.some((item) =>
          item.reportId === reportId &&
          item.repairStatus === 'AWAITING_VERIFICATION' &&
          Date.parse(item.expiresAt) > Date.now() &&
          Date.parse(item.expiresAt) <= Date.now() + 5 * 60 * 1000),
      `status=${adminNotifications.status}`
    );

    const earlyVerify = await api('PATCH', `/api/reports/${reportId}/verification`, {
      token: officer1Token,
      json: { decision: 'VERIFY' },
    });
    check('maintenance officer cannot verify completion (403)', earlyVerify.status === 403, `status=${earlyVerify.status}`);

    const returnWithoutReason = await api('PATCH', `/api/reports/${reportId}/verification`, {
      token: adminToken,
      json: { decision: 'RETURN', reason: 'no' },
    });
    check('admin return requires a meaningful reason (422)', returnWithoutReason.status === 422, `status=${returnWithoutReason.status}`);

    const returned = await api('PATCH', `/api/reports/${reportId}/verification`, {
      token: adminToken,
      json: { decision: 'RETURN', reason: 'The repair edge is still uneven; please finish leveling it.' },
    });
    check('admin can return repair for more work', returned.status === 200 && returned.body?.report?.repairStatus === 'RETURNED_FOR_WORK', `status=${returned.status}`);

    const officerReturnHistory = await api('GET', `/api/reports/${reportId}/history`, { token: officer1Token });
    const citizenReturnHistory = await api('GET', `/api/reports/${reportId}/history`, { token: citizenToken });
    check('assigned officer can retrieve administrator return feedback after reopening report', officerReturnHistory.status === 200 &&
      officerReturnHistory.body?.history?.some((item) => item.toValue === 'RETURNED_FOR_WORK' &&
        item.note?.includes('The repair edge is still uneven; please finish leveling it.')));
    check('citizen history does not disclose private repair return feedback', citizenReturnHistory.status === 200 &&
      !citizenReturnHistory.body?.history?.some((item) => item.note?.includes('The repair edge is still uneven; please finish leveling it.')));

    const citizenBeforeVerify = await api('GET', '/api/notifications', { token: citizenToken });
    check('citizen is not told repair is verified before admin approval', !citizenBeforeVerify.body?.items?.some((item) => item.reportId === reportId));

    const resume = await api('PATCH', `/api/reports/${reportId}/repair`, {
      token: officer1Token,
      json: { repairStatus: 'IN_PROGRESS', note: 'Resumed leveling after admin feedback.' },
    });
    check('assigned officer resumes returned repair', resume.status === 200 && resume.body?.report?.repairStatus === 'IN_PROGRESS', `status=${resume.status}`);

    const resubmitted = await api('POST', `/api/reports/${reportId}/repair-evidence`, {
      token: officer1Token,
      form: pngForm({ completionNotes: 'Releveled the edge and compacted the surface.' }, 'afterPhotos'),
    });
    check('officer resubmits notes and new after-photo through the atomic endpoint', resubmitted.status === 200 &&
      resubmitted.body?.report?.repairStatus === 'AWAITING_VERIFICATION' &&
      resubmitted.body?.report?.completionNotes === 'Releveled the edge and compacted the surface.' &&
      resubmitted.body?.report?.photos?.filter((photo) => photo.kind === 'AFTER').length >= 2,
      `status=${resubmitted.status}`);

    const verified = await api('PATCH', `/api/reports/${reportId}/verification`, {
      token: adminToken,
      json: { decision: 'VERIFY' },
    });
    check('admin verifies submitted repair', verified.status === 200 && verified.body?.report?.repairStatus === 'VERIFIED_COMPLETED', `status=${verified.status}`);
    check('verified completion timestamp set only on admin verification', !!verified.body?.report?.completedAt && verified.body?.report?.completionOverride === false);

    const citizenVerified = await api('GET', '/api/notifications', { token: citizenToken });
    check('citizen receives notification only after repair verification', citizenVerified.status === 200 &&
      citizenVerified.body?.items?.some((item) => item.reportId === reportId && item.repairStatus === 'VERIFIED_COMPLETED'));

    const history = await api('GET', `/api/reports/${reportId}/history`, { token: adminToken });
    check('admin can see officer evidence notes and admin decision history', history.status === 200 &&
      history.body?.history?.some((item) => item.actorRole === 'MAINTENANCE_OFFICER' && item.note?.includes('Releveled the edge')) &&
      history.body?.history?.some((item) => item.actorRole === 'ADMIN' && item.note?.includes('verified')));
  }

  // ---------------------------------------------------------------------
  section('Statistics & audit logs (admin only)');
  {
    const stats = await api('GET', '/api/reports/stats', { token: adminToken });
    check('admin GET /api/reports/stats 200', stats.status === 200 && typeof stats.body?.totals?.total === 'number', `status=${stats.status}`);

    const statsCitizen = await api('GET', '/api/reports/stats', { token: citizenToken });
    check('citizen stats 403', statsCitizen.status === 403, `status=${statsCitizen.status}`);

    const summary = await api('GET', '/api/analytics/summary', { token: adminToken });
    check('admin analytics summary 200', summary.status === 200 && !!summary.body?.totals, `status=${summary.status}`);

    const logs = await api('GET', '/api/analytics/audit-logs?limit=5', { token: adminToken });
    check('admin audit logs 200 (+limit)', logs.status === 200 && Array.isArray(logs.body?.logs) && logs.body.logs.length <= 5, `status=${logs.status}`);

    const logsCitizen = await api('GET', '/api/analytics/audit-logs', { token: citizenToken });
    check('citizen audit logs 403', logsCitizen.status === 403, `status=${logsCitizen.status}`);

    const logsBadLimit = await api('GET', '/api/analytics/audit-logs?limit=abc', { token: adminToken });
    check('audit logs bad limit handled (200 default)', logsBadLimit.status === 200, `status=${logsBadLimit.status}`);
  }

  // ---------------------------------------------------------------------
  section('Users administration');
  {
    const listCitizen = await api('GET', '/api/users', { token: citizenToken });
    check('citizen cannot list users 403', listCitizen.status === 403, `status=${listCitizen.status}`);

    const list = await api('GET', '/api/users?role=MAINTENANCE_OFFICER', { token: adminToken });
    check('admin lists officers 200', list.status === 200 && Array.isArray(list.body?.items), `status=${list.status}`);

    const officers = await api('GET', '/api/users/officers', { token: adminToken });
    check('admin lists officer picker 200', officers.status === 200 && Array.isArray(officers.body?.officers), `status=${officers.status}`);

    const admins = await api('GET', '/api/users?role=ADMIN', { token: adminToken });
    check('user DTOs do not expose password or token fields', admins.status === 200 &&
      admins.body?.items?.every((account) => !('passwordHash' in account) && !('password' in account) && !('accessToken' in account)));
    for (const adminAccount of admins.body?.items ?? []) {
      const protectedUpdate = await api('PATCH', `/api/users/${adminAccount.id}`, {
        token: adminToken,
        json: { fullName: 'Should not change', status: 'SUSPENDED' },
      });
      check('admin account cannot be edited or deactivated through user management', protectedUpdate.status === 403);
      const protectedReset = await api('POST', `/api/users/${adminAccount.id}/reset-password`, {
        token: adminToken,
        json: { newPassword: 'ResetPassw0rd!' },
      });
      check('admin password cannot be reset through user management', protectedReset.status === 403);
    }

    const createAdmin = await api('POST', '/api/users', {
      token: adminToken,
      json: { fullName: 'Another Admin', email: `admin.test.${stamp}@example.com`, password: PW, role: 'ADMIN' },
    });
    check('ordinary admin user creation cannot create administrator role', createAdmin.status === 422, `status=${createAdmin.status}`);

    const email = `it.officer.${stamp}@example.com`;
    const created = await api('POST', '/api/users', {
      token: adminToken,
      json: { fullName: 'IT Officer', email, password: PW, role: 'MAINTENANCE_OFFICER' },
    });
    check('admin creates officer 201', created.status === 201 && created.body?.user?.role === 'MAINTENANCE_OFFICER', `status=${created.status}`);
    const newOfficerId = created.body?.user?.id;

    const dup = await api('POST', '/api/users', {
      token: adminToken,
      json: { fullName: 'IT Officer', email, password: PW, role: 'MAINTENANCE_OFFICER' },
    });
    check('duplicate officer email 409', dup.status === 409, `status=${dup.status}`);

    const upd = await api('PATCH', `/api/users/${newOfficerId}`, { token: adminToken, json: { fullName: 'IT Officer Renamed' } });
    check('admin updates user 200', upd.status === 200 && upd.body?.user?.fullName === 'IT Officer Renamed', `status=${upd.status}`);

    const selfSuspend = await api('PATCH', `/api/users/${citizenId}`, { token: adminToken, json: { status: 'SUSPENDED' } });
    check('admin can suspend a user 200', selfSuspend.status === 200 && selfSuspend.body?.user?.status === 'SUSPENDED', `status=${selfSuspend.status}`);

    const suspendedAccess = await api('GET', '/api/users/me', { token: citizenToken });
    check('suspension immediately invalidates existing access tokens', suspendedAccess.status === 403, `status=${suspendedAccess.status}`);
    const suspendedLogin = await login(citizenEmail, PW);
    check('suspended user cannot log in 403', suspendedLogin.status === 403, `status=${suspendedLogin.status}`);
    await api('PATCH', `/api/users/${citizenId}`, { token: adminToken, json: { status: 'ACTIVE' } });

    // self-service profile
    const meUpdate = await api('PATCH', '/api/users/me', {
      token: citizen2Token,
      json: { fullName: 'IT Citizen Two Updated', phone: '+63 912 345 6789', role: 'ADMIN', status: 'SUSPENDED' },
    });
    check('user updates only own profile fields', meUpdate.status === 200 &&
      meUpdate.body?.user?.fullName === 'IT Citizen Two Updated' &&
      meUpdate.body?.user?.phone === '+63 912 345 6789' &&
      meUpdate.body?.user?.role === 'CITIZEN' && meUpdate.body?.user?.status === 'ACTIVE', `status=${meUpdate.status}`);

    const wrongCurrent = await api('POST', '/api/users/me/password', {
      token: citizen2Token,
      json: { currentPassword: 'wrong', newPassword: 'NewPassw0rd!' },
    });
    check('change password wrong current 401', wrongCurrent.status === 401, `status=${wrongCurrent.status}`);

    const changed = await api('POST', '/api/users/me/password', {
      token: citizen2Token,
      json: { currentPassword: PW, newPassword: 'NewPassw0rd!' },
    });
    check('change password 200', changed.status === 200 && changed.body?.success === true, `status=${changed.status}`);

    const relogin = await login(citizen2Email, 'NewPassw0rd!');
    check('login with new password works', relogin.status === 200, `status=${relogin.status}`);

    const reset = await api('POST', `/api/users/${newOfficerId}/reset-password`, {
      token: adminToken,
      json: { newPassword: 'ResetPassw0rd!' },
    });
    check('admin resets password 200', reset.status === 200, `status=${reset.status}`);
  }

  // ---------------------------------------------------------------------
  section('Geocoding (free OSM Nominatim, optional network)');
  {
    const search = await api('GET', '/api/map/geocode/search?q=Manila&limit=3');
    check(
      'geocode search responds 200 (available or graceful)',
      search.status === 200 && (Array.isArray(search.body?.results) || search.body?.available === false),
      `status=${search.status}`
    );
    const bad = await api('GET', '/api/map/geocode/search?q=M');
    check('geocode search short query 422', bad.status === 422, `status=${bad.status}`);
    const badLimit = await api('GET', '/api/map/geocode/search?q=Manila&limit=99');
    check('geocode search bad limit 422', badLimit.status === 422, `status=${badLimit.status}`);
    const rev = await api('GET', '/api/map/geocode/reverse?lat=14.6&lng=121.0');
    check('reverse geocode responds 200', rev.status === 200, `status=${rev.status}`);
    const revBad = await api('GET', '/api/map/geocode/reverse?lat=999&lng=0');
    check('reverse geocode bad lat 422', revBad.status === 422, `status=${revBad.status}`);
  }

  // ---------------------------------------------------------------------
  section('Withdraw (delete) own pending report');
  {
    const r = await api('POST', '/api/reports', { token: citizenToken, form: pngForm({ ...goodReport, title: 'IT withdrawable report' }) });
    const id = r.body?.report?.id;
    const del = await api('DELETE', `/api/reports/${id}`, { token: citizenToken });
    check('owner withdraws pending report 200', del.status === 200 && del.body?.success === true, `status=${del.status}`);
    const gone = await api('GET', `/api/reports/${id}`, { token: citizenToken });
    check('withdrawn report is gone 404', gone.status === 404, `status=${gone.status}`);

    const approvedDel = await api('DELETE', `/api/reports/${reportId}`, { token: citizenToken });
    check('owner cannot delete approved report 409', approvedDel.status === 409, `status=${approvedDel.status}`);

    const adminTarget = await api('POST', '/api/reports', {
      token: citizenToken,
      form: pngForm({ ...goodReport, title: 'IT admin-deletable report' }),
    });
    const adminTargetId = adminTarget.body?.report?.id;
    const citizenAdminDelete = await api('DELETE', `/api/admin/reports/${adminTargetId}`, { token: citizenToken });
    check('citizen cannot use admin report deletion route (403)', citizenAdminDelete.status === 403, `status=${citizenAdminDelete.status}`);
    const officerAdminDelete = await api('DELETE', `/api/admin/reports/${adminTargetId}`, { token: officer1Token });
    check('officer cannot use admin report deletion route (403)', officerAdminDelete.status === 403, `status=${officerAdminDelete.status}`);
    const adminDelete = await api('DELETE', `/api/admin/reports/${adminTargetId}`, { token: adminToken });
    check('admin deletes report through admin route (200)', adminDelete.status === 200 && adminDelete.body?.success === true, `status=${adminDelete.status}`);
    const adminDeletedGone = await api('GET', `/api/reports/${adminTargetId}`, { token: adminToken });
    check('admin-deleted report is gone (404)', adminDeletedGone.status === 404, `status=${adminDeletedGone.status}`);
  }

  // ---------------------------------------------------------------------
  section('Unknown route');
  {
    const r = await api('GET', '/api/definitely-not-a-route');
    check('unknown route returns 404 JSON', r.status === 404 && r.body?.error?.code === 'NOT_FOUND', `status=${r.status} ${JSON.stringify(r.body)}`);
  }

  // ---------------------------------------------------------------------
  console.log(`\n=================================================`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('\nFailed checks:');
    for (const f of failures) console.log('  - ' + f);
  }
  console.log(`=================================================`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('Test harness crashed:', e);
  process.exit(2);
});
