import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { abrirSessao, perguntar } from './agente.js';
import { pool } from './db.js';
import { PROMPT_MAPA } from './prompt.js';
import { cifrar, decifrar } from './segredo.js';
import { FieldDef, ResourceDef, RESOURCES, getResource, writableFields, columnNames, colunaSql } from './schema.js';

/** Teto de gasto da montagem do mapa: percorrer o repositório custa mais que uma pergunta */
const TETO_MAPA_CENTAVOS = 500; // ponytail: fixo em US$ 5; virar configuração se precisar ajustar

/** Converte o valor recebido do formulário para o tipo esperado pela coluna do MySQL */
function coerceValue(field: FieldDef, raw: any): any {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') {
    // Campos obrigatórios em branco viram string vazia; opcionais viram NULL
    return field.required && field.type === 'text' ? '' : null;
  }
  switch (field.type) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'boolean':
      return raw === true || raw === 1 || raw === '1' || raw === 'true' ? 1 : 0;
    case 'enum': {
      const v = String(raw);
      if (field.options && !field.options.some((o) => o.value === v)) throw new Error(`Valor inválido em "${field.label}".`);
      return v;
    }
    default:
      return String(raw).trim();
  }
}

/** Monta o payload de gravação a partir do corpo da requisição, aplicando a whitelist de colunas */
function buildWritePayload(resource: ResourceDef, body: Record<string, any>, isUpdate: boolean): Record<string, any> {
  const payload: Record<string, any> = {};
  for (const field of writableFields(resource)) {
    if (!(field.name in body)) continue;
    // Senha: texto puro vira bcrypt; em branco mantém a atual (na inclusão é obrigatória, ver regras)
    if (field.type === 'password') {
      const plain = String(body[field.name] ?? '');
      if (plain.trim() === '') {
        if (!isUpdate) payload[field.name] = '';
        continue;
      }
      payload[field.name] = field.cifrado ? cifrar(plain.trim()) : bcrypt.hashSync(plain, 10);
      continue;
    }
    payload[field.name] = coerceValue(field, body[field.name]);
  }
  return payload;
}

/** Valida os campos obrigatórios antes de tocar no banco, para devolver mensagem amigável */
function validateRequired(resource: ResourceDef, payload: Record<string, any>, isUpdate: boolean) {
  const faltando: string[] = [];
  for (const field of writableFields(resource)) {
    if (!field.required || field.type === 'password') continue;
    if (isUpdate && !(field.name in payload)) continue;
    const value = payload[field.name];
    if (value === null || value === undefined || value === '') faltando.push(field.label);
  }
  if (faltando.length) throw new Error(`Preencha os campos obrigatórios: ${faltando.join(', ')}.`);
}

/** Endereço do repositório no GitHub, sem ".git" nem barra final; erro se não for do GitHub */
export function normalizarRepo(bruto: unknown): string {
  // Barra final primeiro: "repo.git/" também vira "repo"
  const url = String(bruto || '').trim().replace(/\/+$/, '').replace(/\.git$/, '');
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url)) {
    throw new Error('Repositório: informe o endereço do GitHub, ex.: https://github.com/dono/repositorio');
  }
  return url;
}

/** Regras próprias de cada cadastro, antes de gravar */
function antesDeGravar(resource: ResourceDef, payload: Record<string, any>, isUpdate: boolean) {
  if (resource.name === 'sistemas' && 'repo_url' in payload) payload.repo_url = normalizarRepo(payload.repo_url);
  if (resource.name === 'usuarios') {
    if ('email' in payload) {
      payload.email = String(payload.email || '').toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error('E-mail inválido.');
    }
    if (!isUpdate && !payload.senha_hash) throw new Error('Informe a senha do usuário.');
  }
}

/**
 * Sistemas ligados a um registro, editados no próprio formulário e gravados junto no Salvar:
 * usuário -> sistemas liberados no chat. (As ligações entre sistemas ficam no quadro, em server/ecossistema.ts)
 */
const LIGACOES: Record<string, { campo: string; tabela: string; dono: string; alvo: string; rotulo: string }> = {
  usuarios: { campo: 'sistemas', tabela: 'usuario_sistemas', dono: 'usuario_id', alvo: 'sistema_id', rotulo: 'Sistemas liberados' },
};

/** Ids ligados vindos do formulário (null = a lista não veio) */
function ligadosDoCorpo(resource: ResourceDef, body: any): number[] | null {
  const lig = LIGACOES[resource.name];
  if (!lig || !body || !(lig.campo in body)) return null;
  if (!Array.isArray(body[lig.campo])) throw new Error(`${lig.rotulo} em formato inválido.`);
  return [...new Set(body[lig.campo].map(Number).filter((n: number) => Number.isInteger(n) && n > 0))] as number[];
}

async function gravarLigados(resource: ResourceDef, donoId: string, ids: number[]) {
  const lig = LIGACOES[resource.name];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM ${lig.tabela} WHERE ${lig.dono} = ?`, [donoId]);
    if (ids.length) {
      // Só ids que existem: o SELECT descarta os inválidos
      await conn.query(`INSERT INTO ${lig.tabela} (${lig.dono}, ${lig.alvo}) SELECT ?, id FROM sistemas WHERE id IN (?)`, [donoId, ids]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Traduz erros do MySQL para mensagens legíveis */
export function friendlyDbError(err: any, labelSingular = 'registro'): string {
  switch (err?.code) {
    case 'ER_DUP_ENTRY':
      return `Já existe um ${labelSingular.toLowerCase()} com esse valor (${err.sqlMessage?.match(/for key '(.+?)'/)?.[1] || 'chave duplicada'}).`;
    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_ROW_IS_REFERENCED':
      return `Este ${labelSingular.toLowerCase()} não pode ser excluído porque existem registros vinculados a ele.`;
    case 'ER_DATA_TOO_LONG':
      return `Um dos campos excedeu o tamanho permitido: ${err.sqlMessage || ''}`;
    case 'ER_BAD_NULL_ERROR':
      return `Um campo obrigatório ficou em branco: ${err.sqlMessage || ''}`;
    default:
      return err?.sqlMessage || err?.message || 'Erro inesperado ao acessar o banco de dados.';
  }
}

const ehAdmin = (res: Response) => res.locals.usuario?.tipo === 'admin';

/**
 * Rotas dos cadastros. Os recursos `publico` (só leitura) servem também aos clientes, sempre com o escopoSql
 * do usuário logado; o resto é só de administradores. As demais rotas daqui (mapa, conversas, sistemas do usuário)
 * são barradas para não administradores em server/app.ts.
 */
export function createCrudRouter() {
  const router = Router();

  /** Recurso pedido na rota; quem não é administrador só lê os públicos */
  function resolveResource(req: Request, res: Response, escrita = false): ResourceDef {
    const resource = getResource(req.params.resource);
    if (!resource) throw new Error(`Recurso "${req.params.resource}" não existe.`);
    if (!ehAdmin(res) && (escrita || !resource.publico)) {
      throw Object.assign(new Error('Somente administradores mantêm os cadastros.'), { status: 403 });
    }
    return resource;
  }

  const pkCol = (resource: ResourceDef) => resource.pk[0];

  router.get('/meta/resources', (_req: Request, res: Response) => {
    // O SQL (consultas, colunas calculadas e escopo) não sai do servidor; cliente só recebe os recursos públicos
    res.json(
      RESOURCES.filter((r) => ehAdmin(res) || r.publico).map(({ escopoSql, ...r }) => ({
        ...r,
        table: r.table.startsWith('(') ? r.name : r.table,
        fields: r.fields.map(({ sql, ...f }) => f),
      })),
    );
  });

  /** Sistemas ligados a um registro (formulário): os liberados do usuário */
  router.get('/ligados/:resource/:id', async (req: Request, res: Response) => {
    try {
      const lig = LIGACOES[req.params.resource];
      if (!lig) return res.status(404).json({ error: 'Recurso sem sistemas ligados.' });
      const [rows] = await pool.query<any[]>(`SELECT ${lig.alvo} AS id FROM ${lig.tabela} WHERE ${lig.dono} = ?`, [req.params.id]);
      res.json(rows.map((r) => Number(r.id)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** Valores já usados num campo com `sugestoes` (lista do campo digitável, ex.: Grupo dos sistemas) */
  router.get('/sugestoes/:resource/:campo', async (req: Request, res: Response) => {
    try {
      const resource = resolveResource(req, res);
      const f = resource.fields.find((x) => x.name === req.params.campo && x.sugestoes && !x.sql);
      if (!f) return res.status(404).json({ error: 'Campo sem sugestões.' });
      const [rows] = await pool.query<any[]>(
        `SELECT DISTINCT TRIM(t.${f.name}) AS v FROM ${resource.table} t WHERE TRIM(t.${f.name}) <> '' ORDER BY v LIMIT 500`,
      );
      res.json(rows.map((r) => String(r.v)));
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  /** Opções dos combos de chave estrangeira (busca avançada): id + rótulo do recurso */
  router.get('/options/:resource', async (req: Request, res: Response) => {
    try {
      // Cliente: só os sistemas liberados para ele (filtro de Minhas conversas); o resto, só administrador
      const soDoCliente = !ehAdmin(res) && req.params.resource === 'sistemas';
      const resource = soDoCliente ? getResource('sistemas')! : resolveResource(req, res);
      const [rows] = await pool.query<any[]>(
        `SELECT t.${pkCol(resource)} AS value, t.${resource.labelField} AS label FROM ${resource.table} t
          ${soDoCliente ? 'JOIN usuario_sistemas us ON us.sistema_id = t.id AND us.usuario_id = ?' : ''}
          ORDER BY t.${resource.labelField} LIMIT 5000`,
        soDoCliente ? [res.locals.usuario.id] : [],
      );
      res.json(rows.map((r) => ({ value: String(r.value), label: String(r.label ?? r.value) })));
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  /**
   * Botão "Montar mapa" do cadastro de Sistemas: uma sessão do agente com instruções próprias percorre
   * o repositório e devolve o mapa em texto, em streaming. Usa o repositório do formulário (pode não estar salvo).
   */
  router.post('/mapa', async (req: Request, res: Response) => {
    try {
      const repo_url = normalizarRepo(req.body?.repo_url);
      const branch = String(req.body?.branch || '').trim() || null;
      // Token: o digitado no formulário; senão o gravado no sistema (se já salvo); senão o padrão
      let github_token = String(req.body?.github_token || '').trim() || null;
      if (!github_token && req.body?.id) {
        const [s] = await pool.query<any[]>('SELECT github_token FROM sistemas WHERE id = ?', [req.body.id]);
        github_token = s[0]?.github_token ? decifrar(s[0].github_token, 'Cadastros › Sistemas') : null;
      }
      const { id: sessao } = await abrirSessao({ nome: 'Mapa', repo_url, branch, github_token }, String(res.locals.usuario.nome), {
        system: PROMPT_MAPA,
        tetoCentavos: TETO_MAPA_CENTAVOS,
      });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.flushHeaders();
      try {
        await perguntar(
          sessao,
          'Monte o mapa deste sistema.',
          null,
          (t) => res.write(t),
          '\n\n(O mapa parou no teto de US$ 5,00: está incompleto. Revise antes de salvar.)',
        );
      } catch (err: any) {
        console.error('Falha ao montar o mapa:', err);
        res.write('\n\n(Não consegui terminar o mapa agora. Tente novamente em instantes.)');
      }
      res.end();
    } catch (err: any) {
      if (res.headersSent) return res.end();
      res.status(400).json({ error: err.message });
    }
  });

  /** Conversa inteira (todas as perguntas da mesma sessão do agente), em ordem */
  router.get('/conversas/:sessao', async (req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT p.id, p.criado_em, p.pergunta, p.resposta, p.com_imagem, u.nome AS cliente, s.nome AS sistema,
                (SELECT c.titulo FROM conversas c WHERE c.sessao_id = p.sessao_id) AS titulo,
                (SELECT c.resposta_faq FROM conversas c WHERE c.sessao_id = p.sessao_id) AS resposta_faq,
                COALESCE((SELECT c.visibilidade FROM conversas c WHERE c.sessao_id = p.sessao_id), 'privado') AS visibilidade
           FROM perguntas p
           LEFT JOIN usuarios u ON u.id = p.usuario_id
           LEFT JOIN sistemas s ON s.id = p.sistema_id
          WHERE p.sessao_id = ?
          ORDER BY p.id`,
        [req.params.sessao],
      );
      if (!rows.length) return res.status(404).json({ error: 'Conversa não encontrada.' });
      res.json(rows);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Listagem paginada com busca e ordenação
  // --------------------------------------------------------
  router.get('/crud/:resource', async (req: Request, res: Response) => {
    try {
      const resource = resolveResource(req, res);
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
      const offset = (page - 1) * limit;

      const sortField = columnNames(resource).includes(String(req.query.sort)) ? String(req.query.sort) : resource.defaultSort.field;
      const dirQ = String(req.query.dir).toLowerCase();
      const sortDir = dirQ === 'asc' ? 'ASC' : dirQ === 'desc' ? 'DESC' : resource.defaultSort.dir.toUpperCase();

      const where: string[] = ['1 = 1'];
      const params: any[] = [];

      // Escopo do recurso (ex.: só as conversas do usuário logado): vale em toda consulta, inclusive para o administrador
      if (resource.escopoSql) {
        where.push(`(${resource.escopoSql})`);
        for (const _ of resource.escopoSql.match(/\?/g) ?? []) params.push(res.locals.usuario.id);
      }

      // Busca textual nos campos marcados como searchable
      const search = String(req.query.search || '').trim();
      if (search) {
        const searchable = resource.fields.filter((f) => f.searchable);
        if (searchable.length) {
          where.push(`(${searchable.map((f) => `${colunaSql(resource, f.name)} LIKE ?`).join(' OR ')})`);
          searchable.forEach(() => params.push(`%${search}%`));
        }
      }

      // Busca avançada: ?filters=[{"field":"tipo","op":"eq","value":"admin"}]
      // Coluna e operador passam por whitelist; o valor vai sempre como parâmetro.
      const filtersRaw = String(req.query.filters || '').trim();
      if (filtersRaw) {
        let parsed: any[];
        try {
          parsed = JSON.parse(filtersRaw);
        } catch {
          throw new Error('Parâmetro "filters" não contém um JSON válido.');
        }
        if (!Array.isArray(parsed)) throw new Error('Parâmetro "filters" deve ser uma lista.');
        if (parsed.length > 20) throw new Error('São aceitos no máximo 20 filtros por consulta.');

        const colunas = columnNames(resource);
        for (const f of parsed) {
          const campo = String(f?.field || '');
          const op = String(f?.op || '');
          const valor = f?.value;
          if (!colunas.includes(campo)) throw new Error(`Filtro inválido: a coluna "${campo}" não existe em ${resource.label}.`);
          // Filtrar por hash de senha (LIKE '%a%', '%ab%'...) permitiria reconstruí-lo aos poucos
          if (resource.fields.find((d) => d.name === campo)?.type === 'password') {
            throw new Error(`Filtro inválido: a coluna "${campo}" não pode ser pesquisada.`);
          }
          if (valor === undefined || valor === null || valor === '') continue;

          const ops: Record<string, string> = { eq: '=', ne: '<>', gte: '>=', lte: '<=' };
          const ehDataHora = resource.fields.find((d) => d.name === campo)?.type === 'datetime';
          if (ehDataHora && op === 'lte' && /^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
            // "até 30/09" em data e hora vai até o fim do dia, não até 00:00
            where.push(`${colunaSql(resource, campo)} < DATE_ADD(?, INTERVAL 1 DAY)`);
            params.push(valor);
          } else if (op === 'contains') {
            where.push(`${colunaSql(resource, campo)} LIKE ?`);
            params.push(`%${valor}%`);
          } else if (ops[op]) {
            where.push(`${colunaSql(resource, campo)} ${ops[op]} ?`);
            params.push(valor);
          } else {
            throw new Error(`Filtro inválido: operador "${op}" não é suportado.`);
          }
        }
      }

      const whereSql = where.join(' AND ');
      const [countRows] = await pool.query<any[]>(`SELECT COUNT(*) AS total FROM ${resource.table} t WHERE ${whereSql}`, params);
      const total = Number(countRows[0]?.total || 0);

      // Só as colunas do metadado: a senha sai mascarada e o resto da tabela (ex.: config_listas) não sai
      // Nome do registro ligado (<campo>__rotulo), para a lista mostrar "Luis" e não o id
      const rotulos = resource.fields.flatMap((f) => {
        const ref = f.ref ? getResource(f.ref.resource) : null;
        return ref ? [`, (SELECT r.${f.ref!.labelField} FROM ${ref.table} r WHERE r.${pkCol(ref)} = t.${f.name} LIMIT 1) AS ${f.name}__rotulo`] : [];
      });
      const [rows] = await pool.query<any[]>(
        `SELECT ${columnNames(resource).map((c) => `${colunaSql(resource, c)} AS ${c}`).join(', ')}${rotulos.join('')} FROM ${resource.table} t
          WHERE ${whereSql}
          ORDER BY ${colunaSql(resource, sortField)} ${sortDir}${
            // Empate (ex.: mesmo grupo): desempata pelo nome do registro, depois pela chave
            sortField !== resource.labelField ? `, ${colunaSql(resource, resource.labelField)} ${sortDir}` : ''
          }, t.${pkCol(resource)} ${sortDir}
          LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      const senhas = resource.fields.filter((f) => f.type === 'password').map((f) => f.name);
      for (const r of rows) for (const s of senhas) r[s] = r[s] ? '********' : '';

      res.json({ data: rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Criação
  // --------------------------------------------------------
  router.post('/crud/:resource', async (req: Request, res: Response) => {
    let resource: ResourceDef | null = null;
    try {
      resource = resolveResource(req, res, true);
      if (!resource.canCreate) return res.status(403).json({ error: `Não é permitido incluir registros em ${resource.label}.` });

      const payload = buildWritePayload(resource, req.body || {}, false);
      validateRequired(resource, payload, false);
      antesDeGravar(resource, payload, false);
      const ligados = ligadosDoCorpo(resource, req.body);

      const cols = Object.keys(payload);
      const [result] = await pool.query<any>(
        `INSERT INTO ${resource.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => payload[c]),
      );
      const newId = String(result.insertId);
      if (ligados) await gravarLigados(resource, newId, ligados);
      res.json({ success: true, id: newId });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: friendlyDbError(err, resource?.labelSingular) });
    }
  });

  // --------------------------------------------------------
  // Alteração
  // --------------------------------------------------------
  router.put('/crud/:resource/:id', async (req: Request, res: Response) => {
    let resource: ResourceDef | null = null;
    try {
      resource = resolveResource(req, res, true);
      if (!resource.canUpdate) return res.status(403).json({ error: `Não é permitido alterar registros em ${resource.label}.` });

      const payload = buildWritePayload(resource, req.body || {}, true);
      validateRequired(resource, payload, true);
      antesDeGravar(resource, payload, true);
      // O administrador não pode se trancar fora: tirar o próprio perfil ou se desativar
      if (resource.name === 'usuarios' && String(req.params.id) === String(res.locals.usuario.id)) {
        if (('tipo' in payload && payload.tipo !== 'admin') || ('ativo' in payload && !payload.ativo)) {
          throw new Error('Você não pode tirar o seu próprio perfil de administrador nem se desativar.');
        }
      }
      const ligados = ligadosDoCorpo(resource, req.body);

      const cols = Object.keys(payload);
      if (!cols.length && !ligados) return res.status(400).json({ error: 'Nenhuma alteração foi informada.' });
      if (cols.length) {
        const [result] = await pool.query<any>(
          `UPDATE ${resource.table} t SET ${cols.map((c) => `t.${c} = ?`).join(', ')} WHERE t.${pkCol(resource)} = ?`,
          [...cols.map((c) => payload[c]), req.params.id],
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: `${resource.labelSingular} não encontrado.` });
      }
      if (ligados) await gravarLigados(resource, req.params.id, ligados);
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: friendlyDbError(err, resource?.labelSingular) });
    }
  });

  // --------------------------------------------------------
  // Exclusão
  // --------------------------------------------------------
  router.delete('/crud/:resource/:id', async (req: Request, res: Response) => {
    let resource: ResourceDef | null = null;
    try {
      resource = resolveResource(req, res, true);
      if (!resource.canDelete) return res.status(403).json({ error: `Não é permitido excluir registros em ${resource.label}.` });
      if (resource.name === 'usuarios' && String(req.params.id) === String(res.locals.usuario.id)) {
        throw new Error('Você não pode excluir o seu próprio usuário.');
      }

      const [result] = await pool.query<any>(`DELETE t FROM ${resource.table} t WHERE t.${pkCol(resource)} = ?`, [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: `${resource.labelSingular} não encontrado.` });
      // Vínculos do registro excluído (o histórico de perguntas fica)
      if (resource.name === 'usuarios') await pool.query('DELETE FROM usuario_sistemas WHERE usuario_id = ?', [req.params.id]);
      if (resource.name === 'sistemas') {
        await pool.query('DELETE FROM usuario_sistemas WHERE sistema_id = ?', [req.params.id]);
        await pool.query('DELETE FROM sistema_relacionados WHERE sistema_id = ? OR relacionado_id = ?', [req.params.id, req.params.id]);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: friendlyDbError(err, resource?.labelSingular) });
    }
  });

  return router;
}
