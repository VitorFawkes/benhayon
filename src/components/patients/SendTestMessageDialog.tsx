import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MessageSquare, Send, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useAISettings } from '@/hooks/useAISettings'
import { Button } from '@/components/ui/button'
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
  const [sessionsCount, setSessionsCount] = useState(0)

  // Fetch session count for this patient in previous month
  useEffect(() => {
    if (!open || !patientId) return
    const prevMonth = new Date()
    prevMonth.setMonth(prevMonth.getMonth() - 1)
    const monthStart = format(startOfMonth(prevMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(prevMonth), 'yyyy-MM-dd')

    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .in('status', ['completed', 'cancelled'])
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .then(({ count }) => setSessionsCount(count ?? 0))
  }, [open, patientId])

  // Generate preview when type or settings change
  useEffect(() => {
    if (!aiSettings || !open) return

    const now = new Date()
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthName = prevMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    const reminderDay = aiSettings.reminder_day ?? 10
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
      template = aiSettings.billing_template || ''
    } else if (messageType === 'reminder') {
      template = aiSettings.reminder_1_template || ''
    } else if (messageType === 'appointment_reminder') {
      template = aiSettings.appointment_reminder_template || ''
    }

    setMessageText(renderTemplate(template, variables))
  }, [aiSettings, messageType, open, patientName, sessionsCount, sessionValue])

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

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Preview da mensagem
            </label>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || !messageText.trim()}
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
