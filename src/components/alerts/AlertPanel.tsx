import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertTriangle, Info, MessageSquare, FileImage, Wifi, Send } from 'lucide-react'
import { useAlerts, useMarkAlertRead, useResolveAlert } from '@/hooks/useAlerts'
import { formatDateTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Alert, AlertType, AlertSeverity } from '@/types'
import { ALERT_TYPE_LABELS } from '@/constants'

const ALERT_ICONS: Record<AlertType, React.ComponentType<{ size?: number; className?: string }>> = {
  payment_claimed: MessageSquare,
  receipt_review: FileImage,
  receipt_auto_confirmed: CheckCircle,
  whatsapp_disconnected: Wifi,
  message_failed: Send,
  invoice_overdue: AlertTriangle,
}

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  info: 'border-l-info bg-info/5',
  warning: 'border-l-warning bg-warning/5',
  critical: 'border-l-destructive bg-destructive/5',
}

interface AlertPanelProps {
  open: boolean
  onClose: () => void
}

export default function AlertPanel({ open, onClose }: AlertPanelProps) {
  const { data: alerts = [] } = useAlerts()
  const markRead = useMarkAlertRead()
  const resolveAlert = useResolveAlert()

  const unresolvedAlerts = alerts.filter((a) => !a.resolved_at)
  const resolvedAlerts = alerts.filter((a) => a.resolved_at).slice(0, 10)

  const handleResolve = (alertId: string, action: string) => {
    resolveAlert.mutate({ alertId, action })
  }

  const handleMarkRead = (alert: Alert) => {
    if (!alert.is_read) {
      markRead.mutate(alert.id)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-40"
          />
          <motion.div
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface border-l border-border z-50 flex flex-col"
          >
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-border">
              <h2 className="font-semibold text-foreground text-lg">Alertas</h2>
              <button
                onClick={onClose}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg active:scale-[0.93] transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {unresolvedAlerts.length === 0 && resolvedAlerts.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle className="mx-auto text-success mb-3" size={32} />
                  <p className="text-muted-foreground text-sm">Nenhum alerta pendente</p>
                </div>
              ) : (
                <>
                  {unresolvedAlerts.length > 0 && (
                    <div className="p-4">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Pendentes ({unresolvedAlerts.length})
                      </h3>
                      <div className="space-y-2">
                        {unresolvedAlerts.map((alert) => {
                          const Icon = ALERT_ICONS[alert.type] || Info
                          return (
                            <motion.div
                              key={alert.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              onClick={() => handleMarkRead(alert)}
                              className={cn(
                                'p-4 rounded-lg border-l-4 cursor-pointer transition-colors',
                                SEVERITY_STYLES[alert.severity],
                                !alert.is_read && 'ring-1 ring-primary/10'
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <Icon size={18} className="flex-shrink-0 mt-0.5 text-muted-foreground" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium text-foreground">
                                      {alert.title}
                                    </span>
                                    {!alert.is_read && (
                                      <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                                    )}
                                  </div>
                                  {alert.description && (
                                    <p className="text-xs text-muted-foreground mb-2">
                                      {alert.description}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                      {formatDateTime(alert.created_at)}
                                    </span>
                                    {alert.patient && (
                                      <span className="text-xs text-primary font-medium">
                                        {alert.patient.full_name}
                                      </span>
                                    )}
                                  </div>
                                  {/* Action buttons */}
                                  <div className="flex gap-2 mt-3">
                                    {alert.type === 'payment_claimed' && (
                                      <>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleResolve(alert.id, 'confirmed') }}
                                          className="text-xs px-3 py-1.5 bg-success/10 text-success rounded-md hover:bg-success/20 active:scale-[0.97] transition-all cursor-pointer font-medium"
                                        >
                                          Confirmar pagamento
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleResolve(alert.id, 'dismissed') }}
                                          className="text-xs px-3 py-1.5 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 active:scale-[0.97] transition-all cursor-pointer"
                                        >
                                          Dispensar
                                        </button>
                                      </>
                                    )}
                                    {alert.type === 'receipt_review' && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleResolve(alert.id, 'reviewed') }}
                                        className="text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-md hover:bg-primary/20 active:scale-[0.97] transition-all cursor-pointer font-medium"
                                      >
                                        Revisar comprovante
                                      </button>
                                    )}
                                    {(alert.type === 'whatsapp_disconnected' || alert.type === 'message_failed') && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleResolve(alert.id, 'acknowledged') }}
                                        className="text-xs px-3 py-1.5 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 active:scale-[0.97] transition-all cursor-pointer"
                                      >
                                        Entendi
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {resolvedAlerts.length > 0 && (
                    <div className="p-4 border-t border-border">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Resolvidos
                      </h3>
                      <div className="space-y-2">
                        {resolvedAlerts.map((alert) => (
                          <div
                            key={alert.id}
                            className="p-3 rounded-lg bg-muted/50 opacity-60"
                          >
                            <div className="flex items-center gap-2">
                              <CheckCircle size={14} className="text-success" />
                              <span className="text-xs text-foreground">{alert.title}</span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {ALERT_TYPE_LABELS[alert.type]}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
