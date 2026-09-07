import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const siteRoot = new URL('../../_site/', import.meta.url);
const closedMessage = /Applications are closed for this year\. We won[’']t accept any more applications until next year\./;

function visibleText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

test('attendee and DJ applications are closed while unconference proposals remain open', async () => {
  const [registrationPage, djPage, unconferencePage] = await Promise.all([
    readFile(new URL('register/index.html', siteRoot), 'utf8'),
    readFile(new URL('dj/index.html', siteRoot), 'utf8'),
    readFile(new URL('unconference/index.html', siteRoot), 'utf8'),
  ]);

  for (const page of [registrationPage, djPage]) {
    assert.match(visibleText(page), closedMessage);
    assert.doesNotMatch(page, /<form\b/);
  }

  assert.match(unconferencePage, /<form\b[^>]*id="unconference-form"/);
  assert.doesNotMatch(unconferencePage, closedMessage);
});
