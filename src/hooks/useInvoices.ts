import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Invoice, InvoiceStatus, AppointmentStatus, OutboundMessageType, QueueStatus } from '@/types'
import { startOfMonth, endOfMonth, format } from 'date-fns'

// ─── Filter Types ───

export interface InvoiceFilters {
  month?: Date | null
  status?: InvoiceStatus[] | null
  patient_id?: string | null
}

export interface InvoicePreviewSession {
  date: string
  status: AppointmentStatus
}

export interface InvoicePreviewItem {
  patient_id: string
  patient_name: string
  sessions_count: number
  session_value: number
  total_amount: number
  due_date: string
  already_has_invoice: boolean
  sessions: InvoicePreviewSession[]
}

// ─── Query Keys ───

const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (filters: InvoiceFilters) => [...invoiceKeys.lists(), filters] as const,
  details: () => [...invoiceKeys.all, 'detail'] as const,
  detail: (id: string) => [...invoiceKeys.details(), id] as const,
  preview: (month: string) => [...invoiceKeys.all, 'preview', month] as const,
}

// ─── Hooks ───

export function useInvoices(filters: InvoiceFilters = {}) {
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('*, patient:patients(*)')
        .order('created_at', { ascending: false })

      if (filters.month) {
        const monthStr = format(filters.month, 'yyyy-MM-01')
        query = query.eq('reference_month', monthStr)
      }

      if (filters.status && filters.status.length > 0) {
        query = query.in('status', filters.status)
      }

      if (filters.patient_id) {
        query = query.eq('patient_id', filters.patient_id)
      }

      const { data, error } = await query

      if (error) throw error
      return data as Invoice[]
    },
  })
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: invoiceKeys.detail(id!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, patient:patients(*), payments(*)')
        .eq('id', id!)
        .single()

      if (error) throw error
      return data as Invoice & { payments: import('@/types').Payment[] }
    },
    enabled: !!id,
  })
}

export function useInvoicePreview(month: Date | null) {
  const { user } = useAuth()
  const monthStr = month ? format(month, 'yyyy-MM-01') : ''

  return useQuery({
    queryKey: invoiceKeys.preview(monthStr),
    queryFn: async () => {
      if (!month || !user) return []

      const monthStart = format(startOfMonth(month), 'yyyy-MM-dd')
      const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd')

      // Buscar consultas realizadas/canceladas no mês
      const { data: appointments, error: appError } = await supabase
        .from('appointments')
        .select('patient_id, date, status, patient:patients(id, full_name, session_value)')
        .in('status', ['completed', 'cancelled'])
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .eq('profile_id', user.id)

      if (appError) throw appError

      // Buscar cobranças existentes neste mês
      const { data: existingInvoices, error: invError } = await supabase
        .from('invoices')
        .select('patient_id')
        .eq('reference_month', format(month, 'yyyy-MM-01'))
        .eq('profile_id', user.id)

      if (invError) throw invError

      const existingPatientIds = new Set(
        (existingInvoices || []).map((inv: { patient_id: string }) => inv.patient_id)
      )

      // Buscar configurações de cobrança
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('billing_day, reminder_day')
        .eq('profile_id', user.id)
        .single()

      const reminderDay = aiSettings?.reminder_day ?? 10
      const billingDay = aiSettings?.billing_day ?? 5

      // Due date = reminder_day. Se reminder_day <= billing_day, vai para 2 meses após referência
      let dueDate: Date
      if (reminderDay <= billingDay) {
        dueDate = new Date(month.getFullYear(), month.getMonth() + 2, reminderDay)
      } else {
        dueDate = new Date(month.getFullYear(), month.getMonth() + 1, reminderDay)
      }
      const dueDateStr = format(dueDate, 'yyyy-MM-dd')

      // Agrupar por paciente
      const grouped = new Map<string, InvoicePreviewItem>()

      for (const apt of appointments || []) {
        const patient = apt.patient as unknown as { id: string; full_name: string; session_value: number }
        if (!patient) continue

        const session: InvoicePreviewSession = {
          date: (apt as unknown as { date: string }).date,
          status: (apt as unknown as { status: AppointmentStatus }).status,
        }

        const existing = grouped.get(apt.patient_id)
        if (existing) {
          existing.sessions_count += 1
          existing.total_amount += patient.session_value
          existing.sessions.push(session)
        } else {
          grouped.set(apt.patient_id, {
            patient_id: apt.patient_id,
            patient_name: patient.full_name,
            sessions_count: 1,
            session_value: patient.session_value,
            total_amount: patient.session_value,
            due_date: dueDateStr,
            already_has_invoice: existingPatientIds.has(apt.patient_id),
            sessions: [session],
          })
        }
      }

      return Array.from(grouped.values()).sort((a, b) =>
        a.patient_name.localeCompare(b.patient_name)
      )
    },
    enabled: !!month && !!user,
  })
}

export function useGenerateInvoices() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      items,
      referenceMonth,
    }: {
      items: InvoicePreviewItem[]
      referenceMonth: Date
    }) => {
      if (!user) throw new Error('Usuário não autenticado')

      const invoices = items.map((item) => ({
        profile_id: user.id,
        patient_id: item.patient_id,
        reference_month: format(referenceMonth, 'yyyy-MM-01'),
        total_sessions: item.sessions_count,
        total_amount: item.total_amount,
        amount_paid: 0,
        status: 'pending' as InvoiceStatus,
        due_date: item.due_date,
      }))

      const { data, error } = await supabase
        .from('invoices')
        .insert(invoices)
        .select('*, patient:patients(*)')

      if (error) throw error
      return data as Invoice[]
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
    },
  })
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<Invoice> & { id: string }) => {
      const { data, error } = await supabase
        .from('invoices')
        .update(input)
        .eq('id', id)
        .select('*, patient:patients(*)')
        .single()

      if (error) throw error
      return data as Invoice
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
      queryClient.setQueryData(invoiceKeys.detail(data.id), data)
    },
  })
}

// ─── Patient Billing Status ───

export interface PatientBillingStatusData {
  invoice: Invoice | null
  billingMessagesSent: number
  reminderMessagesSent: number
  lastBillingContent: string | null
}

export function usePatientBillingStatus(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patient-billing-status', patientId],
    queryFn: async (): Promise<PatientBillingStatusData> => {
      // Última fatura do paciente
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .select('*, patient:patients(*)')
        .eq('patient_id', patientId!)
        .order('reference_month', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (invError) throw invError

      if (!invoice) {
        return { invoice: null, billingMessagesSent: 0, reminderMessagesSent: 0, lastBillingContent: null }
      }

      // Mensagens enviadas para essa fatura
      const { data: messages, error: msgError } = await supabase
        .from('message_queue')
        .select('message_type, message_content, status')
        .eq('invoice_id', invoice.id)
        .eq('status', 'sent' as QueueStatus)

      if (msgError) throw msgError

      const billingMessages = (messages ?? []).filter(m => m.message_type === 'billing')
      const reminderMessages = (messages ?? []).filter(m => m.message_type === 'reminder')

      return {
        invoice: invoice as Invoice,
        billingMessagesSent: billingMessages.length,
        reminderMessagesSent: reminderMessages.length,
        lastBillingContent: billingMessages.length > 0 ? billingMessages[billingMessages.length - 1].message_content : null,
      }
    },
    enabled: !!patientId,
  })
}

export function useResendBilling() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      invoiceId,
      patientId,
      messageContent,
    }: {
      invoiceId: string
      patientId: string
      messageContent: string
    }) => {
      if (!user) throw new Error('Usuário não autenticado')

      const { error } = await supabase
        .from('message_queue')
        .insert({
          profile_id: user.id,
          patient_id: patientId,
          invoice_id: invoiceId,
          message_type: 'billing' as OutboundMessageType,
          message_content: messageContent,
          scheduled_for: new Date().toISOString(),
          status: 'queued' as QueueStatus,
          attempts: 0,
          max_attempts: 3,
          escalation_level: 0,
        })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-billing-status'] })
      queryClient.invalidateQueries({ queryKey: ['message-queue'] })
    },
  })
}
