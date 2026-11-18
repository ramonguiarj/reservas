// Gerado a partir do index.html (mesmo modelo do voucher do app). Atualize junto.
const VOUCHER_LOCALES = {"pt": {"locale": "pt-BR", "client": "Cliente", "email": "E-mail", "code": "Localizador", "qr": "QR code do localizador", "hello": "Olá", "welcome": "Com este voucher confirmamos sua reserva. Confira os detalhes e as informações importantes para sua experiência.", "reservation": "Informações da reserva", "people": "pessoa(s)", "included": "Itens inclusos", "ticket": "Ingresso incluso", "noTicket": "Ingresso não incluso", "transport": "Transporte incluso", "breakfast": "Café da manhã incluso", "iphone": "Fotos de iPhone", "camera": "Fotos de câmera", "meeting": "Transporte e horário de início", "start": "Início do tour", "address": "Endereço e ponto de encontro", "pickupTransport": "A busca será feita na hospedagem informada ou no ponto de encontro combinado. Confirme o local com a equipe.", "pickupDefault": "O endereço ou ponto de encontro será combinado com a equipe.", "pending": "A confirmar", "payment": "Pagamento", "total": "Valor total", "received": "Sinal e pagamentos recebidos", "balance": "Saldo em aberto", "instructions": "Informações para o cliente", "happy": "Estamos felizes em receber você no passeio!", "policy": "Política de cancelamento", "policyDefault": "Entre em contato para consultar a política de cancelamento.", "reviewIntro": "Depois do passeio, conte como foi:", "review": "deixar avaliação", "print": "Imprimir / salvar PDF", "subject": "Confirmação da sua reserva", "whatsapp": "Seguem os dados da sua reserva", "contact": "Em caso de dúvidas, fale com a equipe."}, "en": {"locale": "en-US", "client": "Guest", "email": "Email", "code": "Booking reference", "qr": "Booking reference QR code", "hello": "Hello", "welcome": "This voucher confirms your booking. Please review the details and important information for your experience.", "reservation": "Booking details", "people": "guest(s)", "included": "What is included", "ticket": "Admission included", "noTicket": "Admission not included", "transport": "Transportation included", "breakfast": "Breakfast included", "iphone": "iPhone photos", "camera": "Camera photos", "meeting": "Transportation and start time", "start": "Tour start time", "address": "Address and meeting point", "pickupTransport": "Pickup will be at the accommodation provided or the agreed meeting point. Please confirm the location with our team.", "pickupDefault": "The address or meeting point will be arranged with our team.", "pending": "To be confirmed", "payment": "Payment", "total": "Total amount", "received": "Deposit and payments received", "balance": "Outstanding balance", "instructions": "Information for your visit", "happy": "We look forward to welcoming you on the tour!", "policy": "Cancellation policy", "policyDefault": "Please contact us for the cancellation policy.", "reviewIntro": "After the tour, tell us about your experience:", "review": "leave a review", "print": "Print / save as PDF", "subject": "Your booking confirmation", "whatsapp": "Here are the details of your booking", "contact": "If you have any questions, please contact our team."}, "es": {"locale": "es-ES", "client": "Cliente", "email": "Correo electrónico", "code": "Código de reserva", "qr": "Código QR de la reserva", "hello": "Hola", "welcome": "Este voucher confirma tu reserva. Revisa los detalles y la información importante para tu experiencia.", "reservation": "Información de la reserva", "people": "persona(s)", "included": "Servicios incluidos", "ticket": "Entrada incluida", "noTicket": "Entrada no incluida", "transport": "Transporte incluido", "breakfast": "Desayuno incluido", "iphone": "Fotos con iPhone", "camera": "Fotos con cámara", "meeting": "Transporte y hora de inicio", "start": "Inicio del tour", "address": "Dirección y punto de encuentro", "pickupTransport": "La recogida será en el alojamiento indicado o en el punto de encuentro acordado. Confirma el lugar con nuestro equipo.", "pickupDefault": "La dirección o el punto de encuentro se acordará con nuestro equipo.", "pending": "Por confirmar", "payment": "Pago", "total": "Importe total", "received": "Anticipo y pagos recibidos", "balance": "Saldo pendiente", "instructions": "Información para el cliente", "happy": "¡Nos alegra recibirte en el paseo!", "policy": "Política de cancelación", "policyDefault": "Contáctanos para consultar la política de cancelación.", "reviewIntro": "Después del paseo, cuéntanos cómo fue:", "review": "dejar una reseña", "print": "Imprimir / guardar PDF", "subject": "Confirmación de tu reserva", "whatsapp": "Estos son los datos de tu reserva", "contact": "Si tienes alguna duda, contacta con nuestro equipo."}};
const VOUCHER_POLICIES = {}; // Política padrão traduzida da conta original não se aplica a outros guias.
const VOUCHER_ITINERARIES = {};
const voucherEscape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const voucherNormalize = value => String(value ?? '').replace(/\r\n/g,'\n').trim();
function voucherLanguage(phone, preference='auto'){
  if(['pt','en','es'].includes(preference)) return preference;
  const raw=String(phone || '').trim();
  let digits=raw.replace(/\D/g,'');
  const international=raw.startsWith('+') || digits.startsWith('00');
  if(digits.startsWith('00')) digits=digits.slice(2);
  if(!digits) return 'pt';
  if(!international && (digits.length===10 || digits.length===11)) return 'pt';
  if(digits.startsWith('55') || digits.startsWith('351')) return 'pt';
  const spanish=['1787','1939','1809','1829','1849','34','51','52','53','54','56','57','58','502','503','504','505','506','507','591','593','595','598','240'];
  return spanish.some(code=>digits.startsWith(code)) ? 'es' : 'en';
}
function voucherDefaultPolicy(language,source){
  return voucherNormalize(source)===voucherNormalize(VOUCHER_POLICIES.pt) ? VOUCHER_POLICIES[language] || '' : '';
}
function voucherTranslated(source,translations,language,key,label,missing){
  const original=voucherNormalize(source);
  if(language==='pt' || !original) return original;
  const entry=translations?.[language];
  if(entry && voucherNormalize(entry.source?.[key])===original && voucherNormalize(entry[key])) return voucherNormalize(entry[key]);
  if(key==='cancel_policy'){
    const ready=voucherDefaultPolicy(language,original);
    if(ready) return ready;
  }
  if(key==='itinerary' && VOUCHER_ITINERARIES[original]?.[language]) return VOUCHER_ITINERARIES[original][language];
  // Sem tradução válida, preserva o conteúdo original neste trecho.
  missing.push(label);
  return original;
}
function voucherCatalogTransport(booking,item,itineraries){
  const rows=itineraries.filter(i=>i.name===item.itinerary);
  if(!rows.length)return false;
  const bookingTime=Date.parse(booking.created_at || '');
  const time=row=>{const t=Date.parse(row.created_at || '');return Number.isFinite(t)?t:0;};
  const eligible=Number.isFinite(bookingTime)?rows.filter(row=>time(row)<=bookingTime):rows;
  const choices=(eligible.length?eligible:rows).slice().sort((a,b)=>time(b)-time(a)||Number(b.active===true)-Number(a.active===true));
  return Boolean(choices[0]?.transport_included);
}
function buildVoucherData(booking,account,itineraries=[]){
  const language=voucherLanguage(booking.client_phone,booking.voucher_options?.language);
  const t=VOUCHER_LOCALES[language], missing=[];
  const options=booking.voucher_options || {};
  const rawServices=Array.isArray(booking.schedule_items) && booking.schedule_items.length ? booking.schedule_items : [{tour_date:booking.tour_date,tour_time:booking.tour_time,itinerary:booking.itinerary,pax:booking.pax,ticket_included:booking.ticket_included,ticket_info:booking.ticket_info}];
  const services=rawServices.map((item,index)=>({...item,
    itinerary:voucherTranslated(item.itinerary,item.translations,language,'itinerary',`Roteiro ${index+1}`,missing),
    ticket_info:item.ticket_included ? voucherTranslated(item.ticket_info,item.translations,language,'ticket_info',`Ingresso do roteiro ${index+1}`,missing) : '',
    pickup:voucherTranslated(item.pickup,item.translations,language,'pickup',`Busca do roteiro ${index+1}`,missing)
  }));
  const instructions=voucherTranslated(booking.client_message,options.translations,language,'client_message','Instruções para o cliente',missing) || t.happy;
  const pickup=voucherTranslated(booking.pickup_location,options.translations,language,'pickup_location','Endereço / instruções de busca',missing);
  const policy=voucherTranslated(account.cancel_policy,options.translations,language,'cancel_policy','Política de cancelamento',missing) || t.policyDefault;
  const anyOption=key=>Boolean(options[key]) || rawServices.some(item=>Boolean(item.options?.[key]));
  const hasTransport=anyOption('transport') || rawServices.some(item=>voucherCatalogTransport(booking,item,itineraries));
  const benefits=[...services.filter(item=>item.ticket_included).map(item=>`${t.ticket}: ${item.ticket_info || item.itinerary}`),hasTransport && t.transport,anyOption('breakfast') && t.breakfast,anyOption('iphone_photos') && t.iphone,anyOption('camera_photos') && t.camera].filter(Boolean);
  const received=(booking.payments || []).filter(p=>!p.voided).reduce((sum,p)=>sum+Number(p.amount || 0),0);
  const code=String(booking.booking_code || booking.id || '');
  return {fallbacks:[...new Set(missing)],language,t,services,instructions,pickup:pickup || (hasTransport?t.pickupTransport:t.pickupDefault),policy,benefits,hasTransport,received,balance:Math.max(0,Number(booking.total || 0)-received),code,qrUrl:`https://api.qrserver.com/v1/create-qr-code/?size=200x200&format=png&data=${encodeURIComponent(code)}`};
}
function renderVoucherHTML(booking,account,itineraries=[],settings={}){
  const d=buildVoucherData(booking,account,itineraries), t=d.t, e=voucherEscape;
  const L=(settings.layout&&typeof settings.layout==='object')?settings.layout:{}, show=k=>!(L.show&&L.show[k]===false);
  const C=/^#[0-9a-f]{6}$/i.test(String(settings.primaryColor||''))?settings.primaryColor:'#07383a';
  const BB=/^#[0-9a-f]{6}$/i.test(String(L.header_bg||''))?L.header_bg:'#e2ddc7';
  const welcomeText=d.language==='pt'&&String(L.welcome_text||'').trim()?String(L.welcome_text).trim():t.welcome;
  const footer=String(L.footer_text||'').trim();
  const date=value=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return String(value || t.pending);
    return new Date(`${value}T12:00:00Z`).toLocaleDateString(t.locale,{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'});
  };
  const money=value=>Number(value || 0).toLocaleString(t.locale,{style:'currency',currency:'BRL'});
  const section=(title,text)=>`<section class="section" style="border:1px solid #dce3dd;border-radius:12px;overflow:hidden;margin:18px 0"><h2 style="margin:0;background:#eef2eb;color:${C};padding:12px 16px;font-size:16px;line-height:1.4;font-weight:700">${e(title)}</h2><div class="content" style="padding:16px;white-space:pre-wrap;line-height:1.65">${e(text)}</div></section>`;
  const details=d.services.map(item=>`${date(item.tour_date)}${item.tour_time?' · '+String(item.tour_time).slice(0,5):''} · ${item.itinerary} · ${item.pax} ${t.people} · ${item.ticket_included?t.ticket:t.noTicket}`).join('\n');
  const pickups=[d.pickup,...d.services.filter(item=>item.pickup).map(item=>`${date(item.tour_date)}: ${item.pickup}`)].join('\n');
  const times=d.services.map(item=>`${date(item.tour_date)} · ${item.tour_time?String(item.tour_time).slice(0,5):t.pending}`).join('\n');
  const firstName=String(booking.client_name || '').trim().split(/\s+/)[0] || t.client;
  const image=d.language==='pt' && settings.welcomeImage ? `<img src="${e(settings.welcomeImage)}" alt="Rio de Janeiro" style="display:block;width:100%;height:auto;margin:18px 0">` : '';
  const brand=settings.brandImage?`<div class="voucher-brand" style="background:${BB};text-align:left;border-radius:14px 14px 0 0;margin:-24px -24px 20px;padding:12px 24px"><img src="${e(settings.brandImage)}" alt="${e(account.name||'')}" width="112" style="display:block;width:112px;max-width:100%;height:auto;margin:0"></div>`:'';
  const safeReview=/^https?:\/\//i.test(String(account.review_url || ''));
  const html=`<!doctype html><html lang="${t.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voucher · ${e(d.code)}</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f3eb;color:#173234;font:15px/1.65 -apple-system,BlinkMacSystemFont,"Avenir Next","Segoe UI",Arial,sans-serif}main{max-width:720px;margin:24px auto;padding:24px;background:#fff;border:1px solid #d7dfd7;border-radius:14px}h1{font-size:26px;line-height:1.2;color:${C}}h2{font-size:16px}h3{font-size:18px}table{width:100%;border-collapse:collapse}th,td{padding:12px 8px;border-bottom:1px solid #d7dfd7;text-align:left;font-size:14px;overflow-wrap:anywhere}.section{break-inside:avoid}.notes,.note{white-space:pre-wrap}button{font:inherit;min-height:44px;padding:10px 16px;border:0;border-radius:10px;background:${C};color:#fff;cursor:pointer}.print{margin:16px 0}@media(max-width:600px){.voucher-brand{margin:-16px -16px 16px!important;padding:10px 16px!important;border-radius:12px 12px 0 0!important}main{margin:8px;padding:16px;border-radius:12px}h1{font-size:23px}th,td{padding:9px 5px;font-size:13px}}@media print{.voucher-brand{margin:0 0 16px!important;border-radius:0!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}body{background:#fff}main{margin:0;border:0;border-radius:0;padding:0}.print,button,.help{display:none}tr,.section{break-inside:avoid}}</style></head><body><main>
  ${brand}
  <header style="padding:0 0 20px;border-bottom:2px solid ${C}"><p><b>${e(t.client)}:</b> ${e(booking.client_name)}<br>${show('client_email')?`<b>${e(t.email)}:</b> ${e(booking.client_email)}<br>`:''}<b>${e(t.code)}:</b> ${e(d.code)}</p>${show('qr')?`<img src="${e(settings.qrImage || d.qrUrl)}" alt="${e(t.qr)}" width="88" height="88" style="display:block;border:1px solid #dce3dd;border-radius:8px;padding:6px;background:#fff">`:''}</header>
  <h1 style="color:${C};margin:24px 0 10px;line-height:1.25">${e(t.hello)}, ${e(firstName)}!</h1><p style="white-space:pre-wrap">${e(welcomeText)}</p>${show('welcome_image')?image:''}
  ${section(t.reservation,details)}${show('included')&&d.benefits.length?section(t.included,d.benefits.join('\n')):''}
  ${show('meeting')?section(t.meeting,`${d.hasTransport?t.transport+'\n\n':''}${t.start}:\n${times}\n\n${t.address}:\n${pickups}`):''}
  ${settings.hideValues||!show('payment')?'':section(t.payment,`${t.total}: ${money(booking.total)}\n${t.received}: ${money(d.received)}\n${t.balance}: ${money(d.balance)}`)}
  ${show('instructions')?section(t.instructions,d.instructions):''}${show('policy')?section(t.policy,d.policy):''}
  ${footer?`<section class="section" style="margin:18px 0;padding:14px 16px;border-left:4px solid ${C};background:#f7f8f5;white-space:pre-wrap">${e(footer)}</section>`:''}
  ${safeReview&&show('review')?`<p>${e(t.reviewIntro)} <a href="${e(account.review_url)}">${e(t.review)}</a></p>`:''}
  ${settings.email?'':`<button class="print" onclick="print()">${e(t.print)}</button>`}</main></body></html>`;
  return {...d,html,subject:`${t.subject} ${d.code} - ${account.name}`};
}

export {voucherLanguage, buildVoucherData, renderVoucherHTML};
