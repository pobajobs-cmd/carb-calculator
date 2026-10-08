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

// ---- Charity stream ticker (top of every page) ----
// When the date is set, put it here, e.g. '2026-11-14T10:00' (UK time). Leave '' while it's TBA.
// It counts down, says "Live now" during the stream, and disappears on its own after November.
const STREAM_START = '';
const STREAM_POST = '/post/?slug=2026-10-08';
(function () {
  const now = () => new Date();
  if (now() >= new Date('2026-12-01T00:00:00')) return;
  const start = STREAM_START ? new Date(STREAM_START) : null;
  const pad = n => String(n).padStart(2, '0');
  function countdown() {
    const t = now();
    if (start) {
      const ms = start - t;
      if (ms <= 0 && t - start < 24 * 3600e3) return 'Live now on Twitch';
      if (ms <= 0) return 'Thank you for your support';
      const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
      return `Starts in ${d}d ${pad(h)}h ${pad(m)}m`;
    }
    const d = Math.ceil((new Date('2026-11-01T00:00:00') - t) / 864e5);
    return d > 0 ? `${d} day${d === 1 ? '' : 's'} until November` : 'Date announced soon';
  }
  const bar = document.createElement('a');
  bar.className = 'ticker';
  bar.href = (start && now() >= start) ? 'https://www.twitch.tv/pobajobs' : STREAM_POST;
  bar.setAttribute('aria-label', '24-hour charity stream for Breakthrough T1D, coming November 2026. Read more.');
  bar.innerHTML = '<span class="flag">Coming soon</span><span class="lane" aria-hidden="true"><span class="track"></span></span>';
  const track = bar.querySelector('.track');
  function build() {
    const items = [`<span class="hot">${countdown()}</span>`, '24-hour charity stream', 'Raising money for Breakthrough T1D',
      'Diabetes Awareness Month', start ? start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Date to be confirmed', 'Live on Twitch with pobajobs'];
    const grp = '<span class="grp">' + items.map(x => (x.startsWith('<') ? x : `<span>${x}</span>`) + '<i>&#9679;</i>').join('') + '</span>';
    const half = grp.repeat(3);
    track.innerHTML = half + half;
  }
  build();
  document.body.prepend(bar);
  setInterval(build, 60000);
})();
