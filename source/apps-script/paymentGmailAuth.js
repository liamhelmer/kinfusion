/** OAuth bridge for the separately owned payment Gmail mailbox. */

var PAYMENT_GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
var PAYMENT_GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

function _paymentGmailConfiguration() {
  var props = PropertiesService.getScriptProperties();
  return {
    props: props,
    clientId: props.getProperty('PAYMENT_GMAIL_CLIENT_ID') || '',
    clientSecret: props.getProperty('PAYMENT_GMAIL_CLIENT_SECRET') || '',
    expectedAddress: props.getProperty('PAYMENT_GMAIL_EXPECTED_ADDRESS') || '',
    authorizedAddress: props.getProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS') || '',
  };
}

function _paymentGmailIsConfigured(config) {
  return Boolean(config.clientId && config.clientSecret && config.expectedAddress);
}

function _paymentGmailService() {
  var config = _paymentGmailConfiguration();
  if (!_paymentGmailIsConfigured(config)) throw new Error('payment_gmail_not_configured');
  return OAuth2.createService('kinfusion-payment-gmail')
    .setAuthorizationBaseUrl('https://accounts.google.com/o/oauth2/v2/auth')
    .setTokenUrl('https://oauth2.googleapis.com/token')
    .setClientId(config.clientId)
    .setClientSecret(config.clientSecret)
    .setCallbackFunction('paymentGmailAuthCallback')
    .setPropertyStore(config.props)
    .setCache(CacheService.getScriptCache())
    .setLock(LockService.getScriptLock())
    .setScope(PAYMENT_GMAIL_SCOPE)
    .setParam('access_type', 'offline')
    .setParam('prompt', 'consent')
    .setParam('login_hint', config.expectedAddress);
}

function getPaymentGmailAuthStatus() {
  var config = _paymentGmailConfiguration();
  var base = {
    ok: false,
    authorized: false,
    expectedAddress: config.expectedAddress,
    authorizedAddress: config.authorizedAddress,
  };
  if (!_paymentGmailIsConfigured(config)) {
    base.error = 'payment_gmail_not_configured';
    return base;
  }

  var service = _paymentGmailService();
  if (!service.hasAccess()) {
    base.ok = true;
    base.error = 'authorization_required';
    base.authorizationUrl = service.getAuthorizationUrl();
    return base;
  }

  base.ok = true;
  base.authorized = Boolean(config.authorizedAddress &&
    config.authorizedAddress.toLowerCase() === config.expectedAddress.toLowerCase());
  if (!base.authorized) base.error = 'authorized_account_unverified';
  return base;
}

function getPaymentGmailAuthorizationUrl() {
  var config = _paymentGmailConfiguration();
  if (!_paymentGmailIsConfigured(config)) {
    return {
      ok: false,
      authorized: false,
      expectedAddress: config.expectedAddress,
      authorizedAddress: config.authorizedAddress,
      error: 'payment_gmail_not_configured',
    };
  }
  return {
    ok: true,
    authorized: false,
    expectedAddress: config.expectedAddress,
    authorizedAddress: config.authorizedAddress,
    authorizationUrl: _paymentGmailService().getAuthorizationUrl(),
  };
}

function resetPaymentGmailAuthorization() {
  var config = _paymentGmailConfiguration();
  if (_paymentGmailIsConfigured(config)) _paymentGmailService().reset();
  config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS');
  return {
    ok: true,
    authorized: false,
    expectedAddress: config.expectedAddress,
    authorizedAddress: '',
  };
}

function _paymentGmailFetch(path, options) {
  var service = _paymentGmailService();
  if (!service.hasAccess()) {
    return { ok: false, error: 'authorization_required', authorizationUrl: service.getAuthorizationUrl() };
  }
  var requestOptions = options || {};
  requestOptions.muteHttpExceptions = true;
  requestOptions.headers = requestOptions.headers || {};
  requestOptions.headers.Authorization = 'Bearer ' + service.getAccessToken();
  if (requestOptions.payload && typeof requestOptions.payload !== 'string') {
    requestOptions.payload = JSON.stringify(requestOptions.payload);
    requestOptions.contentType = 'application/json';
  }
  var response = UrlFetchApp.fetch(PAYMENT_GMAIL_API_BASE + path, requestOptions);
  var status = response.getResponseCode();
  var text = response.getContentText();
  var data = text ? JSON.parse(text) : {};
  if (status < 200 || status >= 300) {
    return { ok: false, error: 'gmail_api_error', status: status };
  }
  return { ok: true, data: data };
}

function _paymentAuthHtml(title, message) {
  var escape = function (value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  };
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><title>' + escape(title) + '</title>' +
    '<main><h1>' + escape(title) + '</h1><p>' + escape(message) + '</p></main>'
  );
}

function paymentGmailAuthCallback(request) {
  var config = _paymentGmailConfiguration();
  if (!_paymentGmailIsConfigured(config)) {
    return _paymentAuthHtml('Authorization unavailable', 'The payment mailbox is not configured.');
  }
  var service = _paymentGmailService();
  if (!service.handleCallback(request)) {
    config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS');
    return _paymentAuthHtml('Authorization was not completed', 'No mailbox access was stored.');
  }

  var profile = _paymentGmailFetch('/profile', { method: 'get' });
  if (!profile.ok || !profile.data.emailAddress) {
    service.reset();
    config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS');
    return _paymentAuthHtml('Authorization verification failed', 'Please generate a new link and try again.');
  }

  var actualAddress = String(profile.data.emailAddress);
  if (actualAddress.toLowerCase() !== config.expectedAddress.toLowerCase()) {
    service.reset();
    config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS');
    return _paymentAuthHtml('Wrong Google account', 'Please authorize ' + config.expectedAddress + ' instead.');
  }

  config.props.setProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS', actualAddress);
  return _paymentAuthHtml('Authorization complete', 'The payment mailbox was verified. You may close this window.');
}

if (typeof globalThis !== 'undefined') {
  globalThis.getPaymentGmailAuthStatus = getPaymentGmailAuthStatus;
  globalThis.getPaymentGmailAuthorizationUrl = getPaymentGmailAuthorizationUrl;
  globalThis.resetPaymentGmailAuthorization = resetPaymentGmailAuthorization;
  globalThis.paymentGmailAuthCallback = paymentGmailAuthCallback;
  globalThis._paymentGmailFetch = _paymentGmailFetch;
}
