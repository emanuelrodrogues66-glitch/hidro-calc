import { useLocation } from 'wouter'
import { useAuth } from '@/lib/auth-context'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { LogoFull } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { LogOut, Check, Star, Zap, Puzzle } from 'lucide-react'
import { supabase as sb } from '@/lib/supabase'

const FEATURES_STARTER = [
  'Até 5 projetos',
  'Hidrantes ilimitados por projeto',
  'Cálculo Hazen-Williams completo',
  'Exportação CSV',
  'Memorial PDF básico',
  'Normas NBR 5626 e NPT 022',
]

const FEATURES_PLUGIN = [
  'Tudo do plano Mensal',
  'Plugin Revit para BIM',
  'Envio de trechos diretamente do Revit',
  'Peças importadas automaticamente',
  'Integração com projetos HidroCalc',
]

const FEATURES_PRO = [
  'Projetos ilimitados',
  'Tudo do Starter',
  'Memorial PDF profissional',
  'Todos os tipos de sistema',
  'Suporte prioritário',
  'Atualizações antecipadas',
]

// Manter compatibilidade
const FEATURES_REVIT = FEATURES_PLUGIN

const FAQ_ITEMS = [
  {
    q: 'Posso cancelar a qualquer momento?',
    a: 'Sim. Você pode cancelar sua assinatura a qualquer momento. O acesso continua até o fim do período pago.',
  },
  {
    q: 'Como funciona a assinatura via Hotmart?',
    a: 'O pagamento é processado pela Hotmart de forma segura. Após a confirmação, seu plano é ativado automaticamente.',
  },
  {
    q: 'O Plugin Revit requer assinatura ativa?',
    a: 'Sim. O Plugin Revit requer uma assinatura Starter ou Pro ativa para funcionar. A licença é vitalícia, mas o uso depende da assinatura.',
  },
  {
    q: 'Posso testar o app gratuitamente?',
    a: 'Sim! A conta gratuita permite criar até 5 projetos. Faça upgrade quando precisar de mais.',
  },
]

export default function Planos() {
  const { user } = useAuth()
  const [, navigate] = useLocation()

  const { data: assinatura } = useQuery({
    queryKey: ['assinatura', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('assinaturas').select('*').eq('user_id', user!.id).single()
      return data
    },
    enabled: !!user,
  })

  const planoAtual = assinatura?.plano || 'gratuito'

  const handleLogout = async () => {
    await sb.auth.signOut()
    navigate('/login')
  }

  const encodedEmail = encodeURIComponent(user?.email || '')

  const PlanoCard = ({ title, price, desc, features, badge, link, highlighted = false, icon: Icon }: {
    title: string
    price: string
    desc: string
    features: string[]
    badge?: string
    link?: string
    highlighted?: boolean
    icon: any
  }) => (
    <Card className={`relative flex flex-col ${highlighted ? 'border-primary border-2 shadow-lg' : 'border-border shadow-sm'}`}>
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-amber-500 text-white font-semibold px-3 py-0.5 text-xs">{badge}</Badge>
        </div>
      )}
      <CardHeader className="pb-3 pt-6">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${highlighted ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
            <Icon className="h-4 w-4" />
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
        <div className="mt-1">
          <span className="text-3xl font-bold text-foreground">{price}</span>
          {price.includes('/') && <span className="text-sm text-muted-foreground ml-1">/ {price.includes('mês') ? '' : ''}mês</span>}
        </div>
        <CardDescription className="mt-1">{desc}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-2">
          {features.map(f => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        {link ? (
          <Button
            className={`w-full ${highlighted ? 'bg-primary hover:bg-primary/90' : ''}`}
            variant={highlighted ? 'default' : 'outline'}
            asChild
          >
            <a href={link} target="_blank" rel="noopener noreferrer">
              Assinar {title}
            </a>
          </Button>
        ) : (
          <Button className="w-full" variant="outline" disabled>
            {planoAtual === title.toLowerCase() ? 'Plano atual' : 'Em breve'}
          </Button>
        )}
      </CardFooter>
    </Card>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <LogoFull />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/projetos')}>Voltar</Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12 space-y-12">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Planos e Assinatura</h1>
          <p className="text-muted-foreground">Escolha o plano ideal para seus projetos de hidrantes</p>
          {planoAtual !== 'gratuito' && (
            <Badge variant="secondary" className="text-sm">
              Plano atual: <strong className="ml-1">{planoAtual}</strong>
            </Badge>
          )}
        </div>

        {/* Planos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <PlanoCard
            title="Mensal"
            price="R$39,90/mês"
            desc="Ideal para profissionais autônomos"
            features={FEATURES_STARTER}
            link={`https://pay.hotmart.com/W106122422Y?off=ryocqtbi&email=${encodedEmail}`}
            icon={Zap}
          />
          <PlanoCard
            title="Mensal + Plugin Revit"
            price="R$69,90/mês"
            desc="Plano mensal com integração BIM"
            features={FEATURES_PLUGIN}
            badge="Mais popular"
            link={`https://pay.hotmart.com/W106122422Y?off=0jmo96l5&email=${encodedEmail}`}
            highlighted
            icon={Puzzle}
          />
          <PlanoCard
            title="Projetos Ilimitados"
            price="R$199,00/mês"
            desc="Para escritórios e equipes"
            features={FEATURES_PRO}
            link={`https://pay.hotmart.com/W106122422Y?off=kp490dsu&email=${encodedEmail}`}
            icon={Star}
          />
        </div>

        <Separator />

        {/* FAQ */}
        <div className="max-w-2xl mx-auto space-y-4">
          <h2 className="text-xl font-bold text-center">Perguntas Frequentes</h2>
          <Accordion type="single" collapsible className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="bg-card border-border rounded-lg px-4 border">
                <AccordionTrigger className="text-sm font-medium text-left">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </main>
    </div>
  )
}
