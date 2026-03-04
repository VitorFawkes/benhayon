import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Clinic } from '@/types'

// ─── Query Keys ───

const clinicKeys = {
  all: ['clinics'] as const,
  list: () => [...clinicKeys.all, 'list'] as const,
}

// ─── Hooks ───

export function useClinics() {
  return useQuery({
    queryKey: clinicKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinics')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      return data as Clinic[]
    },
  })
}

export function useCreateClinic() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { name: string; contact_phone?: string; contact_email?: string; notes?: string }) => {
      const { data, error } = await supabase
        .from('clinics')
        .insert({
          ...input,
          profile_id: user!.id,
        })
        .select()
        .single()

      if (error) throw error
      return data as Clinic
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.all })
    },
  })
}
