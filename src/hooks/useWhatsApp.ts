import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { WhatsAppInstance } from '@/types'
import { toast } from 'sonner'

export function useWhatsAppInstance() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['whatsapp-instance', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('profile_id', user!.id)
        .maybeSingle()

      if (error) throw error
      return data as WhatsAppInstance | null
    },
    enabled: !!user,
  })
}

export function useCreateWhatsAppInstance() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const instanceName = `benhayon_${user!.id.slice(0, 8)}`

      // Call Evolution API proxy (Edge Function)
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'create_instance', instanceName },
      })

      if (error) throw error

      // Save instance to DB
      const { data: instance, error: dbError } = await supabase
        .from('whatsapp_instances')
        .upsert({
          profile_id: user!.id,
          instance_name: instanceName,
          instance_id: data?.instance?.instanceId || null,
          status: 'connecting',
        }, { onConflict: 'profile_id' })
        .select()
        .single()

      if (dbError) throw dbError
      return instance
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] })
    },
    onError: (error) => {
      toast.error('Erro ao criar instância WhatsApp', {
        description: error.message,
      })
    },
  })
}

export function useConnectWhatsApp() {
  return useMutation({
    mutationFn: async (instanceName: string) => {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'connect', instanceName },
      })

      if (error) throw error
      return data as { base64?: string; pairingCode?: string }
    },
  })
}

export function useCheckConnectionState() {
  return useMutation({
    mutationFn: async (instanceName: string) => {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'connection_state', instanceName },
      })

      if (error) throw error
      return data as { state: string }
    },
  })
}

export function useDisconnectWhatsApp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (instanceName: string) => {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'disconnect', instanceName },
      })

      if (error) throw error

      // Update DB status
      await supabase
        .from('whatsapp_instances')
        .update({ status: 'disconnected', phone_number: null })
        .eq('instance_name', instanceName)

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] })
      toast.success('WhatsApp desconectado')
    },
    onError: (error) => {
      toast.error('Erro ao desconectar', { description: error.message })
    },
  })
}

export function useSetWebhook() {
  return useMutation({
    mutationFn: async ({ instanceName, webhookUrl }: { instanceName: string; webhookUrl: string }) => {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'set_webhook', instanceName, webhookUrl },
      })

      if (error) throw error
      return data
    },
  })
}
