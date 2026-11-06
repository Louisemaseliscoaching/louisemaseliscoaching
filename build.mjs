// build.mjs — génère le site publié dans dist/
//
// Les textes modifiables depuis /admin sont stockés dans content/*.json.
// Ce script les inscrit directement dans le HTML au moment de la publication,
// pour que Google, Bing et les assistants IA les lisent sans exécuter de JavaScript.
// Aucune dépendance : Netlify lance simplement `node build.mjs`.

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = 'dist';

// Fichiers et dossiers publiés tels quels (tout le reste du dépôt reste privé).
const COPY = [
  'site.css',
  '_redirects',
  'robots.txt',
  'sitemap.xml',
  '404.html',
  'favicon.ico',
  'icon.svg',
  'apple-touch-icon.png',
  'site.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'cabinet.webp',
  'cabinet-800.webp',
  'og-image.jpg',
  'cabinet-v3.jpg',
  'admin/index.html',
  'admin/config.yml',
  'content',
  'images',
];

const PAGES = [
  { src: 'index.html', out: 'index.html', lang: 'fr' },
  { src: 'nl.html', out: 'nl.html', lang: 'nl' },
];

// ---------- outils ----------

const readJSON = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Trouve la fin d'un élément (balise fermante correspondante), en tenant compte des imbrications.
function elementEnd(html, openStart, tag) {
  const openEnd = html.indexOf('>', openStart) + 1;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = openEnd;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] === '/') depth--;
    else if (!m[0].endsWith('/>')) depth++;
    if (depth === 0) return { openEnd, closeStart: m.index, closeEnd: re.lastIndex };
  }
  throw new Error(`Balise <${tag}> non fermée à la position ${openStart}`);
}

// Applique fn à chaque élément portant l'attribut attr="value".
// fn reçoit { openTag, inner } et renvoie { openTag, inner } modifiés.
function mapElements(html, attr, value, fn) {
  const re = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\s${attr}="${value}"[^>]*>`, 'g');
  let out = '';
  let pos = 0;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1];
    const { openEnd, closeStart, closeEnd } = elementEnd(html, m.index, tag);
    const res = fn({ openTag: html.slice(m.index, openEnd), inner: html.slice(openEnd, closeStart) });
    out += html.slice(pos, m.index) + res.openTag + res.inner + html.slice(closeStart, closeEnd);
    pos = closeEnd;
    re.lastIndex = closeEnd;
  }
  return out + html.slice(pos);
}

const setText = (html, attr, value, text) =>
  mapElements(html, attr, value, ({ openTag }) => ({ openTag, inner: esc(text) }));

const setHref = (html, attr, value, href) =>
  mapElements(html, attr, value, ({ openTag, inner }) => ({
    openTag: openTag.replace(/\shref="[^"]*"/, ` href="${esc(href)}"`),
    inner,
  }));

// ---------- remplissage ----------

function applyFields(html, data) {
  if (!data) return html;
  for (const [key, val] of Object.entries(data)) {
    if (val) html = setText(html, 'data-field', key, val);
  }
  return html;
}

function applyContact(html, c) {
  if (!c) return html;
  if (c.email) {
    html = setText(html, 'data-contact', 'email', c.email);
    html = setHref(html, 'data-contact', 'email-link', 'mailto:' + c.email);
  }
  if (c.phone) {
    html = setText(html, 'data-contact', 'phone', c.phone);
    html = setHref(html, 'data-contact', 'phone-link', 'tel:' + c.phone.replace(/\s+/g, ''));
  }
  if (c.address) html = setText(html, 'data-contact', 'address', c.address);
  if (c.website) {
    html = setText(html, 'data-contact', 'website', c.website);
    html = setHref(html, 'data-contact', 'website-link', 'https://' + c.website.replace(/^https?:\/\//, ''));
  }
  if (c.instagram) {
    const ig = c.instagram.replace(/^@/, '');
    html = setText(html, 'data-contact', 'instagram', '@' + ig);
    html = setHref(html, 'data-contact', 'instagram-link', 'https://instagram.com/' + ig);
  }
  return html;
}

function applyTestimonials(html, data) {
  if (!data || !Array.isArray(data.items) || !data.items.length) return html;
  const colors = ['var(--accent)', 'var(--sage)', 'var(--accent)'];
  const cards = data.items
    .map(
      (item, i) => `
      <figure class="testimonial" style="margin:0; background:var(--white); border:1px solid var(--line); border-radius:10px; padding:var(--s-4); display:flex; flex-direction:column; gap:var(--s-3);">
        <blockquote class="quote" style="font-size:22px; border-left-color:${colors[i % colors.length]};">${esc(item.quote || '')}</blockquote>
        <figcaption style="display:flex; align-items:center; gap:12px; padding-top:var(--s-2); border-top:1px solid var(--line);">
          <div style="width:42px; height:42px; border-radius:50%; background:var(--argile-2); flex-shrink:0;" aria-hidden="true"></div>
          <div>
            <div style="font-family:var(--sans); font-weight:700; font-size:14px;">${esc((item.author || '').trim())}</div>
            <div style="font-size:13px; color:var(--ink-soft);">${esc(item.context || '')}</div>
          </div>
        </figcaption>
      </figure>`
    )
    .join('');
  return mapElements(html, 'id', 'testimonial-cards', ({ openTag }) => ({ openTag, inner: cards + '\n    ' }));
}

// ---------- build ----------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const contact = readJSON('content/contact.json');

for (const page of PAGES) {
  let html = readFileSync(page.src, 'utf8');
  html = applyFields(html, readJSON(`content/site-${page.lang}.json`));
  html = applyTestimonials(html, readJSON(`content/temoignages-${page.lang}.json`));
  html = applyContact(html, contact);
  writeFileSync(join(OUT, page.out), html);
  console.log(`✓ ${page.out} généré (${page.lang})`);
}

for (const p of COPY) {
  if (!existsSync(p)) continue;
  mkdirSync(dirname(join(OUT, p)), { recursive: true });
  cpSync(p, join(OUT, p), { recursive: true });
}
console.log('✓ fichiers statiques copiés dans dist/');
