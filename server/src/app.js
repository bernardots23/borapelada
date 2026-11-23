import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { tratadorDeErros } from './erros.js';
import auth from './routes/auth.js';
import grupos, { convites } from './routes/grupos.js';
import jogos from './routes/jogos.js';
import conversas, { mensagens } from './routes/conversas.js';
import notificacoes from './routes/notificacoes.js';

export function criarApp() {
  const app = express();
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/saude', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', auth);
  app.use('/api/grupos', grupos);
  app.use('/api/convites', convites);
  app.use('/api/jogos', jogos);
  app.use('/api/conversas', conversas);
  app.use('/api/mensagens', mensagens);
  app.use('/api/notificacoes', notificacoes);
  app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

  // Em produção, o próprio servidor entrega o front-end já compilado
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(tratadorDeErros);
  return app;
}
