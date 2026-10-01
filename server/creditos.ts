import Anthropic from '@anthropic-ai/sdk';
import { Request, Response, Router } from 'express';
import { type ConfigCreditos, lerConfig } from './config.js';

/**
 * Saldo estimado de créditos da Anthropic (menu lateral, só administradores).
 *
 * A API não informa o saldo (e a conta é individual: sem Admin API). O administrador informa o saldo
 * que viu no Console e a data; daqui sai esse valor menos o custo das sessões do agente desde então
 * (conversas e montagens de mapa). Uso fora do app (ex.: Playground) não entra.
 */

/** Guarda o gasto por 5 minutos: o menu recarrega nesse ritmo e listar as sessões tem custo de tempo */
const VALIDADE_MS = 5 * 60 * 1000;
/** O gasto só depende do início da contagem: trocar o saldo não invalida; trocar a data, sim */
let cache: { em: number; gastoCentavos: number; chave: string } | null = null;

/** Soma o custo (em centavos, a preço de tabela) das sessões do agente criadas a partir de `desde` (UTC) */
async function gastoDesde(desde: string): Promise<number> {
  const client = new Anthropic();
  let total = 0;
  for await (const s of client.beta.sessions.list({
    agent_id: process.env.AGENT_ID!,
    'created_at[gte]': desde,
    include_archived: true,
    limit: 100,
  })) {
    total += Number(s.usage?.list_cost?.amount) || 0;
  }
  return total;
}

export function createCreditosRouter(): Router {
  const router = Router();

  router.get('/creditos', async (_req: Request, res: Response) => {
    try {
      const cfg = (await lerConfig('creditos', 'saldo')) as ConfigCreditos | null;
      if (!cfg) return res.json({ configurado: false });

      // Configuração antiga, sem `desde`: meia-noite de Brasília da data informada
      const desde = cfg.desde || `${cfg.data}T03:00:00Z`;
      if (!cache || cache.chave !== desde || Date.now() - cache.em > VALIDADE_MS) {
        cache = { em: Date.now(), gastoCentavos: await gastoDesde(desde), chave: desde };
      }
      const gasto = cache.gastoCentavos / 100;
      res.json({ configurado: true, ...cfg, gasto, estimado: Math.round((cfg.saldo - gasto) * 100) / 100 });
    } catch (err: any) {
      // Erro da consulta não derruba o menu: mostra o aviso no lugar do saldo
      res.json({ configurado: true, erro: `Não foi possível calcular o gasto: ${err.message}` });
    }
  });

  return router;
}
