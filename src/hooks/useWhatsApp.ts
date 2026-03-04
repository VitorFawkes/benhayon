import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { WhatsAppInstance } from '@/types'
import { toast } from 'sonner'

// ─── Query: buscar instância do banco ───

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

// ─── Mutation: criar instância + gerar QR code ───
// A Edge Function cria na Evolution API, salva no banco, e configura webhook

interface ConnectResult {
  status: string
  qrcode?: string | null
  pairingCode?: string | null
  instanceId?: string | null
  phoneNumber?: string | null
}

export function useConnectWhatsApp() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<ConnectResult> => {
      const instanceName = `benhayon_${user!.id.slice(0, 8)}`

      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'create_and_connect', instanceName },
      })

      if (error) throw error

      // Refetch instance from DB (Edge Function saved/updated it)
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] })

      return data as ConnectResult
    },
    onError: (error) => {
      toast.error('Erro ao conectar WhatsApp', { description: error.message })
    },
  })
}

// ─── Mutation: verificar estado da conexão ───

interface StateResult {
  state: string
  phoneNumber?: string | null
}

export function useCheckConnectionState() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (instanceName: string): Promise<StateResult> => {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'connection_state', instanceName },
      })

      if (error) throw error

      // Edge Function updates DB, refetch
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] })

      return data as StateResult
    },
  })
}

// ─── Mutation: gerar novo QR code ───

export function useRefreshQRCode() {
  return useMutation({
    mutationFn: async (instanceName: string): Promise<{ qrcode?: string | null }> => {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'connect', instanceName },
      })

      if (error) throw error
      return data as { qrcode?: string | null }
    },
    onError: () => {
      toast.error('Erro ao gerar novo QR Code')
    },
  })
}

// ─── Mutation: desconectar ───

export function useDisconnectWhatsApp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (instanceName: string) => {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'disconnect', instanceName },
      })

      if (error) throw error

      await queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] })
      return data
    },
    onSuccess: () => {
      toast.success('WhatsApp desconectado')
    },
    onError: (error) => {
      toast.error('Erro ao desconectar', { description: error.message })
    },
  })
}
