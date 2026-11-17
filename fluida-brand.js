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
  window.fluidaVoucherEmailBlocked = function(){ return false; };
  // Contas novas enviam pelo envio por marca (remetente com o nome do guia e resposta para o e-mail dele).
  window.fluidaVoucherFunction = function(){ return isCustom() ? 'send-voucher-guia' : 'send-booking-voucher'; };

  // Usado pelo voucher (abrir/visualizar). Contas novas não recebem as imagens da RamonGuia.
  window.fluidaVoucherBrand = function(){
    const b = branding(), custom = b.identity === 'custom';
    const fallbackWelcome = custom ? '' : (g('welcomeImage') || '');
    const fallbackBrand = custom ? '' : (g('voucherBrandImage') || '');
    return {
      welcomeImage: b.welcome_image || fallbackWelcome,
      brandImage: b.logo || fallbackBrand,
      layout: (b.voucher && typeof b.voucher === 'object') ? b.voucher : {},
      primaryColor: HEX.test(b.primary_color || '') ? b.primary_color : ''
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

  const VOUCHER_PARTS = [
    ['qr', 'QR code do localizador'], ['client_email', 'E-mail do cliente'], ['welcome_image', 'Imagem de boas-vindas'],
    ['included', 'Itens inclusos'], ['meeting', 'Horário e ponto de encontro'], ['payment', 'Valores e pagamentos'],
    ['instructions', 'Informações para o cliente'], ['policy', 'Política de cancelamento'], ['review', 'Link de avaliação']
  ];
  function collectVoucher(section){
    const out = {};
    const txt = (id, max) => section.querySelector(id).value.trim().slice(0, max);
    const sender = txt('#fb-sender', 60), reply = txt('#fb-reply', 254).toLowerCase();
    const welcome = txt('#fb-welcome-text', 800), footer = txt('#fb-footer-text', 800);
    if (sender) out.sender_name = sender;
    if (reply) out.reply_to = reply;
    if (welcome) out.welcome_text = welcome;
    if (footer) out.footer_text = footer;
    const bg = section.querySelector('#fb-header-bg').value;
    if (HEX.test(bg) && bg.toLowerCase() !== '#e2ddc7') out.header_bg = bg;
    const show = {};
    for (const box of section.querySelectorAll('[data-voucher-part]')) if (!box.checked) show[box.dataset.voucherPart] = false;
    if (Object.keys(show).length) out.show = show;
    return out;
  }
  function previewVoucher(section){
    const a = account();
    if (typeof renderVoucherHTML !== 'function' || !a) return;
    const today = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const sample = { id: 'exemplo', booking_code: 'EXEMPLO1', client_name: 'Maria Exemplo', client_email: 'maria@exemplo.com', client_phone: '+55 21 99999-9999',
      tour_date: today, tour_time: '09:00', itinerary: 'Passeio de exemplo', pax: 2, total: 500, ticket_included: true, ticket_info: 'Ingresso de exemplo',
      pickup_location: 'Hotel do cliente', client_message: 'Leve protetor solar e água.', payments: [{ amount: 200, voided: false }], voucher_options: { language: 'pt', transport: true } };
    const base = window.fluidaVoucherBrand();
    const primary = section.querySelector('#fb-primary').value;
    const logoPrev = section.querySelector('#fb-logo-preview'), welcomePrev = section.querySelector('#fb-welcome-preview');
    const settings = { ...base, layout: collectVoucher(section), primaryColor: HEX.test(primary) ? primary : base.primaryColor,
      brandImage: logoPrev && logoPrev.style.display !== 'none' && logoPrev.src ? logoPrev.src : base.brandImage,
      welcomeImage: welcomePrev && welcomePrev.style.display !== 'none' && welcomePrev.src ? welcomePrev.src : base.welcomeImage };
    try {
      const r = renderVoucherHTML(sample, a, [], settings);
      const w = window.open('', '_blank');
      if (!w) return notify('Permita abrir a janela do voucher no navegador.');
      w.document.write(r.html); w.document.close();
    } catch (e) { notify(e.message); }
  }

  function injectSettings(){
    const dlg = document.getElementById('dlg');
    if (!dlg || !dlg.open || !dlg.querySelector('#a_nm') || dlg.querySelector('#fluida-brand-section')) return;
    if (member()?.role !== 'owner') return;
    const b = branding(), fin = (b.finance_labels && typeof b.finance_labels === 'object') ? b.finance_labels : {};
    const v = (b.voucher && typeof b.voucher === 'object') ? b.voucher : {};
    const showPart = k => !(v.show && v.show[k] === false);
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
      <h4 style="margin:18px 0 4px">E-mail do voucher</h4>
      <p class="m">O voucher chega ao cliente com o nome abaixo como remetente. Quando o cliente responder, a resposta vai para o seu e-mail.</p>
      <div class="row" style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:220px"><label for="fb-sender">Nome do remetente</label><input id="fb-sender" maxlength="60" value="${escape(v.sender_name || '')}" placeholder="${escape(account()?.name || 'Seu negócio')}"></div>
        <div style="flex:1;min-width:220px"><label for="fb-reply">Seu e-mail (para receber as respostas)</label><input id="fb-reply" type="email" maxlength="254" value="${escape(v.reply_to || '')}" placeholder="voce@exemplo.com"></div>
      </div>
      <h4 style="margin:18px 0 4px">Como o voucher aparece</h4>
      <label for="fb-welcome-text">Mensagem de boas-vindas (português)</label>
      <textarea id="fb-welcome-text" rows="3" maxlength="800" placeholder="Com este voucher confirmamos sua reserva. Confira os detalhes e as informações importantes para sua experiência.">${escape(v.welcome_text || '')}</textarea>
      <label for="fb-footer-text">Texto final (contato, WhatsApp, Instagram, recomendações…)</label>
      <textarea id="fb-footer-text" rows="3" maxlength="800" placeholder="Ex.: Dúvidas? WhatsApp (21) 99999-9999 · @seuinstagram">${escape(v.footer_text || '')}</textarea>
      <div><label for="fb-header-bg">Cor da faixa do logo</label><input id="fb-header-bg" type="color" value="${escape(HEX.test(v.header_bg || '') ? v.header_bg : '#e2ddc7')}"></div>
      <p class="m" style="margin-bottom:4px">Informações que aparecem no voucher:</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px 16px">
        ${VOUCHER_PARTS.map(([k, label]) => `<label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" data-voucher-part="${k}" style="width:auto;min-height:0" ${showPart(k) ? 'checked' : ''}> ${escape(label)}</label>`).join('')}
      </div>
      <div class="acts"><button type="button" class="alt" id="fb-preview">Ver exemplo do voucher</button></div>
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
    const bs = billingState();
    if (bs.kind !== 'exempt') {
      const sub = document.createElement('section');
      sub.className = 'crm-details'; sub.id = 'fluida-billing-section';
      const a = account();
      sub.innerHTML = `<h3>Assinatura</h3>
        <p>${bs.kind === 'paid' ? 'Em dia até <b>' + new Date(bs.until).toLocaleDateString('pt-BR') + '</b>' : bs.kind === 'trial' ? 'Teste grátis até <b>' + new Date(bs.until).toLocaleDateString('pt-BR') + '</b>' : '<b style="color:#a4332b">Conta em modo somente leitura</b>'}
        ${a?.mp_preapproval_id && a?.billing_status === 'active' ? ' · renovação automática no cartão' : ''}</p>
        <div class="acts"><button type="button" id="fb-subscribe">${bs.kind === 'paid' ? 'Pagar mais um mês (Pix)' : 'Assinar (R$ ' + PRICE + '/mês)'}</button>
        ${a?.mp_preapproval_id && a?.billing_status === 'active' ? '<button type="button" class="alt" id="fb-cancel-card">Cancelar renovação no cartão</button>' : ''}</div>
        <p id="fb-billing-msg" class="m" role="status"></p>`;
      dlg.insertBefore(sub, section);
      sub.querySelector('#fb-subscribe').onclick = openSubscribe;
      const cancel = sub.querySelector('#fb-cancel-card');
      if (cancel) cancel.onclick = async () => {
        if (!confirm('Cancelar a renovação automática? Sua conta continua liberada até o fim do período já pago.')) return;
        try { await billingCall({ action: 'cancel_card' }); await refreshAccount(); sub.querySelector('#fb-billing-msg').textContent = 'Renovação cancelada.'; }
        catch (e) { sub.querySelector('#fb-billing-msg').textContent = e.message; }
      };
    }
    const preview = (input, img) => input.addEventListener('change', () => { const f = input.files[0]; if (f) { img.src = URL.createObjectURL(f); img.style.display = ''; } });
    preview(section.querySelector('#fb-logo'), section.querySelector('#fb-logo-preview'));
    preview(section.querySelector('#fb-welcome'), section.querySelector('#fb-welcome-preview'));
    section.querySelector('#fb-reset').onclick = () => { section.querySelector('#fb-primary').value = DEFAULTS.primary; section.querySelector('#fb-accent').value = DEFAULTS.accent; };
    section.querySelector('#fb-save').onclick = () => saveBranding(section);
    section.querySelector('#fb-preview').onclick = () => previewVoucher(section);
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
      const voucher = collectVoucher(section);
      if (voucher.reply_to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(voucher.reply_to)) throw new Error('Confira o seu e-mail para respostas.');
      if (Object.keys(voucher).length) next.voucher = voucher; else delete next.voucher;
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
      <div class="acts"><button type="button" id="pa-send">Criar convite</button></div>
      <h3 style="margin-top:28px">Convites pendentes</h3>
      <div id="pa-invites"><p class="m">Carregando…</p></div>
      <h3 style="margin-top:28px">Guias cadastrados</h3>
      <div id="pa-accounts"><p class="m">Carregando…</p></div>`;
    dlg.querySelector('#pa-send').onclick = sendBusinessInvite;
    dlg.showModal();
    loadAdminOverview();
  }

  function billingLabel(x){
    if (x.billing_status === 'exempt') return '<span>Isenta</span>';
    if (x.paid_until && Date.parse(x.paid_until) > Date.now()) return `<span style="color:#205c38">Paga até ${fmtDate(x.paid_until)}</span>`;
    if (x.trial_ends_at && Date.parse(x.trial_ends_at) > Date.now()) return `<span style="color:#705008">Teste até ${fmtDate(x.trial_ends_at)}</span>`;
    return '<b style="color:#a4332b">Bloqueada (só leitura)</b>';
  }
  const fmtDate = v => v ? new Date(v).toLocaleDateString('pt-BR') : '—';
  function inviteLink(email){ return `${location.origin}/?convite=${encodeURIComponent(email)}&modo=cadastro`; }
  async function loadAdminOverview(){
    const dlg = document.getElementById('dlg');
    const boxA = dlg && dlg.querySelector('#pa-accounts'), boxI = dlg && dlg.querySelector('#pa-invites');
    if (!boxA || !boxI) return;
    try {
      const r = await client().rpc('fluida_admin_overview');
      if (r.error) throw new Error(r.error.message);
      const accounts = r.data?.accounts || [], invites = r.data?.invites || [];
      boxI.innerHTML = invites.length ? `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr><th style="text-align:left">Negócio</th><th style="text-align:left">E-mail</th><th style="text-align:left">Validade</th><th></th></tr></thead><tbody>
        ${invites.map(i => `<tr style="border-top:1px solid #dde4db"><td>${escape(i.business_name)}</td><td>${escape(i.email)}</td>
          <td>${i.expired ? '<b style="color:#a4332b">Vencido</b>' : 'até ' + fmtDate(i.expires_at)}</td>
          <td style="text-align:right"><button type="button" class="alt" data-copy-invite="${escape(i.email)}" data-name="${escape(i.business_name)}">${i.expired ? 'Renovar' : 'Copiar link'}</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="m">Nenhum convite pendente.</p>';
      boxA && setTimeout(() => boxA.querySelectorAll('[data-billing-action]').forEach(sel => sel.onchange = async () => {
        const action = sel.value; if (!action) return;
        const r = await client().rpc('fluida_admin_set_billing', { p_account: sel.dataset.billingAction, p_action: action, p_days: 7 });
        if (r.error) notify(r.error.message);
        loadAdminOverview();
      }), 0);
      boxI.querySelectorAll('[data-copy-invite]').forEach(btn => btn.onclick = async () => {
        const email = btn.dataset.copyInvite, name = btn.dataset.name;
        if (btn.textContent === 'Renovar') {
          const rr = await client().rpc('fluida_invite_business', { p_email: email, p_business_name: name });
          if (rr.error) return notify(rr.error.message);
          await loadAdminOverview(); return;
        }
        try { await navigator.clipboard.writeText(inviteLink(email)); btn.textContent = 'Copiado ✓'; } catch (e) { notify(inviteLink(email)); }
      });
      boxA.innerHTML = accounts.length ? `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr><th style="text-align:left">Negócio</th><th style="text-align:left">Responsável</th><th>Equipe</th><th>Reservas</th><th style="text-align:left">Último acesso</th><th style="text-align:left">Desde</th><th style="text-align:left">Assinatura</th><th></th></tr></thead><tbody>
        ${accounts.map(x => `<tr style="border-top:1px solid #dde4db"><td>${escape(x.name)}${x.custom ? '' : ' <span class="m">(conta original)</span>'}</td><td>${escape(x.owner_email || '—')}</td>
          <td style="text-align:center">${Number(x.members) || 0}</td><td style="text-align:center">${Number(x.bookings) || 0}</td>
          <td>${fmtDate(x.last_sign_in_at)}</td><td>${fmtDate(x.created_at)}</td><td>${billingLabel(x)}</td>
          <td style="white-space:nowrap;text-align:right">${x.custom ? `<select data-billing-action="${escape(x.id)}" aria-label="Ação de assinatura"><option value="">Ações…</option><option value="extend">+7 dias grátis</option><option value="exempt">Isentar</option><option value="charge">Voltar a cobrar</option></select>` : ''}</td></tr>`).join('')}
        </tbody></table></div><p class="m">${accounts.length} conta(s). Por privacidade, aqui aparecem só números — as reservas e os clientes de cada guia continuam visíveis apenas para ele.</p>` : '<p class="m">Nenhuma conta.</p>';
    } catch (e) {
      boxA.innerHTML = boxI.innerHTML = `<p class="m">Não foi possível carregar: ${escape(e.message)}</p>`;
    }
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
      loadAdminOverview();
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

  // ---------------- Assinatura (Mercado Pago) ----------------
  const PRICE = 100;
  function billingState(){
    const a = account();
    if (!a || !a.billing_status || a.billing_status === 'exempt') return { kind: 'exempt' };
    const now = Date.now(), trial = a.trial_ends_at ? Date.parse(a.trial_ends_at) : 0, paid = a.paid_until ? Date.parse(a.paid_until) : 0;
    if (paid > now) return { kind: 'paid', until: paid, status: a.billing_status };
    if (trial > now) return { kind: 'trial', until: trial, days: Math.max(1, Math.ceil((trial - now) / 864e5)) };
    return { kind: 'blocked', status: a.billing_status };
  }
  window.fluidaBillingState = billingState;
  function applyBillingBanner(){
    const app = document.getElementById('app'), header = document.querySelector('#app > header');
    if (!app || !header) return;
    const s = billingState(), owner = member()?.role === 'owner';
    let el = document.getElementById('fluida-billing-banner');
    const show = s.kind === 'trial' || s.kind === 'blocked';
    if (!show) { if (el) { el.remove(); document.body.style.paddingBottom = ''; } return; }
    const key = s.kind + (s.days || '') + owner;
    if (el && el.dataset.key === key) return;
    if (!el) { el = document.createElement('div'); el.id = 'fluida-billing-banner'; header.insertAdjacentElement('afterend', el); }
    el.dataset.key = key;
    const blocked = s.kind === 'blocked';
    el.setAttribute('role', 'status');
    el.style.cssText = `position:fixed;left:0;right:0;bottom:0;z-index:40;padding:10px 16px calc(10px + env(safe-area-inset-bottom));display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;font-size:15px;box-shadow:0 -4px 16px #17323420;${blocked ? 'background:#fceceb;color:#942d27' : 'background:#fff5d9;color:#705008'}`;
    document.body.style.paddingBottom = '76px';
    el.innerHTML = blocked
      ? `<b>Sua conta está em modo somente leitura.</b><span>Você continua vendo e exportando tudo, mas para criar ou editar reservas é preciso assinar (R$ ${PRICE}/mês).</span>${owner ? '<button type="button" data-subscribe style="background:#942d27;color:#fff">Assinar agora</button>' : '<span>Peça ao responsável da conta para assinar.</span>'}`
      : `<span>Teste grátis: <b>${s.days === 1 ? 'último dia' : 'faltam ' + s.days + ' dias'}</b>. Depois, R$ ${PRICE}/mês no cartão ou Pix.</span>${owner ? '<button type="button" class="alt" data-subscribe>Assinar</button>' : ''}`;
    const b = el.querySelector('[data-subscribe]'); if (b) b.onclick = openSubscribe;
  }

  function billingCall(payload){
    return client().functions.invoke('fluida-billing', { body: payload }).then(async r => {
      let data = r.data;
      if (r.error) { try { if (r.error.context?.json) data = await r.error.context.json(); } catch (e) {} }
      if (r.error || !data?.ok) throw new Error(data?.error || 'Não foi possível concluir agora.');
      return data;
    });
  }

  let pixTimer = null;
  function openSubscribe(){
    const dlg = document.getElementById('dlg'); if (!dlg) return;
    if (pixTimer) { clearInterval(pixTimer); pixTimer = null; }
    const s = billingState(), email = member()?.email || '';
    dlg.innerHTML = `
      <form method="dialog" style="text-align:right"><button class="alt">Fechar</button></form>
      <h2 style="margin:0">Assinatura Fluida</h2>
      <p style="font-size:18px;margin:8px 0"><b>R$ ${PRICE},00 por mês</b></p>
      <p class="m">${s.kind === 'trial' ? 'Seu teste grátis continua valendo; o primeiro mês é cobrado a partir de agora.' : s.kind === 'paid' ? 'Sua assinatura está em dia até ' + new Date(s.until).toLocaleDateString('pt-BR') + '. Um novo pagamento soma mais um mês.' : 'Assine para voltar a criar e editar reservas. Nenhum dado foi apagado.'}</p>
      <label for="sb-email">E-mail para o pagamento</label>
      <input id="sb-email" type="email" value="${escape(email)}" autocomplete="email">
      <p class="m">No cartão, use o mesmo e-mail da sua conta do Mercado Pago.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:14px 0">
        <button type="button" id="sb-card" style="padding:16px;text-align:left;line-height:1.4"><b>Cartão de crédito</b><br><span style="font-weight:400">Renova sozinho todo mês. Cancele quando quiser.</span></button>
        <button type="button" id="sb-pix" class="alt" style="padding:16px;text-align:left;line-height:1.4"><b>Pix</b><br><span style="font-weight:400">Pague 1 mês agora com QR Code ou copia e cola.</span></button>
      </div>
      <p id="sb-msg" class="m" role="status"></p>
      <div id="sb-pix-box"></div>
      <p class="m" style="margin-top:16px">Pagamento processado pelo Mercado Pago. O Fluida não vê nem guarda os dados do seu cartão.</p>`;
    const msg = dlg.querySelector('#sb-msg'), mail = () => dlg.querySelector('#sb-email').value.trim();
    dlg.querySelector('#sb-card').onclick = async () => {
      msg.textContent = 'Abrindo o Mercado Pago…';
      try { const d = await billingCall({ action: 'checkout_card', payer_email: mail() }); location.href = d.url; }
      catch (e) { msg.textContent = e.message; }
    };
    dlg.querySelector('#sb-pix').onclick = async () => {
      msg.textContent = 'Gerando o Pix…';
      try {
        const d = await billingCall({ action: 'pix', payer_email: mail() });
        msg.textContent = 'Pague pelo app do seu banco. A liberação é automática assim que o Pix for confirmado.';
        const box = dlg.querySelector('#sb-pix-box');
        box.innerHTML = `<div style="text-align:center">${d.qr_code_base64 ? `<img alt="QR Code do Pix" src="data:image/png;base64,${escape(d.qr_code_base64)}" style="width:220px;height:220px">` : ''}</div>
          <label for="sb-pix-code">Pix copia e cola</label><textarea id="sb-pix-code" rows="3" readonly>${escape(d.qr_code)}</textarea>
          <div class="acts"><button type="button" class="alt" id="sb-copy">Copiar código</button></div>
          <p class="m" id="sb-pix-status">Aguardando pagamento…</p>`;
        box.querySelector('#sb-copy').onclick = async () => { try { await navigator.clipboard.writeText(d.qr_code); box.querySelector('#sb-copy').textContent = 'Copiado ✓'; } catch (e) {} };
        let tries = 0;
        pixTimer = setInterval(async () => {
          if (!dlg.open || ++tries > 120) { clearInterval(pixTimer); pixTimer = null; return; }
          try {
            const c = await billingCall({ action: 'check_pix', payment_id: d.payment_id });
            if (c.status === 'approved') {
              clearInterval(pixTimer); pixTimer = null;
              box.querySelector('#sb-pix-status').innerHTML = '<b style="color:#205c38">Pagamento confirmado! Conta liberada.</b>';
              await refreshAccount();
            }
          } catch (e) {}
        }, 5000);
      } catch (e) { msg.textContent = e.message; }
    };
    if (!dlg.open) dlg.showModal();
  }
  window.fluidaOpenSubscribe = openSubscribe;

  async function refreshAccount(){
    const a = account(), d = client(); if (!a || !d) return;
    const r = await d.from('accounts').select('billing_status,trial_ends_at,paid_until,mp_preapproval_id').eq('id', a.id).single();
    if (!r.error && r.data) { Object.assign(a, r.data); const el = document.getElementById('fluida-billing-banner'); if (el) el.dataset.key = ''; applyAll(); }
  }

  let returnHandled = false;
  function handleCheckoutReturn(){
    if (returnHandled || !account()) return;
    const params = new URLSearchParams(location.search);
    if (params.get('assinatura') !== 'retorno') return;
    returnHandled = true;
    params.delete('assinatura'); const u = new URL(location.href); u.search = params.toString(); history.replaceState(null, '', u);
    notify('Recebemos o retorno do Mercado Pago. A liberação costuma levar poucos minutos; o app atualiza sozinho.');
    let n = 0; const timer = setInterval(async () => { await refreshAccount(); if (billingState().kind === 'paid' || ++n > 24) clearInterval(timer); }, 10000);
  }

  function applyAll(){
    const a = account();
    if (a) {
      const key = a.id + JSON.stringify([branding().primary_color, branding().accent_color]);
      if (appliedFor !== key) { appliedFor = key; safe(applyTheme); }
      safe(applyHeader);
      safe(checkPlatformAdmin);
      safe(applyBillingBanner);
      safe(handleCheckoutReturn);
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
