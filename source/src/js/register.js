import { initForm } from './form-handler.js';

const form = document.getElementById('registration-form');
const childrenList = document.getElementById('children-list');
const addChildBtn = document.getElementById('add-child-btn');
const parentPhoneField = document.getElementById('parentPhoneField');
let childCount = 0;

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
      const ageInput = row.querySelector('input[name^="childAge_"]');
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
    const p = document.createElement('p');
    p.textContent = 'Application received! Your reference code is ';
    const strong = document.createElement('strong');
    strong.textContent = refCode;
    p.appendChild(strong);
    p.appendChild(document.createTextNode('. Watch for a confirmation email.'));
    form.replaceWith(p);
  },
});
