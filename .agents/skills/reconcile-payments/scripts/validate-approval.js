#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

function fail(message) {
  process.stderr.write(`Approval validation failed: ${message}\n`);
  process.exit(1);
}

function exactFields(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (unknown.length) fail(`${label} contains an unknown field.`);
  if (missing.length) fail(`${label} is missing a required field.`);
}

if (process.argv.length !== 3) fail('provide exactly one JSON file.');
const file = process.argv[2];
let stat;
try {
  stat = fs.lstatSync(file);
} catch {
  fail('file is not readable.');
}
if (!stat.isFile() || stat.isSymbolicLink()) fail('payload must be a regular, non-symlink file.');
if (stat.size < 1 || stat.size > 65536) fail('payload must be between 1 byte and 64 KiB.');

let input;
try {
  input = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  fail('payload is not valid JSON.');
}
if (!input || typeof input !== 'object' || Array.isArray(input)) fail('payload must be a JSON object.');
exactFields(input, ['messageId', 'receivedAt', 'allocations'], 'payload');

const messageId = String(input.messageId || '').trim();
if (!messageId || messageId.length > 256) fail('messageId is invalid.');
const receivedDate = new Date(input.receivedAt);
if (!input.receivedAt || Number.isNaN(receivedDate.getTime())) fail('receivedAt is invalid.');
if (!Array.isArray(input.allocations) || input.allocations.length < 1 || input.allocations.length > 50) {
  fail('allocations must contain 1 through 50 entries.');
}

const seen = new Set();
const allocations = input.allocations.map((allocation) => {
  if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) fail('allocation must be an object.');
  exactFields(allocation, ['refCode', 'amountCents', 'notes'], 'allocation');
  const refCode = String(allocation.refCode || '').trim().toUpperCase();
  if (!refCode || refCode.length > 64) fail('allocation refCode is invalid.');
  if (seen.has(refCode)) fail('allocation reference codes must be unique.');
  seen.add(refCode);
  if (!Number.isSafeInteger(allocation.amountCents) || allocation.amountCents <= 0) {
    fail('allocation amountCents must be a positive integer.');
  }
  const notes = String(allocation.notes || '').trim();
  if (notes.length > 500) fail('allocation notes are too long.');
  return { amountCents: allocation.amountCents, notes, refCode };
});

process.stdout.write(`${JSON.stringify({ allocations, messageId, receivedAt: receivedDate.toISOString() })}\n`);
