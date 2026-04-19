import { initForm } from './form-handler.js';

const form = document.getElementById('dj-form');
initForm(form, {
  formName: 'dj-signup',
  onSuccess: ({ refCode }) => {
    const p = document.createElement('p');
    p.textContent = 'Signup received! Your reference code is ';
    const strong = document.createElement('strong');
    strong.textContent = refCode;
    p.appendChild(strong);
    p.appendChild(document.createTextNode('. We\'ll be in touch about the schedule.'));
    form.replaceWith(p);
  },
});
