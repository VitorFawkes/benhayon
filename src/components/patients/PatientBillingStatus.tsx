import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Send,
  CheckCircle,
  AlertCircle,
  Clock,
  Bell,
  RefreshCw,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatMonthYear, formatCurrency } from '@/lib/formatters'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { usePatientBillingStatus, useResendBilling } from '@/hooks/useInvoices'

interface PatientBillingStatusProps {
  patientId: string
}

export default function PatientBillingStatus({ patientId }: PatientBillingStatusProps) {
  const { data, isLoading } = usePatientBillingStatus(patientId)
  const resend = useResendBilling()
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="h-24 bg-surface border border-border rounded-xl animate-pulse" />
    )
  }

  if (!data?.invoice) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 shadow-soft">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span className="text-sm">Nenhuma cobranca gerada para este paciente.</span>
        </div>
      </div>
    )
  }

  const { invoice, billingMessagesSent, reminderMessagesSent, lastBillingContent } = data
  const isSent = !!invoice.sent_at
  const isPaid = invoice.status === 'paid'
  const canResend = !isPaid && !!lastBillingContent

  const handleResend = async () => {
    if (!lastBillingContent) return
    try {
      await resend.mutateAsync({
        invoiceId: invoice.id,
        patientId: invoice.patient_id,
        messageContent: lastBillingContent,
      })
      toast.success('Cobranca enfileirada para reenvio.')
      setConfirmOpen(false)
    } catch {
      toast.error('Erro ao reenviar cobranca.')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-surface border border-border rounded-xl p-4 shadow-soft"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">
          Ultima cobranca
        </h3>
        <Badge className={cn('text-xs', INVOICE_STATUS_COLORS[invoice.status])}>
          {INVOICE_STATUS_LABELS[invoice.status]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Mes de referencia */}
        <div className="flex items-start gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <FileText className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Referencia</p>
            <p className="text-xs font-medium text-foreground capitalize">
              {formatMonthYear(invoice.reference_month)}
            </p>
          </div>
        </div>

        {/* Status de envio */}
        <div className="flex items-start gap-2">
          <div className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            isSent ? 'bg-success/10' : 'bg-warning/10'
          )}>
            {isSent ? (
              <CheckCircle className="h-3.5 w-3.5 text-success" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-warning" />
            )}
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Cobranca</p>
            <p className={cn(
              'text-xs font-medium',
              isSent ? 'text-success' : 'text-warning'
            )}>
              {isSent ? `Enviada ${formatDate(invoice.sent_at!)}` : 'Nao enviada'}
            </p>
          </div>
        </div>

        {/* Valor */}
        <div className="flex items-start gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Vencimento</p>
            <p className="text-xs font-medium text-foreground">
              {formatDate(invoice.due_date)}
            </p>
          </div>
        </div>

        {/* Lembretes */}
        <div className="flex items-start gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Mensagens</p>
            <p className="text-xs font-medium text-foreground">
              {billingMessagesSent} cobranca{billingMessagesSent !== 1 ? 's' : ''} · {reminderMessagesSent} lembrete{reminderMessagesSent !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Botao de reenvio */}
      {canResend && (
        <div className="mt-3 pt-3 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setConfirmOpen(true)}
            disabled={resend.isPending}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', resend.isPending && 'animate-spin')} />
            Reenviar cobranca
          </Button>
        </div>
      )}

      {/* Dialog de confirmacao */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reenviar cobranca</DialogTitle>
            <DialogDescription>
              A cobranca de{' '}
              <span className="font-medium text-foreground">
                {formatCurrency(invoice.total_amount)}
              </span>
              {' '}referente a{' '}
              <span className="font-medium text-foreground capitalize">
                {formatMonthYear(invoice.reference_month)}
              </span>
              {' '}sera reenviada via WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleResend}
              disabled={resend.isPending}
              className="gap-1.5"
            >
              <Send className="h-4 w-4" />
              {resend.isPending ? 'Enviando...' : 'Confirmar reenvio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
