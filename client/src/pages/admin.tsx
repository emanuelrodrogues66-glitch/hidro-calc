import { useLocation } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { LogoFull } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { LogOut, Users, FolderOpen, CreditCard, TrendingUp } from 'lucide-react'

export default function Admin() {
  const { user } = useAuth()
  const [, navigate] = useLocation()

  const { data: assinaturas, isLoading: loadingAssinaturas } = useQuery({
    queryKey: ['admin-assinaturas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assinaturas')
        .select('*')
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const { data: projetos, isLoading: loadingProjetos } = useQuery({
    queryKey: ['admin-projetos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, nome, user_id, criado_em')
        .order('criado_em', { ascending: false })
        .limit(100)
      if (error) throw error
      return data
    },
  })

  const totalUsers = assinaturas?.length ?? 0
  const totalAtivos = assinaturas?.filter(a => a.status === 'ativo').length ?? 0
  const totalPro = assinaturas?.filter(a => a.plano === 'pro' && a.status === 'ativo').length ?? 0
  const totalProjetos = projetos?.length ?? 0

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const statusColor = (status: string) => {
    if (status === 'ativo') return 'bg-green-100 text-green-700'
    if (status === 'cancelado') return 'bg-red-100 text-red-700'
    return 'bg-muted text-muted-foreground'
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoFull />
            <Badge variant="secondary" className="text-xs">Admin</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/projetos')}>Voltar</Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Painel Administrativo</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral da plataforma</p>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Usuários', value: totalUsers, icon: Users, color: 'text-primary' },
            { label: 'Assinaturas Ativas', value: totalAtivos, icon: CreditCard, color: 'text-green-600' },
            { label: 'Plano Pro', value: totalPro, icon: TrendingUp, color: 'text-amber-600' },
            { label: 'Total Projetos', value: totalProjetos, icon: FolderOpen, color: 'text-blue-600' },
          ].map(m => (
            <Card key={m.label} className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{m.label}</CardTitle>
                  <m.icon className={`h-4 w-4 ${m.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {(loadingAssinaturas || loadingProjetos) ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-3xl font-bold text-foreground">{m.value}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabela de assinaturas */}
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Usuários e Assinaturas</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {loadingAssinaturas ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !assinaturas || assinaturas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma assinatura encontrada.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">User ID</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Plano</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Expiração</th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Limite Proj.</th>
                  </tr>
                </thead>
                <tbody>
                  {assinaturas.map(a => (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-4 font-mono text-xs text-muted-foreground truncate max-w-[160px]">{a.user_id}</td>
                      <td className="py-2 px-4">
                        <Badge variant="outline" className="text-xs capitalize">{a.plano || 'gratuito'}</Badge>
                      </td>
                      <td className="py-2 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(a.status || 'inativo')}`}>
                          {a.status || 'inativo'}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-xs text-muted-foreground">
                        {a.data_expiracao ? new Date(a.data_expiracao).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="py-2 px-4 text-right text-xs">
                        {a.limite_projetos === null ? '∞' : a.limite_projetos ?? 5}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
