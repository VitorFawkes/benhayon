import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { startOfMonth, endOfMonth, format } from 'date-fns'

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
          month: format(date, 'MMM', { locale: undefined }),
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
