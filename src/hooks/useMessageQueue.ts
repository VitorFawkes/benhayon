import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { MessageQueueItem, QueueStatus } from '@/types'

interface MessageQueueFilters {
  status?: QueueStatus | QueueStatus[]
  limit?: number
}

export function useMessageQueue(filters: MessageQueueFilters = {}) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['message-queue', user?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from('message_queue')
        .select('*, patient:patients(id, full_name, phone, ai_enabled), invoice:invoices(id, reference_month, total_amount, status)')
        .order('scheduled_for', { ascending: true })
        .limit(filters.limit || 50)

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status)
        } else {
          query = query.eq('status', filters.status)
        }
      }

      const { data, error } = await query
      if (error) throw error
      return data as MessageQueueItem[]
    },
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30s
  })
}

export function useCancelMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('message_queue')
        .update({ status: 'cancelled' as QueueStatus })
        .eq('id', messageId)
        .in('status', ['queued', 'sending'])

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-queue'] })
    },
  })
}

export function useRetryMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await supabase
        .from('message_queue')
        .update({
          status: 'queued' as QueueStatus,
          attempts: 0,
          last_error: null,
          scheduled_for: new Date().toISOString(),
        })
        .eq('id', messageId)
        .eq('status', 'failed')
        .select('id')

      if (error) throw error
      if (!data?.length) throw new Error('Mensagem já foi processada')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-queue'] })
    },
  })
}

export function useEditMessageContent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const { data, error } = await supabase
        .from('message_queue')
        .update({ message_content: content })
        .eq('id', messageId)
        .eq('status', 'queued')
        .select('id')

      if (error) throw error
      if (!data?.length) throw new Error('Mensagem já está sendo enviada')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-queue'] })
    },
  })
}

export function useSendNow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await supabase
        .from('message_queue')
        .update({ scheduled_for: new Date().toISOString() })
        .eq('id', messageId)
        .eq('status', 'queued')
        .select('id')

      if (error) throw error
      if (!data?.length) throw new Error('Mensagem já está sendo enviada')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-queue'] })
    },
  })
}

export function useTogglePatientAI() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ patientId, enabled }: { patientId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('patients')
        .update({ ai_enabled: enabled })
        .eq('id', patientId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-queue'] })
      queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}
