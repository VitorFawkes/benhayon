-- =============================================================================
-- Benhayon — Initial Schema Migration
-- Sistema de Gestão para Psicólogos
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ENUM TYPES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE appointment_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');
CREATE TYPE invoice_status AS ENUM ('pending', 'partial', 'paid', 'overdue');
CREATE TYPE payment_method_type AS ENUM ('pix', 'cash', 'transfer', 'card', 'other');
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE message_type AS ENUM ('text', 'audio', 'image', 'document');
CREATE TYPE outbound_message_type AS ENUM ('billing', 'reminder', 'thank_you', 'appointment_reminder', 'custom');
CREATE TYPE patient_status AS ENUM ('active', 'inactive', 'paused');
CREATE TYPE patient_payment_type AS ENUM ('particular', 'clinic');
CREATE TYPE whatsapp_status AS ENUM ('disconnected', 'connecting', 'connected');
CREATE TYPE receipt_status AS ENUM ('pending_review', 'confirmed', 'rejected');
CREATE TYPE alert_type AS ENUM (
  'payment_claimed',
  'receipt_review',
  'receipt_auto_confirmed',
  'whatsapp_disconnected',
  'message_failed',
  'invoice_overdue'
);
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE queue_status AS ENUM ('queued', 'sending', 'sent', 'failed', 'cancelled');
CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE ai_tone AS ENUM ('formal', 'friendly', 'casual', 'professional');
CREATE TYPE recurring_frequency AS ENUM ('weekly', 'biweekly', 'monthly');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles — Psicólogo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  crp TEXT,
  avatar_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- clinics — Consultórios
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_phone TEXT,
  contact_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- patients — Pacientes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  session_value NUMERIC(10,2) NOT NULL CHECK (session_value > 0),
  payment_type patient_payment_type NOT NULL DEFAULT 'particular',
  status patient_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(profile_id, phone)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- appointments — Sessões
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- recurring_schedules — Recorrências
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE recurring_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  frequency recurring_frequency NOT NULL DEFAULT 'weekly',
  starts_at DATE NOT NULL,
  ends_at DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_recurring_time CHECK (end_time > start_time)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- invoices — Cobranças mensais
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  reference_month DATE NOT NULL,
  total_sessions INT NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status invoice_status NOT NULL DEFAULT 'pending',
  due_date DATE NOT NULL,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, patient_id, reference_month)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- payments — Pagamentos
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  payment_method payment_method_type NOT NULL DEFAULT 'pix',
  receipt_url TEXT,
  receipt_verified BOOLEAN NOT NULL DEFAULT false,
  source TEXT DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- whatsapp_instances — Conexão WhatsApp
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  instance_name TEXT NOT NULL UNIQUE,
  instance_id TEXT,
  status whatsapp_status NOT NULL DEFAULT 'disconnected',
  phone_number TEXT,
  webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- message_logs — Log de TODAS as mensagens (entrada e saída)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  direction message_direction NOT NULL,
  message_type message_type NOT NULL,
  content TEXT,
  media_url TEXT,
  raw_payload JSONB,
  ai_processed BOOLEAN NOT NULL DEFAULT false,
  ai_intent TEXT,
  ai_intent_confidence NUMERIC(3,2),
  ai_analysis JSONB,
  external_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, external_message_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- receipt_analyses — Análises de comprovantes pela IA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE receipt_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_log_id UUID NOT NULL REFERENCES message_logs(id) ON DELETE CASCADE UNIQUE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  extracted_amount NUMERIC(10,2),
  extracted_date DATE,
  extracted_method TEXT,
  extracted_payer TEXT,
  extracted_transaction_id TEXT,
  confidence_score NUMERIC(3,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  matched_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  status receipt_status NOT NULL DEFAULT 'pending_review',
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  ai_raw_response JSONB,
  media_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- alerts — Sistema de alertas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  type alert_type NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  description TEXT,
  message_log_id UUID REFERENCES message_logs(id) ON DELETE SET NULL,
  receipt_analysis_id UUID REFERENCES receipt_analyses(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  metadata JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- message_queue — Fila de mensagens a enviar
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  message_type outbound_message_type NOT NULL,
  message_content TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status queue_status NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  escalation_level INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- processing_queue — Fila de processamento de mensagens recebidas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_log_id UUID NOT NULL REFERENCES message_logs(id) ON DELETE CASCADE UNIQUE,
  status processing_status NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ai_settings — Configuração completa da IA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,

  -- Cobrança mensal
  billing_enabled BOOLEAN NOT NULL DEFAULT true,
  billing_day INT NOT NULL DEFAULT 5 CHECK (billing_day BETWEEN 1 AND 28),
  billing_due_days INT NOT NULL DEFAULT 10,
  billing_tone ai_tone NOT NULL DEFAULT 'professional',
  billing_template TEXT NOT NULL DEFAULT 'Olá {nome}! Segue o resumo do mês de {mes}:

Sessões realizadas: {sessoes}
Valor total: R$ {valor}
Vencimento: {vencimento}

Formas de pagamento aceitas: PIX, transferência ou dinheiro.

Qualquer dúvida, estou à disposição!',

  -- Lembretes de pagamento
  reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  reminder_1_days INT NOT NULL DEFAULT 3,
  reminder_1_tone ai_tone NOT NULL DEFAULT 'friendly',
  reminder_1_template TEXT NOT NULL DEFAULT 'Oi {nome}! Tudo bem? 😊

Passando para lembrar que o pagamento de R$ {valor} referente a {mes} venceu dia {vencimento}.

Quando puder, me envie o comprovante por aqui!',

  reminder_2_days INT NOT NULL DEFAULT 7,
  reminder_2_enabled BOOLEAN NOT NULL DEFAULT true,
  reminder_2_tone ai_tone NOT NULL DEFAULT 'professional',
  reminder_2_template TEXT NOT NULL DEFAULT 'Olá {nome}.

Informo que o pagamento de R$ {valor} referente a {mes} encontra-se pendente desde {vencimento}.

Por favor, regularize o quanto antes. Caso já tenha pago, me envie o comprovante.

Obrigado(a).',

  reminder_3_days INT NOT NULL DEFAULT 14,
  reminder_3_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_3_tone ai_tone NOT NULL DEFAULT 'formal',
  reminder_3_template TEXT NOT NULL DEFAULT 'Prezado(a) {nome},

Este é um aviso final referente ao pagamento de R$ {valor} ({mes}), vencido há {dias_atraso} dias.

Solicito a regularização até {prazo_final}. Caso já tenha efetuado o pagamento, envie o comprovante.

Atenciosamente.',

  -- Agradecimento de pagamento
  thank_you_enabled BOOLEAN NOT NULL DEFAULT false,
  thank_you_tone ai_tone NOT NULL DEFAULT 'friendly',
  thank_you_template TEXT NOT NULL DEFAULT 'Obrigado(a), {nome}! Recebi seu pagamento de R$ {valor}. Tudo certo! 😊',

  -- Lembrete de sessão
  appointment_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  appointment_reminder_hours_before INT NOT NULL DEFAULT 24,
  appointment_reminder_tone ai_tone NOT NULL DEFAULT 'friendly',
  appointment_reminder_template TEXT NOT NULL DEFAULT 'Oi {nome}! Lembrando da nossa sessão amanhã ({data}) às {horario}. Até lá! 😊',

  -- Processamento de mídia
  analyze_receipts BOOLEAN NOT NULL DEFAULT true,
  receipt_auto_confirm_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.90,
  analyze_audio BOOLEAN NOT NULL DEFAULT true,
  analyze_text_intent BOOLEAN NOT NULL DEFAULT true,

  -- Horários de envio
  send_start_hour INT NOT NULL DEFAULT 9 CHECK (send_start_hour BETWEEN 0 AND 23),
  send_end_hour INT NOT NULL DEFAULT 20 CHECK (send_end_hour BETWEEN 0 AND 23),
  send_on_weekends BOOLEAN NOT NULL DEFAULT false,
  send_on_holidays BOOLEAN NOT NULL DEFAULT false,

  -- Rate limiting
  min_seconds_between_messages INT NOT NULL DEFAULT 5,
  max_messages_per_hour INT NOT NULL DEFAULT 30,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_appointments_profile_date ON appointments(profile_id, date);
CREATE INDEX idx_appointments_patient_date ON appointments(patient_id, date);
CREATE INDEX idx_invoices_profile_status ON invoices(profile_id, status, due_date);
CREATE INDEX idx_invoices_patient_month ON invoices(patient_id, reference_month);
CREATE INDEX idx_payments_patient_date ON payments(patient_id, payment_date);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_message_logs_profile_created ON message_logs(profile_id, created_at DESC);
CREATE INDEX idx_message_logs_patient ON message_logs(patient_id, created_at DESC);
CREATE INDEX idx_patients_profile_status ON patients(profile_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_alerts_profile_unread ON alerts(profile_id, created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX idx_message_queue_pending ON message_queue(scheduled_for) WHERE status = 'queued';
CREATE INDEX idx_processing_queue_pending ON processing_queue(created_at) WHERE status = 'pending';
CREATE INDEX idx_receipt_analyses_status ON receipt_analyses(profile_id, status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- handle_new_user: Auto-criar profile + ai_settings padrão ao registrar
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  -- Criar ai_settings padrão
  INSERT INTO ai_settings (profile_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- update_invoice_on_payment: Auto-atualizar invoice ao registrar/remover payment
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_invoice_on_payment() RETURNS TRIGGER AS $$
DECLARE
  new_amount_paid NUMERIC(10,2);
  invoice_total NUMERIC(10,2);
  target_invoice_id UUID;
BEGIN
  -- Determinar o invoice_id correto (NEW para INSERT, OLD para DELETE)
  IF TG_OP = 'DELETE' THEN
    target_invoice_id := OLD.invoice_id;
  ELSE
    target_invoice_id := NEW.invoice_id;
  END IF;

  IF target_invoice_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO new_amount_paid
    FROM payments WHERE invoice_id = target_invoice_id;

    SELECT total_amount INTO invoice_total
    FROM invoices WHERE id = target_invoice_id;

    UPDATE invoices SET
      amount_paid = new_amount_paid,
      status = CASE
        WHEN new_amount_paid >= invoice_total THEN 'paid'::invoice_status
        WHEN new_amount_paid > 0 THEN 'partial'::invoice_status
        ELSE status
      END,
      paid_at = CASE
        WHEN new_amount_paid >= invoice_total THEN now()
        ELSE paid_at
      END
    WHERE id = target_invoice_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- set_updated_at: Atualizar updated_at automaticamente
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Auto-criar profile ao registrar usuário
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-atualizar invoice ao registrar payment
CREATE TRIGGER on_payment_created
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION update_invoice_on_payment();

-- Auto-atualizar invoice ao remover payment
CREATE TRIGGER on_payment_deleted
  AFTER DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_invoice_on_payment();

-- updated_at automático
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON ai_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. ROW-LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Habilitar RLS em TODAS as tabelas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles: id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- clinics: profile_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "clinics_select" ON clinics
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "clinics_insert" ON clinics
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "clinics_update" ON clinics
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "clinics_delete" ON clinics
  FOR DELETE USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- patients: profile_id = auth.uid(), soft delete (no hard DELETE)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "patients_select" ON patients
  FOR SELECT USING (profile_id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY "patients_insert" ON patients
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "patients_update" ON patients
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "patients_no_delete" ON patients
  FOR DELETE USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- appointments: profile_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "appointments_select" ON appointments
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "appointments_insert" ON appointments
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "appointments_update" ON appointments
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "appointments_delete" ON appointments
  FOR DELETE USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- recurring_schedules: profile_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "recurring_schedules_select" ON recurring_schedules
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "recurring_schedules_insert" ON recurring_schedules
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "recurring_schedules_update" ON recurring_schedules
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "recurring_schedules_delete" ON recurring_schedules
  FOR DELETE USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- invoices: profile_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "invoices_delete" ON invoices
  FOR DELETE USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- payments: profile_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "payments_select" ON payments
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "payments_insert" ON payments
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "payments_update" ON payments
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "payments_delete" ON payments
  FOR DELETE USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- whatsapp_instances: profile_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "whatsapp_instances_select" ON whatsapp_instances
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "whatsapp_instances_insert" ON whatsapp_instances
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "whatsapp_instances_update" ON whatsapp_instances
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "whatsapp_instances_delete" ON whatsapp_instances
  FOR DELETE USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- message_logs: profile_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "message_logs_select" ON message_logs
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "message_logs_insert" ON message_logs
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "message_logs_update" ON message_logs
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "message_logs_delete" ON message_logs
  FOR DELETE USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- ai_settings: profile_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "ai_settings_select" ON ai_settings
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "ai_settings_insert" ON ai_settings
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "ai_settings_update" ON ai_settings
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "ai_settings_delete" ON ai_settings
  FOR DELETE USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- receipt_analyses: profile_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "receipt_analyses_select" ON receipt_analyses
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "receipt_analyses_insert" ON receipt_analyses
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "receipt_analyses_update" ON receipt_analyses
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "receipt_analyses_delete" ON receipt_analyses
  FOR DELETE USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- alerts: profile_id = auth.uid() (DELETE permitido)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "alerts_select" ON alerts
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "alerts_insert" ON alerts
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "alerts_update" ON alerts
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "alerts_delete" ON alerts
  FOR DELETE USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- message_queue: profile_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "message_queue_select" ON message_queue
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "message_queue_insert" ON message_queue
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "message_queue_update" ON message_queue
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "message_queue_delete" ON message_queue
  FOR DELETE USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- processing_queue: profile_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "processing_queue_select" ON processing_queue
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "processing_queue_insert" ON processing_queue
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "processing_queue_update" ON processing_queue
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "processing_queue_delete" ON processing_queue
  FOR DELETE USING (profile_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. pg_cron JOBS — Scheduled Edge Function calls via pg_net
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Processar mensagens recebidas (a cada 1 minuto — pg_cron mínimo)
SELECT cron.schedule(
  'process-incoming',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mbrfqgdqbcedoianjrsr.supabase.co/functions/v1/process-incoming',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 2. Enviar mensagens da fila (a cada 1 minuto)
SELECT cron.schedule(
  'send-messages',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mbrfqgdqbcedoianjrsr.supabase.co/functions/v1/send-messages',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3. Gerar cobranças e verificar vencidas (diário às 8h UTC)
SELECT cron.schedule(
  'generate-billing',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mbrfqgdqbcedoianjrsr.supabase.co/functions/v1/generate-billing',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 4. Gerar lembretes de sessão (diário às 7h UTC)
SELECT cron.schedule(
  'generate-reminders',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mbrfqgdqbcedoianjrsr.supabase.co/functions/v1/generate-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
