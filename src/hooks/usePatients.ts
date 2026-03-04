import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Patient, PatientStatus, PatientPaymentType } from '@/types'

// ─── Filter Types ───

export interface PatientFilters {
  status?: PatientStatus | null
  payment_type?: PatientPaymentType | null
  search?: string
  clinic_id?: string | null
}

// ─── Query Keys ───

const patientKeys = {
  all: ['patients'] as const,
  lists: () => [...patientKeys.all, 'list'] as const,
  list: (filters: PatientFilters) => [...patientKeys.lists(), filters] as const,
  details: () => [...patientKeys.all, 'detail'] as const,
  detail: (id: string) => [...patientKeys.details(), id] as const,
}

// ─── Hooks ───

export function usePatients(filters: PatientFilters = {}) {
  return useQuery({
    queryKey: patientKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('patients')
        .select('*, clinic:clinics(*)')
        .is('deleted_at', null)
        .order('full_name', { ascending: true })

      if (filters.status) {
        query = query.eq('status', filters.status)
      }

      if (filters.payment_type) {
        query = query.eq('payment_type', filters.payment_type)
      }

      if (filters.clinic_id) {
        query = query.eq('clinic_id', filters.clinic_id)
      }

      if (filters.search) {
        const term = `%${filters.search}%`
        query = query.or(`full_name.ilike.${term},phone.ilike.${term}`)
      }

      const { data, error } = await query

      if (error) throw error
      return data as Patient[]
    },
  })
}

export function usePatient(id: string | undefined) {
  return useQuery({
    queryKey: patientKeys.detail(id!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('*, clinic:clinics(*)')
        .eq('id', id!)
        .is('deleted_at', null)
        .single()

      if (error) throw error
      return data as Patient
    },
    enabled: !!id,
  })
}

export function useCreatePatient() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (
      input: Omit<Patient, 'id' | 'profile_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'clinic'>
    ) => {
      const { data, error } = await supabase
        .from('patients')
        .insert({
          ...input,
          profile_id: user!.id,
        })
        .select('*, clinic:clinics(*)')
        .single()

      if (error) throw error
      return data as Patient
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.all })
    },
  })
}

export function useUpdatePatient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<Patient> & { id: string }) => {
      const { data, error } = await supabase
        .from('patients')
        .update(input)
        .eq('id', id)
        .select('*, clinic:clinics(*)')
        .single()

      if (error) throw error
      return data as Patient
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: patientKeys.all })
      queryClient.setQueryData(patientKeys.detail(data.id), data)
    },
  })
}

export function useSoftDeletePatient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('patients')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.all })
    },
  })
}
