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

const evoHeaders = {
  'apikey': EVOLUTION_API_KEY,
  'Content-Type': 'application/json',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { action, instanceName } = body

    let result: Record<string, unknown> = {}

    switch (action) {
      // ─── CREATE + CONNECT (combined) ───
      // Creates instance with QR code, saves to DB, configures webhook
      case 'create_and_connect': {
        const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook`

        // 1. Check if instance already exists in Evolution API
        const checkResp = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
          headers: evoHeaders,
        })
        const checkData = await checkResp.json()

        if (checkResp.ok && checkData?.instance?.state === 'open') {
          // Already connected — fetch instance info and update DB
          const infoResp = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances?instanceName=${instanceName}`, {
            headers: evoHeaders,
          })
          const infoData = await infoResp.json()
          const instanceInfo = Array.isArray(infoData) ? infoData[0] : infoData

          await supabase.from('whatsapp_instances').upsert({
            profile_id: user.id,
            instance_name: instanceName,
            instance_id: instanceInfo?.id || null,
            status: 'connected',
            phone_number: instanceInfo?.ownerJid?.replace('@s.whatsapp.net', '') || null,
            webhook_url: webhookUrl,
          }, { onConflict: 'profile_id' })

          result = { status: 'already_connected', instance: instanceInfo }
          break
        }

        if (checkResp.ok && checkData?.instance?.state !== 'open') {
          // Instance exists but not connected — get new QR
          const connectResp = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
            headers: evoHeaders,
          })
          const connectData = await connectResp.json()

          // Update DB
          await supabase.from('whatsapp_instances').upsert({
            profile_id: user.id,
            instance_name: instanceName,
            instance_id: checkData?.instance?.instanceId || null,
            status: 'connecting',
            webhook_url: webhookUrl,
          }, { onConflict: 'profile_id' })

          result = {
            status: 'connecting',
            qrcode: connectData?.base64 || connectData?.qrcode?.base64 || null,
            pairingCode: connectData?.pairingCode || null,
          }
          break
        }

        // 2. Instance doesn't exist — create it with QR code + webhook
        const createResp = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
          method: 'POST',
          headers: evoHeaders,
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
            webhook: {
              url: webhookUrl,
              enabled: true,
              webhookByEvents: false,
              webhookBase64: true,
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
            },
          }),
        })
        const createData = await createResp.json()

        // 3. Save instance to DB
        await supabase.from('whatsapp_instances').upsert({
          profile_id: user.id,
          instance_name: instanceName,
          instance_id: createData?.instance?.instanceId || null,
          status: 'connecting',
          webhook_url: webhookUrl,
        }, { onConflict: 'profile_id' })

        result = {
          status: 'connecting',
          qrcode: createData?.qrcode?.base64 || null,
          pairingCode: createData?.qrcode?.pairingCode || null,
          instanceId: createData?.instance?.instanceId || null,
        }
        break
      }

      // ─── CONNECTION STATE ───
      case 'connection_state': {
        const resp = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
          headers: evoHeaders,
        })
        const data = await resp.json()
        const state = data?.instance?.state

        // Update DB status
        if (state === 'open') {
          // Fetch phone number from instance info
          const infoResp = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances?instanceName=${instanceName}`, {
            headers: evoHeaders,
          })
          const infoData = await infoResp.json()
          const instanceInfo = Array.isArray(infoData) ? infoData[0] : infoData
          const phoneNumber = instanceInfo?.ownerJid?.replace('@s.whatsapp.net', '') || null

          await supabase.from('whatsapp_instances')
            .update({ status: 'connected', phone_number: phoneNumber })
            .eq('instance_name', instanceName)

          result = { state: 'open', phoneNumber }
        } else if (state === 'close') {
          await supabase.from('whatsapp_instances')
            .update({ status: 'disconnected' })
            .eq('instance_name', instanceName)
          result = { state: 'close' }
        } else {
          result = { state: state || 'unknown' }
        }
        break
      }

      // ─── REFRESH QR CODE ───
      case 'connect': {
        const resp = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
          headers: evoHeaders,
        })
        const data = await resp.json()
        result = {
          qrcode: data?.base64 || data?.qrcode?.base64 || null,
          pairingCode: data?.pairingCode || null,
        }
        break
      }

      // ─── DISCONNECT ───
      case 'disconnect': {
        const resp = await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers: evoHeaders,
        })
        await resp.json()

        await supabase.from('whatsapp_instances')
          .update({ status: 'disconnected', phone_number: null })
          .eq('instance_name', instanceName)

        result = { status: 'disconnected' }
        break
      }

      // ─── SEND TEXT ───
      case 'send_text': {
        const { number, text } = body
        const resp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: evoHeaders,
          body: JSON.stringify({ number, text }),
        })
        result = await resp.json() as Record<string, unknown>
        break
      }

      // ─── SEND MEDIA (image/document) ───
      case 'send_media': {
        const { number, mediaUrl, mediaType, caption, fileName } = body
        const resp = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${instanceName}`, {
          method: 'POST',
          headers: evoHeaders,
          body: JSON.stringify({
            number,
            mediatype: mediaType === 'pdf' ? 'document' : mediaType,
            media: mediaUrl,
            caption: caption || '',
            fileName: fileName || 'nota_fiscal',
          }),
        })
        result = await resp.json() as Record<string, unknown>
        break
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('evolution-api error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
