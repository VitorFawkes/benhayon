import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MessageSquare, Send, Loader2, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useAISettings } from '@/hooks/useAISettings'
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
        // Match edge function logic: if reminderDay <= billingDay, due date is next month
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
          return
        }

        const apt = nextAppointments[0]
        const variables: Record<string, string> = {
          nome: patientName,
          data: format(new Date(apt.date + 'T00:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR }),
          horario: apt.start_time?.slice(0, 5) || '',
        }

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

      // Fetch session count for simulated mode
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
      // Get WhatsApp instance
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

      const { error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'send_text',
          instanceName: instance.instance_name,
          number: phone,
          text: messageText,
        },
      })

      if (error) throw error

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Preview da mensagem
            </label>
            {realDataLoading ? (
              <div className="flex items-center justify-center py-8 rounded-lg border border-input bg-surface">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : noDataMessage ? (
              <div className="flex items-center gap-2 px-3 py-4 rounded-lg border border-input bg-muted/50 text-sm text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                {noDataMessage}
              </div>
            ) : (
              <>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-surface text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Você pode editar a mensagem antes de enviar.
                </p>
              </>
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
