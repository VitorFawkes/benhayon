import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, KeyRound, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

const resetSchema = z.object({
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
})

type ResetForm = z.infer<typeof resetSchema>

export default function ResetPassword() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isExpired, setIsExpired] = useState(false)
  const readyRef = useRef(false)

  const { register, handleSubmit, formState: { errors } } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  })

  useEffect(() => {
    function markReady() {
      if (!readyRef.current) {
        readyRef.current = true
        setIsReady(true)
      }
    }

    // The PASSWORD_RECOVERY event may have already fired (captured by AuthContext)
    // before this component mounts, so also check for an existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) markReady()
    })

    // Listen for PASSWORD_RECOVERY in case it fires after mount
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        markReady()
      }
    })

    // Timeout for expired/invalid links
    const timeout = setTimeout(() => {
      if (!readyRef.current) setIsExpired(true)
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function onSubmit(data: ResetForm) {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      await supabase.auth.signOut()
      toast.success('Senha redefinida com sucesso!')
      navigate('/login')
    } catch {
      toast.error('Erro ao redefinir senha. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Benhayon</h1>
          <p className="text-muted-foreground mt-2">Redefinir senha</p>
        </div>

        <div className="bg-surface rounded-xl shadow-card border border-border p-8">
          {isExpired && !isReady ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <KeyRound className="text-destructive" size={24} />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Link inválido ou expirado</h2>
              <p className="text-sm text-muted-foreground">
                Solicite um novo link de recuperação.
              </p>
              <Link
                to="/forgot-password"
                className="inline-block mt-4 text-sm text-primary hover:text-primary-dark font-medium transition-colors"
              >
                Solicitar novo link
              </Link>
            </div>
          ) : !isReady ? (
            <div className="text-center py-4">
              <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Verificando link de recuperação...</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <KeyRound size={20} className="text-primary" />
                <h2 className="text-xl font-semibold text-foreground">Nova senha</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Digite sua nova senha abaixo.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                    Nova senha
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="w-full h-10 px-3 pr-10 rounded-lg border border-input bg-surface text-foreground text-sm
                                 placeholder:text-muted-foreground
                                 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary
                                 transition-colors"
                      placeholder="••••••••"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-destructive text-xs mt-1">{errors.password.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-1.5">
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="w-full h-10 px-3 pr-10 rounded-lg border border-input bg-surface text-foreground text-sm
                                 placeholder:text-muted-foreground
                                 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary
                                 transition-colors"
                      placeholder="••••••••"
                      {...register('confirmPassword')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-destructive text-xs mt-1">{errors.confirmPassword.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-10 bg-primary hover:bg-primary-dark text-primary-foreground rounded-lg text-sm font-medium
                             transition-colors flex items-center justify-center gap-2
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    'Redefinir senha'
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center mt-6">
          <Link
            to="/login"
            className="text-sm text-primary hover:text-primary-dark font-medium transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft size={14} />
            Voltar para o login
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
