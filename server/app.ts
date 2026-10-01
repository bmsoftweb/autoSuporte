import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import { abrirSessao, compactarConversa, Imagem, perguntar } from './agente.js';
import { createConfigRouter } from './config.js';
import { createCreditosRouter } from './creditos.js';
import { createCrudRouter } from './crud.js';
import { pool } from './db.js';
import { decifrar } from './segredo.js';

// ==========================================================
// Sessão: token "usuarioId.expiracao.assinatura" (HMAC-SHA256), igual ao crmWeb
// ==========================================================
const SEGREDO =
  process.env.SESSION_SECRET ||
  (console.warn('SESSION_SECRET não definido: as sessões expiram a cada reinício do servidor.'),
  crypto.randomBytes(32).toString('hex'));
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

const assinar = (dados: string) => crypto.createHmac('sha256', SEGREDO).update(dados).digest('base64url');

function emitirToken(usuarioId: number): string {
  const dados = `${usuarioId}.${Date.now() + VALIDADE_MS}`;
  return `${dados}.${assinar(dados)}`;
}

/** Id do usuário do token, ou null se inválido/expirado */
function lerToken(token: string): number | null {
  const [id, exp, assinatura] = String(token || '').split('.');
  if (!id || !exp || !assinatura) return null;
  const esperada = assinar(`${id}.${exp}`);
  if (esperada.length !== assinatura.length || !crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(assinatura))) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(id);
}

const TIPOS_IMAGEM = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGEM_BASE64 = 5 * 1024 * 1024; // limite de imagem da API

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  app.post('/api/login', async (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim();
    const senha = String(req.body?.senha || '');
    if (!email || !senha) return res.status(400).json({ error: 'Informe e-mail e senha.' });
    try {
      const [rows] = await pool.query<any[]>('SELECT id, nome, email, tipo, senha_hash FROM usuarios WHERE email = ? AND ativo = 1 LIMIT 1', [email]);
      const u = rows[0];
      if (!u || !u.senha_hash || !bcrypt.compareSync(senha, u.senha_hash)) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      }
      res.json({ token: emitirToken(Number(u.id)), usuario: { nome: u.nome, email: u.email, tipo: u.tipo } });
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  // ==========================================================
  // Daqui para baixo, toda rota /api exige um token válido.
  // O usuário é relido a cada requisição: desativado perde o acesso na hora.
  // ==========================================================
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    const usuarioId = lerToken(String(req.header('authorization') || '').replace(/^Bearer\s+/i, ''));
    if (!usuarioId) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    try {
      const [rows] = await pool.query<any[]>('SELECT id, nome, tipo, senha_hash FROM usuarios WHERE id = ? AND ativo = 1', [usuarioId]);
      if (!rows.length) return res.status(401).json({ error: 'Seu acesso foi desativado.' });
      res.locals.usuario = rows[0];
      next();
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  /** Troca da própria senha (ícone ao lado do nome, no menu): confere a atual antes */
  app.post('/api/minha-senha', async (req: Request, res: Response) => {
    try {
      const u = res.locals.usuario;
      const { atual, nova } = req.body || {};
      if (!bcrypt.compareSync(String(atual ?? ''), u.senha_hash)) return res.status(400).json({ error: 'A senha atual não confere.' });
      if (typeof nova !== 'string' || nova.length < 4) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 4 caracteres.' });
      await pool.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [bcrypt.hashSync(nova, 10), u.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Preferências das listas (colunas, larguras, grade...) do usuário logado, em usuarios.config_listas */
  app.get('/api/config-listas', async (_req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<any[]>('SELECT config_listas FROM usuarios WHERE id = ?', [res.locals.usuario.id]);
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(rows[0]?.config_listas || '{}') || {};
      } catch {
        // conteúdo inválido no banco não impede a tela de abrir
      }
      res.json(config);
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  app.put('/api/config-listas', async (req: Request, res: Response) => {
    const corpo = req.body;
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return res.status(400).json({ error: 'Configuração inválida.' });
    const texto = JSON.stringify(corpo);
    if (texto.length > 60000) return res.status(413).json({ error: 'Configuração muito grande.' });
    try {
      const [r] = await pool.query<any>('UPDATE usuarios SET config_listas = ? WHERE id = ?', [texto, res.locals.usuario.id]);
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
      res.json({ success: true });
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  // Só administradores: sistemas do usuário, conversas, configurações, mapa e créditos.
  // A grade (/api/crud, /api/meta, /api/options) confere recurso a recurso em server/crud.ts
  app.use(['/api/usuarios', '/api/conversas', '/api/config', '/api/mapa', '/api/creditos'], (_req: Request, res: Response, next: NextFunction) => {
    if (res.locals.usuario.tipo !== 'admin') return res.status(403).json({ error: 'Somente administradores mantêm os cadastros.' });
    next();
  });
  app.use('/api', createCrudRouter());
  app.use('/api', createConfigRouter());
  app.use('/api', createCreditosRouter());

  /** Sistemas que o cliente contratou */
  app.get('/api/sistemas', async (_req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT s.id, s.nome FROM sistemas s
           JOIN usuario_sistemas us ON us.sistema_id = s.id
          WHERE us.usuario_id = ? ORDER BY s.nome`,
        [res.locals.usuario.id],
      );
      res.json(rows);
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  /** Mensagens de uma conversa do próprio cliente (para reabrir no chat) */
  app.get('/api/minhas-conversas/:sessao', async (req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<any[]>(
        'SELECT id, pergunta, resposta, com_imagem FROM perguntas WHERE sessao_id = ? AND usuario_id = ? ORDER BY id',
        [req.params.sessao, res.locals.usuario.id],
      );
      if (!rows.length) return res.status(404).json({ error: 'Conversa não encontrada.' });
      const [[c]] = await pool.query<any[]>('SELECT titulo, visibilidade, resposta_faq FROM conversas WHERE sessao_id = ?', [req.params.sessao]);
      res.json({ titulo: c?.titulo ?? null, visibilidade: c?.visibilidade ?? 'privado', resposta_faq: c?.resposta_faq ?? null, mensagens: rows });
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  /** Dono da conversa (usuario_id), se quem pede é ele ou um administrador; senão null */
  async function donoDaConversa(sessao: string, usuario: any): Promise<number | null> {
    const [d] = await pool.query<any[]>('SELECT usuario_id FROM perguntas WHERE sessao_id = ? LIMIT 1', [sessao]);
    if (!d.length || (usuario.tipo !== 'admin' && d[0].usuario_id !== usuario.id)) return null;
    return d[0].usuario_id;
  }

  /**
   * Nome, visibilidade e/ou resposta compactada (FAQ) de uma conversa: só os campos enviados mudam.
   * Nome em branco volta ao padrão (a primeira pergunta). Visibilidade: 'privado' (padrão) ou 'publico'.
   * Quem pode: o dono da conversa ou um administrador.
   */
  app.put('/api/minhas-conversas/:sessao', async (req: Request, res: Response) => {
    try {
      const sessao = String(req.params.sessao);
      const b = req.body || {};
      const titulo = String(b.titulo ?? '').trim().replace(/\s+/g, ' ') || null;
      const visibilidade = String(b.visibilidade ?? '');
      const resposta_faq = String(b.resposta_faq ?? '').trim() || null;
      if (titulo && titulo.length > 120) return res.status(400).json({ error: 'O nome pode ter até 120 caracteres.' });
      if ('visibilidade' in b && !['privado', 'publico'].includes(visibilidade)) return res.status(400).json({ error: 'Visibilidade inválida.' });
      if (resposta_faq && resposta_faq.length > 20000) return res.status(400).json({ error: 'A resposta pode ter até 20.000 caracteres.' });

      const dono = await donoDaConversa(sessao, res.locals.usuario);
      if (dono === null) return res.status(404).json({ error: 'Conversa não encontrada.' });
      const muda = ['titulo', 'visibilidade', 'resposta_faq'].filter((k) => k in b);
      await pool.query(
        `INSERT INTO conversas (sessao_id, usuario_id, titulo, visibilidade, resposta_faq) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE ${muda.map((k) => `${k} = VALUES(${k})`).join(', ') || 'sessao_id = sessao_id'}`,
        [sessao, dono, titulo, 'visibilidade' in b ? visibilidade : 'privado', resposta_faq],
      );
      const [[c]] = await pool.query<any[]>('SELECT titulo, visibilidade, resposta_faq FROM conversas WHERE sessao_id = ?', [sessao]);
      res.json({ success: true, ...c });
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  /** Botão "Compactar": a IA resume a conversa em uma pergunta e uma resposta (FAQ). Só devolve; quem grava é o PUT acima */
  app.post('/api/minhas-conversas/:sessao/compactar', async (req: Request, res: Response) => {
    try {
      const sessao = String(req.params.sessao);
      if ((await donoDaConversa(sessao, res.locals.usuario)) === null) return res.status(404).json({ error: 'Conversa não encontrada.' });
      const [rows] = await pool.query<any[]>(
        `SELECT p.pergunta, p.resposta, s.nome AS sistema FROM perguntas p LEFT JOIN sistemas s ON s.id = p.sistema_id
          WHERE p.sessao_id = ? ORDER BY p.id`,
        [sessao],
      );
      res.json(await compactarConversa(rows[0].sistema ?? '', rows));
    } catch (err: any) {
      console.error('Falha ao compactar a conversa:', err);
      res.status(503).json({ error: 'Não foi possível compactar a conversa agora. Tente novamente.' });
    }
  });

  /**
   * Pergunta ao agente. A resposta volta em texto puro, em streaming.
   * Sem sessaoId abre uma conversa nova; o id dela volta no cabeçalho X-Sessao.
   */
  app.post('/api/perguntar', async (req: Request, res: Response) => {
    const usuario = res.locals.usuario;
    const sistemaId = Number(req.body?.sistemaId);
    const pergunta = String(req.body?.pergunta || '').trim().slice(0, 4000);
    let sessaoId = req.body?.sessaoId ? String(req.body.sessaoId) : '';
    const img = req.body?.imagem;
    const imagem: Imagem | null = img ? { tipo: img.tipo, base64: String(img.base64 || '') } : null;

    if (!pergunta && !imagem) return res.status(400).json({ error: 'Digite a dúvida ou cole um print da tela.' });
    if (imagem && (!TIPOS_IMAGEM.includes(imagem.tipo) || !imagem.base64 || imagem.base64.length > MAX_IMAGEM_BASE64)) {
      return res.status(400).json({ error: 'Imagem inválida ou grande demais.' });
    }

    try {
      // O sistema precisa ser do cliente; a conversa, dele e desse sistema
      const [sis] = await pool.query<any[]>(
        `SELECT s.id, s.nome, s.repo_url, s.branch, s.mapa, s.github_token FROM sistemas s
           JOIN usuario_sistemas us ON us.sistema_id = s.id
          WHERE s.id = ? AND us.usuario_id = ?`,
        [sistemaId, usuario.id],
      );
      if (!sis.length) return res.status(403).json({ error: 'Sistema não disponível para o seu acesso.' });
      if (sessaoId) {
        const [conv] = await pool.query<any[]>('SELECT 1 FROM perguntas WHERE sessao_id = ? AND usuario_id = ? AND sistema_id = ? LIMIT 1', [
          sessaoId,
          usuario.id,
          sistemaId,
        ]);
        if (!conv.length) return res.status(403).json({ error: 'Conversa não encontrada. Comece uma nova.' });
      }

      const nova = !sessaoId;
      if (nova) {
        const s = sis[0];
        const github_token = s.github_token ? decifrar(s.github_token, 'Cadastros › Sistemas') : null;
        sessaoId = await abrirSessao({ ...s, github_token }, usuario.nome);
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('X-Sessao', sessaoId);
      res.flushHeaders();

      // Conversa nova: o nome do sistema e, se cadastrado, o mapa (vai uma vez; fica no contexto da sessão)
      const mapa = String(sis[0].mapa || '').trim();
      const abertura = nova
        ? `Sistema: ${sis[0].nome}\n\n` +
          (mapa ? `Mapa do sistema (onde fica cada tela e regra; use para ir direto aos arquivos certos e abrir o mínimo possível):\n${mapa}\n\n` : '') +
          'Pergunta do cliente:\n'
        : '';
      const texto = abertura + (pergunta || 'Veja o print da tela e me ajude.');
      let resposta = '';
      try {
        resposta = await perguntar(sessaoId, texto, imagem, (t) => res.write(t));
      } catch (err: any) {
        console.error('Falha ao consultar o agente:', err);
        res.write('\n\n(Não consegui concluir a análise agora. Tente novamente em instantes.)');
      }
      res.end();

      await pool
        .query('INSERT INTO perguntas (usuario_id, sistema_id, sessao_id, pergunta, com_imagem, resposta) VALUES (?, ?, ?, ?, ?, ?)', [
          usuario.id,
          sistemaId,
          sessaoId,
          pergunta,
          imagem ? 1 : 0,
          resposta,
        ])
        .catch((err) => console.error('Falha ao gravar a pergunta:', err.message));
    } catch (err: any) {
      if (res.headersSent) return res.end();
      res.status(503).json({ error: err.message });
    }
  });

  return app;
}
