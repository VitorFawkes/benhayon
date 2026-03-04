import { useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  Calendar,
  DollarSign,
  CreditCard,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { PAYMENT_METHOD_LABELS } from '@/constants'
import type { ReceiptAnalysis } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

// ─── Status config ───

const RECEIPT_STATUS_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  pending_review: {
    label: 'Pendente',
    color: 'bg-warning-light text-warning',
  },
  confirmed: {
    label: 'Confirmado',
    color: 'bg-success-light text-success',
  },
  rejected: {
    label: 'Rejeitado',
    color: 'bg-destructive-light text-destructive',
  },
}

interface ReceiptViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  receipt: ReceiptAnalysis | null
  onConfirm?: (receipt: ReceiptAnalysis) => Promise<void>
  onReject?: (receipt: ReceiptAnalysis) => Promise<void>
}

export function ReceiptViewer({
  open,
  onOpenChange,
  receipt,
  onConfirm,
  onReject,
}: ReceiptViewerProps) {
  const [confirming, setConfirming] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  if (!receipt) return null

  const statusConfig = RECEIPT_STATUS_CONFIG[receipt.status] ?? RECEIPT_STATUS_CONFIG.pending_review
  const confidencePercent = Math.round(receipt.confidence_score * 100)

  async function handleConfirm() {
    if (!onConfirm || !receipt) return
    setConfirming(true)
    try {
      await onConfirm(receipt)
      toast.success('Comprovante confirmado e pagamento registrado!')
      onOpenChange(false)
    } catch {
      toast.error('Erro ao confirmar comprovante.')
    } finally {
      setConfirming(false)
    }
  }

  async function handleReject() {
    if (!onReject || !receipt) return
    setRejecting(true)
    try {
      await onReject(receipt)
      toast.success('Comprovante rejeitado.')
      onOpenChange(false)
    } catch {
      toast.error('Erro ao rejeitar comprovante.')
    } finally {
      setRejecting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Comprovante de Pagamento
          </DialogTitle>
          <DialogDescription>
            Visualize e revise o comprovante enviado pelo paciente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Imagem do comprovante */}
          <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
            {receipt.media_url ? (
              <img
                src={receipt.media_url}
                alt="Comprovante de pagamento"
                className="w-full max-h-[400px] object-contain"
              />
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Imagem não disponível
              </div>
            )}
          </div>

          {/* Dados extraídos pela IA */}
          <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                Dados Extraídos (IA)
              </p>
              <Badge className={cn('text-xs', statusConfig.color)}>
                {statusConfig.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Valor */}
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="text-sm font-medium text-foreground">
                    {receipt.extracted_amount
                      ? formatCurrency(receipt.extracted_amount)
                      : '---'}
                  </p>
                </div>
              </div>

              {/* Data */}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Data</p>
                  <p className="text-sm font-medium text-foreground">
                    {receipt.extracted_date
                      ? formatDate(receipt.extracted_date)
                      : '---'}
                  </p>
                </div>
              </div>

              {/* Método */}
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Método</p>
                  <p className="text-sm font-medium text-foreground">
                    {receipt.extracted_method
                      ? (PAYMENT_METHOD_LABELS[receipt.extracted_method] ?? receipt.extracted_method)
                      : '---'}
                  </p>
                </div>
              </div>

              {/* Confiança */}
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Confiança</p>
                  <div className="flex items-center gap-2">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        confidencePercent >= 80
                          ? 'text-success'
                          : confidencePercent >= 50
                            ? 'text-warning'
                            : 'text-destructive'
                      )}
                    >
                      {confidencePercent}%
                    </p>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[80px]">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          confidencePercent >= 80
                            ? 'bg-success'
                            : confidencePercent >= 50
                              ? 'bg-warning'
                              : 'bg-destructive'
                        )}
                        style={{ width: `${confidencePercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pagador */}
            {receipt.extracted_payer && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">Pagador identificado</p>
                <p className="text-sm text-foreground">{receipt.extracted_payer}</p>
              </div>
            )}

            {/* ID da transação */}
            {receipt.extracted_transaction_id && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">ID da transação</p>
                <p className="text-sm text-foreground font-mono">
                  {receipt.extracted_transaction_id}
                </p>
              </div>
            )}

            {/* Paciente vinculado */}
            {receipt.patient && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">Paciente vinculado</p>
                <p className="text-sm text-foreground">{receipt.patient.full_name}</p>
              </div>
            )}
          </div>

          {/* Notas do revisor */}
          {receipt.reviewer_notes && (
            <div className="rounded-lg border border-border bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground mb-1">
                Notas da revisão
              </p>
              <p className="text-sm text-foreground">{receipt.reviewer_notes}</p>
            </div>
          )}
        </div>

        {/* Ações: apenas se pendente */}
        {receipt.status === 'pending_review' && (onConfirm || onReject) && (
          <DialogFooter className="gap-2 sm:gap-0">
            {onReject && (
              <Button
                variant="outline"
                onClick={handleReject}
                disabled={rejecting || confirming}
                className="text-destructive hover:text-destructive"
              >
                {rejecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Rejeitando...
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    Rejeitar
                  </>
                )}
              </Button>
            )}
            {onConfirm && (
              <Button
                onClick={handleConfirm}
                disabled={confirming || rejecting}
              >
                {confirming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirmando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirmar Pagamento
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
