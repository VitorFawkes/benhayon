import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown, FileCheck, FileX, Upload, Eye, RefreshCw, Trash2, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS, PAYMENT_METHOD_LABELS } from '@/constants'
import { useUploadNotaFiscal, useDeleteNotaFiscal } from '@/hooks/useNotaFiscal'
import type { Invoice, Payment } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface InvoiceCardProps {
  invoice: Invoice
  payments?: Payment[]
  expanded?: boolean
  onToggleExpand?: () => void
}

export function InvoiceCard({
  invoice,
  payments = [],
  expanded = false,
  onToggleExpand,
}: InvoiceCardProps) {
  const remaining = invoice.total_amount - invoice.amount_paid
  const progressPercent =
    invoice.total_amount > 0
      ? Math.min((invoice.amount_paid / invoice.total_amount) * 100, 100)
      : 0

  const uploadNF = useUploadNotaFiscal()
  const deleteNF = useDeleteNotaFiscal()
  const [isUploading, setIsUploading] = useState(false)
  const hasNF = !!invoice.nota_fiscal_url

  const handleUpload = async (file: File) => {
    setIsUploading(true)
    try {
      await uploadNF.mutateAsync({
        file,
        invoiceId: invoice.id,
        patientId: invoice.patient_id,
        existingUrl: invoice.nota_fiscal_url,
      })
      toast.success('Nota fiscal anexada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao anexar nota fiscal')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!invoice.nota_fiscal_url) return
    try {
      await deleteNF.mutateAsync({ invoiceId: invoice.id, url: invoice.nota_fiscal_url })
      toast.success('Nota fiscal removida')
    } catch {
      toast.error('Erro ao remover nota fiscal')
    }
  }

  const triggerFileInput = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp,application/pdf'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) handleUpload(file)
    }
    input.click()
  }

  return (
    <div className="border border-border rounded-lg bg-surface overflow-hidden">
      {/* Linha principal */}
      <button
        type="button"
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-surface-hover active:bg-muted/50 transition-all cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">
            {invoice.patient?.full_name ?? 'Paciente'}
          </p>
          <p className="text-xs text-muted-foreground capitalize">
            {format(new Date(invoice.reference_month + 'T12:00:00'), 'MMMM yyyy', {
              locale: ptBR,
            })}
          </p>
        </div>

        <div className="hidden sm:block text-center min-w-[60px]">
          <p className="text-sm font-medium text-foreground">
            {invoice.total_sessions}
          </p>
          <p className="text-xs text-muted-foreground">
            {invoice.total_sessions === 1 ? 'sessão' : 'sessões'}
          </p>
        </div>

        <div className="hidden sm:block text-right min-w-[90px]">
          <p className="text-sm font-medium text-foreground">
            {formatCurrency(invoice.total_amount)}
          </p>
          <p className="text-xs text-muted-foreground">total</p>
        </div>

        <div className="text-right min-w-[90px]">
          <p className="text-sm font-medium text-foreground">
            {formatCurrency(invoice.amount_paid)}
          </p>
          <p className="text-xs text-muted-foreground">
            {remaining > 0
              ? `falta ${formatCurrency(remaining)}`
              : 'quitado'}
          </p>
        </div>

        {/* NF indicator */}
        <div className="hidden sm:flex shrink-0" title={hasNF ? 'Nota fiscal anexada' : 'Sem nota fiscal'}>
          {hasNF ? (
            <FileCheck className="h-4 w-4 text-success" />
          ) : (
            <FileX className="h-4 w-4 text-muted-foreground/40" />
          )}
        </div>

        <Badge
          className={cn(
            'text-xs whitespace-nowrap',
            INVOICE_STATUS_COLORS[invoice.status]
          )}
        >
          {INVOICE_STATUS_LABELS[invoice.status]}
        </Badge>

        <motion.span
          className="text-muted-foreground"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      {/* Barra de progresso */}
      <div className="px-4 pb-1">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              invoice.status === 'paid'
                ? 'bg-success'
                : invoice.status === 'overdue'
                  ? 'bg-destructive'
                  : 'bg-primary'
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Detalhes expandidos */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Pagamentos
              </p>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Nenhum pagamento registrado.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-surface"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          {formatDate(payment.payment_date)}
                        </span>
                        <span className="text-foreground font-medium">
                          {formatCurrency(payment.amount)}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                <span className="text-muted-foreground">Vencimento</span>
                <span className="text-foreground">
                  {formatDate(invoice.due_date)}
                </span>
              </div>
              {invoice.sent_at && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cobrança enviada</span>
                  <span className="text-foreground">
                    {formatDate(invoice.sent_at)}
                  </span>
                </div>
              )}

              {/* Nota Fiscal section */}
              <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                <span className="text-muted-foreground">Nota fiscal</span>
                <div className="flex items-center gap-2">
                  {hasNF ? (
                    <>
                      <span className="text-xs text-success font-medium truncate max-w-[150px]">
                        {invoice.nota_fiscal_name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => window.open(invoice.nota_fiscal_url!, '_blank')}
                        title="Ver"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        onClick={triggerFileInput}
                        disabled={isUploading}
                        title="Trocar"
                      >
                        {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={handleDelete}
                        disabled={deleteNF.isPending}
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-7"
                      onClick={triggerFileInput}
                      disabled={isUploading}
                    >
                      {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      Anexar NF
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
