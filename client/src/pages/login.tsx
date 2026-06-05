import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { LogoIcon } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { Redirect } from 'wouter'

export default function Login() {
  const { user, loading } = useAuth()
  const [, navigate] = useHashLocation()
  const { toast } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  if (!loading && user) {
    return <Redirect to="/projetos" />
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      navigate('/projetos')
    } catch (err: any) {
      toast({
        title: 'Erro ao entrar',
        description: err.message || 'Verifique suas credenciais.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!email) {
      toast({ title: 'Informe o e-mail', description: 'Digite seu e-mail para receber o link de redefinição.', variant: 'destructive' })
      return
    }
    setIsResetting(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#/reset-password`,
      })
      if (error) throw error
      toast({ title: 'E-mail enviado!', description: 'Verifique sua caixa de entrada para redefinir a senha.' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[360px] space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <LogoIcon size={56} />
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-wide">
              BIM FIRE HIDRO CALC
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Cálculo de Hidrantes — NBR 5626 / NPT 022
            </p>
          </div>
        </div>

        <Card className="border-border shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Entrar</CardTitle>
            <CardDescription>Acesse sua conta para continuar</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="text-right">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={isResetting}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {isResetting ? 'Enviando...' : 'Esqueci minha senha'}
                </button>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Entrar
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              Não tem conta?{' '}
              <Link href="/cadastro" className="text-primary hover:underline font-medium">
                Criar conta gratuita
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
