import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  try {
    // Verify Evolution API key
    const apiKey = req.headers.get('apikey') || req.headers.get('x-api-key')
    if (apiKey !== EVOLUTION_API_KEY) {
      // Allow without key for now (Evolution API may not send it in webhooks)
      console.warn('Webhook received without matching API key')
    }

    const payload = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const event = payload.event || payload.type
    const instance = payload.instance || payload.instanceName

    // Handle CONNECTION_UPDATE
    if (event === 'CONNECTION_UPDATE' || event === 'connection.update') {
      const state = payload.data?.state || payload.state
      const status = state === 'open' ? 'connected' : 'disconnected'

      await supabase
        .from('whatsapp_instances')
        .update({ status })
        .eq('instance_name', instance)

      // If disconnected, create alert
      if (status === 'disconnected') {
        const { data: inst } = await supabase
          .from('whatsapp_instances')
          .select('profile_id')
          .eq('instance_name', instance)
          .single()

        if (inst) {
          await supabase.from('alerts').insert({
            profile_id: inst.profile_id,
            type: 'whatsapp_disconnected',
            severity: 'critical',
            title: 'WhatsApp desconectou',
            description: 'Sua conexão com o WhatsApp foi perdida. Reconecte para continuar recebendo e enviando mensagens.',
          })
        }
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    // Handle MESSAGES_UPSERT (incoming message)
    if (event === 'MESSAGES_UPSERT' || event === 'messages.upsert') {
      const messages = payload.data || [payload]

      for (const msg of Array.isArray(messages) ? messages : [messages]) {
        const key = msg.key || {}
        const messageData = msg.message || {}

        // Skip outgoing messages (fromMe = true)
        if (key.fromMe) continue

        // Extract sender phone
        const remoteJid = key.remoteJid || ''
        const senderPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '')
        if (!senderPhone) continue

        // Determine message type
        let messageType = 'text'
        let content = ''
        const messageId = key.id || `${Date.now()}_${senderPhone}`

        if (messageData.conversation) {
          messageType = 'text'
          content = messageData.conversation
        } else if (messageData.extendedTextMessage) {
          messageType = 'text'
          content = messageData.extendedTextMessage.text || ''
        } else if (messageData.audioMessage) {
          messageType = 'audio'
        } else if (messageData.imageMessage) {
          messageType = 'image'
        } else if (messageData.documentMessage) {
          messageType = 'document'
        } else {
          // Unknown type, skip
          continue
        }

        // Find which profile this instance belongs to
        const { data: inst } = await supabase
          .from('whatsapp_instances')
          .select('profile_id')
          .eq('instance_name', instance)
          .single()

        if (!inst) continue

        // Find patient by phone number
        const normalizedPhone = senderPhone.startsWith('+') ? senderPhone : `+${senderPhone}`
        const { data: patient } = await supabase
          .from('patients')
          .select('id')
          .eq('profile_id', inst.profile_id)
          .eq('phone', normalizedPhone)
          .is('deleted_at', null)
          .maybeSingle()

        // Insert message log (with deduplication)
        const { data: messageLog, error: logError } = await supabase
          .from('message_logs')
          .upsert({
            profile_id: inst.profile_id,
            patient_id: patient?.id || null,
            direction: 'inbound',
            message_type: messageType,
            content: content || null,
            raw_payload: payload,
            external_message_id: messageId,
            ai_processed: false,
          }, {
            onConflict: 'profile_id,external_message_id',
            ignoreDuplicates: true,
          })
          .select()
          .single()

        if (logError) {
          // Likely duplicate, skip
          console.warn('Message log insert error (likely duplicate):', logError.message)
          continue
        }

        // Add to processing queue
        if (messageLog) {
          await supabase.from('processing_queue').insert({
            profile_id: inst.profile_id,
            message_log_id: messageLog.id,
            status: 'pending',
          })
        }
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    // Unknown event
    return new Response(JSON.stringify({ ok: true, event: 'ignored' }), { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Webhook error:', message)
    return new Response(JSON.stringify({ error: message }), { status: 500 })
  }
})
