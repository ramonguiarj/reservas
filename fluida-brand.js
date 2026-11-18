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

  function enhanceSignup(box){
    const rules = box.querySelector('#password-rules'), pw = box.querySelector('#pw'), pw2 = box.querySelector('#pw_confirm');
    if (!rules || !pw || rules.dataset.enhanced) return;
    rules.dataset.enhanced = '1';
    const h = box.querySelector('h2'); if (h) h.textContent = 'Criar sua conta';
    const showBtn = [...box.querySelectorAll('button')].find(b => /Mostrar senha|Ocultar senha/.test(b.textContent));
    const anchor = showBtn || pw;
    const wrap = document.createElement('div');
    wrap.id = 'fluida-pw-rules';
    wrap.style.cssText = 'margin:10px 0 14px;padding:12px 14px;border:1px solid #d7dfd7;border-radius:12px;background:#fff';
    wrap.innerHTML = '<b style="display:block;margin-bottom:6px">Sua senha precisa ter:</b>';
    rules.style.cssText = 'list-style:none;margin:0;padding:0;line-height:1.9';
    wrap.appendChild(rules);
    wrap.insertAdjacentHTML('beforeend', '<p class="m" style="margin:8px 0 0">Exemplo de senha forte: <code>Passeio@2026</code></p>');
    anchor.insertAdjacentElement('afterend', wrap);
    const legal = document.createElement('p'); legal.className = 'm'; legal.style.cssText = 'margin:12px 0 0;font-size:14px';
    legal.innerHTML = 'Ao criar a conta, você concorda com os <a href="/termos.html" target="_blank" rel="noopener">Termos de uso</a> e a <a href="/privacidade.html" target="_blank" rel="noopener">Política de privacidade</a>.';
    const submit = [...box.querySelectorAll('button')].find(b => /criar|cadastr/i.test(b.textContent) && !/senha/i.test(b.textContent));
    (submit || wrap).insertAdjacentElement(submit ? 'beforebegin' : 'afterend', legal);
    const match = document.createElement('p'); match.id = 'fluida-pw-match'; match.className = 'm'; match.style.margin = '6px 0';
    const confirmBtn = [...box.querySelectorAll('button')].find(b => /confirmação/i.test(b.textContent));
    (confirmBtn || pw2 || pw).insertAdjacentElement('afterend', match);
    const checks = v => ({ length: v.length >= 8, upper: /[A-Z]/.test(v), lower: /[a-z]/.test(v), number: /[0-9]/.test(v), special: /[^A-Za-z0-9\s]/.test(v) });
    const labels = { length: 'Pelo menos 8 caracteres', upper: 'Uma letra MAIÚSCULA', lower: 'Uma letra minúscula', number: 'Um número (0-9)', special: 'Um caractere especial (ex.: ! @ # $ %)' };
    const paint = () => {
      const c = checks(pw.value);
      for (const li of rules.querySelectorAll('[data-rule]')) {
        const ok = !!c[li.dataset.rule];
        li.innerHTML = `<span aria-hidden="true" style="display:inline-block;width:1.4em;font-weight:700;color:${ok ? '#205c38' : '#9aa7a2'}">${ok ? '✓' : '○'}</span>${escape(labels[li.dataset.rule] || li.textContent)}`;
        li.style.color = ok ? '#205c38' : '#52665f'; li.style.fontWeight = ok ? '600' : '400';
        li.setAttribute('aria-label', (labels[li.dataset.rule] || '') + (ok ? ' — cumprido' : ' — falta'));
      }
      if (pw2) {
        if (!pw2.value) { match.textContent = ''; }
        else if (pw2.value === pw.value) { match.innerHTML = '<span style="color:#205c38;font-weight:600">✓ As senhas são iguais</span>'; }
        else { match.innerHTML = '<span style="color:#a4332b">As senhas ainda não são iguais</span>'; }
      }
    };
    pw.addEventListener('input', paint); if (pw2) pw2.addEventListener('input', paint);
    for (const b of box.querySelectorAll('button')) {
      if (/Mostrar senha/.test(b.textContent)) b.textContent = '👁 Mostrar senha';
      if (/Mostrar confirmação/.test(b.textContent)) b.textContent = '👁 Mostrar senha repetida';
    }
    paint();
  }

  function applyLogin(){
    const box = document.getElementById('login');
    if (box) safe(() => enhanceSignup(box));
    if (box && !box.querySelector('#password-rules') && !box.querySelector('#fluida-conheca')) {
      const p = document.createElement('p'); p.id = 'fluida-conheca'; p.className = 'm'; p.style.cssText = 'margin:18px 0 0;text-align:center;font-size:15px';
      p.innerHTML = 'Ainda não usa o Fluida? <a href="/conheca" style="font-weight:700">Conheça e teste grátis por 7 dias</a>';
      box.appendChild(p);
    }
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
  const SEND_DOMAIN = 'reservasfluida.com.br';
  const RESERVED = ['admin','administrador','suporte','fluida','reservasfluida','financeiro','cobranca','postmaster','abuse','noreply','no-reply','contato','equipe'];
  const LOCAL_OK = s => /^[a-z0-9](?:[a-z0-9.-]{1,38})[a-z0-9]$/.test(s) && !/[.-]{2}/.test(s) && !RESERVED.includes(s);
  const slugLocal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);
  function collectVoucher(section){
    const out = {};
    const txt = (id, max) => section.querySelector(id).value.trim().slice(0, max);
    const sender = txt('#fb-sender', 60), reply = txt('#fb-reply', 254).toLowerCase();
    const welcome = txt('#fb-welcome-text', 800), footer = txt('#fb-footer-text', 800);
    if (sender) out.sender_name = sender;
    const local = txt('#fb-local', 40).toLowerCase();
    if (local) { if (!LOCAL_OK(local)) throw new Error('Confira o endereço de envio: use só letras, números, ponto ou hífen (3 a 40 caracteres).'); out.sender_local = local; }
    if (reply) out.reply_to = reply;
    const pix = txt('#fb-pix', 140); if (pix) out.pix_key = pix;
    const pixCity = txt('#fb-pix-city', 15); if (pixCity) out.pix_city = pixCity;
    const rem = section.querySelector('#fb-reminder'); if (rem) out.reminder = rem.checked;
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
      <p class="m">O voucher chega ao cliente com o seu nome e o seu endereço de envio. Quando o cliente responder, a resposta vai para o seu e-mail.</p>
      <div class="row" style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:220px"><label for="fb-sender">Nome do remetente</label><input id="fb-sender" maxlength="60" value="${escape(v.sender_name || '')}" placeholder="${escape(account()?.name || 'Seu negócio')}"></div>
        <div style="flex:1;min-width:220px"><label for="fb-reply">Seu e-mail (para receber as respostas)</label><input id="fb-reply" type="email" maxlength="254" value="${escape(v.reply_to || '')}" placeholder="voce@exemplo.com"></div>
      </div>
      <label for="fb-local">Endereço de envio</label>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><input id="fb-local" maxlength="40" autocapitalize="off" autocomplete="off" spellcheck="false" style="flex:1;min-width:160px;max-width:280px" value="${escape(v.sender_local || '')}" placeholder="${escape(slugLocal(v.sender_name || account()?.name) || 'seunome')}"><b>@${SEND_DOMAIN}</b></div>
      <p class="m" style="font-size:13px">O cliente vê: <b id="fb-local-preview"></b>. Use só letras, números, ponto ou hífen. Se deixar em branco, usamos o seu nome.</p>
      <h4 style="margin:18px 0 4px">Lembrete na véspera</h4>
      <label style="display:flex;gap:10px;align-items:flex-start;font-weight:400"><input id="fb-reminder" type="checkbox" style="width:auto;margin-top:4px" ${(isCustom() ? v.reminder !== false : v.reminder === true) ? 'checked' : ''}> <span>Enviar automaticamente ao cliente, às 17h do dia anterior ao passeio, um e-mail "Seu passeio é amanhã" com horário, ponto de encontro e o voucher. Só para reservas com e-mail do cliente.</span></label>
      <h4 style="margin:18px 0 4px">Cobrança pelo WhatsApp</h4>
      <p class="m">Nas reservas com saldo em aberto aparece o botão <b>Cobrar no WhatsApp</b>, com a mensagem pronta no idioma do cliente. Se quiser, a mensagem já leva a sua chave Pix.</p>
      <label for="fb-pix">Sua chave Pix (opcional)</label>
      <input id="fb-pix" maxlength="140" autocomplete="off" value="${escape(v.pix_key || '')}" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória">
      <p class="m" style="font-size:13px;margin:4px 0 0">Se a chave for telefone, use +55 e o DDD, por exemplo +5521999990000.</p>
      <label for="fb-pix-city">Cidade da chave Pix</label>
      <input id="fb-pix-city" maxlength="15" value="${escape(v.pix_city || '')}" placeholder="RIO DE JANEIRO">
      <h4 style="margin:18px 0 4px">Receber o sinal pelo link de reserva</h4>
      <p class="m">Conecte o seu Mercado Pago para o sinal ser confirmado sozinho quando o cliente pagar. Sem conectar, o cliente paga na sua chave Pix acima e você confirma.</p>
      <div id="fb-mp" class="m">Verificando…</div>
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
      <h4 style="margin:22px 0 4px">Trazer reservas de uma planilha</h4>
      <p class="m">Vem de planilha, Google Sheets ou outro sistema? Envie um arquivo Excel (.xlsx) ou CSV e as reservas entram de uma vez, com os pagamentos já feitos.</p>
      <div class="acts" style="margin-top:6px"><button type="button" class="alt" id="fb-import">Importar planilha</button></div>
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
        <p>${bs.kind === 'paid' ? 'Em dia até <b>' + new Date(bs.until).toLocaleDateString('pt-BR') + '</b>' : bs.kind === 'trial' ? 'Teste grátis até <b>' + new Date(bs.until).toLocaleDateString('pt-BR') + '</b>' : '<b style="color:#a4332b">Conta em modo só visualização — bloqueio em ' + new Date(bs.blockAt).toLocaleDateString('pt-BR') + '</b>'}
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
    const localIn = section.querySelector('#fb-local'), localOut = section.querySelector('#fb-local-preview'), senderIn = section.querySelector('#fb-sender');
    const updLocal = () => { const raw = localIn.value.trim().toLowerCase(), fallback = slugLocal(senderIn.value || account()?.name) || 'reservas'; localIn.placeholder = fallback; const loc = raw || fallback; localOut.textContent = `${senderIn.value.trim() || account()?.name || ''} <${loc}@${SEND_DOMAIN}>`; localOut.style.color = raw && !LOCAL_OK(raw) ? '#9e2424' : ''; };
    localIn.addEventListener('input', () => { localIn.value = localIn.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''); updLocal(); });
    senderIn.addEventListener('input', updLocal); updLocal();
    section.querySelector('#fb-reset').onclick = () => { section.querySelector('#fb-primary').value = DEFAULTS.primary; section.querySelector('#fb-accent').value = DEFAULTS.accent; };
    section.querySelector('#fb-save').onclick = () => saveBranding(section);
    section.querySelector('#fb-import').onclick = () => openImport();
    safe(() => paintMp(section));
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
      <div id="pa-stats" style="margin:14px 0 4px"></div>
      <h3>Cadastrar novo guia / negócio</h3>
      <p class="m">O guia recebe uma conta própria e independente: só ele (e a equipe que ele convidar) vê as reservas, clientes e financeiro dessa conta.</p>
      <label for="pa-name">Nome do negócio</label>
      <input id="pa-name" maxlength="120" placeholder="Ex.: João Guia Rio">
      <label for="pa-email">E-mail do guia (precisa ser um e-mail que ainda não tem conta no Fluida)</label>
      <input id="pa-email" type="email" autocomplete="off" placeholder="guia@exemplo.com">
      <p id="pa-msg" class="m" role="status"></p>
      <div id="pa-result"></div>
      <div class="acts"><button type="button" id="pa-send">Criar convite</button></div>
      <h3 style="margin-top:28px">Pedidos de teste <span class="m" style="font-weight:400;font-size:14px">(vindos de reservasfluida.com.br/conheca)</span></h3>
      <div id="pa-leads"><p class="m">Carregando…</p></div>
      <h3 style="margin-top:28px">Convites pendentes</h3>
      <div id="pa-invites"><p class="m">Carregando…</p></div>
      <h3 style="margin-top:28px">Guias cadastrados</h3>
      <div id="pa-accounts"><p class="m">Carregando…</p></div>`;
    dlg.querySelector('#pa-send').onclick = sendBusinessInvite;
    dlg.showModal();
    loadAdminOverview();
    loadLeads();
  }

  function billingLabel(x){
    if (x.billing_status === 'exempt' || !x.custom) return '<span>Isenta</span>';
    if (x.paid_until && Date.parse(x.paid_until) > Date.now()) return `<span style="color:#205c38">Paga até ${fmtDate(x.paid_until)}</span>`;
    if (x.trial_ends_at && Date.parse(x.trial_ends_at) > Date.now()) return `<span style="color:#705008">Teste até ${fmtDate(x.trial_ends_at)}</span>`;
    const exp = Math.max(x.trial_ends_at ? Date.parse(x.trial_ends_at) : 0, x.paid_until ? Date.parse(x.paid_until) : 0);
    if (Date.now() < exp + 7 * 864e5) return `<b style="color:#a4332b">Só leitura</b><br><span class="m">bloqueia ${fmtDate(exp + 7 * 864e5)}</span>`;
    return `<b style="color:#a4332b">Bloqueada</b><br><span class="m">exclusão ${fmtDate(exp + 23 * 864e5)}</span>`;
  }
  function confirmDeleteAccount(id, name){
    const dlg = document.getElementById('dlg'); if (!dlg) return;
    const back = dlg.innerHTML;
    dlg.innerHTML = `<h2 style="margin-top:0;color:#942d27">Excluir conta definitivamente</h2>
      <p>Você vai apagar <b>${escape(name)}</b>: reservas, pagamentos, clientes, financeiro, arquivos, equipe e o login do guia.</p>
      <p style="background:#fceceb;color:#942d27;padding:12px;border-radius:10px"><b>Não dá para desfazer.</b> Sugestão: antes, confirme com o guia que ele não vai pagar.</p>
      <label for="del-name">Para confirmar, digite o nome do negócio: <b>${escape(name)}</b></label>
      <input id="del-name" autocomplete="off">
      <p id="del-msg" class="m" role="status"></p>
      <div class="acts"><button type="button" id="del-go" style="background:#942d27;color:#fff" disabled>Excluir para sempre</button><button type="button" class="alt" id="del-back">Voltar</button></div>`;
    const input = dlg.querySelector('#del-name'), go = dlg.querySelector('#del-go'), msg = dlg.querySelector('#del-msg');
    input.oninput = () => { go.disabled = input.value.trim() !== String(name).trim(); };
    dlg.querySelector('#del-back').onclick = () => openPlatformAdmin();
    go.onclick = async () => {
      go.disabled = true; msg.textContent = 'Excluindo…';
      try {
        const r = await client().functions.invoke('fluida-admin-account', { body: { action: 'delete', account_id: id, confirm_name: input.value.trim() } });
        let data = r.data; if (r.error) { try { if (r.error.context?.json) data = await r.error.context.json(); } catch (e) {} }
        if (r.error || !data?.ok) throw new Error(data?.error || 'Não foi possível excluir.');
        msg.textContent = `Conta excluída (${data.bookings || 0} reservas, ${data.customers || 0} clientes, ${data.files || 0} arquivos).`;
        setTimeout(() => openPlatformAdmin(), 1800);
      } catch (e) { msg.textContent = e.message; go.disabled = false; }
    };
    if (!dlg.open) dlg.showModal();
    void back;
  }
  const fmtDate = v => v ? new Date(v).toLocaleDateString('pt-BR') : '—';
  function inviteLink(email){ return `${location.origin}/?convite=${encodeURIComponent(email)}&modo=cadastro`; }

  async function loadLeads(){
    const dlg = document.getElementById('dlg'), box = dlg && dlg.querySelector('#pa-leads');
    if (!box) return;
    try {
      const r = await client().rpc('fluida_admin_leads');
      if (r.error) throw new Error(r.error.message);
      const leads = (r.data || []).filter(l => !l.has_account);
      if (!leads.length) { box.innerHTML = '<p class="m">Nenhum pedido novo.</p>'; return; }
      box.innerHTML = leads.map(l => {
        const wa = String(l.whatsapp || '').replace(/\D/g, '');
        return `<div style="border:1px solid #dde4db;border-radius:12px;padding:12px 14px;margin:0 0 10px;background:#fff">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${escape(l.business_name)}</b><span class="m" style="font-size:13px">${fmtDate(l.created_at)}${l.invited ? ' · <b style="color:#205c38">convite criado</b>' : ''}</span></div>
          <div class="m" style="font-size:14px">${escape(l.name)} · ${escape(l.email)}${l.whatsapp ? ' · ' + escape(l.whatsapp) : ''}${l.city ? ' · ' + escape(l.city) : ''}</div>
          ${l.message ? `<p style="margin:6px 0 0;font-size:14px;white-space:pre-wrap">${escape(l.message)}</p>` : ''}
          <div class="acts" style="margin-top:8px">${l.invited ? '' : `<button type="button" data-lead-invite="${l.id}">Criar convite</button>`}
            ${wa ? `<a class="alt" style="display:inline-flex;align-items:center;padding:8px 14px;border-radius:10px;border:1px solid #cfd9d1;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${wa.length <= 11 ? '55' : ''}${wa}?text=${encodeURIComponent('Olá, ' + String(l.name).split(' ')[0] + '! Aqui é o Ramon, do Fluida. Recebi seu pedido para testar o app.')}">WhatsApp</a>` : ''}
            <button type="button" class="alt" data-lead-dismiss="${l.id}">Dispensar</button></div></div>`;
      }).join('');
      box.querySelectorAll('[data-lead-invite]').forEach(btn => btn.onclick = () => {
        const l = leads.find(x => String(x.id) === btn.dataset.leadInvite); if (!l) return;
        dlg.querySelector('#pa-name').value = l.business_name; dlg.querySelector('#pa-email').value = l.email;
        dlg.querySelector('#pa-name').scrollIntoView({ block: 'center', behavior: 'smooth' });
        sendBusinessInvite().then(() => loadLeads());
      });
      box.querySelectorAll('[data-lead-dismiss]').forEach(btn => btn.onclick = async () => {
        btn.disabled = true; await client().rpc('fluida_admin_dismiss_lead', { p_id: Number(btn.dataset.leadDismiss) }); loadLeads();
      });
    } catch (e) { box.innerHTML = '<p class="m">Não foi possível carregar os pedidos.</p>'; }
  }
  async function loadAdminOverview(){
    const dlg = document.getElementById('dlg');
    const boxA = dlg && dlg.querySelector('#pa-accounts'), boxI = dlg && dlg.querySelector('#pa-invites');
    if (!boxA || !boxI) return;
    try {
      const r = await client().rpc('fluida_admin_overview');
      if (r.error) throw new Error(r.error.message);
      const accounts = r.data?.accounts || [], invites = r.data?.invites || [];
      const st = r.data?.stats, boxS = dlg.querySelector('#pa-stats');
      if (st && boxS) {
        const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const card = (v, l, c) => `<div style="flex:1 1 140px;border:1px solid #dde4db;border-left:5px solid ${c};border-radius:12px;padding:10px 12px;background:#fff"><b style="font-size:22px;display:block">${v}</b><span class="m" style="font-size:13px">${l}</span></div>`;
        const conv = st.guides ? Math.round(100 * st.ever_paid / st.guides) : 0;
        boxS.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:10px">
          ${card(brl(st.mrr), 'receita mensal prevista', '#07383a')}
          ${card(brl(st.revenue_month), 'recebido este mês' + (st.revenue_last_month ? ' · mês passado ' + brl(st.revenue_last_month) : ''), '#205c38')}
          ${card(st.paying, 'guias pagando' + (st.card ? ' (' + st.card + ' no cartão)' : ''), '#205c38')}
          ${card(st.trial, 'em teste grátis', '#c08a12')}
          ${card(st.readonly + st.blocked, 'sem pagamento (' + st.readonly + ' só leitura, ' + st.blocked + ' bloqueados)', '#a4332b')}
          ${card(conv + '%', 'dos guias já pagaram · ' + st.new_month + (st.new_month === 1 ? ' novo' : ' novos') + ' este mês', '#4a5f9a')}
        </div>
        ${(st.recent_payments || []).length ? `<details style="margin-top:8px"><summary class="m">Últimos pagamentos · total ${brl(st.revenue_total)}</summary><ul style="margin:6px 0 0;padding-left:18px">${st.recent_payments.map(p => `<li>${fmtDate(p.at)} · ${escape(p.name || 'conta excluída')} · ${brl(p.amount)} · ${p.kind === 'pix' ? 'Pix' : 'cartão'}</li>`).join('')}</ul></details>` : ''}`;
      }
      boxI.innerHTML = invites.length ? `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr><th style="text-align:left">Negócio</th><th style="text-align:left">E-mail</th><th style="text-align:left">Validade</th><th></th></tr></thead><tbody>
        ${invites.map(i => `<tr style="border-top:1px solid #dde4db"><td>${escape(i.business_name)}</td><td>${escape(i.email)}</td>
          <td>${i.expired ? '<b style="color:#a4332b">Vencido</b>' : 'até ' + fmtDate(i.expires_at)}</td>
          <td style="text-align:right;white-space:nowrap"><button type="button" class="alt" data-copy-invite="${escape(i.email)}" data-name="${escape(i.business_name)}">${i.expired ? 'Renovar' : 'Copiar link'}</button>
            <button type="button" class="alt" data-edit-invite="${escape(i.email)}" data-name="${escape(i.business_name)}">Editar</button>
            <button type="button" class="alt" data-del-invite="${escape(i.email)}" style="color:#942d27">Apagar</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="m">Nenhum convite pendente.</p>';
      boxA && setTimeout(() => boxA.querySelectorAll('[data-billing-action]').forEach(sel => sel.onchange = async () => {
        const action = sel.value; if (!action) return;
        const r = await client().rpc('fluida_admin_set_billing', { p_account: sel.dataset.billingAction, p_action: action, p_days: 7 });
        if (r.error) notify(r.error.message);
        loadAdminOverview();
      }), 0);
      setTimeout(() => boxA.querySelectorAll('[data-delete-account]').forEach(btn => btn.onclick = () => confirmDeleteAccount(btn.dataset.deleteAccount, btn.dataset.name)), 0);
      const deleted = r.data?.deleted || [];
      if (deleted.length) setTimeout(() => boxA.insertAdjacentHTML('beforeend', `<details style="margin-top:10px"><summary class="m">Contas excluídas (${deleted.length})</summary><ul class="m">${deleted.map(d => `<li>${escape(d.name)} · ${escape(d.owner_email || '')} · ${fmtDate(d.deleted_at)}</li>`).join('')}</ul></details>`), 0);
      boxI.querySelectorAll('[data-del-invite]').forEach(btn => btn.onclick = async () => {
        if (!confirm(`Apagar o convite de ${btn.dataset.delInvite}? O link enviado deixa de funcionar.`)) return;
        const rr = await client().rpc('fluida_admin_delete_invite', { p_email: btn.dataset.delInvite });
        if (rr.error) return notify(rr.error.message);
        loadAdminOverview();
      });
      boxI.querySelectorAll('[data-edit-invite]').forEach(btn => btn.onclick = () => {
        const tr = btn.closest('tr'), oldEmail = btn.dataset.editInvite;
        tr.innerHTML = `<td><input data-ed-name maxlength="120" value="${escape(btn.dataset.name)}" aria-label="Nome do negócio"></td>
          <td><input data-ed-email type="email" value="${escape(oldEmail)}" aria-label="E-mail do guia"></td>
          <td colspan="2" style="white-space:nowrap;text-align:right"><button type="button" data-ed-save>Salvar</button> <button type="button" class="alt" data-ed-cancel>Cancelar</button><div class="m" data-ed-msg></div></td>`;
        tr.querySelector('[data-ed-cancel]').onclick = () => loadAdminOverview();
        tr.querySelector('[data-ed-save]').onclick = async () => {
          const nm = tr.querySelector('[data-ed-name]').value.trim(), em = tr.querySelector('[data-ed-email]').value.trim().toLowerCase();
          const rr = await client().rpc('fluida_admin_update_invite', { p_old_email: oldEmail, p_new_email: em, p_business_name: nm });
          if (rr.error) { tr.querySelector('[data-ed-msg]').textContent = rr.error.message; return; }
          await loadAdminOverview();
          const msg = document.getElementById('pa-msg');
          if (msg) msg.textContent = em !== oldEmail ? `Convite corrigido para ${em}. Envie o novo link (botão Copiar link); o link antigo não funciona mais.` : 'Convite atualizado e renovado por 7 dias.';
        };
      });
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
          <td style="white-space:nowrap;text-align:right">${x.deletable ? `<button type="button" data-delete-account="${escape(x.id)}" data-name="${escape(x.name)}" style="background:#942d27;color:#fff;margin-right:6px">Excluir conta</button>` : ''}${x.custom ? `<select data-billing-action="${escape(x.id)}" aria-label="Ação de assinatura"><option value="">Ações…</option><option value="extend">+7 dias grátis</option><option value="exempt">Isentar</option><option value="charge">Voltar a cobrar</option></select>` : ''}</td></tr>`).join('')}
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
      msg.textContent = 'Convite criado. Enviando o e-mail para o guia…';
      client().functions.invoke('fluida-invite-email', { body: { email } }).then(res => {
        msg.textContent = res.error || !res.data?.ok ? 'Convite criado, mas o e-mail não foi enviado. Envie o link abaixo pelo WhatsApp.' : `Convite criado e enviado por e-mail para ${email}. Se quiser, mande também pelo WhatsApp.`;
      }).catch(() => { msg.textContent = 'Convite criado. Envie o link abaixo para o guia.'; });
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
    const expiry = Math.max(trial, paid), blockAt = expiry + 7 * 864e5, deleteAt = expiry + 23 * 864e5;
    if (now < blockAt) return { kind: 'readonly', blockAt, deleteAt, status: a.billing_status };
    return { kind: 'blocked', blockAt, deleteAt, status: a.billing_status };
  }
  window.fluidaBillingState = billingState;
  function applyBillingBanner(){
    const app = document.getElementById('app'), header = document.querySelector('#app > header');
    if (!app || !header) return;
    const s = billingState(), owner = member()?.role === 'owner';
    let el = document.getElementById('fluida-billing-banner');
    applyBlockScreen(s, owner);
    const show = s.kind === 'trial' || s.kind === 'readonly';
    if (!show) { if (el) { el.remove(); document.body.style.paddingBottom = ''; } return; }
    const key = s.kind + (s.days || '') + owner;
    if (el && el.dataset.key === key) return;
    if (!el) { el = document.createElement('div'); el.id = 'fluida-billing-banner'; header.insertAdjacentElement('afterend', el); }
    el.dataset.key = key;
    const blocked = s.kind === 'readonly';
    const day = v => new Date(v).toLocaleDateString('pt-BR');
    el.setAttribute('role', 'status');
    el.style.cssText = `position:fixed;left:0;right:0;bottom:0;z-index:40;padding:10px 16px calc(10px + env(safe-area-inset-bottom));display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;font-size:15px;box-shadow:0 -4px 16px #17323420;${blocked ? 'background:#fceceb;color:#942d27' : 'background:#fff5d9;color:#705008'}`;
    document.body.style.paddingBottom = '76px';
    el.innerHTML = blocked
      ? `<b>Conta em modo só visualização.</b><span>Para criar ou editar é preciso assinar (R$ ${PRICE}/mês). Em <b>${day(s.blockAt)}</b> o acesso será bloqueado.</span>${owner ? '<button type="button" data-subscribe style="background:#942d27;color:#fff">Assinar agora</button>' : '<span>Peça ao responsável da conta para assinar.</span>'}`
      : `<span>Teste grátis: <b>${s.days === 1 ? 'último dia' : 'faltam ' + s.days + ' dias'}</b>. Depois, R$ ${PRICE}/mês no cartão ou Pix.</span>${owner ? '<button type="button" class="alt" data-subscribe>Assinar</button>' : ''}`;
    const b = el.querySelector('[data-subscribe]'); if (b) b.onclick = openSubscribe;
  }


  function applyBlockScreen(s, owner){
    let el = document.getElementById('fluida-block-screen');
    if (s.kind !== 'blocked') { if (el) el.remove(); return; }
    if (el) return;
    const day = v => new Date(v).toLocaleDateString('pt-BR');
    el = document.createElement('div');
    el.id = 'fluida-block-screen';
    el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true');
    el.style.cssText = 'position:fixed;inset:0;z-index:60;background:#f4f5efee;display:flex;align-items:center;justify-content:center;padding:20px';
    el.innerHTML = `<div style="max-width:520px;background:#fff;border:1px solid #d7dfd7;border-radius:16px;padding:28px;box-shadow:0 10px 40px #17323422">
      <h2 style="margin-top:0;color:#942d27">Acesso bloqueado</h2>
      <p>O período de teste ou a última mensalidade venceu e a conta foi bloqueada.</p>
      <p style="background:#fceceb;color:#942d27;padding:12px 14px;border-radius:10px"><b>Atenção:</b> se não houver pagamento, a conta e todos os dados (reservas, clientes e financeiro) serão <b>excluídos em ${day(s.deleteAt)}</b>.</p>
      <p>${owner ? 'Assine agora para recuperar o acesso na hora, com todos os dados como estavam.' : 'Peça ao responsável da conta para regularizar a assinatura.'}</p>
      <div class="acts" style="display:flex;gap:10px;flex-wrap:wrap">${owner ? `<button type="button" data-unblock style="background:#942d27;color:#fff">Assinar (R$ ${PRICE}/mês)</button>` : ''}<button type="button" class="alt" data-logout>Sair</button></div></div>`;
    document.body.appendChild(el);
    const b = el.querySelector('[data-unblock]'); if (b) b.onclick = openSubscribe;
    el.querySelector('[data-logout]').onclick = () => { try { logout(); } catch (e) { location.reload(); } };
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

  let assinarHandled = false;
  function handleAssinarLink(){
    if (assinarHandled || !account()) return;
    const params = new URLSearchParams(location.search);
    if (params.get('assinar') !== '1') return;
    assinarHandled = true;
    params.delete('assinar'); const u = new URL(location.href); u.search = params.toString(); history.replaceState(null, '', u);
    if (isCustom() && member()?.role === 'owner' && account().billing_status !== 'exempt') setTimeout(openSubscribe, 600);
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




  // ---------------- Link de reserva com sinal ----------------
  async function paintMp(section){
    const box = section.querySelector('#fb-mp'), a = account(); if (!box || !a) return;
    const r = await client().rpc('fluida_mp_status', { p_account: a.id });
    const st = r.data || {};
    box.innerHTML = st.connected
      ? `<p style="margin:0 0 6px"><b style="color:#205c38">✓ Mercado Pago conectado</b>${st.connected_at ? ' desde ' + fmtDate(st.connected_at) : ''}</p><button type="button" class="alt" id="fb-mp-off">Desconectar</button>`
      : `<button type="button" id="fb-mp-on">Conectar Mercado Pago</button>`;
    const on = box.querySelector('#fb-mp-on'), off = box.querySelector('#fb-mp-off');
    if (on) on.onclick = async () => {
      on.disabled = true;
      const res = await client().functions.invoke('fluida-mp-connect', { body: { action: 'start' } });
      let d = res.data; if (res.error) { try { d = await res.error.context.json(); } catch (e) {} }
      if (d?.url) location.href = d.url; else { notify(d?.error || 'Não foi possível conectar agora.'); on.disabled = false; }
    };
    if (off) off.onclick = async () => { if (!confirm('Desconectar o Mercado Pago? Os próximos links passam a usar a chave Pix.')) return; await client().functions.invoke('fluida-mp-connect', { body: { action: 'disconnect' } }); paintMp(section); };
  }
  let mpHandled = false;
  function handleMpReturn(){
    if (mpHandled) return; const q = new URLSearchParams(location.search).get('mp'); if (!q) return; mpHandled = true;
    const u = new URL(location.href); u.searchParams.delete('mp'); history.replaceState(null, '', u);
    notify(q === 'conectado' ? 'Mercado Pago conectado! Os sinais dos links de reserva serão confirmados automaticamente.' : 'Não foi possível conectar o Mercado Pago. Tente de novo.');
  }
  const linkTokens = () => { try { return JSON.parse(localStorage.getItem('fluida-link-tokens') || '{}'); } catch (e) { return {}; } };
  const saveLinkToken = (id, tk) => { try { const m = linkTokens(); m[id] = tk; localStorage.setItem('fluida-link-tokens', JSON.stringify(m)); } catch (e) {} };
  const linkUrl = tk => `${location.origin}/reservar?t=${tk}`;
  async function sha256hex(s){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  function openLinks(){
    const dlg = document.getElementById('dlg'), a = account(); if (!dlg || !a) return;
    let its = []; try { its = (typeof itineraryCache !== 'undefined' ? itineraryCache : []).filter(i => i.active !== false); } catch (e) {}
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    dlg.innerHTML = `<form method="dialog" style="text-align:right"><button class="alt">Fechar</button></form>
      <h2 style="margin:0">Link de reserva com sinal</h2>
      <p class="m">Crie o link com o passeio combinado e mande no WhatsApp. O cliente preenche os dados e paga o sinal no Pix; a reserva entra sozinha na sua agenda.</p>
      ${(branding().voucher && branding().voucher.pix_key) ? '' : '<p style="background:#fff6e0;border-radius:10px;padding:10px 12px;font-size:14px">Para o cliente pagar o sinal, cadastre sua <b>chave Pix</b> ou conecte o <b>Mercado Pago</b> em Menu → Configurações → Cobrança pelo WhatsApp. Sem isso, o cliente só envia os dados e você combina o pagamento.</p>'}
      <label for="lk-it-sel">Roteiro</label>
      <select id="lk-it-sel"><option value="">Escolha um roteiro…</option>${its.map((i, n) => `<option value="${n}">${escape(i.name)}${Number(i.price) > 0 ? ' · ' + Number(i.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' / pessoa' : ''}</option>`).join('')}<option value="outro">Outro roteiro (escrever)</option></select>
      <div id="lk-it-box" hidden><label for="lk-it">Nome do roteiro</label><input id="lk-it" maxlength="200" placeholder="Ex.: Cristo Redentor e Pão de Açúcar"></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0 12px">
        <div><label for="lk-date">Data</label><input id="lk-date" type="date" min="${today}"></div>
        <div><label for="lk-time">Horário</label><input id="lk-time" type="time"></div>
        <div><label for="lk-pax">Pessoas</label><input id="lk-pax" type="number" min="1" max="200" value="2"></div>
        <div><label for="lk-total">Valor total (R$)</label><input id="lk-total" type="number" min="0" step="0.01" inputmode="decimal"></div>
        <div><label for="lk-dep">Sinal (R$) · 40% sugerido</label><input id="lk-dep" type="number" min="0" step="0.01" inputmode="decimal"></div>
        <div><label for="lk-days">Link vale por</label><select id="lk-days"><option value="1">1 dia</option><option value="2">2 dias</option><option value="3" selected>3 dias</option><option value="7">7 dias</option></select></div>
      </div>
      <label for="lk-pick">Ponto de encontro (opcional)</label><input id="lk-pick" maxlength="300">
      <label for="lk-msg">Mensagem para o cliente (opcional)</label><textarea id="lk-msg" rows="2" maxlength="800" placeholder="Ex.: Inclui transporte e ingressos."></textarea>
      <p id="lk-err" class="m" role="status"></p>
      <div class="acts"><button type="button" id="lk-go">Criar link</button></div>
      <div id="lk-out"></div>
      <h3 style="margin-top:24px">Links criados</h3><div id="lk-list"><p class="m">Carregando…</p></div>`;
    if (!dlg.open) dlg.showModal();
    const $ = s => dlg.querySelector(s);
    const fillIts = () => { const sel = $('#lk-it-sel'), cur = sel.value; sel.innerHTML = '<option value="">Escolha um roteiro…</option>' + its.map((i, n) => `<option value="${n}">${escape(i.name)}${Number(i.price) > 0 ? ' · ' + Number(i.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' / pessoa' : ''}</option>`).join('') + '<option value="outro">Outro roteiro (escrever)</option>'; sel.value = cur === 'outro' ? 'outro' : ''; };
    client().from('itineraries').select('*').eq('account_id', a.id).order('name').then(r => { if (r.error || !Array.isArray(r.data)) return; const fresh = r.data.filter(i => i.active === true && !/^roteiro personalizado$/i.test(String(i.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim())); if (fresh.length) { its = fresh; if ($('#lk-it-sel').value !== 'outro') fillIts(); } });
    let depManual = false;
    const pickedIt = () => { const v = $('#lk-it-sel').value; return v === '' || v === 'outro' ? null : its[Number(v)]; };
    const itName = () => { const it = pickedIt(); return it ? it.name : ($('#lk-it-sel').value === 'outro' ? $('#lk-it').value.trim() : ''); };
    const suggestDep = () => { if (depManual) return; const tot = Number($('#lk-total').value || 0); $('#lk-dep').value = tot > 0 ? (Math.round(tot * 40) / 100).toFixed(2) : ''; };
    const recalc = () => { const it = pickedIt(); if (it && Number(it.price) > 0) $('#lk-total').value = (Math.round(Number(it.price) * Math.max(1, Number($('#lk-pax').value || 1)) * 100) / 100).toFixed(2); suggestDep(); };
    $('#lk-it-sel').onchange = () => { const outro = $('#lk-it-sel').value === 'outro'; $('#lk-it-box').hidden = !outro; if (outro) $('#lk-it').focus(); recalc(); };
    $('#lk-pax').oninput = recalc;
    $('#lk-total').oninput = suggestDep;
    $('#lk-dep').oninput = () => { depManual = $('#lk-dep').value !== ''; };
    $('#lk-go').onclick = async () => {
      const err = $('#lk-err'), go = $('#lk-go'); err.textContent = '';
      const body = { account_id: a.id, itinerary: itName(), tour_date: $('#lk-date').value, tour_time: $('#lk-time').value, pax: Number($('#lk-pax').value || 1),
        total: Number($('#lk-total').value || 0), deposit: Number($('#lk-dep').value || 0), pickup: $('#lk-pick').value.trim(), message: $('#lk-msg').value.trim(), days: Number($('#lk-days').value) };
      if (!body.itinerary || !body.tour_date) { err.textContent = 'Informe o roteiro e a data.'; return; }
      if (!(body.total > 0) || !(body.deposit > 0) || body.deposit > body.total) { err.textContent = 'Confira o valor total e o sinal (o sinal não pode ser maior que o total).'; return; }
      go.disabled = true; err.textContent = 'Criando…';
      try {
        const raw = crypto.getRandomValues(new Uint8Array(24)); const tk = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const r = await client().rpc('fluida_create_booking_link', { p_hash: await sha256hex(tk), p_link: body });
        if (r.error) throw new Error(r.error.message);
        saveLinkToken(r.data.id, tk);
        const url = linkUrl(tk), brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const d = body.tour_date.split('-').reverse().join('/');
        const msg = `Olá! Segue o link para confirmar sua reserva: ${body.itinerary} em ${d}${body.tour_time ? ' às ' + body.tour_time : ''} (${body.pax} pessoa${body.pax > 1 ? 's' : ''}). Total ${brl(body.total)}; para garantir, o sinal é de ${brl(body.deposit)} no Pix.\n\n${url}`;
        err.textContent = 'Link criado. Envie para o cliente:';
        $('#lk-out').innerHTML = `<input readonly value="${escape(url)}" style="margin:6px 0"><div class="acts"><a class="button" target="_blank" rel="noopener" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#1f8f4e;color:#fff;text-decoration:none;font-weight:700" href="https://wa.me/?text=${encodeURIComponent(msg)}">Enviar no WhatsApp</a><button type="button" class="alt" id="lk-copy">Copiar link</button></div>`;
        $('#lk-copy').onclick = async () => { try { await navigator.clipboard.writeText(url); err.textContent = 'Link copiado.'; } catch (e) {} };
        loadLinks();
      } catch (e) { err.textContent = e.message || 'Não foi possível criar o link.'; }
      finally { go.disabled = false; }
    };
    async function loadLinks(){
      const box = $('#lk-list'); if (!box) return;
      const r = await client().rpc('fluida_list_booking_links', { p_account: a.id });
      const rows = r.data || [], toks = linkTokens(), brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const lab = { open: ['Aguardando cliente', '#705008'], booked: ['Reserva criada · sinal pendente', '#705008'], paid: ['Sinal pago', '#205c38'], expired: ['Expirado', '#6b7a75'], cancelled: ['Cancelado', '#6b7a75'] };
      box.innerHTML = rows.length ? rows.map(l => `<div style="border:1px solid #dde4db;border-radius:12px;padding:10px 12px;margin:0 0 8px;background:#fff">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${escape(l.itinerary)}</b><span style="color:${lab[l.status][1]};font-weight:600;font-size:13px">${lab[l.status][0]}${l.claimed && l.status === 'booked' ? ' · cliente disse que pagou' : ''}</span></div>
          <div class="m" style="font-size:13px">${String(l.tour_date).split('-').reverse().join('/')} · ${l.pax} pessoa(s) · total ${brl(l.total)} · sinal ${brl(l.deposit)}${l.client_name ? ' · ' + escape(l.client_name) : ''}</div>
          <div class="acts" style="margin-top:6px">${l.status === 'open' && toks[l.id] ? `<button type="button" class="alt" data-lk-copy="${escape(toks[l.id])}">Copiar link</button>` : ''}${l.booking_id ? `<button type="button" class="alt" data-lk-open="${escape(l.booking_id)}">Abrir reserva</button>` : ''}${l.status === 'open' ? `<button type="button" class="alt" data-lk-cancel="${escape(l.id)}">Cancelar</button>` : ''}</div></div>`).join('') : '<p class="m">Nenhum link criado ainda.</p>';
      box.querySelectorAll('[data-lk-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(linkUrl(b.dataset.lkCopy)); b.textContent = 'Copiado'; } catch (e) {} });
      box.querySelectorAll('[data-lk-open]').forEach(b => b.onclick = () => { dlg.close(); try { load().then(() => openBooking(b.dataset.lkOpen)); } catch (e) { openBooking(b.dataset.lkOpen); } });
      box.querySelectorAll('[data-lk-cancel]').forEach(b => b.onclick = async () => { b.disabled = true; await client().rpc('fluida_cancel_booking_link', { p_id: b.dataset.lkCancel }); loadLinks(); });
    }
    loadLinks();
  }
  window.fluidaOpenLinks = openLinks;
  // ---------------- Importar reservas de planilha ----------------
  const IMPORT_FIELDS = [
    ['client_name', 'Nome do cliente', true, ['nome', 'cliente', 'nome do cliente', 'name', 'client', 'customer', 'hospede', 'hóspede', 'passageiro']],
    ['tour_date', 'Data do passeio', true, ['data', 'data do passeio', 'dia', 'date', 'tour date', 'data passeio', 'data tour']],
    ['itinerary', 'Roteiro / passeio', true, ['roteiro', 'passeio', 'tour', 'itinerario', 'itinerário', 'servico', 'serviço', 'produto', 'atividade']],
    ['tour_time', 'Horário', false, ['horario', 'horário', 'hora', 'time', 'saida', 'saída']],
    ['pax', 'Pessoas', false, ['pessoas', 'pax', 'qtd', 'quantidade', 'participantes', 'pessoas (pax)', 'people', 'guests', 'adultos']],
    ['total', 'Valor total (R$)', false, ['valor', 'total', 'valor total', 'preco', 'preço', 'price', 'amount', 'valor do passeio']],
    ['paid', 'Valor já pago (R$)', false, ['pago', 'valor pago', 'sinal', 'ja pago', 'já pago', 'recebido', 'paid', 'deposit', 'entrada']],
    ['method', 'Forma de pagamento', false, ['forma de pagamento', 'pagamento', 'forma', 'metodo', 'método', 'payment', 'meio de pagamento']],
    ['client_phone', 'WhatsApp / telefone', false, ['telefone', 'whatsapp', 'celular', 'fone', 'phone', 'contato', 'tel']],
    ['client_email', 'E-mail', false, ['email', 'e-mail', 'mail']],
    ['client_document', 'Documento', false, ['documento', 'cpf', 'rg', 'passaporte', 'document', 'passport']],
    ['pickup_location', 'Hotel / ponto de encontro', false, ['hotel', 'hospedagem', 'endereco', 'endereço', 'ponto de encontro', 'encontro', 'pickup', 'local', 'busca']],
    ['notes', 'Observações', false, ['observacoes', 'observações', 'obs', 'notas', 'notes', 'comentarios', 'comentários']],
  ];
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function parseCSV(text){
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
      if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  }
  function loadSheetJS(){
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/vendor/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('Não foi possível abrir arquivos Excel agora. Salve a planilha como CSV e tente de novo.')); document.head.appendChild(s); });
  }
  async function readSheet(file){
    if (/\.csv$|\.txt$/i.test(file.name)) return parseCSV(await file.text());
    const X = await loadSheetJS();
    const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).filter(r => r.some(x => String(x).trim() !== ''));
  }
  const pad = n => String(n).padStart(2, '0');
  function parseDate(v){
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
    const s = String(v || '').trim(); let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(s))) { let y = Number(m[3]); if (y < 100) y += 2000; const d = Number(m[1]), mo = Number(m[2]); if (mo < 1 || mo > 12 || d < 1 || d > 31) return ''; return `${y}-${pad(mo)}-${pad(d)}`; }
    return '';
  }
  function parseTime(v){
    if (v instanceof Date && !isNaN(v)) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
    if (typeof v === 'number' && v >= 0 && v < 1) { const mins = Math.round(v * 1440); return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`; }
    const m = /(\d{1,2})\s*[:hH]\s*(\d{2})?/.exec(String(v || '')); if (!m) return '';
    const h = Number(m[1]), mi = Number(m[2] || 0); return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : '';
  }
  function parseMoney(v){
    if (typeof v === 'number') return Math.round(v * 100) / 100;
    let s = String(v || '').replace(/[^\d,.\-]/g, ''); if (!s) return 0;
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (/\.\d{3}$/.test(s) && s.split('.').length > 1 && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }
  function parseMethod(v){
    const s = norm(v);
    if (!s) return 'Pix';
    if (/credit|credito/.test(s)) return 'Cartão de crédito';
    if (/debit|debito/.test(s)) return 'Cartão de débito';
    if (/cart|card/.test(s)) return 'Cartão de crédito';
    if (/dinheiro|cash|especie/.test(s)) return 'Dinheiro';
    if (/transf|ted|doc|banco/.test(s)) return 'Transferência';
    return 'Pix';
  }
  function guessMapping(header){
    const map = {};
    IMPORT_FIELDS.forEach(([key, , , syn]) => {
      const idx = header.findIndex((h, i) => !Object.values(map).includes(i) && syn.includes(norm(h)));
      if (idx >= 0) map[key] = idx;
    });
    IMPORT_FIELDS.forEach(([key, , , syn]) => {
      if (map[key] !== undefined) return;
      const idx = header.findIndex((h, i) => !Object.values(map).includes(i) && syn.some(s => norm(h).includes(s)));
      if (idx >= 0) map[key] = idx;
    });
    return map;
  }
  function buildRows(data, map){
    const get = (r, k) => map[k] === undefined || map[k] === '' ? '' : r[Number(map[k])];
    return data.map((r, i) => {
      const errs = [];
      const name = String(get(r, 'client_name') || '').trim();
      const date = parseDate(get(r, 'tour_date'));
      const it = String(get(r, 'itinerary') || '').trim();
      const pax = Math.max(1, parseInt(String(get(r, 'pax') || '1').replace(/\D/g, '') || '1', 10));
      const total = parseMoney(get(r, 'total'));
      let paid = parseMoney(get(r, 'paid'));
      if (!name) errs.push('sem nome'); if (!date) errs.push('data inválida'); if (!it) errs.push('sem roteiro');
      if (paid > total) { paid = total; }
      return { line: i + 2, errs, name, date, it, pax, total, paid, time: parseTime(get(r, 'tour_time')), method: parseMethod(get(r, 'method')),
        phone: String(get(r, 'client_phone') || '').trim(), email: String(get(r, 'client_email') || '').trim().toLowerCase(),
        doc: String(get(r, 'client_document') || '').trim(), pickup: String(get(r, 'pickup_location') || '').trim(), notes: String(get(r, 'notes') || '').trim() };
    });
  }
  function importTemplate(){
    const csv = 'Nome do cliente;Data do passeio;Horário;Roteiro;Pessoas;Valor total;Valor pago;Forma de pagamento;WhatsApp;E-mail;Hotel;Observações\n' +
      'Maria Silva;25/12/2026;08:00;Cristo Redentor e Pão de Açúcar;2;780,00;200,00;Pix;(21) 99999-0000;maria@email.com;Hotel Copacabana;\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'modelo-importacao-fluida.csv'; a.click();
  }
  function openImport(){
    const dlg = document.getElementById('dlg'); if (!dlg) return;
    let header = [], data = [], map = {};
    dlg.innerHTML = `<form method="dialog" style="text-align:right"><button class="alt">Fechar</button></form>
      <h2 style="margin:0">Importar reservas</h2>
      <p class="m">Envie uma planilha com uma reserva por linha e os títulos na primeira linha. Precisa ter pelo menos <b>nome do cliente</b>, <b>data</b> e <b>roteiro</b>. Valor, valor pago, horário, pessoas, WhatsApp, e-mail e hotel são opcionais.</p>
      <div class="acts"><button type="button" class="alt" id="im-model">Baixar planilha modelo</button></div>
      <label for="im-file">Arquivo (.xlsx ou .csv)</label>
      <input id="im-file" type="file" accept=".xlsx,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
      <p id="im-msg" class="m" role="status"></p>
      <div id="im-map"></div><div id="im-preview"></div>
      <div class="acts" id="im-acts" hidden><button type="button" id="im-go">Importar</button></div>`;
    if (!dlg.open) dlg.showModal();
    const msg = dlg.querySelector('#im-msg');
    dlg.querySelector('#im-model').onclick = importTemplate;
    const render = () => {
      const rows = buildRows(data, map), ok = rows.filter(r => !r.errs.length), bad = rows.filter(r => r.errs.length);
      dlg.querySelector('#im-map').innerHTML = `<h3 style="margin:16px 0 6px">Colunas da sua planilha</h3><p class="m" style="margin-top:0">Confira se cada informação foi ligada à coluna certa.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px 14px">${IMPORT_FIELDS.map(([k, label, req]) => `<label style="font-size:14px">${escape(label)}${req ? ' *' : ''}<select data-map="${k}"><option value="">— não tem —</option>${header.map((h, i) => `<option value="${i}" ${String(map[k]) === String(i) ? 'selected' : ''}>${escape(String(h || 'Coluna ' + (i + 1)))}</option>`).join('')}</select></label>`).join('')}</div>`;
      dlg.querySelectorAll('[data-map]').forEach(s => s.onchange = () => { map[s.dataset.map] = s.value; render(); });
      const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      dlg.querySelector('#im-preview').innerHTML = `<h3 style="margin:18px 0 6px">${ok.length} reserva(s) prontas${bad.length ? ` · <span style="color:#9e2424">${bad.length} com problema</span>` : ''}</h3>
        <div style="overflow:auto;max-height:320px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left">Linha</th><th style="text-align:left">Cliente</th><th style="text-align:left">Data</th><th style="text-align:left">Roteiro</th><th>Pax</th><th style="text-align:right">Total</th><th style="text-align:right">Pago</th><th style="text-align:left">Situação</th></tr></thead><tbody>
        ${rows.slice(0, 200).map(r => `<tr style="border-top:1px solid #e1e8e2;${r.errs.length ? 'color:#9e2424' : ''}"><td>${r.line}</td><td>${escape(r.name)}</td><td>${r.date ? r.date.split('-').reverse().join('/') : ''}${r.time ? ' ' + r.time : ''}</td><td>${escape(r.it)}</td><td style="text-align:center">${r.pax}</td><td style="text-align:right">${brl(r.total)}</td><td style="text-align:right">${brl(r.paid)}</td><td>${r.errs.length ? escape(r.errs.join(', ')) : 'ok'}</td></tr>`).join('')}
        </tbody></table></div>${rows.length > 200 ? `<p class="m">Mostrando 200 de ${rows.length} linhas.</p>` : ''}
        ${bad.length ? '<p class="m">Linhas com problema serão puladas. Corrija na planilha e importe de novo se quiser.</p>' : ''}
        <p class="m">Reservas iguais às que já existem (mesmo cliente, data e roteiro) não são duplicadas.</p>`;
      const acts = dlg.querySelector('#im-acts'); acts.hidden = !ok.length;
      dlg.querySelector('#im-go').textContent = `Importar ${ok.length} reserva(s)`;
      dlg.querySelector('#im-go').onclick = () => runImport(ok);
    };
    dlg.querySelector('#im-file').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      msg.textContent = 'Lendo a planilha…';
      try {
        const all = await readSheet(file);
        if (all.length < 2) throw new Error('A planilha precisa ter a linha de títulos e pelo menos uma reserva.');
        header = all[0].map(x => String(x ?? '').trim()); data = all.slice(1); map = guessMapping(header);
        msg.textContent = `${data.length} linha(s) encontradas em "${file.name}".`; render();
      } catch (err) { msg.textContent = err.message || 'Não foi possível ler o arquivo.'; }
    };
    async function runImport(rows){
      const a = account(), db = client(); if (!a || !db) return;
      const go = dlg.querySelector('#im-go'); go.disabled = true;
      let done = 0, dup = 0, fail = []; 
      for (const r of rows) {
        msg.textContent = `Importando ${done + dup + fail.length + 1} de ${rows.length}…`;
        const sid = crypto.randomUUID(), total = r.total.toFixed(2);
        const item = { service_id: sid, itinerary: r.it, tour_date: r.date, tour_time: r.time || '', pax: String(r.pax), service_total: total, pickup: r.pickup || '' };
        const booking = { client_name: r.name, client_phone: r.phone || null, client_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) ? r.email : null, client_document: r.doc || null,
          tour_date: r.date, tour_time: r.time || null, itinerary: r.it, pickup_location: r.pickup || null, pax: String(r.pax), total, notes: [r.notes, 'Importada de planilha'].filter(Boolean).join(' · '),
          ticket_included: false, ticket_bought: false, voucher_options: { imported: true }, schedule_items: [item] };
        const signals = r.paid > 0 ? [{ service_id: sid, amount: r.paid.toFixed(2), method: r.method, installments: '1', paid_at: r.date <= new Date().toISOString().slice(0, 10) ? r.date : new Date().toISOString().slice(0, 10), notes: 'Pagamento importado da planilha' }] : [];
        try {
          const res = await db.rpc('fluida_save_booking_v10', { p_account_id: a.id, p_request_id: crypto.randomUUID(), p_booking_id: null, p_expected_version: null, p_booking: booking, p_signals: signals });
          if (res.error) { if (String(res.error.code) === '23505') dup++; else fail.push(`linha ${r.line}: ${res.error.message}`); }
          else done++;
        } catch (err) { fail.push(`linha ${r.line}: ${err.message}`); }
      }
      msg.innerHTML = `<b style="color:#205c38">${done} reserva(s) importada(s).</b>${dup ? ` ${dup} já existiam e foram puladas.` : ''}${fail.length ? `<br><span style="color:#9e2424">${fail.length} não entraram:</span><br>${fail.slice(0, 8).map(escape).join('<br>')}` : ''}`;
      go.textContent = 'Concluído'; dlg.querySelector('#im-acts').insertAdjacentHTML('beforeend', '<button type="button" class="alt" id="im-close">Ver minhas reservas</button>');
      dlg.querySelector('#im-close').onclick = () => { dlg.close(); try { load(); } catch (e) { location.reload(); } };
    }
  }
  window.fluidaOpenImport = openImport;
  // ---------------- Primeiros passos (contas de guias) ----------------
  function onboardingSteps(){
    const a = account() || {}, b = branding(), v = (b.voucher && typeof b.voucher === 'object') ? b.voucher : {};
    let roteiros = 0; try { roteiros = (typeof itineraryCache !== 'undefined' && itineraryCache.length) || 0; } catch (e) {}
    let reservas = 0; try { reservas = (typeof bookings !== 'undefined' && bookings.length) || 0; } catch (e) {}
    return [
      { done: !!b.logo, title: 'Coloque seu logo e suas cores', path: 'Menu → Configurações → Personalização da sua marca', go: 'settings', focus: '#fluida-brand-section' },
      { done: !!String(a.cancel_policy || '').trim(), title: 'Escreva sua política de cancelamento', path: 'Menu → Configurações → Política de cancelamento', go: 'settings', focus: '#a_cp' },
      { done: !!(v.reply_to || v.sender_name), title: 'Configure o e-mail do voucher', path: 'Menu → Configurações → E-mail do voucher', go: 'settings', focus: '#fb-sender' },
      { done: roteiros > 0, title: 'Cadastre seus roteiros e valores', path: 'Menu → Itinerários', go: 'itineraries' },
      { done: !!String(a.review_url || '').trim(), title: 'Adicione o link de avaliação (Google, TripAdvisor…)', path: 'Menu → Configurações → Link de avaliação', go: 'settings', focus: '#a_rv' },
      { done: reservas > 0, title: 'Crie sua primeira reserva', path: 'Botão "Nova reserva" no topo', go: 'booking' },
      { done: false, optional: true, title: 'Convide sua equipe (opcional)', path: 'Menu → Equipe', go: 'team' },
    ];
  }
  async function onboardingGo(step){
    try {
      if (step.go === 'settings') { await openAccountSettings(); setTimeout(() => { const el = document.querySelector(step.focus); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); try { el.focus({ preventScroll: true }); } catch (e) {} } }, 450); }
      else if (step.go === 'itineraries') openItineraries();
      else if (step.go === 'booking') openBooking();
      else if (step.go === 'team') openConfig();
    } catch (e) { notify('Abra pelo ' + step.path + '.'); }
  }
  function applyOnboarding(){
    const a = account();
    if (!a || !isCustom() || member()?.role !== 'owner') return;
    const head = document.querySelector('#main-tab-panel .fd-heading, .fd-heading');
    if (!head || document.getElementById('fluida-onboarding')) return;
    const key = 'fluida-onboarding-hidden-' + a.id;
    try { if (localStorage.getItem(key) === '1') return; } catch (e) {}
    const steps = onboardingSteps(), required = steps.filter(s => !s.optional), done = required.filter(s => s.done).length;
    if (done === required.length) return;
    const box = document.createElement('section');
    box.id = 'fluida-onboarding';
    box.style.cssText = 'border:1px solid #d7dfd7;border-left:5px solid var(--g);border-radius:14px;background:#fff;padding:16px 18px;margin:0 0 18px';
    box.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><h2 style="margin:0">Primeiros passos</h2><p class="m" style="margin:2px 0 0">${done} de ${required.length} concluídos. Deixe sua conta pronta para receber clientes.</p></div><button type="button" class="alt" data-ob-hide>Ocultar</button></div>
      <ol style="list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px">${steps.map((s, i) => `<li style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 12px;border-radius:10px;background:${s.done ? '#f2fcf4' : '#f7f8f5'}">
        <div style="display:flex;gap:10px;align-items:flex-start"><span aria-hidden="true" style="font-weight:700;color:${s.done ? '#205c38' : '#9aa7a2'};font-size:18px;line-height:1.2">${s.done ? '✓' : '○'}</span><div><b style="${s.done ? 'color:#205c38' : ''}">${escape(s.title)}</b><div class="m" style="font-size:13px">${escape(s.path)}</div></div></div>
        ${s.done ? '<span class="m">Feito</span>' : `<button type="button" class="alt" data-ob-go="${i}">Abrir</button>`}</li>`).join('')}</ol>`;
    head.insertAdjacentElement('afterend', box);
    box.querySelector('[data-ob-hide]').onclick = () => { try { localStorage.setItem(key, '1'); } catch (e) {} box.remove(); };
    box.querySelectorAll('[data-ob-go]').forEach(btn => btn.onclick = () => onboardingGo(steps[Number(btn.dataset.obGo)]));
  }
  window.fluidaShowOnboarding = function(){ const a = account(); if (a) { try { localStorage.removeItem('fluida-onboarding-hidden-' + a.id); } catch (e) {} } const el = document.getElementById('fluida-onboarding'); if (el) el.remove(); applyOnboarding(); };

  function applyAll(){
    const a = account();
    if (a) {
      const key = a.id + JSON.stringify([branding().primary_color, branding().accent_color]);
      if (appliedFor !== key) { appliedFor = key; safe(applyTheme); }
      safe(applyHeader);
      safe(checkPlatformAdmin);
      safe(applyBillingBanner);
      safe(applyOnboarding);
      safe(handleCheckoutReturn);
      safe(handleAssinarLink);
      safe(handleMpReturn);
    }
    if (!a) { const bs = document.getElementById('fluida-block-screen'), bb = document.getElementById('fluida-billing-banner'); if (bs) bs.remove(); if (bb) { bb.remove(); document.body.style.paddingBottom = ''; } }
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
