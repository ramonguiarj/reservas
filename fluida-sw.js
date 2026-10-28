'use strict';
const CACHE='fluida-shell-20261028-1';
const SHELL=['/','/offline-core.js','/fluida-offline.js','/gmail-cloud-panel.js','/privacidade.html','/manifest.webmanifest'];
const SDK='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 for(const path of SHELL){const r=await fetch(path,{cache:'reload'});if(!r.ok)throw Error('Falha ao preparar '+path);await cache.put(path,r);}
 const sdk=await fetch(SDK,{mode:'no-cors',cache:'reload'});if(!sdk.ok&&sdk.type!=='opaque')throw Error('Biblioteca indisponível');await cache.put(SDK,sdk);
 // Do not replace an active worker while a form is open. The next normal navigation activates this version.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('fluida-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);
 if(req.url===SDK){event.respondWith((async()=>{const c=await caches.open(CACHE);return await c.match(SDK)||fetch(req);})());return;}
 if(url.origin!==self.location.origin)return;
 if(req.mode==='navigate'&&(url.pathname==='/'||url.pathname==='/index.html'||url.pathname==='/privacidade.html')){
  event.respondWith((async()=>{const c=await caches.open(CACHE),key=url.pathname==='/privacidade.html'?'/privacidade.html':'/';const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),5000);try{const r=await fetch(req,{signal:ctrl.signal});if(!r.ok)throw Error('Conexão indisponível');await c.put(key,r.clone());return r;}catch(e){return await c.match(key)||Response.error();}finally{clearTimeout(timer);}})());return;
 }
 if(SHELL.includes(url.pathname)&&url.pathname!=='/')event.respondWith((async()=>{const c=await caches.open(CACHE);try{const r=await fetch(req);if(!r.ok)throw Error('Conexão indisponível');await c.put(url.pathname,r.clone());return r;}catch(e){return await c.match(url.pathname)||Response.error();}})());
});
