// Lembretes de assinatura para os guias: 2 dias antes do vencimento, no vencimento (somente leitura)
// e quando o acesso é bloqueado. Pode ser chamada por qualquer um: só envia o que o banco marcar como devido.
import { createClient } from 'npm:@supabase/supabase-js@2'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const day = (v: unknown) => new Date(String(v)).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const resendKey = Deno.env.get('RESEND_API_KEY') || ''
  const appUrl = Deno.env.get('FLUIDA_APP_URL') || 'https://reservasfluida.com.br'
  const ok = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } })
  if (!url || !secret || !resendKey) return ok({ ok: false, error: 'config' })
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data, error } = await admin.rpc('fluida_billing_reminders_claim')
  if (error) return ok({ ok: false, error: 'claim' })
  const items = data?.items || []
  let sent = 0
  for (const n of items) {
    const to = String(n.email || '').trim().toLowerCase()
    if (!EMAIL.test(to)) { await admin.rpc('fluida_billing_reminders_done', { p_id: n.id, p_ok: false, p_error: 'sem_email' }); continue }
    const name = esc(n.account_name || 'sua conta')
    const venc = day(n.expiry)
    const bloqueio = day(new Date(new Date(n.expiry).getTime() + 7 * 864e5))
    const exclusao = day(new Date(new Date(n.expiry).getTime() + 30 * 864e5))
    const what = n.trial ? 'seu teste grátis do Fluida' : 'sua assinatura do Fluida'
    let subject = '', lines: string[] = [], cta = 'Assinar agora'
    if (n.kind === 'soon') {
      subject = n.trial ? `Seu teste grátis do Fluida termina em ${venc}` : `Sua assinatura do Fluida vence em ${venc}`
      lines = [
        `Olá! Passando para avisar que ${what} (<b>${name}</b>) termina em <b>${venc}</b>.`,
        'Para continuar criando reservas e enviando vouchers sem interrupção, assine agora. Leva menos de 1 minuto pelo Pix ou cartão.',
        'O plano custa <b>R$ 100 por mês</b>, sem fidelidade.',
      ]
      if (!n.trial) cta = 'Pagar mais um mês'
    } else if (n.kind === 'expired') {
      subject = `Sua conta no Fluida está somente leitura`
      lines = [
        `${n.trial ? 'O seu teste grátis' : 'A sua assinatura'} do Fluida (<b>${name}</b>) terminou em <b>${venc}</b>.`,
        'Por enquanto você ainda consegue ver todas as reservas, mas não consegue criar nem alterar nada.',
        `Assine até <b>${bloqueio}</b> para não perder o acesso. Nenhum dado foi apagado: tudo volta ao normal assim que o pagamento for confirmado.`,
      ]
    } else {
      subject = `Seu acesso ao Fluida foi bloqueado`
      lines = [
        `O acesso à conta <b>${name}</b> no Fluida foi bloqueado por falta de pagamento.`,
        `Seus dados continuam guardados até <b>${exclusao}</b>. Depois dessa data, a conta e os dados podem ser excluídos.`,
        'Assine agora para recuperar o acesso na hora, com tudo como estava.',
      ]
      cta = 'Recuperar meu acesso'
    }
    const link = `${appUrl}/?assinar=1`
    const html = `<div style="font:15px/1.6 Arial,sans-serif;color:#173234;max-width:560px">
      <h2 style="color:#07383a;margin:0 0 12px">${esc(subject)}</h2>
      ${lines.map(l => `<p style="margin:8px 0">${l}</p>`).join('')}
      <p style="margin:22px 0"><a href="${link}" style="background:#07383a;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${cta}</a></p>
      <p style="color:#60726d;font-size:13px">Ou entre no app e toque em <b>Assinar</b> na barra do rodapé. Dúvidas? É só responder este e-mail.</p>
      <p style="color:#60726d;font-size:12px;margin-top:18px">Fluida · reservasfluida.com.br</p></div>`
    const text = `${subject}\n\n${lines.map(l => l.replace(/<[^>]+>/g, '')).join('\n\n')}\n\n${cta}: ${link}\n\nFluida · reservasfluida.com.br`
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}`, 'Idempotency-Key': `billing-reminder-${n.id}` },
        body: JSON.stringify({ from: '"Fluida" <reservas@reservasfluida.com.br>', to: [to], reply_to: 'ramon.guiarj@gmail.com', subject, html, text }),
      })
      if (r.ok) { sent++; await admin.rpc('fluida_billing_reminders_done', { p_id: n.id, p_ok: true }) }
      else await admin.rpc('fluida_billing_reminders_done', { p_id: n.id, p_ok: false, p_error: `provider_${r.status}` })
    } catch {
      await admin.rpc('fluida_billing_reminders_done', { p_id: n.id, p_ok: false, p_error: 'network' })
    }
  }
  return ok({ ok: true, sent })
})
