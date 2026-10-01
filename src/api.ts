import { FiltroAvancado, ListaPaginada, RegistroCrud, ResourceDef } from './types';

/** Chamadas ao servidor. O token vem da sessão; 401 avisa o App para voltar ao login. */

let token = '';
let aoExpirar: (msg: string) => void = () => {};

export const definirToken = (t: string) => {
  token = t;
};
export const definirAoExpirar = (fn: (msg: string) => void) => {
  aoExpirar = fn;
};

/** fetch com o token; erro do servidor vira exceção com a mensagem dele */
export async function chamar(metodo: string, url: string, corpo?: unknown): Promise<Response> {
  const r = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (r.ok) return r;
  const msg = (await r.json().catch(() => ({}))).error || 'Falha na comunicação com o servidor.';
  if (r.status === 401 && token) aoExpirar(msg);
  throw new Error(msg);
}

const get = async <T>(url: string): Promise<T> => (await chamar('GET', url)).json();

export interface Sistema {
  id: number;
  nome: string;
}

export const login = async (email: string, senha: string) => (await chamar('POST', '/api/login', { email, senha })).json();
export const fetchSistemas = () => get<Sistema[]>('/api/sistemas');
export const trocarMinhaSenha = (atual: string, nova: string) => chamar('POST', '/api/minha-senha', { atual, nova });

/** Conversa do próprio usuário, para reabrir no chat (a lista "Minhas conversas" é a grade do recurso minhas_conversas) */
export const fetchMinhaConversa = (sessao: string) =>
  get<{ titulo: string | null; mensagens: { id: number; pergunta: string; resposta: string; com_imagem: number }[] }>(
    `/api/minhas-conversas/${encodeURIComponent(sessao)}`,
  );
/** Dá nome a uma conversa do próprio usuário; em branco volta ao padrão (a primeira pergunta) */
export const renomearConversa = async (sessao: string, titulo: string): Promise<string | null> =>
  (await (await chamar('PUT', `/api/minhas-conversas/${encodeURIComponent(sessao)}`, { titulo })).json()).titulo;

// ------------------------------------------------------------
// Cadastros (só administradores)
// ------------------------------------------------------------
export const fetchResources = () => get<ResourceDef[]>('/api/meta/resources');

export interface ParamsLista {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  filters?: FiltroAvancado[];
}

export function listRecords(resource: string, p: ParamsLista = {}): Promise<ListaPaginada> {
  const q = new URLSearchParams();
  if (p.page) q.set('page', String(p.page));
  if (p.limit) q.set('limit', String(p.limit));
  if (p.search) q.set('search', p.search);
  if (p.sort) q.set('sort', p.sort);
  if (p.dir) q.set('dir', p.dir);
  if (p.filters?.length) q.set('filters', JSON.stringify(p.filters));
  return get(`/api/crud/${resource}?${q}`);
}

export const createRecord = (resource: string, payload: RegistroCrud) => chamar('POST', `/api/crud/${resource}`, payload);
export const updateRecord = (resource: string, id: string, payload: RegistroCrud) =>
  chamar('PUT', `/api/crud/${resource}/${encodeURIComponent(id)}`, payload);
export const deleteRecord = (resource: string, id: string) => chamar('DELETE', `/api/crud/${resource}/${encodeURIComponent(id)}`);

/** Sistemas liberados de um usuário (ids) */
export const fetchSistemasDoUsuario = (id: string) => get<number[]>(`/api/usuarios/${encodeURIComponent(id)}/sistemas`);

/** Configurações (tabela config): grupo + chave */
export const fetchConfig = <T = any>(grupo: string, chave: string) => get<{ valor: T } & Record<string, any>>(`/api/config/${grupo}/${chave}`);
export const salvarConfig = (grupo: string, chave: string, valor: unknown) => chamar('PUT', `/api/config/${grupo}/${chave}`, { valor });

/** Saldo estimado de créditos (menu, só administradores) */
export interface Creditos {
  configurado: boolean;
  saldo?: number;
  data?: string;
  alerta?: number;
  gasto?: number;
  estimado?: number;
  erro?: string;
}
export const fetchCreditos = () => get<Creditos>('/api/creditos');

export const fetchConfigListas = () => get<Record<string, unknown>>('/api/config-listas');
export const saveConfigListas = (config: Record<string, unknown>) => chamar('PUT', '/api/config-listas', config);

export interface OpcaoRef {
  value: string;
  label: string;
}
/** Opções de um combo de chave estrangeira (busca avançada) */
export const fetchOptions = (resource: string) => get<OpcaoRef[]>(`/api/options/${resource}`);

export interface MensagemConversa {
  id: number;
  criado_em: string;
  pergunta: string;
  resposta: string;
  com_imagem: number;
  cliente: string | null;
  sistema: string | null;
  /** Nome dado pelo cliente; null = sem nome */
  titulo: string | null;
}
/** Conversa inteira: todas as perguntas da mesma sessão do agente */
export const fetchConversa = (sessao: string) => get<MensagemConversa[]>(`/api/conversas/${encodeURIComponent(sessao)}`);
