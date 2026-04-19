import { addSecurityHeaders } from './headers.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Stub handlers — replaced by real implementations in T-2.4 through T-2.7
async function handleFormToken(request, env) {
  return jsonResponse({ ok: true });
}

async function handleRegister(request, env) {
  return jsonResponse({ ok: true });
}

async function handleUnconference(request, env) {
  return jsonResponse({ ok: true });
}

async function handleDJSignup(request, env) {
  return jsonResponse({ ok: true });
}

const API_ROUTES = new Map([
  ['POST /api/form-token', handleFormToken],
  ['POST /api/register', handleRegister],
  ['POST /api/unconference', handleUnconference],
  ['POST /api/dj-signup', handleDJSignup],
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const routeKey = `${request.method} ${url.pathname}`;
      const handler = API_ROUTES.get(routeKey);
      if (handler) {
        return addSecurityHeaders(await handler(request, env));
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return addSecurityHeaders(jsonResponse({ ok: false, error: 'Not found', code: 'NOT_FOUND' }, 404));
      }
      return addSecurityHeaders(jsonResponse({ ok: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405));
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status === 404) {
      const notFoundResponse = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url)));
      if (notFoundResponse.ok) {
        return addSecurityHeaders(new Response(notFoundResponse.body, {
          status: 404,
          headers: notFoundResponse.headers,
        }));
      }
    }
    return addSecurityHeaders(response);
  },
};
