import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign,
  Clock,
  Users,
  Calendar,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  ChevronRight,
  X,
} from 'lucide-react'
import { useDashboardStats, useRevenueHistory, useDashboardDetails } from '@/hooks/useDashboardStats'
import type { DashboardMetric } from '@/hooks/useDashboardStats'
import { formatCurrency, formatPercent, formatPhone } from '@/lib/formatters'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

const METRIC_LABELS: Record<DashboardMetric, string> = {
  revenue: 'Receita do Mês',
  pending: 'Pendente',
  activePatients: 'Pacientes Ativos',
  sessions: 'Sessões do Mês',
  noShows: 'Faltas do Mês',
}

const METRIC_VALUE_LABELS: Record<DashboardMetric, string> = {
  revenue: 'Pago',
  pending: 'Pendente',
  activePatients: 'Telefone',
  sessions: 'Sessões',
  noShows: 'Faltas',
}

export default function Dashboard() {
  const { data: stats, isLoading: loadingStats } = useDashboardStats()
  const { data: revenueHistory, isLoading: loadingHistory } = useRevenueHistory()
  const [activeMetric, setActiveMetric] = useState<DashboardMetric | null>(null)
  const { data: details, isLoading: loadingDetails } = useDashboardDetails(activeMetric)
  const navigate = useNavigate()

  const toggleMetric = (metric: DashboardMetric) => {
    setActiveMetric((prev) => (prev === metric ? null : metric))
  }

  const formatDetailValue = (metric: DashboardMetric, value: string) => {
    if (metric === 'revenue' || metric === 'pending') return formatCurrency(Number(value))
    if (metric === 'activePatients') return formatPhone(value)
    if (metric === 'sessions') return `${value} sessão${Number(value) > 1 ? 'es' : ''}`
    return `${value} falta${Number(value) > 1 ? 's' : ''}`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* Stat Cards */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
      >
        <StatCard
          icon={DollarSign}
          label="Receita do Mês"
          value={loadingStats ? null : formatCurrency(stats?.monthRevenue ?? 0)}
          color="text-success"
          bgColor="bg-success-light"
          active={activeMetric === 'revenue'}
          onClick={() => toggleMetric('revenue')}
        />
        <StatCard
          icon={Clock}
          label="Pendente"
          value={loadingStats ? null : formatCurrency(stats?.pendingAmount ?? 0)}
          color="text-warning"
          bgColor="bg-warning-light"
          active={activeMetric === 'pending'}
          onClick={() => toggleMetric('pending')}
        />
        <StatCard
          icon={Users}
          label="Pacientes Ativos"
          value={loadingStats ? null : String(stats?.activePatients ?? 0)}
          color="text-primary"
          bgColor="bg-primary-light"
          active={activeMetric === 'activePatients'}
          onClick={() => toggleMetric('activePatients')}
        />
        <StatCard
          icon={Calendar}
          label="Sessões do Mês"
          value={loadingStats ? null : String(stats?.monthSessions ?? 0)}
          color="text-secondary"
          bgColor="bg-secondary-light"
          active={activeMetric === 'sessions'}
          onClick={() => toggleMetric('sessions')}
        />
        <StatCard
          icon={AlertTriangle}
          label="Taxa de Faltas"
          value={loadingStats ? null : formatPercent(stats?.noShowRate ?? 0)}
          color="text-destructive"
          bgColor="bg-destructive-light"
          active={activeMetric === 'noShows'}
          onClick={() => toggleMetric('noShows')}
        />
      </motion.div>

      {/* Detail Panel */}
      <AnimatePresence>
        {activeMetric && (
          <motion.div
            key="detail-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-surface border border-border rounded-xl">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <h3 className="font-semibold text-sm text-foreground">
                  {METRIC_LABELS[activeMetric]}
                </h3>
                <button
                  onClick={() => setActiveMetric(null)}
                  className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              {loadingDetails ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="w-8 h-8 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-20 ml-auto" />
                    </div>
                  ))}
                </div>
              ) : details && details.length > 0 ? (
                <div className="divide-y divide-border">
                  {details.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 cursor-pointer transition-colors group"
                      onClick={() => navigate(`/patients/${p.id}`)}
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {p.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                      <span className="text-sm text-muted-foreground ml-auto shrink-0">
                        {formatDetailValue(activeMetric, p.value)}
                      </span>
                      <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-primary shrink-0 transition-colors" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum dado encontrado para este mês.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="lg:col-span-2 bg-surface border border-border rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-semibold text-foreground">Receita</h2>
              <p className="text-sm text-muted-foreground">Últimos 6 meses</p>
            </div>
            <TrendingUp size={20} className="text-muted-foreground" />
          </div>
          {loadingHistory ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenueHistory} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#718096' }} />
                <YAxis tick={{ fontSize: 12, fill: '#718096' }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  }}
                />
                <Legend />
                <Bar dataKey="paid" name="Recebido" fill="#38A169" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pending" name="Pendente" fill="#ED8936" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="bg-surface border border-border rounded-xl p-6"
        >
          <h2 className="font-semibold text-foreground mb-4">Ações Rápidas</h2>
          <div className="space-y-3">
            <QuickAction href="/patients" label="Novo paciente" icon={Users} />
            <QuickAction href="/agenda" label="Agendar sessão" icon={Calendar} />
            <QuickAction href="/billing" label="Gerar cobranças" icon={DollarSign} />
            <QuickAction href="/whatsapp" label="Conectar WhatsApp" icon={ArrowUpRight} />
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string | null
  color: string
  bgColor: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <motion.div
      variants={fadeUp}
      className={cn(
        'bg-surface border rounded-xl p-5 shadow-soft cursor-pointer transition-all hover:shadow-elevated',
        active ? 'border-primary ring-1 ring-primary/20' : 'border-border',
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', bgColor)}>
          <Icon size={18} className={color} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
      {value === null ? (
        <div className="h-7 w-24 bg-muted rounded-md mt-1 animate-pulse" />
      ) : (
        <p className="text-xl font-bold text-foreground mt-1">{value}</p>
      )}
    </motion.div>
  )
}

function QuickAction({
  href,
  label,
  icon: Icon,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}) {
  return (
    <Link
      to={href}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted active:bg-muted/80 active:scale-[0.98] transition-all cursor-pointer group"
    >
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
        <Icon size={16} className="text-primary" />
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
      <ArrowUpRight size={14} className="text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  )
}
