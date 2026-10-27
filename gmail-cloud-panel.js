/* Uses the existing Fluida session. All cloud operations revalidate owner access. */
(()=>{
 'use strict';
 let panel,stamp,busy=false;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
 const identity=()=>typeof acc!=='undefined'&&typeof me!=='undefined'&&me?.role==='owner'&&acc?.id?acc.id+':'+me.user_id:null;
 const date=value=>{const v=String(value||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v.split('-').reverse().join('/'):'Sem data';};
 const button=(label,fn,cls='fg-button')=>{const b=el('button',label,cls);b.type='button';b.onclick=()=>{b.disabled=true;try{Promise.resolve(fn()).catch(showError).finally(()=>b.disabled=false);}catch(e){showError(e);b.disabled=false;}};return b;};
 function showError(error){if(!panel?.open)return;let n=panel.querySelector('[role="alert"]');if(!n){n=el('p',undefined,'fg-error');n.setAttribute('role','alert');panel.prepend(n);}n.textContent=error.message||'Não foi possível concluir. Tente novamente.';}
 async function api(action,body={}){
  if(!identity()||identity()!==stamp)throw Error('Sua sessão mudou. Reabra o painel de ingressos.');
  const {data,error}=await db.functions.invoke('fluida-gmail-cloud',{body:{account_id:acc.id,action,...body}});
  if(identity()!==stamp)throw Error('Sua sessão mudou. Reabra o painel de ingressos.');
  if(error)throw Error('Não foi possível consultar os ingressos. Confira sua conexão e tente novamente.');
  if(data?.error)throw Error(data.error);return data;
 }
 function bookingName(id){const list=typeof allAccountBookings!=='undefined'?allAccountBookings:typeof bookings!=='undefined'?bookings:[];const b=list.find(x=>x.id===id);return b?.customer_name||b?.client_name||b?.name||'Reserva';}
 async function authorize(){
  const popup=window.open('about:blank','_blank');if(!popup)throw Error('Permita abrir a aba do Google para conectar o Gmail.');popup.opener=null;
  try{const r=await api('connect'),url=new URL(r.url);if(url.origin!=='https://accounts.google.com')throw Error('Endereço de autorização inválido.');popup.location.replace(url.href);}catch(e){popup.close();throw e;}
 }
 async function pdf(id){
  const popup=window.open('about:blank','_blank');if(!popup)throw Error('Permita abrir a aba do PDF neste navegador.');popup.opener=null;
  try{const r=await api('pdf',{document_id:id}),url=new URL(r.url);if(url.protocol!=='https:'||url.origin!==new URL(SUPABASE_URL).origin)throw Error('Endereço do ingresso inválido.');popup.location.replace(url.href);}catch(e){popup.close();throw e;}
 }
 async function refresh(){
  const data=await api('cloud-status');panel.replaceChildren();
  const header=el('header',undefined,'fg-header');const titles=el('div');titles.append(el('p','FLUIDA · GMAIL','fg-eyebrow'),el('h2','Ingressos','fg-title'));header.append(titles,button('Fechar',async()=>panel.close(),'fg-button fg-secondary'));panel.append(header);
  const connected=data.status.connected&&data.status.enabled&&!data.status.needs_reconnect;
  const state=el('section',undefined,'fg-state');state.append(el('strong',connected?'Sincronização na nuvem ativa':'Conectar Gmail'),el('p',connected?data.status.email:'Autorize seu Gmail para receber os ingressos.'));
  state.append(el('p','A busca continua mesmo com seu computador fechado. Paineiras está ativa. Parque Bondinho aguarda a validação de um ingresso real.','fg-muted'));
  const actions=el('div',undefined,'fg-actions');actions.append(button('Atualizar painel',refresh));if(!connected)actions.append(button('Conectar Gmail',authorize));else{const details=el('details');details.append(el('summary','Conexão Gmail'),button('Renovar autorização',authorize,'fg-button fg-secondary'));actions.append(details);}state.append(actions);panel.append(state);
  if(data.state.lastError)panel.append(el('p','A última busca encontrou uma dificuldade. Atualize o painel; se persistir, renove a autorização do Gmail.','fg-error'));
  const total=data.documents.length,linked=data.documents.filter(d=>d.attached).length;
  const counts=el('p',`${total} ingressos recebidos · ${linked} associados · ${total-linked} aguardando associação`,'fg-counts');panel.append(counts);
  const configure=el('details',undefined,'fg-section');configure.append(el('summary','Associar novos ingressos às reservas'));
  configure.append(el('p','Quando comprar um ingresso, informe o localizador do fornecedor no passeio correspondente. A associação exige a mesma data de visita e ingresso incluso na reserva. Até lá, os arquivos ficam guardados.','fg-muted'));
  const oldLabel=el('label',undefined,'fg-check'),old=el('input');old.type='checkbox';oldLabel.append(old,document.createTextNode(' Mostrar também reservas anteriores'));configure.append(oldLabel);
  const services=el('div');configure.append(services);
  const today=new Date();const day=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  function renderServices(){
   services.replaceChildren();let count=0;
   for(const b of data.bookings){
    if(b.deleted_at||['cancelada','cancelado','cancelled','canceled'].includes(String(b.status).toLowerCase()))continue;
    for(const s of b.schedule_items||[]){
     if(!old.checked&&s.tour_date&&s.tour_date<day)continue;count++;
     const row=el('form',undefined,'fg-card');row.append(el('h3',bookingName(b.id)),el('p',(s.itinerary||'Passeio')+' · '+date(s.tour_date)));
     if(!s.ticket_included)row.append(el('p','Ative “ingresso incluso” na reserva antes de associar.','fg-muted'));
     const fields=el('div',undefined,'fg-fields'),provider=el('select'),locator=el('input');
     for(const [value,label] of [['paineiras','Paineiras'],['bondinho','Parque Bondinho · validação pendente']]){const option=el('option',label);option.value=value;provider.append(option);}
     locator.placeholder='Ex.: LB12345678';locator.maxLength=80;locator.minLength=3;locator.required=true;
     const parts=String(s.locator||'').split(':');if(parts.length>1){provider.value=parts.shift().toLowerCase();locator.value=parts.join(':');}
     const pl=el('label','Fornecedor'),ll=el('label','Localizador do ingresso');pl.append(provider);ll.append(locator);fields.append(pl,ll);
     const save=el('button','Salvar localizador','fg-button');save.type='submit';save.disabled=!s.ticket_included;
     const result=el('p',undefined,'fg-muted');result.setAttribute('role','status');
     row.onsubmit=event=>{event.preventDefault();save.disabled=true;void api('service',{booking_id:b.id,service_id:s.service_id,provider:provider.value,locator:locator.value.trim()}).then(()=>{result.textContent='Localizador salvo. A próxima busca fará a conferência do ingresso.';}).catch(e=>{result.textContent=e.message;}).finally(()=>save.disabled=!s.ticket_included);};
     row.append(fields,save,result);services.append(row);
    }
   }
   if(!count)services.append(el('p','Nenhum passeio futuro disponível para configurar. As reservas anteriores podem ser exibidas acima.','fg-muted'));
  }
  old.onchange=renderServices;renderServices();panel.append(configure);
  const received=el('section',undefined,'fg-section');received.append(el('h3','Ingressos recebidos'));
  const filters=el('div',undefined,'fg-fields'),search=el('input'),status=el('select');search.type='search';search.placeholder='Buscar arquivo ou localizador';search.setAttribute('aria-label','Buscar ingresso');
  for(const [v,t] of [['all','Todos os ingressos'],['pending','Aguardando associação'],['linked','Associados']]){const o=el('option',t);o.value=v;status.append(o);}status.setAttribute('aria-label','Filtrar ingressos');filters.append(search,status);received.append(filters);
  const results=el('div');received.append(results);
  function renderDocs(){
   results.replaceChildren();const term=search.value.trim().toLocaleLowerCase('pt-BR');
   const docs=data.documents.filter(d=>(status.value==='all'||(status.value==='linked'?d.attached:!d.attached))&&[d.filename,...d.locators||[]].join(' ').toLocaleLowerCase('pt-BR').includes(term));
   if(!docs.length)results.append(el('p',total?'Nenhum ingresso corresponde à busca.':'Ainda não há ingressos recebidos. A busca é automática.','fg-muted'));
   for(const doc of docs){const row=el('article',undefined,'fg-card');row.append(el('strong',doc.filename||'Ingresso PDF'),el('p',doc.attached?'Associado à reserva':'Aguardando associação',doc.attached?'fg-ok':'fg-muted'));
    const metadata=[...(doc.locators||[]).map(x=>String(x).replace(/^PAINEIRAS:/,'')),...(doc.visitDates||[]).map(x=>'Visita: '+date(x))];if(metadata.length)row.append(el('p',metadata.join(' · '),'fg-muted'));row.append(button('Abrir PDF',()=>pdf(doc.id),'fg-button fg-secondary'));results.append(row);}
  }
  search.oninput=renderDocs;status.onchange=renderDocs;renderDocs();panel.append(received);
 }
 async function open(){
  if(busy)return;stamp=identity();if(!stamp)return;busy=true;
  if(!panel){panel=el('dialog',undefined,'fg-panel');panel.setAttribute('aria-label','Ingressos do Gmail');document.body.append(panel);}
  panel.replaceChildren(button('Fechar',async()=>panel.close(),'fg-button fg-secondary'),el('p','Consultando ingressos…'));if(!panel.open)panel.showModal();try{await refresh();}finally{busy=false;}
 }
 function mount(){
  const old=document.getElementById('fluida-gmail-cloud-open'),current=identity();
  if(!current){old?.remove();if(panel?.open){panel.close();panel.replaceChildren();}return;}
  if(panel?.open&&stamp!==current){panel.close();panel.replaceChildren();}
  if(old)return;const b=button('Ingressos · Gmail',open,'fg-launch');b.id='fluida-gmail-cloud-open';document.body.append(b);
 }
 const style=el('style');style.textContent=`.fg-launch{position:fixed;right:20px;bottom:20px;z-index:120;background:#07574d;color:#fff;border:1px solid #32776e;border-radius:24px;padding:12px 18px;font:600 14px system-ui;box-shadow:0 3px 18px #0002;cursor:pointer}.fg-panel{width:min(850px,94vw);max-height:90dvh;overflow:auto;padding:26px;border:1px solid #dbe5df;border-radius:18px;background:#fff;color:#183b31;font:15px/1.6 system-ui;box-sizing:border-box}.fg-panel::backdrop{background:#102d2b99}.fg-panel *{box-sizing:border-box}.fg-panel .fg-header{display:flex;justify-content:space-between;align-items:center;gap:16px}.fg-panel .fg-title{margin:0;font-size:30px}.fg-panel .fg-eyebrow{font-size:12px;letter-spacing:1.5px;margin:0;color:#54756b}.fg-panel .fg-state{background:#eef6f0;padding:18px;border-radius:12px;margin:20px 0}.fg-panel p{margin:8px 0}.fg-panel .fg-muted{color:#526960}.fg-panel .fg-actions,.fg-panel .fg-fields{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:14px 0}.fg-panel .fg-fields>*{flex:1;min-width:180px}.fg-panel label{display:block}.fg-panel input,.fg-panel select{display:block;width:100%;border:1px solid #b8c9bf;background:#fff;color:#183b31;padding:10px 12px;border-radius:8px;font:inherit;margin:5px 0}.fg-panel .fg-check{display:flex;align-items:center;gap:9px}.fg-panel .fg-check input{width:auto}.fg-panel .fg-button{width:auto;margin:4px 0;padding:10px 15px;border-radius:8px;border:1px solid #17634d;background:#17634d;color:white;font:600 14px system-ui;cursor:pointer}.fg-panel .fg-secondary{background:white;color:#17634d}.fg-panel .fg-button:disabled{opacity:.5;cursor:default}.fg-panel summary{cursor:pointer;font-weight:650}.fg-panel .fg-section{margin:24px 0}.fg-panel .fg-card{border:1px solid #dce6df;border-radius:10px;padding:16px;margin:12px 0;overflow-wrap:anywhere}.fg-panel h3{margin:0 0 8px;font-size:19px}.fg-panel .fg-error{color:#962b25;background:#fff0ec;padding:12px;border-radius:8px}.fg-panel .fg-ok{color:#17634d}.fg-panel .fg-counts{font-weight:600}.fg-panel :focus-visible,.fg-launch:focus-visible{outline:3px solid #c38b25;outline-offset:3px}@media(max-width:600px){.fg-panel{padding:18px;width:96vw;max-height:94dvh}.fg-launch{right:12px;bottom:calc(12px + env(safe-area-inset-bottom))}.fg-panel .fg-fields>*{min-width:100%}}`;
 document.head.append(style);setInterval(mount,2000);mount();
})();
