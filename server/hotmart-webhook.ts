import type { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'

// ─── Supabase admin (Service Role Key — nunca expor no frontend) ─────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Mapeamento: Hotmart offer code → plano no sistema ───────────────────────
const OFFER_PLANO: Record<string, { plano: string; limite_projetos: number }> = {
  ryocqtbi: { plano: 'mensal',    limite_projetos: 999 },
  '0jmo96l5': { plano: 'plugin',  limite_projetos: 999 },
  kp490dsu: { plano: 'pro',       limite_projetos: 999 },
}

// ─── Tipos dos eventos Hotmart ────────────────────────────────────────────────
type HotmartEvent =
  | 'PURCHASE_APPROVED'
  | 'PURCHASE_COMPLETE'
  | 'PURCHASE_CANCELED'
  | 'PURCHASE_REFUNDED'
  | 'PURCHASE_CHARGEBACK'
  | 'SUBSCRIPTION_CANCELLATION'

interface HotmartPayload {
  event: HotmartEvent
  data: {
    buyer: {
      email: string
      name?: string
    }
    purchase: {
      offer: {
        code: string
      }
      status: string
      approved_date?: number
      order_date?: number
    }
    subscription?: {
      status: string
      plan?: {
        name?: string
      }
    }
  }
}

// ─── Valida o token secreto da Hotmart ───────────────────────────────────────
function validarToken(req: Request): boolean {
  const token = req.headers['x-hotmart-hottok'] as string
  return token === process.env.HOTMART_WEBHOOK_SECRET
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function hotmartWebhookHandler(req: Request, res: Response) {
  // 1. Validar token secreto
  if (!validarToken(req)) {
    console.warn('[Hotmart] Token inválido recebido')
    return res.status(401).json({ error: 'Token inválido' })
  }

  const payload = req.body as HotmartPayload

  if (!payload?.event || !payload?.data) {
    return res.status(400).json({ error: 'Payload inválido' })
  }

  const { event, data } = payload
  const email = data.buyer?.email?.toLowerCase()
  const offerCode = data.purchase?.offer?.code

  console.log(`[Hotmart] Evento: ${event} | Email: ${email} | Oferta: ${offerCode}`)

  if (!email) {
    return res.status(400).json({ error: 'Email não encontrado no payload' })
  }

  // 2. Buscar user_id no Supabase pelo email
  const { data: users, error: userError } = await supabase.auth.admin.listUsers()

  if (userError) {
    console.error('[Hotmart] Erro ao buscar usuários:', userError)
    return res.status(500).json({ error: 'Erro ao buscar usuário' })
  }

  const user = users.users.find(u => u.email?.toLowerCase() === email)

  if (!user) {
    console.warn(`[Hotmart] Usuário não encontrado para email: ${email}`)
    // Retornar 200 para a Hotmart não retentar — o usuário pode ainda não ter se cadastrado
    return res.status(200).json({ ok: true, aviso: 'Usuário não encontrado' })
  }

  // 3. Processar evento
  if (event === 'PURCHASE_APPROVED' || event === 'PURCHASE_COMPLETE') {
    const ofertaInfo = offerCode ? OFFER_PLANO[offerCode] : null

    if (!ofertaInfo) {
      console.warn(`[Hotmart] Oferta desconhecida: ${offerCode}`)
      return res.status(200).json({ ok: true, aviso: 'Oferta não mapeada' })
    }

    const dataExpiracao = new Date()
    dataExpiracao.setMonth(dataExpiracao.getMonth() + 1) // +30 dias

    const { error } = await supabase
      .from('assinaturas')
      .upsert(
        {
          user_id: user.id,
          email: email,
          plano: ofertaInfo.plano,
          status: 'ativo',
          limite_projetos: ofertaInfo.limite_projetos,
          data_inicio: new Date().toISOString(),
          data_expiracao: dataExpiracao.toISOString(),
          hotmart_offer_code: offerCode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('[Hotmart] Erro ao ativar assinatura:', error)
      return res.status(500).json({ error: 'Erro ao ativar assinatura' })
    }

    console.log(`[Hotmart] ✅ Assinatura ATIVADA — ${email} → plano: ${ofertaInfo.plano}`)
    return res.status(200).json({ ok: true })
  }

  // 4. Cancelamento / reembolso / chargeback → desativar
  if (
    event === 'PURCHASE_CANCELED' ||
    event === 'PURCHASE_REFUNDED' ||
    event === 'PURCHASE_CHARGEBACK' ||
    event === 'SUBSCRIPTION_CANCELLATION'
  ) {
    const { error } = await supabase
      .from('assinaturas')
      .update({
        status: 'inativo',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    if (error) {
      console.error('[Hotmart] Erro ao desativar assinatura:', error)
      return res.status(500).json({ error: 'Erro ao desativar assinatura' })
    }

    console.log(`[Hotmart] ❌ Assinatura DESATIVADA — ${email} (evento: ${event})`)
    return res.status(200).json({ ok: true })
  }

  // Evento ignorado mas confirmado para a Hotmart
  console.log(`[Hotmart] Evento ignorado: ${event}`)
  return res.status(200).json({ ok: true, aviso: 'Evento ignorado' })
}
