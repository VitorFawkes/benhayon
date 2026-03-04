import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  DollarSign,
  Clock,
  Users,
  Calendar,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
} from 'lucide-react'
import { useDashboardStats, useRevenueHistory } from '@/hooks/useDashboardStats'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { cn } from '@/lib/utils'

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

export default function Dashboard() {
  const { data: stats, isLoading: loadingStats } = useDashboardStats()
  const { data: revenueHistory, isLoading: loadingHistory } = useRevenueHistory()

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
        />
        <StatCard
          icon={Clock}
          label="Pendente"
          value={loadingStats ? null : formatCurrency(stats?.pendingAmount ?? 0)}
          color="text-warning"
          bgColor="bg-warning-light"
        />
        <StatCard
          icon={Users}
          label="Pacientes Ativos"
          value={loadingStats ? null : String(stats?.activePatients ?? 0)}
          color="text-primary"
          bgColor="bg-primary-light"
        />
        <StatCard
          icon={Calendar}
          label="Sessões do Mês"
          value={loadingStats ? null : String(stats?.monthSessions ?? 0)}
          color="text-secondary"
          bgColor="bg-secondary-light"
        />
        <StatCard
          icon={AlertTriangle}
          label="Taxa de Faltas"
          value={loadingStats ? null : formatPercent(stats?.noShowRate ?? 0)}
          color="text-destructive"
          bgColor="bg-destructive-light"
        />
      </motion.div>

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
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string | null
  color: string
  bgColor: string
}) {
  return (
    <motion.div
      variants={fadeUp}
      className="bg-surface border border-border rounded-xl p-5 shadow-soft"
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
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors group"
    >
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
        <Icon size={16} className="text-primary" />
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
      <ArrowUpRight size={14} className="text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  )
}
