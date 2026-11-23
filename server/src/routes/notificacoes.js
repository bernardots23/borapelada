import { Router } from 'express';
import { col } from '../db.js';
import { exigirLogin } from '../auth.js';
import { rota } from '../erros.js';
import { formatar } from '../services/notificacoes.js';

const r = Router();
r.use(exigirLogin);

r.get('/', rota(async (req, res) => {
  const lista = await col('notificacoes').find({ usuarioId: req.usuario.id }).sort({ criadaEm: -1 }).limit(30).toArray();
  res.json(lista.map(formatar));
}));

r.post('/lidas', rota(async (req, res) => {
  await col('notificacoes').updateMany({ usuarioId: req.usuario.id, lida: false }, { $set: { lida: true } });
  res.json({ ok: true });
}));

export default r;
