'use strict';
/* Fluida multi-guias: personalização por conta e administração da plataforma.
   - Contas com branding.identity === 'custom' (criadas por convite de negócio) não herdam a marca RamonGuia.
   - A conta original (branding vazio) mantém o visual atual; qualquer campo salvo aqui o substitui. */
(function(){
  /* Variáveis globais do app (declaradas com let/const nos scripts principais). */
  const G = {
    acc: () => (typeof acc !== 'undefined' ? acc : undefined),
    me: () => (typeof me !== 'undefined' ? me : undefined),
    db: () => (typeof db !== 'undefined' ? db : undefined),
    notifyUser: () => (typeof notifyUser !== 'undefined' ? notifyUser : undefined),
    authMode: () => (typeof authMode !== 'undefined' ? authMode : undefined),
    setAuthMode: () => (typeof setAuthMode !== 'undefined' ? setAuthMode : undefined),
    welcomeImage: () => (typeof welcomeImage !== 'undefined' ? welcomeImage : undefined),
    voucherBrandImage: () => (typeof voucherBrandImage !== 'undefined' ? voucherBrandImage : undefined)
  };
  const g = name => { try { return G[name](); } catch(e) { return undefined; } };
  const account = () => g('acc');
  const member = () => g('me');
  const client = () => g('db');
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const notify = msg => { const f = g('notifyUser'); if (typeof f === 'function') f(msg); else alert(msg); };
  const HEX = /^#[0-9a-f]{6}$/i;
  const DEFAULTS = { primary: '#07383a', accent: '#9cff1e' };
  let isPlatformAdmin = null, adminCheckFor = null, appliedFor = null;

  function branding(){ const a = account(); return (a && a.branding && typeof a.branding === 'object') ? a.branding : {}; }
  function isCustom(){ return branding().identity === 'custom'; }

  // Contas novas: o e-mail de voucher do servidor ainda usa o remetente e a imagem da RamonGuia.
  window.fluidaVoucherEmailBlocked = function(){ return isCustom(); };

  // Usado pelo voucher (abrir/visualizar). Contas novas não recebem as imagens da RamonGuia.
  window.fluidaVoucherBrand = function(){
    const b = branding(), custom = b.identity === 'custom';
    const fallbackWelcome = custom ? '' : (g('welcomeImage') || '');
    const fallbackBrand = custom ? '' : (g('voucherBrandImage') || '');
    return {
      welcomeImage: b.welcome_image || fallbackWelcome,
      brandImage: b.logo || fallbackBrand
    };
  };

  function applyTheme(){
    const b = branding(), root = document.documentElement.style;
    const primary = HEX.test(b.primary_color || '') ? b.primary_color : DEFAULTS.primary;
    const accent = HEX.test(b.accent_color || '') ? b.accent_color : DEFAULTS.accent;
    root.setProperty('--g', primary);
    root.setProperty('--l', accent);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', primary);
  }

  function applyHeader(){
    const b = branding();
    const mark = document.querySelector('header .brandmark');
    if (mark && b.logo && mark.getAttribute('src') !== b.logo) { mark.setAttribute('src', b.logo); mark.setAttribute('alt', account()?.name || ''); }
    const header = document.querySelector('#app > header');
    if (header && isPlatformAdmin && !header.querySelector('[data-fluida-admin]')) {
      const btn = document.createElement('button');
      btn.className = 'alt'; btn.type = 'button'; btn.dataset.fluidaAdmin = '1';
      btn.textContent = 'Administração Fluida';
      btn.onclick = openPlatformAdmin;
      const logout = [...header.querySelectorAll('button')].find(x => /Sair/.test(x.textContent));
      if (logout && logout.parentNode) logout.parentNode.insertBefore(btn, logout); else header.appendChild(btn);
    }
  }

  async function checkPlatformAdmin(){
    const a = account(), d = client();
    if (!a || !d || adminCheckFor === a.id) return;
    adminCheckFor = a.id;
    try { const r = await d.rpc('fluida_is_platform_admin'); isPlatformAdmin = !r.error && r.data === true; }
    catch(e) { isPlatformAdmin = false; }
    applyHeader();
  }

  function applyLogin(){
    const box = document.getElementById('login');
    if (!box || box.dataset.fluidaBrand) return;
    box.dataset.fluidaBrand = '1';
    const params = new URLSearchParams(location.search);
    if (params.get('modo') === 'cadastro' && g('authMode') !== 'signup' && typeof g('setAuthMode') === 'function') {
      params.delete('modo');
      const url = new URL(location.href); url.search = params.toString(); history.replaceState(null, '', url);
      g('setAuthMode')('signup');
    }
  }

  function readImage(file, maxSide, type, quality){
    return new Promise((resolve, reject) => {
      if (!file) return resolve('');
      if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return reject(new Error('Use uma imagem PNG, JPG ou WEBP.'));
      if (file.size > 15 * 1024 * 1024) return reject(new Error('Imagem muito grande (máximo 15 MB).'));
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL(type, quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
      img.src = url;
    });
  }

  function injectSettings(){
    const dlg = document.getElementById('dlg');
    if (!dlg || !dlg.open || !dlg.querySelector('#a_nm') || dlg.querySelector('#fluida-brand-section')) return;
    if (member()?.role !== 'owner') return;
    const b = branding(), fin = (b.finance_labels && typeof b.finance_labels === 'object') ? b.finance_labels : {};
    const section = document.createElement('section');
    section.id = 'fluida-brand-section';
    section.className = 'crm-details';
    section.innerHTML = `
      <h3>Personalização da sua marca</h3>
      <p class="m">Aparece no topo do app e no voucher. Só a sua conta vê e usa estas configurações.</p>
      <label for="fb-logo">Logo (PNG ou JPG, quadrado de preferência)</label>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <img id="fb-logo-preview" alt="" style="width:64px;height:64px;object-fit:contain;border-radius:10px;background:#f4f5ef;${b.logo ? '' : 'display:none'}" src="${escape(b.logo || '')}">
        <input id="fb-logo" type="file" accept="image/png,image/jpeg,image/webp">
        ${b.logo ? '<label style="display:flex;gap:6px;align-items:center"><input id="fb-logo-remove" type="checkbox"> Remover logo</label>' : ''}
      </div>
      <div class="row" style="display:flex;gap:16px;flex-wrap:wrap">
        <div><label for="fb-primary">Cor principal</label><input id="fb-primary" type="color" value="${escape(HEX.test(b.primary_color || '') ? b.primary_color : DEFAULTS.primary)}"></div>
        <div><label for="fb-accent">Cor de destaque</label><input id="fb-accent" type="color" value="${escape(HEX.test(b.accent_color || '') ? b.accent_color : DEFAULTS.accent)}"></div>
      </div>
      <label for="fb-welcome">Imagem de boas-vindas do voucher (opcional)</label>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <img id="fb-welcome-preview" alt="" style="width:120px;height:68px;object-fit:cover;border-radius:8px;${b.welcome_image ? '' : 'display:none'}" src="${escape(b.welcome_image || '')}">
        <input id="fb-welcome" type="file" accept="image/png,image/jpeg,image/webp">
        ${b.welcome_image ? '<label style="display:flex;gap:6px;align-items:center"><input id="fb-welcome-remove" type="checkbox"> Remover imagem</label>' : ''}
      </div>
      <h4 style="margin:18px 0 4px">Nomes dos custos no Financeiro</h4>
      <p class="m">Troque os nomes das colunas de custo para o seu tipo de passeio. Deixe em branco para usar o padrão.</p>
      <div class="row" style="display:flex;gap:16px;flex-wrap:wrap">
        <div><label for="fb-fin-breakfast">Coluna "${escape(window.fluidaFinLabel ? fluidaFinLabel('breakfast') : 'Café')}"</label><input id="fb-fin-breakfast" maxlength="30" value="${escape(fin.breakfast || '')}" placeholder="Ex.: Alimentação"></div>
        <div><label for="fb-fin-ticket">Coluna "${escape(window.fluidaFinLabel ? fluidaFinLabel('ticket') : 'Cristo')}"</label><input id="fb-fin-ticket" maxlength="30" value="${escape(fin.ticket || '')}" placeholder="Ex.: Ingressos"></div>
        <div><label for="fb-fin-guide">Coluna "${escape(window.fluidaFinLabel ? fluidaFinLabel('guide') : 'Outro guia')}"</label><input id="fb-fin-guide" maxlength="30" value="${escape(fin.guide || '')}" placeholder="Ex.: Guia parceiro"></div>
      </div>
      <p id="fb-msg" class="m" role="status"></p>
      <div class="acts"><button type="button" id="fb-save">Salvar personalização</button><button type="button" class="alt" id="fb-reset">Voltar às cores padrão</button></div>`;
    const acts = dlg.querySelector('.acts');
    dlg.insertBefore(section, acts ? acts.nextSibling : null);
    const preview = (input, img) => input.addEventListener('change', () => { const f = input.files[0]; if (f) { img.src = URL.createObjectURL(f); img.style.display = ''; } });
    preview(section.querySelector('#fb-logo'), section.querySelector('#fb-logo-preview'));
    preview(section.querySelector('#fb-welcome'), section.querySelector('#fb-welcome-preview'));
    section.querySelector('#fb-reset').onclick = () => { section.querySelector('#fb-primary').value = DEFAULTS.primary; section.querySelector('#fb-accent').value = DEFAULTS.accent; };
    section.querySelector('#fb-save').onclick = () => saveBranding(section);
  }

  async function saveBranding(section){
    const msg = section.querySelector('#fb-msg'), btn = section.querySelector('#fb-save');
    const a = account(), d = client();
    if (!a || !d || member()?.role !== 'owner') return notify('Somente o responsável pode alterar a personalização.');
    btn.disabled = true; msg.textContent = 'Salvando…';
    try {
      const next = { ...branding() };
      const logoFile = section.querySelector('#fb-logo').files[0];
      const welcomeFile = section.querySelector('#fb-welcome').files[0];
      if (logoFile) next.logo = await readImage(logoFile, 256, 'image/png');
      else if (section.querySelector('#fb-logo-remove')?.checked) delete next.logo;
      if (welcomeFile) next.welcome_image = await readImage(welcomeFile, 1000, 'image/jpeg', 0.78);
      else if (section.querySelector('#fb-welcome-remove')?.checked) delete next.welcome_image;
      const primary = section.querySelector('#fb-primary').value, accent = section.querySelector('#fb-accent').value;
      if (primary.toLowerCase() === DEFAULTS.primary) delete next.primary_color; else if (HEX.test(primary)) next.primary_color = primary;
      if (accent.toLowerCase() === DEFAULTS.accent) delete next.accent_color; else if (HEX.test(accent)) next.accent_color = accent;
      const fin = {};
      for (const k of ['breakfast', 'ticket', 'guide']) { const v = section.querySelector('#fb-fin-' + k).value.trim().slice(0, 30); if (v) fin[k] = v; }
      if (Object.keys(fin).length) next.finance_labels = fin; else delete next.finance_labels;
      const r = await d.from('accounts').update({ branding: next }).eq('id', a.id).select('branding').single();
      if (r.error) throw new Error(r.error.message);
      a.branding = r.data.branding;
      appliedFor = null; applyAll();
      msg.textContent = 'Personalização salva.';
    } catch (e) { msg.textContent = e.message || 'Não foi possível salvar.'; }
    finally { btn.disabled = false; }
  }

  function openPlatformAdmin(){
    const dlg = document.getElementById('dlg');
    if (!dlg || !isPlatformAdmin) return;
    dlg.innerHTML = `
      <form method="dialog" style="text-align:right"><button class="alt">Fechar</button></form>
      <h2 style="margin:0">Administração Fluida</h2>
      <h3>Cadastrar novo guia / negócio</h3>
      <p class="m">O guia recebe uma conta própria e independente: só ele (e a equipe que ele convidar) vê as reservas, clientes e financeiro dessa conta.</p>
      <label for="pa-name">Nome do negócio</label>
      <input id="pa-name" maxlength="120" placeholder="Ex.: João Guia Rio">
      <label for="pa-email">E-mail do guia (precisa ser um e-mail que ainda não tem conta no Fluida)</label>
      <input id="pa-email" type="email" autocomplete="off" placeholder="guia@exemplo.com">
      <p id="pa-msg" class="m" role="status"></p>
      <div id="pa-result"></div>
      <div class="acts"><button type="button" id="pa-send">Criar convite</button></div>`;
    dlg.querySelector('#pa-send').onclick = sendBusinessInvite;
    dlg.showModal();
  }

  async function sendBusinessInvite(){
    const dlg = document.getElementById('dlg'), msg = dlg.querySelector('#pa-msg'), btn = dlg.querySelector('#pa-send');
    const name = dlg.querySelector('#pa-name').value.trim(), email = dlg.querySelector('#pa-email').value.trim().toLowerCase();
    if (name.length < 2) return msg.textContent = 'Informe o nome do negócio.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg.textContent = 'Informe um e-mail válido.';
    btn.disabled = true; msg.textContent = 'Criando convite…';
    try {
      const r = await client().rpc('fluida_invite_business', { p_email: email, p_business_name: name });
      if (r.error) throw new Error(r.error.message);
      const link = `${location.origin}/?convite=${encodeURIComponent(email)}&modo=cadastro`;
      const until = r.data?.expires_at ? new Date(r.data.expires_at).toLocaleDateString('pt-BR') : '';
      const text = `Olá! Sua conta no Fluida (${name}) está pronta para ser criada. Acesse ${link} e cadastre uma senha usando o e-mail ${email}.${until ? ' O convite vale até ' + until + '.' : ''}`;
      msg.textContent = 'Convite criado. Envie o link abaixo para o guia.';
      dlg.querySelector('#pa-result').innerHTML = `
        <label for="pa-link">Link de cadastro</label>
        <input id="pa-link" readonly value="${escape(link)}">
        <div class="acts">
          <button type="button" class="alt" id="pa-copy">Copiar mensagem</button>
          <a class="button" style="display:inline-block;padding:9px 14px;border-radius:10px;background:#25d366;color:#fff;text-decoration:none;font-weight:600" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">Enviar pelo WhatsApp</a>
        </div>`;
      dlg.querySelector('#pa-copy').onclick = async () => { try { await navigator.clipboard.writeText(text); msg.textContent = 'Mensagem copiada.'; } catch(e) { msg.textContent = text; } };
    } catch (e) { msg.textContent = e.message || 'Não foi possível criar o convite.'; }
    finally { btn.disabled = false; }
  }

  const safe = fn => { try { const r = fn(); if (r && r.catch) r.catch(e => console.warn('Fluida brand', e)); } catch (e) { console.warn('Fluida brand', e); } };
  function applyAll(){
    const a = account();
    if (a) {
      const key = a.id + JSON.stringify([branding().primary_color, branding().accent_color]);
      if (appliedFor !== key) { appliedFor = key; safe(applyTheme); }
      safe(applyHeader);
      safe(checkPlatformAdmin);
    }
    safe(applyLogin);
    safe(injectSettings);
  }

  let scheduled = false;
  const schedule = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; try { applyAll(); } catch (e) { console.warn('Fluida brand', e); } }); };
  function boot(){
    const app = document.getElementById('app'), dlg = document.getElementById('dlg');
    const obs = new MutationObserver(schedule);
    if (app) obs.observe(app, { childList: true, subtree: true });
    if (dlg) obs.observe(dlg, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
