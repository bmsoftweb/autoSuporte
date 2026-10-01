import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.js';

/** Entrada local (npm run dev / start). Na Vercel quem serve as rotas é api/index.ts */
const PORT = Number(process.env.PORT) || 3000;

// Sem await no topo: o build empacota em CommonJS
async function iniciar() {
  const app = createApp();
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`autoSuporte em http://localhost:${PORT}`));
}

iniciar().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
