// Header background on scroll
const header = document.getElementById('header');
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 20);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Mobile navigation
const burger = document.getElementById('burger');
const nav = document.getElementById('nav');
const setNav = (open) => {
  nav.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
};
burger.addEventListener('click', () => setNav(!nav.classList.contains('is-open')));
nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setNav(false)));

// Reveal sections on scroll
if ('IntersectionObserver' in window) {
  const targets = document.querySelectorAll('.intro, .card, .split > *, .steps li, .gallery li, .plan, .timeline li, .faq__list, .culture > *');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  targets.forEach((el) => { el.classList.add('reveal'); io.observe(el); });
}

// Contact form -> pre-filled e-mail (static hosting, no backend)
document.getElementById('contact-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const d = new FormData(e.target);
  const subject = `Pilotpartner-Anfrage: ${d.get('company')}`;
  const body = [
    `Name: ${d.get('name')}`,
    `Unternehmen: ${d.get('company')}`,
    `E-Mail: ${d.get('email')}`,
    `Teamgröße: ${d.get('size')}`,
    '',
    d.get('message') || '',
  ].join('\n');
  window.location.href = `mailto:bernhard.strasser@ticket-roof.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
