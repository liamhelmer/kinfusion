// Hero image slideshow — rotates every 90 seconds with a 2-second cross-fade.
// No-op when fewer than 2 slides exist or when prefers-reduced-motion is set.
(function () {
  const slides = document.querySelectorAll('.hero-slide');
  if (slides.length < 2) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let current = 0;
  setInterval(() => {
    slides[current].classList.remove('is-active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('is-active');
  }, 90000);
}());
