import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { action, instanceName, webhookUrl } = body

    const headers = {
      'apikey': EVOLUTION_API_KEY,
      'Content-Type': 'application/json',
    }

    let result: unknown

    switch (action) {
      case 'create_instance': {
        const resp = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        })
        result = await resp.json()
        break
      }

      case 'connect': {
        const resp = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
          method: 'GET',
          headers,
        })
        result = await resp.json()
        break
      }

      case 'connection_state': {
        const resp = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
          method: 'GET',
          headers,
        })
        result = await resp.json()

        // If connected, update DB
        const data = result as { state?: string; instance?: { state?: string } }
        const state = data?.instance?.state || data?.state
        if (state === 'open') {
          await supabase
            .from('whatsapp_instances')
            .update({ status: 'connected' })
            .eq('instance_name', instanceName)
        }
        break
      }

      case 'disconnect': {
        const resp = await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers,
        })
        result = await resp.json()

        await supabase
          .from('whatsapp_instances')
          .update({ status: 'disconnected', phone_number: null })
          .eq('instance_name', instanceName)
        break
      }

      case 'set_webhook': {
        const resp = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instanceName}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            url: webhookUrl,
            webhook_by_events: false,
            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          }),
        })
        result = await resp.json()

        await supabase
          .from('whatsapp_instances')
          .update({ webhook_url: webhookUrl })
          .eq('instance_name', instanceName)
        break
      }

      case 'send_text': {
        const { number, text } = body
        const resp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ number, text }),
        })
        result = await resp.json()
        break
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
