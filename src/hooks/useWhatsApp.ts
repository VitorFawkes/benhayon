import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, invokeEdgeFunction } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { extractErrorMessage, throwIfFunctionsError } from '@/lib/utils'
import type { WhatsAppInstance } from '@/types'
import { toast } from 'sonner'

// ─── Helper: invoke edge function and handle errors ───

async function invokeEdge(action: string, body: Record<string, unknown>) {
  const { data, error } = await invokeEdgeFunction('evolution-api', { action, ...body })

  await throwIfFunctionsError(error)
  if (data?.error) throw new Error(data.error)

  return data
}

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
      const data = await invokeEdge('create_and_connect', { instanceName })

      await queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] })
      return data as ConnectResult
    },
    onError: (error) => {
      toast.error('Erro ao conectar WhatsApp', { description: extractErrorMessage(error) })
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
      const data = await invokeEdge('connection_state', { instanceName })

      await queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] })
      return data as StateResult
    },
  })
}

// ─── Mutation: gerar novo QR code ───

export function useRefreshQRCode() {
  return useMutation({
    mutationFn: async (instanceName: string): Promise<{ qrcode?: string | null }> => {
      const data = await invokeEdge('connect', { instanceName })
      return data as { qrcode?: string | null }
    },
    onError: (error) => {
      toast.error('Erro ao gerar novo QR Code', { description: extractErrorMessage(error) })
    },
  })
}

// ─── Mutation: desconectar ───

export function useDisconnectWhatsApp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (instanceName: string) => {
      const data = await invokeEdge('disconnect', { instanceName })

      await queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] })
      return data
    },
    onSuccess: () => {
      toast.success('WhatsApp desconectado')
    },
    onError: (error) => {
      toast.error('Erro ao desconectar', { description: extractErrorMessage(error) })
    },
  })
}
