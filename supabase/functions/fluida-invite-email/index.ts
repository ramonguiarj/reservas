// Envia ao guia o e-mail com o convite de cadastro. Só a administração do Fluida pode chamar.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  try {
    const url = Deno.env.get('SUPABASE_URL') || ''
    const publishable = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || Deno.env.get('SUPABASE_ANON_KEY') || ''
    const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const resendKey = Deno.env.get('RESEND_API_KEY') || ''
    const appUrl = Deno.env.get('FLUIDA_APP_URL') || 'https://reservasfluida.com.br'
    const authorization = request.headers.get('Authorization') || ''
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Entre no app.' }, 401)
    const userDb = createClient(url, publishable, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
    const isAdmin = await userDb.rpc('fluida_is_platform_admin')
    if (isAdmin.error || isAdmin.data !== true) return json({ error: 'Acesso restrito à administração.' }, 403)
    const body = await request.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    if (!EMAIL.test(email)) return json({ error: 'E-mail inválido.' }, 400)
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: inv } = await admin.rpc('fluida_invite_lookup', { p_email: email })
    if (!inv || inv.accepted_at) return json({ error: 'Convite não encontrado ou já usado.' }, 404)
    const link = `${appUrl}/?convite=${encodeURIComponent(email)}&modo=cadastro`
    const until = inv.expires_at ? new Date(inv.expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''
    const subject = `Seu acesso ao Fluida está pronto (${inv.business_name})`
    const html = `<div style="font:15px/1.6 Arial,sans-serif;color:#173234;max-width:560px">
      <h2 style="color:#07383a;margin:0 0 12px">Bem-vindo ao Fluida!</h2>
      <p>Olá! A conta <b>${esc(inv.business_name)}</b> já está liberada para você criar. São <b>7 dias grátis</b>, com tudo liberado.</p>
      <p style="margin:22px 0"><a href="${link}" style="background:#07383a;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Criar minha conta</a></p>
      <p>Use este e-mail (<b>${esc(email)}</b>) e crie uma senha.${until ? ` O convite vale até <b>${until}</b>.` : ''}</p>
      <p>Depois de entrar, siga o quadro <b>Primeiros passos</b> na tela Hoje para colocar seu logo, sua política de cancelamento e seus roteiros.</p>
      <p style="color:#60726d;font-size:13px">Dúvidas? É só responder este e-mail.</p>
      <p style="color:#60726d;font-size:12px;margin-top:18px">Fluida · reservasfluida.com.br</p></div>`
    const text = `Bem-vindo ao Fluida!\n\nA conta ${inv.business_name} já está liberada. Crie sua conta em: ${link}\nUse o e-mail ${email} e crie uma senha.${until ? ' O convite vale até ' + until + '.' : ''}\n\nFluida · reservasfluida.com.br`
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}`, 'Idempotency-Key': `invite-${email}-${inv.expires_at}` },
      body: JSON.stringify({ from: '"Fluida" <reservas@reservasfluida.com.br>', to: [email], reply_to: 'ramon.guiarj@gmail.com', subject, html, text }),
    })
    if (!r.ok) return json({ error: 'O serviço de e-mail não aceitou o envio.' }, 502)
    return json({ ok: true })
  } catch (e) {
    console.error('convite', e instanceof Error ? e.message : '')
    return json({ error: 'Não foi possível enviar o e-mail.' }, 500)
  }
})
