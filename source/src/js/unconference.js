import { initForm } from './form-handler.js';

const form = document.getElementById('unconference-form');
initForm(form, {
  formName: 'unconference',
  onSuccess: ({ refCode }) => {
    const p = document.createElement('p');
    p.textContent = 'Proposal received! Your reference code is ';
    const strong = document.createElement('strong');
    strong.textContent = refCode;
    p.appendChild(strong);
    p.appendChild(document.createTextNode('. We\'ll be in touch before the event.'));
    form.replaceWith(p);
  },
});
