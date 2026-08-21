/** OAuth bridge for the separately owned payment Gmail mailbox. */

var PAYMENT_GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
var PAYMENT_GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

function paymentGmailConfiguration_() {
  var props = PropertiesService.getScriptProperties();
  return {
    props: props,
    clientId: props.getProperty('PAYMENT_GMAIL_CLIENT_ID') || '',
    clientSecret: props.getProperty('PAYMENT_GMAIL_CLIENT_SECRET') || '',
    expectedAddress: props.getProperty('PAYMENT_GMAIL_EXPECTED_ADDRESS') || '',
    authorizedAddress: props.getProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS') || '',
    authorizedClientId: props.getProperty('PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID') || '',
  };
}

function paymentGmailIsConfigured_(config) {
  return Boolean(config.clientId && config.clientSecret && config.expectedAddress);
}

function paymentGmailBindingValid_(config) {
  return Boolean(config.authorizedAddress && config.authorizedClientId &&
    config.authorizedAddress.toLowerCase() === config.expectedAddress.toLowerCase() &&
    config.authorizedClientId === config.clientId);
}

function paymentGmailService_() {
  var config = paymentGmailConfiguration_();
  if (!paymentGmailIsConfigured_(config)) throw new Error('payment_gmail_not_configured');
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
  var config = paymentGmailConfiguration_();
  var base = {
    ok: false,
    authorized: false,
    expectedAddress: config.expectedAddress,
    authorizedAddress: config.authorizedAddress,
  };
  if (!paymentGmailIsConfigured_(config)) {
    base.error = 'payment_gmail_not_configured';
    return base;
  }

  var service = paymentGmailService_();
  if (!service.hasAccess()) {
    base.ok = true;
    base.error = 'authorization_required';
    base.authorizationUrl = service.getAuthorizationUrl();
    return base;
  }

  base.ok = true;
  base.authorized = paymentGmailBindingValid_(config);
  if (!base.authorized) base.error = 'authorized_account_unverified';
  return base;
}

function getPaymentGmailAuthorizationUrl() {
  var config = paymentGmailConfiguration_();
  if (!paymentGmailIsConfigured_(config)) {
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
    authorizationUrl: paymentGmailService_().getAuthorizationUrl(),
  };
}

function resetPaymentGmailAuthorization() {
  var config = paymentGmailConfiguration_();
  if (paymentGmailIsConfigured_(config)) paymentGmailService_().reset();
  config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS');
  config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID');
  return {
    ok: true,
    authorized: false,
    expectedAddress: config.expectedAddress,
    authorizedAddress: '',
  };
}

function paymentGmailFetch_(path, options) {
  var config = paymentGmailConfiguration_();
  if (!paymentGmailBindingValid_(config)) {
    return { ok: false, error: 'authorized_account_unverified' };
  }
  var service = paymentGmailService_();
  return paymentGmailFetchRaw_(path, options, service);
}

function paymentGmailFetchRaw_(path, options, service) {
  service = service || paymentGmailService_();
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

function paymentAuthHtml_(title, message) {
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
  var config = paymentGmailConfiguration_();
  if (!paymentGmailIsConfigured_(config)) {
    return paymentAuthHtml_('Authorization unavailable', 'The payment mailbox is not configured.');
  }
  var service = paymentGmailService_();
  config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS');
  config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID');
  try {
    if (!service.handleCallback(request)) {
      service.reset();
      return paymentAuthHtml_('Authorization was not completed', 'No mailbox access was stored.');
    }

    var profile = paymentGmailFetchRaw_('/profile', { method: 'get' }, service);
    if (!profile.ok || !profile.data.emailAddress) {
      service.reset();
      return paymentAuthHtml_('Authorization verification failed', 'Please generate a new link and try again.');
    }

    var actualAddress = String(profile.data.emailAddress);
    if (actualAddress.toLowerCase() !== config.expectedAddress.toLowerCase()) {
      service.reset();
      return paymentAuthHtml_('Wrong Google account', 'Please authorize ' + config.expectedAddress + ' instead.');
    }

    config.props.setProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS', actualAddress);
    config.props.setProperty('PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID', config.clientId);
    return paymentAuthHtml_('Authorization complete', 'The payment mailbox was verified. You may close this window.');
  } catch (error) {
    service.reset();
    config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS');
    config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID');
    return paymentAuthHtml_('Authorization verification failed', 'Please generate a new link and try again.');
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.getPaymentGmailAuthStatus = getPaymentGmailAuthStatus;
  globalThis.getPaymentGmailAuthorizationUrl = getPaymentGmailAuthorizationUrl;
  globalThis.resetPaymentGmailAuthorization = resetPaymentGmailAuthorization;
  globalThis.paymentGmailAuthCallback = paymentGmailAuthCallback;
  globalThis.__kinfusionPaymentGmailAuth = { paymentGmailFetch_: paymentGmailFetch_ };
}
