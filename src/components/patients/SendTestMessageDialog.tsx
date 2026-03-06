import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MessageSquare, Send, Loader2, Info, Eye, Code2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useAISettings } from '@/hooks/useAISettings'
import { TEMPLATE_VARIABLES } from '@/constants'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SendTestMessageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  patientName: string
  patientPhone: string
  sessionValue: number
}

type MessageType = 'billing' | 'reminder' | 'appointment_reminder'

const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  billing: 'Cobrança',
  reminder: 'Lembrete de pagamento',
  appointment_reminder: 'Lembrete de sessão',
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return result
}

// ─── Template with clickable placeholder chips ───

function TemplateWithChips({
  template,
  variables,
  selectedVar,
  onSelectVar,
}: {
  template: string
  variables: Record<string, string>
  selectedVar: string | null
  onSelectVar: (key: string | null) => void
}) {
  const parts = template.split(/(\{[^}]+\})/)

  return (
    <div className="text-sm leading-relaxed">
      {parts.map((part, i) => {
        const match = part.match(/^\{(.+)\}$/)
        if (match) {
          const key = match[1]
          const isSelected = selectedVar === key
          const hasValue = key in variables
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectVar(isSelected ? null : key)}
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium transition-all cursor-pointer',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : hasValue
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {`{${key}}`}
            </button>
          )
        }
        return <span key={i} className="whitespace-pre-wrap">{part}</span>
      })}
    </div>
  )
}

// ─── Component ───

export default function SendTestMessageDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  patientPhone,
  sessionValue,
}: SendTestMessageDialogProps) {
  const { user } = useAuth()
  const { data: aiSettings } = useAISettings()
  const [messageType, setMessageType] = useState<MessageType>('billing')
  const [messageText, setMessageText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [useRealData, setUseRealData] = useState(false)
  const [realDataLoading, setRealDataLoading] = useState(false)
  const [noDataMessage, setNoDataMessage] = useState<string | null>(null)
  const [realVariables, setRealVariables] = useState<Record<string, string>>({})
  const [selectedVar, setSelectedVar] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Get the current template
  const currentTemplate = useMemo(() => {
    if (!aiSettings) return ''
    if (messageType === 'billing') return aiSettings.billing_template || ''
    if (messageType === 'reminder') return aiSettings.reminder_1_template || ''
    if (messageType === 'appointment_reminder') return aiSettings.appointment_reminder_template || ''
    return ''
  }, [aiSettings, messageType])

  // Get variable labels from TEMPLATE_VARIABLES constant
  const variableLabels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const v of TEMPLATE_VARIABLES) {
      const key = v.key.replace(/[{}]/g, '')
      map[key] = v.label
    }
    return map
  }, [])

  // Reset selectedVar when type changes
  useEffect(() => {
    setSelectedVar(null)
    setShowPreview(false)
  }, [messageType, useRealData])

  // Generate preview when type, settings, or data mode change
  useEffect(() => {
    if (!aiSettings || !open) return

    let cancelled = false

    async function generatePreview() {
      setNoDataMessage(null)

      if (useRealData) {
        setRealDataLoading(true)
        try {
          await generateRealDataPreview()
        } finally {
          if (!cancelled) setRealDataLoading(false)
        }
      } else {
        generateSimulatedPreview()
      }
    }

    async function generateRealDataPreview() {
      if (!aiSettings) return

      if (messageType === 'billing') {
        const prevMonth = new Date()
        prevMonth.setMonth(prevMonth.getMonth() - 1)
        const monthStart = format(startOfMonth(prevMonth), 'yyyy-MM-dd')
        const monthEnd = format(endOfMonth(prevMonth), 'yyyy-MM-dd')

        const billCancelled = aiSettings.bill_cancelled_sessions !== false
        const statuses = billCancelled ? ['completed', 'cancelled'] : ['completed']

        const { data: appointments } = await supabase
          .from('appointments')
          .select('date')
          .eq('patient_id', patientId)
          .in('status', statuses)
          .gte('date', monthStart)
          .lte('date', monthEnd)
          .order('date', { ascending: true })

        if (cancelled) return

        if (!appointments || appointments.length === 0) {
          setNoDataMessage('Este paciente não teve sessões no mês anterior.')
          setMessageText('')
          setRealVariables({})
          return
        }

        const formattedDates = appointments.map(a =>
          new Date(a.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        ).join(', ')

        const count = appointments.length
        const totalAmount = count * sessionValue
        const reminderDay = aiSettings.reminder_day ?? 10
        const billingDay = aiSettings.billing_day ?? 5
        const now = new Date()
        const dueDate = reminderDay <= billingDay
          ? new Date(now.getFullYear(), now.getMonth() + 1, reminderDay)
          : new Date(now.getFullYear(), now.getMonth(), reminderDay)
        const monthName = prevMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

        const variables: Record<string, string> = {
          nome: patientName,
          valor: totalAmount.toFixed(2),
          mes: monthName,
          sessoes: String(count),
          vencimento: dueDate.toLocaleDateString('pt-BR'),
          datas_sessoes: formattedDates,
        }

        setRealVariables(variables)
        const template = aiSettings.billing_template || ''
        setMessageText(renderTemplate(template, variables))

      } else if (messageType === 'reminder') {
        const { data: unpaidInvoices } = await supabase
          .from('invoices')
          .select('total_amount, amount_paid, due_date, reference_month')
          .eq('patient_id', patientId)
          .in('status', ['pending', 'partial', 'overdue'])
          .order('created_at', { ascending: false })
          .limit(1)

        if (cancelled) return

        if (!unpaidInvoices || unpaidInvoices.length === 0) {
          setNoDataMessage('Este paciente não tem faturas pendentes.')
          setMessageText('')
          setRealVariables({})
          return
        }

        const invoice = unpaidInvoices[0]
        const remaining = invoice.total_amount - invoice.amount_paid
        const monthName = new Date(invoice.reference_month + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

        const variables: Record<string, string> = {
          nome: patientName,
          valor: remaining.toFixed(2),
          mes: monthName,
          vencimento: new Date(invoice.due_date + 'T00:00:00').toLocaleDateString('pt-BR'),
        }

        setRealVariables(variables)
        const template = aiSettings.reminder_1_template || ''
        setMessageText(renderTemplate(template, variables))

      } else if (messageType === 'appointment_reminder') {
        const today = format(new Date(), 'yyyy-MM-dd')

        const { data: nextAppointments } = await supabase
          .from('appointments')
          .select('date, start_time')
          .eq('patient_id', patientId)
          .eq('status', 'scheduled')
          .gte('date', today)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true })
          .limit(1)

        if (cancelled) return

        if (!nextAppointments || nextAppointments.length === 0) {
          setNoDataMessage('Este paciente não tem sessões agendadas.')
          setMessageText('')
          setRealVariables({})
          return
        }

        const apt = nextAppointments[0]
        const variables: Record<string, string> = {
          nome: patientName,
          data: format(new Date(apt.date + 'T00:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR }),
          horario: apt.start_time?.slice(0, 5) || '',
        }

        setRealVariables(variables)
        const template = aiSettings.appointment_reminder_template || ''
        setMessageText(renderTemplate(template, variables))
      }
    }

    function generateSimulatedPreview() {
      if (!aiSettings) return

      const now = new Date()
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const monthStart = format(startOfMonth(prevMonth), 'yyyy-MM-dd')
      const monthEnd = format(endOfMonth(prevMonth), 'yyyy-MM-dd')

      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId)
        .in('status', ['completed', 'cancelled'])
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .then(({ count }) => {
          if (cancelled) return
          const sessionsCount = count ?? 0
          const monthName = prevMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
          const reminderDay = aiSettings!.reminder_day ?? 10
          const dueDate = new Date(now.getFullYear(), now.getMonth(), reminderDay)
          const totalAmount = sessionsCount * sessionValue

          const variables: Record<string, string> = {
            nome: patientName,
            valor: totalAmount.toFixed(2),
            mes: monthName,
            sessoes: String(sessionsCount),
            vencimento: dueDate.toLocaleDateString('pt-BR'),
            datas_sessoes: '',
            data: format(now, "EEEE, d 'de' MMMM", { locale: ptBR }),
            horario: format(now, 'HH:mm'),
          }

          let template = ''
          if (messageType === 'billing') {
            template = aiSettings!.billing_template || ''
          } else if (messageType === 'reminder') {
            template = aiSettings!.reminder_1_template || ''
          } else if (messageType === 'appointment_reminder') {
            template = aiSettings!.appointment_reminder_template || ''
          }

          setMessageText(renderTemplate(template, variables))
        })
    }

    generatePreview()

    return () => { cancelled = true }
  }, [aiSettings, messageType, open, patientId, patientName, sessionValue, useRealData])

  const handleSend = async () => {
    if (!user || !messageText.trim()) return

    setIsSending(true)
    try {
      const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('instance_name, status')
        .eq('profile_id', user.id)
        .eq('status', 'connected')
        .single()

      if (!instance) {
        toast.error('WhatsApp não conectado. Conecte sua instância primeiro.')
        return
      }

      const phone = patientPhone.replace('+', '')

      const { data: sendResult, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'send_text',
          instanceName: instance.instance_name,
          number: phone,
          text: messageText,
        },
      })

      if (error) {
        // Try to extract a useful message from the edge function response
        const detail = typeof error === 'object' && 'message' in error
          ? error.message
          : String(error)
        throw new Error(detail)
      }

      // Evolution API may return an error in the response body
      if (sendResult?.error) {
        throw new Error(sendResult.error)
      }

      toast.success(`Mensagem de teste enviada para ${patientName}`)
      onOpenChange(false)
    } catch (error) {
      toast.error('Erro ao enviar mensagem de teste', {
        description: error instanceof Error ? error.message : 'Erro desconhecido',
      })
    } finally {
      setIsSending(false)
    }
  }

  const hasRealVariables = useRealData && Object.keys(realVariables).length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Testar Mensagem
          </DialogTitle>
          <DialogDescription>
            Enviar mensagem de teste para {patientName} via WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Tipo de mensagem
            </label>
            <Select
              value={messageType}
              onValueChange={(v) => setMessageType(v as MessageType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(MESSAGE_TYPE_LABELS) as [MessageType, string][]).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-foreground">
                Usar dados reais
              </label>
              <p className="text-xs text-muted-foreground">
                Busca faturas, sessões e agendamentos reais
              </p>
            </div>
            <Switch
              checked={useRealData}
              onCheckedChange={setUseRealData}
            />
          </div>

          {/* Content area */}
          <div>
            {realDataLoading ? (
              <div className="flex items-center justify-center py-8 rounded-lg border border-input bg-surface">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : noDataMessage ? (
              <div className="flex items-center gap-2 px-3 py-4 rounded-lg border border-input bg-muted/50 text-sm text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                {noDataMessage}
              </div>
            ) : hasRealVariables && !showPreview ? (
              /* ─── Template + Variables view ─── */
              <div className="space-y-3">
                {/* Template with chips */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5 block">
                    <Code2 className="h-3.5 w-3.5" />
                    Template
                  </label>
                  <div className="rounded-lg border border-input bg-surface p-3">
                    <TemplateWithChips
                      template={currentTemplate}
                      variables={realVariables}
                      selectedVar={selectedVar}
                      onSelectVar={setSelectedVar}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Clique nos placeholders para ver os valores reais
                  </p>
                </div>

                {/* Variable values panel */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Valores dos placeholders
                  </label>
                  <div className="rounded-lg border border-input bg-surface divide-y divide-border">
                    {Object.entries(realVariables).map(([key, value]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedVar(selectedVar === key ? null : key)}
                        className={cn(
                          'w-full flex items-start justify-between gap-3 px-3 py-2 text-left transition-colors',
                          selectedVar === key
                            ? 'bg-primary/5'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        <div className="shrink-0">
                          <span className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                            selectedVar === key
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-primary/10 text-primary'
                          )}>
                            {`{${key}}`}
                          </span>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {variableLabels[key] || key}
                          </p>
                        </div>
                        <span className="text-sm text-foreground text-right">
                          {value || <span className="text-muted-foreground italic">vazio</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggle to preview */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowPreview(true)}
                >
                  <Eye className="h-4 w-4" />
                  Ver mensagem final
                </Button>
              </div>
            ) : (
              /* ─── Preview / Edit view ─── */
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-foreground">
                    {hasRealVariables ? 'Mensagem final' : 'Preview da mensagem'}
                  </label>
                  {hasRealVariables && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-primary"
                      onClick={() => setShowPreview(false)}
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      Ver template
                    </Button>
                  )}
                </div>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-surface text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Você pode editar a mensagem antes de enviar.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || !messageText.trim() || !!noDataMessage}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar Teste
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
