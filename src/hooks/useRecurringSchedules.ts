import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { addWeeks, addDays, format } from 'date-fns'
import type { RecurringSchedule, RecurringFrequency } from '@/types'

// ─── Query Keys ───

const recurringKeys = {
  all: ['recurring-schedules'] as const,
  lists: () => [...recurringKeys.all, 'list'] as const,
}

// ─── Helpers ───

function generateAppointmentDates(
  dayOfWeek: number,
  frequency: RecurringFrequency,
  startsAt: Date,
  weeks: number
): Date[] {
  const dates: Date[] = []
  // dayOfWeek: 0=Sunday, 1=Monday, ... 6=Saturday
  // Find the first occurrence of dayOfWeek on or after startsAt
  let current = startsAt
  const dayMap = [0, 1, 2, 3, 4, 5, 6] as const
  const targetDay = dayMap[dayOfWeek]

  // Adjust to next occurrence of target day
  while (current.getDay() !== targetDay) {
    current = addDays(current, 1)
  }

  const stepWeeks = frequency === 'weekly' ? 1 : frequency === 'biweekly' ? 2 : 4

  for (let i = 0; i < weeks; i++) {
    const date = addWeeks(current, i * stepWeeks)
    dates.push(date)
  }

  return dates
}

// ─── Hooks ───

export function useRecurringSchedules() {
  return useQuery({
    queryKey: recurringKeys.lists(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_schedules')
        .select('*, patient:patients(id, full_name, phone)')
        .eq('is_active', true)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true })

      if (error) throw error
      return data as RecurringSchedule[]
    },
  })
}

export function useCreateRecurringSchedule() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (
      input: Omit<RecurringSchedule, 'id' | 'profile_id' | 'is_active' | 'created_at' | 'patient'>
    ) => {
      // 1. Criar a recorrência
      const { data: schedule, error: scheduleError } = await supabase
        .from('recurring_schedules')
        .insert({
          ...input,
          profile_id: user!.id,
          is_active: true,
        })
        .select('*, patient:patients(id, full_name, phone)')
        .single()

      if (scheduleError) throw scheduleError

      // 2. Gerar agendamentos para as próximas 8 semanas
      const startsAt = new Date(input.starts_at)
      const dates = generateAppointmentDates(
        input.day_of_week,
        input.frequency,
        startsAt,
        8
      )

      // Filtrar datas que estejam dentro do período (se ends_at definido)
      const validDates = input.ends_at
        ? dates.filter((d) => d <= new Date(input.ends_at!))
        : dates

      if (validDates.length > 0) {
        const appointments = validDates.map((date) => ({
          profile_id: user!.id,
          patient_id: input.patient_id,
          date: format(date, 'yyyy-MM-dd'),
          start_time: input.start_time,
          end_time: input.end_time,
          status: 'scheduled' as const,
          notes: null,
        }))

        const { error: appointmentsError } = await supabase
          .from('appointments')
          .insert(appointments)

        if (appointmentsError) throw appointmentsError
      }

      return { schedule: schedule as RecurringSchedule, appointmentsCreated: validDates.length }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recurringKeys.all })
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
    },
  })
}

export function useDeleteRecurringSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('recurring_schedules')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recurringKeys.all })
    },
  })
}
