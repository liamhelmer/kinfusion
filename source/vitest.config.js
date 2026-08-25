import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'scripts/tests/**'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          kvNamespaces: ['RATE_KV'],
          bindings: {
            TURNSTILE_SECRET: 'test-turnstile-secret',
            APPS_SCRIPT_URL: 'https://script.google.com/test/exec',
            APPS_SCRIPT_HMAC_KEY: 'test-hmac-key-32-bytes-hexhexhex00',
            FORM_TOKEN_SECRET: 'test-form-token-secret-32byteshex0',
          },
        },
      },
    },
  },
});
