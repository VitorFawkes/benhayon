import { useState, useMemo, useRef, useCallback } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  FileCheck,
  FileX,
  Eye,
  Trash2,
  RefreshCw,
  X,
  FileUp,
  Loader2,
  Phone,
  FileImage,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { useInvoices } from '@/hooks/useInvoices'
import { useUploadNotaFiscal, useBulkUploadNotasFiscais, useDeleteNotaFiscal } from '@/hooks/useNotaFiscal'
import type { Invoice } from '@/types'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

// ─── Types ───

interface FileAssignment {
  file: File
  invoiceId: string | null
  previewUrl: string | null
}

type NfFilter = 'all' | 'pending' | 'attached'

const NF_FILTER_LABELS: Record<NfFilter, string> = {
  all: 'Todos',
  pending: 'Sem NF',
  attached: 'Com NF',
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 13) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  }
  return phone
}

export function NotaFiscalManager() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [nfFilter, setNfFilter] = useState<NfFilter>('all')
  const [bulkMode, setBulkMode] = useState(false)
  const [fileAssignments, setFileAssignments] = useState<FileAssignment[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const bulkInputRef = useRef<HTMLInputElement>(null)

  const { data: invoices = [], isLoading } = useInvoices({ month: currentMonth })
  const uploadNF = useUploadNotaFiscal()
  const bulkUpload = useBulkUploadNotasFiscais()
  const deleteNF = useDeleteNotaFiscal()

  // Summary
  const summary = useMemo(() => {
    const total = invoices.length
    const withNF = invoices.filter((i) => i.nota_fiscal_url).length
    return { total, withNF, withoutNF: total - withNF }
  }, [invoices])

  // Filtered list
  const filteredInvoices = useMemo(() => {
    if (nfFilter === 'pending') return invoices.filter((i) => !i.nota_fiscal_url)
    if (nfFilter === 'attached') return invoices.filter((i) => !!i.nota_fiscal_url)
    return invoices
  }, [invoices, nfFilter])

  // Invoices without NF (for bulk assign dropdown)
  const invoicesWithoutNF = useMemo(
    () => invoices.filter((i) => !i.nota_fiscal_url),
    [invoices]
  )

  // ─── Individual Upload ───

  const [uploadingInvoiceId, setUploadingInvoiceId] = useState<string | null>(null)

  const handleIndividualUpload = useCallback(
    async (invoice: Invoice, file: File) => {
      setUploadingInvoiceId(invoice.id)
      try {
        await uploadNF.mutateAsync({
          file,
          invoiceId: invoice.id,
          patientId: invoice.patient_id,
          existingUrl: invoice.nota_fiscal_url,
        })
        toast.success(`Nota fiscal anexada para ${invoice.patient?.full_name}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao anexar nota fiscal')
      } finally {
        setUploadingInvoiceId(null)
      }
    },
    [uploadNF]
  )

  // ─── Bulk Upload ───

  const handleBulkFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setFileAssignments(
      files.map((file) => ({
        file,
        invoiceId: null,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      }))
    )
    setBulkMode(true)
    e.target.value = ''
  }

  const handleAssign = (index: number, invoiceId: string) => {
    setFileAssignments((prev) =>
      prev.map((fa, i) => (i === index ? { ...fa, invoiceId } : fa))
    )
  }

  const handleRemoveFile = (index: number) => {
    setFileAssignments((prev) => {
      const removed = prev[index]
      if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleBulkConfirm = async () => {
    const validItems = fileAssignments.filter((fa) => fa.invoiceId)
    if (validItems.length === 0) {
      toast.error('Associe pelo menos um arquivo a um paciente.')
      return
    }

    const items = validItems.map((fa) => {
      const invoice = invoices.find((i) => i.id === fa.invoiceId)!
      return {
        file: fa.file,
        invoiceId: fa.invoiceId!,
        patientId: invoice.patient_id,
        existingUrl: invoice.nota_fiscal_url,
      }
    })

    try {
      const result = await bulkUpload.mutateAsync(items)
      toast.success(`${result.successCount} nota${result.successCount !== 1 ? 's' : ''} fiscal${result.successCount !== 1 ? 'is' : ''} anexada${result.successCount !== 1 ? 's' : ''}`)
      // Cleanup preview URLs
      fileAssignments.forEach((fa) => {
        if (fa.previewUrl) URL.revokeObjectURL(fa.previewUrl)
      })
      setBulkMode(false)
      setFileAssignments([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro no upload em lote')
    }
  }

  const handleCancelBulk = () => {
    fileAssignments.forEach((fa) => {
      if (fa.previewUrl) URL.revokeObjectURL(fa.previewUrl)
    })
    setBulkMode(false)
    setFileAssignments([])
  }

  // ─── Delete ───

  const handleDelete = async () => {
    if (!deleteTarget?.nota_fiscal_url) return
    try {
      await deleteNF.mutateAsync({
        invoiceId: deleteTarget.id,
        url: deleteTarget.nota_fiscal_url,
      })
      toast.success('Nota fiscal removida')
      setDeleteTarget(null)
    } catch {
      toast.error('Erro ao remover nota fiscal')
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Month navigator */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth((p) => subMonths(p, 1))} className="h-9 w-9">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground min-w-[140px] text-center capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth((p) => addMonths(p, 1))} className="h-9 w-9">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter buttons */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(Object.keys(NF_FILTER_LABELS) as NfFilter[]).map((key) => (
              <button
                key={key}
                onClick={() => setNfFilter(key)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  nfFilter === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface text-muted-foreground hover:bg-muted/50'
                )}
              >
                {NF_FILTER_LABELS[key]}
                {key === 'pending' && summary.withoutNF > 0 && (
                  <span className="ml-1 text-[10px] opacity-80">({summary.withoutNF})</span>
                )}
              </button>
            ))}
          </div>

          <input
            ref={bulkInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="hidden"
            onChange={handleBulkFilesSelected}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => bulkInputRef.current?.click()}
          >
            <FileUp className="h-4 w-4" />
            Upload em Lote
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      {!isLoading && invoices.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center gap-1.5">
            <FileCheck className="h-4 w-4 text-success" />
            <span className="text-sm font-medium text-success">{summary.withNF}</span>
          </div>
          <span className="text-sm text-muted-foreground">de</span>
          <span className="text-sm font-medium text-foreground">{summary.total}</span>
          <span className="text-sm text-muted-foreground">
            notas fiscais anexadas para{' '}
            <span className="capitalize">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
          </span>
          {summary.withoutNF > 0 && (
            <Badge className="bg-warning-light text-warning border-0 text-xs ml-auto">
              {summary.withoutNF} pendente{summary.withoutNF !== 1 ? 's' : ''}
            </Badge>
          )}
          {summary.withoutNF === 0 && summary.total > 0 && (
            <Badge className="bg-success-light text-success border-0 text-xs ml-auto">
              Tudo pronto
            </Badge>
          )}
        </div>
      )}

      {/* Bulk Upload Assignment Panel */}
      <AnimatePresence>
        {bulkMode && fileAssignments.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Associar arquivos aos pacientes ({fileAssignments.length} arquivo{fileAssignments.length !== 1 ? 's' : ''})
                </h3>
                <Button variant="ghost" size="sm" onClick={handleCancelBulk}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {fileAssignments.map((fa, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 rounded-lg bg-surface border border-border p-2.5"
                  >
                    {/* File preview/icon */}
                    {fa.previewUrl ? (
                      <img
                        src={fa.previewUrl}
                        alt={fa.file.name}
                        className="h-10 w-10 rounded object-cover shrink-0 border border-border"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {fa.file.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {fa.file.type === 'application/pdf' ? 'PDF' : 'Imagem'} · {(fa.file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <Select
                      value={fa.invoiceId || ''}
                      onValueChange={(v) => handleAssign(index, v)}
                    >
                      <SelectTrigger className="w-[250px] h-9">
                        <SelectValue placeholder="Selecionar paciente..." />
                      </SelectTrigger>
                      <SelectContent>
                        {invoicesWithoutNF.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.patient?.full_name} — {formatCurrency(inv.total_amount)}
                          </SelectItem>
                        ))}
                        {invoices
                          .filter((i) => i.nota_fiscal_url)
                          .map((inv) => (
                            <SelectItem key={inv.id} value={inv.id}>
                              {inv.patient?.full_name} — {formatCurrency(inv.total_amount)} (trocar)
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveFile(index)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={handleCancelBulk}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={handleBulkConfirm}
                  disabled={bulkUpload.isPending || fileAssignments.every((fa) => !fa.invoiceId)}
                >
                  {bulkUpload.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {bulkUpload.isPending
                    ? 'Enviando...'
                    : `Confirmar Upload (${fileAssignments.filter((fa) => fa.invoiceId).length})`}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invoice list with NF status */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-surface border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <FileX className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhuma cobrança para este mês</p>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-6 text-center">
          <FileCheck className="h-8 w-8 text-success mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {nfFilter === 'pending'
              ? 'Todas as notas fiscais já foram anexadas!'
              : 'Nenhuma cobrança com nota fiscal anexada neste mês'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredInvoices.map((invoice) => {
            const hasNF = !!invoice.nota_fiscal_url
            const isUploading = uploadingInvoiceId === invoice.id

            return (
              <div
                key={invoice.id}
                className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg bg-surface hover:bg-surface-hover transition-colors"
              >
                {/* NF status icon */}
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    hasNF ? 'bg-success/10' : 'bg-muted'
                  )}
                >
                  {hasNF ? (
                    <FileCheck className="h-4 w-4 text-success" />
                  ) : (
                    <FileX className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {/* Patient info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {invoice.patient?.full_name ?? 'Paciente'}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatCurrency(invoice.total_amount)}</span>
                    <span>·</span>
                    <span>{invoice.total_sessions} sessão{invoice.total_sessions !== 1 ? 'es' : ''}</span>
                    {invoice.patient?.phone && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <Phone className="h-3 w-3" />
                          {formatPhone(invoice.patient.phone)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* NF status badge with upload date */}
                {hasNF ? (
                  <div className="text-right shrink-0">
                    <Badge className="bg-success-light text-success border-0 text-xs">
                      Anexada
                    </Badge>
                    {invoice.nota_fiscal_uploaded_at && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDate(invoice.nota_fiscal_uploaded_at, 'dd/MM HH:mm')}
                      </p>
                    )}
                  </div>
                ) : (
                  <Badge className="bg-warning-light text-warning border-0 text-xs shrink-0">
                    Pendente
                  </Badge>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {hasNF ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => window.open(invoice.nota_fiscal_url!, '_blank')}
                        title="Ver nota fiscal"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        title="Trocar nota fiscal"
                        disabled={isUploading}
                        onClick={() => {
                          const input = document.createElement('input')
                          input.type = 'file'
                          input.accept = 'image/jpeg,image/png,image/webp,application/pdf'
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0]
                            if (file) handleIndividualUpload(invoice, file)
                          }
                          input.click()
                        }}
                      >
                        {isUploading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="Remover nota fiscal"
                        onClick={() => setDeleteTarget(invoice)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      disabled={isUploading}
                      onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = 'image/jpeg,image/png,image/webp,application/pdf'
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0]
                          if (file) handleIndividualUpload(invoice, file)
                        }
                        input.click()
                      }}
                    >
                      {isUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      Anexar NF
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Hint text */}
      {!isLoading && invoices.length > 0 && (
        <p className="text-[11px] text-muted-foreground/60 text-center">
          As notas fiscais são enviadas automaticamente via WhatsApp junto com a mensagem de cobrança.
        </p>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Remover nota fiscal</DialogTitle>
            <DialogDescription>
              A nota fiscal de{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.patient?.full_name}
              </span>{' '}
              será removida. Se a cobrança for reenviada, não terá nota fiscal anexada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteNF.isPending}
              className="gap-1.5"
            >
              {deleteNF.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
