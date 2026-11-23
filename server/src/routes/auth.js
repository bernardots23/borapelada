import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { col } from '../db.js';
import { gerarToken, exigirLogin } from '../auth.js';
import { ErroApp, rota } from '../erros.js';

const r = Router();
const POSICOES = ['goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante'];

const publico = (u) => ({ id: String(u._id), nome: u.nome, email: u.email, posicao: u.posicao });

// RF01 — cadastro
r.post('/cadastro', rota(async (req, res) => {
  const { nome, email, senha, posicao } = req.body || {};
  if (!nome || nome.trim().length < 2) throw new ErroApp(400, 'Informe seu nome.');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new ErroApp(400, 'Informe um e-mail válido.');
  if (!senha || senha.length < 6) throw new ErroApp(400, 'A senha precisa ter pelo menos 6 caracteres.');
  if (posicao && !POSICOES.includes(posicao)) throw new ErroApp(400, 'Posição inválida.');

  const usuario = {
    nome: nome.trim(),
    email: email.trim().toLowerCase(),
    senhaHash: await bcrypt.hash(senha, 10), // RNF03
    posicao: posicao || 'meia',
    criadoEm: new Date(),
  };
  try {
    const { insertedId } = await col('usuarios').insertOne(usuario);
    usuario._id = insertedId;
  } catch (e) {
    if (e.code === 11000) throw new ErroApp(409, 'Este e-mail já está cadastrado.');
    throw e;
  }
  res.status(201).json({ token: gerarToken(usuario), usuario: publico(usuario) });
}));

// RF02 — login
r.post('/login', rota(async (req, res) => {
  const { email, senha } = req.body || {};
  const usuario = await col('usuarios').findOne({ email: String(email || '').trim().toLowerCase() });
  if (!usuario || !(await bcrypt.compare(String(senha || ''), usuario.senhaHash))) {
    throw new ErroApp(401, 'E-mail ou senha incorretos.');
  }
  res.json({ token: gerarToken(usuario), usuario: publico(usuario) });
}));

r.get('/eu', exigirLogin, rota(async (req, res) => {
  const usuario = await col('usuarios').findOne({ _id: req.usuario.id });
  if (!usuario) throw new ErroApp(401, 'Usuário não encontrado.');
  res.json(publico(usuario));
}));

// RNF05 (LGPD) — exclusão de conta
r.delete('/eu', exigirLogin, rota(async (req, res) => {
  const id = req.usuario.id;
  const organiza = await col('grupos').countDocuments({ organizadorId: id });
  if (organiza > 0) throw new ErroApp(400, 'Transfira ou exclua os grupos que você organiza antes de excluir a conta.');

  await col('mensagens').updateMany({ remetenteId: id }, { $set: { remetenteNome: 'Usuário removido' } });
  await col('grupos').updateMany({}, { $pull: { membros: { usuarioId: id } } });
  await col('jogos').updateMany({}, { $pull: { confirmados: { usuarioId: id }, espera: { usuarioId: id } } });
  await col('conversas').updateMany(
    { participantesIds: id },
    { $set: { 'participantes.$[eu].nome': 'Usuário removido' } },
    { arrayFilters: [{ 'eu.usuarioId': id }] },
  );
  await col('conversas').updateMany({ tipo: 'grupo' }, { $pull: { participantes: { usuarioId: id }, participantesIds: id } });
  await col('notificacoes').deleteMany({ usuarioId: id });
  await col('usuarios').deleteOne({ _id: id });
  res.status(204).end();
}));

export default r;
