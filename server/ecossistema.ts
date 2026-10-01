import { Request, Response, Router } from 'express';
import { gravarConfig, lerConfig } from './config.js';
import { pool } from './db.js';

/**
 * Quadro do Ecossistema (só administrador): todos os sistemas da empresa e as ligações entre eles.
 * A ligação é mútua: grava A -> B e B -> A em sistema_relacionados (a mesma tabela do cadastro), e nas
 * conversas de cada um o repositório do outro abre junto. O quadro mostra uma linha por par. As posições no quadro ficam em config ecossistema.quadro.
 */
export function createEcossistemaRouter(): Router {
  const router = Router();

  router.get('/ecossistema', async (_req: Request, res: Response) => {
    try {
      const [sistemas] = await pool.query<any[]>('SELECT id, nome, repo_url, (mapa IS NOT NULL AND mapa <> "") AS tem_mapa FROM sistemas ORDER BY nome');
      const [ligacoes] = await pool.query<any[]>('SELECT sistema_id AS de, relacionado_id AS para FROM sistema_relacionados');
      const quadro = await lerConfig('ecossistema', 'quadro');
      res.json({
        sistemas: sistemas.map((s) => ({ id: Number(s.id), nome: s.nome, repo: String(s.repo_url).replace('https://github.com/', ''), tem_mapa: Boolean(Number(s.tem_mapa)) })),
        // Pontos de contato usados no quadro (s = saída, t = entrada), guardados junto com as posições
        // Um par só (A-B e B-A viram uma linha), no sentido em que foi desenhado
        ligacoes: ligacoes.flatMap((l) => {
          const [de, para] = [Number(l.de), Number(l.para)];
          const desenho = quadro?.pontos?.[`${de}>${para}`];
          const inverso = ligacoes.some((x) => Number(x.de) === para && Number(x.para) === de);
          if (!desenho && inverso && (quadro?.pontos?.[`${para}>${de}`] || de > para)) return [];
          const [s, t] = desenho ?? [];
          return [{ de, para, s, t }];
        }),
        posicoes: quadro?.posicoes ?? {},
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** Grava o quadro inteiro: posições e ligações (as ligações substituem todos os sistemas relacionados) */
  router.put('/ecossistema', async (req: Request, res: Response) => {
    const posicoes: Record<string, { x: number; y: number }> = {};
    for (const [id, p] of Object.entries<any>(req.body?.posicoes ?? {})) {
      if (/^\d+$/.test(id) && Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))) posicoes[id] = { x: Math.round(p.x), y: Math.round(p.y) };
    }
    const ligacoes = (Array.isArray(req.body?.ligacoes) ? req.body.ligacoes : [])
      .map((l: any) => [Number(l?.de), Number(l?.para), String(l?.s ?? '').slice(0, 4), String(l?.t ?? '').slice(0, 4)])
      .filter(([de, para]: any[]) => Number.isInteger(de) && Number.isInteger(para) && de > 0 && para > 0 && de !== para);
    const pontos = Object.fromEntries(ligacoes.map(([de, para, s, t]: any[]) => [`${de}>${para}`, [s, t]]));

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM sistema_relacionados');
      for (const [de, para] of ligacoes) {
        // Nos dois sentidos; só sistemas que existem; ligação repetida é ignorada
        for (const [a, b] of [[de, para], [para, de]]) {
          await conn.query(
            'INSERT IGNORE INTO sistema_relacionados (sistema_id, relacionado_id) SELECT a.id, b.id FROM sistemas a JOIN sistemas b ON b.id = ? WHERE a.id = ?',
            [b, a],
          );
        }
      }
      await gravarConfig('ecossistema', 'quadro', { posicoes, pontos }, conn as any);
      await conn.commit();
      res.json({ success: true });
    } catch (err: any) {
      await conn.rollback();
      res.status(err.status || 400).json({ error: err.message });
    } finally {
      conn.release();
    }
  });

  return router;
}
