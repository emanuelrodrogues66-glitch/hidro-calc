import { useState, useRef, useEffect, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useParams, useLocation } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { calcularResultados, calcCE, calcCETotal, parsearCSVRevit, mapearFamiliaParaTipo, TIPOS_PECAS, DNS_DISPONIVEIS, type Hidrante, type Trecho, type Peca } from '@/lib/calc'
import { LogoIcon } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft, Plus, Pencil, Trash2, Copy, Download, FileText, Droplets, Flame, Upload, GripVertical } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Types ────────────────────────────────────────────────────────────────────

type DBHidrante = Hidrante & {
  id: number
  projeto_id: number
  user_id: string
}

type DBTrecho = Trecho & {
  id: number
  hidrante_id: number
  user_id: string
}

type DBProjeto = {
  id: number
  nome: string
  norma: string
  descricao: string
  resp_nome: string
  resp_crea: string
  cliente_nome: string
  tipo_sistema: string
}

// ─── Hidrante Form Default ────────────────────────────────────────────────────
const HIDRANTE_VAZIO = {
  nome: '',
  ordem: 1,
  pressao_minima: 10,
  vazao_minima: 600,
  fator_seguranca: 1.10,
  bomba_modelo: '',
  bomba_marca: '',
  bomba_vazao_nominal: '',
  bomba_pressao_nominal: '',
  bomba_potencia: '',
  bomba_rpm: '',
  bomba_obs: '',
}

// ─── Trecho Form Default ──────────────────────────────────────────────────────
const TRECHO_VAZIO = {
  nome: '',
  tipo_trecho: 'normal' as 'normal' | 'mangueira' | 'requinte' | 'hidrante',
  bitola: 50,
  comprimento_real: 0,
  altura_estatica: 0,
  pecas: [] as Peca[],
  vazao_trecho: 'herda' as 'herda' | 'fator' | 'custom',
  fator_hidrantes: 1,        // para vazao_trecho === 'fator'
  vazao_trecho_custom: 0,
  qtd_lances: 1,
  comprimento_por_lance: 15,
  d_interno_mangueira: 63,
  diametro_requinte: 14.585452,  // padrão mangueira 38mm conforme planilha
  k_fator_requinte: 1.0,
}

// ─── SortableTrechoRow ──────────────────────────────────────────────────────

function SortableTrechoRow({
  trecho,
  onEdit,
  onDelete,
}: {
  trecho: any
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: trecho.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? 'hsl(var(--muted))' : undefined,
  }
  return (
    <tr ref={setNodeRef} style={style} className="border-b border-border/50 hover:bg-muted/30">
      <td className="py-1.5 pl-2 pr-1 w-6">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </td>
      <td className="py-1.5 pr-3 font-medium">{trecho.nome}</td>
      <td className="py-1.5 pr-3">
        <span className="text-[10px] bg-secondary text-secondary-foreground rounded px-1.5 py-0.5">
            {trecho.tipo_trecho === 'hidrante' ? '🔥 H' : trecho.tipo_trecho}
          </span>
      </td>
      <td className="py-1.5 pr-3 text-right">{trecho.bitola}</td>
      <td className="py-1.5 pr-3 text-right">{trecho.comprimento_real}</td>
      <td className="py-1.5 pr-3 text-right">{trecho.altura_estatica}</td>
      <td className="py-1.5 pr-3 text-right">
        {trecho.vazao_trecho === 'fator'
          ? <span className="text-blue-600 font-medium">{(trecho as any).fator_hidrantes || 1}× Q</span>
          : trecho.vazao_trecho === 'custom'
            ? <span className="text-amber-600 font-medium">{trecho.vazao_trecho_custom} l/min</span>
            : <span className="text-muted-foreground">1× Q</span>
        }
      </td>
      <td className="py-1.5 pr-3 text-muted-foreground">
        {trecho.pecas?.length > 0 ? `${trecho.pecas.length} tipo(s)` : '—'}
      </td>
      <td className="py-1.5 text-right">
        <div className="flex gap-1 justify-end">
          <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </button>
          <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Projeto() {
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useHashLocation()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const projetoId = parseInt(id!)

  // Modals state
  const [modalHidrante, setModalHidrante] = useState(false)
  const [editHidrante, setEditHidrante] = useState<DBHidrante | null>(null)
  const [hidranteForm, setHidranteForm] = useState<typeof HIDRANTE_VAZIO>({ ...HIDRANTE_VAZIO })

  const [modalTrecho, setModalTrecho] = useState(false)
  const [trechoHidranteId, setTrechoHidranteId] = useState<number | null>(null)
  const [editTrecho, setEditTrecho] = useState<DBTrecho | null>(null)
  const [trechoForm, setTrechoForm] = useState<typeof TRECHO_VAZIO>({ ...TRECHO_VAZIO })

  const [confirmarExcluirHidrante, setConfirmarExcluirHidrante] = useState<DBHidrante | null>(null)
  const [confirmarExcluirTrecho, setConfirmarExcluirTrecho] = useState<DBTrecho | null>(null)
  const [modalImportCSV, setModalImportCSV] = useState(false)
  const [importCSVHidranteId, setImportCSVHidranteId] = useState<number | null>(null)
  const [importCSVPreview, setImportCSVPreview] = useState<ReturnType<typeof parsearCSVRevit>>([])
  const [importCSVLoading, setImportCSVLoading] = useState(false)
  const csvInputRef = useRef<HTMLInputElement>(null)

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: projeto, isLoading: loadingProjeto } = useQuery<DBProjeto>({
    queryKey: ['projeto', projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projetos')
        .select('*')
        .eq('id', projetoId)
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  const { data: hidrantes, isLoading: loadingHidrantes } = useQuery<DBHidrante[]>({
    queryKey: ['hidrantes', projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hidrantes')
        .select('*')
        .eq('projeto_id', projetoId)
        .eq('user_id', user!.id)
        .order('ordem', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  const { data: trechos } = useQuery<DBTrecho[]>({
    queryKey: ['trechos', projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trechos')
        .select('*')
        .in('hidrante_id', (hidrantes || []).map(h => h.id))
        .order('ordem', { ascending: true })
      if (error) throw error
      return (data || []).map(t => ({
        ...t,
        pecas: typeof t.pecas === 'string' ? JSON.parse(t.pecas || '[]') : (t.pecas || []),
      }))
    },
    enabled: !!hidrantes && hidrantes.length > 0,
  })


  // Refs para acesso sempre atualizado dentro de closures (listener Revit)
  const trechosRef = useRef<typeof trechos>(undefined)
  const hidrantesRef = useRef<typeof hidrantes>(undefined)
  useEffect(() => { trechosRef.current = trechos }, [trechos])
  useEffect(() => { hidrantesRef.current = hidrantes }, [hidrantes])
  // ── Mutations ──────────────────────────────────────────────────────────────

  const salvarHidrante = useMutation({
    mutationFn: async (form: typeof HIDRANTE_VAZIO) => {
      const payload = {
        nome: form.nome,
        ordem: Number(form.ordem),
        pressao_minima: Number(form.pressao_minima),
        vazao_minima: Number(form.vazao_minima),
        fator_seguranca: Number(form.fator_seguranca),
        bomba_modelo: form.bomba_modelo || null,
        bomba_marca: form.bomba_marca || null,
        bomba_vazao_nominal: form.bomba_vazao_nominal ? Number(form.bomba_vazao_nominal) : null,
        bomba_pressao_nominal: form.bomba_pressao_nominal ? Number(form.bomba_pressao_nominal) : null,
        bomba_potencia: form.bomba_potencia ? Number(form.bomba_potencia) : null,
        bomba_rpm: form.bomba_rpm ? Number(form.bomba_rpm) : null,
        bomba_obs: form.bomba_obs || null,
        projeto_id: projetoId,
        user_id: user!.id,
      }
      if (editHidrante) {
        const { error } = await supabase.from('hidrantes').update(payload).eq('id', editHidrante.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('hidrantes').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hidrantes', projetoId] })
      setModalHidrante(false)
      setEditHidrante(null)
      setHidranteForm({ ...HIDRANTE_VAZIO })
      toast({ title: editHidrante ? 'Hidrante atualizado!' : 'Hidrante adicionado!' })
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  })

  const excluirHidrante = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('hidrantes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hidrantes', projetoId] })
      queryClient.invalidateQueries({ queryKey: ['trechos', projetoId] })
      setConfirmarExcluirHidrante(null)
      toast({ title: 'Hidrante excluído' })
    },
  })

  const duplicarHidrante = useMutation({
    mutationFn: async (h: DBHidrante) => {
      // 1. Duplicar o hidrante
      const { id: hidId, user_id, projeto_id, ...rest } = h
      const { data: novoH, error: errH } = await supabase
        .from('hidrantes')
        .insert({ ...rest, projeto_id, nome: `${h.nome} (cópia)`, user_id: user!.id })
        .select()
        .single()
      if (errH) throw errH

      // 2. Copiar todos os trechos do hidrante original
      const { data: trechosOrig } = await supabase
        .from('trechos')
        .select('*')
        .eq('hidrante_id', hidId)
        .order('ordem')
      if (trechosOrig && trechosOrig.length > 0) {
        const novosTrechos = trechosOrig.map(({ id: _id, hidrante_id: _hid, user_id: _uid, ...t }: any) => ({
          ...t,
          hidrante_id: novoH.id,
          user_id: user!.id,
        }))
        const { error: errT } = await supabase.from('trechos').insert(novosTrechos)
        if (errT) throw errT
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hidrantes', projetoId] })
      queryClient.invalidateQueries({ queryKey: ['trechos', projetoId] })
      toast({ title: 'Hidrante duplicado!', description: 'Todos os trechos e peças foram copiados.' })
    },
    onError: (err: any) => toast({ title: 'Erro ao duplicar', description: err.message, variant: 'destructive' }),
  })

  const salvarTrecho = useMutation({
    mutationFn: async (form: typeof TRECHO_VAZIO) => {
      const nextOrdem = (trechos || []).filter(t => t.hidrante_id === trechoHidranteId).length + 1
      const payload = {
        nome: form.nome,
        tipo_trecho: form.tipo_trecho,
        bitola: Number(form.bitola),
        comprimento_real: Number(form.comprimento_real),
        altura_estatica: Number(form.altura_estatica),
        pecas: JSON.stringify(form.pecas),
        vazao_trecho: form.vazao_trecho,
        fator_hidrantes: form.vazao_trecho === 'fator' ? Number(form.fator_hidrantes) : null,
        vazao_trecho_custom: form.vazao_trecho === 'custom' ? Number(form.vazao_trecho_custom) : null,
        qtd_lances: (form.tipo_trecho === 'mangueira' || form.tipo_trecho === 'hidrante') ? Number(form.qtd_lances) : null,
        comprimento_por_lance: (form.tipo_trecho === 'mangueira' || form.tipo_trecho === 'hidrante') ? Number(form.comprimento_por_lance) : null,
        d_interno_mangueira: (form.tipo_trecho === 'mangueira' || form.tipo_trecho === 'hidrante') ? Number(form.d_interno_mangueira) : null,
        diametro_requinte: (form.tipo_trecho === 'requinte' || form.tipo_trecho === 'hidrante') ? Number(form.diametro_requinte) : null,
        k_fator_requinte: form.tipo_trecho === 'requinte' ? Number(form.k_fator_requinte) : null,
        hidrante_id: trechoHidranteId,
        user_id: user!.id,
        ordem: editTrecho ? editTrecho.ordem : nextOrdem,
      }
      if (editTrecho) {
        const { error } = await supabase.from('trechos').update(payload).eq('id', editTrecho.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('trechos').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trechos', projetoId] })
      setModalTrecho(false)
      setEditTrecho(null)
      setTrechoForm({ ...TRECHO_VAZIO })
      toast({ title: editTrecho ? 'Trecho atualizado!' : 'Trecho adicionado!' })
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  })

  const excluirTrecho = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('trechos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trechos', projetoId] })
      setConfirmarExcluirTrecho(null)
      toast({ title: 'Trecho excluído' })
    },
  })


  // ── Reordenar Trechos (drag & drop) ──────────────────────────────────────
  const handleDragEnd = useCallback(async (event: DragEndEvent, hidranteId: number) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const trechosDo = (trechos || []).filter(t => t.hidrante_id === hidranteId).sort((a, b) => a.ordem - b.ordem)
    const oldIndex = trechosDo.findIndex(t => t.id === active.id)
    const newIndex = trechosDo.findIndex(t => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordenados = arrayMove(trechosDo, oldIndex, newIndex)
    queryClient.setQueryData(['trechos', projetoId], (old: any[]) => {
      if (!old) return old
      const outros = old.filter(t => t.hidrante_id !== hidranteId)
      return [...outros, ...reordenados.map((t, i) => ({ ...t, ordem: i + 1 }))]
    })
    try {
      await Promise.all(reordenados.map((t, i) => supabase.from('trechos').update({ ordem: i + 1 }).eq('id', t.id)))
    } catch (err: any) {
      toast({ title: 'Erro ao reordenar', description: err.message, variant: 'destructive' })
      queryClient.invalidateQueries({ queryKey: ['trechos', projetoId] })
    }
  }, [trechos, projetoId, queryClient, toast])

  // ── Listener Revit (REVIT_TRECHO) ────────────────────────────────────────
  // Ref estável para user (evita recriar o listener a cada render)
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])

  useEffect(() => {
    // Função central que processa o payload vindo do Revit
    // Processa um lote de trechos do Revit sem duplicatas
    // hidranteId e trechosExistentes são buscados UMA vez antes do loop
    const processarLoteRevit = async (lista: any[]) => {
      const uid = userRef.current?.id
      if (!uid) {
        toast({ title: 'Usuário não autenticado', variant: 'destructive' })
        return []
      }

      // 1) Buscar hidrante uma vez só
      const { data: hidrantesBanco } = await supabase
        .from('hidrantes')
        .select('id')
        .eq('projeto_id', projetoId)
        .order('ordem', { ascending: true })
        .limit(1)

      if (!hidrantesBanco || hidrantesBanco.length === 0) {
        toast({ title: 'Nenhum hidrante', description: 'Crie um hidrante antes de importar do Revit.', variant: 'destructive' })
        return []
      }

      const hidranteId = hidrantesBanco[0].id

      // 2) Buscar todos os trechos existentes uma vez só
      const { data: trechosBanco } = await supabase
        .from('trechos')
        .select('*')
        .eq('hidrante_id', hidranteId)

      // Cache local para não re-buscar durante o loop
      const trechosCache: any[] = [...(trechosBanco || [])]
      let ordemMaxima = Math.max(0, ...trechosCache.map((t: any) => t.ordem || 0))

      const resultados: any[] = []

      for (const d of lista) {
        if (!d) continue

        // Mapear peças
        const pecasRevit: Peca[] = (d.pecas || [])
          .map((p: any) => {
            const tipo = mapearFamiliaParaTipo(p.familiaOriginal || '', p.tamanho || '')
              ?? (p.familiaOriginal || TIPOS_PECAS[0])
            return { tipo, quantidade: Number(p.quantidade) || 1 }
          })
          .filter((p: Peca) => p.quantidade > 0)

        const nomeTrechoRevit = (d.nomeTrecho || '').trim().toUpperCase()

        // Buscar no cache local (inclui trechos criados neste mesmo lote)
        const trechoExistente = trechosCache.find(
          (t: any) => (t.nome || '').trim().toUpperCase() === nomeTrechoRevit
        )

        if (trechoExistente) {
          // Trecho já existe — adicionar apenas peças novas
          const pecasAtuais: Peca[] = Array.isArray(trechoExistente.pecas)
            ? trechoExistente.pecas
            : JSON.parse(trechoExistente.pecas || '[]')

          const tiposExistentes = new Set(pecasAtuais.map((p: Peca) => p.tipo.trim().toUpperCase()))
          const pecasNovas = pecasRevit.filter(p => !tiposExistentes.has(p.tipo.trim().toUpperCase()))

          if (pecasNovas.length === 0) {
            resultados.push({ atualizado: trechoExistente.nome, pecasAdicionadas: 0 })
            continue
          }

          const pecasMescladas = [...pecasAtuais, ...pecasNovas]
          const { error } = await supabase
            .from('trechos')
            .update({ pecas: JSON.stringify(pecasMescladas) })
            .eq('id', trechoExistente.id)

          if (error) {
            toast({ title: `Erro ao atualizar "${d.nomeTrecho}"`, description: error.message, variant: 'destructive' })
          } else {
            // Atualizar cache local
            trechoExistente.pecas = pecasMescladas
            resultados.push({ atualizado: trechoExistente.nome, pecasAdicionadas: pecasNovas.length })
          }

        } else {
          // Trecho novo — criar e adicionar ao cache local
          ordemMaxima += 1
          const payload = {
            nome: d.nomeTrecho || 'Trecho Revit',
            tipo_trecho: 'normal' as const,
            bitola: 50,
            comprimento_real: Number(d.comprimentoReal) || 0,
            altura_estatica: 0,
            pecas: JSON.stringify(pecasRevit),
            vazao_trecho: 'herda' as const,
            fator_hidrantes: 1,
            vazao_trecho_custom: null,
            qtd_lances: null,
            comprimento_por_lance: null,
            d_interno_mangueira: null,
            diametro_requinte: null,
            k_fator_requinte: null,
            hidrante_id: hidranteId,
            user_id: uid,
            ordem: ordemMaxima,
          }

          const { data: inserted, error } = await supabase
            .from('trechos')
            .insert(payload)
            .select()
            .single()

          if (error) {
            toast({ title: `Erro ao criar "${d.nomeTrecho}"`, description: error.message, variant: 'destructive' })
          } else {
            // Adicionar ao cache para que trechos seguintes no lote não dupliquem
            trechosCache.push(inserted)
            resultados.push({ criado: d.nomeTrecho })
          }
        }
      }

      return resultados
    }

    // Compatibilidade: trecho único usa o mesmo processador de lote
    const processarTrechoRevit = async (d: any) => {
      const resultados = await processarLoteRevit([d])
      return resultados[0]
    }

    // Canal 1: window.postMessage (funciona quando app está em aba normal)
    const handler = (evt: MessageEvent) => {
      if (!evt.data) return
      const data = evt.data
      if (data.type === 'REVIT_TRECHO') {
        processarTrechoRevit(data.data)
      } else if (data.type === 'REVIT_TRECHOS_LOTE') {
        const lista = Array.isArray(data.data) ? data.data : []
        if (lista.length === 0) return
        ;(async () => {
          const resultados = await processarLoteRevit(lista)
          queryClient.invalidateQueries({ queryKey: ['trechos', projetoId] })
          const criados    = resultados.filter(r => r?.criado).length
          const atualizados = resultados.filter(r => r?.atualizado && r.pecasAdicionadas > 0)
          const semAlteracao = resultados.filter(r => r?.atualizado && r.pecasAdicionadas === 0).length
          const totalPecasAdicionadas = atualizados.reduce((s: number, r: any) => s + r.pecasAdicionadas, 0)
          const partes = []
          if (criados) partes.push(`${criados} trecho(s) novo(s)`)
          if (atualizados.length) partes.push(`${atualizados.length} atualizado(s) (+${totalPecasAdicionadas} peça(s))`)
          if (semAlteracao) partes.push(`${semAlteracao} sem alteração`)
          toast({
            title: `✓ Revit → ${lista.length} trecho(s) processados`,
            description: partes.join(' · ') || 'Nenhuma alteração necessária',
          })
        })()
      }
    }
    window.addEventListener('message', handler)

    // Canal 2a: trecho único
    ;(window as any).__revitTrecho__ = (jsonStr: string) => {
      try {
        const d = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr
        processarTrechoRevit(d).then((r: any) => {
          queryClient.invalidateQueries({ queryKey: ['trechos', projetoId] })
          if (r?.criado) toast({ title: `✓ "${r.criado}" criado` })
          else if (r?.atualizado && r.pecasAdicionadas > 0)
            toast({ title: `✓ "${r.atualizado}" atualizado`, description: `+${r.pecasAdicionadas} peça(s) nova(s) adicionada(s)` })
          else if (r?.atualizado)
            toast({ title: `"${r.atualizado}" sem alteração`, description: 'Todas as peças já estavam presentes.' })
        })
      } catch (e) {
        console.error('Erro ao parsear trecho do Revit:', e)
      }
    }

    // Canal 2b: lote de trechos
    ;(window as any).__revitTrechosLote__ = (jsonStr: string) => {
      try {
        const lista = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr
        if (!Array.isArray(lista) || lista.length === 0) return
        ;(async () => {
          const resultados = await processarLoteRevit(lista)
          queryClient.invalidateQueries({ queryKey: ['trechos', projetoId] })
          const criados    = resultados.filter(r => r?.criado).length
          const atualizados = resultados.filter(r => r?.atualizado && r.pecasAdicionadas > 0)
          const semAlteracao = resultados.filter(r => r?.atualizado && r.pecasAdicionadas === 0).length
          const totalPecasAdicionadas = atualizados.reduce((s: number, r: any) => s + r.pecasAdicionadas, 0)
          const partes = []
          if (criados) partes.push(`${criados} trecho(s) novo(s)`)
          if (atualizados.length) partes.push(`${atualizados.length} atualizado(s) (+${totalPecasAdicionadas} peça(s))`)
          if (semAlteracao) partes.push(`${semAlteracao} sem alteração`)
          toast({ title: `✓ Revit → ${lista.length} trecho(s) processados`, description: partes.join(' · ') || 'Nenhuma alteração necessária' })
        })()
      } catch (e) {
        console.error('Erro ao parsear trechos em lote do Revit:', e)
      }
    }

    return () => {
      window.removeEventListener('message', handler)
      delete (window as any).__revitTrecho__
      delete (window as any).__revitTrechosLote__
    }
  }, [])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getTrechosDo = (hidranteId: number): DBTrecho[] =>
    (trechos || []).filter(t => t.hidrante_id === hidranteId).sort((a, b) => a.ordem - b.ordem)

  const ordemLabel = (ordem: number) => {
    const labels: Record<number, string> = { 1: '1º', 2: '2º', 3: '3º', 4: '4º', 5: '5º' }
    return labels[ordem] || `${ordem}º`
  }

  const openModalHidrante = (h?: DBHidrante) => {
    if (h) {
      setEditHidrante(h)
      setHidranteForm({
        nome: h.nome,
        ordem: h.ordem,
        pressao_minima: h.pressao_minima,
        vazao_minima: h.vazao_minima,
        fator_seguranca: h.fator_seguranca,
        bomba_modelo: h.bomba_modelo || '',
        bomba_marca: h.bomba_marca || '',
        bomba_vazao_nominal: h.bomba_vazao_nominal?.toString() || '',
        bomba_pressao_nominal: h.bomba_pressao_nominal?.toString() || '',
        bomba_potencia: h.bomba_potencia?.toString() || '',
        bomba_rpm: h.bomba_rpm?.toString() || '',
        bomba_obs: h.bomba_obs || '',
      })
    } else {
      setEditHidrante(null)
      setHidranteForm({ ...HIDRANTE_VAZIO })
    }
    setModalHidrante(true)
  }

  const openModalTrecho = (hidranteId: number, t?: DBTrecho) => {
    setTrechoHidranteId(hidranteId)
    if (t) {
      setEditTrecho(t)
      setTrechoForm({
        nome: t.nome,
        tipo_trecho: t.tipo_trecho,
        bitola: t.bitola || 50,
        comprimento_real: t.comprimento_real,
        altura_estatica: t.altura_estatica,
        pecas: t.pecas || [],
        vazao_trecho: (t.vazao_trecho === 'multiplicar' ? 'fator' : t.vazao_trecho) as 'herda' | 'fator' | 'custom',
        fator_hidrantes: (t as any).fator_hidrantes || 1,
        vazao_trecho_custom: t.vazao_trecho_custom || 0,
        qtd_lances: t.qtd_lances || 1,
        comprimento_por_lance: t.comprimento_por_lance || 15,
        d_interno_mangueira: t.d_interno_mangueira || 63,
        diametro_requinte: t.diametro_requinte ?? 14.585452,
        k_fator_requinte: t.k_fator_requinte || 1.0,
      })
    } else {
      setEditTrecho(null)
      setTrechoForm({ ...TRECHO_VAZIO })
    }
    setModalTrecho(true)
  }

  const updateTrechoForm = (field: string, value: any) => {
    setTrechoForm(prev => ({ ...prev, [field]: value }))
  }

  const addPeca = (tipo: string) => {
    setTrechoForm(prev => {
      const existing = prev.pecas.find(p => p.tipo === tipo)
      if (existing) {
        return { ...prev, pecas: prev.pecas.map(p => p.tipo === tipo ? { ...p, quantidade: p.quantidade + 1 } : p) }
      }
      return { ...prev, pecas: [...prev.pecas, { tipo, quantidade: 1 }] }
    })
  }

  const updatePeca = (tipo: string, quantidade: number) => {
    setTrechoForm(prev => ({
      ...prev,
      pecas: quantidade <= 0
        ? prev.pecas.filter(p => p.tipo !== tipo)
        : prev.pecas.map(p => p.tipo === tipo ? { ...p, quantidade } : p),
    }))
  }

  const abrirImportCSV = (hidranteId: number) => {
    setImportCSVHidranteId(hidranteId)
    setImportCSVPreview([])
    setModalImportCSV(true)
  }

  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const parsed = parsearCSVRevit(text)
        setImportCSVPreview(parsed)
        if (parsed.length === 0) {
          toast({ title: 'Nenhum trecho encontrado', description: 'Verifique se o arquivo e uma exportacao valida do Revit.', variant: 'destructive' })
        }
      } catch {
        toast({ title: 'Erro ao ler CSV', description: 'Arquivo invalido.', variant: 'destructive' })
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const confirmarImportCSV = async () => {
    if (!importCSVHidranteId || importCSVPreview.length === 0) return
    setImportCSVLoading(true)
    try {
      const trechosExistentes = (trechos || []).filter(t => t.hidrante_id === importCSVHidranteId)
      let nextOrdem = trechosExistentes.length + 1
      for (const tr of importCSVPreview) {
        const payload = {
          nome: tr.nome,
          tipo_trecho: 'normal' as const,
          bitola: tr.dnDominante,
          comprimento_real: 0,
          altura_estatica: 0,
          pecas: JSON.stringify(tr.pecas),
          vazao_trecho: 'herda' as const,
          vazao_trecho_custom: null,
          qtd_lances: null,
          comprimento_por_lance: null,
          d_interno_mangueira: null,
          diametro_requinte: null,
          k_fator_requinte: null,
          hidrante_id: importCSVHidranteId,
          ordem: nextOrdem++,
          user_id: user!.id,
        }
        await supabase.from('trechos').insert(payload)
      }
      queryClient.invalidateQueries({ queryKey: ['trechos', projetoId] })
      setModalImportCSV(false)
      setImportCSVPreview([])
      toast({ title: `${importCSVPreview.length} trechos importados!`, description: 'Defina os comprimentos reais de cada trecho.' })
    } catch (err: any) {
      toast({ title: 'Erro na importacao', description: err.message, variant: 'destructive' })
    } finally {
      setImportCSVLoading(false)
    }
  }

  // ── Export Functions ───────────────────────────────────────────────────────

  const exportarCSV = (hidrante: DBHidrante) => {
    const trechosDo = getTrechosDo(hidrante.id)
    if (trechosDo.length === 0) {
      toast({ title: 'Sem trechos', description: 'Adicione trechos para exportar.', variant: 'destructive' })
      return
    }
    const resultados = calcularResultados(hidrante, trechosDo)
    const header = 'Trecho,Tipo,Bitola(mm),L.Real(m),L.Equiv(m),L.Total(m),H.Est(m),Vazão(l/min),Veloc.(m/s),J(m/m),hf(m),Hf acum.(m),H.Est acum.(m),H din.(mca)\n'
    const rows = resultados.map(r =>
      `${r.trecho},${r.tipo},${r.bitola},${r.comprimento_real.toFixed(2)},${r.comprimento_equiv.toFixed(2)},${r.comprimento_total.toFixed(2)},${r.altura_estatica.toFixed(2)},${r.vazao.toFixed(0)},${r.velocidade.toFixed(2)},${r.perda_carga_unitaria.toFixed(4)},${r.perda_carga.toFixed(2)},${r.hf_acumulado.toFixed(2)},${r.hest_acumulado.toFixed(2)},${r.pressao_acumulada.toFixed(2)}`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projeto?.nome || 'projeto'}_${hidrante.nome}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportarPDF = (hidrante: DBHidrante) => {
    const trechosDo = getTrechosDo(hidrante.id)
    if (trechosDo.length === 0) {
      toast({ title: 'Sem trechos', description: 'Adicione trechos para gerar o memorial.', variant: 'destructive' })
      return
    }

    // ── 3 Pontos da Curva da Bomba ────────────────────────────────────────────
    // Ponto 1: Q adotado (vazao_minima * num_hidrantes), H = pressao acumulada
    const Q1 = hidrante.vazao_minima
    const res1 = calcularResultados(hidrante, trechosDo)
    const H1 = res1[res1.length - 1]?.pressao_acumulada ?? 0

    // Ponto 2: media de Q1 e Q3
    const Q3 = Q1 * hidrante.fator_seguranca
    const Q2 = (Q1 + Q3) / 2
    // Calcular H2 interpolando: usamos hidrante com vazao=Q2
    const hidr2 = { ...hidrante, vazao_minima: Q2 }
    const res2 = calcularResultados(hidr2, trechosDo)
    const H2 = res2[res2.length - 1]?.pressao_acumulada ?? 0

    // Ponto 3: Q + fator_seguranca
    const hidr3 = { ...hidrante, vazao_minima: Q3 }
    const res3 = calcularResultados(hidr3, trechosDo)
    const H3 = res3[res3.length - 1]?.pressao_acumulada ?? 0

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const W = 297
    const hoje = new Date().toLocaleDateString('pt-BR')

    const drawHeader = (pg: number, totalPg: number) => {
      doc.setFillColor(26, 58, 107)
      doc.rect(0, 0, W, 18, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('BIM FIRE HIDRO CALC', 15, 12)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('Calculo Hidraulico de Hidrantes — IN 011', 75, 12)
      doc.text(`Pag. ${pg} / ${totalPg}`, W - 30, 12)
    }

    const drawSubHeader = () => {
      doc.setFillColor(240, 244, 250)
      doc.rect(0, 18, W, 14, 'F')
      doc.setTextColor(26, 58, 107)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(`PROJETO: ${(projeto?.nome || '').toUpperCase()}`, 15, 26)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      doc.text(`Sistema: ${projeto?.tipo_sistema || ''} | Hidrante: ${hidrante.nome}`, 15, 31)
      doc.text(hoje, W - 30, 31)
    }

    const drawFooter = () => {
      doc.setFontSize(7)
      doc.setTextColor(150, 150, 150)
      doc.text('Gerado por BIM FIRE HIDRO CALC  |  Formula de Hazen-Williams: J = 0,00212 x (Q/60000)^1.85 / (D/1000)^4.87  |  NBR 5626', 15, 206)
    }

    // ── PAGINA 1: Dados + Curva + Planilha ───────────────────────────────────
    drawHeader(1, 1)
    drawSubHeader()

    let y = 38
    // Dados do sistema
    doc.setFillColor(230, 236, 246)
    doc.rect(10, y, W - 20, 6, 'F')
    doc.setTextColor(26, 58, 107)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('DADOS DO SISTEMA', 15, y + 4.5)
    y += 8

    doc.setTextColor(40, 40, 40)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    const col1x = 15, col2x = 110
    doc.setFont('helvetica', 'bold'); doc.text('Tipo de sistema:', col1x, y + 4); doc.setFont('helvetica', 'normal'); doc.text(projeto?.tipo_sistema || '-', col1x + 35, y + 4)
    doc.setFont('helvetica', 'bold'); doc.text('No de trechos calculados:', col2x, y + 4); doc.setFont('helvetica', 'normal'); doc.text(String(trechosDo.length), col2x + 48, y + 4)
    y += 6
    doc.setFont('helvetica', 'bold'); doc.text('Vazao minima:', col1x, y + 4); doc.setFont('helvetica', 'normal'); doc.text(`${hidrante.vazao_minima} l/min  (${(hidrante.vazao_minima * 0.06).toFixed(3)} m3/h)`, col1x + 30, y + 4)
    doc.setFont('helvetica', 'bold'); doc.text('Normas aplicaveis:', col2x, y + 4); doc.setFont('helvetica', 'normal'); doc.text(projeto?.norma || 'IN 011', col2x + 37, y + 4)
    y += 6
    doc.setFont('helvetica', 'bold'); doc.text('Pressao minima no ponto desfavoravel:', col1x, y + 4); doc.setFont('helvetica', 'normal'); doc.text(`${hidrante.pressao_minima} m.c.a.`, col1x + 72, y + 4)
    y += 8

    // Curva da bomba - 3 boxes
    doc.setFillColor(230, 236, 246)
    doc.rect(10, y, W - 20, 6, 'F')
    doc.setTextColor(26, 58, 107)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('PONTOS PARA CURVA DA BOMBA', 15, y + 4.5)
    y += 8

    const boxW = (W - 24) / 3
    // Box 1 (azul claro)
    doc.setFillColor(214, 226, 246)
    doc.roundedRect(10, y, boxW, 24, 2, 2, 'F')
    doc.setTextColor(26, 58, 107)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text('1o Ponto (Q adotado)', 10 + boxW/2, y + 5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(`Q = ${Q1.toFixed(0)} l/min`, 10 + boxW/2, y + 12, { align: 'center' })
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.text(`= ${(Q1 * 0.06).toFixed(3)} m3/h`, 10 + boxW/2, y + 16.5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`H = ${H1.toFixed(4)} m.c.a.`, 10 + boxW/2, y + 21.5, { align: 'center' })

    // Box 2 (azul medio)
    const b2x = 12 + boxW
    doc.setFillColor(190, 210, 240)
    doc.roundedRect(b2x, y, boxW, 24, 2, 2, 'F')
    doc.setTextColor(26, 58, 107)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text('2o Ponto (media Q1+Q3)', b2x + boxW/2, y + 5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(`Q = ${Q2.toFixed(0)} l/min`, b2x + boxW/2, y + 12, { align: 'center' })
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.text(`= ${(Q2 * 0.06).toFixed(3)} m3/h`, b2x + boxW/2, y + 16.5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`H = ${H2.toFixed(4)} m.c.a.`, b2x + boxW/2, y + 21.5, { align: 'center' })

    // Box 3 (vermelho claro)
    const b3x = 14 + 2 * boxW
    doc.setFillColor(254, 226, 213)
    doc.roundedRect(b3x, y, boxW, 24, 2, 2, 'F')
    doc.setTextColor(200, 50, 30)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(`3o Ponto (Q + ${((hidrante.fator_seguranca - 1) * 100).toFixed(0)}% seguranca)`, b3x + boxW/2, y + 5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(`Q = ${Q3.toFixed(0)} l/min`, b3x + boxW/2, y + 12, { align: 'center' })
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.text(`= ${(Q3 * 0.06).toFixed(3)} m3/h`, b3x + boxW/2, y + 16.5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`H = ${H3.toFixed(4)} m.c.a.`, b3x + boxW/2, y + 21.5, { align: 'center' })
    y += 28

    // Titulo planilha
    doc.setFillColor(230, 236, 246)
    doc.rect(10, y, W - 20, 6, 'F')
    doc.setTextColor(26, 58, 107)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('PLANILHA DE CALCULO POR TRECHOS', 15, y + 4.5)
    y += 7

    // Tabela com 3 pontos
    const baseHead = ['Trecho', 'O (mm)', 'L real (m)', 'C.E. (m)', 'L total (m)', 'H est. (mca)']
    const pHead = (lbl: string) => ['Q (l/min)', 'J (m/m)', 'Hf trecho', 'Hf acum.', 'H.Est acum.', 'H din. (mca)']

    autoTable(doc, {
      startY: y,
      head: [
        [
          { content: 'Trecho', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: [26, 58, 107], textColor: [255,255,255] } },
          { content: 'O (mm)', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: [26, 58, 107], textColor: [255,255,255] } },
          { content: 'L real (m)', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: [26, 58, 107], textColor: [255,255,255] } },
          { content: 'C.E. (m)', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: [26, 58, 107], textColor: [255,255,255] } },
          { content: 'L total (m)', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: [26, 58, 107], textColor: [255,255,255] } },
          { content: 'H est. (mca)', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: [26, 58, 107], textColor: [255,255,255] } },
          { content: `1o Ponto (Q adotado) — Q = ${Q1.toFixed(0)} l/min`, colSpan: 5, styles: { halign: 'center', fillColor: [50, 90, 160], textColor: [255,255,255] } },
          { content: `2o Ponto (media Q1+Q3) — Q = ${Q2.toFixed(0)} l/min`, colSpan: 5, styles: { halign: 'center', fillColor: [70, 110, 180], textColor: [255,255,255] } },
          { content: `3o Ponto (Q +${((hidrante.fator_seguranca-1)*100).toFixed(0)}% seg.) — Q = ${Q3.toFixed(0)} l/min`, colSpan: 5, styles: { halign: 'center', fillColor: [200, 60, 40], textColor: [255,255,255] } },
        ],
        [
          ...['Q (l/min)', 'J (m/m)', 'Hf trecho', 'Hf acum.', 'H.Est acum.', 'H din. (mca)'].map(h => ({ content: h, styles: { halign: 'center' as const, fillColor: [50, 90, 160] as [number,number,number], textColor: [255,255,255] as [number,number,number], fontSize: 6.5 } })),
          ...['Q (l/min)', 'J (m/m)', 'Hf trecho', 'Hf acum.', 'H.Est acum.', 'H din. (mca)'].map(h => ({ content: h, styles: { halign: 'center' as const, fillColor: [70, 110, 180] as [number,number,number], textColor: [255,255,255] as [number,number,number], fontSize: 6.5 } })),
          ...['Q (l/min)', 'J (m/m)', 'Hf trecho', 'Hf acum.', 'H.Est acum.', 'H din. (mca)'].map(h => ({ content: h, styles: { halign: 'center' as const, fillColor: [200, 60, 40] as [number,number,number], textColor: [255,255,255] as [number,number,number], fontSize: 6.5 } })),
        ],
      ],
      body: trechosDo.map((t, i) => {
        const r1 = res1[i], r2 = res2[i], r3 = res3[i]
        const dn = t.tipo_trecho === 'requinte' ? `${t.diametro_requinte ?? 14.585452} mm` : (t.bitola ?? '—')
        const lreal = t.tipo_trecho === 'mangueira' && t.qtd_lances && t.comprimento_por_lance
          ? `${t.qtd_lances}x${t.comprimento_por_lance}`
          : (r1?.comprimento_real.toFixed(2) ?? '—')
        const ce = r1?.comprimento_equiv.toFixed(4) ?? '—'
        const ltotal = r1?.comprimento_total.toFixed(4) ?? '—'
        const hest = r1?.altura_estatica.toFixed(2) ?? '—'

        const pRow = (r: typeof r1) => r ? [
          r.vazao.toFixed(0),
          r.tipo === 'requinte' ? '—' : r.perda_carga_unitaria.toFixed(6),
          r.perda_carga.toFixed(4),
          r.hf_acumulado.toFixed(4),
          r.hest_acumulado.toFixed(4),
          r.pressao_acumulada.toFixed(4),
        ] : ['—','—','—','—','—']

        // H din = Hf acumulado + altura estatica acumulada
        const hdin1 = r1 ? (r1.pressao_acumulada) : 0
        const hdin2 = r2 ? (r2.pressao_acumulada) : 0
        const hdin3 = r3 ? (r3.pressao_acumulada) : 0

        return [
          t.nome,
          t.tipo_trecho === 'requinte' ? '—' : dn,
          lreal,
          t.tipo_trecho === 'requinte' ? '—' : ce,
          t.tipo_trecho === 'requinte' ? '—' : ltotal,
          hest,
          r1?.vazao.toFixed(0) ?? '—',
          r1 && r1.tipo !== 'requinte' ? r1.perda_carga_unitaria.toFixed(6) : '—',
          r1?.perda_carga.toFixed(4) ?? '—',
          r1?.hf_acumulado.toFixed(4) ?? '—',
          r1?.hest_acumulado.toFixed(4) ?? '—',
          r1?.pressao_acumulada.toFixed(4) ?? '—',
          hdin1.toFixed(4),
          r2?.vazao.toFixed(0) ?? '—',
          r2 && r2.tipo !== 'requinte' ? r2.perda_carga_unitaria.toFixed(6) : '—',
          r2?.perda_carga.toFixed(4) ?? '—',
          r2?.hf_acumulado.toFixed(4) ?? '—',
          r2?.hest_acumulado.toFixed(4) ?? '—',
          r2?.pressao_acumulada.toFixed(4) ?? '—',
          hdin2.toFixed(4),
          r3?.vazao.toFixed(0) ?? '—',
          r3 && r3.tipo !== 'requinte' ? r3.perda_carga_unitaria.toFixed(6) : '—',
          r3?.perda_carga.toFixed(4) ?? '—',
          r3?.hf_acumulado.toFixed(4) ?? '—',
          r3?.hest_acumulado.toFixed(4) ?? '—',
          r3?.pressao_acumulada.toFixed(4) ?? '—',
          hdin3.toFixed(4),
        ]
      }),
      styles: { fontSize: 7, cellPadding: 1.5 },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { halign: 'center', cellWidth: 14 },
        2: { halign: 'center', cellWidth: 14 },
        3: { halign: 'center', cellWidth: 14 },
        4: { halign: 'center', cellWidth: 14 },
        5: { halign: 'center', cellWidth: 14 },
      },
      margin: { left: 10, right: 10 },
    })

    // ── PAGINAS SEGUINTES: Detalhamento por trecho ────────────────────────────
    doc.addPage()

    drawHeader(2, 2)
    drawSubHeader()
    y = 38

    doc.setFillColor(230, 236, 246)
    doc.rect(10, y, W - 20, 6, 'F')
    doc.setTextColor(26, 58, 107)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('DETALHAMENTO DAS PECAS E CONEXOES POR TRECHO', 15, y + 4.5)
    y += 8

    for (let i = 0; i < trechosDo.length; i++) {
      const t = trechosDo[i]
      const r = res1[i]
      const pecas = t.pecas || []

      // Checar espaço restante
      if (y > 170) {
        drawFooter()
        doc.addPage()
        drawHeader(doc.internal.getCurrentPageInfo().pageNumber, 0)
        drawSubHeader()
        y = 38
      }

      // Header do trecho
      let trechoDesc = `Trecho ${i + 1}: ${t.nome}  |  `
      if (t.tipo_trecho === 'requinte') {
        trechoDesc += `REQUINTE O ${t.diametro_requinte ?? 14.585452} mm  |  K = ${t.k_fator_requinte ?? '—'}  |  H estatica = ${t.altura_estatica.toFixed(2)} m.c.a.`
      } else if (t.tipo_trecho === 'mangueira') {
        trechoDesc += `MANGUEIRA ${t.qtd_lances ?? 1} lance(s) x ${t.comprimento_por_lance ?? 15} m = ${((t.qtd_lances ?? 1) * (t.comprimento_por_lance ?? 15)).toFixed(1)} m  |  O ${t.bitola ?? '—'} mm  |  H estatica = ${t.altura_estatica.toFixed(2)} m.c.a.`
      } else {
        trechoDesc += `O ${t.bitola ?? '—'} mm  |  L real = ${t.comprimento_real.toFixed(2)} m  |  H estatica = ${t.altura_estatica.toFixed(2)} m.c.a.`
      }

      doc.setFillColor(214, 226, 246)
      doc.roundedRect(10, y, W - 20, 7, 1, 1, 'F')
      doc.setTextColor(26, 58, 107)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text(trechoDesc, 14, y + 4.8)
      y += 9

      if (t.tipo_trecho === 'requinte') {
        // Tabela especial para requinte
        autoTable(doc, {
          startY: y,
          head: [['Descricao', 'Q 1 (l/min)', 'H req 1 (mca)', 'Q 2 (l/min)', 'H req 2 (mca)', 'Q 3 (l/min)', 'H req 3 (mca)']],
          body: [[
            `Esguicho O${t.diametro_requinte ?? 14.585452} mm — K = ${t.k_fator_requinte ?? '—'} — H = (Q/K)²`,
            res1[i]?.vazao.toFixed(0) ?? '—',
            res1[i]?.perda_carga.toFixed(4) ?? '—',
            res2[i]?.vazao.toFixed(0) ?? '—',
            res2[i]?.perda_carga.toFixed(4) ?? '—',
            res3[i]?.vazao.toFixed(0) ?? '—',
            res3[i]?.perda_carga.toFixed(4) ?? '—',
          ]],
          styles: { fontSize: 7.5, cellPadding: 2 },
          headStyles: { fillColor: [180, 100, 30], textColor: [255,255,255] },
          margin: { left: 10, right: 10 },
        })
        y = (doc as any).lastAutoTable.finalY + 6
      } else if (t.tipo_trecho === 'mangueira' || pecas.length === 0) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7.5)
        doc.setTextColor(120, 120, 120)
        doc.text('Nenhuma peca cadastrada.', 14, y + 3)
        y += 8
      } else {
        // Tabela de pecas
        const dn = t.bitola ?? 50
        autoTable(doc, {
          startY: y,
          head: [['Tipo de Peca / Conexao', 'Qtd.', 'C.E. Unit. (m)', 'C.E. Total (m)']],
          body: [
            ...pecas.map(p => {
              const ceUnit = calcCE(p.tipo, dn)
              const ceTotal = ceUnit * p.quantidade
              return [p.tipo, p.quantidade, ceUnit.toFixed(4), ceTotal.toFixed(4)]
            }),
            [{ content: 'TOTAL C.E. do trecho:', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' as const } },
             { content: r ? r.comprimento_equiv.toFixed(4) : '0.0000', styles: { fontStyle: 'bold', textColor: [26,58,107] as [number,number,number] } }]
          ],
          styles: { fontSize: 7.5, cellPadding: 2 },
          headStyles: { fillColor: [26, 58, 107], textColor: [255,255,255] },
          alternateRowStyles: { fillColor: [248, 250, 254] },
          columnStyles: {
            0: { cellWidth: 120 },
            1: { halign: 'center', cellWidth: 20 },
            2: { halign: 'center', cellWidth: 40 },
            3: { halign: 'center', cellWidth: 40 },
          },
          margin: { left: 10, right: 10 },
        })
        y = (doc as any).lastAutoTable.finalY + 6
      }
    }

    // Fix paginacao
    const totalPages = (doc as any).internal.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      drawFooter()
      // Atualizar numero de paginas no header
      doc.setFillColor(26, 58, 107)
      doc.rect(W - 50, 0, 50, 18, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(`Pag. ${i} / ${totalPages}`, W - 30, 12)
    }

    doc.save(`Memorial_${projeto?.nome || 'projeto'}_${hidrante.nome}.pdf`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loadingProjeto) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/projetos')} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Projetos</span>
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-semibold text-sm truncate">{projeto?.nome}</h1>
            {projeto?.norma && <Badge variant="secondary" className="text-xs shrink-0">{projeto.norma}</Badge>}
          </div>
          <div className="ml-auto">
            <Button size="sm" onClick={() => openModalHidrante()} className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Adicionar Hidrante</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {loadingHidrantes ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !hidrantes || hidrantes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Droplets className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold">Sem hidrantes</h3>
              <p className="text-sm text-muted-foreground mt-1">Adicione o primeiro hidrante ao projeto.</p>
            </div>
            <Button onClick={() => openModalHidrante()}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Hidrante
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {hidrantes.map(hidrante => {
              const trechosDo = getTrechosDo(hidrante.id)
              const resultados = trechosDo.length > 0 ? calcularResultados(hidrante, trechosDo) : []

              return (
                <Card key={hidrante.id} className="border-border shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                          <Flame className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                          <span className="font-semibold text-sm">
                            {ordemLabel(hidrante.ordem)} Mais Desfavorável — {hidrante.nome}
                          </span>
                          <div className="flex gap-1.5 mt-0.5">
                            <Badge variant="outline" className="text-xs">P. mín. {hidrante.pressao_minima} mca</Badge>
                            <Badge variant="outline" className="text-xs">Q. mín. {hidrante.vazao_minima} l/min</Badge>
                            <Badge variant="outline" className="text-xs">FS {hidrante.fator_seguranca}×</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openModalHidrante(hidrante)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicarHidrante.mutate(hidrante)} title="Duplicar">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setConfirmarExcluirHidrante(hidrante)} title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="trechos">
                      <TabsList className="h-8">
                        <TabsTrigger value="trechos" className="text-xs h-6">Trechos ({trechosDo.length})</TabsTrigger>
                        <TabsTrigger value="resultados" className="text-xs h-6">Resultados</TabsTrigger>
                      </TabsList>

                      {/* ── Tab Trechos ────────────────────────────────── */}
                      <TabsContent value="trechos" className="mt-3">
                        {trechosDo.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum trecho. Adicione um trecho abaixo.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={(e) => handleDragEnd(e, hidrante.id)}
                            >
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b text-muted-foreground">
                                    <th className="w-6 py-1.5 pl-2" />
                                    <th className="text-left py-1.5 pr-3 font-medium">Nome</th>
                                    <th className="text-left py-1.5 pr-3 font-medium">Tipo</th>
                                    <th className="text-right py-1.5 pr-3 font-medium">Ø (mm)</th>
                                    <th className="text-right py-1.5 pr-3 font-medium">L. Real (m)</th>
                                    <th className="text-right py-1.5 pr-3 font-medium">H. Est. (m)</th>
                                    <th className="text-right py-1.5 pr-3 font-medium">Vazão</th>
                                    <th className="text-left py-1.5 pr-3 font-medium">Peças</th>
                                    <th className="text-right py-1.5 font-medium">Ações</th>
                                  </tr>
                                </thead>
                                <SortableContext
                                  items={trechosDo.map(t => t.id)}
                                  strategy={verticalListSortingStrategy}
                                >
                                  <tbody>
                                    {trechosDo.map(trecho => (
                                      <SortableTrechoRow
                                        key={trecho.id}
                                        trecho={trecho}
                                        onEdit={() => openModalTrecho(hidrante.id, trecho)}
                                        onDelete={() => setConfirmarExcluirTrecho(trecho)}
                                      />
                                    ))}
                                  </tbody>
                                </SortableContext>
                              </table>
                            </DndContext>
                          </div>
                        )}
                        <div className="flex gap-2 mt-3 flex-wrap">
                          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openModalTrecho(hidrante.id)}>
                            <Plus className="h-3 w-3 mr-1" />
                            Adicionar Trecho
                          </Button>
                          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => abrirImportCSV(hidrante.id)}>
                            <Upload className="h-3 w-3 mr-1" />
                            Importar CSV Revit
                          </Button>
                        </div>
                      </TabsContent>

                      {/* ── Tab Resultados ─────────────────────────────── */}
                      <TabsContent value="resultados" className="mt-3">
                        {resultados.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">Adicione trechos para ver os resultados.</p>
                        ) : (() => {
                          const Q1 = hidrante.vazao_minima
                          const Q3 = Q1 * hidrante.fator_seguranca
                          const Q2 = (Q1 + Q3) / 2
                          const hidr2 = { ...hidrante, vazao_minima: Q2 }
                          const hidr3 = { ...hidrante, vazao_minima: Q3 }
                          const res2 = trechosDo.length > 0 ? calcularResultados(hidr2, trechosDo) : []
                          const res3 = trechosDo.length > 0 ? calcularResultados(hidr3, trechosDo) : []
                          const H1 = resultados[resultados.length - 1]?.pressao_acumulada ?? 0
                          const H2 = res2[res2.length - 1]?.pressao_acumulada ?? 0
                          const H3 = res3[res3.length - 1]?.pressao_acumulada ?? 0
                          return (
                          <>
                            {/* Botões */}
                            <div className="flex gap-2 mb-4 flex-wrap">
                              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => exportarCSV(hidrante)}>
                                <Download className="h-3 w-3 mr-1" />
                                Exportar CSV
                              </Button>
                              <Button size="sm" className="text-xs h-7 bg-accent hover:bg-accent/90 text-white" onClick={() => exportarPDF(hidrante)}>
                                <FileText className="h-3 w-3 mr-1" />
                                Memorial PDF
                              </Button>
                            </div>

                            {/* Cards 3 pontos da curva da bomba */}
                            <div className="mb-4">
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Pontos para Curva da Bomba</p>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="rounded-lg border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
                                  <p className="text-[10px] text-muted-foreground font-medium">1º Ponto (Q adotado)</p>
                                  <p className="text-base font-bold text-blue-700 dark:text-blue-300 mt-0.5">Q = {Q1.toFixed(0)} l/min</p>
                                  <p className="text-[10px] text-muted-foreground">= {(Q1 * 0.06).toFixed(3)} m³/h</p>
                                  <p className="text-sm font-bold text-blue-800 dark:text-blue-200 mt-0.5">H = {H1.toFixed(4)} mca</p>
                                </div>
                                <div className="rounded-lg border-2 border-blue-300 bg-blue-100 dark:bg-blue-900/30 p-3 text-center">
                                  <p className="text-[10px] text-muted-foreground font-medium">2º Ponto (média Q1+Q3)</p>
                                  <p className="text-base font-bold text-blue-700 dark:text-blue-300 mt-0.5">Q = {Q2.toFixed(0)} l/min</p>
                                  <p className="text-[10px] text-muted-foreground">= {(Q2 * 0.06).toFixed(3)} m³/h</p>
                                  <p className="text-sm font-bold text-blue-800 dark:text-blue-200 mt-0.5">H = {H2.toFixed(4)} mca</p>
                                </div>
                                <div className="rounded-lg border-2 border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-center">
                                  <p className="text-[10px] text-muted-foreground font-medium">3º Ponto (+{((hidrante.fator_seguranca - 1) * 100).toFixed(0)}% seg.)</p>
                                  <p className="text-base font-bold text-red-700 dark:text-red-300 mt-0.5">Q = {Q3.toFixed(0)} l/min</p>
                                  <p className="text-[10px] text-muted-foreground">= {(Q3 * 0.06).toFixed(3)} m³/h</p>
                                  <p className="text-sm font-bold text-red-800 dark:text-red-200 mt-0.5">H = {H3.toFixed(4)} mca</p>
                                </div>
                              </div>
                            </div>

                            {/* Tabela */}
                            <div className="overflow-x-auto rounded-lg border border-border">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-primary text-white">
                                    <th className="text-left py-2 px-2 font-medium" rowSpan={2}>Trecho</th>
                                    <th className="text-center py-2 px-2 font-medium" rowSpan={2}>Ø</th>
                                    <th className="text-center py-2 px-2 font-medium" rowSpan={2}>L. Real</th>
                                    <th className="text-center py-2 px-2 font-medium" rowSpan={2}>C.E.</th>
                                    <th className="text-center py-2 px-2 font-medium" rowSpan={2}>L. Total</th>
                                    <th className="text-center py-2 px-2 font-medium" rowSpan={2}>H. Est</th>
                                    <th className="text-center py-2 px-1 font-medium bg-blue-700" colSpan={4}>1º Ponto — Q={Q1.toFixed(0)}</th>
                                    <th className="text-center py-2 px-1 font-medium bg-blue-600" colSpan={4}>2º Ponto — Q={Q2.toFixed(0)}</th>
                                    <th className="text-center py-2 px-1 font-medium bg-red-600" colSpan={4}>3º Ponto — Q={Q3.toFixed(0)}</th>
                                  </tr>
                                  <tr className="text-[10px]">
                                    {['J','hf','Hf acum.','H.Est ac.','H din.'].map(h => <th key={`p1${h}`} className="py-1 px-1 text-center bg-blue-700/80 font-normal">{h}</th>)}
                                    {['J','hf','Hf acum.','H.Est ac.','H din.'].map(h => <th key={`p2${h}`} className="py-1 px-1 text-center bg-blue-600/80 font-normal">{h}</th>)}
                                    {['J','hf','Hf acum.','H.Est ac.','H din.'].map(h => <th key={`p3${h}`} className="py-1 px-1 text-center bg-red-600/80 font-normal">{h}</th>)}
                                  </tr>
                                </thead>
                                <tbody>
                                  {resultados.map((r, i) => {
                                    const r2i = res2[i], r3i = res3[i]
                                    const dn = r.tipo === 'requinte' ? '—' : r.bitola
                                    const lreal = r.tipo === 'mangueira' ? `${trechosDo[i]?.qtd_lances ?? 1}×${trechosDo[i]?.comprimento_por_lance ?? 15}` : r.comprimento_real.toFixed(2)
                                    return (
                                    <tr key={i} className={`border-t border-border/50 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                                      <td className="py-1.5 px-2 font-medium max-w-[120px] truncate">{r.trecho}</td>
                                      <td className="py-1.5 px-2 text-center">{dn}</td>
                                      <td className="py-1.5 px-2 text-center">{lreal}</td>
                                      <td className="py-1.5 px-2 text-center">{r.tipo === 'requinte' ? '—' : r.comprimento_equiv.toFixed(4)}</td>
                                      <td className="py-1.5 px-2 text-center">{r.tipo === 'requinte' ? '—' : r.comprimento_total.toFixed(4)}</td>
                                      <td className="py-1.5 px-2 text-center">{r.altura_estatica.toFixed(2)}</td>
                                      {/* Ponto 1 */}
                                      <td className="py-1.5 px-1 text-center text-blue-700 dark:text-blue-300">{r.tipo === 'requinte' ? '—' : r.perda_carga_unitaria.toFixed(6)}</td>
                                      <td className="py-1.5 px-1 text-center text-blue-700 dark:text-blue-300">{r.perda_carga.toFixed(4)}</td>
                                      <td className="py-1.5 px-1 text-center text-blue-700 dark:text-blue-300">{r.hf_acumulado.toFixed(4)}</td>
                                      <td className="py-1.5 px-1 text-center text-blue-700 dark:text-blue-300">{r.hest_acumulado.toFixed(4)}</td>
                                      <td className="py-1.5 px-1 text-center font-semibold text-blue-800 dark:text-blue-200">{r.pressao_acumulada.toFixed(4)}</td>
                                      {/* Ponto 2 */}
                                      <td className="py-1.5 px-1 text-center text-blue-600 dark:text-blue-400">{r2i && r2i.tipo !== 'requinte' ? r2i.perda_carga_unitaria.toFixed(6) : '—'}</td>
                                      <td className="py-1.5 px-1 text-center text-blue-600 dark:text-blue-400">{r2i?.perda_carga.toFixed(4) ?? '—'}</td>
                                      <td className="py-1.5 px-1 text-center text-blue-600 dark:text-blue-400">{r2i?.hf_acumulado.toFixed(4) ?? '—'}</td>
                                      <td className="py-1.5 px-1 text-center text-blue-600 dark:text-blue-400">{r2i?.hest_acumulado.toFixed(4) ?? '—'}</td>
                                      <td className="py-1.5 px-1 text-center font-semibold text-blue-700 dark:text-blue-300">{r2i?.pressao_acumulada.toFixed(4) ?? '—'}</td>
                                      {/* Ponto 3 */}
                                      <td className="py-1.5 px-1 text-center text-red-600 dark:text-red-400">{r3i && r3i.tipo !== 'requinte' ? r3i.perda_carga_unitaria.toFixed(6) : '—'}</td>
                                      <td className="py-1.5 px-1 text-center text-red-600 dark:text-red-400">{r3i?.perda_carga.toFixed(4) ?? '—'}</td>
                                      <td className="py-1.5 px-1 text-center text-red-600 dark:text-red-400">{r3i?.hf_acumulado.toFixed(4) ?? '—'}</td>
                                      <td className="py-1.5 px-1 text-center text-red-600 dark:text-red-400">{r3i?.hest_acumulado.toFixed(4) ?? '—'}</td>
                                      <td className="py-1.5 px-1 text-center font-semibold text-red-700 dark:text-red-300">{r3i?.pressao_acumulada.toFixed(4) ?? '—'}</td>
                                    </tr>
                                    )
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-primary/10 border-t-2 border-primary/30">
                                    <td colSpan={6} className="py-2 px-2 text-xs font-semibold text-muted-foreground">
                                      Pressão total na bomba (H din. final):
                                    </td>
                                    <td colSpan={4} className="py-2 px-2 text-center font-bold text-blue-700 dark:text-blue-300 text-xs">
                                      H1 = {H1.toFixed(4)} mca
                                    </td>
                                    <td colSpan={4} className="py-2 px-2 text-center font-bold text-blue-600 dark:text-blue-400 text-xs">
                                      H2 = {H2.toFixed(4)} mca
                                    </td>
                                    <td colSpan={4} className="py-2 px-2 text-center font-bold text-red-700 dark:text-red-300 text-xs">
                                      H3 = {H3.toFixed(4)} mca
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </>
                          )
                        })()}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>

      {/* ── Modal Hidrante ──────────────────────────────────────────────────── */}
      <Dialog open={modalHidrante} onOpenChange={(open) => { if (!open) { setModalHidrante(false); setEditHidrante(null) } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editHidrante ? 'Editar Hidrante' : 'Novo Hidrante'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); salvarHidrante.mutate(hidranteForm) }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome *</Label>
                <Input value={hidranteForm.nome} onChange={e => setHidranteForm(p => ({ ...p, nome: e.target.value }))} required placeholder="Ex: HI-01" />
              </div>
              <div className="space-y-1.5">
                <Label>Ordem</Label>
                <Select value={String(hidranteForm.ordem)} onValueChange={v => setHidranteForm(p => ({ ...p, ordem: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(o => <SelectItem key={o} value={String(o)}>{ordemLabel(o)} Mais Desfavorável</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fator de segurança</Label>
                <Input type="number" step="0.01" value={hidranteForm.fator_seguranca} onChange={e => setHidranteForm(p => ({ ...p, fator_seguranca: parseFloat(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Vazão mínima (l/min)</Label>
                <Input type="number" value={hidranteForm.vazao_minima} onChange={e => setHidranteForm(p => ({ ...p, vazao_minima: parseFloat(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Pressão mínima (mca)</Label>
                <Input type="number" value={hidranteForm.pressao_minima} onChange={e => setHidranteForm(p => ({ ...p, pressao_minima: parseFloat(e.target.value) }))} />
              </div>
            </div>

            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados da Bomba (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Modelo</Label>
                <Input value={hidranteForm.bomba_modelo} onChange={e => setHidranteForm(p => ({ ...p, bomba_modelo: e.target.value }))} placeholder="Modelo" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Marca</Label>
                <Input value={hidranteForm.bomba_marca} onChange={e => setHidranteForm(p => ({ ...p, bomba_marca: e.target.value }))} placeholder="Marca" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vazão nominal (l/min)</Label>
                <Input type="number" value={hidranteForm.bomba_vazao_nominal} onChange={e => setHidranteForm(p => ({ ...p, bomba_vazao_nominal: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pressão nominal (mca)</Label>
                <Input type="number" value={hidranteForm.bomba_pressao_nominal} onChange={e => setHidranteForm(p => ({ ...p, bomba_pressao_nominal: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Potência (cv/kW)</Label>
                <Input type="number" value={hidranteForm.bomba_potencia} onChange={e => setHidranteForm(p => ({ ...p, bomba_potencia: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">RPM</Label>
                <Input type="number" value={hidranteForm.bomba_rpm} onChange={e => setHidranteForm(p => ({ ...p, bomba_rpm: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Observações</Label>
                <Textarea value={hidranteForm.bomba_obs} onChange={e => setHidranteForm(p => ({ ...p, bomba_obs: e.target.value }))} rows={2} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setModalHidrante(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvarHidrante.isPending}>
                {salvarHidrante.isPending && <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {editHidrante ? 'Salvar' : 'Adicionar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal Trecho ─────────────────────────────────────────────────────── */}
      <Sheet open={modalTrecho} onOpenChange={(open) => { if (!open) { setModalTrecho(false); setEditTrecho(null) } }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editTrecho ? 'Editar Trecho' : 'Novo Trecho'}</SheetTitle>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); salvarTrecho.mutate(trechoForm) }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome *</Label>
                <Input value={trechoForm.nome} onChange={e => updateTrechoForm('nome', e.target.value)} required placeholder="Ex: Trecho 1 — Saída bomba" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={trechoForm.tipo_trecho} onValueChange={v => updateTrechoForm('tipo_trecho', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal (tubo)</SelectItem>
                    <SelectItem value="mangueira">Mangueira</SelectItem>
                    <SelectItem value="requinte">Requinte</SelectItem>
                    <SelectItem value="hidrante">Hidrante (H) — agrupado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vazão do trecho</Label>
                <Select value={trechoForm.vazao_trecho} onValueChange={v => updateTrechoForm('vazao_trecho', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="herda">Simples — herda do hidrante</SelectItem>
                    <SelectItem value="fator">Múltipla — N hidrantes simultâneos</SelectItem>
                    <SelectItem value="custom">Personalizada (l/min)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {trechoForm.vazao_trecho === 'fator' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Nº de hidrantes simultâneos (fator)</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={trechoForm.fator_hidrantes}
                    onChange={e => updateTrechoForm('fator_hidrantes', parseInt(e.target.value) || 1)}
                    placeholder="Ex: 4"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Q = {trechoForm.fator_hidrantes || 1} × vazão do hidrante
                  </p>
                </div>
              )}
              {trechoForm.vazao_trecho === 'custom' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Vazão (l/min)</Label>
                  <Input type="number" value={trechoForm.vazao_trecho_custom} onChange={e => updateTrechoForm('vazao_trecho_custom', parseFloat(e.target.value))} />
                </div>
              )}
            </div>

            {/* Campos por tipo */}
            {trechoForm.tipo_trecho === 'normal' && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Bitola DN (mm)</Label>
                  <Select value={String(trechoForm.bitola)} onValueChange={v => updateTrechoForm('bitola', parseInt(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DNS_DISPONIVEIS.map(d => <SelectItem key={d} value={String(d)}>DN {d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Comp. real (m)</Label>
                  <Input type="number" step="0.01" value={trechoForm.comprimento_real} onChange={e => updateTrechoForm('comprimento_real', parseFloat(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Alt. estática (m)</Label>
                  <Input type="number" step="0.01" value={trechoForm.altura_estatica} onChange={e => updateTrechoForm('altura_estatica', parseFloat(e.target.value))} />
                </div>
              </div>
            )}

            {trechoForm.tipo_trecho === 'mangueira' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Bitola (mm)</Label>
                  <Select value={String(trechoForm.bitola)} onValueChange={v => updateTrechoForm('bitola', parseInt(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="38">38 mm</SelectItem>
                      <SelectItem value="63">63 mm</SelectItem>
                      <SelectItem value="75">75 mm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ø interno (mm)</Label>
                  <Input type="number" step="0.1" value={trechoForm.d_interno_mangueira} onChange={e => updateTrechoForm('d_interno_mangueira', parseFloat(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Qtd. lances</Label>
                  <Input type="number" min="1" value={trechoForm.qtd_lances} onChange={e => updateTrechoForm('qtd_lances', parseInt(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Comp. por lance (m)</Label>
                  <Input type="number" step="0.5" value={trechoForm.comprimento_por_lance} onChange={e => updateTrechoForm('comprimento_por_lance', parseFloat(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Alt. estática (m)</Label>
                  <Input type="number" step="0.01" value={trechoForm.altura_estatica} onChange={e => updateTrechoForm('altura_estatica', parseFloat(e.target.value))} />
                </div>
              </div>
            )}

            {trechoForm.tipo_trecho === 'requinte' && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Ø requinte (mm)</Label>
                  <Input type="number" step="0.5" value={trechoForm.diametro_requinte} onChange={e => updateTrechoForm('diametro_requinte', parseFloat(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">K-fator</Label>
                  <Input type="number" step="0.01" value={trechoForm.k_fator_requinte} onChange={e => updateTrechoForm('k_fator_requinte', parseFloat(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Comp. real (m)</Label>
                  <Input type="number" step="0.01" value={trechoForm.comprimento_real} onChange={e => updateTrechoForm('comprimento_real', parseFloat(e.target.value))} />
                </div>
              </div>
            )}

            {/* ── Tipo HIDRANTE: campos agrupados ── */}
            {trechoForm.tipo_trecho === 'hidrante' && (
              <div className="space-y-3">
                <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3">
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-2">
                    🔥 Trecho Hidrante — gera automaticamente: Tubulação + Mangueira + Requinte
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">DN Tubulação (mm)</Label>
                      <Select value={String(trechoForm.bitola)} onValueChange={v => updateTrechoForm('bitola', parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DNS_DISPONIVEIS.map(d => <SelectItem key={d} value={String(d)}>DN {d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Comp. real tubulação (m)</Label>
                      <Input type="number" step="0.01" value={trechoForm.comprimento_real}
                        onChange={e => updateTrechoForm('comprimento_real', parseFloat(e.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">DN Mangueira (mm)</Label>
                      <Select
                        value={String(trechoForm.d_interno_mangueira)}
                        onValueChange={v => {
                          const dn = parseInt(v)
                          updateTrechoForm('d_interno_mangueira', dn)
                          // Atualizar diâmetro do requinte automaticamente
                          updateTrechoForm('diametro_requinte', dn === 63 ? 23.795032 : 14.585452)
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="38">38 mm (1½")</SelectItem>
                          <SelectItem value="63">63 mm (2½")</SelectItem>
                          <SelectItem value="75">75 mm (3")</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Qtd. lances mangueira</Label>
                      <Input type="number" min="1" value={trechoForm.qtd_lances}
                        onChange={e => updateTrechoForm('qtd_lances', parseInt(e.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Comp. por lance (m)</Label>
                      <Input type="number" step="0.5" value={trechoForm.comprimento_por_lance}
                        onChange={e => updateTrechoForm('comprimento_por_lance', parseFloat(e.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Alt. estática / cota (m)</Label>
                      <Input type="number" step="0.01" value={trechoForm.altura_estatica}
                        onChange={e => updateTrechoForm('altura_estatica', parseFloat(e.target.value))} />
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-orange-200 dark:border-orange-800">
                    <p className="text-[11px] text-muted-foreground">
                      Ø Requinte automático:{' '}
                      <span className="font-semibold text-orange-700 dark:text-orange-400">
                        {trechoForm.d_interno_mangueira === 63 ? '23.795 mm' : '14.585 mm'}
                      </span>
                      {' '}— conforme planilha NBR (pode ajustar abaixo)
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Label className="text-xs shrink-0">Ø Requinte manual (mm)</Label>
                      <Input type="number" step="0.001" className="h-7 text-xs"
                        value={trechoForm.diametro_requinte}
                        onChange={e => updateTrechoForm('diametro_requinte', parseFloat(e.target.value))} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Peças / Conexões */}
            <Separator />
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Peças / Conexões (C.E.)</p>
              {/* Lista de peças adicionadas */}
              {trechoForm.pecas.length > 0 && (
                <div className="mb-3 border rounded-md overflow-hidden">
                  {/* Cabeçalho */}
                  <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground bg-muted/40 border-b">
                    <span className="flex-1">Peça</span>
                    <span className="w-16 text-right">C.E.unit(m)</span>
                    <span className="w-16 text-right">C.E.tot(m)</span>
                    <span className="w-24"></span>
                  </div>
                  {trechoForm.pecas.map((p, idx) => {
                    const ceUnit = calcCE(p.tipo, trechoForm.bitola)
                    const ceTotal = ceUnit * p.quantidade
                    return (
                      <div key={p.tipo} className={`flex items-center gap-2 px-2 py-1.5 text-xs ${idx % 2 === 0 ? 'bg-muted/20' : ''}`}>
                        <span className="flex-1 text-foreground font-medium truncate">{p.tipo}</span>
                        <span className="w-16 text-right text-muted-foreground font-mono text-[11px]">
                          {ceUnit > 0 ? ceUnit.toFixed(2) : <span className="text-amber-500 text-[10px]">N/D</span>}
                        </span>
                        <span className="w-16 text-right text-primary font-mono font-semibold text-[11px]">
                          {ceTotal > 0 ? ceTotal.toFixed(2) : '—'}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 w-24 justify-end">
                          <Button variant="ghost" size="icon" type="button" className="h-5 w-5 rounded-full"
                            onClick={() => updatePeca(p.tipo, p.quantidade - 1)}>
                            <span className="text-base leading-none font-bold">−</span>
                          </Button>
                          <span className="w-7 text-center font-bold text-primary">{p.quantidade}</span>
                          <Button variant="ghost" size="icon" type="button" className="h-5 w-5 rounded-full"
                            onClick={() => updatePeca(p.tipo, p.quantidade + 1)}>
                            <span className="text-base leading-none font-bold">+</span>
                          </Button>
                          <Button variant="ghost" size="icon" type="button"
                            className="h-5 w-5 text-destructive hover:text-destructive ml-1"
                            onClick={() => updatePeca(p.tipo, 0)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                  {/* Total C.E. */}
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs border-t bg-muted/40 font-semibold">
                    <span className="flex-1 text-muted-foreground">TOTAL C.E.</span>
                    <span className="w-16 text-right"></span>
                    <span className="w-16 text-right text-primary font-mono">
                      {calcCETotal(trechoForm.pecas, trechoForm.bitola).toFixed(4)} m
                    </span>
                    <span className="w-24"></span>
                  </div>
                </div>
              )}
              {/* Select para adicionar peça com prévia C.E. */}
              <Select
                value=""
                onValueChange={(tipo) => { if (tipo) addPeca(tipo) }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="+ Adicionar peça / conexão..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground flex justify-between border-b mb-1 sticky top-0 bg-popover">
                    <span>Peça / Conexão</span>
                    <span>C.E. p/ DN {trechoForm.bitola} (m)</span>
                  </div>
                  {TIPOS_PECAS.map(tipo => {
                    const ce = calcCE(tipo, trechoForm.bitola)
                    const jaAdicionada = trechoForm.pecas.find(p => p.tipo === tipo)
                    return (
                      <SelectItem key={tipo} value={tipo} className="text-xs">
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span className={jaAdicionada ? 'text-primary font-semibold' : ''}>
                            {jaAdicionada ? '✓ ' : ''}{tipo}
                            {jaAdicionada && <span className="ml-1 text-[10px] opacity-70">({jaAdicionada.quantidade}×)</span>}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">
                            {ce > 0 ? `${ce.toFixed(2)} m` : '—'}
                          </span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setModalTrecho(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvarTrecho.isPending}>
                {salvarTrecho.isPending && <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {editTrecho ? 'Salvar' : 'Adicionar'}
              </Button>
            </DialogFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Modal Importar CSV Revit */}
      <Dialog open={modalImportCSV} onOpenChange={setModalImportCSV}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar CSV do Revit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione o arquivo CSV exportado do Revit (exportacao de conexoes via plugin BimFire).
              As pecas serao agrupadas por trecho (coluna Comentarios).
            </p>
            <div>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleCSVFile}
              />
              <Button variant="outline" onClick={() => csvInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Selecionar arquivo .CSV
              </Button>
            </div>
            {importCSVPreview.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
                  {importCSVPreview.length} trecho(s) identificado(s) — pre-visualizacao
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-1.5">Trecho (Comentario)</th>
                        <th className="text-center px-3 py-1.5">DN dominante</th>
                        <th className="text-left px-3 py-1.5">Pecas identificadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importCSVPreview.map((tr, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5 font-medium">{tr.nome}</td>
                          <td className="px-3 py-1.5 text-center">DN {tr.dnDominante}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {tr.pecas.map(p => `${p.quantidade}x ${p.tipo}`).join(', ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalImportCSV(false)}>Cancelar</Button>
            <Button
              disabled={importCSVPreview.length === 0 || importCSVLoading}
              onClick={confirmarImportCSV}
            >
              {importCSVLoading && <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Importar {importCSVPreview.length > 0 ? `(${importCSVPreview.length} trechos)` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete hidrante */}
      <AlertDialog open={!!confirmarExcluirHidrante} onOpenChange={(o) => !o && setConfirmarExcluirHidrante(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir hidrante?</AlertDialogTitle>
            <AlertDialogDescription>
              O hidrante <strong>"{confirmarExcluirHidrante?.nome}"</strong> e todos os seus trechos serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => confirmarExcluirHidrante && excluirHidrante.mutate(confirmarExcluirHidrante.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete trecho */}
      <AlertDialog open={!!confirmarExcluirTrecho} onOpenChange={(o) => !o && setConfirmarExcluirTrecho(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir trecho?</AlertDialogTitle>
            <AlertDialogDescription>
              O trecho <strong>"{confirmarExcluirTrecho?.nome}"</strong> será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => confirmarExcluirTrecho && excluirTrecho.mutate(confirmarExcluirTrecho.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
