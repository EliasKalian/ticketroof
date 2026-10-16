// Cloudflare Worker: content negotiation for AI agents.
// Requests with "Accept: text/markdown" get the Markdown version of a page,
// everything else gets the normal HTML from GitHub Pages.
//
// Routes (Workers & Pages -> this Worker -> Settings -> Domains & Routes):
//   ticket-roof.com/
//   ticket-roof.com/index.html
//   ticket-roof.com/impressum.html
//   ticket-roof.com/index.md
//   ticket-roof.com/impressum.md

const MARKDOWN_PAGES = {
  '/': '/index.md',
  '/index.html': '/index.md',
  '/impressum.html': '/impressum.md',
};

const NOINDEX_PAGES = new Set(['/impressum.html']);

// Direct requests to the .md files: point search engines to the HTML page
const CANONICAL_PAGES = {
  '/index.md': 'https://ticket-roof.com/',
  '/impressum.md': 'https://ticket-roof.com/impressum.html',
};

// Quality value of a media type in an Accept header, 0 if not accepted
function quality(accept, type) {
  let best = 0;
  for (const part of accept.split(',')) {
    const [range, ...params] = part.trim().toLowerCase().split(';');
    if (range !== type && range !== type.split('/')[0] + '/*') continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    best = Math.max(best, q ? parseFloat(q.slice(2)) || 0 : 1);
  }
  return best;
}

function wantsMarkdown(request) {
  const accept = request.headers.get('Accept') || '';
  const md = quality(accept, 'text/markdown');
  return md > 0 && md >= quality(accept, 'text/html');
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    const canonical = CANONICAL_PAGES[url.pathname];
    if (canonical) {
      const res = await fetch(request);
      if (!res.ok) return res;
      const md = new Response(res.body, res);
      md.headers.set('Content-Type', 'text/markdown; charset=utf-8');
      md.headers.set('Link', `<${canonical}>; rel="canonical"`);
      return md;
    }

    const mdPath = MARKDOWN_PAGES[url.pathname];
    if (!mdPath || !['GET', 'HEAD'].includes(request.method)) return fetch(request);

    if (!wantsMarkdown(request)) {
      const res = await fetch(request);
      const html = new Response(res.body, res);
      html.headers.append('Vary', 'Accept');
      html.headers.append('Link', `<${mdPath}>; rel="alternate"; type="text/markdown"`);
      return html;
    }

    const res = await fetch(new URL(mdPath, url), { method: request.method });
    if (!res.ok) return fetch(request);

    const md = new Response(res.body, res);
    md.headers.set('Content-Type', 'text/markdown; charset=utf-8');
    md.headers.append('Vary', 'Accept');
    md.headers.set('Content-Location', mdPath);
    if (NOINDEX_PAGES.has(url.pathname)) md.headers.set('X-Robots-Tag', 'noindex');
    return md;
  },
};
