// Lembrete ao cliente na véspera do passeio (17h de Brasília), com o voucher completo.
// Vale para contas de guias (pode ser desligado em Configurações) e, na conta original, só se for ligado.
// Pode ser chamada por qualquer um: só envia o que o banco marcar como devido, uma vez por reserva e data.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { renderVoucherHTML, voucherLanguage } from './voucher.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SEND_DOMAIN = 'reservasfluida.com.br'
const RESERVED = ['admin','administrador','suporte','fluida','reservasfluida','financeiro','cobranca','postmaster','abuse','noreply','no-reply','contato','equipe']
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
function localPart(chosen: unknown, name: string) {
  const c = String(chosen || '').trim().toLowerCase()
  if (/^[a-z0-9](?:[a-z0-9.-]{1,38})[a-z0-9]$/.test(c) && !/[.-]{2}/.test(c) && !RESERVED.includes(c)) return c
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40)
  return slug.length >= 3 && !RESERVED.includes(slug) ? slug : 'reservas'
}
const displayName = (v: string) => v.replace(/["<>\r\n\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Reservas'
function dataUrlAttachment(value: unknown, id: string, name: string) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ''))
  if (!m) return null
  return { filename: `${name}.${m[1] === 'image/jpeg' ? 'jpg' : m[1].split('/')[1]}`, content: m[2], content_type: m[1], content_id: id }
}
const T: Record<string, { subject: string; title: string; body: string; time: string; place: string; contact: string }> = {
  pt: { subject: 'Lembrete: seu passeio é amanhã', title: 'Seu passeio é amanhã!', body: 'Estamos te esperando. Confira abaixo o horário, o ponto de encontro e os detalhes da sua reserva.', time: 'Horário', place: 'Encontro', contact: 'Alguma dúvida? É só responder este e-mail.' },
  en: { subject: 'Reminder: your tour is tomorrow', title: 'Your tour is tomorrow!', body: 'We look forward to seeing you. Please check the time, meeting point and booking details below.', time: 'Time', place: 'Meeting point', contact: 'Any questions? Just reply to this email.' },
  es: { subject: 'Recordatorio: tu paseo es mañana', title: '¡Tu paseo es mañana!', body: 'Te esperamos. Revisa abajo el horario, el punto de encuentro y los detalles de tu reserva.', time: 'Horario', place: 'Encuentro', contact: '¿Alguna duda? Solo responde este correo.' },
}

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const resendKey = Deno.env.get('RESEND_API_KEY') || ''
  const out = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } })
  if (!url || !secret || !resendKey) return out({ ok: false, error: 'config' })
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.rpc('fluida_tour_reminders_claim')
  if (error) return out({ ok: false, error: 'claim' })
  const items = data?.items || []
  let sent = 0
  const started = Date.now()
  for (const it of items) {
    if (Date.now() - started > 45000) break
    const done = (ok: boolean, provider: string | null, err: string | null) =>
      db.rpc('fluida_tour_reminders_done', { p_booking: it.booking_id, p_date: it.tour_date, p_ok: ok, p_provider: provider, p_error: err })
    try {
      const { data: booking } = await db.from('bookings').select('*, payments!payments_booking_id_fkey(*)').eq('id', it.booking_id).single()
      const { data: account } = await db.from('accounts').select('*').eq('id', it.account_id).single()
      if (!booking || !account || booking.deleted_at || booking.status === 'cancelada') { await done(false, null, 'perm:cancelada'); continue }
      const to = String(booking.client_email || '').trim().toLowerCase()
      if (!EMAIL.test(to)) { await done(false, null, 'perm:sem_email'); continue }
      const { data: itineraries } = await db.from('itineraries').select('*').eq('account_id', it.account_id)
      const branding = (account.branding && typeof account.branding === 'object') ? account.branding : {}
      const voucher = (branding.voucher && typeof branding.voucher === 'object') ? branding.voucher : {}
      const logo = dataUrlAttachment(branding.logo, 'brand-logo', 'logo')
      const rendered = renderVoucherHTML(booking, account, itineraries || [], {
        email: true, qrImage: 'cid:booking-qr', brandImage: logo ? 'cid:brand-logo' : '', welcomeImage: '', layout: voucher, primaryColor: branding.primary_color || '',
      })
      const lang = ['pt', 'en', 'es'].includes(rendered.language) ? rendered.language : voucherLanguage(booking.client_phone, booking.voucher_options?.language)
      const t = T[lang] || T.pt
      const items2 = Array.isArray(booking.schedule_items) && booking.schedule_items.length ? booking.schedule_items : [{ tour_date: booking.tour_date, tour_time: booking.tour_time, itinerary: booking.itinerary, pickup: '' }]
      const todays = items2.filter((s: any) => s.tour_date === it.tour_date)
      const C = /^#[0-9a-f]{6}$/i.test(String(branding.primary_color || '')) ? branding.primary_color : '#07383a'
      const rows = todays.map((s: any) => `<p style="margin:6px 0"><b>${esc(s.itinerary || booking.itinerary || '')}</b><br>${esc(t.time)}: <b>${esc(String(s.tour_time || booking.tour_time || '').slice(0, 5) || '—')}</b><br>${esc(t.place)}: ${esc(s.pickup || booking.pickup_location || '—')}</p>`).join('')
      const box = `<section style="margin:0 0 20px;padding:16px 18px;border-radius:12px;background:#fff8e6;border:2px solid ${C}"><h2 style="margin:0 0 6px;color:${C};font-size:22px">${esc(t.title)}</h2><p style="margin:0 0 8px">${esc(t.body)}</p>${rows}<p style="margin:8px 0 0;font-size:13px;color:#52665e">${esc(t.contact)}</p></section>`
      const html = String(rendered.html).replace(/(<main[^>]*>)/, `$1${box}`)
      const name = displayName(String(voucher.sender_name || account.name || ''))
      let replyTo = String(voucher.reply_to || '').trim().toLowerCase()
      if (!EMAIL.test(replyTo)) {
        const { data: owner } = await db.from('members').select('email').eq('account_id', it.account_id).eq('role', 'owner').order('user_id').limit(1).maybeSingle()
        replyTo = EMAIL.test(String(owner?.email || '')) ? String(owner?.email).toLowerCase() : ''
      }
      const attachments = [...(logo ? [logo] : []), { path: rendered.qrUrl, filename: 'localizador-qr.png', content_id: 'booking-qr', content_type: 'image/png' }]
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}`, 'Idempotency-Key': `tour-reminder/${it.booking_id}/${it.tour_date}` },
        body: JSON.stringify({ from: `"${name}" <${localPart(voucher.sender_local, name)}@${SEND_DOMAIN}>`, to: [to], ...(replyTo ? { reply_to: replyTo } : {}), subject: `${t.subject} · ${booking.booking_code || ''}`.trim(), html, attachments }),
      })
      const res = await r.json().catch(() => ({}))
      if (r.ok && res?.id) { sent++; await done(true, String(res.id), null) }
      else await done(false, null, (r.status >= 400 && r.status < 500 && r.status !== 429 ? 'perm:' : '') + 'provider_' + r.status)
    } catch (e) {
      await done(false, null, 'erro:' + (e instanceof Error ? e.message : '').slice(0, 120))
    }
    await new Promise(r => setTimeout(r, 400))
  }
  return out({ ok: true, eligible: items.length, sent })
})
