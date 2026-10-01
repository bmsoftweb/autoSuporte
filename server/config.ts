import Anthropic from '@anthropic-ai/sdk';
import { Request, Response, Router } from 'express';
import { pool } from './db.js';
import { PROMPT_PADRAO } from './prompt.js';

/**
 * Configurações do app (tabela config, modelo do crmWeb sem multiempresa).
 * Cada linha é `grupo + chave = valor`, com o valor em JSON. A tela de Configurações tem uma aba por grupo.
 */

/** Grupos e chaves aceitos: o que não está aqui não entra no banco */
const CHAVES: Record<string, string[]> = {
  agente: ['ia'],
  // { saldo, data, alerta }: saldo visto no Console numa data; o menu mostra esse saldo menos o gasto desde então
  creditos: ['saldo'],
  // { posicoes: { [sistemaId]: { x, y } } }: onde cada sistema está no quadro do Ecossistema (as ligações ficam em sistema_relacionados)
  ecossistema: ['quadro'],
};

export interface ConfigCreditos {
  /** Saldo visto no Console, em dólares */
  saldo: number;
  /** Data em que o saldo foi visto: "aaaa-mm-dd" */
  data: string;
  /** Saldo estimado abaixo disto fica em vermelho no menu (0 = sem aviso) */
  alerta: number;
  /**
   * Instante (UTC) a partir do qual o gasto é descontado. Saldo visto hoje: o momento em que foi gravado
   * (o que já se gastou hoje está no saldo do Console). Outro dia: a meia-noite de Brasília daquele dia.
   */
  desde?: string;
}

/** Data de hoje no horário de Brasília (UTC-3), "aaaa-mm-dd", independente do fuso do servidor */
function hojeBrasilia(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function prepararCreditos(v: any): ConfigCreditos {
  const saldo = Math.round(Number(v?.saldo) * 100) / 100;
  if (!Number.isFinite(saldo) || saldo < 0) throw new Error('Saldo informado inválido.');
  const data = String(v?.data || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data em que você viu o saldo.');
  const alerta = Math.round(Number(v?.alerta || 0) * 100) / 100;
  if (!Number.isFinite(alerta) || alerta < 0) throw new Error('Valor de alerta inválido.');
  // Instante em UTC para a API das sessões (não é data gravada como "hoje": essa é `data`, em Brasília)
  const desde = data === hojeBrasilia() ? new Date().toISOString() : `${data}T03:00:00Z`;
  return { saldo, data, alerta, desde };
}

/** Modelos oferecidos (só os que aceitam o ajuste de esforço) */
export const MODELOS = [
  { value: 'claude-opus-5-5', label: 'Claude Opus 5.5 — respostas melhores (US$ 4 / 20 por milhão de tokens)' },
  { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — metade do custo (US$ 2 / 10 por milhão de tokens)' },
];
export const ESFORCOS = [
  { value: 'low', label: 'Baixo — menos buscas e raciocínio, mais barato' },
  { value: 'medium', label: 'Médio — equilíbrio' },
  { value: 'high', label: 'Alto — investiga mais, mais caro' },
];

export interface ConfigAgente {
  modelo: string;
  esforco: 'low' | 'medium' | 'high';
  /** Teto de gasto por conversa, em dólares (ex.: 1.00) */
  orcamento: number;
  instrucoes: string;
}

/** Valores de quem ainda não salvou a configuração: os mesmos com que o agente foi criado */
const PADRAO_AGENTE: ConfigAgente = {
  modelo: 'claude-opus-5-5',
  esforco: 'medium',
  orcamento: (Number(process.env.ORCAMENTO_CENTAVOS) || 100) / 100,
  instrucoes: PROMPT_PADRAO,
};

const TAMANHO_MAX = 200_000;

function validar(grupo: string, chave: string) {
  if (!CHAVES[grupo]?.includes(chave)) throw Object.assign(new Error(`Configuração desconhecida: ${grupo}.${chave}`), { status: 404 });
}

/** Grava o valor (JSON) de grupo + chave; quem chama já validou o conteúdo */
export async function gravarConfig(grupo: string, chave: string, valor: unknown, conn: { query: typeof pool.query } = pool) {
  validar(grupo, chave);
  const texto = JSON.stringify(valor ?? null);
  if (texto.length > TAMANHO_MAX) throw Object.assign(new Error('Configuração grande demais.'), { status: 413 });
  const [existe] = await conn.query<any[]>('SELECT id FROM config WHERE grupo = ? AND chave = ? LIMIT 1', [grupo, chave]);
  if (existe.length) {
    await conn.query('UPDATE config SET valor = ? WHERE id = ?', [texto, existe[0].id]);
  } else {
    // A coluna id não é AUTO_INCREMENT: o próximo número vem do maior gravado
    await conn.query('INSERT INTO config (id, grupo, chave, valor) SELECT COALESCE(MAX(id), 0) + 1, ?, ?, ? FROM config', [grupo, chave, texto]);
  }
}

/** Lê o valor gravado, ou null quando ainda não foi configurado */
export async function lerConfig(grupo: string, chave: string): Promise<any> {
  const [rows] = await pool.query<any[]>('SELECT valor FROM config WHERE grupo = ? AND chave = ? LIMIT 1', [grupo, chave]);
  if (!rows.length || rows[0].valor === null) return null;
  try {
    return JSON.parse(rows[0].valor);
  } catch {
    return null; // conteúdo inválido no banco não derruba a tela
  }
}

/** Configuração do agente, com os padrões no que ainda não foi salvo */
export async function lerConfigAgente(): Promise<ConfigAgente> {
  // ler_mapa: interruptor antigo (o mapa agora é campo do cadastro de Sistemas); não volta para a tela
  const { ler_mapa: _antigo, ...gravado } = (await lerConfig('agente', 'ia')) || {};
  return { ...PADRAO_AGENTE, ...gravado };
}

/** Valida o que veio da tela; erro com mensagem para o administrador */
function prepararAgente(v: any): ConfigAgente {
  const modelo = String(v?.modelo || '');
  if (!MODELOS.some((m) => m.value === modelo)) throw new Error('Modelo inválido.');
  const esforco = String(v?.esforco || '');
  if (!ESFORCOS.some((e) => e.value === esforco)) throw new Error('Esforço inválido.');
  const orcamento = Math.round(Number(v?.orcamento) * 100) / 100;
  if (!Number.isFinite(orcamento) || orcamento < 0.1 || orcamento > 50) throw new Error('Teto por conversa: entre US$ 0,10 e US$ 50,00.');
  const instrucoes = String(v?.instrucoes || '').trim();
  if (instrucoes.length < 20) throw new Error('Instruções do agente: escreva as instruções (ou use "Restaurar padrão").');
  if (instrucoes.length > 50_000) throw new Error('Instruções do agente: texto grande demais.');
  return { modelo, esforco: esforco as ConfigAgente['esforco'], orcamento, instrucoes };
}

/** Leva modelo, esforço e instruções para o agente na Anthropic (as conversas novas usam a versão nova) */
async function aplicarNoAgente(cfg: ConfigAgente) {
  const client = new Anthropic();
  await client.beta.agents.update(process.env.AGENT_ID!, {
    model: { id: cfg.modelo, effort: cfg.esforco },
    system: cfg.instrucoes,
  });
}

/** Rotas das Configurações. Quem monta este router garante que só administradores chegam aqui. */
export function createConfigRouter(): Router {
  const router = Router();

  router.get('/config/:grupo/:chave', async (req: Request, res: Response) => {
    try {
      const { grupo, chave } = req.params;
      validar(grupo, chave);
      if (grupo === 'agente') {
        return res.json({ valor: await lerConfigAgente(), modelos: MODELOS, esforcos: ESFORCOS, prompt_padrao: PROMPT_PADRAO });
      }
      res.json({ valor: await lerConfig(grupo, chave) });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  router.put('/config/:grupo/:chave', async (req: Request, res: Response) => {
    try {
      const { grupo, chave } = req.params;
      validar(grupo, chave);
      let valor = req.body?.valor;
      if (grupo === 'agente') {
        valor = prepararAgente(valor);
        // Primeiro na Anthropic: se falhar, nada é gravado e a tela mostra o erro
        await aplicarNoAgente(valor);
      }
      if (grupo === 'creditos') valor = prepararCreditos(valor);
      await gravarConfig(grupo, chave, valor);
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  return router;
}
