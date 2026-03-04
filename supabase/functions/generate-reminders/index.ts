import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async () => {
  try {
    // Get all profiles with appointment reminder enabled
    const { data: allSettings } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('appointment_reminder_enabled', true)

    if (!allSettings) return new Response(JSON.stringify({ ok: true }), { status: 200 })

    let totalQueued = 0

    for (const settings of allSettings) {
      const profileId = settings.profile_id as string
      const hoursBefore = (settings.appointment_reminder_hours_before as number) || 24

      // Calculate the time window for appointments that need reminders
      const now = new Date()
      const reminderThreshold = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000)

      // Get tomorrow's appointments (or appointments within the reminder window)
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*, patient:patients(id, full_name, phone)')
        .eq('profile_id', profileId)
        .eq('status', 'scheduled')
        .gte('date', now.toISOString().split('T')[0])
        .lte('date', reminderThreshold.toISOString().split('T')[0])

      if (!appointments) continue

      for (const apt of appointments) {
        // Check if reminder already sent for this appointment
        const { count } = await supabase
          .from('message_queue')
          .select('*', { count: 'exact', head: true })
          .eq('patient_id', apt.patient_id)
          .eq('message_type', 'appointment_reminder')
          .gte('created_at', new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString())

        if ((count || 0) > 0) continue

        const patient = apt.patient as Record<string, unknown>
        const template = settings.appointment_reminder_template as string
        const appointmentDate = new Date(apt.date)

        const message = renderTemplate(template, {
          nome: patient.full_name as string,
          data: appointmentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
          horario: apt.start_time.slice(0, 5),
        })

        const sendHour = (settings.send_start_hour as number) || 9
        const scheduledFor = new Date()
        scheduledFor.setHours(sendHour, Math.floor(Math.random() * 30), 0)

        await supabase.from('message_queue').insert({
          profile_id: profileId,
          patient_id: apt.patient_id,
          message_type: 'appointment_reminder',
          message_content: message,
          scheduled_for: scheduledFor.toISOString(),
          escalation_level: 0,
        })

        totalQueued++
      }
    }

    return new Response(JSON.stringify({ queued: totalQueued }), { status: 200 })
  } catch (error) {
    console.error('Generate reminders error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 })
  }
})

function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return result
}
