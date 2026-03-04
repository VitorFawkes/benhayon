import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

const forgotSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

type ForgotForm = z.infer<typeof forgotSchema>

export default function ForgotPassword() {
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  })

  async function onSubmit(data: ForgotForm) {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      setSent(true)
      toast.success('E-mail de recuperação enviado!')
    } catch {
      toast.error('Erro ao enviar e-mail. Tente novamente.')
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
          <p className="text-muted-foreground mt-2">Recuperar senha</p>
        </div>

        <div className="bg-surface rounded-xl shadow-card border border-border p-8">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-success-light rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="text-success" size={24} />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">E-mail enviado!</h2>
              <p className="text-sm text-muted-foreground">
                Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-foreground mb-2">Esqueceu sua senha?</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Digite seu e-mail e enviaremos um link para redefinir sua senha.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                    'Enviar link de recuperação'
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
