import { useState, Fragment } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { CalendarDays, CheckCircle2, FileText, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { useInvoicePreview, useGenerateInvoices } from '@/hooks/useInvoices'
import type { InvoicePreviewItem } from '@/hooks/useInvoices'
import { Badge } from '@/components/ui/badge'
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS } from '@/constants'
import type { AppointmentStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

interface GenerateInvoicesProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GenerateInvoices({ open, onOpenChange }: GenerateInvoicesProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date())
  const [onlyNew, setOnlyNew] = useState(true)
  const [selectedItems, setSelectedItems] = useState<InvoicePreviewItem[]>([])
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(new Set())

  const { data: previewItems, isLoading: previewLoading } = useInvoicePreview(
    open ? selectedMonth : null
  )
  const generateMutation = useGenerateInvoices()

  const filteredItems = (previewItems || []).filter(
    (item) => !onlyNew || !item.already_has_invoice
  )

  const totalAmount = filteredItems.reduce((sum, item) => sum + item.total_amount, 0)

  function handleMonthChange(value: string) {
    const [year, month] = value.split('-').map(Number)
    setSelectedMonth(new Date(year, month - 1, 1))
  }

  function handleAdvanceToConfirm() {
    setSelectedItems(filteredItems)
    setStep(2)
  }

  async function handleConfirm() {
    try {
      await generateMutation.mutateAsync({
        items: selectedItems,
        referenceMonth: selectedMonth,
      })
      const totalSessions = selectedItems.reduce((sum, item) => sum + item.sessions_count, 0)
      const totalValue = selectedItems.reduce((sum, item) => sum + item.total_amount, 0)
      toast.success(
        `${selectedItems.length} cobrança${selectedItems.length > 1 ? 's' : ''} gerada${selectedItems.length > 1 ? 's' : ''} — ${totalSessions} sessões, total ${formatCurrency(totalValue)}`
      )
      handleClose()
    } catch (error) {
      toast.error('Erro ao gerar cobranças. Tente novamente.')
    }
  }

  function handleClose() {
    setStep(1)
    setSelectedItems([])
    setOnlyNew(true)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Gerar Cobranças
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Selecione o mês de referência das sessões que serão cobradas.'
              : `Confirme a geração de ${selectedItems.length} cobrança${selectedItems.length > 1 ? 's' : ''} — total de ${formatCurrency(selectedItems.reduce((s, i) => s + i.total_amount, 0))}.`}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Seletor de mês */}
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <Label htmlFor="reference-month">Mês de referência</Label>
                  <Input
                    id="reference-month"
                    type="month"
                    value={format(selectedMonth, 'yyyy-MM')}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>

              {/* Checkbox: apenas pacientes sem cobrança */}
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyNew}
                  onChange={(e) => setOnlyNew(e.target.checked)}
                  className="rounded border-input h-4 w-4 text-primary focus:ring-primary"
                />
                Apenas pacientes sem cobrança neste mês
              </label>

              {/* Tabela de preview */}
              {previewLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma sessão realizada encontrada para{' '}
                    <span className="font-medium capitalize">
                      {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}
                    </span>
                  </p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Paciente</TableHead>
                        <TableHead className="text-center">Sessões</TableHead>
                        <TableHead className="text-right">Valor/Sessão</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Vencimento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => {
                        const isExpanded = expandedPatients.has(item.patient_id)
                        return (
                          <Fragment key={item.patient_id}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                setExpandedPatients((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(item.patient_id)) next.delete(item.patient_id)
                                  else next.add(item.patient_id)
                                  return next
                                })
                              }}
                            >
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-1.5">
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  {item.patient_name}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                {item.sessions_count}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(item.session_value)}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(item.total_amount)}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {format(new Date(item.due_date + 'T12:00:00'), 'dd/MM/yyyy')}
                              </TableCell>
                            </TableRow>
                            {isExpanded && item.sessions.sort((a, b) => a.date.localeCompare(b.date)).map((s, i) => (
                              <TableRow key={`${item.patient_id}-${i}`} className="bg-muted/20">
                                <TableCell className="pl-10 text-sm text-muted-foreground" colSpan={2}>
                                  {formatDate(s.date)}
                                </TableCell>
                                <TableCell colSpan={3}>
                                  <Badge className={`border-0 ${APPOINTMENT_STATUS_COLORS[s.status as AppointmentStatus]}`}>
                                    {APPOINTMENT_STATUS_LABELS[s.status as AppointmentStatus]}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-sm text-muted-foreground">
                      {filteredItems.length} paciente{filteredItems.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-sm font-semibold">
                      Total: {formatCurrency(totalAmount)}
                    </span>
                  </div>
                </>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleAdvanceToConfirm}
                  disabled={filteredItems.length === 0 || previewLoading}
                >
                  Continuar
                </Button>
              </DialogFooter>
            </motion.div>
          ) : (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-primary mx-auto" />
                <p className="text-base font-medium text-foreground">
                  Gerar {selectedItems.length} cobrança{selectedItems.length > 1 ? 's' : ''} no valor total de{' '}
                  {formatCurrency(totalAmount)}?
                </p>
                <p className="text-sm text-muted-foreground capitalize">
                  Referência: {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}
                </p>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1">
                {selectedItems.map((item) => (
                  <div
                    key={item.patient_id}
                    className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/50"
                  >
                    <span className="text-foreground">{item.patient_name}</span>
                    <span className="text-muted-foreground">
                      {item.sessions_count} {item.sessions_count > 1 ? 'sessões' : 'sessão'} &middot;{' '}
                      {formatCurrency(item.total_amount)}
                    </span>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(1)}>
                  Voltar
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    'Confirmar e Gerar'
                  )}
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
