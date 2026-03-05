import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Phone,
  Mail,
  DollarSign,
  Building2,
  StickyNote,
  CalendarDays,
  CreditCard,
  MessageSquare,
  Clock,
  Bot,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import PatientForm from '@/components/patients/PatientForm'
import PatientSummary from '@/components/patients/PatientSummary'
import PatientSessions from '@/components/patients/PatientSessions'
import PatientProntuario from '@/components/patients/PatientProntuario'
import PatientPayments from '@/components/patients/PatientPayments'
import PatientMessages from '@/components/patients/PatientMessages'
import SendTestMessageDialog from '@/components/patients/SendTestMessageDialog'
import { usePatient, useSoftDeletePatient } from '@/hooks/usePatients'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { formatCurrency, formatPhone, formatDate } from '@/lib/formatters'
import { PATIENT_STATUS_LABELS, PATIENT_STATUS_COLORS } from '@/constants'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: patient, isLoading } = usePatient(id)
  const softDelete = useSoftDeletePatient()
  const queryClient = useQueryClient()

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [testMessageOpen, setTestMessageOpen] = useState(false)
  const now = new Date()
  const [dateRange, setDateRange] = useState({ from: startOfMonth(now), to: endOfMonth(now) })

  const handleToggleAI = async () => {
    if (!patient) return
    try {
      await supabase
        .from('patients')
        .update({ ai_enabled: !patient.ai_enabled })
        .eq('id', patient.id)
      queryClient.invalidateQueries({ queryKey: ['patients'] })
      toast.success(patient.ai_enabled ? 'IA desativada para este paciente.' : 'IA ativada para este paciente.')
    } catch {
      toast.error('Erro ao alterar configuração de IA.')
    }
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      await softDelete.mutateAsync(id)
      toast.success('Paciente removido com sucesso.')
      navigate('/patients')
    } catch (error) {
      console.error('Erro ao remover paciente:', error)
      toast.error('Erro ao remover paciente.')
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-52 w-full rounded-lg" />
          <Skeleton className="h-10 w-64 rounded-md" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </motion.div>
    )
  }

  // Not found
  if (!patient) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Button variant="ghost" onClick={() => navigate('/patients')}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <div className="bg-surface border border-border rounded-xl p-12 text-center mt-6">
          <p className="text-lg font-medium text-foreground">
            Paciente não encontrado
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            O paciente pode ter sido removido ou o link é inválido.
          </p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/patients')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {patient.full_name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Cadastrado em {formatDate(patient.created_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setTestMessageOpen(true)}>
            <MessageSquare className="h-4 w-4" />
            Testar Mensagem
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Phone */}
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="text-sm font-medium text-foreground">
                  {formatPhone(patient.phone)}
                </p>
              </div>
            </div>

            {/* Email */}
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">E-mail</p>
                <p className="text-sm font-medium text-foreground">
                  {patient.email || '—'}
                </p>
              </div>
            </div>

            {/* Session Value */}
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-success/10">
                <DollarSign className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor da sessão</p>
                <p className="text-sm font-medium text-foreground">
                  {formatCurrency(patient.session_value)}
                </p>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold mt-0.5',
                    PATIENT_STATUS_COLORS[patient.status]
                  )}
                >
                  {PATIENT_STATUS_LABELS[patient.status]}
                </span>
              </div>
            </div>

            {/* Payment Type / Clinic */}
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tipo</p>
                <p className="text-sm font-medium text-foreground">
                  {patient.payment_type === 'particular'
                    ? 'Particular'
                    : patient.clinic?.name ?? 'Clínica'}
                </p>
              </div>
            </div>

            {/* Notes */}
            {patient.notes && (
              <div className="flex items-start gap-3 sm:col-span-2 lg:col-span-1">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Observações</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {patient.notes}
                  </p>
                </div>
              </div>
            )}

            {/* AI Toggle */}
            <div className="flex items-start gap-3">
              <div className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                patient.ai_enabled ? 'bg-primary/10' : 'bg-muted'
              )}>
                <Bot className={cn('h-4 w-4', patient.ai_enabled ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Inteligência Artificial</p>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={patient.ai_enabled}
                    onCheckedChange={handleToggleAI}
                  />
                  <span className={cn(
                    'text-sm font-medium',
                    patient.ai_enabled ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    {patient.ai_enabled ? 'IA Ativa' : 'IA Inativa'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Date Filter */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1">
          {[
            { label: 'Este mês', value: 'thisMonth' as const },
            { label: 'Mês anterior', value: 'lastMonth' as const },
            { label: 'Últimos 3 meses', value: 'last3Months' as const },
          ].map((p) => (
            <button
              key={p.value}
              onClick={() => {
                const today = new Date()
                if (p.value === 'thisMonth') setDateRange({ from: startOfMonth(today), to: endOfMonth(today) })
                else if (p.value === 'lastMonth') { const prev = subMonths(today, 1); setDateRange({ from: startOfMonth(prev), to: endOfMonth(prev) }) }
                else setDateRange({ from: startOfMonth(subMonths(today, 2)), to: endOfMonth(today) })
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors text-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={format(dateRange.from, 'yyyy-MM-dd')}
            onChange={(e) => e.target.value && setDateRange((prev) => ({ ...prev, from: new Date(e.target.value + 'T00:00:00') }))}
            className="h-8 px-2 text-xs rounded-lg border border-input bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="date"
            value={format(dateRange.to, 'yyyy-MM-dd')}
            onChange={(e) => e.target.value && setDateRange((prev) => ({ ...prev, to: new Date(e.target.value + 'T00:00:00') }))}
            className="h-8 px-2 text-xs rounded-lg border border-input bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
      </div>

      {/* Summary */}
      <PatientSummary patientId={patient.id} sessionValue={patient.session_value} dateRange={dateRange} />

      {/* Tabs */}
      <Tabs defaultValue="sessions" className="mt-6">
        <TabsList>
          <TabsTrigger value="sessions" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Sessões
          </TabsTrigger>
          <TabsTrigger value="prontuario" className="gap-1.5">
            <FileText className="h-4 w-4" />
            Prontuário
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            <CreditCard className="h-4 w-4" />
            Pagamentos
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Mensagens
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions">
          <PatientSessions patientId={patient.id} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="prontuario">
          <PatientProntuario patientId={patient.id} />
        </TabsContent>

        <TabsContent value="payments">
          <PatientPayments patientId={patient.id} />
        </TabsContent>

        <TabsContent value="messages">
          <PatientMessages patientId={patient.id} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <PatientForm
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        patient={patient}
      />

      {/* Test Message Dialog */}
      <SendTestMessageDialog
        open={testMessageOpen}
        onOpenChange={setTestMessageOpen}
        patientId={patient.id}
        patientName={patient.full_name}
        patientPhone={patient.phone}
        sessionValue={patient.session_value}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Excluir paciente</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir{' '}
              <span className="font-medium text-foreground">
                {patient.full_name}
              </span>
              ? Esta ação pode ser revertida pelo suporte.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={softDelete.isPending}
            >
              {softDelete.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
