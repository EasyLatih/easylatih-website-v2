// Navigation for the public marketing pages. Other portals keep their own scripts.
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navMenu');
  if (!toggle || !menu) return;
  const setOpen = (open) => {
    menu.classList.toggle('show', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('nav')) setOpen(false);
  });
  window.matchMedia('(max-width: 1280px)').addEventListener('change', () => setOpen(false));
});


const EASYLATIH_PUBLIC_DATA_ENDPOINT = 'https://script.google.com/a/macros/easylatih.my/s/AKfycbw1PRE_G3xUUc9WEAOX6m2bAAJ4yvtY3ghMihC4dxGVfsT6JwPjIyJl_VhPdihGA3c/exec';

function formatImpactNumber(value) {
  return Number(value || 0).toLocaleString('en-MY');
}

function animateImpactNumber(el, target) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    el.textContent = formatImpactNumber(target);
    return;
  }
  const duration = 1200;
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatImpactNumber(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderImpactStats(rows) {
  const section = document.getElementById('impact');
  const holder = document.getElementById('impactStats');
  if (!section || !holder || !Array.isArray(rows)) return;

  const byKey = new Map(
    rows
      .filter(row => row && row.metricKey)
      .map(row => [String(row.metricKey).trim().toUpperCase(), row])
  );

  let populated = 0;
  holder.querySelectorAll('[data-impact-key]').forEach(card => {
    const row = byKey.get(String(card.dataset.impactKey || '').toUpperCase());
    const value = Number(row?.value);
    if (!Number.isFinite(value) || value <= 0) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    const label = card.querySelector('.impact-label');
    if (label && row?.label) label.textContent = String(row.label);
    card.dataset.impactTarget = String(Math.round(value));
    populated += 1;
  });

  if (!populated) return;
  section.classList.remove('hidden');

  const startAnimation = () => {
    holder.querySelectorAll('[data-impact-target]').forEach(card => {
      const number = card.querySelector('[data-impact-value]');
      const target = Number(card.dataset.impactTarget || 0);
      if (number && target > 0 && !number.dataset.animated) {
        number.dataset.animated = '1';
        animateImpactNumber(number, target);
      }
    });
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        startAnimation();
      }
    }, { threshold: 0.25 });
    observer.observe(section);
  } else {
    startAnimation();
  }
}

function loadImpactStats() {
  if (!document.getElementById('impactStats')) return;
  const callbackName = 'easyLatihImpactStats_' + Date.now();
  const script = document.createElement('script');
  let settled = false;

  const cleanup = () => {
    if (settled) return;
    settled = true;
    delete window[callbackName];
    script.remove();
  };

  window[callbackName] = data => {
    try {
      renderImpactStats(Array.isArray(data) ? data : (data?.stats || []));
    } finally {
      cleanup();
    }
  };

  script.onerror = cleanup;
  script.src = EASYLATIH_PUBLIC_DATA_ENDPOINT +
    '?action=getImpactStats&callback=' + encodeURIComponent(callbackName) +
    '&_=' + Date.now();
  document.body.appendChild(script);

  setTimeout(cleanup, 8000);
}

document.addEventListener('DOMContentLoaded', loadImpactStats);
