import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
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
  Send,
  Clock,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  BotOff,
  ChevronDown,
  ChevronUp,
  User,
  Pencil,
  Zap,
  Check,
  X,
} from 'lucide-react'
import {
  useWhatsAppInstance,
  useConnectWhatsApp,
  useCheckConnectionState,
  useRefreshQRCode,
  useDisconnectWhatsApp,
} from '@/hooks/useWhatsApp'
import { useMessageLogs } from '@/hooks/useMessageLogs'
import { useMessageQueue, useCancelMessage, useTogglePatientAI, useRetryMessage, useEditMessageContent, useSendNow } from '@/hooks/useMessageQueue'
import MessageItem from '@/components/messages/MessageItem'
import MediaViewer from '@/components/messages/MediaViewer'
import { formatPhone, formatCurrency, formatDateTime, formatMonthYear } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { MessageQueueItem, OutboundMessageType, QueueStatus } from '@/types'

export default function WhatsApp() {
  const { data: instance, isLoading: loadingInstance, refetch } = useWhatsAppInstance()
  const connectWhatsApp = useConnectWhatsApp()
  const checkState = useCheckConnectionState()
  const refreshQR = useRefreshQRCode()
  const disconnectWhatsApp = useDisconnectWhatsApp()
  const { data: messages } = useMessageLogs({ limit: 20 })
  const { data: queuedMessages, isLoading: loadingQueue } = useMessageQueue({
    status: ['queued', 'sending', 'failed'],
    limit: 30,
  })
  const navigate = useNavigate()
  const cancelMessage = useCancelMessage()
  const togglePatientAI = useTogglePatientAI()
  const retryMessage = useRetryMessage()
  const editMessageContent = useEditMessageContent()
  const sendNow = useSendNow()

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

      // Refetch to get the instance from DB and start polling
      const refreshed = await refetch()
      const instanceName = refreshed.data?.instance_name || instance?.instance_name
      if (instanceName) {
        startPolling(instanceName)
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

      {/* Message Queue */}
      <MessageQueueSection
        messages={queuedMessages || []}
        loading={loadingQueue}
        onCancel={(id) => {
          cancelMessage.mutate(id, {
            onSuccess: () => toast.success('Envio cancelado'),
            onError: () => toast.error('Erro ao cancelar'),
          })
        }}
        onDisableAI={(patientId, patientName) => {
          togglePatientAI.mutate(
            { patientId, enabled: false },
            {
              onSuccess: () => toast.success(`IA desativada para ${patientName}`),
              onError: () => toast.error('Erro ao desativar IA'),
            }
          )
        }}
        onRetry={(id) => {
          retryMessage.mutate(id, {
            onSuccess: () => toast.success('Mensagem reenfileirada'),
            onError: () => toast.error('Erro ao reenviar'),
          })
        }}
        onEdit={(id, content) => {
          editMessageContent.mutate({ messageId: id, content }, {
            onSuccess: () => toast.success('Mensagem atualizada'),
            onError: () => toast.error('Erro ao editar'),
          })
        }}
        onSendNow={(id) => {
          sendNow.mutate(id, {
            onSuccess: () => toast.success('Envio antecipado'),
            onError: () => toast.error('Erro ao antecipar envio'),
          })
        }}
        onNavigatePatient={(patientId) => navigate(`/patients/${patientId}`)}
      />

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

// ─── Message Queue Section ───

const MESSAGE_TYPE_LABELS: Record<OutboundMessageType, string> = {
  billing: 'Cobrança',
  reminder: 'Lembrete',
  thank_you: 'Agradecimento',
  appointment_reminder: 'Lembrete de sessão',
  custom: 'Personalizada',
}

const STATUS_CONFIG: Record<QueueStatus, { label: string; icon: typeof Clock; className: string }> = {
  queued: { label: 'Na fila', icon: Clock, className: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950' },
  sending: { label: 'Enviando', icon: Loader2, className: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950' },
  sent: { label: 'Enviado', icon: CheckCircle2, className: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950' },
  failed: { label: 'Falhou', icon: AlertTriangle, className: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950' },
  cancelled: { label: 'Cancelado', icon: XCircle, className: 'text-gray-500 bg-gray-50 dark:text-gray-400 dark:bg-gray-900' },
}

function MessageQueueSection({
  messages,
  loading,
  onCancel,
  onDisableAI,
  onRetry,
  onEdit,
  onSendNow,
  onNavigatePatient,
}: {
  messages: MessageQueueItem[]
  loading: boolean
  onCancel: (id: string) => void
  onDisableAI: (patientId: string, patientName: string) => void
  onRetry: (id: string) => void
  onEdit: (id: string, content: string) => void
  onSendNow: (id: string) => void
  onNavigatePatient: (patientId: string) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  return (
    <div className="bg-surface border border-border rounded-xl">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Send size={18} />
          Fila de Envio
          {messages.length > 0 && (
            <span className="ml-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {messages.length}
            </span>
          )}
        </h2>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="animate-spin text-muted-foreground" size={20} />
          </div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Nenhuma mensagem pendente na fila.
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => {
              const isExpanded = expandedId === msg.id
              const statusCfg = STATUS_CONFIG[msg.status]
              const StatusIcon = statusCfg.icon
              const canCancel = msg.status === 'queued' || msg.status === 'sending'
              const scheduledDate = new Date(msg.scheduled_for)
              const patientName = msg.patient?.full_name || 'Paciente'

              return (
                <div
                  key={msg.id}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  {/* Header row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', statusCfg.className)}>
                      <StatusIcon size={12} className={msg.status === 'sending' ? 'animate-spin' : ''} />
                      {statusCfg.label}
                    </span>

                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                      {MESSAGE_TYPE_LABELS[msg.message_type]}
                    </span>

                    <span className="text-sm font-medium text-foreground truncate">
                      {patientName}
                    </span>

                    <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(msg.scheduled_for)}
                    </span>

                    {isExpanded ? <ChevronUp size={16} className="text-muted-foreground shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
                  </button>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                          {/* Message content */}
                          <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Conteúdo da mensagem</p>
                            <p className="text-sm text-foreground whitespace-pre-wrap">{msg.message_content}</p>
                          </div>

                          {/* Meta info */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Telefone: </span>
                              <span className="text-foreground">{msg.patient?.phone ? formatPhone(msg.patient.phone) : '—'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Agendado: </span>
                              <span className="text-foreground">{formatDateTime(msg.scheduled_for)}</span>
                            </div>
                            {msg.invoice && (
                              <div>
                                <span className="text-muted-foreground">Fatura: </span>
                                <span className="text-foreground capitalize">
                                  {formatMonthYear(msg.invoice.reference_month + 'T12:00:00')}
                                  {' — '}{formatCurrency(msg.invoice.total_amount)}
                                </span>
                              </div>
                            )}
                            {msg.escalation_level > 0 && (
                              <div>
                                <span className="text-muted-foreground">Nível: </span>
                                <span className="text-foreground">{msg.escalation_level}º lembrete</span>
                              </div>
                            )}
                            {msg.attempts > 0 && (
                              <div>
                                <span className="text-muted-foreground">Tentativas: </span>
                                <span className="text-foreground">{msg.attempts}/{msg.max_attempts}</span>
                              </div>
                            )}
                            {msg.last_error && (
                              <div className="col-span-2">
                                <span className="text-muted-foreground">Erro: </span>
                                <span className="text-red-600 dark:text-red-400">{msg.last_error}</span>
                              </div>
                            )}
                          </div>

                          {/* Inline edit */}
                          {editingId === msg.id && (
                            <div className="space-y-2">
                              <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                                rows={4}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    if (!editContent.trim()) return
                                    onEdit(msg.id, editContent)
                                    setEditingId(null)
                                  }}
                                  disabled={!editContent.trim()}
                                  className="h-8 px-3 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                >
                                  <Check size={14} />
                                  Salvar
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="h-8 px-3 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-1.5"
                                >
                                  <X size={14} />
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              onClick={() => onNavigatePatient(msg.patient_id)}
                              className="h-8 px-3 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-1.5"
                            >
                              <User size={14} />
                              Ver paciente
                            </button>
                            {msg.status === 'queued' && editingId !== msg.id && (
                              <button
                                onClick={() => {
                                  setEditingId(msg.id)
                                  setEditContent(msg.message_content)
                                }}
                                className="h-8 px-3 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-1.5"
                              >
                                <Pencil size={14} />
                                Editar mensagem
                              </button>
                            )}
                            {msg.status === 'queued' && new Date(msg.scheduled_for) > new Date() && (
                              <button
                                onClick={() => onSendNow(msg.id)}
                                className="h-8 px-3 text-xs font-medium rounded-lg border border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors flex items-center gap-1.5"
                              >
                                <Zap size={14} />
                                Enviar agora
                              </button>
                            )}
                            {msg.status === 'failed' && (
                              <button
                                onClick={() => onRetry(msg.id)}
                                className="h-8 px-3 text-xs font-medium rounded-lg border border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors flex items-center gap-1.5"
                              >
                                <RefreshCw size={14} />
                                Reenviar
                              </button>
                            )}
                            {canCancel && (
                              <button
                                onClick={() => onCancel(msg.id)}
                                className="h-8 px-3 text-xs font-medium rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors flex items-center gap-1.5"
                              >
                                <XCircle size={14} />
                                Cancelar envio
                              </button>
                            )}
                            {msg.patient?.ai_enabled !== false && (
                              <button
                                onClick={() => onDisableAI(msg.patient_id, patientName)}
                                className="h-8 px-3 text-xs font-medium rounded-lg border border-border hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 dark:hover:bg-amber-950 dark:hover:text-amber-400 dark:hover:border-amber-800 transition-colors flex items-center gap-1.5"
                              >
                                <BotOff size={14} />
                                Desativar IA
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
