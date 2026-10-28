/* Durable offline state. No credentials, access tokens or PDFs are stored here. */
(function(root){
'use strict';
const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
class Database{
 constructor(name='fluida-offline-v1'){this.name=name;this.handle=null;}
 open(){if(this.handle)return Promise.resolve(this.handle);return new Promise((resolve,reject)=>{const r=indexedDB.open(this.name,1);r.onupgradeneeded=()=>r.result.createObjectStore('scopes',{keyPath:'key'});r.onsuccess=()=>{this.handle=r.result;this.handle.onversionchange=()=>{this.handle.close();this.handle=null;};resolve(this.handle);};r.onerror=()=>reject(r.error);});}
 async get(key){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('scopes','readonly'),r=tx.objectStore('scopes').get(key);r.onsuccess=()=>resolve(copy(r.result||null));r.onerror=()=>reject(r.error);});}
 async edit(key,fn){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('scopes','readwrite'),store=tx.objectStore('scopes');let result;const r=store.get(key);r.onsuccess=()=>{try{const current=copy(r.result||{key,queue:[]});result=fn(current);store.put(current);}catch(e){result=e;tx.abort();}};tx.oncomplete=()=>resolve(copy(result));tx.onabort=()=>reject(result instanceof Error?result:tx.error||Error('Não foi possível guardar os dados no dispositivo.'));tx.onerror=()=>{};});}
 async remove(key){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('scopes','readwrite');tx.objectStore('scopes').delete(key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
}
function enqueue(state,item){
 if(!state.snapshot)throw Error('Baixe os dados para acesso offline antes de editar sem conexão.');
 const same=state.queue.find(x=>x.id===item.id);if(same)return same;
 if(state.queue.some(x=>x.localId===item.localId))throw Error('Esta reserva já tem uma alteração aguardando sincronização. Sincronize ou confira a fila antes de editar novamente.');
 if(state.key!==item.scope)throw Error('Conta diferente da cópia offline.');
 state.queue.push(copy(item));return item;
}
function overlay(snapshot,queue){
 const s=copy(snapshot);if(!s)return null;
 for(const item of queue){
  const args=item.args;let b=s.allAccountBookings.find(x=>x.id===item.localId);
  if(item.kind==='booking'){
   const base=b||{id:item.localId,account_id:args.p_account_id,status:'aberta',write_version:1,payments:[],booking_code:'Local · aguardando envio',created_at:item.createdAt,created_by:item.user};
   b={...base,...copy(args.p_booking),id:item.localId,_offlineRequest:item.id,_offlineState:item.status};
   b.payments=[...(base.payments||[]),...(args.p_signals||[]).map((p,i)=>({...p,id:item.id+'-'+i,booking_id:b.id,voided:false,payment_type:'sinal',_offline:true}))];
   s.allAccountBookings=s.allAccountBookings.filter(x=>x.id!==b.id).concat(b);
   const customer=args.p_customer_sync;if(customer?.profile){s.centralCustomerCache=s.centralCustomerCache.filter(x=>x.id!==customer.id).concat({...customer.profile,id:customer.id,account_id:args.p_account_id,updated_at:customer.updatedAt,_offline:true});}
  }else if(item.kind==='payment'&&b){b.payments=(b.payments||[]).concat({...copy(args.p_payment),id:item.id,booking_id:b.id,account_id:args.p_account_id,voided:false,_offline:true});b._offlineRequest=item.id;b._offlineState=item.status;}
 }
 return s;
}
function rpcName(item){return item.kind==='payment'?'add_payment_atomic':'fluida_save_booking_v10';}
function failure(error){const code=String(error?.code||'');if(code==='40001')return 'conflict';if(/^(28|42)/.test(code)||code==='PGRST301'||error?.status===401)return 'auth';if(/^(22|23)/.test(code)||code==='PGRST202'||code==='PGRST204')return 'error';return 'queued';}
const api={Database,copy,enqueue,overlay,rpcName,failure};root.FluidaOfflineCore=api;if(typeof module==='object')module.exports=api;
})(globalThis);
