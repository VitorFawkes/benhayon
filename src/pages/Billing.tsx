import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { format, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  FileText,
  CreditCard,
  Receipt,
  Eye,
  Image,
  Info,
  FileCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate, formatMonthYear } from '@/lib/formatters'
import {
  PAYMENT_METHOD_LABELS,
} from '@/constants'
import { useInvoices, useInvoice, useInvoicePreview } from '@/hooks/useInvoices'
import { useAISettings } from '@/hooks/useAISettings'
import { usePayments } from '@/hooks/usePayments'
import { useReceiptAnalyses, useConfirmReceipt, useRejectReceipt } from '@/hooks/useReceiptAnalyses'
import type { InvoiceStatus, ReceiptAnalysis, Payment } from '@/types'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { GenerateInvoices } from '@/components/billing/GenerateInvoices'
import { InvoiceCard } from '@/components/billing/InvoiceCard'
import { PaymentForm } from '@/components/billing/PaymentForm'
import { ReceiptViewer } from '@/components/billing/ReceiptViewer'
import { NotaFiscalManager } from '@/components/billing/NotaFiscalManager'

// ─── Receipt status config ───

const RECEIPT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending_review: { label: 'Pendente', color: 'bg-warning-light text-warning' },
  confirmed: { label: 'Confirmado', color: 'bg-success-light text-success' },
  rejected: { label: 'Rejeitado', color: 'bg-destructive-light text-destructive' },
}

export default function Billing() {
  // ─── State ───
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [paymentFormOpen, setPaymentFormOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [receiptViewerOpen, setReceiptViewerOpen] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptAnalysis | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Prévia: sempre referencia o mês ANTERIOR (o que será cobrado)
  const prevMonthDate = useMemo(() => subMonths(new Date(), 1), [])
  const { data: previewItems } = useInvoicePreview(prevMonthDate)
  const { data: aiSettings } = useAISettings()

  // ─── Invoice filters ───
  const invoiceFilters = useMemo(() => {
    const filters: { month: Date; status?: InvoiceStatus[] } = {
      month: currentMonth,
    }
    if (statusFilter !== 'all') {
      filters.status = [statusFilter as InvoiceStatus]
    }
    return filters
  }, [currentMonth, statusFilter])

  // ─── Queries ───
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices(invoiceFilters)
  const { data: expandedInvoiceData } = useInvoice(expandedInvoiceId ?? undefined)
  const { data: payments = [], isLoading: paymentsLoading } = usePayments({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  })

  // ─── Helpers ───
  function handlePrevMonth() {
    setCurrentMonth((prev) => subMonths(prev, 1))
  }

  function handleNextMonth() {
    setCurrentMonth((prev) => addMonths(prev, 1))
  }

  function toggleExpandInvoice(id: string) {
    setExpandedInvoiceId((prev) => (prev === id ? null : id))
  }

  // ─── Sumário do mês ───
  const monthSummary = useMemo(() => {
    const total = invoices.reduce((sum, inv) => sum + inv.total_amount, 0)
    const paid = invoices.reduce((sum, inv) => sum + inv.amount_paid, 0)
    const pending = total - paid
    const paidCount = invoices.filter((inv) => inv.status === 'paid').length
    const nfCount = invoices.filter((inv) => inv.nota_fiscal_url).length
    return { total, paid, pending, count: invoices.length, paidCount, nfCount }
  }, [invoices])

  // ─── Receipt queries & mutations ───
  const { data: receipts = [] } = useReceiptAnalyses()
  const confirmReceipt = useConfirmReceipt()
  const rejectReceipt = useRejectReceipt()

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
      </div>

      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices" className="gap-1.5">
            <FileText className="h-4 w-4" />
            Cobranças
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            <CreditCard className="h-4 w-4" />
            Pagamentos
          </TabsTrigger>
          <TabsTrigger value="receipts" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            Comprovantes
          </TabsTrigger>
          <TabsTrigger value="notas-fiscais" className="gap-1.5">
            <FileCheck className="h-4 w-4" />
            Notas Fiscais
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════
            TAB 1: COBRANÇAS
        ════════════════════════════════════ */}
        <TabsContent value="invoices" className="space-y-4">
          {/* Prévia de cobranças — mês anterior */}
          {previewItems && previewItems.length > 0 && (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <button
                onClick={() => setPreviewOpen(!previewOpen)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Info size={16} className="text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    Prévia de cobranças — Referente a{' '}
                    <span className="capitalize">{format(prevMonthDate, 'MMMM yyyy', { locale: ptBR })}</span>
                  </span>
                  <Badge className="bg-primary/10 text-primary border-0 text-xs">
                    {previewItems.filter(i => !i.already_has_invoice).length} pendente{previewItems.filter(i => !i.already_has_invoice).length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                {previewOpen ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
              </button>
              {previewOpen && (
                <div className="border-t border-border px-4 pb-4">
                  <p className="text-xs text-muted-foreground py-2">
                    Cobrança prevista para dia {aiSettings?.billing_day ?? '—'} do mês. Sessões realizadas e canceladas contam.
                  </p>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b border-border">
                          <th className="text-left py-2 font-medium">Paciente</th>
                          <th className="text-center py-2 font-medium">Sessões</th>
                          <th className="text-right py-2 font-medium">Valor/Sessão</th>
                          <th className="text-right py-2 font-medium">Total</th>
                          <th className="text-right py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewItems.map((item) => (
                          <tr key={item.patient_id} className="border-b border-border/50">
                            <td className="py-2 font-medium">{item.patient_name}</td>
                            <td className="py-2 text-center">{item.sessions_count}</td>
                            <td className="py-2 text-right">{formatCurrency(item.session_value)}</td>
                            <td className="py-2 text-right font-medium">{formatCurrency(item.total_amount)}</td>
                            <td className="py-2 text-right">
                              {item.already_has_invoice ? (
                                <Badge className="bg-success-light text-success border-0 text-xs">Já cobrado</Badge>
                              ) : (
                                <Badge className="bg-warning-light text-warning border-0 text-xs">Pendente</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center pt-2 text-xs text-muted-foreground">
                    <span>{previewItems.length} paciente{previewItems.length > 1 ? 's' : ''}</span>
                    <span className="font-semibold text-foreground">
                      Total: {formatCurrency(previewItems.reduce((s, i) => s + i.total_amount, 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            {/* Month navigator */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevMonth}
                className="h-9 w-9"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-foreground min-w-[140px] text-center capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleNextMonth}
                className="h-9 w-9"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {/* Status filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="partial">Parcial</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="overdue">Atrasado</SelectItem>
                </SelectContent>
              </Select>

              {/* Generate invoices button */}
              <Button onClick={() => setGenerateOpen(true)} size="sm">
                <Plus className="h-4 w-4" />
                Gerar Cobranças
              </Button>
            </div>
          </div>

          {/* Summary cards */}
          {!invoicesLoading && invoices.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="rounded-lg border border-border bg-surface p-3">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatCurrency(monthSummary.total)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-3">
                <p className="text-xs text-muted-foreground">Recebido</p>
                <p className="text-lg font-semibold text-success">
                  {formatCurrency(monthSummary.paid)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-3">
                <p className="text-xs text-muted-foreground">Pendente</p>
                <p className="text-lg font-semibold text-warning">
                  {formatCurrency(monthSummary.pending)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-3">
                <p className="text-xs text-muted-foreground">Cobranças</p>
                <p className="text-lg font-semibold text-foreground">
                  {monthSummary.paidCount}/{monthSummary.count}{' '}
                  <span className="text-xs font-normal text-muted-foreground">pagas</span>
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-3">
                <p className="text-xs text-muted-foreground">Notas Fiscais</p>
                <p className={cn(
                  'text-lg font-semibold',
                  monthSummary.nfCount === monthSummary.count && monthSummary.count > 0
                    ? 'text-success'
                    : monthSummary.nfCount > 0
                      ? 'text-warning'
                      : 'text-muted-foreground'
                )}>
                  {monthSummary.nfCount}/{monthSummary.count}{' '}
                  <span className="text-xs font-normal text-muted-foreground">anexadas</span>
                </p>
              </div>
            </div>
          )}

          {/* Invoice list */}
          {invoicesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl p-8 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                Nenhuma cobrança para este mês
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setGenerateOpen(true)}
              >
                Gerar Cobranças
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  payments={
                    expandedInvoiceId === invoice.id && expandedInvoiceData
                      ? (expandedInvoiceData as unknown as { payments: Payment[] }).payments
                      : []
                  }
                  expanded={expandedInvoiceId === invoice.id}
                  onToggleExpand={() => toggleExpandInvoice(invoice.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ════════════════════════════════════
            TAB 2: PAGAMENTOS
        ════════════════════════════════════ */}
        <TabsContent value="payments" className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground whitespace-nowrap">De</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 w-[150px]"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Até</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 w-[150px]"
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom('')
                    setDateTo('')
                  }}
                  className="text-xs"
                >
                  Limpar
                </Button>
              )}
            </div>

            <Button onClick={() => setPaymentFormOpen(true)} size="sm">
              <Plus className="h-4 w-4" />
              Registrar Pagamento
            </Button>
          </div>

          {/* Payments table */}
          {paymentsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl p-8 text-center">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                Nenhum pagamento encontrado
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setPaymentFormOpen(true)}
              >
                Registrar Pagamento
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Cobrança</TableHead>
                    <TableHead className="text-center">Comprovante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-sm">
                        {formatDate(payment.payment_date)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {payment.patient?.full_name ?? '---'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {payment.invoice ? (
                          <span className="capitalize">
                            {formatMonthYear(payment.invoice.reference_month + 'T12:00:00')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">---</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {payment.receipt_url ? (
                          <a
                            href={payment.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            title="Ver comprovante"
                          >
                            <Image className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground/30">---</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ════════════════════════════════════
            TAB 3: COMPROVANTES
        ════════════════════════════════════ */}
        <TabsContent value="receipts" className="space-y-4">
          {receipts.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl p-8 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-1">
                Nenhum comprovante para revisão
              </p>
              <p className="text-xs text-muted-foreground">
                Comprovantes enviados pelos pacientes via WhatsApp aparecerão aqui para revisão após processamento pela IA.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead className="text-right">Valor Extraído</TableHead>
                    <TableHead className="text-center">Confiança</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((receipt) => {
                    const statusConfig =
                      RECEIPT_STATUS_CONFIG[receipt.status] ??
                      RECEIPT_STATUS_CONFIG.pending_review
                    const confidencePercent = Math.round(
                      receipt.confidence_score * 100
                    )

                    return (
                      <TableRow key={receipt.id}>
                        <TableCell className="text-sm">
                          {formatDate(receipt.created_at)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {receipt.patient?.full_name ?? '---'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {receipt.extracted_amount
                            ? formatCurrency(receipt.extracted_amount)
                            : '---'}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
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
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={cn('text-xs', statusConfig.color)}
                          >
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedReceipt(receipt)
                              setReceiptViewerOpen(true)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                            Revisar
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ════════════════════════════════════
            TAB 4: NOTAS FISCAIS
        ════════════════════════════════════ */}
        <TabsContent value="notas-fiscais" className="space-y-4">
          <NotaFiscalManager />
        </TabsContent>
      </Tabs>

      {/* ─── Dialogs ─── */}
      <GenerateInvoices open={generateOpen} onOpenChange={setGenerateOpen} />
      <PaymentForm open={paymentFormOpen} onOpenChange={setPaymentFormOpen} />
      <ReceiptViewer
        open={receiptViewerOpen}
        onOpenChange={setReceiptViewerOpen}
        receipt={selectedReceipt}
        onConfirm={async (receipt) => {
          await confirmReceipt.mutateAsync(receipt)
        }}
        onReject={async (receipt) => {
          await rejectReceipt.mutateAsync(receipt)
        }}
      />
    </motion.div>
  )
}
