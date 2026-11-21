// Página pública do guia (/g/<endereço>): entrega site.html já com título e prévia (Open Graph)
// para o link aparecer bonito no WhatsApp, Instagram e Google. O conteúdo é montado no navegador.
const fs = require('fs');
const path = require('path');

const SB = 'https://ewhfabhktkvrjddnvgkl.supabase.co';
const KEY = 'sb_publishable_SPL6PHiYz1ntLqehGJkRVg_D4a_07QU';
const PHOTO = SB + '/storage/v1/object/public/fluida-site/';
let TEMPLATE = null;

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tr = (o, lang) => !o ? '' : typeof o === 'string' ? o : (o[lang] || o.pt || o.en || o.es || '');

module.exports = async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || '').toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('Página não encontrada'); }
  try {
    if (!TEMPLATE) TEMPLATE = fs.readFileSync(path.join(process.cwd(), 'site.html'), 'utf8');
  } catch (e) {
    res.statusCode = 302; res.setHeader('Location', '/site.html?s=' + slug); return res.end();
  }
  let html = TEMPLATE;
  try {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(SB + '/rest/v1/rpc/fluida_site_public', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY },
      body: JSON.stringify({ p_slug: slug })
    });
    clearTimeout(timer);
    const d = r.ok ? await r.json() : null;
    if (d && d.business) {
      const lang = String((req.query && req.query.lang) || 'pt').slice(0, 2);
      const c = d.content || {};
      const title = d.business + (tr(c.headline, lang) ? ' · ' + tr(c.headline, lang) : '');
      const desc = (tr(c.about, lang) || (d.tours || []).map(t => tr(t.data && t.data.title, lang) || t.name).filter(Boolean).join(' · ')).replace(/\s+/g, ' ').slice(0, 180);
      let img = String(c.cover || '');
      if (img.indexOf(PHOTO) !== 0) { const t = (d.tours || []).find(t => t.data && Array.isArray(t.data.photos) && String(t.data.photos[0] || '').indexOf(PHOTO) === 0); img = t ? t.data.photos[0] : ''; }
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      const url = 'https://' + host + '/g/' + slug;
      const meta = `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${img ? `<meta property="og:image" content="${esc(img)}">\n<meta name="twitter:card" content="summary_large_image">` : ''}`;
      html = html.replace('<title>Passeios</title>', meta);
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    } else {
      res.setHeader('Cache-Control', 'public, s-maxage=30');
    }
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=30');
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
};
