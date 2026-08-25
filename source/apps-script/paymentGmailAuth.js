/** OAuth bridge for the separately owned payment Gmail mailbox. */

var PAYMENT_GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
var PAYMENT_GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
var PAYMENT_GMAIL_INVITE_DIGEST = 'PAYMENT_GMAIL_INVITE_DIGEST';
var PAYMENT_GMAIL_INVITE_EXPIRES_AT = 'PAYMENT_GMAIL_INVITE_EXPIRES_AT';
var PAYMENT_GMAIL_CALLBACK_DIGEST = 'PAYMENT_GMAIL_CALLBACK_DIGEST';
var PAYMENT_GMAIL_CALLBACK_EXPIRES_AT = 'PAYMENT_GMAIL_CALLBACK_EXPIRES_AT';
var PAYMENT_GMAIL_INVITE_TTL_MS = 30 * 60 * 1000;
var PAYMENT_GMAIL_CALLBACK_TTL_MS = 10 * 60 * 1000;

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

function paymentGmailDigest_(value) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  ).map(function (byte) {
    return (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0');
  }).join('');
}

function paymentGmailTokenValid_(token, props, digestKey, expiryKey) {
  token = String(token || '');
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) return false;
  var expectedDigest = props.getProperty(digestKey) || '';
  var expiresAt = Number(props.getProperty(expiryKey) || 0);
  if (!expectedDigest || !expiresAt || Date.now() > expiresAt) return false;
  var actualDigest = paymentGmailDigest_(token);
  if (actualDigest.length !== expectedDigest.length) return false;
  var difference = 0;
  for (var i = 0; i < actualDigest.length; i++) {
    difference |= actualDigest.charCodeAt(i) ^ expectedDigest.charCodeAt(i);
  }
  return difference === 0;
}

function paymentGmailInviteValid_(token, props) {
  return paymentGmailTokenValid_(token, props, PAYMENT_GMAIL_INVITE_DIGEST, PAYMENT_GMAIL_INVITE_EXPIRES_AT);
}

function paymentGmailCallbackValid_(token, props) {
  return paymentGmailTokenValid_(token, props, PAYMENT_GMAIL_CALLBACK_DIGEST, PAYMENT_GMAIL_CALLBACK_EXPIRES_AT);
}

function paymentGmailConsumeInvite_(props) {
  props.deleteProperty(PAYMENT_GMAIL_INVITE_DIGEST);
  props.deleteProperty(PAYMENT_GMAIL_INVITE_EXPIRES_AT);
}

function paymentGmailConsumeCallback_(props) {
  props.deleteProperty(PAYMENT_GMAIL_CALLBACK_DIGEST);
  props.deleteProperty(PAYMENT_GMAIL_CALLBACK_EXPIRES_AT);
}

function paymentGmailWithLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function paymentGmailService_(oauthState) {
  var config = paymentGmailConfiguration_();
  if (!paymentGmailIsConfigured_(config)) throw new Error('payment_gmail_not_configured');
  var redirectUri = ScriptApp.getService().getUrl();
  if (!redirectUri) throw new Error('payment_gmail_webapp_not_deployed');
  var service = OAuth2.createService('kinfusion-payment-gmail')
    .setAuthorizationBaseUrl('https://accounts.google.com/o/oauth2/v2/auth')
    .setTokenUrl('https://oauth2.googleapis.com/token')
    .setClientId(config.clientId)
    .setClientSecret(config.clientSecret)
    .setCallbackFunction('paymentGmailAuthCallback_')
    .setRedirectUri(redirectUri)
    .setPropertyStore(config.props)
    .setCache(CacheService.getScriptCache())
    .setLock(LockService.getScriptLock())
    .setScope(PAYMENT_GMAIL_SCOPE)
    .setParam('access_type', 'offline')
    .setParam('prompt', 'consent')
    .setParam('login_hint', config.expectedAddress);
  if (oauthState) service.setParam('state', oauthState);
  return service;
}

function getPaymentGmailAuthStatus() {
  assertController_();
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
    return base;
  }

  base.ok = true;
  base.authorized = paymentGmailBindingValid_(config);
  if (!base.authorized) base.error = 'authorized_account_unverified';
  return base;
}

function createPaymentGmailAuthorizationInvite() {
  assertController_();
  var config = paymentGmailConfiguration_();
  if (!paymentGmailIsConfigured_(config)) {
    return { ok: false, error: 'payment_gmail_not_configured' };
  }
  var token = Utilities.getUuid() + Utilities.getUuid();
  var expiresAt = Date.now() + PAYMENT_GMAIL_INVITE_TTL_MS;
  paymentGmailWithLock_(function () {
    config.props.setProperty(PAYMENT_GMAIL_INVITE_DIGEST, paymentGmailDigest_(token));
    config.props.setProperty(PAYMENT_GMAIL_INVITE_EXPIRES_AT, String(expiresAt));
    paymentGmailConsumeCallback_(config.props);
  });
  return {
    ok: true,
    expectedAddress: config.expectedAddress,
    inviteToken: token,
    expiresAt: expiresAt,
  };
}

function startPaymentGmailAuthorization(inviteToken) {
  var config = paymentGmailConfiguration_();
  if (!paymentGmailIsConfigured_(config)) {
    return { ok: false, error: 'payment_gmail_not_configured' };
  }
  var callbackToken = Utilities.getUuid() + Utilities.getUuid();
  var callbackReady = paymentGmailWithLock_(function () {
    if (!paymentGmailInviteValid_(inviteToken, config.props)) return false;
    paymentGmailConsumeInvite_(config.props);
    config.props.setProperty(PAYMENT_GMAIL_CALLBACK_DIGEST, paymentGmailDigest_(callbackToken));
    config.props.setProperty(PAYMENT_GMAIL_CALLBACK_EXPIRES_AT, String(Date.now() + PAYMENT_GMAIL_CALLBACK_TTL_MS));
    return true;
  });
  if (!callbackReady) {
    return { ok: false, error: 'authorization_invite_expired' };
  }
  return {
    ok: true,
    expectedAddress: config.expectedAddress,
    authorizationUrl: paymentGmailService_(callbackToken).getAuthorizationUrl(),
  };
}

function resetPaymentGmailAuthorization() {
  assertController_();
  var config = paymentGmailConfiguration_();
  if (paymentGmailIsConfigured_(config)) paymentGmailService_().reset();
  config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS');
  config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID');
  paymentGmailConsumeInvite_(config.props);
  paymentGmailConsumeCallback_(config.props);
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
    return { ok: false, error: 'authorization_required' };
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

function paymentGmailConnectionHtml_(expectedAddress, inviteToken) {
  var escape = function (value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  };
  var tokenJson = JSON.stringify(String(inviteToken))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Connect payment mailbox</title>' +
    '<style>body{font:16px system-ui,sans-serif;max-width:38rem;margin:4rem auto;padding:0 1.25rem;line-height:1.5}' +
    'button{font:inherit;padding:.7rem 1rem;cursor:pointer}#status{margin-top:1rem}</style>' +
    '<main><h1>Connect payment mailbox</h1><p>Authorize <strong>' + escape(expectedAddress) + '</strong> ' +
    'for KinFusion payment reconciliation.</p><button id="connect" type="button">Continue with Google</button>' +
    '<p id="status" role="status"></p></main><script>' +
    'document.getElementById("connect").addEventListener("click",function(){' +
    'var button=this,status=document.getElementById("status"),popup=window.open("about:blank","_blank");' +
    'button.disabled=true;status.textContent="Preparing secure authorization…";' +
    'google.script.run.withSuccessHandler(function(result){' +
    'if(result&&result.ok&&result.authorizationUrl){popup.location=result.authorizationUrl;status.textContent="Continue in the Google window.";}' +
    'else{if(popup)popup.close();button.disabled=false;status.textContent="This invitation expired. Ask for a new link.";}' +
    '}).withFailureHandler(function(){if(popup)popup.close();button.disabled=false;status.textContent="Authorization could not be started.";})' +
    '.startPaymentGmailAuthorization(' + tokenJson + ');});</script>'
  );
}

function doGet(request) {
  var parameters = request && request.parameter ? request.parameter : {};
  if (parameters.state && (parameters.code || parameters.error)) {
    return paymentGmailAuthCallback_(request);
  }
  var config = paymentGmailConfiguration_();
  if (parameters.paymentAuth !== '1' || !paymentGmailIsConfigured_(config) ||
      !paymentGmailInviteValid_(parameters.invite, config.props)) {
    return paymentAuthHtml_('Authorization link expired', 'Ask the KinFusion organizer for a new mailbox connection link.');
  }
  return paymentGmailConnectionHtml_(config.expectedAddress, parameters.invite);
}

function paymentGmailAuthCallback_(request) {
  var config = paymentGmailConfiguration_();
  if (!paymentGmailIsConfigured_(config)) {
    return paymentAuthHtml_('Authorization unavailable', 'The payment mailbox is not configured.');
  }
  var callbackToken = request && request.parameter ? request.parameter.state : '';
  var callbackClaimed = paymentGmailWithLock_(function () {
    if (!paymentGmailCallbackValid_(callbackToken, config.props)) return false;
    paymentGmailConsumeCallback_(config.props);
    return true;
  });
  if (!callbackClaimed) {
    return paymentAuthHtml_('Authorization link expired', 'Ask the KinFusion organizer for a new mailbox connection link.');
  }
  var service = paymentGmailService_();
  try {
    if (!service.handleCallback(request)) {
      return paymentAuthHtml_('Authorization was not completed', 'No mailbox access was stored.');
    }
  } catch (error) {
    return paymentAuthHtml_('Authorization verification failed', 'Please generate a new link and try again.');
  }

  config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS');
  config.props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID');
  try {
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
  globalThis.createPaymentGmailAuthorizationInvite = createPaymentGmailAuthorizationInvite;
  globalThis.startPaymentGmailAuthorization = startPaymentGmailAuthorization;
  globalThis.resetPaymentGmailAuthorization = resetPaymentGmailAuthorization;
  globalThis.doGet = doGet;
  globalThis.__kinfusionPaymentGmailAuth = {
    paymentGmailFetch_: paymentGmailFetch_,
    paymentGmailAuthCallback_: paymentGmailAuthCallback_,
  };
}
