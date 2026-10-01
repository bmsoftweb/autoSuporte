/** Metadados dos cadastros: espelho de server/schema.ts (vêm de GET /api/meta/resources) */

export type FieldType = 'text' | 'textarea' | 'number' | 'enum' | 'boolean' | 'password' | 'datetime';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  listed?: boolean;
  searchable?: boolean;
  /** Aparece no painel de busca avançada */
  filterable?: boolean;
  options?: { value: string; label: string }[];
  maxLength?: number;
  /** Linhas visíveis de um textarea no formulário (padrão 3) */
  rows?: number;
  /** Chave estrangeira: a lista mostra <campo>__rotulo e a busca avançada, um combo */
  ref?: { resource: string; labelField: string };
  /** Valor inicial na inclusão */
  default?: string | number | boolean;
  width?: 'xs' | 'sm' | 'md' | 'lg';
}

export interface ResourceDef {
  name: string;
  table: string;
  label: string;
  labelSingular: string;
  description: string;
  pk: string[];
  autoIncrement: boolean;
  labelField: string;
  defaultSort: { field: string; dir: 'asc' | 'desc' };
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Clientes também acessam (só leitura) */
  publico?: boolean;
  fields: FieldDef[];
}

export type RegistroCrud = Record<string, any>;

/** Operadores aceitos pela busca avançada */
export type FiltroOp = 'contains' | 'eq' | 'ne' | 'gte' | 'lte';

export interface FiltroAvancado {
  field: string;
  op: FiltroOp;
  value: string;
}

export interface ListaPaginada {
  data: RegistroCrud[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
