// ─── Enums (mirror do banco) ───

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'
export type InvoiceStatus = 'pending' | 'partial' | 'paid' | 'overdue'
export type PaymentMethodType = 'pix' | 'cash' | 'transfer' | 'card' | 'other'
export type MessageDirection = 'inbound' | 'outbound'
export type MessageType = 'text' | 'audio' | 'image' | 'document'
export type OutboundMessageType = 'billing' | 'reminder' | 'thank_you' | 'appointment_reminder' | 'custom'
export type PatientStatus = 'active' | 'inactive' | 'paused'
export type PatientPaymentType = 'particular' | 'clinic'
export type WhatsAppStatus = 'disconnected' | 'connecting' | 'connected'
export type ReceiptStatus = 'pending_review' | 'confirmed' | 'rejected'
export type AlertType = 'payment_claimed' | 'receipt_review' | 'receipt_auto_confirmed' | 'whatsapp_disconnected' | 'message_failed' | 'invoice_overdue'
export type AlertSeverity = 'info' | 'warning' | 'critical'
export type QueueStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled'
export type AITone = 'formal' | 'friendly' | 'casual' | 'professional'
export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly'

// ─── Database Row Types ───

export interface Profile {
  id: string
  full_name: string
  email: string
  phone: string | null
  crp: string | null
  avatar_url: string | null
  timezone: string
  created_at: string
  updated_at: string
}

export interface Clinic {
  id: string
  profile_id: string
  name: string
  contact_phone: string | null
  contact_email: string | null
  notes: string | null
  created_at: string
}

export interface Patient {
  id: string
  profile_id: string
  clinic_id: string | null
  full_name: string
  phone: string
  email: string | null
  session_value: number
  payment_type: PatientPaymentType
  status: PatientStatus
  notes: string | null
  ai_enabled: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joins
  clinic?: Clinic | null
}

export interface Appointment {
  id: string
  profile_id: string
  patient_id: string
  date: string
  start_time: string
  end_time: string
  status: AppointmentStatus
  notes: string | null
  created_at: string
  // Joins
  patient?: Patient
}

export interface RecurringSchedule {
  id: string
  profile_id: string
  patient_id: string
  day_of_week: number
  start_time: string
  end_time: string
  frequency: RecurringFrequency
  starts_at: string
  ends_at: string | null
  is_active: boolean
  created_at: string
  // Joins
  patient?: Patient
}

export interface Invoice {
  id: string
  profile_id: string
  patient_id: string
  reference_month: string
  total_sessions: number
  total_amount: number
  amount_paid: number
  status: InvoiceStatus
  due_date: string
  sent_at: string | null
  paid_at: string | null
  created_at: string
  // Joins
  patient?: Patient
}

export interface Payment {
  id: string
  profile_id: string
  patient_id: string
  invoice_id: string | null
  amount: number
  payment_date: string
  payment_method: PaymentMethodType
  receipt_url: string | null
  receipt_verified: boolean
  source: string
  notes: string | null
  created_at: string
  // Joins
  patient?: Patient
  invoice?: Invoice
}

export interface WhatsAppInstance {
  id: string
  profile_id: string
  instance_name: string
  instance_id: string | null
  status: WhatsAppStatus
  phone_number: string | null
  webhook_url: string | null
  created_at: string
  updated_at: string
}

export interface MessageLog {
  id: string
  profile_id: string
  patient_id: string | null
  direction: MessageDirection
  message_type: MessageType
  content: string | null
  media_url: string | null
  raw_payload: Record<string, unknown> | null
  ai_processed: boolean
  ai_intent: string | null
  ai_intent_confidence: number | null
  ai_analysis: Record<string, unknown> | null
  external_message_id: string | null
  created_at: string
  // Joins
  patient?: Patient
}

export interface ReceiptAnalysis {
  id: string
  profile_id: string
  message_log_id: string
  patient_id: string | null
  extracted_amount: number | null
  extracted_date: string | null
  extracted_method: string | null
  extracted_payer: string | null
  extracted_transaction_id: string | null
  confidence_score: number
  matched_invoice_id: string | null
  status: ReceiptStatus
  reviewed_at: string | null
  reviewer_notes: string | null
  ai_raw_response: Record<string, unknown> | null
  media_url: string
  created_at: string
  // Joins
  patient?: Patient
  invoice?: Invoice
}

export interface Alert {
  id: string
  profile_id: string
  patient_id: string | null
  type: AlertType
  severity: AlertSeverity
  title: string
  description: string | null
  message_log_id: string | null
  receipt_analysis_id: string | null
  invoice_id: string | null
  metadata: Record<string, unknown> | null
  is_read: boolean
  resolved_at: string | null
  resolved_action: string | null
  created_at: string
  // Joins
  patient?: Patient
}

export interface AISettings {
  id: string
  profile_id: string
  // Cobrança
  billing_enabled: boolean
  billing_day: number
  billing_due_days: number
  billing_tone: AITone
  billing_template: string
  // Lembretes
  reminder_enabled: boolean
  reminder_day: number
  reminder_1_tone: AITone
  reminder_1_template: string
  reminder_repeat_enabled: boolean
  reminder_repeat_interval_days: number
  reminder_max_count: number
  // Agradecimento
  thank_you_enabled: boolean
  thank_you_tone: AITone
  thank_you_template: string
  // Lembrete de sessão
  appointment_reminder_enabled: boolean
  appointment_reminder_hours_before: number
  appointment_reminder_tone: AITone
  appointment_reminder_template: string
  // Processamento de mídia
  analyze_receipts: boolean
  analyze_audio: boolean
  analyze_text_intent: boolean
  // Horários
  send_start_hour: number
  send_end_hour: number
  send_on_weekends: boolean
  min_seconds_between_messages: number
  max_messages_per_hour: number
  // Meta
  created_at: string
  updated_at: string
}

// ─── Utility Types ───

export interface DashboardStats {
  monthRevenue: number
  pendingAmount: number
  activePatients: number
  monthSessions: number
  noShowRate: number
}
