import { useState, useEffect, useRef } from 'react'
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
import {
  useWhatsAppInstance,
  useConnectWhatsApp,
  useCheckConnectionState,
  useRefreshQRCode,
  useDisconnectWhatsApp,
} from '@/hooks/useWhatsApp'
import { useMessageLogs } from '@/hooks/useMessageLogs'
import MessageItem from '@/components/messages/MessageItem'
import MediaViewer from '@/components/messages/MediaViewer'
import { formatPhone } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export default function WhatsApp() {
  const { data: instance, isLoading: loadingInstance, refetch } = useWhatsAppInstance()
  const connectWhatsApp = useConnectWhatsApp()
  const checkState = useCheckConnectionState()
  const refreshQR = useRefreshQRCode()
  const disconnectWhatsApp = useDisconnectWhatsApp()
  const { data: messages } = useMessageLogs({ limit: 20 })

  const [qrCode, setQrCode] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Determine current status from DB instance
  const status = instance?.status || 'disconnected'

  // Stop polling when connected or component unmounts
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  // When status changes to connected, stop polling and clear QR
  useEffect(() => {
    if (status === 'connected') {
      setQrCode(null)
      setIsPolling(false)
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [status])

  // Start polling for connection state
  function startPolling(instanceName: string) {
    if (pollingRef.current) clearInterval(pollingRef.current)
    setIsPolling(true)

    pollingRef.current = setInterval(async () => {
      try {
        const result = await checkState.mutateAsync(instanceName)
        if (result.state === 'open') {
          setQrCode(null)
          setIsPolling(false)
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          toast.success('WhatsApp conectado!')
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000)
  }

  async function handleConnect() {
    try {
      const result = await connectWhatsApp.mutateAsync()

      if (result.status === 'already_connected') {
        toast.success('WhatsApp já está conectado!')
        await refetch()
        return
      }

      if (result.qrcode) {
        setQrCode(result.qrcode)
      }

      // Start polling for connection state
      const instanceName = instance?.instance_name || `benhayon_${(await refetch()).data?.instance_name}`
      if (instanceName) {
        startPolling(instanceName)
      }
      // Refetch to get the instance from DB
      await refetch()
      // If we have the instance name now, start polling
      const refreshed = await refetch()
      if (refreshed.data?.instance_name) {
        startPolling(refreshed.data.instance_name)
      }
    } catch {
      // Error handled by mutation onError
    }
  }

  async function handleRefreshQR() {
    if (!instance?.instance_name) return
    try {
      const result = await refreshQR.mutateAsync(instance.instance_name)
      if (result.qrcode) {
        setQrCode(result.qrcode)
      }
    } catch {
      // Error handled by mutation onError
    }
  }

  async function handleDisconnect() {
    if (!instance?.instance_name) return
    await disconnectWhatsApp.mutateAsync(instance.instance_name)
    setQrCode(null)
    setIsPolling(false)
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

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
              status === 'connected' ? 'bg-success-light' : 'bg-muted'
            )}>
              {status === 'connected' ? (
                <Wifi className="text-success" size={20} />
              ) : (
                <WifiOff className="text-muted-foreground" size={20} />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Conexão WhatsApp</h2>
              <p className="text-sm text-muted-foreground">
                {status === 'connected' && 'Conectado'}
                {status === 'connecting' && 'Aguardando leitura do QR Code...'}
                {status === 'disconnected' && 'Desconectado'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {status === 'connected' ? (
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
                disabled={connectWhatsApp.isPending || isPolling}
                className="h-9 px-4 bg-primary hover:bg-primary-dark text-primary-foreground rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {connectWhatsApp.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <QrCode size={16} />
                )}
                {connectWhatsApp.isPending ? 'Conectando...' : 'Conectar'}
              </button>
            )}
          </div>
        </div>

        {/* Connected info */}
        {status === 'connected' && instance?.phone_number && (
          <div className="flex items-center gap-2 p-3 bg-success-light rounded-lg">
            <Phone size={16} className="text-success" />
            <span className="text-sm font-medium text-success">
              Conectado: {formatPhone('+' + instance.phone_number)}
            </span>
          </div>
        )}

        {/* QR Code */}
        {qrCode && status !== 'connected' && (
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
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefreshQR}
                disabled={refreshQR.isPending}
                className="text-sm text-primary hover:text-primary-dark flex items-center gap-1 transition-colors"
              >
                {refreshQR.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Gerar novo QR Code
              </button>
            </div>
            {isPolling && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" />
                Verificando conexão a cada 5 segundos...
              </p>
            )}
          </motion.div>
        )}

        {/* Polling without QR (waiting for reconnection) */}
        {!qrCode && isPolling && status !== 'connected' && (
          <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Verificando conexão...</span>
          </div>
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
        <div className="p-4">
          {!messages?.length ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhuma mensagem registrada ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <MessageItem
                  key={msg.id}
                  message={msg}
                  onImageClick={(url) => setSelectedImageUrl(url)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Media Viewer */}
      <MediaViewer
        open={!!selectedImageUrl}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelectedImageUrl(null)
        }}
        imageUrl={selectedImageUrl}
      />
    </motion.div>
  )
}
