import { useState } from 'react'
import { useLocation } from 'wouter'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { LogoFull } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { LogOut, Users, FolderOpen, CreditCard, TrendingUp, Search, Pencil, Trash2, Plus, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'

type Assinatura = {
  id: number
  user_id: string
  status: string
  plano: string
  data_inicio?: string
  data_expiracao?: string
  limite_projetos?: number
  hotmart_subscription_id?: string
  email?: string
}

const PLANOS = ['gratuito', 'starter', 'pro']
const STATUS = ['ativo', 'inativo', 'cancelado']

export default function Admin() {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [busca, setBusca] = useState('')
  const [editAssinatura, setEditAssinatura] = useState<Assinatura | null>(null)
  const [editForm, setEditForm] = useState<Partial<Assinatura>>({})
  const [confirmarExcluir, setConfirmarExcluir] = useState<Assinatura | null>(null)
  const [modalNova, setModalNova] = useState(false)
  const [novaForm, setNovaForm] = useState({
    user_id: '',
    plano: 'starter',
    status: 'ativo',
    limite_projetos: '5',
    data_expiracao: '',
  })

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: assinaturas, isLoading: loadingAss, refetch: refetchAss } = useQuery<Assinatura[]>({
    queryKey: ['admin-assinaturas'],
    queryFn: async () => {
      // Busca assinaturas
      const { data: assData, error: assError } = await supabase
        .from('assinaturas')
        .select('*')
        .order('id', { ascending: false })
      if (assError) throw assError

      // Busca emails via Edge Function (requer admin)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        const SUPABASE_URL = 'https://nynoqixlyemicmnulbbc.supabase.co'
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55bm9xaXhseWVtaWNtbnVsYmJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjUwNTgsImV4cCI6MjA5NjAwMTA1OH0.I_L8o618Bt2VcwGn_OB362dDMl93O7YC3hfldgJCQIA'
        const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-list-users`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
          }
        })
        const json = await res.json()
        const emailMap: Record<string, string> = {}
        json.users?.forEach((u: any) => { emailMap[u.id] = u.email })
        return (assData ?? []).map(a => ({ ...a, email: emailMap[a.user_id] ?? '' }))
      } catch {
        return assData ?? []
      }
    },
  })

  const { data: projetos, isLoading: loadingProj } = useQuery({
    queryKey: ['admin-projetos-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, user_id, criado_em')
        .order('criado_em', { ascending: false })
        .limit(500)
      if (error) throw error
      return data ?? []
    },
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const salvarAssinatura = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Assinatura> }) => {
      const payload: any = {
        status: data.status,
        plano: data.plano,
        limite_projetos: data.plano === 'pro' ? null : Number(data.limite_projetos ?? 5),
        data_expiracao: data.data_expiracao || null,
      }
      const { error } = await supabase.from('assinaturas').update(payload).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-assinaturas'] })
      setEditAssinatura(null)
      toast({ title: 'Assinatura atualizada!' })
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  })

  const criarAssinatura = useMutation({
    mutationFn: async (form: typeof novaForm) => {
      const payload: any = {
        user_id: form.user_id.trim(),
        plano: form.plano,
        status: form.status,
        limite_projetos: form.plano === 'pro' ? null : Number(form.limite_projetos),
        data_inicio: new Date().toISOString(),
        data_expiracao: form.data_expiracao || null,
      }
      const { error } = await supabase.from('assinaturas').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-assinaturas'] })
      setModalNova(false)
      setNovaForm({ user_id: '', plano: 'starter', status: 'ativo', limite_projetos: '5', data_expiracao: '' })
      toast({ title: 'Assinatura criada!' })
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  })

  const excluirAssinatura = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('assinaturas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-assinaturas'] })
      setConfirmarExcluir(null)
      toast({ title: 'Assinatura removida' })
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  })

  // Ativar/desativar rápido
  const toggleStatus = useMutation({
    mutationFn: async ({ id, novoStatus }: { id: number; novoStatus: string }) => {
      const { error } = await supabase.from('assinaturas').update({ status: novoStatus }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-assinaturas'] })
      toast({ title: 'Status atualizado!' })
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  const totalAtivos = assinaturas?.filter(a => a.status === 'ativo').length ?? 0
  const totalStarter = assinaturas?.filter(a => a.plano === 'starter' && a.status === 'ativo').length ?? 0
  const totalPro = assinaturas?.filter(a => a.plano === 'pro' && a.status === 'ativo').length ?? 0
  const totalProjetos = projetos?.length ?? 0

  const assinaturasFiltradas = (assinaturas ?? []).filter(a => {
    if (!busca.trim()) return true
    const q = busca.toLowerCase()
    return (
      a.user_id?.toLowerCase().includes(q) ||
      a.email?.toLowerCase().includes(q) ||
      a.plano?.toLowerCase().includes(q) ||
      a.status?.toLowerCase().includes(q)
    )
  })

  const projetosPorUser = (userId: string) =>
    (projetos ?? []).filter(p => p.user_id === userId).length

  const statusIcon = (status: string) => {
    if (status === 'ativo') return <CheckCircle className="h-3.5 w-3.5 text-green-500" />
    if (status === 'cancelado') return <XCircle className="h-3.5 w-3.5 text-red-500" />
    return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
  }

  const statusColor = (status: string) => {
    if (status === 'ativo') return 'bg-green-100 text-green-700 border-green-200'
    if (status === 'cancelado') return 'bg-red-100 text-red-700 border-red-200'
    return 'bg-muted text-muted-foreground border-border'
  }

  const planoColor = (plano: string) => {
    if (plano === 'pro') return 'bg-amber-100 text-amber-700 border-amber-200'
    if (plano === 'starter') return 'bg-blue-100 text-blue-700 border-blue-200'
    return 'bg-muted text-muted-foreground border-border'
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const abrirEditar = (a: Assinatura) => {
    setEditAssinatura(a)
    setEditForm({
      status: a.status,
      plano: a.plano,
      limite_projetos: a.limite_projetos ?? 5,
      data_expiracao: a.data_expiracao ? a.data_expiracao.split('T')[0] : '',
    })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoFull />
            <Badge variant="secondary" className="text-xs font-semibold">Admin</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetchAss()} className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/projetos')}>Voltar</Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Painel Administrativo</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie usuários, planos e assinaturas</p>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Assinaturas', value: assinaturas?.length ?? 0, icon: Users, color: 'text-primary' },
            { label: 'Ativas', value: totalAtivos, icon: CheckCircle, color: 'text-green-600' },
            { label: 'Starter Ativos', value: totalStarter, icon: CreditCard, color: 'text-blue-600' },
            { label: 'Pro Ativos', value: totalPro, icon: TrendingUp, color: 'text-amber-600' },
          ].map(m => (
            <Card key={m.label} className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{m.label}</CardTitle>
                  <m.icon className={`h-4 w-4 ${m.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {loadingAss ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-3xl font-bold text-foreground">{m.value}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabela de assinaturas */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base">Contas e Assinaturas</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar email, plano..."
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    className="pl-8 h-8 text-xs w-52"
                  />
                </div>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setModalNova(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Nova assinatura
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingAss ? (
              <div className="p-6 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : assinaturasFiltradas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                {busca ? 'Nenhum resultado para a busca.' : 'Nenhuma assinatura cadastrada.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-muted-foreground">Email</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-muted-foreground">Plano</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="text-center py-2.5 px-4 text-xs font-semibold text-muted-foreground">Projetos</th>
                      <th className="text-center py-2.5 px-4 text-xs font-semibold text-muted-foreground">Limite</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-muted-foreground">Expiração</th>
                      <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assinaturasFiltradas.map(a => (
                      <tr key={a.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4 max-w-[220px]">
                          {a.email ? (
                            <span className="text-xs font-medium text-foreground truncate block">{a.email}</span>
                          ) : (
                            <span className="font-mono text-[10px] text-muted-foreground truncate block" title={a.user_id}>{a.user_id.slice(0, 16)}…</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold capitalize ${planoColor(a.plano)}`}>
                            {a.plano || 'gratuito'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5">
                            {statusIcon(a.status)}
                            <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${statusColor(a.status)}`}>
                              {a.status || 'inativo'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-center text-xs font-medium">
                          {loadingProj ? '…' : projetosPorUser(a.user_id)}
                        </td>
                        <td className="py-2.5 px-4 text-center text-xs">
                          {a.limite_projetos === null || a.plano === 'pro' ? '∞' : (a.limite_projetos ?? 5)}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground">
                          {a.data_expiracao ? new Date(a.data_expiracao).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1 justify-end">
                            {/* Toggle rápido ativo/inativo */}
                            {a.status === 'ativo' ? (
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-red-500"
                                title="Desativar"
                                onClick={() => toggleStatus.mutate({ id: a.id, novoStatus: 'inativo' })}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-green-500"
                                title="Ativar"
                                onClick={() => toggleStatus.mutate({ id: a.id, novoStatus: 'ativo' })}
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7"
                              title="Editar"
                              onClick={() => abrirEditar(a)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title="Excluir"
                              onClick={() => setConfirmarExcluir(a)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card resumo de projetos por usuário */}
        {!loadingProj && projetos && projetos.length > 0 && (
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Projetos criados ({totalProjetos})</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Últimos projetos são exibidos na tabela de assinaturas (coluna Projetos). Total de {totalProjetos} projetos na plataforma.
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Modal Editar Assinatura */}
      <Dialog open={!!editAssinatura} onOpenChange={open => !open && setEditAssinatura(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Assinatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-2 bg-muted rounded space-y-0.5">
              {editAssinatura?.email && (
                <p className="text-xs font-medium text-foreground">{editAssinatura.email}</p>
              )}
              <p className="text-[10px] font-mono text-muted-foreground break-all">{editAssinatura?.user_id}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Plano</Label>
                <Select value={editForm.plano} onValueChange={v => setEditForm(p => ({ ...p, plano: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLANOS.map(p => <SelectItem key={p} value={p} className="text-xs capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS.map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editForm.plano !== 'pro' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Limite de projetos</Label>
                <Input
                  type="number" min="1" className="h-8 text-xs"
                  value={editForm.limite_projetos ?? 5}
                  onChange={e => setEditForm(p => ({ ...p, limite_projetos: Number(e.target.value) }))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Data de expiração</Label>
              <Input
                type="date" className="h-8 text-xs"
                value={editForm.data_expiracao as string ?? ''}
                onChange={e => setEditForm(p => ({ ...p, data_expiracao: e.target.value }))}
              />
            </div>
          </div>
          <Separator />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditAssinatura(null)}>Cancelar</Button>
            <Button size="sm" disabled={salvarAssinatura.isPending}
              onClick={() => editAssinatura && salvarAssinatura.mutate({ id: editAssinatura.id, data: editForm })}>
              {salvarAssinatura.isPending && <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nova Assinatura */}
      <Dialog open={modalNova} onOpenChange={setModalNova}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Assinatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">User ID (UUID do Supabase Auth)</Label>
              <Input
                className="h-8 text-xs font-mono"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={novaForm.user_id}
                onChange={e => setNovaForm(p => ({ ...p, user_id: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Plano</Label>
                <Select value={novaForm.plano} onValueChange={v => setNovaForm(p => ({ ...p, plano: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLANOS.map(p => <SelectItem key={p} value={p} className="text-xs capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={novaForm.status} onValueChange={v => setNovaForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS.map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {novaForm.plano !== 'pro' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Limite de projetos</Label>
                <Input type="number" min="1" className="h-8 text-xs"
                  value={novaForm.limite_projetos}
                  onChange={e => setNovaForm(p => ({ ...p, limite_projetos: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Data de expiração (opcional)</Label>
              <Input type="date" className="h-8 text-xs"
                value={novaForm.data_expiracao}
                onChange={e => setNovaForm(p => ({ ...p, data_expiracao: e.target.value }))} />
            </div>
          </div>
          <Separator />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalNova(false)}>Cancelar</Button>
            <Button size="sm" disabled={criarAssinatura.isPending || !novaForm.user_id.trim()}
              onClick={() => criarAssinatura.mutate(novaForm)}>
              {criarAssinatura.isPending && <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmar exclusão */}
      <AlertDialog open={!!confirmarExcluir} onOpenChange={open => !open && setConfirmarExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá a assinatura do usuário <code className="text-xs">{confirmarExcluir?.email || confirmarExcluir?.user_id?.slice(0, 16) + '...'}</code>. O usuário voltará ao plano gratuito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => confirmarExcluir && excluirAssinatura.mutate(confirmarExcluir.id)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
