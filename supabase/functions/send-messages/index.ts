import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async () => {
  try {
    const now = new Date()

    // Fetch queued messages that are scheduled for now or past
    const { data: messages, error: fetchError } = await supabase
      .from('message_queue')
      .select('*')
      .eq('status', 'queued')
      .lte('scheduled_for', now.toISOString())
      .order('created_at', { ascending: true })
      .limit(10)

    if (fetchError) {
      console.error('Fetch error:', fetchError)
      return new Response(JSON.stringify({ sent: 0, error: fetchError.message }), { status: 200 })
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

    let sent = 0

    for (const msg of messages) {
      try {
        // Get patient phone and ai_enabled status
        const { data: patient } = await supabase
          .from('patients')
          .select('phone, full_name, ai_enabled')
          .eq('id', msg.patient_id)
          .single()

        if (!patient?.phone) {
          await supabase.from('message_queue')
            .update({ status: 'failed', last_error: 'Patient phone not found', attempts: msg.attempts + 1 })
            .eq('id', msg.id)
          continue
        }

        // Check if AI is enabled for this patient
        if (patient.ai_enabled === false) {
          await supabase.from('message_queue')
            .update({ status: 'cancelled', last_error: 'IA desativada para este paciente' })
            .eq('id', msg.id)
          continue
        }

        // For billing/reminder messages, re-check if invoice is still unpaid
        if (msg.invoice_id && (msg.message_type === 'billing' || msg.message_type === 'reminder')) {
          const { data: invoice } = await supabase
            .from('invoices')
            .select('status')
            .eq('id', msg.invoice_id)
            .single()

          if (invoice?.status === 'paid') {
            await supabase.from('message_queue')
              .update({ status: 'cancelled', last_error: 'Fatura já foi paga' })
              .eq('id', msg.id)
            continue
          }
        }

        // Get AI settings for rate limiting
        const { data: aiSettings } = await supabase
          .from('ai_settings')
          .select('min_seconds_between_messages')
          .eq('profile_id', msg.profile_id)
          .single()

        // Get WhatsApp instance
        const { data: instance } = await supabase
          .from('whatsapp_instances')
          .select('instance_name, status')
          .eq('profile_id', msg.profile_id)
          .eq('status', 'connected')
          .single()

        if (!instance) {
          await supabase.from('message_queue')
            .update({ status: 'failed', last_error: 'WhatsApp not connected', attempts: msg.attempts + 1 })
            .eq('id', msg.id)

          await supabase.from('alerts').insert({
            profile_id: msg.profile_id,
            type: 'message_failed',
            severity: 'warning',
            title: 'Falha ao enviar mensagem',
            description: `WhatsApp não conectado. Mensagem para ${patient.full_name} não enviada.`,
            patient_id: msg.patient_id,
          })
          continue
        }

        // Mark as sending
        await supabase.from('message_queue')
          .update({ status: 'sending' })
          .eq('id', msg.id)

        // Send via Evolution API
        const phone = patient.phone.replace('+', '')
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
          throw new Error(`Evolution API: ${response.status} - ${errorText}`)
        }

        // Success
        await supabase.from('message_queue')
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
          await supabase.from('message_queue')
            .update({ status: 'failed', attempts: newAttempts, last_error: errorMsg })
            .eq('id', msg.id)
        } else {
          const backoffMinutes = Math.pow(2, newAttempts) * 5
          const retryAt = new Date(Date.now() + backoffMinutes * 60 * 1000)
          await supabase.from('message_queue')
            .update({ status: 'queued', attempts: newAttempts, last_error: errorMsg, scheduled_for: retryAt.toISOString() })
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
