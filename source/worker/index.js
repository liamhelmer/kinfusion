import { addSecurityHeaders } from './headers.js';
import { issueToken, validateAndConsumeToken } from './formToken.js';
import { verifyTurnstile } from './turnstile.js';
import { applyMiddleware } from './middleware.js';
import { validateRegistration, validateUnconference, validateDJ } from './validation.js';
import { signAndForward } from './hmac.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function logRejection(form, reason, request) {
  const ip = (request.headers.get('cf-connecting-ip') || 'unknown').split('.').slice(0, 3).join('.') + '.x';
  console.log(JSON.stringify({ ts: Date.now(), form, reason, ip }));
}

async function handleFormToken(request, env) {
  const token = await issueToken(env);
  return jsonResponse({ ok: true, token });
}

const VALIDATORS = {
  register: validateRegistration,
  unconference: validateUnconference,
  'dj-signup': validateDJ,
};

async function handleFormSubmission(request, env, formName) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
  }

  // Step 1: Form token (ADR R5.4)
  const tokenResult = await validateAndConsumeToken(body.formToken, env);
  if (!tokenResult.valid) {
    logRejection(formName, tokenResult.code, request);
    return jsonResponse({ ok: false, error: tokenResult.code, code: tokenResult.code }, 400);
  }

  // Step 2: Turnstile (ADR R5.1)
  const turnstileResult = await verifyTurnstile(body['cf-turnstile-response'], env);
  if (!turnstileResult.success) {
    logRejection(formName, turnstileResult.code, request);
    return jsonResponse({ ok: false, error: turnstileResult.code, code: turnstileResult.code }, 400);
  }

  // Step 3: Field validation (ADR R7.3)
  const validate = VALIDATORS[formName];
  if (validate) {
    const validResult = validate(body);
    if (!validResult.valid) {
      logRejection(formName, 'validation:' + validResult.field, request);
      return jsonResponse({ ok: false, error: 'Validation failed', code: validResult.code, field: validResult.field }, 400);
    }
  }

  // Step 4: Honeypot, rate-limit, dedupe (ADR R5.2, R5.3, R5.6)
  const middlewareResponse = await applyMiddleware(request, body, formName, env);
  if (middlewareResponse) return middlewareResponse;

  // Step 5: HMAC sign and forward to Apps Script (ADR R5.5, R5.7)
  const { formToken: _ft, 'cf-turnstile-response': _ts, website: _hp, ...payload } = body;
  payload.form = formName;

  const result = await signAndForward(payload, env);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.code || 'Submission failed', code: result.code || 'ERROR' }, 500);
  }
  return jsonResponse({ ok: true, refCode: result.refCode });
}

async function handleRegister(request, env) {
  return handleFormSubmission(request, env, 'register');
}

async function handleUnconference(request, env) {
  return handleFormSubmission(request, env, 'unconference');
}

async function handleDJSignup(request, env) {
  return handleFormSubmission(request, env, 'dj-signup');
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
