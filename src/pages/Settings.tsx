import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Save, Eye, EyeOff, KeyRound } from 'lucide-react'

export default function Settings() {
  const { profile } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [crp, setCrp] = useState(profile?.crp || '')
  const [saving, setSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, phone, crp })
        .eq('id', profile.id)

      if (error) throw error
      toast.success('Perfil atualizado!')
    } catch (error) {
      toast.error('Erro ao salvar perfil', {
        description: error instanceof Error ? error.message : 'Erro desconhecido',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter no mínimo 6 caracteres')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem')
      return
    }
    setSavingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success('Senha alterada com sucesso!')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      toast.error('Erro ao alterar senha', {
        description: error instanceof Error ? error.message : 'Erro desconhecido',
      })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="text-2xl font-bold text-foreground mb-6">Configurações</h1>

      <div className="bg-surface border border-border rounded-xl p-6 max-w-lg">
        <h2 className="text-lg font-semibold text-foreground mb-4">Meu Perfil</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nome completo</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Telefone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 99999-9999"
              className="w-full h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">CRP</label>
            <input
              type="text"
              value={crp}
              onChange={(e) => setCrp(e.target.value)}
              placeholder="06/12345"
              className="w-full h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors placeholder:text-muted-foreground"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-10 px-4 bg-primary hover:bg-primary-dark text-primary-foreground rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6 max-w-lg mt-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound size={18} className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Alterar Senha</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nova senha</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full h-10 px-3 pr-10 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Confirmar nova senha</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full h-10 px-3 pr-10 rounded-lg border border-input bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={savingPassword || !newPassword || !confirmPassword}
            className="h-10 px-4 bg-primary hover:bg-primary-dark text-primary-foreground rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <KeyRound size={16} />
            {savingPassword ? 'Salvando...' : 'Alterar senha'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
