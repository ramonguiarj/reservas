// Envia por e-mail os avisos da fila para os administradores da plataforma (novo guia, pagamento).
// Pode ser chamada por qualquer um: ela só processa o que já está na fila do banco.
import { createClient } from 'npm:@supabase/supabase-js@2'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const day = (v: unknown) => v ? new Date(String(v)).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
const money = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const resendKey = Deno.env.get('RESEND_API_KEY') || ''
  const from = Deno.env.get('FLUIDA_FROM_EMAIL') || 'reservas@reservasfluida.com.br'
  const appUrl = Deno.env.get('FLUIDA_APP_URL') || 'https://reservasfluida.com.br'
  const ok = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } })
  if (!url || !secret || !resendKey) return ok({ ok: false, error: 'config' })
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data, error } = await admin.rpc('fluida_admin_notify_claim')
  if (error) return ok({ ok: false, error: 'claim' })
  const items = data?.items || [], to: string[] = data?.admins || []
  if (!items.length || !to.length) return ok({ ok: true, sent: 0 })

  let sent = 0
  for (const n of items) {
    let subject = '', lines: string[] = []
    if (n.kind === 'account_created') {
      subject = `Novo guia no Fluida: ${n.account_name || n.payload?.business_name || ''}`
      lines = [
        `<b>${esc(n.account_name || n.payload?.business_name)}</b> criou a conta no Fluida.`,
        `E-mail: ${esc(n.owner_email || n.payload?.email)}`,
        `Teste grátis até: <b>${day(n.trial_ends_at)}</b>`,
      ]
    } else if (n.kind === 'lead') {
      const q = n.payload || {}
      subject = `Pedido de teste no Fluida: ${q.business_name || q.name || ''}`
      const wa = String(q.whatsapp || '').replace(/\D/g, '')
      lines = [
        `<b>${esc(q.name)}</b> (${esc(q.business_name)}) quer testar o Fluida.`,
        `E-mail: ${esc(q.email)}`,
        q.whatsapp ? `WhatsApp: ${wa ? `<a href="https://wa.me/${wa.length <= 11 ? '55' : ''}${wa}">${esc(q.whatsapp)}</a>` : esc(q.whatsapp)}` : '',
        q.city ? `Cidade: ${esc(q.city)}` : '',
        q.message ? `Mensagem: ${esc(q.message)}` : '',
        'Para liberar, abra a Administração Fluida → <b>Pedidos de teste</b> → <b>Criar convite</b>.',
      ].filter(Boolean)
    } else {
      subject = `Pagamento recebido: ${n.account_name || ''} (${money(n.payload?.amount)})`
      lines = [
        `<b>${esc(n.account_name)}</b> pagou a mensalidade do Fluida.`,
        `Valor: <b>${money(n.payload?.amount)}</b> · Forma: ${n.payload?.kind === 'pix' ? 'Pix' : n.payload?.kind === 'card' ? 'cartão (recorrente)' : esc(n.payload?.kind)}`,
        `Conta paga até: <b>${day(n.paid_until)}</b>`,
        `E-mail do guia: ${esc(n.owner_email)}`,
      ]
    }
    const html = `<div style="font:15px/1.6 Arial,sans-serif;color:#173234;max-width:560px">
      <h2 style="color:#07383a;margin:0 0 12px">${esc(subject)}</h2>
      ${lines.map(l => `<p style="margin:6px 0">${l}</p>`).join('')}
      <p style="margin-top:18px"><a href="${appUrl}" style="background:#07383a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir a Administração Fluida</a></p>
      <p style="color:#60726d;font-size:12px;margin-top:18px">Aviso automático do Fluida.</p></div>`
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}`, 'Idempotency-Key': `admin-notify-${n.id}` },
        body: JSON.stringify({ from: `"Fluida" <${from}>`, to, subject, html }),
      })
      if (r.ok) { sent++; await admin.rpc('fluida_admin_notify_done', { p_id: n.id, p_ok: true }) }
      else await admin.rpc('fluida_admin_notify_done', { p_id: n.id, p_ok: false, p_error: `provider_${r.status}` })
    } catch {
      await admin.rpc('fluida_admin_notify_done', { p_id: n.id, p_ok: false, p_error: 'network' })
    }
  }
  return ok({ ok: true, sent })
})
