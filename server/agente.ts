import Anthropic from '@anthropic-ai/sdk';
import { lerConfigAgente } from './config.js';

const client = new Anthropic();

export interface Imagem {
  tipo: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  base64: string;
}

/**
 * Abre a conversa (sessão do agente) com o repositório do sistema clonado em /workspace/sistema.
 * `outra` troca as instruções e o teto só nesta sessão (ex.: montar o mapa do sistema).
 */
export async function abrirSessao(
  sistema: { nome: string; repo_url: string; branch: string | null },
  usuario: string,
  outra?: { system: string; tetoCentavos: number },
) {
  const s = await client.beta.sessions.create({
    agent: outra ? { type: 'agent_with_overrides', id: process.env.AGENT_ID!, system: outra.system } : process.env.AGENT_ID!,
    environment_id: process.env.ENVIRONMENT_ID!,
    title: `${sistema.nome} - ${usuario}`,
    resources: [
      {
        type: 'github_repository',
        url: sistema.repo_url,
        mount_path: '/workspace/sistema',
        authorization_token: process.env.GITHUB_TOKEN!,
        ...(sistema.branch ? { checkout: { type: 'branch' as const, name: sistema.branch } } : {}),
      },
    ],
    // Teto de gasto da conversa (Configurações › Agente de IA): ao atingir, o agente para e o cliente abre outra conversa
    budget: {
      type: 'limit',
      max_list_cost: { amount: String(outra?.tetoCentavos ?? Math.round((await lerConfigAgente()).orcamento * 100)), currency: 'USD' },
    },
  });
  return s.id;
}

/**
 * Envia a pergunta e entrega a resposta em `escrever` no fim. Devolve a resposta.
 *
 * Só vale a ÚLTIMA mensagem do agente: as anteriores são comentários da investigação
 * ("Vou ver os arquivos...", às vezes em inglês) e não podem chegar ao cliente nem ao mapa.
 */
export async function perguntar(
  sessaoId: string,
  texto: string,
  imagem: Imagem | null,
  escrever: (t: string) => void,
  avisoLimite = '\n\n(Esta conversa chegou ao limite. Clique em "Nova conversa" para continuar.)',
) {
  // Stream aberto antes do envio, para não perder os primeiros eventos
  const stream = await client.beta.sessions.events.stream(sessaoId);
  await client.beta.sessions.events.send(sessaoId, {
    events: [
      {
        type: 'user.message',
        content: [
          ...(imagem ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: imagem.tipo, data: imagem.base64 } }] : []),
          { type: 'text' as const, text: texto },
        ],
      },
    ],
  });

  /** Texto da última mensagem do agente (cada mensagem nova substitui a anterior) */
  let ultima = '';
  let aviso = '';
  for await (const ev of stream) {
    if (ev.type === 'agent.message') {
      const t = ev.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      if (t.trim()) ultima = t;
    } else if (ev.type === 'session.error') {
      console.error('Erro na sessão', sessaoId, JSON.stringify(ev));
    } else if (ev.type === 'session.status_terminated') {
      break;
    } else if (ev.type === 'session.status_idle') {
      if (ev.stop_reason.type === 'requires_action') continue;
      if (ev.stop_reason.type === 'budget_reached') aviso = avisoLimite;
      if (ev.stop_reason.type === 'retries_exhausted') aviso = '\n\n(Não consegui concluir a análise agora. Tente novamente em instantes.)';
      break;
    }
  }
  const resposta = ultima + aviso;
  if (resposta) escrever(resposta);
  return resposta;
}
