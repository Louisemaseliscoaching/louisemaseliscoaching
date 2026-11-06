// build.mjs — génère le site publié dans dist/
//
// Les textes modifiables depuis /admin sont stockés dans content/*.json.
// Ce script les inscrit directement dans le HTML au moment de la publication,
// pour que Google, Bing et les assistants IA les lisent sans exécuter de JavaScript.
// Aucune dépendance : Netlify lance simplement `node build.mjs`.

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = 'dist';

// Fichiers et dossiers publiés tels quels (tout le reste du dépôt reste privé).
const COPY = [
  'site.css',
  'robots.txt',
  '404.html',
  'favicon.ico',
  'icon.svg',
  'apple-touch-icon.png',
  'site.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'cabinet.webp',
  'cabinet-800.webp',
  'louise.webp',
  'louise-600.webp',
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

// Langue de la page en cours : en français, espace insécable avant : ; ! ? » et après «,
// pour que la ponctuation ne passe jamais seule en début de ligne.
let LANG = 'fr';
const frTypo = (s) => s.replace(/ ([:;!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');

const esc = (s) => {
  const out = String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return LANG === 'fr' ? frTypo(out) : out;
};

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


// ---------- textes communs des pages générées ----------

const SITE = 'https://louisemaseliscoaching.be';
const CAL = 'https://calendly.com/louisemaselis';
const TODAY = new Date().toISOString().slice(0, 10);

const T = {
  fr: {
    htmlLang: 'fr-BE', ogLocale: 'fr_BE', home: '/', homeLabel: 'Accueil',
    book: 'Réserver un premier entretien', write: 'Ou écrivez-moi', contact: '/#contact',
    how: "Comment se passe l'accompagnement", where: 'Au cabinet, avenue Molière 278 à Uccle, ou en visio · en français ou en néerlandais',
    hours: 'Horaires du cabinet : lun.–jeu. 19 h–21 h · ven. 8 h 30–14 h',
    cabinet: 'En cabinet à Uccle', visio: 'En visio',
    themes: 'Les accompagnements', other: "D'autres accompagnements",
    themesIntro: 'Découvrir les accompagnements :',
    ctaTitle: "Envie d'en parler ?",
    ctaText: "Le premier pas, c'est souvent d'oser en parler. Réservez un premier entretien ou écrivez-moi : je vous réponds personnellement.",
    articles: 'Articles', articlesPath: '/articles', articlesIntro: 'Des réflexions pour avancer, sur les questions que se posent les personnes que j’accompagne.',
    read: "Lire l'article", published: 'Publié le',
    serviceType: 'Coaching de vie',
  },
  nl: {
    htmlLang: 'nl-BE', ogLocale: 'nl_BE', home: '/nl', homeLabel: 'Home',
    book: 'Reserveer een eerste gesprek', write: 'Of stuur me een bericht', contact: '/nl#contact',
    how: 'Hoe verloopt de begeleiding', where: 'In de praktijk, Molièrelaan 278 in Ukkel, of online · in het Nederlands of het Frans',
    hours: 'Openingsuren praktijk: ma–do 19–21 u · vr 8.30–14 u',
    cabinet: 'In de praktijk in Ukkel', visio: 'Online',
    themes: 'Begeleidingen', other: 'Andere begeleidingen',
    themesIntro: 'Ontdek de begeleidingen:',
    ctaTitle: 'Zin om erover te praten?',
    ctaText: 'De eerste stap is vaak durven erover te praten. Reserveer een eerste gesprek of stuur me een bericht: ik antwoord je persoonlijk.',
    articles: 'Artikels', articlesPath: '/nl/artikels', articlesIntro: 'Reflecties om vooruit te gaan, over de vragen die de mensen die ik begeleid zich stellen.',
    read: 'Lees het artikel', published: 'Gepubliceerd op',
    serviceType: 'Life coaching',
  },
};
const OTHER = { fr: 'nl', nl: 'fr' };
const pathFor = (lang, slug) => (lang === 'fr' ? `/${slug}` : `/nl/${slug}`);

// ---------- contenus ----------

function readDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}
const THEMES = {
  fr: readDir('content/pages/fr').sort((a, b) => (a.order || 99) - (b.order || 99)),
  nl: readDir('content/pages/nl').sort((a, b) => (a.order || 99) - (b.order || 99)),
};
const ARTICLES = {
  fr: readDir('content/articles/fr').filter((a) => !a.draft && a.slug).sort((a, b) => String(b.date).localeCompare(String(a.date))),
  nl: readDir('content/articles/nl').filter((a) => !a.draft && a.slug).sort((a, b) => String(b.date).localeCompare(String(a.date))),
};

const paras = (text) =>
  String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('\n');

// Mise en forme simple pour les articles : ## titre, ### sous-titre, - liste, **gras**, [lien](url)
function markdown(src) {
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
  return String(src || '')
    .split(/\n\s*\n/)
    .map((block) => {
      const b = block.trim();
      if (!b) return '';
      if (b.startsWith('### ')) return `<h3>${inline(b.slice(4))}</h3>`;
      if (b.startsWith('## ')) return `<h2>${inline(b.slice(3))}</h2>`;
      const lines = b.split('\n');
      if (lines.every((l) => /^\s*[-*] /.test(l)))
        return `<ul class="check">${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`).join('')}</ul>`;
      return `<p>${inline(lines.join(' '))}</p>`;
    })
    .join('\n');
}

// ---------- FAQ, liens thématiques (page d'accueil) ----------

function applyFaq(html, faq) {
  if (!faq || !Array.isArray(faq.items) || !faq.items.length) {
    // pas de FAQ : on retire la section
    return mapElements(html, 'id', 'faq', ({ openTag }) => ({ openTag, inner: '' })).replace(/<section class="section faq-section" id="faq"><\/section>\n*/, '');
  }
  html = setText(html, 'data-faq', 'title', faq.title || 'FAQ');
  html = setText(html, 'data-faq', 'intro', faq.intro || '');
  const list = faq.items
    .map((it) => `\n      <details>\n        <summary>${esc(it.q)}</summary>\n        ${paras(it.a)}\n      </details>`)
    .join('');
  html = mapElements(html, 'id', 'faq-list', ({ openTag }) => ({ openTag, inner: list + '\n    ' }));
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.items.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: it.a } })),
  };
  return html.replace('</head>', `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>\n</head>`);
}

function themeLinks(lang, exceptSlug) {
  return THEMES[lang]
    .filter((p) => p.slug !== exceptSlug)
    .map((p) => `<a href="${pathFor(lang, p.slug)}">${esc(p.label)} <span aria-hidden="true">→</span></a>`)
    .join('');
}

function footerLinks(lang) {
  const t = T[lang];
  let links = THEMES[lang].map((p) => `<a href="${pathFor(lang, p.slug)}">${esc(p.label)}</a>`);
  if (ARTICLES[lang].length) links.push(`<a href="${t.articlesPath}">${t.articles}</a>`);
  links.push(`<a href="${t.home}#faq">FAQ</a>`);
  return links.join('');
}

function applyThemeSlots(html, lang) {
  const t = T[lang];
  html = mapElements(html, 'id', 'theme-links', ({ openTag }) => ({
    openTag,
    inner: THEMES[lang].length ? `<span class="themes__label">${t.themesIntro}</span>${themeLinks(lang)}` : '',
  }));
  html = mapElements(html, 'id', 'footer-themes', ({ openTag }) => ({ openTag, inner: footerLinks(lang) }));
  return html;
}

// ---------- gabarit des pages générées ----------

const LAYOUT = {}; // nav, footer, script Calendly extraits de la page d'accueil générée

function captureLayout(lang, html) {
  const nav = html.match(/<nav class="nav">[\s\S]*?<\/nav>/)[0];
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
  const cal = (html.match(/\/\/ Calendly : chargé[\s\S]*?\n\}\)\(\);/) || [''])[0];
  LAYOUT[lang] = { nav, footer, cal };
}

function navFor(lang, altPath) {
  const t = T[lang];
  let nav = LAYOUT[lang].nav;
  // bouton de langue → page équivalente dans l'autre langue
  nav = lang === 'fr' ? nav.replace('href="/nl"', `href="${altPath}"`) : nav.replace('href="/"', `href="${altPath}"`);
  // ancres de la page d'accueil
  nav = nav.replace(/href="#top"/g, `href="${t.home}"`).replace(/href="#([a-z-]+)"/g, `href="${t.home}#$1"`);
  return nav;
}

function head(lang, { title, description, path, altPath, ld }) {
  const t = T[lang];
  const fr = lang === 'fr' ? path : altPath;
  const nl = lang === 'nl' ? path : altPath;
  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${SITE}${path}" />
${altPath ? `<link rel="alternate" hreflang="fr-BE" href="${SITE}${fr}" />
<link rel="alternate" hreflang="nl-BE" href="${SITE}${nl}" />
<link rel="alternate" hreflang="x-default" href="${SITE}${fr}" />` : ''}
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#F5EEE2" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="${t.ogLocale}" />
<meta property="og:site_name" content="Louise Maselis Coaching" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${SITE}${path}" />
<meta property="og:image" content="${SITE}/og-image.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${SITE}/og-image.jpg" />
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Karla:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/site.css" />
</head>
<body>
`;
}

const sunSmall = '<svg width="18" height="18" viewBox="0 0 64 64" style="display:inline-block;vertical-align:-3px;flex-shrink:0" aria-hidden="true"><path d="M32 6 C47 5 59 17 58 32 C57 47 45 59 30 58 C15 57 5 45 6 30 C7 16 18 5 32 6" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round"/><circle cx="32" cy="32" r="2.25" fill="currentColor"/></svg>';

function ctaButtons(lang, ghostOnInk = false) {
  const t = T[lang];
  const ghostStyle = ghostOnInk ? ' style="color:var(--paper); border-color:var(--argile);"' : '';
  return `<div class="hero__cta">
        <a class="btn btn-primary calendly-trigger" href="${CAL}">${t.book} <span>${sunSmall}</span></a>
        <a class="btn btn-ghost" href="${t.contact}"${ghostStyle}>${t.write}</a>
      </div>`;
}

function foot(lang) {
  return `${LAYOUT[lang].footer.replace(/<nav class="wrap foot__themes"[\s\S]*?<\/nav>/, `<nav class="wrap foot__themes" aria-label="${T[lang].themes}">${footerLinks(lang)}</nav>`)}

<script>
${LAYOUT[lang].cal}
</script>
</body>
</html>
`;
}

function breadcrumb(lang, items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: SITE + it.path })),
  };
}

function renderTheme(lang, page, site, testimonials) {
  const t = T[lang];
  const path = pathFor(lang, page.slug);
  const altPage = THEMES[OTHER[lang]].find((p) => p.slug === page.alt_slug);
  const altPath = altPage ? pathFor(OTHER[lang], altPage.slug) : (lang === 'fr' ? '/nl' : '/');
  const tst = page.testimonial && testimonials?.items?.find((x) => (x.author || '').trim() === page.testimonial.trim());

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${SITE}${path}#service`,
        name: page.h1,
        serviceType: t.serviceType,
        description: page.description,
        url: SITE + path,
        provider: { '@id': `${SITE}/#cabinet` },
        areaServed: ['Uccle', 'Bruxelles', 'Belgique'],
        availableLanguage: ['fr', 'nl'],
        offers: { '@type': 'Offer', price: '75', priceCurrency: 'EUR', description: site.seances_tarif || '' },
      },
      breadcrumb(lang, [
        { name: t.homeLabel, path: t.home },
        { name: page.label, path },
      ]),
    ],
  };

  const sections = (page.sections || [])
    .map(
      (s, i) => `
<section class="section${i % 2 ? ' section--soft grain' : ''}">
  <div class="wrap prose">
    <h2>${esc(s.title)}</h2>
    ${paras(s.text)}
    ${s.bullets && s.bullets.length ? `<ul class="check">${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
  </div>
</section>`
    )
    .join('');

  const testimonialBlock = tst
    ? `
<section class="section">
  <div class="wrap prose">
    <figure class="testimonial" style="margin:0; background:var(--white); border:1px solid var(--line); border-radius:10px; padding:var(--s-4);">
      <blockquote class="quote" style="font-size:24px; border-left-color:var(--accent);">${esc(tst.quote)}</blockquote>
      <figcaption style="margin-top:var(--s-3); font-family:var(--sans); font-size:14px;"><strong>${esc(tst.author)}</strong> · <span style="color:var(--ink-soft);">${esc(tst.context || '')}</span></figcaption>
    </figure>
  </div>
</section>`
    : '';

  const how = `
<section class="section section--soft grain" id="deroulement">
  <div class="wrap">
    <div class="section__head">
      <h2>${t.how}</h2>
      ${site.seances_intro ? `<p>${esc(site.seances_intro)}</p>` : ''}
    </div>
    <div class="seances">
      <div class="seance">
        <div class="meta">${esc(site.seance1_meta || '')}</div>
        <h3>${esc(site.seance1_title || '')}</h3>
        <p>${esc(site.seance1_desc || '')}</p>
        <div class="dur">${esc(site.seance1_dur || '')}</div>
      </div>
      <div class="seance">
        <div class="meta">${esc(site.seance2_meta || '')}</div>
        <h3>${esc(site.seance2_title || '')}</h3>
        <p>${esc(site.seance2_desc || '')}</p>
        <div class="dur">${esc(site.seance2_dur || '')}</div>
      </div>
    </div>
    ${site.seances_tarif ? `<p class="tarif" style="font-family:var(--serif); font-size:24px; color:var(--ink); margin:var(--s-4) 0 8px;">${esc(site.seances_tarif)}</p>` : ''}
    <p style="color:var(--ink-soft); margin:0 0 4px;">${t.where}</p>
    <p style="color:var(--ink-soft); margin:0;">${t.hours}</p>
  </div>
</section>`;

  const cta = `
<section class="section section--ink grain">
  <div class="wrap">
    <div class="section__head">
      <h2>${t.ctaTitle}</h2>
      <p>${t.ctaText}</p>
    </div>
    ${ctaButtons(lang, true)}
  </div>
</section>`;

  const others = themeLinks(lang, page.slug);
  const related = others
    ? `
<section class="section">
  <div class="wrap">
    <div class="eyebrow">${t.other}</div>
    <div class="themes" style="margin-top:var(--s-3);">${others}</div>
  </div>
</section>`
    : '';

  return (
    head(lang, { title: page.title, description: page.description, path, altPath, ld }) +
    navFor(lang, altPath) +
    `
<header class="hero grain theme-hero" id="top">
  <div class="wrap" style="max-width:860px;">
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="${t.home}">${t.homeLabel}</a> <span aria-hidden="true">›</span> <span>${esc(page.label)}</span></nav>
    <div class="eyebrow">${esc(page.eyebrow)}</div>
    <h1>${esc(page.h1)}</h1>
    <p class="lede">${esc(page.lede)}</p>
    ${ctaButtons(lang)}
  </div>
</header>
${sections}
${testimonialBlock}
${how}
${cta}
${related}
` +
    foot(lang)
  );
}

function renderArticle(lang, a) {
  const t = T[lang];
  const path = `${t.articlesPath}/${a.slug}`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: a.title,
        description: a.description || '',
        datePublished: a.date,
        dateModified: a.updated || a.date,
        inLanguage: t.htmlLang,
        mainEntityOfPage: SITE + path,
        image: a.image ? SITE + a.image : `${SITE}/og-image.jpg`,
        author: { '@id': `${SITE}/#louise` },
        publisher: { '@id': `${SITE}/#cabinet` },
      },
      breadcrumb(lang, [
        { name: t.homeLabel, path: t.home },
        { name: t.articles, path: t.articlesPath },
        { name: a.title, path },
      ]),
    ],
  };
  const date = a.date ? new Date(a.date).toLocaleDateString(lang === 'fr' ? 'fr-BE' : 'nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return (
    head(lang, { title: `${a.title} | Louise Maselis Coaching`, description: a.description || '', path, altPath: null, ld }) +
    navFor(lang, lang === 'fr' ? '/nl' : '/') +
    `
<header class="hero grain theme-hero" id="top">
  <div class="wrap" style="max-width:860px;">
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="${t.home}">${t.homeLabel}</a> <span aria-hidden="true">›</span> <a href="${t.articlesPath}">${t.articles}</a></nav>
    <h1>${esc(a.title)}</h1>
    ${date ? `<p class="crumbs" style="margin-top:var(--s-2);">${t.published} ${date} · Louise Maselis</p>` : ''}
  </div>
</header>
<section class="section">
  <div class="wrap prose">
${markdown(a.body)}
  </div>
</section>
<section class="section section--ink grain">
  <div class="wrap">
    <div class="section__head"><h2>${t.ctaTitle}</h2><p>${t.ctaText}</p></div>
    ${ctaButtons(lang, true)}
  </div>
</section>
` +
    foot(lang)
  );
}

function renderArticleIndex(lang) {
  const t = T[lang];
  const ld = { '@context': 'https://schema.org', '@type': 'Blog', name: `${t.articles} · Louise Maselis Coaching`, url: SITE + t.articlesPath, inLanguage: t.htmlLang };
  const items = ARTICLES[lang]
    .map(
      (a) => `
    <article class="seance" style="margin-bottom:var(--s-3);">
      <h2 style="font-size:28px; margin:0 0 8px;"><a href="${t.articlesPath}/${a.slug}" style="color:inherit; text-decoration:none;">${esc(a.title)}</a></h2>
      ${a.description ? `<p>${esc(a.description)}</p>` : ''}
      <a href="${t.articlesPath}/${a.slug}" style="color:var(--accent); font-weight:700;">${t.read} →</a>
    </article>`
    )
    .join('');
  return (
    head(lang, { title: `${t.articles} | Louise Maselis Coaching`, description: t.articlesIntro, path: t.articlesPath, altPath: null, ld }) +
    navFor(lang, lang === 'fr' ? '/nl' : '/') +
    `
<header class="hero grain theme-hero" id="top">
  <div class="wrap" style="max-width:860px;">
    <h1>${t.articles}</h1>
    <p class="lede">${t.articlesIntro}</p>
  </div>
</header>
<section class="section">
  <div class="wrap prose">${items}
  </div>
</section>
` +
    foot(lang)
  );
}

// ---------- build ----------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const contact = readJSON('content/contact.json');
const redirects = ['/nl  /nl.html  200'];
const sitemap = [{ fr: '/', nl: '/nl' }];

for (const page of PAGES) {
  LANG = page.lang;
  let html = readFileSync(page.src, 'utf8');
  const site = readJSON(`content/site-${page.lang}.json`) || {};
  html = applyFields(html, site);
  html = applyTestimonials(html, readJSON(`content/temoignages-${page.lang}.json`));
  html = applyContact(html, contact);
  html = applyFaq(html, readJSON(`content/faq-${page.lang}.json`));
  html = applyThemeSlots(html, page.lang);
  captureLayout(page.lang, html);
  writeFileSync(join(OUT, page.out), html);
  console.log(`✓ ${page.out} généré (${page.lang})`);
}

for (const lang of ['fr', 'nl']) {
  LANG = lang;
  const site = readJSON(`content/site-${lang}.json`) || {};
  const testimonials = readJSON(`content/temoignages-${lang}.json`);
  mkdirSync(join(OUT, 'p', lang), { recursive: true });
  for (const page of THEMES[lang]) {
    writeFileSync(join(OUT, 'p', lang, `${page.slug}.html`), renderTheme(lang, page, site, testimonials));
    redirects.push(`${pathFor(lang, page.slug)}  /p/${lang}/${page.slug}.html  200`);
    if (lang === 'fr') {
      const alt = THEMES.nl.find((p) => p.slug === page.alt_slug);
      sitemap.push(alt ? { fr: pathFor('fr', page.slug), nl: pathFor('nl', alt.slug) } : { fr: pathFor('fr', page.slug) });
    } else if (!THEMES.fr.find((p) => p.slug === page.alt_slug)) {
      sitemap.push({ nl: pathFor('nl', page.slug) });
    }
    console.log(`✓ page ${pathFor(lang, page.slug)}`);
  }
  if (ARTICLES[lang].length) {
    const t = T[lang];
    writeFileSync(join(OUT, 'p', lang, 'articles.html'), renderArticleIndex(lang));
    redirects.push(`${t.articlesPath}  /p/${lang}/articles.html  200`);
    sitemap.push({ [lang]: t.articlesPath, single: true });
    for (const a of ARTICLES[lang]) {
      writeFileSync(join(OUT, 'p', lang, `article-${a.slug}.html`), renderArticle(lang, a));
      redirects.push(`${t.articlesPath}/${a.slug}  /p/${lang}/article-${a.slug}.html  200`);
      sitemap.push({ [lang]: `${t.articlesPath}/${a.slug}`, single: true });
      console.log(`✓ article ${t.articlesPath}/${a.slug}`);
    }
  }
}

writeFileSync(join(OUT, '_redirects'), redirects.join('\n') + '\n');

const urlEntry = (loc, alts) =>
  `  <url><loc>${SITE}${loc}</loc><lastmod>${TODAY}</lastmod>${alts
    .map((a) => `<xhtml:link rel="alternate" hreflang="${a.lang}" href="${SITE}${a.path}"/>`)
    .join('')}</url>`;
const urls = [];
for (const e of sitemap) {
  if (e.fr && e.nl) {
    const alts = [{ lang: 'fr-BE', path: e.fr }, { lang: 'nl-BE', path: e.nl }, { lang: 'x-default', path: e.fr }];
    urls.push(urlEntry(e.fr, alts), urlEntry(e.nl, alts));
  } else {
    urls.push(urlEntry(e.fr || e.nl, []));
  }
}
writeFileSync(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`
);
console.log(`✓ sitemap.xml (${urls.length} adresses) et _redirects (${redirects.length} règles)`);

for (const p of COPY) {
  if (!existsSync(p)) continue;
  mkdirSync(dirname(join(OUT, p)), { recursive: true });
  cpSync(p, join(OUT, p), { recursive: true });
}
console.log('✓ fichiers statiques copiés dans dist/');
