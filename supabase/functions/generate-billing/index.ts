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
  const reminderDay = (settings.reminder_day as number) || 10

  // Previous month
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const referenceMonth = prevMonth.toISOString().split('T')[0]

  // Get completed appointments for previous month
  const billCancelled = settings.bill_cancelled_sessions !== false
  const statuses = billCancelled ? ['completed', 'cancelled'] : ['completed']

  const { data: appointments } = await supabase
    .from('appointments')
    .select('patient_id, date, patient:patients(id, full_name, phone, session_value)')
    .eq('profile_id', profileId)
    .in('status', statuses)
    .gte('date', prevMonth.toISOString().split('T')[0])
    .lte('date', prevMonthEnd.toISOString().split('T')[0])

  if (!appointments || appointments.length === 0) return

  // Group by patient
  const patientMap = new Map<string, { count: number; dates: string[]; patient: Record<string, unknown> }>()
  for (const apt of appointments) {
    const pid = apt.patient_id
    const existing = patientMap.get(pid)
    if (existing) {
      existing.count++
      existing.dates.push(apt.date)
    } else {
      patientMap.set(pid, { count: 1, dates: [apt.date], patient: apt.patient as unknown as Record<string, unknown> })
    }
  }

  // Due date = reminder_day of current month (when reminders start = payment deadline)
  const dueDate = new Date(now.getFullYear(), now.getMonth(), reminderDay)

  for (const [patientId, { count, dates, patient }] of patientMap) {
    const sessionValue = Number(patient.session_value) || 0
    const totalAmount = count * sessionValue

    if (totalAmount <= 0) continue

    // Idempotent: skip if invoice already exists (race-safe via ignoreDuplicates)
    const { data: invoice } = await supabase
      .from('invoices')
      .upsert(
        {
          profile_id: profileId,
          patient_id: patientId,
          reference_month: referenceMonth,
          total_sessions: count,
          total_amount: totalAmount,
          due_date: dueDate.toISOString().split('T')[0],
        },
        { onConflict: 'profile_id,patient_id,reference_month', ignoreDuplicates: true }
      )
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
      const formattedDates = dates.sort().map(d =>
        new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      ).join(', ')

      const message = renderTemplate(template, {
        nome: patient.full_name as string,
        valor: totalAmount.toFixed(2),
        mes: monthName,
        sessoes: String(count),
        vencimento: dueDate.toLocaleDateString('pt-BR'),
        datas_sessoes: formattedDates,
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
  const todayDay = today.getDate()

  const reminderDay = (settings.reminder_day as number) || 10
  const maxCount = (settings.reminder_max_count as number) || 3
  const repeatEnabled = settings.reminder_repeat_enabled as boolean
  const repeatInterval = (settings.reminder_repeat_interval_days as number) || 5
  const template = (settings.reminder_1_template as string) || ''

  // Only start reminding from reminder_day onwards
  if (todayDay < reminderDay) return

  // Get unpaid invoices
  const { data: unpaidInvoices } = await supabase
    .from('invoices')
    .select('*, patient:patients(id, full_name, phone)')
    .eq('profile_id', profileId)
    .in('status', ['pending', 'partial', 'overdue'])

  if (!unpaidInvoices) return

  for (const invoice of unpaidInvoices) {
    const patient = invoice.patient as Record<string, unknown>
    const remaining = invoice.total_amount - invoice.amount_paid

    // Get reminders already sent for this invoice (most recent first)
    const { data: sentReminders } = await supabase
      .from('message_queue')
      .select('created_at')
      .eq('invoice_id', invoice.id)
      .eq('message_type', 'reminder')
      .in('status', ['sent', 'queued', 'sending'])
      .order('created_at', { ascending: false })

    const sentCount = sentReminders?.length || 0

    // Already reached max reminders
    if (sentCount >= maxCount) continue

    let shouldSend = false

    if (sentCount === 0) {
      // First reminder: send on reminder_day
      shouldSend = true
    } else if (repeatEnabled && sentReminders?.[0]) {
      // Check interval since last reminder
      const lastSent = new Date(sentReminders[0].created_at)
      const daysSinceLast = Math.floor((today.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24))
      shouldSend = daysSinceLast >= repeatInterval
    }

    if (!shouldSend || !template) continue

    // Check if AI is enabled for this patient
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

    // Update invoice status to overdue if past due date
    const dueDate = new Date(invoice.due_date)
    if (invoice.status === 'pending' && today > dueDate) {
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
