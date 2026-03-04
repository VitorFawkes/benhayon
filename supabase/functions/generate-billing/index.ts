import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async () => {
  try {
    const today = new Date()
    const todayDay = today.getDate()

    // Get all profiles with their AI settings
    const { data: allSettings, error: settingsError } = await supabase
      .from('ai_settings')
      .select('*')

    if (settingsError) throw settingsError
    if (!allSettings) return new Response(JSON.stringify({ ok: true }), { status: 200 })

    for (const settings of allSettings) {
      // ─── BILLING: Generate invoices if today is billing_day ───
      if (settings.billing_enabled && todayDay === settings.billing_day) {
        await generateMonthlyInvoices(settings)
      }

      // ─── REMINDERS: Check for overdue invoices every day ───
      if (settings.reminder_enabled) {
        await generatePaymentReminders(settings)
      }

      // ─── THANK YOU: Send thank you for manually confirmed receipts ───
      if (settings.thank_you_enabled) {
        await sendThankYouMessages(settings)
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (error) {
    console.error('Generate billing error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 })
  }
})

async function generateMonthlyInvoices(settings: Record<string, unknown>) {
  const profileId = settings.profile_id as string
  const billingDueDays = (settings.billing_due_days as number) || 10

  // Previous month
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const referenceMonth = prevMonth.toISOString().split('T')[0]

  // Get completed appointments for previous month
  const { data: appointments } = await supabase
    .from('appointments')
    .select('patient_id, patient:patients(id, full_name, phone, session_value)')
    .eq('profile_id', profileId)
    .eq('status', 'completed')
    .gte('date', prevMonth.toISOString().split('T')[0])
    .lte('date', prevMonthEnd.toISOString().split('T')[0])

  if (!appointments || appointments.length === 0) return

  // Group by patient
  const patientMap = new Map<string, { count: number; patient: Record<string, unknown> }>()
  for (const apt of appointments) {
    const pid = apt.patient_id
    const existing = patientMap.get(pid)
    if (existing) {
      existing.count++
    } else {
      patientMap.set(pid, { count: 1, patient: apt.patient as unknown as Record<string, unknown> })
    }
  }

  const dueDate = new Date(now)
  dueDate.setDate(dueDate.getDate() + billingDueDays)

  for (const [patientId, { count, patient }] of patientMap) {
    const sessionValue = Number(patient.session_value) || 0
    const totalAmount = count * sessionValue

    if (totalAmount <= 0) continue

    // Check if invoice already exists for this month
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('profile_id', profileId)
      .eq('patient_id', patientId)
      .eq('reference_month', referenceMonth)
      .maybeSingle()

    if (existing) continue // Already generated

    // Create invoice
    const { data: invoice } = await supabase
      .from('invoices')
      .insert({
        profile_id: profileId,
        patient_id: patientId,
        reference_month: referenceMonth,
        total_sessions: count,
        total_amount: totalAmount,
        due_date: dueDate.toISOString().split('T')[0],
      })
      .select()
      .single()

    if (!invoice) continue

    // Check if AI is enabled for this patient before queuing message
    const { data: patientCheck } = await supabase
      .from('patients')
      .select('ai_enabled')
      .eq('id', patientId)
      .single()

    if (patientCheck && patientCheck.ai_enabled !== false) {
      // Queue billing message only if AI is enabled
      const monthName = prevMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      const template = (settings.billing_template as string) || ''
      const message = renderTemplate(template, {
        nome: patient.full_name as string,
        valor: totalAmount.toFixed(2),
        mes: monthName,
        sessoes: String(count),
        vencimento: dueDate.toLocaleDateString('pt-BR'),
      })

      // Schedule within allowed hours
      const sendHour = (settings.send_start_hour as number) || 9
      const scheduledFor = new Date(now)
      scheduledFor.setHours(sendHour, Math.floor(Math.random() * 60), 0) // Spread across the hour

      await supabase.from('message_queue').insert({
        profile_id: profileId,
        patient_id: patientId,
        invoice_id: invoice.id,
        message_type: 'billing',
        message_content: message,
        scheduled_for: scheduledFor.toISOString(),
        escalation_level: 0,
      })

      // Update invoice sent_at
      await supabase
        .from('invoices')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', invoice.id)
    }
  }
}

async function generatePaymentReminders(settings: Record<string, unknown>) {
  const profileId = settings.profile_id as string
  const today = new Date()

  // Get overdue invoices
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('*, patient:patients(id, full_name, phone)')
    .eq('profile_id', profileId)
    .in('status', ['pending', 'partial', 'overdue'])
    .lt('due_date', today.toISOString().split('T')[0])

  if (!overdueInvoices) return

  for (const invoice of overdueInvoices) {
    const dueDate = new Date(invoice.due_date)
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    const patient = invoice.patient as Record<string, unknown>
    const remaining = invoice.total_amount - invoice.amount_paid

    // Count how many reminders already sent for this invoice
    const { count: remindersSent } = await supabase
      .from('message_queue')
      .select('*', { count: 'exact', head: true })
      .eq('invoice_id', invoice.id)
      .eq('message_type', 'reminder')
      .in('status', ['sent', 'queued', 'sending'])

    const sentCount = remindersSent || 0

    // Determine escalation level
    let template = ''
    let tone = ''
    let shouldSend = false

    const r1Days = (settings.reminder_1_days as number) || 3
    const r2Days = (settings.reminder_2_days as number) || 7
    const r3Days = (settings.reminder_3_days as number) || 14
    const r2Enabled = settings.reminder_2_enabled as boolean
    const r3Enabled = settings.reminder_3_enabled as boolean

    if (daysOverdue >= r3Days && r3Enabled && sentCount < 3) {
      template = settings.reminder_3_template as string
      tone = settings.reminder_3_tone as string
      shouldSend = true
    } else if (daysOverdue >= r2Days && r2Enabled && sentCount < 2) {
      template = settings.reminder_2_template as string
      tone = settings.reminder_2_tone as string
      shouldSend = true
    } else if (daysOverdue >= r1Days && sentCount < 1) {
      template = settings.reminder_1_template as string
      tone = settings.reminder_1_tone as string
      shouldSend = true
    }

    if (!shouldSend || !template) continue

    // Check if AI is enabled for this patient before sending reminder
    const { data: patientAICheck } = await supabase
      .from('patients')
      .select('ai_enabled')
      .eq('id', invoice.patient_id)
      .single()

    if (patientAICheck && patientAICheck.ai_enabled === false) continue

    const monthName = new Date(invoice.reference_month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    const message = renderTemplate(template, {
      nome: patient.full_name as string,
      valor: remaining.toFixed(2),
      mes: monthName,
      vencimento: new Date(invoice.due_date).toLocaleDateString('pt-BR'),
      dias_atraso: String(daysOverdue),
      prazo_final: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
    })

    const sendHour = (settings.send_start_hour as number) || 9
    const scheduledFor = new Date()
    scheduledFor.setHours(sendHour, Math.floor(Math.random() * 60), 0)

    await supabase.from('message_queue').insert({
      profile_id: profileId,
      patient_id: invoice.patient_id,
      invoice_id: invoice.id,
      message_type: 'reminder',
      message_content: message,
      scheduled_for: scheduledFor.toISOString(),
      escalation_level: sentCount + 1,
    })

    // Update invoice status to overdue if still pending
    if (invoice.status === 'pending') {
      await supabase
        .from('invoices')
        .update({ status: 'overdue' })
        .eq('id', invoice.id)
    }
  }
}

async function sendThankYouMessages(settings: Record<string, unknown>) {
  const profileId = settings.profile_id as string

  // Find recent manually confirmed receipts that haven't had a thank you sent
  const { data: confirmedReceipts } = await supabase
    .from('receipt_analyses')
    .select('*, patient:patients(id, full_name, phone)')
    .eq('profile_id', profileId)
    .eq('status', 'confirmed')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  if (!confirmedReceipts) return

  for (const receipt of confirmedReceipts) {
    // Check if thank you already sent
    const { count } = await supabase
      .from('message_queue')
      .select('*', { count: 'exact', head: true })
      .eq('patient_id', receipt.patient_id)
      .eq('message_type', 'thank_you')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if ((count || 0) > 0) continue

    // Check if AI is enabled for this patient before sending thank you
    const { data: patientThankYouCheck } = await supabase
      .from('patients')
      .select('ai_enabled')
      .eq('id', receipt.patient_id)
      .single()

    if (patientThankYouCheck && patientThankYouCheck.ai_enabled === false) continue

    const patient = receipt.patient as Record<string, unknown>
    const template = settings.thank_you_template as string
    const message = renderTemplate(template, {
      nome: patient.full_name as string,
      valor: receipt.extracted_amount?.toFixed(2) || '0',
    })

    await supabase.from('message_queue').insert({
      profile_id: profileId,
      patient_id: receipt.patient_id,
      message_type: 'thank_you',
      message_content: message,
      scheduled_for: new Date().toISOString(),
      escalation_level: 0,
    })
  }
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return result
}
