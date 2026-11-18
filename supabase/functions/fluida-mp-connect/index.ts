// Conecta a conta Mercado Pago do guia (OAuth) para receber o sinal dos links de reserva.
// Precisa dos segredos MP_CLIENT_ID e MP_CLIENT_SECRET (aplicação do Fluida no Mercado Pago).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const REDIRECT = 'https://ewhfabhktkvrjddnvgkl.supabase.co/functions/v1/fluida-mp-connect'
const APP = 'https://reservasfluida.com.br'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const supaUrl = Deno.env.get('SUPABASE_URL') || ''
  const publishable = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || Deno.env.get('SUPABASE_ANON_KEY') || ''
  const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const clientId = Deno.env.get('MP_CLIENT_ID') || '', clientSecret = Deno.env.get('MP_CLIENT_SECRET') || ''
  const admin = createClient(supaUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const url = new URL(request.url)

  // Volta do Mercado Pago
  if (request.method === 'GET' && url.searchParams.get('state')) {
    const back = (q: string) => Response.redirect(`${APP}/?mp=${q}`, 302)
    try {
      const { data: st } = await admin.rpc('fluida_mp_state_take', { p_state: url.searchParams.get('state') })
      const code = url.searchParams.get('code') || ''
      if (!st || !code || !clientId || !clientSecret) return back('erro')
      const r = await fetch('https://api.mercadopago.com/oauth/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
      })
      const t = await r.json().catch(() => ({}))
      if (!r.ok || !t.access_token) { console.error('MP oauth', r.status, t?.message || ''); return back('erro') }
      await admin.rpc('fluida_mp_save', { p_account: st.account_id, p_user: st.user_id, p_data: {
        user_id: String(t.user_id || ''), access_token: t.access_token, refresh_token: t.refresh_token || null,
        expires_at: t.expires_in ? new Date(Date.now() + Number(t.expires_in) * 1000).toISOString() : null, public_key: t.public_key || null } })
      return back('conectado')
    } catch { return back('erro') }
  }

  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  const authorization = request.headers.get('Authorization') || ''
  const userDb = createClient(supaUrl, publishable, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: u } = await userDb.auth.getUser()
  if (!u?.user) return json({ error: 'Entre no app.' }, 401)
  const { data: member } = await admin.from('members').select('account_id, role').eq('user_id', u.user.id).maybeSingle()
  if (!member || member.role !== 'owner') return json({ error: 'Só o responsável da conta pode conectar o Mercado Pago.' }, 403)
  const body = await request.json().catch(() => ({}))

  if (body.action === 'start') {
    if (!clientId || !clientSecret) return json({ error: 'A conexão com o Mercado Pago ainda está sendo configurada. Por enquanto, use a chave Pix.' }, 503)
    const state = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    await admin.rpc('fluida_mp_state_create', { p_state: state, p_account: member.account_id, p_user: u.user.id })
    const auth = `https://auth.mercadopago.com.br/authorization?client_id=${encodeURIComponent(clientId)}&response_type=code&platform_id=mp&state=${state}&redirect_uri=${encodeURIComponent(REDIRECT)}`
    return json({ ok: true, url: auth })
  }
  if (body.action === 'disconnect') {
    await admin.rpc('fluida_mp_delete', { p_account: member.account_id })
    return json({ ok: true })
  }
  return json({ error: 'Ação inválida.' }, 400)
})
