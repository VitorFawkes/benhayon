import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { AISettings } from '@/types'
import { toast } from 'sonner'

export function useAISettings() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['ai-settings', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('profile_id', user!.id)
        .single()

      if (error) throw error
      return data as AISettings
    },
    enabled: !!user,
  })
}

export function useUpdateAISettings() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: Partial<AISettings>) => {
      const { data, error } = await supabase
        .from('ai_settings')
        .update(updates)
        .eq('profile_id', user!.id)
        .select()
        .single()

      if (error) throw error
      return data as AISettings
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] })
      toast.success('Configurações da IA atualizadas!')
    },
    onError: (error) => {
      toast.error('Erro ao salvar configurações', {
        description: error.message,
      })
    },
  })
}
