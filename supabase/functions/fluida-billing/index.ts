// Assinatura dos guias pelo Mercado Pago: cartão (recorrente) e Pix (1 mês por pagamento).
// Também recebe as notificações (webhook) do Mercado Pago. Sempre confere o status direto na API do
// Mercado Pago com o token da plataforma, então uma notificação falsa não libera nada.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MP = 'https://api.mercadopago.com'

function env() {
  const url = Deno.env.get('SUPABASE_URL') || ''
  return {
    url,
    publishable: JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || Deno.env.get('SUPABASE_ANON_KEY') || '',
    secret: JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    mpToken: Deno.env.get('MP_ACCESS_TOKEN') || '',
    price: Number(Deno.env.get('FLUIDA_PRICE') || '100'),
    appUrl: Deno.env.get('FLUIDA_APP_URL') || 'https://reservasfluida.vercel.app',
    webhook: `${url}/functions/v1/fluida-billing?webhook=1`,
  }
}

async function mp(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`${MP}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } })
  const body = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, body }
}

// deno-lint-ignore no-explicit-any
async function applyPayment(admin: any, providerId: string, account: string, kind: 'pix' | 'card', amount: number) {
  const r = await admin.rpc('fluida_billing_apply_payment', { p_provider_id: providerId, p_account: account, p_kind: kind, p_amount: amount, p_months: 1 })
  if (r.error) throw new Error('apply_failed')
  return r.data
}

// deno-lint-ignore no-explicit-any
async function handleWebhook(admin: any, token: string, topic: string, id: string) {
  if (!id) return
  if (topic === 'payment') {
    const p = await mp(`/v1/payments/${encodeURIComponent(id)}`, token)
    if (!p.ok || p.body?.status !== 'approved') return
    const ref = String(p.body.external_reference || '')
    const account = ref.startsWith('pix:') ? ref.slice(4) : ref
    if (!UUID.test(account)) return
    if (!ref.startsWith('pix:')) {
      // Cobrança recorrente do cartão: só vale para conta com assinatura registrada.
      const { data } = await admin.from('accounts').select('mp_preapproval_id').eq('id', account).maybeSingle()
      if (!data?.mp_preapproval_id) return
    }
    await applyPayment(admin, `mp-pay-${p.body.id}`, account, ref.startsWith('pix:') ? 'pix' : 'card', Number(p.body.transaction_amount || 0))
    return
  }
  if (topic === 'subscription_preapproval' || topic === 'preapproval') {
    const s = await mp(`/preapproval/${encodeURIComponent(id)}`, token)
    if (!s.ok) return
    const account = String(s.body.external_reference || '')
    if (!UUID.test(account)) return
    const status = String(s.body.status || '')
    const { data: acc } = await admin.from('accounts').select('id, billing_status, paid_until, mp_preapproval_id').eq('id', account).maybeSingle()
    if (!acc || (acc.mp_preapproval_id && acc.mp_preapproval_id !== s.body.id)) return
    if (status === 'authorized') {
      // Primeira cobrança acontece em até ~1 hora: 2 dias de tolerância até o pagamento confirmar.
      const grace = new Date(Date.now() + 2 * 864e5).toISOString()
      const paidUntil = acc.paid_until && acc.paid_until > grace ? acc.paid_until : grace
      await admin.from('accounts').update({ billing_status: acc.billing_status === 'exempt' ? 'exempt' : 'active', paid_until: paidUntil, mp_preapproval_id: s.body.id, billing_updated_at: new Date().toISOString() }).eq('id', account)
    } else if (status === 'cancelled' || status === 'paused') {
      await admin.from('accounts').update({ billing_status: acc.billing_status === 'exempt' ? 'exempt' : 'cancelled', billing_updated_at: new Date().toISOString() }).eq('id', account)
    }
    return
  }
  if (topic === 'subscription_authorized_payment' || topic === 'authorized_payment') {
    const a = await mp(`/authorized_payments/${encodeURIComponent(id)}`, token)
    if (!a.ok) return
    const payment = a.body?.payment || {}
    if (payment.status !== 'approved' || !payment.id) return
    const { data: acc } = await admin.from('accounts').select('id').eq('mp_preapproval_id', String(a.body.preapproval_id || '')).maybeSingle()
    if (!acc) return
    await applyPayment(admin, `mp-pay-${payment.id}`, acc.id, 'card', Number(a.body.transaction_amount || 0))
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const E = env()
  const admin = createClient(E.url, E.secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const url = new URL(request.url)

  // ---- Notificações do Mercado Pago ----
  if (url.searchParams.get('webhook') === '1') {
    try {
      const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
      const topic = String(body?.type || body?.topic || url.searchParams.get('type') || url.searchParams.get('topic') || '')
      const id = String(body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || '')
      if (E.mpToken) await handleWebhook(admin, E.mpToken, topic, id)
    } catch (error) {
      console.error('Falha ao processar notificação do Mercado Pago', error instanceof Error ? error.message : '')
    }
    return json({ ok: true })
  }

  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  try {
    if (!E.mpToken) return json({ error: 'Os pagamentos ainda não foram configurados na plataforma.' }, 503)
    const authorization = request.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Entre no app para assinar.' }, 401)
    const userDb = createClient(E.url, E.publishable, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userData, error: userError } = await userDb.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401)

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '')
    const { data: member } = await admin.from('members').select('account_id, role, email').eq('user_id', userData.user.id).eq('role', 'owner').limit(1).maybeSingle()
    if (!member) return json({ error: 'Somente o responsável da conta pode assinar.' }, 403)
    const accountId = member.account_id
    const { data: account } = await admin.from('accounts').select('id, name, billing_status, paid_until, trial_ends_at, mp_preapproval_id').eq('id', accountId).single()
    if (!account) return json({ error: 'Conta não encontrada.' }, 404)
    if (account.billing_status === 'exempt') return json({ error: 'Esta conta não precisa de assinatura.' }, 400)
    const payerEmail = String(body?.payer_email || member.email || '').trim().toLowerCase()
    if (!EMAIL.test(payerEmail)) return json({ error: 'Informe um e-mail válido para o pagamento.' }, 400)

    if (action === 'checkout_card') {
      const r = await mp('/preapproval', E.mpToken, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Assinatura Fluida - plano mensal',
          external_reference: accountId,
          payer_email: payerEmail,
          auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: E.price, currency_id: 'BRL' },
          back_url: `${E.appUrl}/?assinatura=retorno`,
          status: 'pending',
        }),
      })
      if (!r.ok || !r.body?.init_point) {
        console.error('Mercado Pago recusou a assinatura', r.status, r.body?.message || '')
        return json({ error: r.body?.message ? `Mercado Pago: ${r.body.message}` : 'Não foi possível iniciar a assinatura.' }, 502)
      }
      await admin.from('accounts').update({ mp_preapproval_id: r.body.id, billing_email: payerEmail, billing_updated_at: new Date().toISOString() }).eq('id', accountId)
      return json({ ok: true, url: r.body.init_point })
    }

    if (action === 'pix') {
      const r = await mp('/v1/payments', E.mpToken, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          transaction_amount: E.price,
          description: 'Fluida - mensalidade (1 mês)',
          payment_method_id: 'pix',
          payer: { email: payerEmail },
          external_reference: `pix:${accountId}`,
          notification_url: E.webhook,
        }),
      })
      const tx = r.body?.point_of_interaction?.transaction_data
      if (!r.ok || !tx?.qr_code) {
        console.error('Mercado Pago recusou o Pix', r.status, r.body?.message || '')
        return json({ error: r.body?.message ? `Mercado Pago: ${r.body.message}` : 'Não foi possível gerar o Pix.' }, 502)
      }
      return json({ ok: true, payment_id: String(r.body.id), qr_code: tx.qr_code, qr_code_base64: tx.qr_code_base64, expires_at: r.body.date_of_expiration, amount: E.price })
    }

    if (action === 'check_pix') {
      const id = String(body?.payment_id || '')
      if (!/^\d+$/.test(id)) return json({ error: 'Pagamento inválido.' }, 400)
      const p = await mp(`/v1/payments/${id}`, E.mpToken)
      if (!p.ok) return json({ error: 'Não foi possível consultar o pagamento.' }, 502)
      if (String(p.body.external_reference || '') !== `pix:${accountId}`) return json({ error: 'Pagamento de outra conta.' }, 403)
      if (p.body.status === 'approved') {
        await applyPayment(admin, `mp-pay-${p.body.id}`, accountId, 'pix', Number(p.body.transaction_amount || 0))
        const { data: fresh } = await admin.from('accounts').select('paid_until').eq('id', accountId).single()
        return json({ ok: true, status: 'approved', paid_until: fresh?.paid_until })
      }
      return json({ ok: true, status: p.body.status })
    }

    if (action === 'cancel_card') {
      if (!account.mp_preapproval_id) return json({ error: 'Não há assinatura no cartão.' }, 400)
      const r = await mp(`/preapproval/${encodeURIComponent(account.mp_preapproval_id)}`, E.mpToken, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) })
      if (!r.ok) return json({ error: 'Não foi possível cancelar agora.' }, 502)
      await admin.from('accounts').update({ billing_status: 'cancelled', billing_updated_at: new Date().toISOString() }).eq('id', accountId)
      return json({ ok: true })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (error) {
    console.error('Falha na assinatura', error instanceof Error ? error.message : '')
    return json({ error: 'Não foi possível concluir agora.' }, 500)
  }
})
