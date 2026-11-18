// Link de reserva: Pix do sinal pelo Mercado Pago do guia e avisos por e-mail ao guia.
// Público (o cliente não tem login). Toda decisão é conferida no banco e na API do Mercado Pago.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dBR = (v: unknown) => String(v || '').split('-').reverse().join('/')
const MP = 'https://api.mercadopago.com'
const FN = 'https://ewhfabhktkvrjddnvgkl.supabase.co/functions/v1/fluida-booking-pay'

async function sha256(s: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(request.url)
  const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const db = createClient(Deno.env.get('SUPABASE_URL') || '', secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const resendKey = Deno.env.get('RESEND_API_KEY') || ''
  const clientId = Deno.env.get('MP_CLIENT_ID') || '', clientSecret = Deno.env.get('MP_CLIENT_SECRET') || ''

  // Token do guia, renovando se estiver vencido.
  async function guideToken(l: any): Promise<string> {
    const m = l?.mp; if (!m?.access_token) return ''
    if (m.expires_at && Date.parse(m.expires_at) < Date.now() + 864e5 && m.refresh_token && clientId && clientSecret) {
      const r = await fetch(`${MP}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: m.refresh_token }) })
      const t = await r.json().catch(() => ({}))
      if (r.ok && t.access_token) {
        await db.rpc('fluida_mp_save', { p_account: l.account_id, p_user: null, p_data: { user_id: String(t.user_id || ''), access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + Number(t.expires_in || 0) * 1000).toISOString(), public_key: t.public_key } })
        return t.access_token
      }
    }
    return m.access_token
  }

  async function mail(to: string, subject: string, lines: string[]) {
    if (!resendKey || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return
    const html = `<div style="font:15px/1.6 Arial,sans-serif;color:#173234;max-width:560px"><h2 style="color:#07383a;margin:0 0 12px">${esc(subject)}</h2>${lines.map(x => `<p style="margin:6px 0">${x}</p>`).join('')}
      <p style="margin-top:18px"><a href="https://reservasfluida.com.br/" style="background:#07383a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir o Fluida</a></p>
      <p style="color:#60726d;font-size:12px;margin-top:18px">Aviso automático do Fluida.</p></div>`
    await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` }, body: JSON.stringify({ from: '"Fluida" <reservas@reservasfluida.com.br>', to: [to], subject, html }) }).catch(() => {})
  }

  async function notifyPaid(id: string) {
    const { data: l } = await db.rpc('fluida_link_by_id', { p_id: id })
    if (!l || l.notified_paid_at) return
    await db.rpc('fluida_link_set', { p_id: id, p_patch: { notified_paid: true } })
    await mail(l.notify_email, `Sinal pago: ${l.client?.name || ''} (${brl(l.deposit)})`, [
      `<b>${esc(l.client?.name)}</b> pagou o sinal de <b>${brl(l.deposit)}</b> pelo link de reserva.`,
      `${esc(l.itinerary)} · ${dBR(l.tour_date)}${l.tour_time ? ' · ' + String(l.tour_time).slice(0, 5) : ''} · ${l.pax} pessoa(s)`,
      `Localizador: ${esc(l.booking_code || '')} · falta receber ${brl(Number(l.total) - Number(l.deposit))}`,
      'O pagamento já está registrado na reserva como sinal.',
    ])
  }

  async function checkAndApply(l: any, paymentId: string) {
    const token = await guideToken(l); if (!token || !paymentId) return 'pending'
    const r = await fetch(`${MP}/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${token}` } })
    const p = await r.json().catch(() => ({}))
    if (!r.ok || String(p.external_reference || '') !== `link:${l.id}`) return 'pending'
    if (p.status === 'approved') {
      const res = await db.rpc('fluida_link_apply_payment', { p_id: l.id, p_mp_payment: String(p.id), p_amount: Number(p.transaction_amount || l.deposit) })
      if (!res.error) await notifyPaid(l.id)
      return 'approved'
    }
    return String(p.status || 'pending')
  }

  try {
    // Avisos ao guia (chamados pelo banco quando a reserva entra ou o cliente avisa que pagou)
    const notify = url.searchParams.get('notify')
    if (notify) {
      const { data: l } = await db.rpc('fluida_link_by_id', { p_id: notify })
      if (!l) return json({ ok: true })
      const claim = url.searchParams.get('claim') === '1'
      if (claim && l.client_paid_claim_at && !l.notified_claim_at) {
        await db.rpc('fluida_link_set', { p_id: l.id, p_patch: { notified_claim: true } })
        await mail(l.notify_email, `Confira o Pix: ${l.client?.name || ''} disse que pagou o sinal`, [
          `<b>${esc(l.client?.name)}</b> avisou que pagou o sinal de <b>${brl(l.deposit)}</b> na sua chave Pix.`,
          `${esc(l.itinerary)} · ${dBR(l.tour_date)} · Localizador ${esc(l.booking_code || '')}`,
          'Confira no seu banco e registre o pagamento na reserva (Abrir reserva → Registrar pagamento).',
        ])
      } else if (!claim && l.booking_id && !l.notified_booked_at) {
        await db.rpc('fluida_link_set', { p_id: l.id, p_patch: { notified_booked: true } })
        await mail(l.notify_email, `Nova reserva pelo link: ${l.client?.name || ''}`, [
          `<b>${esc(l.client?.name)}</b> preencheu o link de reserva.`,
          `${esc(l.itinerary)} · ${dBR(l.tour_date)}${l.tour_time ? ' · ' + String(l.tour_time).slice(0, 5) : ''} · ${l.pax} pessoa(s) · total ${brl(l.total)}`,
          `WhatsApp: ${esc(l.client?.phone)} · E-mail: ${esc(l.client?.email)}`,
          l.mp ? `O sinal de ${brl(l.deposit)} será confirmado sozinho quando o Pix for pago.` : `O cliente vai pagar o sinal de ${brl(l.deposit)} na sua chave Pix. Você recebe outro aviso quando ele disser que pagou.`,
        ])
      }
      return json({ ok: true })
    }

    // Notificação do Mercado Pago
    if (url.searchParams.get('webhook') === '1') {
      const linkId = url.searchParams.get('link') || ''
      const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
      const topic = String(body?.type || body?.topic || url.searchParams.get('type') || url.searchParams.get('topic') || '')
      const pid = String(body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || '')
      if (topic === 'payment' && pid && /^[0-9a-f-]{36}$/.test(linkId)) {
        const { data: l } = await db.rpc('fluida_link_by_id', { p_id: linkId })
        if (l && l.status !== 'paid') await checkAndApply(l, pid)
      }
      return json({ ok: true })
    }

    if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
    const body = await request.json().catch(() => ({}))
    const token = String(body?.t || '')
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return json({ error: 'Link inválido.' }, 400)
    const { data: l } = await db.rpc('fluida_link_by_hash', { p_hash: await sha256(token) })
    if (!l) return json({ error: 'Link não encontrado.' }, 404)

    if (body.action === 'check') {
      if (l.status === 'paid') return json({ ok: true, status: 'approved' })
      return json({ ok: true, status: l.mp_payment_id ? await checkAndApply(l, l.mp_payment_id) : 'pending' })
    }

    if (body.action === 'pix') {
      if (l.status === 'paid') return json({ ok: true, status: 'approved' })
      if (l.status !== 'booked') return json({ error: 'Preencha seus dados antes de pagar.' }, 400)
      const gt = await guideToken(l)
      if (!gt) return json({ error: 'Pagamento automático indisponível.' }, 400)
      if (l.mp_payment_id) {
        const r0 = await fetch(`${MP}/v1/payments/${encodeURIComponent(l.mp_payment_id)}`, { headers: { Authorization: `Bearer ${gt}` } })
        const p0 = await r0.json().catch(() => ({}))
        if (r0.ok && p0.status === 'approved') { await checkAndApply(l, l.mp_payment_id); return json({ ok: true, status: 'approved' }) }
        const tx0 = p0?.point_of_interaction?.transaction_data
        if (r0.ok && p0.status === 'pending' && tx0?.qr_code && (!p0.date_of_expiration || Date.parse(p0.date_of_expiration) > Date.now() + 120000))
          return json({ ok: true, status: 'pending', qr_code: tx0.qr_code, qr_code_base64: tx0.qr_code_base64, amount: p0.transaction_amount })
      }
      const r = await fetch(`${MP}/v1/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gt}`, 'X-Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          transaction_amount: Number(l.deposit), description: `Sinal - ${l.itinerary} (${dBR(l.tour_date)})`.slice(0, 200), payment_method_id: 'pix',
          payer: { email: l.client?.email, first_name: String(l.client?.name || '').split(' ')[0] }, external_reference: `link:${l.id}`,
          notification_url: `${FN}?webhook=1&link=${l.id}`, date_of_expiration: new Date(Date.now() + 24 * 3600e3).toISOString().replace('Z', '-00:00'),
        }),
      })
      const p = await r.json().catch(() => ({}))
      const tx = p?.point_of_interaction?.transaction_data
      if (!r.ok || !tx?.qr_code) { console.error('MP Pix do guia recusado', r.status, p?.message || ''); return json({ error: 'Não foi possível gerar o Pix agora. Tente de novo em instantes.' }, 502) }
      await db.rpc('fluida_link_set', { p_id: l.id, p_patch: { mp_payment_id: String(p.id) } })
      return json({ ok: true, status: 'pending', qr_code: tx.qr_code, qr_code_base64: tx.qr_code_base64, amount: p.transaction_amount })
    }
    return json({ error: 'Ação inválida.' }, 400)
  } catch (e) {
    console.error('link de reserva', e instanceof Error ? e.message : '')
    return json({ error: 'Não foi possível concluir agora.' }, 500)
  }
})
