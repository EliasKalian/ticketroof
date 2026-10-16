// Post-processes the copied site in <outDir>:
//   1. renders the blog (blog/posts/*.md) to HTML, Markdown, RSS, sitemap and llms.txt entries
//   2. inlines the minified CSS into every HTML page
//   3. writes the current month into the footer
//   4. adds a content hash to the main.js URL
// Usage: node scripts/build.mjs <outDir> [--drafts]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { marked } from 'marked';

const OUT = process.argv[2];
const INCLUDE_DRAFTS = process.argv.includes('--drafts');
const SITE = 'https://ticket-roof.com';
const POSTS_DIR = 'blog/posts';

if (!OUT || !fs.existsSync(OUT)) throw new Error('usage: node scripts/build.mjs <outDir> [--drafts]');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const dateLabel = (iso) => new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T12:00:00'));
const rfc822 = (iso) => new Date(iso + 'T08:00:00Z').toUTCString();

// ---------- Posts ----------

function parsePost(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
  }
  for (const key of ['title', 'description', 'date']) {
    if (!meta[key]) throw new Error(`${file}: front matter needs "${key}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${file}: date must be YYYY-MM-DD`);
  const slug = path.basename(file, '.md');
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`${file}: file name must be lowercase a-z, 0-9 and -`);
  const body = m[2].trim();
  return {
    ...meta,
    slug,
    draft: meta.draft === 'true',
    updated: meta.updated || meta.date,
    author: meta.author || 'ticketroof',
    image: meta.image || '/assets/img/wien.jpg',
    path: `/blog/${slug}/`,
    url: `${SITE}/blog/${slug}/`,
    body,
    html: marked.parse(body),
    minutes: Math.max(1, Math.round(body.split(/\s+/).length / 200)),
  };
}

const posts = (fs.existsSync(POSTS_DIR) ? fs.readdirSync(POSTS_DIR) : [])
  .filter((f) => f.endsWith('.md'))
  .map((f) => parsePost(path.join(POSTS_DIR, f)))
  .filter((p) => INCLUDE_DRAFTS || !p.draft)
  .sort((a, b) => b.date.localeCompare(a.date));

// ---------- Page shell ----------

const indexHtml = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const gtag = indexHtml.match(/  <!-- Google tag \(gtag\.js\) -->[\s\S]*?<\/script>\s*<script>[\s\S]*?<\/script>\n/)?.[0] || '';

function page({ title, description, canonical, markdown, ogType = 'website', image = '/assets/img/wien.jpg', extraHead = '', schema, main }) {
  return `<!doctype html>
<html lang="de">
<head>
${gtag}  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${canonical}">
  <link rel="alternate" type="text/markdown" href="${markdown}">
  <link rel="alternate" type="application/rss+xml" title="ticketroof Blog" href="/blog/feed.xml">
  <meta property="og:type" content="${ogType}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${SITE}${image}">
  <meta name="theme-color" content="#0a0a0a">
${extraHead}  <link rel="icon" type="image/png" href="/assets/img/icon.png">
  <link rel="preload" href="/assets/fonts/inter-tight-latin-wght.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="style.css">
  <script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
  </script>
</head>
<body>
<header class="header header--solid">
  <div class="wrap header__inner">
    <a href="/" class="logo" aria-label="ticketroof – zur Startseite"><img src="/assets/img/logo-white.webp" alt="ticketroof" width="160" height="40"></a>
    <a href="/#kontakt" class="btn btn--light btn--sm">Demo anfragen</a>
  </div>
</header>
${main}
<footer class="footer">
  <div class="wrap footer__inner">
    <img src="/assets/img/logo-white.webp" alt="ticketroof" width="140" height="35">
    <nav aria-label="Footer">
      <a href="/">Startseite</a>
      <a href="/blog/">Blog</a>
      <a href="/#kontakt">Kontakt</a>
      <a href="/impressum.html">Impressum</a>
    </nav>
    <span>© <time datetime="2026-10" data-build-date>Oktober 2026</time> BEST-XP · Wien</span>
  </div>
</footer>
</body>
</html>
`;
}

const org = { '@id': `${SITE}/#organization` };
const breadcrumb = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
});

// ---------- Blog pages ----------

const blogTitle = 'Blog · ticketroof';
const blogDescription = 'Artikel rund um Mitarbeiter-Benefits, Teamkultur und das Wiener Kulturleben – vom Team hinter ticketroof.';

for (const p of posts) {
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${p.url}#article`,
        headline: p.title,
        description: p.description,
        datePublished: p.date,
        dateModified: p.updated,
        inLanguage: 'de-AT',
        image: `${SITE}${p.image}`,
        mainEntityOfPage: p.url,
        author: p.author === 'ticketroof' ? org : { '@type': 'Person', name: p.author },
        publisher: org,
        isPartOf: { '@id': `${SITE}/blog/#blog` },
      },
      breadcrumb([['Startseite', `${SITE}/`], ['Blog', `${SITE}/blog/`], [p.title, p.url]]),
    ],
  };
  const main = `<main class="wrap article">
  <nav class="article__crumbs" aria-label="Brotkrümel"><a href="/">Startseite</a> / <a href="/blog/">Blog</a></nav>
  <article>
    <header class="article__head">
      <p class="eyebrow"><time datetime="${p.date}">${dateLabel(p.date)}</time> · ${p.minutes} Min. Lesezeit${p.draft ? ' · <strong>Entwurf</strong>' : ''}</p>
      <h1>${esc(p.title)}</h1>
      <p class="article__lead">${esc(p.description)}</p>
    </header>
    <div class="prose">
${p.html}
    </div>
  </article>
  <aside class="article__cta">
    <h2>Ganz Wien live für euer Team?</h2>
    <p>Werdet Pilotpartner: In vier Wochen ist euer Team dabei.</p>
    <a href="/#kontakt" class="btn btn--grad">Pilotpartner werden</a>
  </aside>
</main>`;
  write(path.join(OUT, p.path, 'index.html'), page({
    title: `${p.title} · ticketroof Blog`,
    description: p.description,
    canonical: p.url,
    markdown: `${p.path}index.md`,
    ogType: 'article',
    image: p.image,
    extraHead: `  <meta property="article:published_time" content="${p.date}">\n  <meta property="article:modified_time" content="${p.updated}">\n${p.draft ? '  <meta name="robots" content="noindex">\n' : ''}`,
    schema,
    main,
  }));
  write(path.join(OUT, p.path, 'index.md'), `---
title: ${p.title}
description: ${p.description}
date: ${p.date}
updated: ${p.updated}
author: ${p.author}
url: ${p.url}
lang: de-AT
---

# ${p.title}

${p.body}

---

[Alle Artikel](${SITE}/blog/) · [ticketroof für Unternehmen](${SITE}/)
`);
}

const list = posts.length
  ? `<ol class="posts">
${posts.map((p) => `    <li class="post-card">
      <a href="${p.path}">
        <p class="eyebrow"><time datetime="${p.date}">${dateLabel(p.date)}</time> · ${p.minutes} Min.${p.draft ? ' · Entwurf' : ''}</p>
        <h2>${esc(p.title)}</h2>
        <p>${esc(p.description)}</p>
        <span class="post-card__more">Weiterlesen →</span>
      </a>
    </li>`).join('\n')}
  </ol>`
  : '  <p class="posts__empty">Bald gibt es hier die ersten Artikel.</p>';

write(path.join(OUT, 'blog/index.html'), page({
  title: blogTitle,
  description: blogDescription,
  canonical: `${SITE}/blog/`,
  markdown: '/blog/index.md',
  schema: {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Blog',
        '@id': `${SITE}/blog/#blog`,
        url: `${SITE}/blog/`,
        name: 'ticketroof Blog',
        description: blogDescription,
        inLanguage: 'de-AT',
        publisher: org,
        blogPost: posts.map((p) => ({ '@id': `${p.url}#article` })),
      },
      breadcrumb([['Startseite', `${SITE}/`], ['Blog', `${SITE}/blog/`]]),
    ],
  },
  main: `<main class="wrap blog">
  <header class="blog__head">
    <p class="eyebrow">Blog</p>
    <h1>Gedanken zu Benefits, Teams und Wiener Kultur.</h1>
    <p class="body-lg">${esc(blogDescription)}</p>
  </header>
${list}
</main>`,
}));

write(path.join(OUT, 'blog/index.md'), `---
title: ${blogTitle}
description: ${blogDescription}
url: ${SITE}/blog/
lang: de-AT
---

# ticketroof Blog

${blogDescription}

${posts.length ? posts.map((p) => `- [${p.title}](${SITE}${p.path}) (${p.date}): ${p.description}`).join('\n') : 'Bald gibt es hier die ersten Artikel.'}
`);

// ---------- RSS ----------

write(path.join(OUT, 'blog/feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ticketroof Blog</title>
    <link>${SITE}/blog/</link>
    <description>${esc(blogDescription)}</description>
    <language>de-at</language>
    <atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${posts.map((p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${p.url}</link>
      <guid isPermaLink="true">${p.url}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <description>${esc(p.description)}</description>
    </item>`).join('\n')}
  </channel>
</rss>
`);

// ---------- Sitemap and llms.txt (published posts only) ----------

const published = posts.filter((p) => !p.draft);
const sitemapFile = path.join(OUT, 'sitemap.xml');
const blogUrls = [
  ...(published.length ? [{ loc: `${SITE}/blog/`, lastmod: published[0].updated }] : []),
  ...published.map((p) => ({ loc: p.url, lastmod: p.updated })),
];
fs.writeFileSync(sitemapFile, fs.readFileSync(sitemapFile, 'utf8').replace('</urlset>',
  blogUrls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>\n`).join('') + '</urlset>'));

if (published.length) {
  const llmsFile = path.join(OUT, 'llms.txt');
  const section = `## Blog\n\n- [Blog-Übersicht](${SITE}/blog/index.md)\n${published.map((p) => `- [${p.title}](${SITE}${p.path}index.md): ${p.description}`).join('\n')}\n\n`;
  const llms = fs.readFileSync(llmsFile, 'utf8');
  if (!llms.includes('## Optional')) throw new Error('llms.txt: "## Optional" section not found');
  fs.writeFileSync(llmsFile, llms.replace('## Optional', () => section + '## Optional'));
}

// ---------- Inline CSS, footer date, main.js hash for all pages ----------

const htmlPages = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html') && !full.includes(`${path.sep}cdn-cgi${path.sep}`)) htmlPages.push(full);
  }
})(OUT);

const css = fs.readFileSync(path.join(OUT, 'style.css'), 'utf8').trim();
const now = new Date();
const monthIso = now.toLocaleDateString('sv-SE').slice(0, 7);
const monthLabel = new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric' }).format(now);
const jsHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT, 'main.js'))).digest('hex').slice(0, 10);

for (const file of htmlPages) {
  let html = fs.readFileSync(file, 'utf8');
  const link = '<link rel="stylesheet" href="style.css">';
  if (!html.includes(link)) throw new Error(`stylesheet link not found in ${file}`);
  html = html.replace(link, () => `<style>${css}</style>`);

  const dateRe = /<time datetime="[^"]*" data-build-date>[^<]*<\/time>/g;
  if (!dateRe.test(html)) throw new Error(`footer date not found in ${file}`);
  html = html.replace(dateRe, `<time datetime="${monthIso}">${monthLabel}</time>`);

  html = html.replace('<script src="main.js" defer></script>', `<script src="/main.js?v=${jsHash}" defer></script>`);
  fs.writeFileSync(file, html);
}

console.log(`Built ${posts.length} post(s)${INCLUDE_DRAFTS ? ' incl. drafts' : ''}, processed ${htmlPages.length} HTML page(s).`);
