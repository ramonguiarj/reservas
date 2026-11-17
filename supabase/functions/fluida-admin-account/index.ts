// Exclusão definitiva de conta de guia, acionada só pela Administração Fluida.
// Confere: usuário é administrador da plataforma, conta elegível (bloqueada e data de exclusão alcançada)
// e nome digitado igual ao da conta. Apaga os arquivos e depois os registros (fluida_admin_purge_account).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUCKETS = ['booking-tickets', 'fluida-documents', 'fluida-gmail-private']

// deno-lint-ignore no-explicit-any
async function listAll(admin: any, bucket: string, prefix: string, out: string[], depth = 0) {
  if (depth > 6) return
  let offset = 0
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`storage_list_${bucket}`)
    if (!data?.length) break
    for (const item of data) {
      const path = `${prefix}/${item.name}`
      if (item.id === null || item.id === undefined) await listAll(admin, bucket, path, out, depth + 1)
      else out.push(path)
    }
    if (data.length < 1000) break
    offset += 1000
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  try {
    const url = Deno.env.get('SUPABASE_URL') || ''
    const publishable = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || Deno.env.get('SUPABASE_ANON_KEY') || ''
    const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const authorization = request.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Entre no app.' }, 401)
    const userDb = createClient(url, publishable, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: userData, error: userError } = await userDb.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401)
    const isAdmin = await userDb.rpc('fluida_is_platform_admin')
    if (isAdmin.error || isAdmin.data !== true) return json({ error: 'Acesso restrito à administração do Fluida.' }, 403)

    const body = await request.json().catch(() => ({}))
    const accountId = String(body?.account_id || '')
    if (body?.action !== 'delete' || !UUID.test(accountId)) return json({ error: 'Solicitação inválida.' }, 400)

    const elig = await admin.rpc('fluida_account_delete_eligible', { p_account: accountId })
    if (elig.error || !elig.data) return json({ error: 'Conta não encontrada.' }, 404)
    if (!elig.data.eligible) return json({ error: 'Esta conta ainda não pode ser excluída.' }, 409)
    const typed = String(body?.confirm_name || '').trim()
    if (typed !== String(elig.data.name || '').trim()) return json({ error: 'Digite o nome do negócio exatamente como aparece para confirmar.' }, 400)

    let removed = 0
    for (const bucket of BUCKETS) {
      const paths: string[] = []
      await listAll(admin, bucket, accountId, paths)
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100)
        const { error } = await admin.storage.from(bucket).remove(chunk)
        if (error) return json({ error: 'Não foi possível apagar os arquivos. Nada foi excluído do banco; tente novamente.' }, 502)
        removed += chunk.length
      }
    }

    const purge = await admin.rpc('fluida_admin_purge_account', { p_account: accountId, p_actor: userData.user.id })
    if (purge.error) {
      console.error('Falha na exclusão da conta', purge.error.message)
      return json({ error: `Não foi possível concluir: ${purge.error.message}` }, 500)
    }
    return json({ ok: true, files: removed, ...purge.data })
  } catch (error) {
    console.error('Falha na exclusão de conta', error instanceof Error ? error.message : '')
    return json({ error: 'Não foi possível concluir agora.' }, 500)
  }
})
