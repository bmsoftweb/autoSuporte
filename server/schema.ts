/**
 * Metadados das telas de cadastro (modelo do crmWeb, sem multiempresa).
 *
 * ÚNICA fonte de verdade dos CRUDs:
 *  - o backend monta o SQL com whitelist de colunas (evita SQL injection);
 *  - o frontend recebe via GET /api/meta/resources e desenha lista e formulário.
 */

export type FieldType = 'text' | 'textarea' | 'number' | 'enum' | 'boolean' | 'password' | 'datetime';

export interface FieldDef {
  /** Nome da coluna no MySQL */
  name: string;
  /** Rótulo exibido na interface */
  label: string;
  type: FieldType;
  /** Texto auxiliar exibido abaixo do campo no formulário */
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** Gerado pelo banco: nunca vai em INSERT/UPDATE */
  readOnly?: boolean;
  /** Exibido na grade de listagem */
  listed?: boolean;
  /** Participa da busca rápida (LIKE) */
  searchable?: boolean;
  /** Aparece no painel de busca avançada */
  filterable?: boolean;
  /** Opções para type === 'enum' */
  options?: { value: string; label: string }[];
  maxLength?: number;
  /** Linhas visíveis de um textarea no formulário (padrão 3) */
  rows?: number;
  /** Chave estrangeira: a lista mostra o rótulo do registro ligado e a busca avançada, um combo */
  ref?: { resource: string; labelField: string };
  /**
   * Coluna calculada (só leitura): expressão SQL sobre o alias "t", ex.: subconsulta em outra tabela.
   * Não existe na tabela e nunca é gravada; não vai para o navegador.
   */
  sql?: string;
  /** Texto: o formulário oferece os valores já usados neste campo (lista digitável) */
  sugestoes?: boolean;
  /** Só em password: grava cifrado (token que o servidor precisa ler de volta) em vez de bcrypt */
  cifrado?: boolean;
  /** Valor inicial na inclusão */
  default?: string | number | boolean;
  /** Largura sugerida da coluna na grade */
  width?: 'xs' | 'sm' | 'md' | 'lg';
}

export interface ResourceDef {
  /** Identificador usado nas rotas: /api/crud/:resource */
  name: string;
  /** Tabela, ou consulta entre parênteses (lista montada sobre outra tabela; não vai para o navegador) */
  table: string;
  label: string;
  labelSingular: string;
  description: string;
  pk: string[];
  autoIncrement: boolean;
  /** Campo usado como título da aba do registro */
  labelField: string;
  defaultSort: { field: string; dir: 'asc' | 'desc' };
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Clientes também acessam (só leitura); sem isto, só administradores */
  publico?: boolean;
  /** Filtro aplicado a toda consulta, sobre o alias "t"; cada "?" = usuário logado */
  escopoSql?: string;
  fields: FieldDef[];
}

export const PERFIS = [
  { value: 'cliente', label: 'Cliente' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'admin', label: 'Administrador' },
];

/** Conversa privada (padrão) ou pública: a pública poderá ser liberada aos usuários finais */
export const VISIBILIDADES = [
  { value: 'privado', label: 'Privada' },
  { value: 'publico', label: 'Pública' },
];

export const RESOURCES: ResourceDef[] = [
  {
    name: 'sistemas',
    table: 'sistemas',
    label: 'Sistemas',
    labelSingular: 'Sistema',
    description: 'Sistemas sobre os quais os clientes tiram dúvidas (repositório no GitHub)',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'nome',
    // Grupo + nome (o nome entra como desempate na listagem)
    defaultSort: { field: 'grupo', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    fields: [
      { name: 'id', label: 'ID', type: 'number', readOnly: true, listed: true, width: 'xs' },
      {
        name: 'grupo',
        label: 'Grupo',
        type: 'text',
        listed: true,
        searchable: true,
        filterable: true,
        maxLength: 60,
        sugestoes: true,
        placeholder: 'Ex.: Fiscal, Utils, Vendas',
        hint: 'Agrupa o sistema no menu lateral; escreva igual nos sistemas do mesmo grupo. Em branco: fica no topo, sem grupo',
      },
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 120 },
      {
        name: 'repo_url',
        label: 'Repositório',
        type: 'text',
        required: true,
        listed: true,
        searchable: true,
        maxLength: 255,
        placeholder: 'https://github.com/dono/repositorio',
        hint: 'O token do GitHub precisa ter acesso de leitura a este repositório',
      },
      { name: 'branch', label: 'Branch', type: 'text', listed: true, maxLength: 100, hint: 'Em branco: a branch padrão do repositório' },
      {
        name: 'github_token',
        label: 'Token do GitHub',
        type: 'password',
        cifrado: true,
        maxLength: 255,
        placeholder: 'Em branco: o token padrão (GITHUB_TOKEN)',
        hint: 'Só para repositório de outra conta do GitHub: token fine-grained com "Contents: Read" nele. Gravado cifrado; na alteração, em branco mantém o atual',
      },
      {
        name: 'mapa',
        label: 'Mapa do sistema',
        type: 'textarea',
        rows: 14,
        maxLength: 60000,
        placeholder: 'Cadastros › Clientes: tela uClientes.pas / uClientes.dfm\nVendas › Pedidos: uPedidos.pas; desconto calculado em uRegrasPedido.pas\n...',
        hint: 'Opcional. Vai junto com a primeira pergunta de cada conversa: o agente vai direto aos arquivos certos e gasta menos. Uma linha por tela: menu › tela › arquivos principais e onde fica a regra',
      },
    ],
  },
  {
    name: 'usuarios',
    table: 'usuarios',
    label: 'Usuários',
    labelSingular: 'Usuário',
    description: 'Quem acessa o suporte: clientes e administradores',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'nome',
    defaultSort: { field: 'nome', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    fields: [
      { name: 'id', label: 'ID', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 120 },
      { name: 'email', label: 'E-mail', type: 'text', required: true, listed: true, searchable: true, maxLength: 160 },
      { name: 'senha_hash', label: 'Senha', type: 'password', hint: 'Obrigatória na inclusão; na alteração, em branco mantém a atual' },
      {
        name: 'tipo',
        label: 'Perfil',
        type: 'enum',
        required: true,
        listed: true,
        filterable: true,
        options: PERFIS,
        default: 'cliente',
        hint: 'Administrador mantém os cadastros; cliente e técnico só tiram dúvidas. Técnico recebe respostas técnicas só do banco (tabelas, colunas, SQL); administrador também vê arquivos e código',
      },
      { name: 'ativo', label: 'Ativo', type: 'boolean', listed: true, filterable: true },
    ],
  },
  {
    // Só leitura: cada linha é uma pergunta; abrir mostra a conversa inteira (mesmo sessao_id)
    name: 'conversas',
    table: 'perguntas',
    label: 'Conversas',
    labelSingular: 'Conversa',
    description: 'Perguntas dos clientes e respostas do agente',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'pergunta',
    defaultSort: { field: 'criado_em', dir: 'desc' },
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    fields: [
      { name: 'id', label: 'ID', type: 'number', readOnly: true, width: 'xs' },
      { name: 'criado_em', label: 'Data', type: 'datetime', readOnly: true, listed: true, filterable: true },
      { name: 'usuario_id', label: 'Cliente', type: 'number', readOnly: true, listed: true, filterable: true, ref: { resource: 'usuarios', labelField: 'nome' } },
      { name: 'sistema_id', label: 'Sistema', type: 'number', readOnly: true, listed: true, filterable: true, ref: { resource: 'sistemas', labelField: 'nome' } },
      {
        name: 'titulo',
        label: 'Conversa',
        type: 'text',
        readOnly: true,
        listed: true,
        searchable: true,
        filterable: true,
        // Nome dado pelo cliente (tabela conversas); sem nome, a primeira pergunta da conversa
        sql: `COALESCE((SELECT c.titulo FROM conversas c WHERE c.sessao_id = t.sessao_id),
                       (SELECT p1.pergunta FROM perguntas p1 WHERE p1.sessao_id = t.sessao_id ORDER BY p1.id LIMIT 1))`,
      },
      { name: 'pergunta', label: 'Pergunta', type: 'text', readOnly: true, listed: true, searchable: true, filterable: true },
      {
        name: 'visibilidade',
        label: 'Visibilidade',
        type: 'enum',
        readOnly: true,
        listed: true,
        filterable: true,
        options: VISIBILIDADES,
        // Tabela conversas; sem linha lá, a conversa é privada
        sql: `COALESCE((SELECT c.visibilidade FROM conversas c WHERE c.sessao_id = t.sessao_id), 'privado')`,
      },
      { name: 'resposta', label: 'Resposta', type: 'textarea', readOnly: true, searchable: true },
      { name: 'com_imagem', label: 'Print', type: 'boolean', readOnly: true, listed: true, filterable: true },
      { name: 'sessao_id', label: 'Sessão', type: 'text', readOnly: true },
    ],
  },
  {
    // Lista do cliente: uma linha por conversa (perguntas agrupadas pela sessão do agente); abrir reabre no chat
    name: 'minhas_conversas',
    table: `(SELECT MIN(id) AS id, sessao_id, usuario_id, sistema_id, MAX(criado_em) AS ultima, COUNT(*) AS qtd, MAX(com_imagem) AS com_imagem
               FROM perguntas GROUP BY sessao_id, usuario_id, sistema_id)`,
    label: 'Minhas conversas',
    labelSingular: 'Conversa',
    description: 'Suas dúvidas anteriores; clique numa conversa para continuar',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'titulo',
    defaultSort: { field: 'ultima', dir: 'desc' },
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    publico: true,
    // Só as do próprio usuário, e dos sistemas ainda liberados (é por eles que a conversa pode continuar)
    escopoSql: 't.usuario_id = ? AND EXISTS (SELECT 1 FROM usuario_sistemas us WHERE us.usuario_id = t.usuario_id AND us.sistema_id = t.sistema_id)',
    fields: [
      { name: 'id', label: 'ID', type: 'number', readOnly: true, width: 'xs' },
      { name: 'ultima', label: 'Última pergunta', type: 'datetime', readOnly: true, listed: true, filterable: true },
      { name: 'sistema_id', label: 'Sistema', type: 'number', readOnly: true, listed: true, filterable: true, ref: { resource: 'sistemas', labelField: 'nome' } },
      {
        name: 'titulo',
        label: 'Conversa',
        type: 'text',
        readOnly: true,
        listed: true,
        searchable: true,
        filterable: true,
        sql: `COALESCE((SELECT c.titulo FROM conversas c WHERE c.sessao_id = t.sessao_id),
                       (SELECT p1.pergunta FROM perguntas p1 WHERE p1.sessao_id = t.sessao_id ORDER BY p1.id LIMIT 1))`,
      },
      { name: 'qtd', label: 'Perguntas', type: 'number', readOnly: true, listed: true, width: 'xs' },
      {
        name: 'visibilidade',
        label: 'Visibilidade',
        type: 'enum',
        readOnly: true,
        listed: true,
        filterable: true,
        options: VISIBILIDADES,
        // Tabela conversas; sem linha lá, a conversa é privada
        sql: `COALESCE((SELECT c.visibilidade FROM conversas c WHERE c.sessao_id = t.sessao_id), 'privado')`,
      },
      { name: 'com_imagem', label: 'Print', type: 'boolean', readOnly: true, filterable: true },
      { name: 'sessao_id', label: 'Sessão', type: 'text', readOnly: true },
      { name: 'usuario_id', label: 'Usuário', type: 'number', readOnly: true },
    ],
  },
];

export function getResource(name: string): ResourceDef | null {
  return RESOURCES.find((r) => r.name === name) ?? null;
}

/** Colunas graváveis: exclui readOnly e a PK */
export function writableFields(resource: ResourceDef): FieldDef[] {
  return resource.fields.filter((f) => !f.readOnly && !resource.pk.includes(f.name));
}

/** Expressão SQL da coluna: a própria coluna da tabela ou a da coluna calculada */
export function colunaSql(resource: ResourceDef, nome: string): string {
  return resource.fields.find((f) => f.name === nome)?.sql ?? `t.${nome}`;
}

/** Todas as colunas conhecidas — whitelist de ordenação e filtros */
export function columnNames(resource: ResourceDef): string[] {
  return resource.fields.map((f) => f.name);
}
