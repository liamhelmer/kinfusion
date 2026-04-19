import { initForm } from './form-handler.js';

const form = document.getElementById('registration-form');
initForm(form, {
  formName: 'register',
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
