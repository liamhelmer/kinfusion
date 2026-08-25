import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readBuiltPage = (path) => readFile(new URL(`../../_site/${path}`, import.meta.url), 'utf8');

test('the public privacy page explains the payment Gmail access', async () => {
  const html = await readBuiltPage('privacy/index.html');

  assert.match(html, /Privacy Policy/);
  assert.match(html, /Interac e-Transfer and Wise payment notifications/);
  assert.match(html, /kinfusion-etransfer/);
  assert.match(html, /does not send email/i);
  assert.match(html, /Google API Services User Data Policy/);
  assert.match(html, /Limited Use/i);
  assert.match(html, /myaccount\.google\.com\/permissions/);
  assert.match(html, /hello@kinfusion\.dance/);
});

test('the shared footer links the privacy policy and event terms', async () => {
  const html = await readBuiltPage('index.html');

  assert.match(html, /href="\/privacy\/"[^>]*>Privacy<\/a>/);
  assert.match(html, /href="\/code-of-conduct\/"[^>]*>Code of Conduct<\/a>/);
});
