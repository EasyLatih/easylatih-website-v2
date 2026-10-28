/**
 * EasyLatih public registration: duplicate-submission guard.
 *
 * Add this as a NEW file in the "EasyLatih Management System V2 - STAGING"
 * project, and in Code.gs doPost(e) replace
 *   const result = submitRegistration(data);
 * with
 *   const result = submitRegistrationOnce_(data, e.parameter.submissionId);
 *
 * A registration that arrives twice (double click, refresh, slow connection)
 * returns the first result instead of creating a second registration:
 *   - same submissionId from the website form: within 6 hours
 *   - same programme + PIC email + participant list: within 15 minutes
 */

const REG_GUARD_DONE_SECONDS_ = 6 * 60 * 60;
const REG_GUARD_FINGERPRINT_SECONDS_ = 15 * 60;
const REG_GUARD_WAIT_MS_ = 90 * 1000;

function submitRegistrationOnce_(data, submissionId) {
  return withRegistrationGuard_(data, submissionId, submitRegistration);
}

function registrationFingerprint_(data) {
  const people = (Array.isArray(data.participants) ? data.participants : []).map(function (p) {
    return [String(p.name || '').trim().toLowerCase(), String(p.icNo || '').replace(/\D/g, ''), String(p.email || '').trim().toLowerCase()].join('~');
  }).sort().join('|');
  const raw = [String(data.courseId || '').trim(), String(data.picEmail || '').trim().toLowerCase(), String(data.paymentMethod || '').toUpperCase(), people].join('#');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest).slice(0, 43);
}

// Runs submitFn(data) at most once per submission; repeats get the first result.
function withRegistrationGuard_(data, submissionId, submitFn) {
  const cache = CacheService.getScriptCache();
  const idKey = /^[A-Za-z0-9-]{8,80}$/.test(String(submissionId || '')) ? 'reg-guard:id:' + submissionId : '';
  const fpKey = 'reg-guard:fp:' + registrationFingerprint_(data);
  const keys = idKey ? [idKey, fpKey] : [fpKey];

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let claimed = false;
  try {
    const seen = cache.getAll(keys);
    const existing = keys.map(function (k) { return seen[k]; }).filter(Boolean)[0];
    if (!existing) {
      keys.forEach(function (k) { cache.put(k, 'PENDING', REG_GUARD_WAIT_MS_ / 1000 + 60); });
      claimed = true;
    } else if (existing !== 'PENDING') {
      return JSON.parse(existing);
    }
  } finally {
    lock.releaseLock();
  }

  if (!claimed) {
    // The first copy is still being processed: wait for its result.
    const until = Date.now() + REG_GUARD_WAIT_MS_;
    while (Date.now() < until) {
      Utilities.sleep(2000);
      const seen = cache.getAll(keys);
      const value = keys.map(function (k) { return seen[k]; }).filter(function (v) { return v && v !== 'PENDING'; })[0];
      if (value) return JSON.parse(value);
    }
    throw new Error('Your registration is still being processed. Please check your email before submitting again.');
  }

  try {
    const result = submitFn(data);
    const stored = JSON.stringify(result || {});
    if (idKey) cache.put(idKey, stored, REG_GUARD_DONE_SECONDS_);
    cache.put(fpKey, stored, REG_GUARD_FINGERPRINT_SECONDS_);
    return result;
  } catch (error) {
    keys.forEach(function (k) { cache.remove(k); });
    throw error;
  }
}

// Read-only check you can run from the editor. It uses a dummy registration
// function, so nothing is written to the spreadsheet and no email is sent.
function registrationGuardSelfTest() {
  let calls = 0;
  const fake = function () { calls++; return { registrationId: 'TEST-' + calls }; };
  const sample = { courseId: 'SELFTEST', picEmail: 'selftest@example.com', paymentMethod: 'SELF', participants: [{ name: 'Test ' + Date.now(), icNo: '1', email: 'a@example.com' }] };
  const id = 'selftest-' + Date.now();
  const first = withRegistrationGuard_(sample, id, fake);
  const second = withRegistrationGuard_(sample, id, fake);
  const third = withRegistrationGuard_(sample, '', fake);
  console.log('First: ' + first.registrationId + ', repeat with same ID: ' + second.registrationId + ', repeat without ID: ' + third.registrationId + ', real submissions run: ' + calls);
  if (calls !== 1) throw new Error('Guard failed: expected 1 submission, got ' + calls);
  return 'Guard OK';
}
