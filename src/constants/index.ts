import type { AppointmentStatus, InvoiceStatus, PatientStatus, AlertType, AlertSeverity, AITone } from '@/types'

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Agendado',
  completed: 'Realizado',
  cancelled: 'Cancelado',
  no_show: 'Falta',
}

export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: 'bg-primary/10 text-primary',
  completed: 'bg-success-light text-success',
  cancelled: 'bg-muted text-muted-foreground',
  no_show: 'bg-destructive-light text-destructive',
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: 'Pendente',
  partial: 'Parcial',
  paid: 'Pago',
  overdue: 'Atrasado',
}

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  pending: 'bg-warning-light text-warning',
  partial: 'bg-info/10 text-info',
  paid: 'bg-success-light text-success',
  overdue: 'bg-destructive-light text-destructive',
}

export const PATIENT_STATUS_LABELS: Record<PatientStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  paused: 'Pausado',
}

export const PATIENT_STATUS_COLORS: Record<PatientStatus, string> = {
  active: 'bg-success-light text-success',
  inactive: 'bg-muted text-muted-foreground',
  paused: 'bg-warning-light text-warning',
}

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  payment_claimed: 'Paciente alega pagamento',
  receipt_review: 'Comprovante para revisão',
  receipt_auto_confirmed: 'Comprovante auto-confirmado',
  whatsapp_disconnected: 'WhatsApp desconectou',
  message_failed: 'Falha ao enviar mensagem',
  invoice_overdue: 'Fatura vencida',
}

export const ALERT_SEVERITY_COLORS: Record<AlertSeverity, string> = {
  info: 'bg-info/10 text-info border-info/20',
  warning: 'bg-warning-light text-warning border-warning/20',
  critical: 'bg-destructive-light text-destructive border-destructive/20',
}

export const AI_TONE_LABELS: Record<AITone, string> = {
  formal: 'Formal',
  friendly: 'Amigável',
  casual: 'Casual',
  professional: 'Profissional',
}

export const AI_TONE_DESCRIPTIONS: Record<AITone, string> = {
  formal: 'Tom sério e respeitoso, ideal para cobranças finais',
  friendly: 'Tom leve e acolhedor, ótimo para lembretes',
  casual: 'Tom descontraído e próximo, bom para agradecimentos',
  professional: 'Tom equilibrado e confiante, serve para tudo',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  transfer: 'Transferência',
  card: 'Cartão',
  other: 'Outro',
}

export const DAY_OF_WEEK_LABELS = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado',
]

export const TEMPLATE_VARIABLES = [
  { key: '{nome}', label: 'Nome do paciente' },
  { key: '{valor}', label: 'Valor total' },
  { key: '{mes}', label: 'Mês de referência' },
  { key: '{sessoes}', label: 'Quantidade de sessões' },
  { key: '{vencimento}', label: 'Data de vencimento' },
  { key: '{data}', label: 'Data da sessão' },
  { key: '{horario}', label: 'Horário da sessão' },
  { key: '{clinica}', label: 'Nome da clínica' },
]
