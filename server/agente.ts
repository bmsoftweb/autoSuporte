import Anthropic from '@anthropic-ai/sdk';
import { lerConfigAgente } from './config.js';
import { PROMPT_COMPACTAR } from './prompt.js';
import { decifrar } from './segredo.js';

const client = new Anthropic();

/** Cliente da API com a chave do usuário; sem chave, a padrão (ANTHROPIC_API_KEY) */
const clienteDe = (chave?: string) => (chave ? new Anthropic({ apiKey: chave }) : client);

export interface Imagem {
  tipo: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  base64: string;
}

/** Repositório de um sistema; github_token já decifrado (null = o token padrão GITHUB_TOKEN) */
export interface Repo {
  nome: string;
  repo_url: string;
  branch: string | null;
  github_token?: string | null;
  mapa?: string | null;
}

export interface IaUsuario {
  modelo?: string;
  esforco?: string;
  /** Chave da API da Anthropic, já decifrada: a conta do próprio usuário, que paga as conversas dele */
  chave?: string;
  /** Agente e ambiente criados na conta do usuário (na primeira conversa com a chave dele) */
  agente?: string;
  ambiente?: string;
  /** Respostas com consultas SQL (técnico e administrador); sem valor gravado: sim */
  sugerirSql: boolean;
}

/** Modelo, esforço e chave gravados em usuarios.config (JSON); conteúdo inválido vale como vazio */
export function iaDoUsuario(config: string | null): IaUsuario {
  let c: any = {};
  try {
    c = JSON.parse(config || '{}') || {};
  } catch {
    // conteúdo inválido no banco: sem configuração
  }
  return {
    modelo: c.modelo || undefined,
    esforco: c.esforco || undefined,
    // Erro ao decifrar sobe (não cai calado na chave padrão)
    chave: c.anthropic_key ? decifrar(c.anthropic_key, 'Cadastros › Usuários') : undefined,
    sugerirSql: c.sugerir_sql !== 0,
    agente: c.agent_id || undefined,
    ambiente: c.environment_id || undefined,
  };
}

/**
 * Cria ambiente e agente numa conta da Anthropic (a principal, pelo script, ou a de um usuário com chave própria).
 * Só leitura: sem bash, escrita, edição nem internet; o agente só lê os repositórios montados.
 */
export async function criarAgente(c: Anthropic, system: string) {
  const env = await c.beta.environments.create({
    name: 'autosuporte',
    config: { type: 'cloud', networking: { type: 'limited' } },
  });
  const agent = await c.beta.agents.create({
    name: 'Suporte ao cliente',
    model: 'claude-sonnet-5-5',
    system,
    tools: [
      {
        type: 'agent_toolset_20260401',
        default_config: { enabled: false },
        configs: [
          { name: 'read', enabled: true },
          { name: 'glob', enabled: true },
          { name: 'grep', enabled: true },
        ],
      },
    ],
  });
  return { agent_id: agent.id, environment_id: env.id };
}

/** Agente e ambiente na conta do usuário, criados na primeira vez; `gravar` guarda os ids em usuarios.config */
export async function prepararContaUsuario(ia: IaUsuario, gravar: (ids: { agent_id: string; environment_id: string }) => Promise<void>) {
  if (!ia.chave || (ia.agente && ia.ambiente)) return ia;
  let ids;
  try {
    ids = await criarAgente(clienteDe(ia.chave), (await lerConfigAgente()).instrucoes);
  } catch (err: any) {
    if (err?.status === 401) throw Object.assign(new Error('A sua chave da Anthropic é inválida ou foi apagada. Cadastre outra em "Minha senha e IA".'), { status: 400 });
    if (err?.status === 403) throw Object.assign(new Error('A sua chave da Anthropic não tem permissão para criar o agente. Confira a conta no Console da Anthropic.'), { status: 400 });
    throw err;
  }
  await gravar(ids);
  return { ...ia, agente: ids.agent_id, ambiente: ids.environment_id };
}

/**
 * Confere no GitHub, antes de abrir a sessão (e gastar créditos), se o token lê o repositório e a branch.
 * Sem isso o agente abre sem o código e responde "não encontrei o repositório". Se o GitHub não responder, segue sem conferir.
 */
export async function conferirAcessoRepo(repo_url: string, branch: string | null, token: string) {
  const repo = repo_url.replace('https://github.com/', '');
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`, { headers: H }).catch(
    () => null,
  );
  if (!r || r.ok || r.status >= 500) return;

  let msg: string;
  const meta = await fetch(`https://api.github.com/repos/${repo}`, { headers: H }).catch(() => null);
  if (r.status === 401) msg = `O token do GitHub do sistema é inválido ou expirou. Gere outro e cadastre em Cadastros › Sistemas.`;
  else if (!meta?.ok) msg = `O token do GitHub não enxerga o repositório ${repo}. Inclua o repositório no token (ou cadastre o token da conta certa em Cadastros › Sistemas).`;
  else if (r.status === 403) msg = `O token do GitHub enxerga o repositório ${repo}, mas não pode ler os arquivos. Edite o token e dê a permissão "Contents: Read-only".`;
  else if (branch) msg = `A branch "${branch}" não existe no repositório ${repo}. Corrija em Cadastros › Sistemas (em branco usa a padrão).`;
  else msg = `O repositório ${repo} está vazio ou não pôde ser lido (GitHub ${r.status}).`;
  throw Object.assign(new Error(`${msg} Avise o administrador.`), { status: 400 });
}

/**
 * Abre a conversa (sessão do agente) com o repositório do sistema clonado em /workspace/sistema.
 * `outra` troca as instruções e o teto só nesta sessão (ex.: montar o mapa do sistema).
 */
export async function abrirSessao(
  sistema: Repo,
  usuario: string,
  outra?: { system: string; tetoCentavos?: number },
  /** Sistemas relacionados: abertos em /workspace/relacionados/<pasta>; o que o token não lê fica de fora (não barra a conversa) */
  relacionados: Repo[] = [],
  /** Modelo e esforço do usuário (usuarios.config); sem modelo, o do agente */
  ia: Partial<IaUsuario> = {},
) {
  const token = sistema.github_token || process.env.GITHUB_TOKEN!;
  await conferirAcessoRepo(sistema.repo_url, sistema.branch, token);
  const abertos: (Repo & { pasta: string })[] = [];
  const fora: { nome: string; motivo: string }[] = [];
  for (const r of relacionados) {
    try {
      await conferirAcessoRepo(r.repo_url, r.branch, r.github_token || process.env.GITHUB_TOKEN!);
      const base = r.repo_url.split('/').pop()!.replace(/[^\w.-]/g, '_');
      let pasta = base;
      for (let n = 2; abertos.some((a) => a.pasta === pasta); n++) pasta = `${base}_${n}`;
      abertos.push({ ...r, pasta });
    } catch (err: any) {
      console.error(`Relacionado "${r.nome}" fora da conversa:`, err.message);
      fora.push({ nome: r.nome, motivo: err.message });
    }
  }
  const repositorio = (r: Repo, mount_path: string) => ({
    type: 'github_repository' as const,
    url: r.repo_url,
    mount_path,
    authorization_token: r.github_token || process.env.GITHUB_TOKEN!,
    ...(r.branch ? { checkout: { type: 'branch' as const, name: r.branch } } : {}),
  });
  // Conta do usuário: o agente dele recebe sempre as instruções atuais (Configurações › Agente de IA), não as da criação
  const proprio = Boolean(ia.chave && ia.agente);
  const system = outra?.system ?? (proprio ? (await lerConfigAgente()).instrucoes : undefined);
  const s = await clienteDe(ia.chave).beta.sessions.create({
    agent:
      system || ia.modelo
        ? {
            type: 'agent_with_overrides',
            id: proprio ? ia.agente! : process.env.AGENT_ID!,
            ...(system ? { system } : {}),
            ...(ia.modelo ? { model: { id: ia.modelo, ...(ia.esforco ? { effort: ia.esforco as 'low' | 'medium' | 'high' } : {}) } } : {}),
          }
        : process.env.AGENT_ID!,
    environment_id: proprio ? ia.ambiente! : process.env.ENVIRONMENT_ID!,
    title: `${sistema.nome} - ${usuario}`,
    resources: [repositorio(sistema, '/workspace/sistema'), ...abertos.map((r) => repositorio(r, `/workspace/relacionados/${r.pasta}`))],
    // Teto de gasto da conversa (Configurações › Agente de IA): ao atingir, o agente para e o cliente abre outra conversa
    budget: {
      type: 'limit',
      max_list_cost: { amount: String(outra?.tetoCentavos ?? Math.round((await lerConfigAgente()).orcamento * 100)), currency: 'USD' },
    },
  });
  return { id: s.id, relacionados: abertos, fora };
}

/** A conversa existe na conta da chave atual? Trocar a chave deixa as conversas antigas na conta anterior */
export async function conferirSessao(sessaoId: string, chave?: string) {
  try {
    await clienteDe(chave).beta.sessions.retrieve(sessaoId);
  } catch (err: any) {
    if (err?.status === 404) {
      throw Object.assign(new Error('Esta conversa foi aberta com outra conta da Anthropic (a chave mudou). Clique em "Nova conversa" para continuar.'), {
        status: 400,
      });
    }
    throw err;
  }
}

/**
 * Compacta uma conversa em uma pergunta e uma resposta (formato FAQ).
 * Chamada simples à API (sem sessão nem repositório): só o texto da conversa.
 */
export async function compactarConversa(sistema: string, trocas: { pergunta: string; resposta: string }[], ia: Partial<IaUsuario> = {}) {
  const conversa = trocas.map((t, i) => `[${i + 1}] Pergunta: ${t.pergunta || '(só um print da tela)'}\nResposta: ${t.resposta}`).join('\n\n');
  const r = await clienteDe(ia.chave).messages.create({
    model: ia.modelo || 'claude-sonnet-5-5',
    max_tokens: 4000,
    system: PROMPT_COMPACTAR,
    messages: [{ role: 'user', content: `Sistema: ${sistema}\n\nConversa:\n${conversa}` }],
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { pergunta: { type: 'string' }, resposta: { type: 'string' } },
          required: ['pergunta', 'resposta'],
          additionalProperties: false,
        },
      },
    },
  });
  const texto = r.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const j = JSON.parse(texto);
  return { pergunta: String(j.pergunta).trim().slice(0, 120), resposta: String(j.resposta).trim() };
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
  /** Chave da API do usuário (a mesma com que a sessão foi aberta) */
  chave?: string,
) {
  const client = clienteDe(chave);
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
