import { Router } from 'express';
import { exigirLogin } from '../auth.js';
import { rota } from '../erros.js';
import * as chat from '../services/chat.js';

const r = Router();
r.use(exigirLogin);

// RF14 — lista de conversas ordenada pela mais recente, com não lidas
r.get('/', rota(async (req, res) => {
  res.json(await chat.listarConversas(req.usuario.id));
}));

// RF12 — iniciar/reabrir conversa privada
r.post('/privada', rota(async (req, res) => {
  res.json(await chat.abrirConversaPrivada(req.usuario, req.body?.usuarioId));
}));

r.get('/:id', rota(async (req, res) => {
  const c = await chat.obterConversaComAcesso(req.params.id, req.usuario.id);
  res.json(chat.formatarConversa(c, req.usuario.id));
}));

// RF13 — histórico paginado por cursor: GET /api/conversas/:id/mensagens?antesDe=<cursor>
r.get('/:id/mensagens', rota(async (req, res) => {
  res.json(await chat.listarMensagens(req.params.id, req.usuario.id, req.query.antesDe));
}));

// Envio via REST (alternativa ao socket; mesma regra de negócio)
r.post('/:id/mensagens', rota(async (req, res) => {
  const msg = await chat.enviarMensagem(req.usuario, { conversaId: req.params.id, texto: req.body?.texto, idCliente: req.body?.idCliente });
  res.status(201).json(msg);
}));

r.post('/:id/lida', rota(async (req, res) => {
  res.json(await chat.marcarComoLida(req.params.id, req.usuario.id));
}));

export default r;

export const mensagens = Router();
mensagens.use(exigirLogin);

// RA06 — apagar mensagem
mensagens.delete('/:id', rota(async (req, res) => {
  res.json(await chat.apagarMensagem(req.params.id, req.usuario.id));
}));
