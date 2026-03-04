import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

const registerSchema = z.object({
  full_name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
})

type RegisterForm = z.infer<typeof registerSchema>

export default function Register() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  })

  async function onSubmit(data: RegisterForm) {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.full_name,
          },
        },
      })

      if (error) {
        if (error.message.includes('already registered')) {
          toast.error('Este e-mail já está cadastrado')
        } else {
          toast.error(error.message)
        }
        return
      }

      toast.success('Conta criada! Verifique seu e-mail para confirmar.')
      navigate('/login')
    } catch {
      toast.error('Erro ao criar conta. Tente novamente.')
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
          <p className="text-muted-foreground mt-2">Crie sua conta</p>
        </div>

        <div className="bg-surface rounded-xl shadow-card border border-border p-8">
          <h2 className="text-xl font-semibold text-foreground mb-6">Cadastro</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-foreground mb-1.5">
                Nome completo
              </label>
              <input
                id="full_name"
                type="text"
                autoComplete="name"
                className="w-full h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm
                           placeholder:text-muted-foreground
                           focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary
                           transition-colors"
                placeholder="Seu nome completo"
                {...register('full_name')}
              />
              {errors.full_name && (
                <p className="text-destructive text-xs mt-1">{errors.full_name.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="w-full h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm
                           placeholder:text-muted-foreground
                           focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary
                           transition-colors"
                placeholder="seu@email.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-destructive text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                Senha
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
                  placeholder="Mínimo 6 caracteres"
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
                Confirmar senha
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className="w-full h-10 px-3 rounded-lg border border-input bg-surface text-foreground text-sm
                           placeholder:text-muted-foreground
                           focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary
                           transition-colors"
                placeholder="Repita a senha"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-destructive text-xs mt-1">{errors.confirmPassword.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 bg-primary hover:bg-primary-dark text-primary-foreground rounded-lg text-sm font-medium
                         transition-colors flex items-center justify-center gap-2 mt-2
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus size={16} />
                  Criar conta
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Já tem conta?{' '}
          <Link to="/login" className="text-primary hover:text-primary-dark font-medium transition-colors">
            Entrar
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
