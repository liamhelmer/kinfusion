import { describe, expect, test } from 'vitest';
import manifest from '../appsscript.json';

describe('Apps Script OAuth manifest', () => {
  test('authorizes the controller identity check', () => {
    expect(manifest.oauthScopes).toContain(
      'https://www.googleapis.com/auth/userinfo.email'
    );
  });
});
