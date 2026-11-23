import http from 'node:http';
import { config } from './config.js';
import { conectar } from './db.js';
import { criarApp } from './app.js';
import { iniciarSocket } from './socket.js';

async function iniciar() {
  await conectar();
  const servidor = http.createServer(criarApp());
  iniciarSocket(servidor);
  servidor.listen(config.port, () => {
    console.log(`[api] BoraPelada rodando em http://localhost:${config.port}`);
  });
}

iniciar().catch((e) => {
  console.error('[api] Falha ao iniciar:', e.message);
  console.error('      Verifique se o MongoDB está rodando e se MONGO_URL no .env está correto.');
  process.exit(1);
});
