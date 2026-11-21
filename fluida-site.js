'use strict';
/* Fluida — aba "Minha página": cada guia monta a própria página pública (/g/<endereço>)
   com roteiros, fotos, valores, depoimentos e perguntas, e recebe reservas com sinal no Pix.
   Dados: public.guide_sites e public.site_tours (RLS por conta). Fotos: bucket público fluida-site/<conta>/. */
(function(){
  const G = {
    acc: () => (typeof acc !== 'undefined' ? acc : undefined),
    me: () => (typeof me !== 'undefined' ? me : undefined),
    db: () => (typeof db !== 'undefined' ? db : undefined),
    tab: () => (typeof activeTab !== 'undefined' ? activeTab : undefined),
    render: () => (typeof render !== 'undefined' ? render : undefined),
    notify: () => (typeof notifyUser !== 'undefined' ? notifyUser : undefined),
    its: () => (typeof itineraryCache !== 'undefined' ? itineraryCache : [])
  };
  const g = k => { try { return G[k](); } catch (e) { return undefined; } };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const notify = m => { const f = g('notify'); if (typeof f === 'function') f(m); else alert(m); };
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const PHOTO = 'https://ewhfabhktkvrjddnvgkl.supabase.co/storage/v1/object/public/fluida-site/';
  const siteUrl = slug => location.origin + '/g/' + slug;
  const canEdit = () => { const m = g('me'); return !!m && (m.role === 'owner' || m.access_level === 'total'); };
  const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 40) || 'meu-guia';

  // ---------------- Estado ----------------
  let state = { for: null, loading: false, site: null, tours: [], stats: null, error: '' };
  async function loadState(force){
    const a = g('acc'), d = g('db'); if (!a || !d) return;
    if (state.loading || (!force && state.for === a.id)) return;
    state.loading = true;
    try {
      const [s, t, l] = await Promise.all([
        d.from('guide_sites').select('*').eq('account_id', a.id).maybeSingle(),
        d.from('site_tours').select('*').eq('account_id', a.id).order('sort'),
        d.rpc('fluida_list_booking_links', { p_account: a.id })
      ]);
      if (s.error) throw s.error;
      state.site = s.data || null; state.tours = t.data || [];
      const site = (l.data || []).filter(x => x.origin === 'site');
      state.stats = { booked: site.filter(x => x.status === 'booked' || x.status === 'paid').length, paid: site.filter(x => x.status === 'paid').length, last: site.filter(x => x.booking_id).slice(0, 5) };
      state.error = ''; state.for = a.id;
    } catch (e) { state.error = e.message || 'Não foi possível carregar a página.'; state.for = a.id; }
    finally { state.loading = false; }
    if (g('tab') === 'pagina') { const r = g('render'); if (typeof r === 'function') r(); }
  }

  // ---------------- Aba principal ----------------
  function view(){
    const a = g('acc');
    if (!a) return '';
    if (state.for !== a.id) { setTimeout(() => loadState(), 0); return '<div class="crm-heading"><div><h1>Minha página</h1><p>Carregando…</p></div></div>'; }
    const s = state.site, n = state.tours.filter(t => t.published).length;
    let h = `<div class="crm-heading"><div><h1>Minha página</h1><p>Seu site com roteiros, fotos e valores. O cliente escolhe o passeio, a data e paga o sinal no Pix — a reserva entra sozinha na sua agenda.</p></div></div>`;
    if (state.error) h += `<p style="background:#fde9e7;color:#8a1f1f;border-radius:12px;padding:12px">${esc(state.error)}</p>`;
    if (!s) {
      h += `<section style="background:#fff;border:1px solid var(--line,#dde4db);border-radius:16px;padding:20px;margin:12px 0">
        <h2 style="margin:0 0 6px">Crie sua página em poucos minutos</h2>
        <p class="m" style="margin:0 0 14px">Escolha o endereço, coloque uma foto de capa e marque quais roteiros aparecem. Você pode deixar em rascunho até ficar do seu jeito.</p>
        ${canEdit() ? '<div class="acts"><button type="button" onclick="fluidaSiteEditor()">Criar minha página</button></div>' : '<p class="m">Peça ao responsável da conta para criar a página.</p>'}</section>`;
      return h;
    }
    const url = siteUrl(s.slug), st = state.stats || { booked: 0, paid: 0, last: [] };
    h += `<section style="background:#fff;border:1px solid var(--line,#dde4db);border-radius:16px;padding:18px;margin:12px 0">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <b style="font-size:17px">${s.published ? '<span style="color:#205c38">● Publicada</span>' : '<span style="color:#8a6100">● Rascunho (só você vê)</span>'}</b>
        <span class="m">${n} roteiro${n === 1 ? '' : 's'} na página</span></div>
      <input readonly value="${esc(url)}" style="margin:12px 0 8px;width:100%" onclick="this.select()">
      <div class="acts" style="flex-wrap:wrap">
        ${canEdit() ? '<button type="button" onclick="fluidaSiteEditor()">Editar página</button>' : ''}
        ${s.published ? `<a class="button alt" style="display:inline-flex;align-items:center;padding:10px 16px;border-radius:10px;border:1px solid currentColor;text-decoration:none;font-weight:700" target="_blank" rel="noopener" href="${esc(url)}">Ver página</a>` : ''}
        <button type="button" class="alt" onclick="fluidaSiteCopy()">Copiar link</button>
        <a style="display:inline-flex;align-items:center;padding:10px 16px;border-radius:10px;background:#1f8f4e;color:#fff;text-decoration:none;font-weight:700" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Conheça meus passeios e reserve online: ' + url)}">Compartilhar no WhatsApp</a>
      </div>
      ${s.published ? '' : '<p class="m" style="margin:10px 0 0">A página só abre para os clientes depois de publicada (Editar página → Publicar).</p>'}
    </section>
    <div class="crm-stats">
      <div class="crm-card" style="background:#fff;border:1px solid var(--line,#dde4db);border-radius:14px;padding:14px"><span class="m">Reservas pela página</span><b style="display:block;font-size:24px">${st.booked}</b></div>
      <div class="crm-card" style="background:#fff;border:1px solid var(--line,#dde4db);border-radius:14px;padding:14px"><span class="m">Com sinal pago</span><b style="display:block;font-size:24px">${st.paid}</b></div>
    </div>
    <p class="m" style="margin-top:12px">As reservas feitas pela página aparecem na Agenda com a observação “Reserva feita pelo link” e também na lista de “Link de reserva com sinal”.</p>`;
    return h;
  }

  window.fluidaSiteCopy = async () => { if (!state.site) return; try { await navigator.clipboard.writeText(siteUrl(state.site.slug)); notify('Link copiado.'); } catch (e) {} };

  function install(){
    if (typeof fluidaMainSections === 'undefined' || typeof crmMainView !== 'function') return false;
    if (!fluidaMainSections.some(s => s[0] === 'pagina')) {
      const i = fluidaMainSections.findIndex(s => s[0] === 'gestao');
      fluidaMainSections.splice(i < 0 ? fluidaMainSections.length : i, 0, ['pagina', 'Minha página']);
    }
    if (!crmMainView.__site) {
      const orig = crmMainView;
      const wrapped = function(){ return g('tab') === 'pagina' ? view() : orig.apply(this, arguments); };
      wrapped.__site = true;
      // eslint-disable-next-line no-global-assign
      crmMainView = wrapped;
    }
    return true;
  }
  if (!install()) { let n = 0; const t = setInterval(() => { if (install() || ++n > 100) clearInterval(t); }, 100); }

  // ---------------- Fotos ----------------
  async function shrink(file, max){
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.84));
    } finally { URL.revokeObjectURL(url); }
  }
  async function upload(file, max){
    const a = g('acc'), d = g('db');
    if (!/^image\//.test(file.type || '')) throw new Error('Envie uma imagem (JPG, PNG ou HEIC convertida).');
    const blob = await shrink(file, max || 1600);
    if (!blob) throw new Error('Não foi possível ler esta imagem.');
    const name = a.id + '/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
    const r = await d.storage.from('fluida-site').upload(name, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (r.error) throw new Error(r.error.message);
    return PHOTO + name;
  }

  // ---------------- Editor ----------------
  const T3 = (o) => (o && typeof o === 'object') ? o : { pt: typeof o === 'string' ? o : '' };
  function trField(id, label, value, opts){
    opts = opts || {}; const v = T3(value), area = !!opts.area, ph = opts.ph || '';
    const inp = (lng, val) => area ? `<textarea id="${id}-${lng}" rows="${opts.rows || 3}" maxlength="${opts.max || 2000}" placeholder="${lng === 'pt' ? esc(ph) : ''}">${esc(val || '')}</textarea>` : `<input id="${id}-${lng}" maxlength="${opts.max || 200}" value="${esc(val || '')}" placeholder="${lng === 'pt' ? esc(ph) : ''}">`;
    return `<label for="${id}-pt">${label}</label>${inp('pt', v.pt)}
      <details style="margin:6px 0 0"><summary class="m" style="cursor:pointer">Inglês e espanhol (para turistas estrangeiros)</summary>
      <label for="${id}-en" style="font-weight:400">🇺🇸 Inglês</label>${inp('en', v.en)}<label for="${id}-es" style="font-weight:400">🇪🇸 Espanhol</label>${inp('es', v.es)}</details>`;
  }
  const readTr = (root, id) => { const o = {}; ['pt', 'en', 'es'].forEach(l => { const el = root.querySelector('#' + id + '-' + l); const v = el ? el.value.trim() : ''; if (v) o[l] = v; }); return o; };
  function photoBox(key, list, max, single){
    return `<div class="fs-photos" data-photos="${key}" data-max="${max}" style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0">${list.map((u, i) => `<div style="position:relative;width:${single ? '160px' : '92px'};height:${single ? '100px' : '92px'}"><img src="${esc(u)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px"><button type="button" data-rm="${i}" aria-label="Remover foto" style="position:absolute;top:4px;right:4px;width:26px;height:26px;min-height:0;padding:0;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:0;margin:0">×</button>${!single && i > 0 ? `<button type="button" data-first="${i}" title="Usar como primeira" style="position:absolute;bottom:4px;left:4px;min-height:0;padding:2px 6px;font-size:11px;border-radius:8px;background:rgba(0,0,0,.6);color:#fff;border:0;margin:0">1ª</button>` : ''}</div>`).join('')}
      ${list.length < max ? `<label style="width:${single ? '160px' : '92px'};height:${single ? '100px' : '92px'};margin:0;border:2px dashed #b9c7bd;border-radius:10px;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;font-size:13px;color:#5b6f69;font-weight:600">＋ Foto<input type="file" accept="image/*" ${single ? '' : 'multiple'} hidden></label>` : ''}</div>`;
  }

  async function openEditor(){
    const a = g('acc'), d = g('db'), dlg = document.getElementById('dlg');
    if (!a || !d || !dlg) return;
    if (!canEdit()) return notify('Somente quem tem acesso total pode editar a página.');
    await loadState(true);
    let its = [];
    const r = await d.from('itineraries').select('*').eq('account_id', a.id).order('name');
    its = (r.data || g('its') || []).filter(i => i.active === true);
    const site = state.site || { slug: slugify(a.name), published: false, content: {} };
    const c = JSON.parse(JSON.stringify(site.content || {}));
    const photos = { cover: c.cover ? [c.cover] : [], avatar: c.avatar ? [c.avatar] : [], gallery: Array.isArray(c.gallery) ? c.gallery.slice() : [] };
    const byIt = {}; state.tours.forEach(t => { if (t.itinerary_id) byIt[t.itinerary_id] = t; });
    const rows = its.map((it, n) => {
      const t = byIt[it.id] || { published: false, sort: 100 + n, data: {} };
      const dt = t.data || {};
      photos['t-' + it.id] = Array.isArray(dt.photos) ? dt.photos.slice() : [];
      return { it, t, dt };
    }).sort((x, y) => (x.t.published === y.t.published ? (x.t.sort - y.t.sort) : (x.t.published ? -1 : 1)));
    const reviews = Array.isArray(c.reviews) ? c.reviews.slice() : [];
    const faq = Array.isArray(c.faq) ? c.faq.slice() : [];
    const blocked = Array.isArray(c.blocked) ? c.blocked.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort() : [];
    const color = /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : ((a.branding && /^#[0-9a-f]{6}$/i.test(a.branding.primary_color || '')) ? a.branding.primary_color : '#07383a');

    const tabs = [['pg', 'Página'], ['rt', 'Roteiros'], ['dp', 'Depoimentos e perguntas'], ['ag', 'Pagamento e agenda']];
    const tourRow = ({ it, t, dt }) => {
      const id = 'r' + it.id.replace(/-/g, '');
      const price = dt.price != null && dt.price !== '' ? dt.price : (Number(it.price) > 0 ? it.price : '');
      const wd = Array.isArray(dt.weekdays) ? dt.weekdays.map(Number) : [];
      return `<details class="fs-tour" data-it="${it.id}" style="border:1px solid #dde4db;border-radius:12px;padding:10px 12px;margin:0 0 10px;background:#fff">
        <summary style="cursor:pointer;display:flex;gap:10px;align-items:center;justify-content:space-between"><span><b>${esc(it.name)}</b><span class="m" style="font-size:13px"> · ${Number(price) > 0 ? brl(price) : 'sem valor'}</span></span>
          <span style="font-size:13px;font-weight:700;color:${t.published ? '#205c38' : '#6b7a75'}" data-badge>${t.published ? 'Na página' : 'Oculto'}</span></summary>
        <label style="display:flex;gap:8px;align-items:center;font-weight:700;margin-top:12px"><input type="checkbox" data-pub ${t.published ? 'checked' : ''} style="width:auto;margin:0"> Mostrar este roteiro na página</label>
        <label>Fotos (até 6 — a primeira é a capa do roteiro)</label>${photoBox('t-' + it.id, photos['t-' + it.id], 6)}
        ${trField(id + '-ti', 'Nome na página', dt.title || { pt: it.name }, { max: 120 })}
        ${trField(id + '-de', 'Descrição curta', dt.desc || { pt: it.description || '' }, { area: true, rows: 3, max: 900, ph: 'Ex.: Suba ao Cristo Redentor com guia credenciado e fotos profissionais.' })}
        ${trField(id + '-in', 'O que está incluso (um item por linha)', dt.includes, { area: true, rows: 4, max: 900, ph: 'Transporte ida e volta\nIngresso do Cristo\nFotos editadas' })}
        ${trField(id + '-du', 'Duração', dt.duration || { pt: it.duration || '' }, { max: 40, ph: 'Ex.: 4 horas' })}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0 12px">
          <div><label for="${id}-pr">Preço (R$)</label><input id="${id}-pr" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(price)}" placeholder="0 = sob consulta"></div>
          <div><label for="${id}-mo">Cobrança</label><select id="${id}-mo"><option value="person" ${dt.mode !== 'group' ? 'selected' : ''}>Por pessoa</option><option value="group" ${dt.mode === 'group' ? 'selected' : ''}>Por grupo (valor fixo)</option></select></div>
          <div><label for="${id}-mi">Mín. pessoas</label><input id="${id}-mi" type="number" min="1" max="200" value="${esc(dt.min_pax || 1)}"></div>
          <div><label for="${id}-ma">Máx. pessoas</label><input id="${id}-ma" type="number" min="1" max="200" value="${esc(dt.max_pax || 10)}"></div>
          <div><label for="${id}-dp">Sinal (%)</label><input id="${id}-dp" type="number" min="10" max="100" value="${esc(dt.deposit_pct || '')}" placeholder="padrão da página"></div>
          <div><label for="${id}-so">Ordem</label><input id="${id}-so" type="number" min="0" max="999" value="${esc(t.published ? t.sort : '')}" placeholder="1, 2, 3…"></div>
        </div>
        <label for="${id}-hr">Horários de saída (separe por vírgula; vazio = cliente não escolhe)</label><input id="${id}-hr" maxlength="120" value="${esc((dt.times || []).join(', '))}" placeholder="08:00, 13:30">
        <label>Dias em que acontece (nenhum marcado = todos)</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px 14px">${WD.map((w, i) => `<label style="display:flex;gap:4px;align-items:center;font-weight:400;margin:0"><input type="checkbox" data-wd="${i}" ${wd.includes(i) ? 'checked' : ''} style="width:auto;margin:0">${w}</label>`).join('')}</div>
      </details>`;
    };
    const reviewRow = (rv, i) => `<div class="fs-rev" style="border:1px solid #dde4db;border-radius:12px;padding:10px 12px;margin:0 0 10px;background:#fff">
      <div style="display:grid;grid-template-columns:2fr 2fr 1fr;gap:0 10px"><div><label>Nome</label><input data-k="name" maxlength="60" value="${esc(rv.name || '')}"></div><div><label>De onde</label><input data-k="from" maxlength="60" value="${esc(rv.from || '')}" placeholder="São Paulo"></div><div><label>Estrelas</label><select data-k="stars">${[5, 4, 3].map(s => `<option ${Number(rv.stars || 5) === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
      <label>Depoimento</label><textarea data-k="text" rows="3" maxlength="600">${esc(typeof rv.text === 'object' ? (rv.text.pt || '') : (rv.text || ''))}</textarea>
      <div class="acts"><button type="button" class="alt" data-del-rev="${i}">Remover</button></div></div>`;
    const faqRow = (f, i) => `<div class="fs-faq" data-i="${i}" style="border:1px solid #dde4db;border-radius:12px;padding:10px 12px;margin:0 0 10px;background:#fff">
      ${trField('fq' + i + 'q', 'Pergunta', f.q, { max: 200 })}${trField('fq' + i + 'a', 'Resposta', f.a, { area: true, rows: 3, max: 1500 })}
      <div class="acts"><button type="button" class="alt" data-del-faq="${i}">Remover</button></div></div>`;

    dlg.innerHTML = `<form method="dialog" style="text-align:right"><button class="alt">Fechar</button></form>
      <h2 style="margin:0">Minha página</h2>
      <p class="m" style="margin:4px 0 12px">Preencha, salve e confira em “Ver página”. Nada aparece para o cliente enquanto estiver em rascunho.</p>
      <div role="tablist" class="fs-tabs" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:6px">${tabs.map(([k, l], i) => `<button type="button" role="tab" data-fs-tab="${k}" aria-selected="${i === 0}" class="${i === 0 ? '' : 'alt'}" style="white-space:nowrap;margin:0">${l}</button>`).join('')}</div>

      <section data-fs-panel="pg">
        <label style="display:flex;gap:10px;align-items:center;background:#eef6f0;border-radius:12px;padding:12px;font-weight:700"><input type="checkbox" id="fs-pub" ${site.published ? 'checked' : ''} style="width:auto;margin:0"> Publicar a página (visível para os clientes)</label>
        <label for="fs-slug">Endereço da página</label>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap"><span class="m">${esc(location.host)}/g/</span><input id="fs-slug" maxlength="40" value="${esc(site.slug)}" style="flex:1;min-width:150px" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
        <p class="m" style="margin:4px 0 0;font-size:13px">Só letras minúsculas, números e hífen. Ex.: joao-guia-rio</p>
        <label>Foto de capa (horizontal, aparece no topo)</label>${photoBox('cover', photos.cover, 1, true)}
        <label>Sua foto ou logo (redonda)</label>${photoBox('avatar', photos.avatar, 1, true)}
        <p class="m" style="margin:0;font-size:13px">Sem foto, a página usa a logo cadastrada nas configurações.</p>
        ${trField('fs-hl', 'Frase de destaque', c.headline, { max: 120, ph: 'Passeios no Rio com guia credenciado e fotos incríveis' })}
        ${trField('fs-tg', 'Linha abaixo do seu nome', c.tagline, { max: 80, ph: 'Guia de turismo credenciado (Cadastur)' })}
        ${trField('fs-ab', 'Sobre você', c.about, { area: true, rows: 5, max: 2500, ph: 'Conte sua história, há quanto tempo é guia, idiomas que fala…' })}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0 12px">
          <div><label for="fs-wa">WhatsApp</label><input id="fs-wa" type="tel" maxlength="30" value="${esc(c.whatsapp || '')}" placeholder="(21) 99999-9999"></div>
          <div><label for="fs-ig">Instagram</label><input id="fs-ig" maxlength="60" value="${esc(c.instagram || '')}" placeholder="@seuperfil"></div>
          <div><label for="fs-co">Cor principal</label><input id="fs-co" type="color" value="${esc(color)}" style="height:46px;padding:4px"></div>
        </div>
        <label>Galeria de fotos (até 12)</label>${photoBox('gallery', photos.gallery, 12)}
      </section>

      <section data-fs-panel="rt" hidden>
        <p class="m">Os roteiros vêm do seu cadastro de roteiros. Marque “Mostrar na página”, coloque fotos e confira o preço. Roteiro com preço 0 aparece como “sob consulta”, com botão para o WhatsApp.</p>
        ${rows.length ? rows.map(tourRow).join('') : '<p>Nenhum roteiro ativo cadastrado. Cadastre seus roteiros no app e volte aqui.</p>'}
      </section>

      <section data-fs-panel="dp" hidden>
        <h3 style="margin:6px 0">Depoimentos</h3>
        <p class="m">Copie aqui avaliações reais de clientes (Google, Instagram, WhatsApp — com a permissão deles). ${a.review_url ? 'A página também mostra o botão “Ver avaliações no Google”.' : ''}</p>
        <div id="fs-revs">${reviews.map(reviewRow).join('')}</div>
        <div class="acts"><button type="button" class="alt" id="fs-add-rev">＋ Adicionar depoimento</button></div>
        <h3 style="margin:18px 0 6px">Perguntas frequentes</h3>
        <p class="m">A política de cancelamento das configurações já aparece automaticamente no fim da página.</p>
        <div id="fs-faqs">${faq.map(faqRow).join('')}</div>
        <div class="acts"><button type="button" class="alt" id="fs-add-faq">＋ Adicionar pergunta</button></div>
      </section>

      <section data-fs-panel="ag" hidden>
        <h3 style="margin:6px 0">Pagamento</h3>
        <div id="fs-mp" class="m">Verificando Mercado Pago…</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0 12px">
          <div><label for="fs-dep">Sinal padrão (%)</label><input id="fs-dep" type="number" min="10" max="100" value="${esc(c.deposit_pct || 30)}"><p class="m" style="font-size:12.5px;margin:4px 0 0">100 = cliente paga tudo na reserva.</p></div>
          <div><label for="fs-adv">Antecedência mínima (dias)</label><input id="fs-adv" type="number" min="0" max="60" value="${esc(c.min_advance_days != null ? c.min_advance_days : 1)}"><p class="m" style="font-size:12.5px;margin:4px 0 0">0 = aceita reserva para hoje.</p></div>
          <div><label for="fs-lim">Limite de reservas por dia</label><input id="fs-lim" type="number" min="0" max="50" value="${esc(c.daily_limit || 0)}"><p class="m" style="font-size:12.5px;margin:4px 0 0">Conta as reservas da agenda. 0 = sem limite.</p></div>
        </div>
        <h3 style="margin:18px 0 6px">Datas bloqueadas</h3>
        <p class="m">Dias em que você não atende (folga, viagem, feriado). O cliente não consegue reservar nesses dias.</p>
        <div style="display:flex;gap:8px;align-items:center"><input type="date" id="fs-bl-d" style="max-width:200px"><button type="button" class="alt" id="fs-bl-add" style="margin:0">Bloquear data</button></div>
        <div id="fs-bl" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px"></div>
        <h3 style="margin:18px 0 6px">Idiomas</h3>
        <p class="m">A página abre no idioma do celular do cliente (português, inglês ou espanhol) e ele pode trocar no topo. Textos sem tradução aparecem em português.</p>
      </section>

      <p id="fs-msg" class="m" role="status" style="min-height:22px;margin-top:14px"></p>
      <div class="acts" style="position:sticky;bottom:-16px;background:#fff;padding:10px 0 4px;border-top:1px solid #eef2ee"><button type="button" id="fs-save">Salvar página</button><button type="button" class="alt" id="fs-view">Ver página</button></div>`;
    if (!dlg.open) dlg.showModal();
    const $ = s => dlg.querySelector(s), msg = $('#fs-msg');

    // abas
    dlg.querySelectorAll('[data-fs-tab]').forEach(b => b.onclick = () => {
      dlg.querySelectorAll('[data-fs-tab]').forEach(o => { const on = o === b; o.setAttribute('aria-selected', String(on)); o.className = on ? '' : 'alt'; });
      dlg.querySelectorAll('[data-fs-panel]').forEach(p => p.hidden = p.dataset.fsPanel !== b.dataset.fsTab);
      if (b.dataset.fsTab === 'ag') paintMp();
    });
    $('#fs-slug').oninput = function(){ const v = this.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); if (v !== this.value) this.value = v; };
    dlg.querySelectorAll('.fs-tour [data-pub]').forEach(cb => cb.onchange = () => { const b = cb.closest('details').querySelector('[data-badge]'); b.textContent = cb.checked ? 'Na página' : 'Oculto'; b.style.color = cb.checked ? '#205c38' : '#6b7a75'; });

    // fotos
    function paintPhotos(key){
      const box = dlg.querySelector(`[data-photos="${key}"]`); if (!box) return;
      const max = Number(box.dataset.max), single = max === 1;
      box.outerHTML = photoBox(key, photos[key], max, single);
      wirePhotos(dlg.querySelector(`[data-photos="${key}"]`));
    }
    function wirePhotos(box){
      const key = box.dataset.photos, max = Number(box.dataset.max);
      box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { photos[key].splice(Number(b.dataset.rm), 1); paintPhotos(key); });
      box.querySelectorAll('[data-first]').forEach(b => b.onclick = () => { const i = Number(b.dataset.first); const [x] = photos[key].splice(i, 1); photos[key].unshift(x); paintPhotos(key); });
      const inp = box.querySelector('input[type=file]');
      if (inp) inp.onchange = async () => {
        const files = [...inp.files].slice(0, max - photos[key].length); if (!files.length) return;
        msg.textContent = 'Enviando foto' + (files.length > 1 ? 's' : '') + '…';
        try {
          for (const f of files) { const u = await upload(f, key === 'avatar' ? 600 : 1800); if (max === 1) photos[key] = [u]; else photos[key].push(u); }
          msg.textContent = 'Foto enviada. Lembre de salvar a página.';
        } catch (e) { msg.textContent = e.message || 'Não foi possível enviar a foto.'; }
        paintPhotos(key);
      };
    }
    dlg.querySelectorAll('[data-photos]').forEach(wirePhotos);

    // depoimentos e perguntas
    const readReviews = () => [...dlg.querySelectorAll('.fs-rev')].map(el => { const o = {}; el.querySelectorAll('[data-k]').forEach(i => o[i.dataset.k] = i.value.trim()); o.stars = Number(o.stars) || 5; return o; });
    const readFaq = () => [...dlg.querySelectorAll('.fs-faq')].map(el => { const i = el.dataset.i; return { q: readTr(el, 'fq' + i + 'q'), a: readTr(el, 'fq' + i + 'a') }; });
    function paintRevs(list){ $('#fs-revs').innerHTML = list.map(reviewRow).join(''); $('#fs-revs').querySelectorAll('[data-del-rev]').forEach(b => b.onclick = () => { const l = readReviews(); l.splice(Number(b.dataset.delRev), 1); paintRevs(l); }); }
    function paintFaq(list){ $('#fs-faqs').innerHTML = list.map(faqRow).join(''); $('#fs-faqs').querySelectorAll('[data-del-faq]').forEach(b => b.onclick = () => { const l = readFaq(); l.splice(Number(b.dataset.delFaq), 1); paintFaq(l); }); }
    paintRevs(reviews); paintFaq(faq);
    $('#fs-add-rev').onclick = () => { const l = readReviews(); if (l.length >= 20) return; l.push({ stars: 5 }); paintRevs(l); };
    $('#fs-add-faq').onclick = () => { const l = readFaq(); if (l.length >= 20) return; l.push({}); paintFaq(l); };

    // datas bloqueadas
    const fmt = s => s.split('-').reverse().join('/');
    function paintBl(){ $('#fs-bl').innerHTML = blocked.length ? blocked.map((x, i) => `<span style="display:inline-flex;align-items:center;gap:6px;background:#f1f4f1;border-radius:999px;padding:4px 6px 4px 12px;font-size:14px">${fmt(x)}<button type="button" data-ub="${i}" aria-label="Desbloquear" style="min-height:0;width:24px;height:24px;padding:0;margin:0;border-radius:50%;border:0;background:#dfe6e0;color:#333">×</button></span>`).join('') : '<span class="m">Nenhuma data bloqueada.</span>'; $('#fs-bl').querySelectorAll('[data-ub]').forEach(b => b.onclick = () => { blocked.splice(Number(b.dataset.ub), 1); paintBl(); }); }
    paintBl();
    $('#fs-bl-add').onclick = () => { const v = $('#fs-bl-d').value; if (!v) return; if (!blocked.includes(v)) { blocked.push(v); blocked.sort(); } $('#fs-bl-d').value = ''; paintBl(); };

    // Mercado Pago
    async function paintMp(){
      const box = $('#fs-mp'); if (!box || box.dataset.done) return; box.dataset.done = '1';
      const st = (await d.rpc('fluida_mp_status', { p_account: a.id })).data || {};
      const pix = a.branding && a.branding.voucher && a.branding.voucher.pix_key;
      box.innerHTML = st.connected
        ? '<p style="background:#eaf6ee;border-radius:10px;padding:10px 12px;margin:0"><b style="color:#205c38">✓ Mercado Pago conectado.</b> O cliente paga no Pix e a reserva é confirmada sozinha; o dinheiro cai direto na sua conta.</p>'
        : `<p style="background:#fff6e0;border-radius:10px;padding:10px 12px;margin:0">${pix ? 'Hoje o cliente paga na sua <b>chave Pix</b> e você confere o pagamento. Conecte o Mercado Pago para a confirmação ser automática.' : 'Para receber o sinal, conecte o <b>Mercado Pago</b> (confirmação automática) ou cadastre sua chave Pix em Menu → Configurações. Sem isso, o cliente só envia os dados e você combina o pagamento.'}</p><div class="acts"><button type="button" id="fs-mp-on">Conectar Mercado Pago</button></div>`;
      const on = box.querySelector('#fs-mp-on');
      if (on) on.onclick = async () => {
        on.disabled = true;
        const res = await d.functions.invoke('fluida-mp-connect', { body: { action: 'start' } });
        let x = res.data; if (res.error) { try { x = await res.error.context.json(); } catch (e) {} }
        if (x && x.url) location.href = x.url; else { notify((x && x.error) || 'Não foi possível conectar agora.'); on.disabled = false; }
      };
    }

    // salvar
    function collect(){
      const content = Object.assign({}, c, {
        headline: readTr(dlg, 'fs-hl'), tagline: readTr(dlg, 'fs-tg'), about: readTr(dlg, 'fs-ab'),
        whatsapp: $('#fs-wa').value.trim(), instagram: $('#fs-ig').value.trim(), color: $('#fs-co').value,
        cover: photos.cover[0] || '', avatar: photos.avatar[0] || '', gallery: photos.gallery.slice(0, 12),
        reviews: readReviews().filter(r => r.text).map(r => ({ name: r.name, from: r.from, stars: r.stars, text: r.text })),
        faq: readFaq().filter(f => f.q.pt && f.a.pt),
        deposit_pct: Math.max(10, Math.min(100, Number($('#fs-dep').value) || 30)),
        min_advance_days: Math.max(0, Math.min(60, Number($('#fs-adv').value) || 0)),
        daily_limit: Math.max(0, Math.min(50, Number($('#fs-lim').value) || 0)),
        blocked: blocked.slice()
      });
      const tours = [...dlg.querySelectorAll('.fs-tour')].map((el, n) => {
        const itId = el.dataset.it, id = 'r' + itId.replace(/-/g, ''), q = s => el.querySelector('#' + id + '-' + s);
        const times = q('hr').value.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean).map(x => { const m = x.match(/^(\d{1,2})[:h.]?(\d{2})?$/); if (!m) return null; const hh = Number(m[1]), mm = Number(m[2] || 0); return hh < 24 && mm < 60 ? String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') : null; }).filter(Boolean);
        const minP = Math.max(1, Math.min(200, Number(q('mi').value) || 1)), maxP = Math.max(minP, Math.min(200, Number(q('ma').value) || 10));
        const data = {
          title: readTr(el, id + '-ti'), desc: readTr(el, id + '-de'), includes: readTr(el, id + '-in'), duration: readTr(el, id + '-du'),
          photos: (photos['t-' + itId] || []).slice(0, 6),
          price: Math.max(0, Math.round((Number(q('pr').value) || 0) * 100) / 100), mode: q('mo').value === 'group' ? 'group' : 'person',
          min_pax: minP, max_pax: maxP, times: [...new Set(times)].sort().slice(0, 12),
          weekdays: [...el.querySelectorAll('[data-wd]:checked')].map(x => Number(x.dataset.wd)),
          deposit_pct: q('dp').value ? Math.max(10, Math.min(100, Number(q('dp').value))) : ''
        };
        return { itId, published: el.querySelector('[data-pub]').checked, sort: q('so').value !== '' ? Number(q('so').value) : 500 + n, data, existing: byIt[itId] };
      });
      return { content, tours };
    }
    $('#fs-save').onclick = async () => {
      const btn = $('#fs-save'), slug = $('#fs-slug').value.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) || /--/.test(slug)) { msg.textContent = 'Endereço inválido: use de 3 a 40 letras minúsculas, números e hífen (sem começar ou terminar com hífen).'; dlg.querySelector('[data-fs-tab="pg"]').click(); return; }
      const { content, tours } = collect();
      const pub = $('#fs-pub').checked;
      if (pub && !tours.some(t => t.published)) { msg.textContent = 'Marque pelo menos um roteiro em “Roteiros” antes de publicar.'; return; }
      btn.disabled = true; msg.textContent = 'Salvando…';
      try {
        const up = await d.from('guide_sites').upsert({ account_id: a.id, slug, published: pub, content }, { onConflict: 'account_id' }).select().single();
        if (up.error) throw (up.error.code === '23505' ? new Error('Este endereço já está em uso por outro guia. Escolha outro.') : up.error);
        for (const t of tours) {
          if (!t.existing && !t.published) continue;
          const row = { account_id: a.id, itinerary_id: t.itId, published: t.published, sort: t.sort, data: t.data };
          const res = t.existing ? await d.from('site_tours').update(row).eq('id', t.existing.id).select().single() : await d.from('site_tours').insert(row).select().single();
          if (res.error) throw res.error;
          byIt[t.itId] = res.data;
        }
        await loadState(true);
        msg.innerHTML = pub ? `Página salva e publicada ✓ <a href="${esc(siteUrl(slug))}" target="_blank" rel="noopener">Abrir</a>` : 'Rascunho salvo ✓ Quando quiser, marque “Publicar a página” e salve.';
      } catch (e) { msg.textContent = (e && e.message) || 'Não foi possível salvar.'; }
      finally { btn.disabled = false; }
    };
    $('#fs-view').onclick = () => { const s = state.site; if (!s) { msg.textContent = 'Salve a página primeiro.'; return; } if (!s.published) { msg.textContent = 'A página está em rascunho: marque “Publicar a página” e salve para abrir o link.'; return; } window.open(siteUrl(s.slug), '_blank', 'noopener'); };
  }
  window.fluidaSiteEditor = openEditor;
})();
