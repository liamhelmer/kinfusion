const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const validator = path.resolve(__dirname, '../scripts/validate-approval.js');

function run(value, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-approval-'));
  const file = path.join(dir, 'approval.json');
  fs.writeFileSync(file, JSON.stringify(value));
  fs.chmodSync(file, 0o600);
  const target = options.symlink ? path.join(dir, 'linked.json') : file;
  if (options.symlink) fs.symlinkSync(file, target);
  const result = spawnSync(process.execPath, [validator, target], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test('normalizes and emits a stable exact approval payload', () => {
  const result = run({
    allocations: [
      { notes: ' Household split ', amountCents: 20000, refCode: ' kf-ab123 ' },
      { amountCents: 40000, refCode: 'KF-CD456', notes: '' },
    ],
    receivedAt: '2026-08-20T15:00:00Z',
    messageId: ' msg-1 ',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '{"allocations":[{"amountCents":20000,"notes":"Household split","refCode":"KF-AB123"},{"amountCents":40000,"notes":"","refCode":"KF-CD456"}],"messageId":"msg-1","receivedAt":"2026-08-20T15:00:00.000Z"}');
});

test('rejects unknown mutation fields', () => {
  const result = run({
    messageId: 'msg-1',
    receivedAt: '2026-08-20T15:00:00Z',
    allocations: [{ refCode: 'KF-A', amountCents: 100, notes: '' }],
    labelEveryMessage: true,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown field/i);
  assert.doesNotMatch(result.stderr, /msg-1/);
});

test('rejects invalid cents and duplicate reference codes', () => {
  for (const allocations of [
    [{ refCode: 'KF-A', amountCents: 1.5, notes: '' }],
    [{ refCode: 'KF-A', amountCents: 100, notes: '' }, { refCode: 'kf-a', amountCents: 200, notes: '' }],
  ]) {
    const result = run({ messageId: 'msg-1', receivedAt: '2026-08-20T15:00:00Z', allocations });
    assert.notEqual(result.status, 0);
  }
});

test('rejects a symlink payload', () => {
  const result = run({
    messageId: 'msg-1',
    receivedAt: '2026-08-20T15:00:00Z',
    allocations: [{ refCode: 'KF-A', amountCents: 100, notes: '' }],
  }, { symlink: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /regular, non-symlink/i);
});
