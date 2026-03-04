import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { MessageLog, MessageDirection, MessageType } from '@/types'

interface MessageLogFilters {
  direction?: MessageDirection
  messageType?: MessageType
  patientId?: string
  limit?: number
}

export function useMessageLogs(filters: MessageLogFilters = {}) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['message-logs', user?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from('message_logs')
        .select('*, patient:patients(id, full_name, phone)')
        .order('created_at', { ascending: false })
        .limit(filters.limit || 50)

      if (filters.direction) {
        query = query.eq('direction', filters.direction)
      }
      if (filters.messageType) {
        query = query.eq('message_type', filters.messageType)
      }
      if (filters.patientId) {
        query = query.eq('patient_id', filters.patientId)
      }

      const { data, error } = await query

      if (error) throw error
      return data as MessageLog[]
    },
    enabled: !!user,
  })
}
