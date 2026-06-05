import { useState, useMemo } from 'react'
import { useLocation } from 'wouter'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { LogoFull } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Plus, Search, LogOut, Trash2, Copy, FolderOpen, AlertTriangle, ChevronRight, Flame, Pencil } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

const NORMAS = ['NBR 5626', 'NPT 022', 'IN 011', 'CBMSC 2023', 'CBMPR', 'Ambas (NBR + NPT)', 'Outra (especificar)']
const TIPOS_SISTEMA = ['TIPO 1', 'TIPO 2', 'TIPO 3', 'TIPO 4', 'TIPO 5', 'NBR 5626', 'NPT 022', 'PERSONALIZADO']

type Projeto = {
  id: number
  nome: string
  descricao: string
  tipo_sistema: string
  norma: string
  criado_em: string
  resp_nome: string
  resp_crea: string
  cliente_nome: string
  cliente_contato: string
  user_id: string
  tipo_sistema_nome_custom?: string
  tipo_sistema_vazao_custom?: number
  tipo_sistema_pressao_custom?: number
  tipo_sistema_dn_custom?: number
  tipo_sistema_descricao_custom?: string
}

interface NovoProjetoForm {
  nome: string
  descricao: string
  norma: string
  norma_custom: string
  tipo_sistema: string
  resp_nome: string
  resp_crea: string
  cliente_nome: string
  cliente_contato: string
  tipo_sistema_nome_custom: string
  tipo_sistema_vazao_custom: string
  tipo_sistema_pressao_custom: string
  tipo_sistema_dn_custom: string
  tipo_sistema_descricao_custom: string
}

const FORM_VAZIO: NovoProjetoForm = {
  nome: '',
  descricao: '',
  norma: 'NBR 5626',
  norma_custom: '',
  tipo_sistema: 'TIPO 1',
  resp_nome: '',
  resp_crea: '',
  cliente_nome: '',
  cliente_contato: '',
  tipo_sistema_nome_custom: '',
  tipo_sistema_vazao_custom: '',
  tipo_sistema_pressao_custom: '',
  tipo_sistema_dn_custom: '',
  tipo_sistema_descricao_custom: '',
}

export default function Projetos() {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState<NovoProjetoForm>(FORM_VAZIO)
  const [editProjeto, setEditProjeto] = useState<Projeto | null>(null)
  const [projetoParaExcluir, setProjetoParaExcluir] = useState<Projeto | null>(null)
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  // Query projetos
  const { data: projetos, isLoading } = useQuery<Projeto[]>({
    queryKey: ['projetos', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projetos')
        .select('*')
        .eq('user_id', user!.id)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  // Query assinatura
  const { data: assinatura } = useQuery({
    queryKey: ['assinatura', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('assinaturas')
        .select('*')
        .eq('user_id', user!.id)
        .single()
      return data
    },
    enabled: !!user,
  })

  const assinaturaAtiva = assinatura?.status === 'ativo'
  const planoAtual = assinatura?.plano ?? 'gratuito'
  const limiteProjetos = assinatura?.limite_projetos ?? 3
  const isIlimitado = planoAtual === 'pro' && assinaturaAtiva
  const atingiuLimite = !isIlimitado && (projetos?.length ?? 0) >= limiteProjetos
  const assinaturaExpirada = assinatura && !assinaturaAtiva
  const encodedEmail = encodeURIComponent(user?.email ?? '')
  const linkHotmartMensal   = `https://pay.hotmart.com/W106122422Y?off=ryocqtbi&email=${encodedEmail}`
  const linkHotmartPlugin   = `https://pay.hotmart.com/W106122422Y?off=0jmo96l5&email=${encodedEmail}`
  const linkHotmartIlimitado = `https://pay.hotmart.com/W106122422Y?off=kp490dsu&email=${encodedEmail}`
  // Aliases para compatibilidade com banners
  const linkHotmartStarter  = linkHotmartMensal
  const linkHotmartPro      = linkHotmartIlimitado

  const projetosFiltrados = useMemo(() => {
    if (!projetos) return []
    if (!busca.trim()) return projetos
    const q = busca.toLowerCase()
    return projetos.filter(p =>
      p.nome?.toLowerCase().includes(q) ||
      p.descricao?.toLowerCase().includes(q) ||
      p.cliente_nome?.toLowerCase().includes(q) ||
      p.resp_nome?.toLowerCase().includes(q)
    )
  }, [projetos, busca])

  // Mutation criar projeto
  const criarProjeto = useMutation({
    mutationFn: async (data: NovoProjetoForm) => {
      const payload: any = {
        nome: data.nome,
        descricao: data.descricao,
        norma: data.norma === 'Outra (especificar)' ? (data.norma_custom || 'Outra') : data.norma,
        tipo_sistema: data.tipo_sistema,
        resp_nome: data.resp_nome,
        resp_crea: data.resp_crea,
        cliente_nome: data.cliente_nome,
        cliente_contato: data.cliente_contato,
        user_id: user!.id,
        criado_em: new Date().toISOString(),
      }
      if (data.tipo_sistema === 'PERSONALIZADO') {
        payload.tipo_sistema_nome_custom = data.tipo_sistema_nome_custom
        payload.tipo_sistema_vazao_custom = parseFloat(data.tipo_sistema_vazao_custom) || null
        payload.tipo_sistema_pressao_custom = parseFloat(data.tipo_sistema_pressao_custom) || null
        payload.tipo_sistema_dn_custom = parseFloat(data.tipo_sistema_dn_custom) || null
        payload.tipo_sistema_descricao_custom = data.tipo_sistema_descricao_custom
      }
      const { error } = await supabase.from('projetos').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projetos', user?.id] })
      setModalAberto(false)
      setForm(FORM_VAZIO)
      toast({ title: 'Projeto criado!', description: 'O projeto foi criado com sucesso.' })
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    },
  })

  // Mutation editar projeto
  const editarProjetoMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: NovoProjetoForm }) => {
      const normaFinal = data.norma === 'Outra (especificar)' ? (data.norma_custom || data.norma) : data.norma
      const payload: any = {
        nome: data.nome,
        descricao: data.descricao,
        norma: normaFinal,
        tipo_sistema: data.tipo_sistema,
        resp_nome: data.resp_nome,
        resp_crea: data.resp_crea,
        cliente_nome: data.cliente_nome,
        cliente_contato: data.cliente_contato,
      }
      if (data.tipo_sistema === 'PERSONALIZADO') {
        payload.tipo_sistema_nome_custom = data.tipo_sistema_nome_custom
        payload.tipo_sistema_vazao_custom = parseFloat(data.tipo_sistema_vazao_custom) || null
        payload.tipo_sistema_pressao_custom = parseFloat(data.tipo_sistema_pressao_custom) || null
        payload.tipo_sistema_dn_custom = parseFloat(data.tipo_sistema_dn_custom) || null
        payload.tipo_sistema_descricao_custom = data.tipo_sistema_descricao_custom
      }
      const { error } = await supabase.from('projetos').update(payload).eq('id', id).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projetos', user?.id] })
      setModalAberto(false)
      setEditProjeto(null)
      setForm(FORM_VAZIO)
      toast({ title: 'Projeto atualizado!' })
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    },
  })

  // Mutation excluir
  const excluirProjeto = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('projetos').delete().eq('id', id).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projetos', user?.id] })
      toast({ title: 'Projeto excluído' })
      setProjetoParaExcluir(null)
    },
  })

  // Mutation duplicar
  const duplicarProjeto = useMutation({
    mutationFn: async (projeto: Projeto) => {
      const { id, criado_em, ...resto } = projeto
      const { error } = await supabase.from('projetos').insert({
        ...resto,
        nome: `${projeto.nome} (cópia)`,
        user_id: user!.id,
        criado_em: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projetos', user?.id] })
      toast({ title: 'Projeto duplicado!' })
    },
  })

  const openEditarProjeto = (projeto: Projeto) => {
    setEditProjeto(projeto)
    setForm({
      nome: projeto.nome || '',
      descricao: projeto.descricao || '',
      norma: NORMAS.includes(projeto.norma) ? projeto.norma : 'Outra (especificar)',
      norma_custom: NORMAS.includes(projeto.norma) ? '' : (projeto.norma || ''),
      tipo_sistema: projeto.tipo_sistema || 'TIPO 1',
      resp_nome: projeto.resp_nome || '',
      resp_crea: projeto.resp_crea || '',
      cliente_nome: projeto.cliente_nome || '',
      cliente_contato: projeto.cliente_contato || '',
      tipo_sistema_nome_custom: projeto.tipo_sistema_nome_custom || '',
      tipo_sistema_vazao_custom: projeto.tipo_sistema_vazao_custom?.toString() || '',
      tipo_sistema_pressao_custom: projeto.tipo_sistema_pressao_custom?.toString() || '',
      tipo_sistema_dn_custom: projeto.tipo_sistema_dn_custom?.toString() || '',
      tipo_sistema_descricao_custom: projeto.tipo_sistema_descricao_custom || '',
    })
    setModalAberto(true)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const handleSubmitProjeto = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) return
    criarProjeto.mutate(form)
  }

  const updateForm = (field: keyof NovoProjetoForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <LogoFull />
          <div className="flex items-center gap-2">
            <Button
              variant={assinaturaAtiva ? "outline" : "default"}
              size="sm"
              onClick={() => navigate('/planos')}
              className="hidden sm:flex text-xs gap-1.5"
            >
              {assinaturaAtiva ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  {planoAtual.charAt(0).toUpperCase() + planoAtual.slice(1)} — {isIlimitado ? '∞' : `${projetos?.length ?? 0}/${limiteProjetos}`}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                  Assinar
                </span>
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (atingiuLimite) {
                  toast({ title: 'Limite atingido', description: 'Faça upgrade para criar mais projetos.', variant: 'destructive' })
                  return
                }
                setModalAberto(true)
              }}
              className="flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Projeto</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* Banner assinatura expirada */}
        {assinaturaExpirada && (
          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">Sua assinatura está inativa. Renove para continuar usando todos os recursos.</span>
            </div>
            <div className="flex gap-2 shrink-0">
              <a href={linkHotmartStarter} target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium">
                Renovar Starter
              </a>
              <a href={linkHotmartPro} target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 bg-red-800 text-white rounded-md hover:bg-red-900 font-medium">
                Renovar Pro
              </a>
            </div>
          </div>
        )}

        {/* Banner limite de projetos */}
        {atingiuLimite && !assinaturaExpirada && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm">
                Limite de <strong>{limiteProjetos} projetos</strong> atingido (plano {planoAtual}).
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <a href={linkHotmartStarter} target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium">
                Starter
              </a>
              <a href={linkHotmartPro} target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 bg-amber-800 text-white rounded-md hover:bg-amber-900 font-medium">
                Pro — Ilimitado
              </a>
            </div>
          </div>
        )}

        {/* Barra de busca */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Pesquisar projetos..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 bg-card border-border rounded-lg"
          />
        </div>

        {/* Grid de projetos */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="border-border">
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : projetosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                {busca ? 'Nenhum projeto encontrado' : 'Sem projetos ainda'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {busca ? 'Tente outro termo de busca.' : 'Crie seu primeiro projeto de hidrantes.'}
              </p>
            </div>
            {!busca && (
              <Button onClick={() => setModalAberto(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar primeiro projeto
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projetosFiltrados.map(projeto => (
              <Card
                key={projeto.id}
                className="border-border cursor-pointer hover:shadow-md transition-all duration-200 relative group"
                onMouseEnter={() => setHoveredId(projeto.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => navigate(`/projeto/${projeto.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight line-clamp-2">{projeto.nome}</CardTitle>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {projeto.norma || 'NBR 5626'}
                    </Badge>
                  </div>
                  {projeto.tipo_sistema && (
                    <Badge variant="outline" className="w-fit text-xs mt-1">
                      {projeto.tipo_sistema === 'PERSONALIZADO' ? projeto.tipo_sistema_nome_custom || 'Personalizado' : projeto.tipo_sistema}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-1.5 pb-3">
                  {projeto.descricao && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{projeto.descricao}</p>
                  )}
                  <Separator className="my-2" />
                  <div className="grid grid-cols-2 gap-1">
                    {projeto.cliente_nome && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Cliente:</span> {projeto.cliente_nome}
                      </div>
                    )}
                    {projeto.resp_nome && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Resp.:</span> {projeto.resp_nome}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(projeto.criado_em).toLocaleDateString('pt-BR')}
                  </div>

                  {/* Hover actions */}
                  <div className={`flex gap-2 pt-1 transition-opacity ${hoveredId === projeto.id ? 'opacity-100' : 'opacity-0'}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 flex-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditarProjeto(projeto)
                      }}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 flex-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        duplicarProjeto.mutate(projeto)
                      }}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Duplicar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 flex-1 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        setProjetoParaExcluir(projeto)
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Excluir
                    </Button>
                  </div>

                  <div className={`flex items-center justify-end text-xs text-primary transition-opacity ${hoveredId === projeto.id ? 'opacity-100' : 'opacity-0'}`}>
                    Abrir <ChevronRight className="h-3 w-3 ml-0.5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Modal Novo Projeto */}
      <Dialog open={modalAberto} onOpenChange={(open) => { setModalAberto(open); if (!open) { setEditProjeto(null); setForm(FORM_VAZIO) } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editProjeto ? 'Editar Projeto' : 'Novo Projeto'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitProjeto} className="space-y-5">
            {/* Dados básicos */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-nome">Nome do projeto *</Label>
                <Input id="p-nome" value={form.nome} onChange={e => updateForm('nome', e.target.value)} required placeholder="Ex: Hidrantes Bloco A" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-desc">Descrição</Label>
                <Textarea id="p-desc" value={form.descricao} onChange={e => updateForm('descricao', e.target.value)} placeholder="Descrição opcional" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Norma</Label>
                  <Select value={form.norma} onValueChange={v => updateForm('norma', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NORMAS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {form.norma === 'Outra (especificar)' && (
                    <Input
                      className="mt-1.5"
                      placeholder="Ex: Decreto Estadual nº 1234"
                      value={form.norma_custom}
                      onChange={e => updateForm('norma_custom', e.target.value)}
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de sistema</Label>
                  <Select value={form.tipo_sistema} onValueChange={v => updateForm('tipo_sistema', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_SISTEMA.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Campos personalizado */}
            {form.tipo_sistema === 'PERSONALIZADO' && (
              <div className="space-y-3 p-3 bg-muted rounded-lg">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Configuração Personalizada</p>
                <div className="space-y-1.5">
                  <Label>Nome do tipo</Label>
                  <Input value={form.tipo_sistema_nome_custom} onChange={e => updateForm('tipo_sistema_nome_custom', e.target.value)} placeholder="Ex: Sistema Especial" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Vazão (l/min)</Label>
                    <Input type="number" value={form.tipo_sistema_vazao_custom} onChange={e => updateForm('tipo_sistema_vazao_custom', e.target.value)} placeholder="600" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Pressão (mca)</Label>
                    <Input type="number" value={form.tipo_sistema_pressao_custom} onChange={e => updateForm('tipo_sistema_pressao_custom', e.target.value)} placeholder="10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">DN (mm)</Label>
                    <Input type="number" value={form.tipo_sistema_dn_custom} onChange={e => updateForm('tipo_sistema_dn_custom', e.target.value)} placeholder="65" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Descrição</Label>
                  <Textarea value={form.tipo_sistema_descricao_custom} onChange={e => updateForm('tipo_sistema_descricao_custom', e.target.value)} rows={2} />
                </div>
              </div>
            )}

            <Separator />

            {/* Responsável */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Responsável Técnico</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={form.resp_nome} onChange={e => updateForm('resp_nome', e.target.value)} placeholder="Nome completo" />
                </div>
                <div className="space-y-1.5">
                  <Label>CREA/CAU</Label>
                  <Input value={form.resp_crea} onChange={e => updateForm('resp_crea', e.target.value)} placeholder="Nº registro" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Cliente */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome/Empresa</Label>
                  <Input value={form.cliente_nome} onChange={e => updateForm('cliente_nome', e.target.value)} placeholder="Nome ou empresa" />
                </div>
                <div className="space-y-1.5">
                  <Label>Contato</Label>
                  <Input value={form.cliente_contato} onChange={e => updateForm('cliente_contato', e.target.value)} placeholder="Telefone/e-mail" />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setModalAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={criarProjeto.isPending || editarProjetoMutation.isPending}>
                {(criarProjeto.isPending || editarProjetoMutation.isPending) && <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {editProjeto ? 'Salvar Alterações' : 'Criar Projeto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog excluir */}
      <AlertDialog open={!!projetoParaExcluir} onOpenChange={(open) => !open && setProjetoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              O projeto <strong>"{projetoParaExcluir?.nome}"</strong> e todos os seus hidrantes e trechos serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => projetoParaExcluir && excluirProjeto.mutate(projetoParaExcluir.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
