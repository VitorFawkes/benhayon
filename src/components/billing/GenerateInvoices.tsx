import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { CalendarDays, CheckCircle2, FileText, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { useInvoicePreview, useGenerateInvoices } from '@/hooks/useInvoices'
import type { InvoicePreviewItem } from '@/hooks/useInvoices'
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
      toast.success(
        `${selectedItems.length} cobranca${selectedItems.length > 1 ? 's' : ''} gerada${selectedItems.length > 1 ? 's' : ''} com sucesso!`
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
              ? 'Selecione o mês de referência para visualizar as sessões realizadas.'
              : 'Confirme a geração das cobranças abaixo.'}
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
                      {filteredItems.map((item) => (
                        <TableRow key={item.patient_id}>
                          <TableCell className="font-medium">
                            {item.patient_name}
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
                      ))}
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
                      {item.sessions_count} sessão{item.sessions_count > 1 ? 'ões' : ''} &middot;{' '}
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
