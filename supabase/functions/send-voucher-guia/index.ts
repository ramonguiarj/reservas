// Envio do voucher por e-mail para contas de guias (multi-guias).
// - Remetente aparece com o nome do guia; respostas vão para o e-mail do guia (reply-to).
// - Voucher montado com as escolhas do guia (accounts.branding.voucher) e a marca dele.
// - Mesmo controle anti-duplicidade do envio original (claim/finish_voucher_email_send + Idempotency-Key).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { renderVoucherHTML } from './voucher.js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function dataUrlAttachment(value: unknown, id: string, name: string) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ''))
  if (!m) return null
  const ext = m[1] === 'image/jpeg' ? 'jpg' : m[1].split('/')[1]
  return { filename: `${name}.${ext}`, content: m[2], content_type: m[1], content_id: id }
}
function senderAddress(raw: string) {
  const inside = /<([^>]+)>/.exec(raw)
  const address = (inside ? inside[1] : raw).trim()
  return EMAIL.test(address) ? address : ''
}
function displayName(value: string) {
  return value.replace(/["<>\r\n\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Reservas'
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Entre no app para enviar o voucher.' }, 401)

    const url = Deno.env.get('SUPABASE_URL')
    const publishable = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || Deno.env.get('SUPABASE_ANON_KEY')
    const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const fromRaw = Deno.env.get('FLUIDA_FROM_EMAIL') || Deno.env.get('RESEND_FROM_EMAIL') || ''
    const fromAddress = senderAddress(fromRaw)
    if (!url || !publishable || !secret || !resendKey || !fromAddress) {
      return json({ error: 'O envio de e-mail não está configurado no servidor.', definitive: true }, 500)
    }

    const userDb = createClient(url, publishable, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: userData, error: userError } = await userDb.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401)
    const userId = userData.user.id

    const body = await request.json().catch(() => ({}))
    const bookingId = String(body?.booking_id || '')
    const requestId = String(body?.request_id || '')
    if (!UUID.test(bookingId) || !UUID.test(requestId)) return json({ error: 'Solicitação inválida.', definitive: true }, 400)

    // Leitura com as permissões do próprio usuário (RLS): só acessa reservas da conta dele.
    const { data: booking, error: bookingError } = await userDb.from('bookings').select('*, payments(*)').eq('id', bookingId).single()
    if (bookingError || !booking) return json({ error: 'Reserva não encontrada ou sem acesso.', definitive: true }, 404)
    const { data: account, error: accountError } = await userDb.from('accounts').select('*').eq('id', booking.account_id).single()
    if (accountError || !account) return json({ error: 'Dados da conta não encontrados.', definitive: true }, 404)
    const { data: itineraries } = await userDb.from('itineraries').select('*').eq('account_id', booking.account_id)

    const to = String(booking.client_email || '').trim().toLowerCase()
    if (!EMAIL.test(to)) return json({ error: 'Cadastre um e-mail válido do cliente na reserva.', definitive: true }, 400)

    const branding = (account.branding && typeof account.branding === 'object') ? account.branding : {}
    const voucher = (branding.voucher && typeof branding.voucher === 'object') ? branding.voucher : {}
    const logo = dataUrlAttachment(branding.logo, 'brand-logo', 'logo')
    const welcome = dataUrlAttachment(branding.welcome_image, 'welcome-image', 'boas-vindas')

    let rendered
    try {
      rendered = renderVoucherHTML(booking, account, itineraries || [], {
        email: true,
        qrImage: 'cid:booking-qr',
        brandImage: logo ? 'cid:brand-logo' : '',
        welcomeImage: welcome ? 'cid:welcome-image' : '',
        layout: voucher,
        primaryColor: branding.primary_color || '',
      })
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Confira os dados do voucher.', definitive: true }, 422)
    }

    // Controle anti-duplicidade (mesmo registro usado pelo envio original).
    const claim = await admin.rpc('claim_voucher_email_send', {
      p_request_id: requestId, p_booking_id: bookingId, p_requested_by: userId,
      p_language: rendered.language, p_recipient: to, p_payload: { kind: 'brand_voucher', subject: rendered.subject },
    })
    if (claim.error) return json({ error: 'Não foi possível registrar o envio. Tente novamente.' }, 500)
    const c = claim.data || {}
    switch (c.action) {
      case 'send': break
      case 'accepted': return json({ ok: true, status: 'accepted', recipient: c.recipient || to, id: c.provider_id })
      case 'processing': return json({ error: `Envio em andamento. Aguarde ${c.retry_after || 30} segundos e tente de novo.` }, 409)
      case 'cooldown': return json({ error: `Um voucher acabou de ser enviado. Aguarde ${c.retry_after || 60} segundos.`, definitive: true }, 429)
      case 'unresolved': return json({ error: 'Há um envio anterior sem confirmação para esta reserva. Tente novamente para retomá-lo.' }, 409)
      case 'forbidden': return json({ error: 'Seu perfil não permite enviar vouchers.', definitive: true }, 403)
      case 'failed': return json({ error: 'O envio anterior falhou. Inicie um novo envio.', definitive: true }, 409)
      case 'retry_window_expired': return json({ error: 'A tentativa anterior expirou. Inicie um novo envio.', definitive: true }, 409)
      default: return json({ error: 'Não foi possível enviar este voucher.', definitive: true }, 400)
    }
    const lease = c.lease_token

    let replyTo = String(voucher.reply_to || '').trim().toLowerCase()
    if (!EMAIL.test(replyTo)) {
      const { data: owner } = await admin.from('members').select('email').eq('account_id', booking.account_id).eq('role', 'owner')
        .order('user_id').limit(1).maybeSingle()
      replyTo = EMAIL.test(String(owner?.email || '')) ? String(owner?.email).toLowerCase() : ''
    }
    const name = displayName(String(voucher.sender_name || account.name || ''))
    const attachments = [
      ...(logo ? [logo] : []),
      ...(welcome && rendered.language === 'pt' ? [welcome] : []),
      { path: rendered.qrUrl, filename: 'localizador-qr.png', content_id: 'booking-qr', content_type: 'image/png' },
    ]

    let response: Response
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}`, 'Idempotency-Key': `voucher-${requestId}` },
        body: JSON.stringify({
          from: `"${name}" <${fromAddress}>`,
          to: [to],
          ...(replyTo ? { reply_to: replyTo } : {}),
          subject: rendered.subject,
          html: rendered.html,
          attachments,
        }),
      })
    } catch {
      await admin.rpc('finish_voucher_email_send', { p_request_id: requestId, p_lease_token: lease, p_status: 'uncertain', p_error_code: 'network' })
      return json({ error: 'Sem confirmação do serviço de e-mail. Tente novamente para retomar o mesmo envio, sem duplicar.' }, 502)
    }
    const result = await response.json().catch(() => ({}))
    if (response.ok && result?.id) {
      await admin.rpc('finish_voucher_email_send', { p_request_id: requestId, p_lease_token: lease, p_status: 'accepted', p_provider_id: String(result.id) })
      return json({ ok: true, status: 'accepted', recipient: to, id: result.id })
    }
    const definitive = response.status >= 400 && response.status < 500 && response.status !== 409 && response.status !== 429
    await admin.rpc('finish_voucher_email_send', {
      p_request_id: requestId, p_lease_token: lease, p_status: definitive ? 'failed' : 'uncertain', p_error_code: `provider_${response.status}`,
    })
    console.error('Resend recusou o envio', response.status, result?.name || '')
    return json({ error: definitive ? 'O serviço de e-mail recusou o envio. Confira o e-mail do cliente.' : 'O serviço de e-mail não confirmou. Tente novamente para retomar o mesmo envio.', definitive }, 502)
  } catch (error) {
    console.error('Falha no envio do voucher por marca', error)
    return json({ error: 'Não foi possível enviar o voucher.' }, 500)
  }
})
