import { initForm } from './form-handler.js';

const form = document.getElementById('registration-form');
const childrenList = document.getElementById('children-list');
const addChildBtn = document.getElementById('add-child-btn');
const parentPhoneField = document.getElementById('parentPhoneField');
let childCount = 0;

const ARRIVAL_DAY_NUMS = { thursday: 0, friday: 1, saturday: 2 };
const LEAVING_DAY_NUMS  = { sunday: 3, monday: 4 };
const ACCOMMODATION_RATES = {
  camping: 0,
  'kdol-single': 75,
  'kdol-double': 95,
  'preset-tent': 65,
  'geodesic-dome': 120,
};
const ACCOMMODATION_LABELS = {
  camping: 'General camping',
  'kdol-single': 'KDOL cabin — single',
  'kdol-double': 'KDOL cabin — two people',
  'preset-tent': 'Pre-set tent (on-site)',
  'geodesic-dome': 'Geodesic dome',
};
const TIER_LABELS = {
  300: 'Community/solidarity rate',
  350: 'Standard rate',
  400: 'Sustainer rate',
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtCad(n) {
  return 'CAD\u00a0$' + n.toFixed(2);
}

function calcPricing(tier, accommodation, arrivalDay, leavingDay) {
  const nights = LEAVING_DAY_NUMS[leavingDay] - ARRIVAL_DAY_NUMS[arrivalDay];
  const rate = ACCOMMODATION_RATES[accommodation] || 0;
  const accommodationCost = rate * nights;
  const subtotalCents = (tier + accommodationCost) * 100;
  const gstCents = Math.round(subtotalCents * 0.05);
  return {
    nights,
    accommodationCost,
    subtotal: (tier + accommodationCost),
    gst: gstCents / 100,
    total: (subtotalCents + gstCents) / 100,
  };
}

function buildConfirmation(refCode, name, tier, accommodation, arrivalDay, leavingDay) {
  const p = calcPricing(tier, accommodation, arrivalDay, leavingDay);
  const accLabel = esc(ACCOMMODATION_LABELS[accommodation] || accommodation);
  const tierLabel = esc(TIER_LABELS[tier] || ('$' + tier));
  const isCamping = accommodation === 'camping';

  const accRow = isCamping ? '' : `
      <tr>
        <td>${accLabel} &times; ${p.nights} night${p.nights !== 1 ? 's' : ''}</td>
        <td>${fmtCad(p.accommodationCost)}</td>
      </tr>`;

  const accIncluded = isCamping
    ? 'General camping (tent or car)'
    : `${accLabel} &times; ${p.nights} night${p.nights !== 1 ? 's' : ''}`;

  const accNote = isCamping ? '' : `
    <p class="field-help">Your accommodation preference has been noted. We'll connect you with Rhizome Springs to confirm and arrange payment.</p>`;

  const div = document.createElement('div');
  div.innerHTML = `
    <h2>Application submitted</h2>
    <p>Thank you${name ? ', ' + esc(name) : ''}. Your application for <strong>Kin-Fusion Campout 2026</strong> has been received and a confirmation email is on its way.</p>
    <p><strong>Reference code:</strong> <code>${esc(refCode)}</code></p>

    <div class="notice">
      <p><strong>This is an application, not a confirmed spot.</strong> Organizers will review applications and reach out. Please wait for an acceptance email before sending payment.</p>
    </div>

    <h2>Payment summary</h2>
    <table class="payment-table">
      <tbody>
        <tr>
          <td>Registration &mdash; ${tierLabel}</td>
          <td>${fmtCad(tier)}</td>
        </tr>${accRow}
        <tr class="subtotal-row">
          <td>Subtotal</td>
          <td>${fmtCad(p.subtotal)}</td>
        </tr>
        <tr>
          <td>GST (5%)</td>
          <td>${fmtCad(p.gst)}</td>
        </tr>
        <tr class="total-row">
          <td><strong>Total</strong></td>
          <td><strong>${fmtCad(p.total)}</strong></td>
        </tr>
      </tbody>
    </table>

    <h2>What&rsquo;s included</h2>
    <ul>
      <li>${accIncluded}</li>
      <li>3 meals per day (breakfast, lunch, dinner) on Friday, Saturday, and Sunday</li>
      <li>No meals on Thursday or Monday</li>
      <li>Nightly dances</li>
    </ul>
    ${accNote}

    <h2>How to pay</h2>
    <p>Once your application is accepted, send your payment using one of the options below. Include your reference code <strong>${esc(refCode)}</strong> in the message.</p>

    <h3>Canadian residents &mdash; Interac e-Transfer</h3>
    <p>
      Send to: <strong>info@rhizomesprings.com</strong><br>
      Password: <strong>RHIZOME</strong><br>
      Amount: <strong>${fmtCad(p.total)}</strong>
    </p>

    <h3>US / International &mdash; Wise</h3>
    <p>Pay at: <a href="https://wise.com/pay/me/selenal40" target="_blank" rel="noopener">wise.com/pay/me/selenal40</a></p>

    <h2>Practical information</h2>
    <p>Directions, ferry schedules, what to bring, and on-site facilities: <a href="/site-info/">kinfusion.dance/site-info/</a></p>
    <p>Questions? Email <a href="mailto:hello@kinfusion.dance">hello@kinfusion.dance</a>.</p>`;
  return div;
}

function updateParentPhoneVisibility() {
  const hasChildren = childrenList.querySelectorAll('.child-row').length > 0;
  parentPhoneField.hidden = !hasChildren;
  const phoneInput = document.getElementById('parentPhone');
  if (hasChildren) {
    phoneInput.setAttribute('required', '');
    phoneInput.setAttribute('aria-required', 'true');
  } else {
    phoneInput.removeAttribute('required');
    phoneInput.removeAttribute('aria-required');
  }
}

function addChild() {
  const idx = childCount++;
  const row = document.createElement('div');
  row.className = 'child-row';
  row.innerHTML = `
    <div class="child-fields">
      <div class="field">
        <label for="childName_${idx}">Name</label>
        <input type="text" id="childName_${idx}" name="childName_${idx}"
               required aria-required="true" maxlength="100" autocomplete="off">
      </div>
      <div class="field">
        <label for="childAge_${idx}">Age</label>
        <input type="number" id="childAge_${idx}" name="childAge_${idx}"
               required aria-required="true" min="0" max="12" autocomplete="off">
      </div>
      <button type="button" class="btn-remove-child" aria-label="Remove this child">&times;</button>
    </div>`;
  row.querySelector('.btn-remove-child').addEventListener('click', () => {
    row.remove();
    updateParentPhoneVisibility();
  });
  childrenList.appendChild(row);
  updateParentPhoneVisibility();
  row.querySelector('input').focus();
}

addChildBtn.addEventListener('click', addChild);

initForm(form, {
  formName: 'register',
  transformBody(formEl, body) {
    const rows = formEl.querySelectorAll('.child-row');
    const children = Array.from(rows).map(row => {
      const nameInput = row.querySelector('input[name^="childName_"]');
      const ageInput  = row.querySelector('input[name^="childAge_"]');
      const age = parseInt(ageInput.value, 10);
      return { name: nameInput.value, age: isNaN(age) ? 0 : age };
    });
    const cleaned = {};
    for (const key of Object.keys(body)) {
      if (!key.startsWith('childName_') && !key.startsWith('childAge_')) {
        cleaned[key] = body[key];
      }
    }
    cleaned.children = children;
    return cleaned;
  },
  onSuccess: ({ refCode }) => {
    const tier = parseInt(form.querySelector('input[name="tier"]:checked')?.value || '350', 10);
    const accommodation = form.querySelector('input[name="accommodation"]:checked')?.value || 'camping';
    const arrivalDay = form.querySelector('#arrivalDay')?.value || 'friday';
    const leavingDay = form.querySelector('#leavingDay')?.value || 'sunday';
    const fullName = form.querySelector('#fullName')?.value || '';
    const firstName = fullName.split(' ')[0];
    const div = buildConfirmation(refCode, firstName, tier, accommodation, arrivalDay, leavingDay);
    form.replaceWith(div);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
});
