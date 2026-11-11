const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

function fixture(poolSize = 40) {
  const props = {};
  const W = 33;
  const prospects = [new Array(W).fill('H')];
  const poolRows = [new Array(21).fill('H')];
  for (let i = 1; i <= poolSize; i++) {
    const r = new Array(21).fill('');
    r[0] = 'P' + i; r[2] = 'Company ' + i; r[7] = '0123'; r[13] = 'AVAILABLE';
    poolRows.push(r);
  }
  const mkSheet = rows => ({
    getLastRow: () => rows.length, getMaxColumns: () => 40,
    insertColumnsAfter() {}, appendRow(v) { rows.push(v.slice()); },
    getRange(r, c, h = 1, w = 1) { return {
      getValues: () => Array.from({length: h}, (_, i) => Array.from({length: w}, (_, j) => rows[r-1+i]?.[c-1+j] ?? '')),
      setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { rows[r-1+i] ||= []; rows[r-1+i][c-1+j] = x; })); },
      setValue(x) { rows[r-1] ||= []; rows[r-1][c-1] = x; return this; }, setFontWeight() { return this; }
    }; }
  });
  const pSheet = mkSheet(prospects), poolSheet = mkSheet(poolRows);
  const ctx = vm.createContext({
    jsonOutput: v => v, isAdmin_: () => false, forbidden_: () => ({success:false, code:'FORBIDDEN'}),
    validRowNumber_: (n, s) => n >= 2 && n <= s.getLastRow(),
    canEditRow_: (s, n, sess) => String(prospects[n-1][1]) === sess.agentId,
    normalizeCompany: s => String(s || '').toUpperCase().trim(), PROSPECT_SHEET: 'Prospects',
    SpreadsheetApp: {flush() {}, getActiveSpreadsheet: () => ({
      getSheetByName: n => n === 'Prospects' ? pSheet : poolSheet, insertSheet: () => poolSheet })},
    LockService: {getScriptLock: () => ({tryLock: () => true, releaseLock() {}})},
    PropertiesService: {getScriptProperties: () => ({getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }})},
    Utilities: {formatDate: (d, tz, f) => new Date(d.getTime() + 8*3600e3).toISOString().slice(0, 10), getUuid: (() => { let n = 0; return () => 'k' + (++n); })()},
    Logger: {log() {}}
  });
  vm.runInContext(readFileSync('apps-script/ProspectPool.gs', 'utf8'), ctx);
  const sess = {agentId: 'A1', name: 'Ali'};
  const call = (action, params = {}) => ctx.routeProspectPool_(action, {parameter: params}, sess);
  const claim = i => call('claimProspect', {poolId: 'P' + i});
  const contact = (row, outcome = 'NO_ANSWER', extra = {}) =>
    call('recordContact', {rowNumber: String(row), outcome, nextFollowUpDate: '2026-12-01', ...extra});
  return {ctx, props, prospects, call, claim, contact};
}

test('first 10 are free, 11th is blocked until all 10 have an outcome, then unlock gives 10 more', async () => {
  const f = fixture();
  const rows = [];
  for (let i = 1; i <= 10; i++) { const r = f.claim(i); assert.equal(r.success, true); rows.push(r.rowNumber); }
  let r = f.claim(11);
  assert.equal(r.success, false); assert.equal(r.code, 'LIMIT'); assert.equal(r.pendingContact, 10);
  assert.match(r.message, /10 syarikat lagi/);

  assert.equal(f.call('unlockPool').success, false, 'cannot unlock with uncontacted companies');
  await new Promise(res => setTimeout(res, 5));
  for (let i = 0; i < 9; i++) f.contact(rows[i]);
  r = f.call('getPool');
  assert.equal(r.canUnlock, false); assert.equal(r.pendingContact, 1);

  r = f.contact(rows[9], 'DO_NOT_CONTACT', {nextFollowUpDate: ''});
  assert.equal(r.success, true); assert.equal(r.canUnlock, true, 'Do Not Contact counts as done');
  assert.equal(f.claim(11).code, 'LIMIT', 'still needs the button press');

  r = f.call('unlockPool');
  assert.equal(r.success, true); assert.equal(r.allowance, 20); assert.equal(r.remainingToday, 10);
  assert.equal(f.call('unlockPool').success, false, 'no double unlock');
  for (let i = 11; i <= 20; i++) assert.equal(f.claim(i).success, true);
  assert.equal(f.claim(21).code, 'LIMIT');
});

test('wrong info frees a slot and status-only edits do not count as contact', async () => {
  const f = fixture();
  const rows = [];
  for (let i = 1; i <= 10; i++) rows.push(f.claim(i).rowNumber);
  await new Promise(res => setTimeout(res, 5));
  const r = f.contact(rows[0], 'WRONG_INFO', {callRemark: 'nombor tak wujud', nextFollowUpDate: ''});
  assert.equal(r.success, true);
  assert.equal(f.claim(11).success, true, 'replacement allowed');
  // A status flip without a recorded outcome is not a contact.
  f.prospects[rows[1]-1][13] = 'CONTACTED';
  assert.equal(f.call('getPool').pendingContact, 10);
});

test('unlocks reset on a new day', () => {
  const f = fixture();
  f.props.POOL_UNLOCKS = JSON.stringify({day: '2000-01-01', counts: {A1: 5}});
  assert.equal(f.call('getPool').allowance, 10);
});
