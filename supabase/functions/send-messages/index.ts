import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async () => {
  try {
    // Get all profiles with ai_settings to check allowed hours
    const now = new Date()
    const currentHour = now.getUTCHours() - 3 // Adjust for BRT (UTC-3)
    const currentDay = now.getDay() // 0=Sunday, 6=Saturday

    // Fetch queued messages
    const { data: messages, error: fetchError } = await supabase
      .from('message_queue')
      .select('*, patient:patients(phone, full_name)')
      .eq('status', 'queued')
      .lte('scheduled_for', now.toISOString())
      .order('created_at', { ascending: true })
      .limit(10)

    if (fetchError) throw fetchError
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

    let sent = 0

    for (const msg of messages) {
      try {
        // Get AI settings for rate limiting and schedule checking
        const { data: aiSettings } = await supabase
          .from('ai_settings')
          .select('send_start_hour, send_end_hour, send_on_weekends, min_seconds_between_messages')
          .eq('profile_id', msg.profile_id)
          .single()

        if (aiSettings) {
          // Check if within allowed hours
          const adjustedHour = currentHour < 0 ? currentHour + 24 : currentHour
          if (adjustedHour < aiSettings.send_start_hour || adjustedHour >= aiSettings.send_end_hour) {
            continue // Skip, outside allowed hours
          }

          // Check weekends
          if (!aiSettings.send_on_weekends && (currentDay === 0 || currentDay === 6)) {
            continue // Skip weekends
          }
        }

        // Get WhatsApp instance for this profile
        const { data: instance } = await supabase
          .from('whatsapp_instances')
          .select('instance_name, status')
          .eq('profile_id', msg.profile_id)
          .eq('status', 'connected')
          .single()

        if (!instance) {
          // WhatsApp not connected, fail the message
          await supabase
            .from('message_queue')
            .update({
              status: 'failed',
              last_error: 'WhatsApp não conectado',
              attempts: msg.attempts + 1,
            })
            .eq('id', msg.id)

          await supabase.from('alerts').insert({
            profile_id: msg.profile_id,
            type: 'message_failed',
            severity: 'warning',
            title: 'Falha ao enviar mensagem',
            description: `WhatsApp não conectado. Mensagem para ${msg.patient?.full_name} não enviada.`,
            patient_id: msg.patient_id,
          })
          continue
        }

        // Mark as sending
        await supabase
          .from('message_queue')
          .update({ status: 'sending' })
          .eq('id', msg.id)

        // Send via Evolution API
        const phone = msg.patient?.phone?.replace('+', '') || ''
        const response = await fetch(
          `${EVOLUTION_API_URL}/message/sendText/${instance.instance_name}`,
          {
            method: 'POST',
            headers: {
              'apikey': EVOLUTION_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              number: phone,
              text: msg.message_content,
            }),
          }
        )

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Evolution API error: ${response.status} - ${errorText}`)
        }

        // Success
        await supabase
          .from('message_queue')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', msg.id)

        // Log outbound message
        await supabase.from('message_logs').insert({
          profile_id: msg.profile_id,
          patient_id: msg.patient_id,
          direction: 'outbound',
          message_type: 'text',
          content: msg.message_content,
          external_message_id: `out_${msg.id}`,
        })

        sent++

        // Rate limit: wait between messages
        const delay = aiSettings?.min_seconds_between_messages || 5
        await new Promise((resolve) => setTimeout(resolve, delay * 1000))
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Failed to send message ${msg.id}:`, errorMsg)

        const newAttempts = msg.attempts + 1
        if (newAttempts >= msg.max_attempts) {
          await supabase
            .from('message_queue')
            .update({ status: 'failed', attempts: newAttempts, last_error: errorMsg })
            .eq('id', msg.id)

          await supabase.from('alerts').insert({
            profile_id: msg.profile_id,
            type: 'message_failed',
            severity: 'warning',
            title: 'Falha ao enviar mensagem',
            description: `Após ${newAttempts} tentativas: ${errorMsg}`,
            patient_id: msg.patient_id,
          })
        } else {
          // Retry with exponential backoff
          const backoffMinutes = Math.pow(2, newAttempts) * 5
          const retryAt = new Date(Date.now() + backoffMinutes * 60 * 1000)

          await supabase
            .from('message_queue')
            .update({
              status: 'queued',
              attempts: newAttempts,
              last_error: errorMsg,
              scheduled_for: retryAt.toISOString(),
            })
            .eq('id', msg.id)
        }
      }
    }

    return new Response(JSON.stringify({ sent }), { status: 200 })
  } catch (error) {
    console.error('Send messages error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 })
  }
})
