// Main Apps Script entry point.
// doPost(e) is defined in gateway.js; all handler and shared functions are
// globally available in Apps Script V8 from their respective files after clasp push.
// This file intentionally minimal — structure lives in gateway.js and handlers/.

var KINFUSION_CONTROLLER_EMAIL = 'kinfusion.campout@gmail.com';

function assertController_() {
  var activeEmail = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (activeEmail !== KINFUSION_CONTROLLER_EMAIL) throw new Error('controller_access_required');
}

if (typeof globalThis !== 'undefined') {
  globalThis.__kinfusionController = { assertController_: assertController_ };
}
