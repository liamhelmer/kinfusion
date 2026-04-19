/**
 * Shared form handling module. Used by all three form pages.
 * @param {HTMLFormElement} formEl
 * @param {{ formName: string, onSuccess: (data: object) => void, onError?: () => void }} config
 */
export function initForm(formEl, config) {
  let formToken = null;
  let turnstileToken = null;
  let submitting = false;
  const submitBtn = formEl.querySelector('[type=submit]');
  const originalBtnText = submitBtn ? submitBtn.textContent : 'Submit';
  const statusEl = formEl.querySelector('[role=alert]') || document.getElementById('form-status');

  function announceError(msg) {
    if (statusEl) {
      statusEl.textContent = msg;
    }
  }

  function announceSuccess(msg) {
    if (statusEl) {
      statusEl.textContent = msg;
    }
  }

  // Fetch form token from server (POST /api/form-token)
  async function fetchFormToken() {
    try {
      const resp = await fetch('/api/form-token', { method: 'POST' });
      const data = await resp.json();
      if (data.ok && data.token) {
        formToken = data.token;
      } else {
        announceError('Could not initialize form. Please refresh the page or email hello@kinfusion.dance');
      }
    } catch {
      announceError('Could not initialize form. Please refresh the page or email hello@kinfusion.dance');
    }
  }

  // Turnstile callback — called by Turnstile widget on success
  window.turnstileCallback = function(token) {
    turnstileToken = token;
    clearTimeout(turnstileTimeout);
  };

  // 5-second Turnstile load timeout — show mailto fallback
  const turnstileTimeout = setTimeout(() => {
    if (!turnstileToken) {
      const fallback = formEl.querySelector('#turnstile-fallback') || document.getElementById('turnstile-fallback');
      if (fallback) {
        fallback.removeAttribute('hidden');
      }
      if (submitBtn) submitBtn.disabled = true;
    }
  }, 5000);

  const ERROR_MESSAGES = {
    TURNSTILE_MISSING: 'Please complete the security challenge.',
    TURNSTILE_INVALID: 'Security challenge failed. Please refresh and try again.',
    TURNSTILE_UNREACHABLE: 'Security check unavailable. Please try again or email hello@kinfusion.dance',
    FORM_TOKEN_MISSING: 'Your session expired. Please refresh the page.',
    FORM_TOKEN_INVALID: 'Your session expired. Please refresh the page.',
    FORM_TOKEN_EXPIRED: 'Your session expired. Please refresh the page.',
    RATE_LIMITED: 'Too many attempts. Please wait a minute and try again.',
    DUPLICATE: 'We already received this submission. Check your email for a confirmation.',
    VALIDATION: 'Please check the highlighted fields.',
    UPSTREAM_ERROR: 'Submission failed. Please try again or email hello@kinfusion.dance',
    UPSTREAM_UNREACHABLE: 'Submission failed. Please try again or email hello@kinfusion.dance',
    BAD_REQUEST: 'Invalid request. Please refresh and try again.',
  };

  function handleError(data) {
    const msg = ERROR_MESSAGES[data.code] || 'An error occurred. Please try again.';
    if (data.code === 'VALIDATION' && data.field) {
      const fieldEl = document.getElementById(data.field) ||
        formEl.querySelector(`[name="${data.field}"]`);
      if (fieldEl) {
        fieldEl.setAttribute('aria-invalid', 'true');
        fieldEl.focus();
      }
    }
    announceError(msg);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
    submitting = false;
    if (config.onError) config.onError();
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    submitting = true;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting\u2026';
    }

    // Clear previous errors
    formEl.querySelectorAll('[aria-invalid=true]').forEach(el => el.removeAttribute('aria-invalid'));
    if (statusEl) statusEl.textContent = '';

    // Collect form fields
    const formData = new FormData(formEl);
    const body = {};
    for (const [key, value] of formData.entries()) {
      body[key] = value;
    }

    // Handle checkboxes (unchecked checkboxes are absent from FormData)
    formEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
      body[cb.name] = cb.checked;
    });

    body.formToken = formToken;
    body['cf-turnstile-response'] = turnstileToken;

    try {
      const resp = await fetch(`/api/${config.formName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();

      if (data.ok) {
        announceSuccess(data.message || 'Submission received!');
        config.onSuccess(data);
      } else {
        handleError(data);
      }
    } catch {
      announceError('Network error. Please try again or email hello@kinfusion.dance');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
      submitting = false;
    }
  });

  // Initialize: fetch form token on load
  fetchFormToken();
}
