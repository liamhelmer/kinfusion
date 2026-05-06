import { initForm } from './form-handler.js';

const form = document.getElementById('dj-form');
initForm(form, {
  formName: 'dj-signup',
  onSuccess: () => {
    const p = document.createElement('p');
    p.textContent = 'Signup received! We\'ll be in touch by July 10th (at the latest) regarding your application.';
    form.replaceWith(p);
  },
});
