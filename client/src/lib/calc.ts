/**
 * HidroCalc — Cálculo Hidráulico NBR 10897 / NPT 022
 * Método Hazen-Williams
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Peca {
  tipo: string
  quantidade: number
}

export interface Trecho {
  id?: number
  hidrante_id?: number
  ordem: number
  nome: string
  bitola?: number         // mm (DN nominal)
  comprimento_real: number // m
  altura_estatica: number  // m (positivo = subida, negativo = descida)
  pecas: Peca[]
  tipo_trecho: 'normal' | 'mangueira' | 'requinte'
  qtd_lances?: number
  comprimento_por_lance?: number
  diametro_requinte?: number
  k_fator_requinte?: number
  vazao_trecho: 'herda' | 'fator' | 'custom'
  // fator_hidrantes: quantos hidrantes simultâneos este trecho alimenta
  // Ex: ramal principal com 4 hidrantes → fator=4 → Q = 4 × vazao_minima
  fator_hidrantes?: number
  vazao_trecho_custom?: number
  d_interno_mangueira?: number
}

export interface Hidrante {
  id?: number
  projeto_id?: number
  ordem: number
  nome: string
  pressao_minima: number   // mca
  vazao_minima: number     // l/min
  fator_seguranca: number  // ex: 1.10
  bomba_modelo?: string
  bomba_marca?: string
  bomba_vazao_nominal?: number
  bomba_pressao_nominal?: number
  bomba_potencia?: number
  bomba_rpm?: number
  bomba_obs?: string
}

export interface ResultadoLinha {
  trecho: string
  tipo: string
  bitola: number
  comprimento_real: number
  comprimento_equiv: number
  comprimento_total: number
  altura_estatica: number
  vazao: number
  velocidade: number
  perda_carga_unitaria: number  // J m/m
  perda_carga: number           // hf m
  hf_acumulado: number          // Σhf — soma das perdas de carga (sem altura estática)
  hest_acumulado: number        // H.Est do ponto — cota absoluta (não acumulada)
  pressao_acumulada: number     // H din. = P.min + Σhf + H.Est do ponto
}

// ─── Tabela C.E. — Comprimentos Equivalentes (m) por DN ─────────────────────
// Fonte: Planilha de referência BimFire (aba C.E.)
// DNs: 25, 32, 40, 50, 63, 75, 100, 125, 150, 200, 250, 300, 350

// ─── Tabela C.E. — Comprimentos Equivalentes (m) por DN ─────────────────────
// Fonte: Planilha BimFire "Comprimentos-equivalentes.xlsx" — aba C.E.
// NBR 5626/98 e NBR 92/80 — Tubulações de Ferro Galvanizado
// DNs: 25, 32, 40, 50, 63, 75, 100, 125, 150, 200, 250, 300, 350
// ─── Tabela C.E. — Comprimentos Equivalentes (m) por DN ─────────────────────
// Fonte: Planilha BimFire "Comprimentos-equivalentes.xlsx" — aba C.E.
// NBR 5626/98 e NBR 92/80 — Tubulações de Ferro Galvanizado
// Nomes espelham exatamente a planilha de referência (Brasfer/Ataide)
// Aliases com grafia alternativa garantem compatibilidade com Revit e digitação manual
const CE_TABLE: Record<string, Record<number, number>> = {
  // COTOVELOS 45
  'Cotov. 45º':                { 25: 0.4,  32: 0.5,  40: 0.6,  50: 0.8,  63: 0.9,  75: 1.2,  100: 1.5,  125: 1.9,  150: 2.3,  200: 3.0,  250: 3.8,  300: 4.6,  350: 5.3  },
  'Cotovelo 45°':              { 25: 0.4,  32: 0.5,  40: 0.6,  50: 0.8,  63: 0.9,  75: 1.2,  100: 1.5,  125: 1.9,  150: 2.3,  200: 3.0,  250: 3.8,  300: 4.6,  350: 5.3  },
  // COTOVELOS 90
  'Cotov. 90º':                { 25: 0.8,  32: 1.1,  40: 1.3,  50: 1.7,  63: 2.0,  75: 2.5,  100: 3.4,  125: 4.2,  150: 4.9,  200: 6.4,  250: 7.9,  300: 9.5,  350: 10.5 },
  'Cotovelo 90°':              { 25: 0.8,  32: 1.1,  40: 1.3,  50: 1.7,  63: 2.0,  75: 2.5,  100: 3.4,  125: 4.2,  150: 4.9,  200: 6.4,  250: 7.9,  300: 9.5,  350: 10.5 },
  'Cotov. 90º com red.':       { 25: 0.89, 32: 1.11, 40: 1.33, 50: 1.78 },
  'Cotovelo 90° c/ red.':      { 25: 0.89, 32: 1.11, 40: 1.33, 50: 1.78 },
  'Cotov. 90º com saída lat.': { 25: 1.63, 32: 2.03, 40: 2.44, 50: 3.25 },
  'Cotovelo 90° saída lat.':   { 25: 1.63, 32: 2.03, 40: 2.44, 50: 3.25 },
  // CRUZETAS
  'Cruzeta pas. direta':       { 25: 0.20, 32: 0.25, 40: 0.30, 50: 0.41 },
  'Cruzeta passagem direta':   { 25: 0.20, 32: 0.25, 40: 0.30, 50: 0.41 },
  'Cruzeta saída lat.':        { 25: 1.35, 32: 1.68, 40: 2.02, 50: 2.69 },
  'Cruzeta saída lateral':     { 25: 1.35, 32: 1.68, 40: 2.02, 50: 2.69 },
  // CURVAS
  'Curva 45º':                 { 25: 0.2,  32: 0.3,  40: 0.3,  50: 0.4,  63: 0.5,  75: 0.6,  100: 0.7,  125: 0.9,  150: 1.1,  200: 1.5,  250: 1.8,  300: 2.2,  350: 2.5  },
  'Curva 45°':                 { 25: 0.2,  32: 0.3,  40: 0.3,  50: 0.4,  63: 0.5,  75: 0.6,  100: 0.7,  125: 0.9,  150: 1.1,  200: 1.5,  250: 1.8,  300: 2.2,  350: 2.5  },
  'Curva 90º':                 { 25: 0.5,  32: 0.6,  40: 0.7,  50: 0.9,  63: 1.0,  75: 1.3,  100: 1.6,  125: 2.1,  150: 2.5,  200: 3.3,  250: 4.1,  300: 4.8,  350: 5.4  },
  'Curva 90°':                 { 25: 0.5,  32: 0.6,  40: 0.7,  50: 0.9,  63: 1.0,  75: 1.3,  100: 1.6,  125: 2.1,  150: 2.5,  200: 3.3,  250: 4.1,  300: 4.8,  350: 5.4  },
  'Curva 90º macho':           { 25: 0.67, 32: 0.84, 40: 1.01, 50: 1.35, 63: 1.68, 75: 2.02, 100: 2.69, 150: 4.04 },
  'Curva 90° macho':           { 25: 0.67, 32: 0.84, 40: 1.01, 50: 1.35, 63: 1.68, 75: 2.02, 100: 2.69, 150: 4.04 },
  'Curva 90º macho-fêmea':     { 25: 0.64, 32: 0.79, 40: 0.95, 50: 1.27, 63: 1.59, 75: 1.91, 100: 2.54 },
  'Curva 90° macho-fêmea':     { 25: 0.64, 32: 0.79, 40: 0.95, 50: 1.27, 63: 1.59, 75: 1.91, 100: 2.54 },
  'Curva Retorno':             { 25: 0.86, 32: 1.08, 40: 1.36, 50: 1.73 },
  'Curva Transposição':        {},
  // ENTRADAS / SAÍDAS
  'Entrada Borda':             { 25: 0.7,  32: 0.9,  40: 1.0,  50: 1.5,  63: 1.9,  75: 2.2,  100: 3.2,  125: 4.0,  150: 5.0,  200: 6.0,  250: 7.5,  300: 9.0,  350: 11.0 },
  'Entrada Normal':            { 25: 0.3,  32: 0.4,  40: 0.5,  50: 0.7,  63: 0.9,  75: 1.1,  100: 1.6,  125: 2.0,  150: 2.5,  200: 3.5,  250: 4.5,  300: 5.5,  350: 6.2  },
  'Saída Canalização':         { 25: 0.7,  32: 0.9,  40: 1.0,  50: 1.5,  63: 1.9,  75: 2.2,  100: 3.2,  125: 4.0,  150: 5.0,  200: 6.0,  250: 7.5,  300: 9.0,  350: 11.0 },
  // LUVAS
  'Luva':                      { 25: 0.01, 32: 0.01, 40: 0.01, 50: 0.01, 63: 0.01, 75: 0.01, 100: 0.02, 125: 0.02, 150: 0.03 },
  'Luva/Bucha Redução':        { 25: 0.16, 32: 0.12, 40: 0.38, 50: 0.64, 63: 0.71, 75: 0.78, 100: 0.90, 125: 1.07 },
  'Luva/Bucha Redução ':       { 25: 0.16, 32: 0.12, 40: 0.38, 50: 0.64, 63: 0.71, 75: 0.78, 100: 0.90, 125: 1.07 },
  // REGISTROS
  'Registro Gaveta Aberto':    { 25: 0.2,  32: 0.2,  40: 0.3,  50: 0.4,  63: 0.4,  75: 0.5,  100: 0.7,  125: 0.9,  150: 1.1,  200: 1.4,  250: 1.7,  300: 2.1,  350: 2.4  },
  'Registro Globo Aberto':     { 25: 8.2,  32: 11.3, 40: 13.4, 50: 17.4, 63: 21.0, 75: 26.0, 100: 34.0, 125: 43.0, 150: 51.0, 200: 67.0 },
  'Registro Globo Angular':    { 25: 5.6,  32: 5.6,  40: 6.7,  50: 8.5,  63: 10.0, 75: 13.0, 100: 17.0, 125: 21.0, 150: 26.0, 200: 34.0 },
  // TÊS
  'T  45º passagem direta':    { 25: 0.18, 32: 0.22, 40: 0.27, 50: 0.36, 63: 0.44 },
  'T 45° passagem direta':     { 25: 0.18, 32: 0.22, 40: 0.27, 50: 0.36, 63: 0.44 },
  'T 45º saída lateral':       { 25: 0.88, 32: 1.10, 40: 1.31, 50: 1.75, 63: 2.19 },
  'T 45° saída lateral':       { 25: 0.88, 32: 1.10, 40: 1.31, 50: 1.75, 63: 2.19 },
  'T  Passagem Direta':        { 25: 0.5,  32: 0.7,  40: 0.9,  50: 1.1,  63: 1.3,  75: 1.6,  100: 2.1,  125: 2.7,  150: 3.4,  200: 4.3,  250: 5.5,  300: 6.1,  350: 7.3  },
  'Tê Passagem Direta':        { 25: 0.5,  32: 0.7,  40: 0.9,  50: 1.1,  63: 1.3,  75: 1.6,  100: 2.1,  125: 2.7,  150: 3.4,  200: 4.3,  250: 5.5,  300: 6.1,  350: 7.3  },
  'T Passagem Direta':         { 25: 0.5,  32: 0.7,  40: 0.9,  50: 1.1,  63: 1.3,  75: 1.6,  100: 2.1,  125: 2.7,  150: 3.4,  200: 4.3,  250: 5.5,  300: 6.1,  350: 7.3  },
  'T Saída Bilateral':         { 25: 1.7,  32: 2.3,  40: 2.8,  50: 3.5,  63: 4.3,  75: 5.2,  100: 6.7,  125: 8.4,  150: 10.0, 200: 13.0, 250: 16.0, 300: 19.0, 350: 22.0 },
  'Tê Saída Bilateral':        { 25: 1.7,  32: 2.3,  40: 2.8,  50: 3.5,  63: 4.3,  75: 5.2,  100: 6.7,  125: 8.4,  150: 10.0, 200: 13.0, 250: 16.0, 300: 19.0, 350: 22.0 },
  'T Saída Lateral':           { 25: 1.7,  32: 2.3,  40: 2.8,  50: 3.5,  63: 4.3,  75: 5.2,  100: 6.7,  125: 8.4,  150: 10.0, 200: 13.0, 250: 16.0, 300: 19.0, 350: 22.0 },
  'Tê Saída Lateral':          { 25: 1.7,  32: 2.3,  40: 2.8,  50: 3.5,  63: 4.3,  75: 5.2,  100: 6.7,  125: 8.4,  150: 10.0, 200: 13.0, 250: 16.0, 300: 19.0, 350: 22.0 },
  // UNIÕES
  'União':                     { 25: 0.01, 32: 0.01, 40: 0.01, 50: 0.01, 63: 0.01, 75: 0.02, 100: 0.03, 125: 0.04 },
  'União com Flanges':         {},
  // VÁLVULAS
  'Válvula pé e crivo':        { 25: 10.0, 32: 10.0, 40: 11.6, 50: 14.0, 63: 17.0, 75: 20.0, 100: 23.0, 125: 30.0, 150: 39.0, 200: 52.0, 250: 65.0, 300: 78.0, 350: 90.0 },
  'Válvula Pé e Crivo':        { 25: 10.0, 32: 10.0, 40: 11.6, 50: 14.0, 63: 17.0, 75: 20.0, 100: 23.0, 125: 30.0, 150: 39.0, 200: 52.0, 250: 65.0, 300: 78.0, 350: 90.0 },
  'Válvula Retenção Leve':     { 25: 2.7,  32: 2.7,  40: 3.2,  50: 4.2,  63: 5.2,  75: 6.3,  100: 8.4,  125: 10.4, 150: 12.5, 200: 16.0, 250: 20.0, 300: 24.0, 350: 28.0 },
  'Válvula Retenção Pesada':   { 25: 3.2,  32: 4.0,  40: 4.8,  50: 6.4,  63: 8.1,  75: 9.7,  100: 12.9, 125: 16.1, 150: 19.3, 200: 25.0, 250: 32.0, 300: 38.0, 350: 45.0 },
  // MANGUEIRA (comprimento real inserido pelo usuário)
  'Mangueira':                 {},
}

// Diâmetros internos reais de mangueiras (mm)
const D_INTERNO_MANGUEIRA: Record<number, number> = {
  38: 38,
  63: 63,
  75: 75,
}

// Diâmetros internos reais de tubos (mm) para cada DN nominal
// Ferro Galvanizado BSP — valores reais internos
const D_INTERNO_TUBO: Record<number, number> = {
  25:  26.6,
  32:  35.0,
  40:  41.2,
  50:  52.7,
  63:  66.6,
  75:  80.9,
  100: 105.0,
  125: 130.8,
  150: 156.7,
  200: 202.7,
  250: 254.5,
  300: 304.0,
  350: 355.6,
}

// ─── Fórmulas de Perda de Carga (conforme planilha de referência) ─────────────

/**
 * Perda de carga unitária (J) em mca/m para TUBULAÇÃO
 * Fórmula: J = 0.00212 × (Q/60000)^1.85 / (DN/1000)^4.87
 * Q: vazão em l/min | DN: diâmetro NOMINAL em mm
 * Fonte: planilha NBR 10897 / NPT 022 (Ataide)
 */
export function calcJ(Q: number, D: number): number {
  if (Q <= 0 || D <= 0) return 0
  const Qms = Q / 60000     // l/min → m³/s
  const Dm  = D / 1000      // mm → m
  return 0.00212 * Math.pow(Qms, 1.85) / Math.pow(Dm, 4.87)
}

/**
 * Perda de carga unitária (J) em mca/m para MANGUEIRA
 * Fórmula: J = 0.0016 × (Q/60000)^2 / (DN/1000)^5
 * Q: vazão em l/min | DN: diâmetro nominal da mangueira em mm
 */
export function calcJ_mangueira(Q: number, D: number): number {
  if (Q <= 0 || D <= 0) return 0
  const Qms = Q / 60000
  const Dm  = D / 1000
  return 0.0016 * Math.pow(Qms, 2) / Math.pow(Dm, 5)
}

/**
 * Pressão no REQUINTE (esguicho) em mca
 * Fórmula: hf = 0.0083 × (Q_m3h/3600)² / (D_requinte/1000)⁴
 * Q: vazão em l/min | D_requinte: diâmetro do orifício do esguicho em mm
 */
export function calcHfRequinte(Q: number, D_requinte: number): number {
  if (Q <= 0 || D_requinte <= 0) return 0
  const Q_m3h = Q * 60 / 1000    // l/min → m³/h
  const Dr    = D_requinte / 1000 // mm → m
  return 0.0083 * Math.pow(Q_m3h / 3600, 2) / Math.pow(Dr, 4)
}

/**
 * Comprimento equivalente de uma peça (CE) em metros
 * Busca pelo DN mais próximo disponível na tabela
 */
export function calcCE(tipo: string, dn: number): number {
  const tabela = CE_TABLE[tipo]
  if (!tabela) return 0
  const dns = Object.keys(tabela).map(Number).sort((a, b) => a - b)
  if (dns.length === 0) return 0
  const dnProximo = dns.reduce((prev, curr) => Math.abs(curr - dn) < Math.abs(prev - dn) ? curr : prev)
  return tabela[dnProximo] ?? 0
}

/**
 * Calcular comprimento equivalente total das peças de um trecho
 */
export function calcCETotal(pecas: Peca[], dn: number): number {
  return pecas.reduce((sum, peca) => {
    return sum + calcCE(peca.tipo, dn) * peca.quantidade
  }, 0)
}

/**
 * Velocidade em m/s
 * Q: l/min, D: mm (diâmetro interno)
 */
export function calcVelocidade(Q: number, D: number): number {
  if (Q <= 0 || D <= 0) return 0
  const Qms = Q / 60000
  const A = Math.PI * Math.pow(D / 1000 / 2, 2)
  return Qms / A
}

// ─── Calcular Resultados Completos ────────────────────────────────────────────

export function calcularResultados(
  hidrante: Hidrante,
  trechos: Trecho[]
): ResultadoLinha[] {
  const linhas: ResultadoLinha[] = []
  let pressaoAcumulada = hidrante.pressao_minima  // inicia com pressão mínima do hidrante
  let hfAcumulado      = 0   // Σhf — perdas de carga puras
  // H.Est NÃO é acumulado: cada trecho informa a cota absoluta em relação ao reservatório

  const trechosOrdenados = [...trechos].sort((a, b) => a.ordem - b.ordem)

  let vazaoBase = hidrante.vazao_minima

  for (const trecho of trechosOrdenados) {
    // Determinar vazão do trecho
    let vazao = vazaoBase
    if (trecho.vazao_trecho === 'fator') {
      // Trecho de ramal principal: Q = fator × vazao_minima do hidrante
      const fator = trecho.fator_hidrantes && trecho.fator_hidrantes > 1
        ? trecho.fator_hidrantes
        : 1
      vazao = hidrante.vazao_minima * fator
    } else if (trecho.vazao_trecho === 'custom' && trecho.vazao_trecho_custom) {
      vazao = trecho.vazao_trecho_custom
    }
    // 'herda': mantém vazaoBase (que começa como vazao_minima)

    // Determinar diâmetro interno
    let dInterno: number
    if (trecho.tipo_trecho === 'mangueira') {
      const dn = trecho.bitola || 63
      dInterno = trecho.d_interno_mangueira || D_INTERNO_MANGUEIRA[dn] || dn
    } else if (trecho.tipo_trecho === 'requinte') {
      dInterno = trecho.diametro_requinte || 13
    } else {
      const dn = trecho.bitola || 50
      dInterno = D_INTERNO_TUBO[dn] || dn
    }

    const dn = trecho.bitola || 50

    // Comprimento real
    let compReal = trecho.comprimento_real
    if (trecho.tipo_trecho === 'mangueira' && trecho.qtd_lances && trecho.comprimento_por_lance) {
      compReal = trecho.qtd_lances * trecho.comprimento_por_lance
    }

    // Comprimento equivalente das peças (usa DN nominal)
    const compEquiv = calcCETotal(trecho.pecas || [], dn)
    const compTotal = compReal + compEquiv

    // Perda de carga — fórmula varia por tipo de trecho
    let J: number
    let hf: number

    if (trecho.tipo_trecho === 'mangueira') {
      // Fórmula da planilha para mangueira: J = 0.0016 × (Q/60000)² / (DN/1000)⁵
      J  = calcJ_mangueira(vazao, dn)
      hf = J * compTotal
    } else if (trecho.tipo_trecho === 'requinte') {
      // Pressão no esguicho: hf = 0.0083 × (Q_m3h/3600)² / (D_requinte/1000)⁴
      J  = 0
      hf = calcHfRequinte(vazao, trecho.diametro_requinte || 14.585452)
    } else {
      // Tubulação: Hazen-Williams com DN nominal
      J  = calcJ(vazao, dn)
      hf = J * compTotal
    }

    const velocidade = calcVelocidade(vazao, dInterno)
    hfAcumulado += hf
    // H din. = P.min + Σhf + H.Est do ponto (cota absoluta — não acumular)
    pressaoAcumulada = hidrante.pressao_minima + hfAcumulado + trecho.altura_estatica

    linhas.push({
      trecho: trecho.nome,
      tipo: trecho.tipo_trecho,
      bitola: dn,
      comprimento_real: compReal,
      comprimento_equiv: compEquiv,
      comprimento_total: compTotal,
      altura_estatica: trecho.altura_estatica,
      vazao,
      velocidade,
      perda_carga_unitaria: J,
      perda_carga: hf,
      hf_acumulado: hfAcumulado,
      hest_acumulado: trecho.altura_estatica,  // cota absoluta do ponto
      pressao_acumulada: pressaoAcumulada,
    })

    // Propagar vazão:
    // - 'fator': NÃO propaga — próximo trecho 'herda' volta à vazao_minima do hidrante
    // - 'custom': propaga a vazão customizada para os próximos trechos
    // - 'herda': mantém vazaoBase atual
    if (trecho.vazao_trecho === 'custom') {
      vazaoBase = vazao
    } else if (trecho.vazao_trecho === 'herda') {
      // mantém vazaoBase como está
    }
    // 'fator': vazaoBase não muda — próximos trechos 'herda' continuam com vazao_minima
  }

  return linhas
}

// ─── Importação CSV do Revit ─────────────────────────────────────────────────

export interface RevitPeca {
  familia: string
  quantidade: number
  tamanho: string
  trecho: string
}

export interface TrechoRevit {
  nome: string
  pecas: Peca[]
  dnDominante: number
}

/**
 * Extrai DN (mm) a partir do campo "Tamanho" do Revit
 * Ex: "65 mmø-50 mmø" → 65
 *     "50 mmø-50 mmø-50 mmø" → 50
 */
function extrairDN(tamanho: string): number {
  const match = tamanho.match(/(\d+)\s*mm/)
  return match ? parseInt(match[1]) : 50
}

/**
 * Mapeia o nome da família Revit para o tipo de peça na tabela C.E.
 * Retorna null se não reconhecido ou deve ser ignorado
 */
export function mapearFamiliaParaTipo(familia: string, tamanho: string): string | null {
  const f = familia.toUpperCase()
  const t = tamanho.toUpperCase()

  // COTOVELOS
  if (f.includes('COTOVELO')) {
    if (t.includes('45') || f.includes('45')) return 'Cotovelo 45°'
    // Cotovelo com redução: tamanhos diferentes
    const sizes = tamanho.match(/(\d+)\s*mm/g)
    if (sizes && sizes.length >= 2) {
      const d1 = parseInt(sizes[0])
      const d2 = parseInt(sizes[1])
      if (d1 !== d2) return 'Cotovelo 90° c/ red.'
    }
    return 'Cotovelo 90°'
  }

  // CURVAS
  if (f.includes('CURVA')) {
    if (t.includes('45') || f.includes('45')) return 'Curva 45°'
    if (f.includes('MACHO-FÊMEA') || f.includes('MACHO FEMEA') || f.includes('MACHO-FEMEA')) return 'Curva 90° macho-fêmea'
    if (f.includes('MACHO')) return 'Curva 90° macho'
    return 'Curva 90°'
  }

  // TÊS
  if (f.includes('TÊ') || f.includes('TE ') || f.includes('TEE')) {
    if (f.includes('REDUÇÃO') || f.includes('REDUCAO') || f.includes('RED')) {
      // Tê de redução = saída lateral por padrão
      return 'Tê Saída Lateral'
    }
    if (t.includes('45') || f.includes('45')) return 'T 45° saída lateral'
    return 'Tê Passagem Direta'
  }

  // CRUZETAS
  if (f.includes('CRUZETA')) {
    return 'Cruzeta saída lateral'
  }

  // LUVAS E BUCHAS DE REDUÇÃO
  if (f.includes('LUVA DE REDUÇÃO') || f.includes('LUVA DE REDUCAO') ||
      f.includes('BUCHA DE REDUÇÃO') || f.includes('BUCHA DE REDUCAO')) {
    return 'Luva/Bucha Redução'
  }
  if (f.includes('LUVA')) {
    return 'Luva'
  }
  if (f.includes('BUCHA')) {
    return 'Luva/Bucha Redução'
  }

  // UNIÕES
  if (f.includes('UNIÃO') || f.includes('UNIAO') || f.includes('UNION')) {
    return 'União'
  }

  // REGISTROS
  if (f.includes('GAVETA')) return 'Registro Gaveta Aberto'
  if (f.includes('GLOBO ANGULAR') || f.includes('ANGULAR')) return 'Registro Globo Angular'
  if (f.includes('GLOBO')) return 'Registro Globo Aberto'
  if (f.includes('REGISTRO')) return 'Registro Gaveta Aberto'

  // VÁLVULAS
  if (f.includes('RETENÇÃO') || f.includes('RETENCAO') || f.includes('CHECK')) {
    if (f.includes('PESADA') || f.includes('HEAVY')) return 'Válvula Retenção Pesada'
    return 'Válvula Retenção Leve'
  }
  if (f.includes('PÉ') || f.includes('PE E CRIVO') || f.includes('CRIVO')) return 'Válvula Pé e Crivo'

  // ENTRADAS / SAÍDAS
  if (f.includes('ENTRADA BORDA')) return 'Entrada Borda'
  if (f.includes('ENTRADA')) return 'Entrada Normal'
  if (f.includes('SAÍDA') || f.includes('SAIDA')) return 'Saída Canalização'

  return null
}

/**
 * Parseia CSV exportado do Revit (separador: ponto e vírgula)
 * Formato: FAMILIA;QUANT;Tamanho;Comentários
 * Agrupa por "Comentários" (= nome do trecho)
 * Retorna array de TrechoRevit
 */
export function parsearCSVRevit(csvText: string): TrechoRevit[] {
  // Remove BOM se presente
  const text = csvText.replace(/^\uFEFF/, '').trim()
  const linhas = text.split(/\r?\n/)

  if (linhas.length === 0) return []

  // Detectar linha de cabeçalho
  const header = linhas[0].split(';').map(h => h.trim().toLowerCase())
  const idxFamilia = header.findIndex(h => h.includes('familia') || h.includes('família') || h.includes('family'))
  const idxQuant = header.findIndex(h => h.includes('quant') || h.includes('count'))
  const idxTamanho = header.findIndex(h => h.includes('tamanho') || h.includes('size') || h.includes('type'))
  const idxComent = header.findIndex(h => h.includes('coment') || h.includes('comment') || h.includes('mark'))

  // Fallback para colunas padrão se não detectado
  const colFamilia = idxFamilia >= 0 ? idxFamilia : 0
  const colQuant = idxQuant >= 0 ? idxQuant : 1
  const colTamanho = idxTamanho >= 0 ? idxTamanho : 2
  const colComent = idxComent >= 0 ? idxComent : 3

  const trechosMap: Record<string, { pecas: Record<string, number>, dns: number[] }> = {}

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i].trim()
    if (!linha) continue

    const cols = linha.split(';')
    if (cols.length < 3) continue

    const familia = (cols[colFamilia] || '').trim()
    const quantStr = (cols[colQuant] || '').trim()
    const tamanho = (cols[colTamanho] || '').trim()
    const comentario = (cols[colComent] || '').trim()

    // Pular linha de total
    if (familia.toLowerCase().includes('grand total') ||
        familia.toLowerCase().includes('total geral') ||
        familia === '') continue

    const quant = parseInt(quantStr) || 1
    if (quant <= 0) continue

    const trechoNome = comentario || 'SEM TRECHO'
    if (!trechosMap[trechoNome]) {
      trechosMap[trechoNome] = { pecas: {}, dns: [] }
    }

    const tipoPeca = mapearFamiliaParaTipo(familia, tamanho)
    if (tipoPeca) {
      trechosMap[trechoNome].pecas[tipoPeca] = (trechosMap[trechoNome].pecas[tipoPeca] || 0) + quant
    }

    const dn = extrairDN(tamanho)
    if (dn > 0) {
      trechosMap[trechoNome].dns.push(...Array(quant).fill(dn))
    }
  }

  // Converter para array
  return Object.entries(trechosMap).map(([nome, data]) => {
    const pecas: Peca[] = Object.entries(data.pecas).map(([tipo, quantidade]) => ({ tipo, quantidade }))

    // DN dominante = média ponderada dos DNs presentes
    const dnDominante = data.dns.length > 0
      ? Math.round(data.dns.reduce((a, b) => a + b, 0) / data.dns.length)
      : 50

    // Encontrar DN mais próximo disponível
    const dnFinal = DNS_DISPONIVEIS.reduce((prev, curr) =>
      Math.abs(curr - dnDominante) < Math.abs(prev - dnDominante) ? curr : prev
    )

    return { nome, pecas, dnDominante: dnFinal }
  })
}

// Lista de tipos de peças disponíveis (ordem alfabética)
export const TIPOS_PECAS = Object.keys(CE_TABLE).sort()

// DNs disponíveis (da planilha de referência)
export const DNS_DISPONIVEIS = [25, 32, 40, 50, 63, 75, 100, 125, 150, 200, 250, 300, 350]
