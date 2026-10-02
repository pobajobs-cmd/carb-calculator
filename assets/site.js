// Kylo Loki — shared nav + footer.
// Every page has <header class="site-nav" id="siteNav"></header> at the top and
// <footer class="site-footer" id="siteFooter"></footer> at the bottom; this fills them in.
// To add a new page to the menu, add one line to NAV_LINKS below — that's it.

const SITE_NAME = 'Kylo Loki';
const CONTACT_EMAIL = 'kylolokikll@gmail.com';

const NAV_LINKS = [
  { href: '/story/',          label: "Kylo's story" },
  { href: '/what-is-t1d/',    label: 'What is T1D?' },
  { href: '/carb-calculator/',label: 'Carb calculator' },
  { href: '/calendar/',       label: 'Calendar' },
  { href: '/podcast/',        label: 'Podcast' },
  { href: '/archive/',        label: 'Journal', also: ['/post/'] },
];

(function () {
  const path = location.pathname.replace(/index\.html$/, '');
  const isCurrent = (l) => path === l.href || (l.also || []).some(p => path.startsWith(p));

  const nav = document.getElementById('siteNav');
  if (nav) {
    nav.innerHTML = `
      <a class="brand" href="/">${SITE_NAME}</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="navLinks">
        <span class="bars"><span></span></span>Menu
      </button>
      <nav class="nav-links" id="navLinks" aria-label="Main">
        ${NAV_LINKS.map(l => `<a href="${l.href}"${isCurrent(l) ? ' aria-current="page"' : ''}>${l.label}</a>`).join('')}
      </nav>`;
    const toggle = nav.querySelector('.nav-toggle');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });
    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target)) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
  }

  const footer = document.getElementById('siteFooter');
  if (footer) {
    footer.innerHTML = `
      <div class="inner">
        <div>
          <div class="f-brand">${SITE_NAME}</div>
          <p>A family's journey with Type One Diabetes.</p>
          <p>Get in touch: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
          <p class="small">We're a family sharing our own experience, not medical professionals. Always follow the advice of your own diabetes team.</p>
          <p class="small">&copy; ${new Date().getFullYear()} ${SITE_NAME}</p>
        </div>
        <nav class="f-links" aria-label="Footer">
          <a href="/">Home</a>
          ${NAV_LINKS.map(l => `<a href="${l.href}">${l.label}</a>`).join('')}
        </nav>
      </div>`;
  }
})();
