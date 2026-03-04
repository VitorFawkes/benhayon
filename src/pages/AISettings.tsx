import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bot,
  Receipt,
  Bell,
  Heart,
  Calendar,
  Clock,
  Image,
  Mic,
  MessageSquare,
  Save,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
} from 'lucide-react'
import { useAISettings, useUpdateAISettings } from '@/hooks/useAISettings'
import { AI_TONE_LABELS, AI_TONE_DESCRIPTIONS, TEMPLATE_VARIABLES } from '@/constants'
import type { AITone } from '@/types'
import { cn } from '@/lib/utils'

function safeParseInt(val: string, fallback: number): number {
  const parsed = parseInt(val)
  return isNaN(parsed) ? fallback : parsed
}

export default function AISettings() {
  const { data: settings, isLoading } = useAISettings()
  const updateSettings = useUpdateAISettings()
  const [local, setLocal] = useState(settings)
  const [expandedSection, setExpandedSection] = useState<string | null>('billing')

  useEffect(() => {
    if (settings) setLocal({
      ...settings,
      reminder_day: settings.reminder_day ?? 10,
      reminder_repeat_enabled: settings.reminder_repeat_enabled ?? false,
      reminder_repeat_interval_days: settings.reminder_repeat_interval_days ?? 5,
      reminder_max_count: settings.reminder_max_count ?? 3,
    })
  }, [settings])

  if (isLoading || !local) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Configuração da IA</h1>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-xl p-6">
            <div className="h-5 w-48 bg-muted rounded animate-pulse mb-4" />
            <div className="h-4 w-full bg-muted rounded animate-pulse" />
          </div>
        ))}
      </motion.div>
    )
  }

  const update = (field: string, value: unknown) => {
    setLocal((prev) => prev ? { ...prev, [field]: value } : prev)
  }

  const handleSave = () => {
    if (!local) return
    const { id, profile_id, created_at, updated_at, ...updates } = local
    updateSettings.mutate(updates)
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-3xl"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot size={24} />
            Configuração da IA
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure como o agente de IA gerencia cobranças e mensagens
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={updateSettings.isPending}
          className="h-10 px-5 bg-primary hover:bg-primary-dark text-primary-foreground rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <Save size={16} />
          {updateSettings.isPending ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {/* Billing Section */}
      <Section
        title="Cobrança Mensal"
        icon={Receipt}
        expanded={expandedSection === 'billing'}
        onToggle={() => toggleSection('billing')}
        enabled={local.billing_enabled}
        onEnabledChange={(v) => update('billing_enabled', v)}
      >
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1.5">Dia da cobrança</label>
          <input
            type="number"
            min={1}
            max={28}
            value={local.billing_day}
            onChange={(e) => update('billing_day', safeParseInt(e.target.value, local.billing_day))}
            className="w-32 h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">Dia do mês para gerar e enviar cobranças</p>
        </div>
        <ToneSelector value={local.billing_tone} onChange={(v) => update('billing_tone', v)} />
        <TemplateEditor
          label="Mensagem de cobrança"
          value={local.billing_template}
          onChange={(v) => update('billing_template', v)}
        />
      </Section>

      {/* Reminders Section */}
      <Section
        title="Lembretes de Pagamento"
        icon={Bell}
        expanded={expandedSection === 'reminders'}
        onToggle={() => toggleSection('reminders')}
        enabled={local.reminder_enabled}
        onEnabledChange={(v) => update('reminder_enabled', v)}
      >
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1.5">Dia do lembrete</label>
          <input
            type="number"
            min={1}
            max={28}
            value={local.reminder_day}
            onChange={(e) => update('reminder_day', safeParseInt(e.target.value, local.reminder_day))}
            className="w-32 h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">Dia do mês para enviar o primeiro lembrete</p>
        </div>

        <ToneSelector value={local.reminder_1_tone} onChange={(v) => update('reminder_1_tone', v)} />
        <TemplateEditor label="Mensagem do lembrete" value={local.reminder_1_template} onChange={(v) => update('reminder_1_template', v)} />

        {/* Repeat settings */}
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-foreground">Repetição</h4>
            <Toggle checked={local.reminder_repeat_enabled} onChange={(v) => update('reminder_repeat_enabled', v)} />
          </div>
          {local.reminder_repeat_enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Repetir a cada</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={local.reminder_repeat_interval_days}
                    onChange={(e) => update('reminder_repeat_interval_days', safeParseInt(e.target.value, local.reminder_repeat_interval_days))}
                    className="w-20 h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                  />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Máximo de lembretes</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={local.reminder_max_count}
                  onChange={(e) => update('reminder_max_count', safeParseInt(e.target.value, local.reminder_max_count))}
                  className="w-20 h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Thank You Section */}
      <Section
        title="Agradecimento de Pagamento"
        icon={Heart}
        expanded={expandedSection === 'thankyou'}
        onToggle={() => toggleSection('thankyou')}
        enabled={local.thank_you_enabled}
        onEnabledChange={(v) => update('thank_you_enabled', v)}
      >
        <ToneSelector value={local.thank_you_tone} onChange={(v) => update('thank_you_tone', v)} />
        <TemplateEditor label="Mensagem" value={local.thank_you_template} onChange={(v) => update('thank_you_template', v)} />
      </Section>

      {/* Appointment Reminder Section */}
      <Section
        title="Lembrete de Sessão"
        icon={Calendar}
        expanded={expandedSection === 'appointment'}
        onToggle={() => toggleSection('appointment')}
        enabled={local.appointment_reminder_enabled}
        onEnabledChange={(v) => update('appointment_reminder_enabled', v)}
      >
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1.5">Horas antes da sessão</label>
          <input
            type="number"
            min={1}
            max={72}
            value={local.appointment_reminder_hours_before}
            onChange={(e) => update('appointment_reminder_hours_before', safeParseInt(e.target.value, local.appointment_reminder_hours_before))}
            className="w-32 h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
          />
        </div>
        <ToneSelector value={local.appointment_reminder_tone} onChange={(v) => update('appointment_reminder_tone', v)} />
        <TemplateEditor label="Mensagem" value={local.appointment_reminder_template} onChange={(v) => update('appointment_reminder_template', v)} />
      </Section>

      {/* Processing Section */}
      <Section
        title="Processamento de Mídia"
        icon={Sparkles}
        expanded={expandedSection === 'processing'}
        onToggle={() => toggleSection('processing')}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <Image size={18} className="text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Analisar comprovantes</p>
                <p className="text-xs text-muted-foreground">IA identifica comprovantes de pagamento em imagens</p>
              </div>
            </div>
            <Toggle checked={local.analyze_receipts} onChange={(v) => update('analyze_receipts', v)} />
          </div>


          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <Mic size={18} className="text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Transcrever áudios</p>
                <p className="text-xs text-muted-foreground">IA transcreve e analisa mensagens de voz</p>
              </div>
            </div>
            <Toggle checked={local.analyze_audio} onChange={(v) => update('analyze_audio', v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <MessageSquare size={18} className="text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Classificar intenção de texto</p>
                <p className="text-xs text-muted-foreground">IA detecta quando paciente diz que pagou</p>
              </div>
            </div>
            <Toggle checked={local.analyze_text_intent} onChange={(v) => update('analyze_text_intent', v)} />
          </div>
        </div>
      </Section>

      {/* Schedule Section */}
      <Section
        title="Horários de Envio"
        icon={Clock}
        expanded={expandedSection === 'schedule'}
        onToggle={() => toggleSection('schedule')}
      >
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Início</label>
            <input
              type="number"
              min={0}
              max={23}
              value={local.send_start_hour}
              onChange={(e) => update('send_start_hour', safeParseInt(e.target.value, local.send_start_hour))}
              className="w-full h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">{local.send_start_hour}:00</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Fim</label>
            <input
              type="number"
              min={0}
              max={23}
              value={local.send_end_hour}
              onChange={(e) => update('send_end_hour', safeParseInt(e.target.value, local.send_end_hour))}
              className="w-full h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">{local.send_end_hour}:00</p>
          </div>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 mb-3">
          <span className="text-sm text-foreground">Enviar nos fins de semana</span>
          <Toggle checked={local.send_on_weekends} onChange={(v) => update('send_on_weekends', v)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Segundos entre mensagens</label>
            <input
              type="number"
              min={3}
              max={30}
              value={local.min_seconds_between_messages}
              onChange={(e) => update('min_seconds_between_messages', safeParseInt(e.target.value, local.min_seconds_between_messages))}
              className="w-full h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Máx. mensagens/hora</label>
            <input
              type="number"
              min={5}
              max={100}
              value={local.max_messages_per_hour}
              onChange={(e) => update('max_messages_per_hour', safeParseInt(e.target.value, local.max_messages_per_hour))}
              className="w-full h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            />
          </div>
        </div>
        <div className="mt-3 p-3 bg-warning-light rounded-lg flex items-start gap-2">
          <Info size={16} className="text-warning flex-shrink-0 mt-0.5" />
          <p className="text-xs text-warning">
            Rate limiting protege contra banimento do WhatsApp. Recomendamos mínimo 5 segundos entre mensagens.
          </p>
        </div>
      </Section>
    </motion.div>
  )
}

// ─── Sub-components ───

function Section({
  title,
  icon: Icon,
  expanded,
  onToggle,
  enabled,
  onEnabledChange,
  children,
}: {
  title: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  expanded: boolean
  onToggle: () => void
  enabled?: boolean
  onEnabledChange?: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon size={20} className="text-primary" />
          <span className="font-semibold text-foreground">{title}</span>
          {enabled !== undefined && (
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              enabled ? 'bg-success-light text-success' : 'bg-muted text-muted-foreground'
            )}>
              {enabled ? 'Ativo' : 'Inativo'}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="px-6 pb-6 border-t border-border"
        >
          {onEnabledChange !== undefined && (
            <div className="flex items-center justify-between py-3 mb-3">
              <span className="text-sm text-foreground">Habilitar</span>
              <Toggle checked={enabled!} onChange={onEnabledChange} />
            </div>
          )}
          {children}
        </motion.div>
      )}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-input'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}

function ToneSelector({ value, onChange }: { value: AITone; onChange: (v: AITone) => void }) {
  const tones: AITone[] = ['formal', 'professional', 'friendly', 'casual']

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-foreground mb-2">Tom da mensagem</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tones.map((tone) => (
          <button
            key={tone}
            type="button"
            onClick={() => onChange(tone)}
            className={cn(
              'p-3 rounded-lg border text-center transition-all',
              value === tone
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-border hover:border-primary/30'
            )}
          >
            <span className="text-sm font-medium text-foreground">{AI_TONE_LABELS[tone]}</span>
            <p className="text-[10px] text-muted-foreground mt-1">{AI_TONE_DESCRIPTIONS[tone]}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function TemplateEditor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full px-3 py-2 rounded-lg border border-input bg-surface text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
      />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {TEMPLATE_VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => onChange(value + v.key)}
            className="text-[11px] px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono"
            title={v.label}
          >
            {v.key}
          </button>
        ))}
      </div>
    </div>
  )
}
