'use strict';
const foCore=FluidaOfflineCore,foDB=new foCore.Database();
let fluidaOfflineMode=false,foState=null,foScope='',foSyncing=false,foCapturing=false,foShellReady=false,foError='';
const foChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('fluida-offline'):null;
function foAuthUser(){try{return JSON.parse(fluidaAuthStorage.getItem('sb-ewhfabhktkvrjddnvgkl-auth-token')||'null')?.user?.id||'';}catch{return '';}}
function foIdentity(){return acc?.id&&me?.user_id?acc.id+':'+me.user_id:'';}
function foTransport(e){return !navigator.onLine||/failed to fetch|fetch failed|load failed|network|timeout|connection|offline/i.test(String(e?.message||e||''));}
function foSnapshot(){return foCore.copy({me,acc,team,allAccountBookings,centralCustomerCache,centralCustomersAvailable,itineraryCache,itineraryVoucherCatalog,crmRows,crmReady,finData,operationalEmails,at:fluidaLastLoadedAt||Date.now(),fullHistory:fluidaHistoryReady});}
function foApply(snapshot){
 if(!snapshot||snapshot.me?.user_id!==foAuthUser())throw Error('Entre na mesma conta usada para baixar os dados offline.');
 ({me,acc,team,allAccountBookings,centralCustomerCache,centralCustomersAvailable,itineraryCache,itineraryVoucherCatalog,crmRows,crmReady,finData,operationalEmails}=foCore.copy(snapshot));
 bookings=allAccountBookings.filter(b=>!b.deleted_at);summaryBookings=bookings;fluidaLastLoadedAt=snapshot.at;fluidaHistoryReady=!!snapshot.fullHistory;fluidaHistoryRequested=!!snapshot.fullHistory;
 crmCatalogMemo={account:acc.id,data:itineraryVoucherCatalog,at:Date.now()};crmCustomerMemo=null;fluidaMapMemo=null;fluidaReportMemo=null;fluidaRowsMemo=new WeakMap();
}
async function foRead(){if(!foScope)foScope=foIdentity();if(!foScope)return null;foState=await foDB.get(foScope);return foState;}
async function foRestore(){
 const user=foAuthUser();if(!user||!fluidaAuthStorage.remembered())return false;
 const pointer=await foDB.get('last:'+user);if(!pointer?.scope)return false;
 const state=await foDB.get(pointer.scope);if(!state?.snapshot||state.snapshot.me?.user_id!==user)return false;
 foScope=pointer.scope;foState=state;foApply(foCore.overlay(state.snapshot,state.queue));fluidaOfflineMode=true;render();return true;
}
async function foCapture(){
 if(foCapturing||!me||!acc||fluidaOfflineMode||!fluidaAuthStorage.remembered())return;
 foCapturing=true;const scope=foIdentity(),stamp=fluidaSessionStamp();
 try{
  if(!fluidaHistoryReady)return;
  if(canManage())await finLoadData();
  const snapshot=foSnapshot();
  const catalog=await crmCatalog();if(catalog.error)throw catalog.error;snapshot.itineraryVoucherCatalog=catalog.data||[];snapshot.itineraryCache=(catalog.data||[]).filter(x=>x.active);
  fluidaAssertSession(stamp);await foDB.edit(scope,s=>{s.snapshot=snapshot;s.savedAt=Date.now();});await foDB.edit('last:'+me.user_id,s=>{s.scope=scope;});
  foScope=scope;await foRead();if(foState.queue.length)foApply(foCore.overlay(foState.snapshot,foState.queue));foError='';foPaint();
 }catch(e){foError='Cópia offline não atualizada: '+e.message;foPaint();}finally{foCapturing=false;}
}
async function foLoad(){
 if(!navigator.onLine||fluidaOfflineMode){const s=await foRead();if(!s?.snapshot)throw Error('Ainda não há dados baixados neste dispositivo. Entre uma vez com internet.');foApply(foCore.overlay(s.snapshot,s.queue));render();return;}
 fluidaHistoryRequested=true;
 try{await load_impl3();await foCapture();}
 catch(e){if(foTransport(e)&&await foRestore()){foError='Conexão indisponível. Exibindo a cópia deste dispositivo.';foPaint();return;}throw e;}
}
async function foStart(){
 if(!navigator.onLine){if(await foRestore())return;loginView('Sem internet e sem cópia disponível. Entre uma vez com conexão e mantenha conectado neste dispositivo.');return;}
 try{fluidaOfflineMode=false;fluidaHistoryRequested=true;await start_impl2();if(me&&acc){foScope=foIdentity();await foRead();await foSync();}}
 catch(e){if(foTransport(e)&&await foRestore())return;throw e;}
}
async function foQueueBooking(pending){
 if(!fluidaAuthStorage.remembered())throw Error('Para salvar offline neste dispositivo pessoal, ative Manter conectado ao entrar.');
 if(pending.sendEmail)throw Error('O envio de voucher precisa de internet. Use Salvar alterações sem envio; o voucher poderá ser enviado depois da sincronização.');
 if(!canAdd())throw Error('Seu perfil não permite salvar alterações.');
 const scope=foIdentity();if(!scope||scope!==foScope||foAuthUser()!==me.user_id)throw Error('Confira sua sessão antes de salvar offline.');
 const args=foCore.copy(pending.kind==='payment'?pending.args:{...pending.args,p_customer_sync:pending.customerSync||null,p_crm_origin:pending.crmOrigin?.id||null});
 const item={id:args.p_request_id,scope,user:me.user_id,localId:args.p_booking_id||crypto.randomUUID(),kind:pending.kind==='payment'?'payment':'booking',args,status:'queued',createdAt:new Date().toISOString()};
 const stored=await foDB.edit(scope,s=>foCore.enqueue(s,item)); // Storage success must precede any local acknowledgement.
 sessionStorage.removeItem(pendingBookingKey());await foRead();foApply(foCore.overlay(foState.snapshot,foState.queue));foChannel?.postMessage({scope});return stored.localId;
}
async function submitPendingBooking(pending){
 if(!navigator.onLine||fluidaOfflineMode)return foQueueBooking(pending);
 await foRead();if(foState?.queue.some(x=>x.localId===pending.args.p_booking_id))throw Error('Esta reserva tem alterações pendentes. Confira a fila de sincronização primeiro.');
 try{return await submitPendingBookingOnline(pending);}
 catch(e){if(foTransport(e)){fluidaOfflineMode=true;return foQueueBooking(pending);}throw e;}
}
async function foFinish(id,sendEmail,kind){
 await foRead();if(foState?.queue.some(x=>x.localId===id)){
  proDisarmBookingEditor();fluidaCommitDialog($('#dlg'));if($('#dlg').open)fluidaNativeClose.call($('#dlg'));crmConversion=null;render();notifyUser('Guardado neste dispositivo · aguardando sincronização. Nenhum voucher foi enviado.',{persistent:true});if(navigator.onLine)void foSync();return;
 }
 return finishBookingSave_impl3(id,sendEmail,kind);
}
async function foMark(id,status,message=''){const scope=foScope;await foDB.edit(scope,s=>{const q=s.queue.find(x=>x.id===id);if(q){q.status=status;q.message=message;}});await foRead();}
async function foSync(){
 if(foSyncing||!navigator.onLine||!me||!acc||!foScope)return;
 const scope=foIdentity();if(scope!==foScope)return;
 const run=async()=>{
  foSyncing=true;const stamp=fluidaSessionStamp();
  try{
   await foRead();if(!foState?.queue.length){fluidaOfflineMode=false;return;}
   // Verify identity and membership against the server, never trust cached permission for replay.
   const auth=await db.auth.getUser();if(auth.error||auth.data?.user?.id!==me.user_id)throw Error('Entre novamente na mesma conta para sincronizar.');
   const member=await db.from('members').select('*').eq('account_id',acc.id).eq('user_id',me.user_id).maybeSingle();
   if(member.error)throw member.error;if(!member.data)throw Error('Seu acesso à conta foi removido. A fila foi preservada para conferência.');
   me=member.data;fluidaAssertSession(stamp);fluidaOfflineMode=false;
   for(const item of [...foState.queue]){
    if(['conflict','error'].includes(item.status))continue;
    if(!navigator.onLine)break;
    fluidaAssertSession(stamp);if(foIdentity()!==scope||foAuthUser()!==item.user)throw Error('A sessão mudou; a sincronização foi interrompida.');
    await foMark(item.id,'sending');
    let r;try{r=await db.rpc(foCore.rpcName(item),item.args);}catch(e){r={error:e};}
    fluidaAssertSession(stamp);
    if(r.error){const state=foCore.failure(r.error);await foMark(item.id,state,state==='conflict'?'A reserva ou o cliente mudou na nuvem. Sua alteração local foi preservada.':r.error.message||'Não foi possível confirmar o envio.');if(state==='queued'||state==='auth')break;continue;}
    if(!r.data?.id){await foMark(item.id,'queued','Resposta incompleta. O mesmo identificador será conferido novamente.');break;}
    // Refresh before removing the outbox item; a lost response can always replay the same server request.
    const fresh=await db.from('bookings').select('*').eq('account_id',acc.id).eq('id',r.data.id).single();
    const pays=await db.from('payments').select('*').eq('account_id',acc.id).eq('booking_id',r.data.id);
    fluidaAssertSession(stamp);if(fresh.error||pays.error){await foMark(item.id,'queued','Salvamento recebido; aguardando conferir a reserva.');break;}
    await foDB.edit(scope,s=>{s.snapshot.allAccountBookings=s.snapshot.allAccountBookings.filter(b=>b.id!==item.localId&&b.id!==fresh.data.id).concat({...fresh.data,payments:pays.data||[]});s.queue=s.queue.filter(x=>x.id!==item.id);});
    foChannel?.postMessage({scope});await foRead();
   }
   if(!document.querySelector('dialog[open]')){fluidaOfflineMode=false;await foLoad();render();}
   foError='';
  }catch(e){foError=e.message;if(foTransport(e))fluidaOfflineMode=true;}
  finally{foSyncing=false;await foRead();foPaint();}
 };
 if(navigator.locks)await navigator.locks.request('fluida-sync:'+scope,{ifAvailable:true},lock=>lock?run():undefined);else{foError='Este navegador não permite sincronização segura entre abas. Use uma versão atual do Safari ou Chrome.';foPaint();}
}
function foPaint(){
 if(!me||!acc)return;let host=document.getElementById('fluida-offline-state');
 if(!host){host=document.createElement('section');host.id='fluida-offline-state';host.className='crm-notice';host.setAttribute('role','status');document.querySelector('#app>main')?.prepend(host);}
 if(!host)return;const queue=foState?.queue||[],conflicts=queue.filter(x=>['conflict','error','auth'].includes(x.status)).length;
 const mode=(!navigator.onLine||fluidaOfflineMode)?'Sem internet · dados deste dispositivo':foSyncing?'Sincronizando alterações…':'Conectado';
 const ready=foState?.snapshot&&foShellReady?'Acesso offline preparado neste dispositivo.':!fluidaAuthStorage.remembered()?'Acesso offline requer Manter conectado neste dispositivo pessoal.':'Preparando acesso offline…';
 host.innerHTML='<strong>'+esc(mode)+'</strong><p>'+esc(ready)+' '+queue.length+' alteração(ões) aguardando envio.'+(conflicts?' '+conflicts+' precisam de conferência.':'')+'</p>'+(foState?.snapshot?'<p>Última cópia: '+esc(fluidaFormatDateTime(foState.snapshot.at))+'. Alterações offline em reservas e pagamentos; demais cadastros, arquivos e envios exigem conexão.</p>':'')+(foError?'<p>'+esc(foError)+'</p>':'')+'<div class="acts"><button type="button" class="alt" onclick="foQueueView()">Conferir sincronização</button><button type="button" class="alt" onclick="foSync()" '+(!navigator.onLine||foSyncing?'disabled':'')+'>Sincronizar agora</button></div>';
 document.querySelectorAll('.sv-header,.booking-header').forEach(h=>{const id=$('#dlg')?.dataset.savedBookingId||proBookingEditor?.id;if(queue.some(x=>x.localId===id)&&!h.querySelector('[data-offline-pending]')){const p=document.createElement('p');p.dataset.offlinePending='';p.textContent='Alteração local · aguardando sincronização';h.append(p);}});
}
async function foQueueView(){
 await foRead();const d=v8Dialog('Sincronização deste dispositivo','<p>As alterações permanecem guardadas ao fechar o app. A sincronização ocorre quando o Fluida estiver aberto com internet. Nenhum conflito é sobrescrito automaticamente.</p><div id="fo-queue-items"></div>');
 const list=d.querySelector('#fo-queue-items');for(const item of foState?.queue||[]){const row=document.createElement('article');row.className='fluida-record';const b=allAccountBookings.find(b=>b.id===item.localId);const name=document.createElement('strong');name.textContent=(b?.client_name||'Reserva')+' · '+(item.kind==='payment'?'Pagamento':'Reserva');const status=document.createElement('p');status.textContent=({queued:'Aguardando conexão',sending:'Conferindo envio',conflict:'Conflito: conferir antes de aplicar',error:'Revisão necessária',auth:'Autorização necessária'})[item.status]+' · '+(item.message||'Guardado somente neste dispositivo.');
 const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Ver alteração guardada';pre.style.whiteSpace='pre-wrap';pre.textContent=JSON.stringify(item.kind==='payment'?item.args.p_payment:item.args.p_booking,null,2);details.append(summary,pre);row.append(name,status,details);
 if(['conflict','error'].includes(item.status)){const discard=document.createElement('button');discard.className='alt';discard.textContent='Descartar esta alteração local';discard.onclick=async()=>{if(!confirm('Descartar esta alteração apenas do dispositivo? A versão salva na nuvem será preservada.'))return;await foDB.edit(foScope,s=>{s.queue=s.queue.filter(q=>q.id!==item.id);});await foRead();foApply(foCore.overlay(foState.snapshot,foState.queue));fluidaCommitDialog(d);d.close();await foLoad();render();};row.append(discard);}
 list.append(row);}
 if(!list.children.length)list.textContent='Nenhuma alteração pendente.';
}
async function foLogout(){
 const scope=foIdentity();await foRead();if(foState?.queue.length&&!confirm('Há '+foState.queue.length+' alteração(ões) ainda não sincronizada(s). Sair apagará a cópia e essas alterações deste dispositivo. Deseja descartar e sair?'))return;
 if(!navigator.onLine){fluidaAuthStorage.removeItem('sb-ewhfabhktkvrjddnvgkl-auth-token');fluidaClearSession();loginView();}else{await logout_impl4();if(me)return;}
 if(scope){await foDB.remove(scope);await foDB.remove('last:'+scope.split(':')[1]);}foState=null;foScope='';fluidaOfflineMode=false;
}
function foRender(){const result=render_impl2();foPaint();return result;}
window.addEventListener('offline',()=>{fluidaOfflineMode=true;foPaint();});
window.addEventListener('online',()=>{fluidaOfflineMode=false;void foSync().then(()=>fluidaRefreshData(true));});
window.addEventListener('focus',()=>{if(navigator.onLine)void foSync();});
setInterval(()=>{if(navigator.onLine&&foState?.queue.length&&!document.hidden)void foSync();},30000);
foChannel?.addEventListener('message',async e=>{if(e.data?.scope!==foScope)return;await foRead();if(!document.querySelector('dialog[open]')&&foState?.snapshot){foApply(foCore.overlay(foState.snapshot,foState.queue));render();}else foPaint();});
if('serviceWorker' in navigator&&isSecureContext)navigator.serviceWorker.register('/fluida-sw.js',{updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready).then(()=>{foShellReady=true;foPaint();}).catch(e=>{foError='Não foi possível preparar a abertura offline: '+e.message;foPaint();});
/* Voucher feedback only. Does not send, retry, or change reservations by itself. */
(()=>{
 'use strict';
 const receipts=new Map();let receiptScope='';
 const scoped=()=>{const current=voucherEmailCurrentScope();if(receiptScope!==current){receipts.clear();receiptScope=current;}return current;};
 const mergeOriginal=voucherEmailMergeImported;
 voucherEmailMergeImported=function(rows,id=null){
  scoped();const confirmed=[...receipts.values()].filter(r=>!id||r.booking_id===id);
  const ids=new Set(confirmed.map(r=>r.request_id));
  const merged=mergeOriginal(rows,id).filter(r=>!ids.has(r.request_id)||['accepted','delivered'].includes(r.status));
  const known=new Set(merged.map(r=>r.request_id||r.provider_id));
  return [...merged,...confirmed.filter(r=>!known.has(r.request_id||r.provider_id))];
 };
 const labelOriginal=voucherEmailStatusLabel;
 voucherEmailStatusLabel=status=>['accepted','delivered'].includes(status)?'Voucher enviado':labelOriginal(status);
 const inlineOriginal=voucherEmailInlineContent;
 voucherEmailInlineContent=function(id){
  scoped();const b=bookings.find(b=>b.id===id),entry=voucherEmailSummaries.get(id),pending=readVoucherEmailPending(id);
  const item=entry?.latest,email=String(b?.client_email||'').trim().toLowerCase();
  if(!voucherEmailBusy.has(id)&&email&&['accepted','delivered'].includes(item?.status)&&String(item.recipient||'').trim().toLowerCase()===email&&(!pending?.request_id||pending.request_id===item.request_id)){
   const note='Envio confirmado em '+voucherEmailDate(voucherEmailWhen(item))+'. A entrega na caixa do cliente ainda pode não estar confirmada.'+(entry?.error||voucherEmailSummaryError?' Histórico temporariamente indisponível; última confirmação preservada.':'');
   return '<span class="booking-email-status accepted" title="'+esc(note)+'"><span class="booking-email-triangle" aria-hidden="true"></span><span>Voucher enviado</span><span class="booking-email-sr">. '+esc(note)+'</span></span>';
  }
  return inlineOriginal(id);
 };
 const invokeOriginal=db.functions.invoke.bind(db.functions);
 db.functions.invoke=async function(name,options){
  if(name!=='send-booking-voucher')return invokeOriginal(name,options);
  const scope=scoped(),id=options?.body?.booking_id,request=options?.body?.request_id;
  const result=await invokeOriginal(name,options),data=result?.data;
  if(scope===scoped()&&request&&!result.error&&data?.ok&&(data.status==='accepted'||!data.status&&data.id)){
   // Receipt comes from the existing server response, never from the click itself.
   try{
    const booking=bookings.find(b=>b.id===id),pending=readVoucherEmailPending(id),at=new Date().toISOString();
    const receipt={request_id:request,booking_id:id,account_id:acc.id,requested_by:me.user_id,provider_id:data.provider_id||data.id||null,recipient:data.recipient||booking?.client_email||'',language:booking?.voucher_options?.language||'pt',status:'accepted',created_at:pending?.created_at||at,accepted_at:data.accepted_at||at};
    receipts.set(request,receipt);
    const previous=voucherEmailSummaries.get(id)?.latest;
    voucherEmailRemember(id,voucherEmailMergeImported(previous?[previous]:[],id));
    refreshVoucherEmailStatus(id);
   }catch(error){console.warn('Não foi possível atualizar o indicador do voucher.',error);}
  }
  return result;
 };
 const style=document.createElement('style');style.textContent='#v8-toasts[popover]{inset:auto 12px calc(12px + env(safe-area-inset-bottom)) auto;margin:0;border:0;padding:0;background:transparent;overflow:visible;width:min(440px,calc(100vw - 24px));max-width:calc(100vw - 24px)}';document.head.append(style);
 function feedback(){
  const host=document.getElementById('v8-toasts');
  if(host&&host.children.length){
   // Toasts inside the active dialog remain accessible and above its backdrop.
   const parent=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;
   if(host.parentElement!==parent)parent.append(host);
   if(typeof host.showPopover==='function'){host.setAttribute('popover','manual');if(!host.matches(':popover-open'))host.showPopover();}
   for(const toast of host.children)for(const node of toast.childNodes)if(node.nodeType===3&&/^E-mail enviado/.test(node.textContent))node.textContent=node.textContent.replace(/^E-mail enviado/,'Voucher enviado');
  }
  for(const button of document.querySelectorAll('button[onclick]')){
   const action=button.getAttribute('onclick')||'';
   if(!action.startsWith('sendBookingVoucher('))continue;
   if(button.disabled&&button.textContent==='Processando envio…'){button.textContent='Enviando voucher…';button.setAttribute('aria-busy','true');}
   else if(!button.disabled&&button.hasAttribute('aria-busy'))button.removeAttribute('aria-busy');
  }
 }
 new MutationObserver(feedback).observe(document.body,{subtree:true,childList:true});
})();
