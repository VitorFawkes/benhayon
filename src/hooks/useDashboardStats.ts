import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function useDashboardStats() {
  const { user } = useAuth()
  const now = new Date()
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['dashboard-stats', user?.id, monthStart],
    queryFn: async () => {
      const [
        invoicesRes,
        paymentsRes,
        patientsRes,
        appointmentsRes,
        noShowsRes,
      ] = await Promise.all([
        // Invoices this month
        supabase
          .from('invoices')
          .select('total_amount, amount_paid, status')
          .gte('reference_month', monthStart)
          .lte('reference_month', monthEnd),
        // Payments this month
        supabase
          .from('payments')
          .select('amount')
          .gte('payment_date', monthStart)
          .lte('payment_date', monthEnd),
        // Active patients
        supabase
          .from('patients')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .is('deleted_at', null),
        // Appointments this month
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .gte('date', monthStart)
          .lte('date', monthEnd),
        // No-shows this month
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'no_show')
          .gte('date', monthStart)
          .lte('date', monthEnd),
      ])

      const totalInvoiced = invoicesRes.data?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0
      const totalPaid = paymentsRes.data?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
      const activePatients = patientsRes.count || 0
      const totalAppointments = appointmentsRes.count || 0
      const totalNoShows = noShowsRes.count || 0
      const noShowRate = totalAppointments > 0 ? (totalNoShows / totalAppointments) * 100 : 0

      return {
        monthRevenue: totalPaid,
        pendingAmount: totalInvoiced - totalPaid,
        activePatients,
        monthSessions: totalAppointments,
        noShowRate,
      }
    },
    enabled: !!user,
  })
}

export type DashboardMetric = 'revenue' | 'pending' | 'activePatients' | 'sessions' | 'noShows'

export interface MetricPatient {
  id: string
  name: string
  value: string
}

export function useDashboardDetails(metric: DashboardMetric | null) {
  const { user } = useAuth()
  const now = new Date()
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['dashboard-details', user?.id, metric, monthStart],
    queryFn: async (): Promise<MetricPatient[]> => {
      if (!metric) return []

      if (metric === 'activePatients') {
        const { data } = await supabase
          .from('patients')
          .select('id, full_name, phone')
          .eq('status', 'active')
          .is('deleted_at', null)
          .order('full_name')
        return (data || []).map((p) => ({
          id: p.id,
          name: p.full_name,
          value: p.phone,
        }))
      }

      if (metric === 'revenue') {
        const { data } = await supabase
          .from('payments')
          .select('amount, patient:patients(id, full_name)')
          .gte('payment_date', monthStart)
          .lte('payment_date', monthEnd)
        const byPatient = new Map<string, { id: string; name: string; total: number }>()
        for (const row of data || []) {
          const p = row.patient as unknown as { id: string; full_name: string } | null
          if (!p) continue
          const existing = byPatient.get(p.id)
          if (existing) {
            existing.total += Number(row.amount)
          } else {
            byPatient.set(p.id, { id: p.id, name: p.full_name, total: Number(row.amount) })
          }
        }
        return Array.from(byPatient.values())
          .sort((a, b) => b.total - a.total)
          .map((p) => ({ id: p.id, name: p.name, value: String(p.total) }))
      }

      if (metric === 'pending') {
        const { data } = await supabase
          .from('invoices')
          .select('total_amount, amount_paid, patient:patients(id, full_name)')
          .in('status', ['pending', 'partial', 'overdue'])
        const byPatient = new Map<string, { id: string; name: string; total: number }>()
        for (const row of data || []) {
          const p = row.patient as unknown as { id: string; full_name: string } | null
          if (!p) continue
          const pending = Number(row.total_amount) - Number(row.amount_paid)
          const existing = byPatient.get(p.id)
          if (existing) {
            existing.total += pending
          } else {
            byPatient.set(p.id, { id: p.id, name: p.full_name, total: pending })
          }
        }
        return Array.from(byPatient.values())
          .sort((a, b) => b.total - a.total)
          .map((p) => ({ id: p.id, name: p.name, value: String(p.total) }))
      }

      if (metric === 'sessions') {
        const { data } = await supabase
          .from('appointments')
          .select('id, patient:patients(id, full_name)')
          .gte('date', monthStart)
          .lte('date', monthEnd)
        const byPatient = new Map<string, { id: string; name: string; count: number }>()
        for (const row of data || []) {
          const p = row.patient as unknown as { id: string; full_name: string } | null
          if (!p) continue
          const existing = byPatient.get(p.id)
          if (existing) {
            existing.count++
          } else {
            byPatient.set(p.id, { id: p.id, name: p.full_name, count: 1 })
          }
        }
        return Array.from(byPatient.values())
          .sort((a, b) => b.count - a.count)
          .map((p) => ({ id: p.id, name: p.name, value: String(p.count) }))
      }

      // noShows
      const { data } = await supabase
        .from('appointments')
        .select('id, patient:patients(id, full_name)')
        .eq('status', 'no_show')
        .gte('date', monthStart)
        .lte('date', monthEnd)
      const byPatient = new Map<string, { id: string; name: string; count: number }>()
      for (const row of data || []) {
        const p = row.patient as unknown as { id: string; full_name: string } | null
        if (!p) continue
        const existing = byPatient.get(p.id)
        if (existing) {
          existing.count++
        } else {
          byPatient.set(p.id, { id: p.id, name: p.full_name, count: 1 })
        }
      }
      return Array.from(byPatient.values())
        .sort((a, b) => b.count - a.count)
        .map((p) => ({ id: p.id, name: p.name, value: String(p.count) }))
    },
    enabled: !!user && !!metric,
  })
}

export function useRevenueHistory() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['revenue-history', user?.id],
    queryFn: async () => {
      const months = []
      const now = new Date()

      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthStart = format(date, 'yyyy-MM-dd')
        const monthEnd = format(endOfMonth(date), 'yyyy-MM-dd')

        const [invoicesRes, paymentsRes] = await Promise.all([
          supabase
            .from('invoices')
            .select('total_amount')
            .gte('reference_month', monthStart)
            .lte('reference_month', monthEnd),
          supabase
            .from('payments')
            .select('amount')
            .gte('payment_date', monthStart)
            .lte('payment_date', monthEnd),
        ])

        const invoiced = invoicesRes.data?.reduce((s, i) => s + Number(i.total_amount), 0) || 0
        const paid = paymentsRes.data?.reduce((s, p) => s + Number(p.amount), 0) || 0

        months.push({
          month: format(date, 'MMM', { locale: ptBR }),
          invoiced,
          paid,
          pending: invoiced - paid,
        })
      }

      return months
    },
    enabled: !!user,
  })
}
