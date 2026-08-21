import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = 'https://www.easylatih.my';
const DEFAULT_IMAGE = `${BASE}/assets/hero_image.png`;

const pages = {
  'index.html': {
    url: '/',
    title: 'HRD Corp Training Provider Malaysia | EasyLatih',
    description: 'EasyLatih is an HRD Corp Registered Training Provider in Kuantan offering public training, in-house training, customised programmes and practical workplace upskilling across Malaysia.',
    image: DEFAULT_IMAGE,
    schema: true
  },
  'courses.html': {
    url: '/courses.html',
    title: 'HRD Corp Training Courses Malaysia | EasyLatih',
    description: 'Explore EasyLatih training courses in HR, finance, leadership, digital skills, customer service and workplace compliance for public, in-house and customised training in Malaysia.',
    image: DEFAULT_IMAGE
  },
  'room-rental.html': {
    url: '/room-rental.html',
    title: 'Training Room Rental Kuantan | EasyLatih Training Venue',
    description: 'Rent a training room in Kuantan at EasyLatih, Bandar Indera Mahkota. Suitable for training, workshops and meetings with Wi-Fi, projector, sound system and classroom seating.',
    image: `${BASE}/assets/room1.JPG`
  },
  'schedule.html': {
    url: '/schedule.html',
    title: 'Training Schedule Malaysia | HRD Corp Courses | EasyLatih',
    description: 'View upcoming EasyLatih training programmes, dates, venues, trainer information and registration links for public and HRD Corp claimable training in Malaysia.',
    image: `${BASE}/assets/public_training.png`
  },
  'blog.html': {
    url: '/blog.html',
    title: 'HRD Corp Claimable Courses Malaysia | EasyLatih Guide',
    description: 'Learn how HRD Corp claimable courses work, what employers may claim and how registered training providers support workforce upskilling in Malaysia.',
    image: DEFAULT_IMAGE
  }
};

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function replaceTitle(html, title) {
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(title)}</title>`);
  }
  return html.replace(/<head>/i, `<head>\n<title>${escapeAttr(title)}</title>`);
}

function removeTag(html, regex) {
  return html.replace(regex, '');
}

function seoBlock(page) {
  const canonical = `${BASE}${page.url}`;
  return [
    `<meta name="description" content="${escapeAttr(page.description)}">`,
    '<meta name="robots" content="index,follow,max-image-preview:large">',
    `<link rel="canonical" href="${canonical}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="en_MY">',
    '<meta property="og:site_name" content="EasyLatih">',
    `<meta property="og:title" content="${escapeAttr(page.title)}">`,
    `<meta property="og:description" content="${escapeAttr(page.description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${page.image}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeAttr(page.title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(page.description)}">`,
    `<meta name="twitter:image" content="${page.image}">`
  ].join('\n');
}

function orgSchema() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'EasyLatih',
    legalName: 'Easy Latih Consultancy',
    url: `${BASE}/`,
    logo: `${BASE}/assets/logo.png`,
    description: 'HRD Corp Registered Training Provider offering public, in-house and customised workplace training programmes in Malaysia.',
    email: 'sales@easylatih.my',
    telephone: '+60 9 560 4273',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'B62, Tingkat 1, Jalan IM 7/1, Bandar Indera Mahkota 6',
      postalCode: '25200',
      addressLocality: 'Kuantan',
      addressRegion: 'Pahang',
      addressCountry: 'MY'
    },
    sameAs: [
      'https://www.facebook.com/EasyLatih/',
      'https://www.instagram.com/easylatih/',
      'https://my.linkedin.com/company/easylatih',
      'https://www.youtube.com/channel/UCQ2aaTN9fwSkmpjN5cC6O2w',
      'https://www.tiktok.com/@easylatih'
    ]
  };
  return `<script id="easylatih-org-schema" type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function hardenHtml(html, page) {
  html = replaceTitle(html, page.title);

  // Remove SEO tags previously added manually or by this script, then insert one clean set.
  const patterns = [
    /\s*<meta\s+name=["']description["'][^>]*>\s*/gi,
    /\s*<meta\s+name=["']robots["'][^>]*>\s*/gi,
    /\s*<link\s+rel=["']canonical["'][^>]*>\s*/gi,
    /\s*<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi,
    /\s*<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi,
    /\s*<script\s+id=["']easylatih-org-schema["'][\s\S]*?<\/script>\s*/gi
  ];
  for (const pattern of patterns) html = removeTag(html, pattern);

  const block = `${seoBlock(page)}${page.schema ? `\n${orgSchema()}` : ''}`;
  html = html.replace(/<\/head>/i, `${block}\n</head>`);

  // Keep one canonical home URL internally instead of splitting signals between / and index.html.
  html = html.replace(/href=["'](?:\.\/)?index\.html["']/gi, 'href="/"');
  return html;
}

async function updatePages() {
  let changed = 0;
  for (const [file, page] of Object.entries(pages)) {
    const target = path.join(ROOT, file);
    const before = await fs.readFile(target, 'utf8');
    const after = hardenHtml(before, page);
    if (after !== before) {
      await fs.writeFile(target, after, 'utf8');
      changed += 1;
    }
  }
  return changed;
}

async function writeRobots() {
  const content = `User-agent: *\nAllow: /\nDisallow: /internal/\n\nSitemap: ${BASE}/sitemap.xml\n`;
  await fs.writeFile(path.join(ROOT, 'robots.txt'), content, 'utf8');
}

async function writeSitemap() {
  const urls = Object.values(pages).map(page => `${BASE}${page.url}`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`;
  await fs.writeFile(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
}

const changed = await updatePages();
await writeRobots();
await writeSitemap();
console.log(`EasyLatih SEO hardening complete: ${changed} HTML page(s) updated.`);
