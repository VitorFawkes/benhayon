import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ─── Intent Classification Prompt ───
const INTENT_SYSTEM_PROMPT = `Você é um sistema de classificação para consultório de psicologia.
Classifique a mensagem do paciente em UMA das categorias:

- payment_claimed: Paciente diz que pagou ("já fiz o pix", "transferi", "paguei", "mandei")
- receipt_sent: Paciente diz que está enviando comprovante ("olha o comprovante", "segue comprovante")
- question: Pergunta sobre valor, vencimento, forma de pagamento
- acknowledgment: Confirmação ("ok", "entendi", "vou pagar", "tá bom")
- irrelevant: Não relacionado a pagamento

Responda APENAS em JSON: {"intent":"...", "confidence":0.00, "summary":"..."}`

// ─── Receipt Analysis Prompt ───
const RECEIPT_SYSTEM_PROMPT = `Você é um especialista em análise de comprovantes de pagamento brasileiros.
Analise a imagem enviada e determine se é um comprovante de pagamento.

Se SIM, extraia:
- amount: valor em R$ (número decimal)
- date: data do pagamento (YYYY-MM-DD)
- method: PIX, TED, DOC, boleto, cartão, outro
- payer: nome do pagador se visível
- transaction_id: ID da transação se visível

Responda APENAS em JSON:
{"is_receipt":true/false,"amount":null,"date":null,"method":null,"payer":null,"transaction_id":null,"confidence":0.00,"notes":"observações"}`

serve(async (_req) => {
  try {
    // Fetch pending items from processing queue (limit 5 per execution)
    const { data: queueItems, error: queueError } = await supabase
      .from('processing_queue')
      .select('*, message_log:message_logs(*)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5)

    if (queueError) throw queueError
    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { status: 200 })
    }

    let processed = 0

    for (const item of queueItems) {
      try {
        // Mark as processing
        await supabase
          .from('processing_queue')
          .update({ status: 'processing' })
          .eq('id', item.id)

        const messageLog = item.message_log
        if (!messageLog) continue

        // Get AI settings for this profile
        const { data: aiSettings } = await supabase
          .from('ai_settings')
          .select('*')
          .eq('profile_id', messageLog.profile_id)
          .single()

        const messageType = messageLog.message_type

        // Check if AI is enabled for this patient
        if (messageLog.patient_id) {
          const { data: patientData } = await supabase
            .from('patients')
            .select('ai_enabled')
            .eq('id', messageLog.patient_id)
            .single()

          if (patientData && !patientData.ai_enabled) {
            // Skip AI processing for this patient
            await supabase.from('processing_queue').update({ status: 'completed' }).eq('id', item.id)
            processed++
            continue
          }
        }

        // ─── Process TEXT ───
        if (messageType === 'text' && aiSettings?.analyze_text_intent) {
          const intent = await classifyIntent(messageLog.content || '')

          await supabase
            .from('message_logs')
            .update({
              ai_processed: true,
              ai_intent: intent.intent,
              ai_intent_confidence: intent.confidence,
              ai_analysis: intent,
            })
            .eq('id', messageLog.id)

          // Create alert if payment claimed
          if (intent.intent === 'payment_claimed' && intent.confidence >= 0.7) {
            const { data: patient } = await supabase
              .from('patients')
              .select('full_name')
              .eq('id', messageLog.patient_id)
              .single()

            await supabase.from('alerts').insert({
              profile_id: messageLog.profile_id,
              patient_id: messageLog.patient_id,
              type: 'payment_claimed',
              severity: 'warning',
              title: `${patient?.full_name || 'Paciente'} diz que pagou`,
              description: intent.summary || messageLog.content?.slice(0, 200),
              message_log_id: messageLog.id,
            })
          }
        }

        // ─── Process AUDIO ───
        if (messageType === 'audio' && aiSettings?.analyze_audio) {
          const rawPayload = messageLog.raw_payload as Record<string, unknown>
          const instanceName = (rawPayload.instance as string) || ''
          const msgKey = extractMessageKey(rawPayload)

          if (msgKey && instanceName) {
            const mediaData = await downloadMediaFromEvolution(instanceName, msgKey)
            // Transcribe with Whisper
            const transcription = mediaData ? await transcribeAudioFromBase64(mediaData.base64, mediaData.mimetype) : ''

            // Then classify intent with GPT-5.1
            const intent = await classifyIntent(transcription)

            await supabase
              .from('message_logs')
              .update({
                content: transcription,
                ai_processed: true,
                ai_intent: intent.intent,
                ai_intent_confidence: intent.confidence,
                ai_analysis: { ...intent, transcription },
              })
              .eq('id', messageLog.id)

            if (intent.intent === 'payment_claimed' && intent.confidence >= 0.7) {
              const { data: patient } = await supabase
                .from('patients')
                .select('full_name')
                .eq('id', messageLog.patient_id)
                .single()

              await supabase.from('alerts').insert({
                profile_id: messageLog.profile_id,
                patient_id: messageLog.patient_id,
                type: 'payment_claimed',
                severity: 'warning',
                title: `${patient?.full_name || 'Paciente'} diz que pagou (áudio)`,
                description: `Transcrição: "${transcription.slice(0, 200)}"`,
                message_log_id: messageLog.id,
              })
            }
          }
        }

        // ─── Process IMAGE/DOCUMENT ───
        if ((messageType === 'image' || messageType === 'document') && aiSettings?.analyze_receipts) {
          const rawPayload = messageLog.raw_payload as Record<string, unknown>
          const instanceName = (rawPayload.instance as string) || ''
          const msgKey = extractMessageKey(rawPayload)

          if (msgKey && instanceName) {
            // Download media via Evolution API
            const mediaData = await downloadMediaFromEvolution(instanceName, msgKey)

            if (mediaData) {
              // Upload to Supabase Storage
              const ext = mediaData.mimetype.includes('pdf') ? 'pdf' : 'jpg'
              const storagePath = `${messageLog.profile_id}/${messageLog.patient_id || 'unknown'}/${Date.now()}.${ext}`
              const binaryStr = atob(mediaData.base64)
              const bytes = new Uint8Array(binaryStr.length)
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

              const { data: uploadData } = await supabase.storage
                .from('receipts')
                .upload(storagePath, bytes, { contentType: mediaData.mimetype })

              const storageUrl = uploadData
                ? `${SUPABASE_URL}/storage/v1/object/public/receipts/${storagePath}`
                : null

              // Analyze with GPT-5.1 Vision (already have base64)
              const analysis = await analyzeReceiptFromBase64(mediaData.base64, mediaData.mimetype)

            // Update message log
            await supabase
              .from('message_logs')
              .update({
                media_url: storageUrl,
                ai_processed: true,
                ai_intent: analysis.is_receipt ? 'receipt_sent' : 'irrelevant',
                ai_intent_confidence: analysis.confidence,
                ai_analysis: analysis,
              })
              .eq('id', messageLog.id)

            // If it's a receipt, create receipt_analysis
            if (analysis.is_receipt) {
              const threshold = aiSettings?.receipt_auto_confirm_threshold || 0.90

              // Try to match invoice
              let matchedInvoiceId = null
              if (messageLog.patient_id && analysis.amount) {
                const { data: matchingInvoice } = await supabase
                  .from('invoices')
                  .select('id, total_amount, amount_paid')
                  .eq('patient_id', messageLog.patient_id)
                  .in('status', ['pending', 'partial', 'overdue'])
                  .order('due_date', { ascending: true })
                  .limit(1)
                  .maybeSingle()

                if (matchingInvoice) {
                  const remaining = matchingInvoice.total_amount - matchingInvoice.amount_paid
                  // Match if amount is within 5% tolerance
                  if (remaining > 0 && Math.abs(analysis.amount - remaining) / remaining <= 0.05) {
                    matchedInvoiceId = matchingInvoice.id
                  }
                }
              }

              const receiptStatus = analysis.confidence >= threshold && matchedInvoiceId
                ? 'confirmed'
                : 'pending_review'

              const { data: receiptAnalysis } = await supabase
                .from('receipt_analyses')
                .insert({
                  profile_id: messageLog.profile_id,
                  message_log_id: messageLog.id,
                  patient_id: messageLog.patient_id,
                  extracted_amount: analysis.amount,
                  extracted_date: analysis.date,
                  extracted_method: analysis.method,
                  extracted_payer: analysis.payer,
                  extracted_transaction_id: analysis.transaction_id,
                  confidence_score: analysis.confidence,
                  matched_invoice_id: matchedInvoiceId,
                  status: receiptStatus,
                  ai_raw_response: analysis,
                  media_url: storageUrl || '',
                })
                .select()
                .single()

              // Auto-confirm: create payment
              if (receiptStatus === 'confirmed' && matchedInvoiceId && analysis.amount) {
                await supabase.from('payments').insert({
                  profile_id: messageLog.profile_id,
                  patient_id: messageLog.patient_id,
                  invoice_id: matchedInvoiceId,
                  amount: analysis.amount,
                  payment_date: analysis.date || new Date().toISOString().split('T')[0],
                  payment_method: mapPaymentMethod(analysis.method),
                  receipt_url: storageUrl,
                  receipt_verified: true,
                  source: 'ai_auto',
                })

                await supabase.from('alerts').insert({
                  profile_id: messageLog.profile_id,
                  patient_id: messageLog.patient_id,
                  type: 'receipt_auto_confirmed',
                  severity: 'info',
                  title: 'Comprovante auto-confirmado',
                  description: `Pagamento de R$ ${analysis.amount?.toFixed(2)} confirmado automaticamente.`,
                  message_log_id: messageLog.id,
                  receipt_analysis_id: receiptAnalysis?.id,
                  invoice_id: matchedInvoiceId,
                })
              } else {
                // Need manual review
                await supabase.from('alerts').insert({
                  profile_id: messageLog.profile_id,
                  patient_id: messageLog.patient_id,
                  type: 'receipt_review',
                  severity: 'warning',
                  title: 'Comprovante para revisão',
                  description: analysis.confidence < threshold
                    ? `Confiança da IA: ${Math.round(analysis.confidence * 100)}%. Revisão manual necessária.`
                    : 'Comprovante recebido sem fatura correspondente.',
                  message_log_id: messageLog.id,
                  receipt_analysis_id: receiptAnalysis?.id,
                })
              }
            }
            } // end if (mediaData)
          } // end if (msgKey && instanceName)
        } // end if IMAGE/DOCUMENT

        // Mark as completed
        await supabase
          .from('processing_queue')
          .update({ status: 'completed' })
          .eq('id', item.id)

        processed++
      } catch (itemError) {
        console.error(`Error processing item ${item.id}:`, itemError)
        await supabase
          .from('processing_queue')
          .update({
            status: 'failed',
            attempts: (item.attempts || 0) + 1,
            last_error: itemError instanceof Error ? itemError.message : 'Unknown error',
          })
          .eq('id', item.id)
      }
    }

    return new Response(JSON.stringify({ processed }), { status: 200 })
  } catch (error) {
    console.error('Process incoming error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 })
  }
})

// ─── Helper Functions ───

/**
 * Classifica a intenção de uma mensagem de texto usando GPT-5.1
 */
async function classifyIntent(text: string): Promise<{ intent: string; confidence: number; summary: string }> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.1',
      max_completion_tokens: 256,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: `Mensagem do paciente: "${text}"` },
      ],
    }),
  })

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || '{}'

  try {
    return JSON.parse(content)
  } catch {
    return { intent: 'irrelevant', confidence: 0, summary: '' }
  }
}

/**
 * Transcreve áudio de base64 usando OpenAI Whisper
 */
async function transcribeAudioFromBase64(base64: string, mimetype: string): Promise<string> {
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

  const ext = mimetype.includes('ogg') ? 'ogg' : mimetype.includes('mp4') ? 'mp4' : 'ogg'
  const blob = new Blob([bytes], { type: mimetype })

  const formData = new FormData()
  formData.append('file', blob, `audio.${ext}`)
  formData.append('model', 'whisper-1')
  formData.append('language', 'pt')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  })

  const data = await response.json()
  return data.text || ''
}

/**
 * Analisa imagem de comprovante usando GPT-5.1 Vision (recebe base64 diretamente)
 */
async function analyzeReceiptFromBase64(base64: string, mediaType: string): Promise<{
  is_receipt: boolean
  amount: number | null
  date: string | null
  method: string | null
  payer: string | null
  transaction_id: string | null
  confidence: number
  notes: string
}> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.1',
      max_completion_tokens: 512,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: RECEIPT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mediaType};base64,${base64}` },
            },
            { type: 'text', text: 'Analise este comprovante de pagamento.' },
          ],
        },
      ],
    }),
  })

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || '{}'

  try {
    return JSON.parse(content)
  } catch {
    return { is_receipt: false, amount: null, date: null, method: null, payer: null, transaction_id: null, confidence: 0, notes: 'Parse error' }
  }
}

function extractMessageKey(payload: Record<string, unknown>): { id: string; remoteJid: string } | null {
  const data = payload.data as Record<string, unknown> | undefined
  const key = data?.key as Record<string, unknown> | undefined
  if (key?.id && key?.remoteJid) {
    return { id: key.id as string, remoteJid: key.remoteJid as string }
  }
  return null
}

async function downloadMediaFromEvolution(instanceName: string, messageKey: { id: string; remoteJid: string }): Promise<{ base64: string; mimetype: string } | null> {
  try {
    const response = await fetch(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          key: {
            id: messageKey.id,
            remoteJid: messageKey.remoteJid,
            fromMe: false,
          },
        },
        convertToMp4: false,
      }),
    })

    if (!response.ok) return null

    const data = await response.json()
    if (data.base64 && data.mimetype) {
      return { base64: data.base64 as string, mimetype: data.mimetype as string }
    }
    return null
  } catch (error) {
    console.error('Error downloading media:', error)
    return null
  }
}

function mapPaymentMethod(method: string | null): string {
  if (!method) return 'other'
  const lower = method.toLowerCase()
  if (lower.includes('pix')) return 'pix'
  if (lower.includes('ted') || lower.includes('doc') || lower.includes('transfer')) return 'transfer'
  if (lower.includes('boleto')) return 'other'
  if (lower.includes('cartão') || lower.includes('cartao') || lower.includes('card')) return 'card'
  if (lower.includes('dinheiro') || lower.includes('cash')) return 'cash'
  return 'other'
}
