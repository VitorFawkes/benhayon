import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Appointment } from '@/types'

// ─── Query Keys ───

const appointmentKeys = {
  all: ['appointments'] as const,
  lists: () => [...appointmentKeys.all, 'list'] as const,
  list: (startDate: string, endDate: string) =>
    [...appointmentKeys.lists(), { startDate, endDate }] as const,
}

// ─── Hooks ───

export function useAppointments(startDate: string, endDate: string) {
  return useQuery({
    queryKey: appointmentKeys.list(startDate, endDate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, patient:patients(id, full_name, phone)')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })

      if (error) throw error
      return data as Appointment[]
    },
    enabled: !!startDate && !!endDate,
  })
}

export function useCreateAppointment() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (
      input: Omit<Appointment, 'id' | 'profile_id' | 'created_at' | 'patient'>
    ) => {
      const { data, error } = await supabase
        .from('appointments')
        .insert({
          ...input,
          profile_id: user!.id,
        })
        .select('*, patient:patients(id, full_name, phone)')
        .single()

      if (error) throw error
      return data as Appointment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.all })
    },
  })
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<Omit<Appointment, 'patient'>> & { id: string }) => {
      const { data, error } = await supabase
        .from('appointments')
        .update(input)
        .eq('id', id)
        .select('*, patient:patients(id, full_name, phone)')
        .single()

      if (error) throw error
      return data as Appointment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.all })
      queryClient.invalidateQueries({ queryKey: ['patient-sessions'] })
    },
  })
}

export function useDeleteAppointment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.all })
    },
  })
}
