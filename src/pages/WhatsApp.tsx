import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  MessageCircle,
  Wifi,
  WifiOff,
  Loader2,
  QrCode,
  Phone,
  RefreshCw,
  Power,
} from 'lucide-react'
import { useWhatsAppInstance, useCreateWhatsAppInstance, useConnectWhatsApp, useCheckConnectionState, useDisconnectWhatsApp } from '@/hooks/useWhatsApp'
import { useMessageLogs } from '@/hooks/useMessageLogs'
import { formatDateTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export default function WhatsApp() {
  const { data: instance, isLoading: loadingInstance } = useWhatsAppInstance()
  const createInstance = useCreateWhatsAppInstance()
  const connectWhatsApp = useConnectWhatsApp()
  const checkState = useCheckConnectionState()
  const disconnectWhatsApp = useDisconnectWhatsApp()
  const { data: messages } = useMessageLogs({ limit: 20 })

  const [qrCode, setQrCode] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected')

  useEffect(() => {
    if (instance) {
      setConnectionStatus(instance.status)
    }
  }, [instance])

  // Poll connection state while connecting
  useEffect(() => {
    if (!isConnecting || !instance?.instance_name) return

    const interval = setInterval(async () => {
      try {
        const result = await checkState.mutateAsync(instance.instance_name)
        if (result.state === 'open') {
          setConnectionStatus('connected')
          setIsConnecting(false)
          setQrCode(null)
          toast.success('WhatsApp conectado!')
        }
      } catch {
        // ignore polling errors
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [isConnecting, instance?.instance_name])

  const handleConnect = useCallback(async () => {
    try {
      setIsConnecting(true)
      let inst = instance

      if (!inst) {
        inst = await createInstance.mutateAsync()
      }

      const result = await connectWhatsApp.mutateAsync(inst!.instance_name)
      if (result.base64) {
        setQrCode(result.base64)
        setConnectionStatus('connecting')
      }
    } catch (error) {
      setIsConnecting(false)
      toast.error('Erro ao conectar WhatsApp')
    }
  }, [instance])

  const handleDisconnect = useCallback(async () => {
    if (!instance) return
    await disconnectWhatsApp.mutateAsync(instance.instance_name)
    setConnectionStatus('disconnected')
    setQrCode(null)
  }, [instance])

  const handleRefreshQR = useCallback(async () => {
    if (!instance) return
    try {
      const result = await connectWhatsApp.mutateAsync(instance.instance_name)
      if (result.base64) {
        setQrCode(result.base64)
      }
    } catch {
      toast.error('Erro ao gerar novo QR Code')
    }
  }, [instance])

  if (loadingInstance) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">WhatsApp</h1>
        <div className="bg-surface border border-border rounded-xl p-8 flex items-center justify-center">
          <Loader2 className="animate-spin text-muted-foreground" size={24} />
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <h1 className="text-2xl font-bold text-foreground">WhatsApp</h1>

      {/* Connection Card */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              connectionStatus === 'connected' ? 'bg-success-light' : 'bg-muted'
            )}>
              {connectionStatus === 'connected' ? (
                <Wifi className="text-success" size={20} />
              ) : (
                <WifiOff className="text-muted-foreground" size={20} />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Conexão WhatsApp</h2>
              <p className="text-sm text-muted-foreground">
                {connectionStatus === 'connected' && 'Conectado'}
                {connectionStatus === 'connecting' && 'Aguardando leitura do QR Code...'}
                {connectionStatus === 'disconnected' && 'Desconectado'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {connectionStatus === 'connected' ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnectWhatsApp.isPending}
                className="h-9 px-4 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Power size={16} />
                Desconectar
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting || createInstance.isPending}
                className="h-9 px-4 bg-primary hover:bg-primary-dark text-primary-foreground rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isConnecting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <QrCode size={16} />
                )}
                Conectar
              </button>
            )}
          </div>
        </div>

        {/* Connected info */}
        {connectionStatus === 'connected' && instance?.phone_number && (
          <div className="flex items-center gap-2 p-3 bg-success-light rounded-lg">
            <Phone size={16} className="text-success" />
            <span className="text-sm font-medium text-success">
              Conectado: {instance.phone_number}
            </span>
          </div>
        )}

        {/* QR Code */}
        {qrCode && connectionStatus === 'connecting' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 py-6"
          >
            <p className="text-sm text-muted-foreground">
              Escaneie o QR Code com seu WhatsApp
            </p>
            <div className="bg-white p-4 rounded-xl shadow-card">
              <img
                src={qrCode}
                alt="QR Code WhatsApp"
                className="w-64 h-64"
              />
            </div>
            <button
              onClick={handleRefreshQR}
              className="text-sm text-primary hover:text-primary-dark flex items-center gap-1 transition-colors"
            >
              <RefreshCw size={14} />
              Gerar novo QR Code
            </button>
          </motion.div>
        )}
      </div>

      {/* Message Log */}
      <div className="bg-surface border border-border rounded-xl">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <MessageCircle size={18} />
            Log de Mensagens
          </h2>
        </div>
        <div className="divide-y divide-border">
          {!messages?.length ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhuma mensagem registrada ainda.
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="px-6 py-3 flex items-center gap-4 text-sm">
                <span className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  msg.direction === 'inbound' ? 'bg-info' : 'bg-success'
                )} />
                <span className="text-muted-foreground w-32 flex-shrink-0">
                  {formatDateTime(msg.created_at)}
                </span>
                <span className="font-medium text-foreground truncate">
                  {msg.patient?.full_name || 'Desconhecido'}
                </span>
                <span className="text-muted-foreground capitalize">{msg.message_type}</span>
                <span className="text-muted-foreground truncate flex-1">
                  {msg.content?.slice(0, 80) || '(mídia)'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  )
}
