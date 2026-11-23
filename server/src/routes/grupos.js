import { Router } from 'express';
import crypto from 'node:crypto';
import { col, oid } from '../db.js';
import { regras } from '../config.js';
import { exigirLogin } from '../auth.js';
import { ErroApp, rota } from '../erros.js';
import * as chat from '../services/chat.js';

const r = Router();
r.use(exigirLogin);

const iguais = (a, b) => String(a) === String(b);

export async function obterGrupoDoMembro(grupoIdTexto, usuarioId) {
  const grupoId = oid(grupoIdTexto);
  if (!grupoId) throw new ErroApp(400, 'Grupo inválido.');
  const grupo = await col('grupos').findOne({ _id: grupoId });
  if (!grupo) throw new ErroApp(404, 'Grupo não encontrado.');
  if (!grupo.membros.some((m) => iguais(m.usuarioId, usuarioId))) {
    throw new ErroApp(403, 'Você não participa deste grupo.');
  }
  return grupo;
}

export function exigirOrganizador(grupo, usuarioId) {
  if (!iguais(grupo.organizadorId, usuarioId)) throw new ErroApp(403, 'Apenas o organizador pode fazer isso.');
}

function formatarGrupo(g, usuarioId) {
  const souOrganizador = iguais(g.organizadorId, usuarioId);
  return {
    id: String(g._id),
    nome: g.nome,
    organizadorId: String(g.organizadorId),
    souOrganizador,
    membros: g.membros.map((m) => ({
      usuarioId: String(m.usuarioId),
      nome: m.nome,
      posicao: m.posicao,
      papel: m.papel,
      // O nível só é visível para o organizador (evita climão no grupo)
      nivel: souOrganizador ? m.nivel : undefined,
      entrouEm: m.entrouEm,
    })),
    convite: souOrganizador && g.conviteToken && g.conviteExpiraEm > new Date()
      ? { token: g.conviteToken, expiraEm: g.conviteExpiraEm }
      : null,
    criadoEm: g.criadoEm,
  };
}

// Meus grupos
r.get('/', rota(async (req, res) => {
  const grupos = await col('grupos').find({ 'membros.usuarioId': req.usuario.id }).sort({ criadoEm: -1 }).toArray();
  res.json(grupos.map((g) => formatarGrupo(g, req.usuario.id)));
}));

// RF03 — criar grupo (HU01)
r.post('/', rota(async (req, res) => {
  const nome = String(req.body?.nome || '').trim();
  if (nome.length < 3) throw new ErroApp(400, 'O nome precisa ter pelo menos 3 caracteres.'); // CA01.3
  if (nome.length > 50) throw new ErroApp(400, 'O nome pode ter no máximo 50 caracteres.');

  const usuario = await col('usuarios').findOne({ _id: req.usuario.id });
  const agora = new Date();
  const grupo = {
    nome,
    organizadorId: usuario._id,
    membros: [{ usuarioId: usuario._id, nome: usuario.nome, posicao: usuario.posicao, papel: 'organizador', nivel: 3, entrouEm: agora }],
    criadoEm: agora,
  };
  const { insertedId } = await col('grupos').insertOne(grupo);
  grupo._id = insertedId;
  await chat.criarConversaDoGrupo(grupo, { id: usuario._id, nome: usuario.nome });
  res.status(201).json(formatarGrupo(grupo, req.usuario.id));
}));

r.get('/:id', rota(async (req, res) => {
  const grupo = await obterGrupoDoMembro(req.params.id, req.usuario.id);
  const conversa = await col('conversas').findOne({ tipo: 'grupo', grupoId: grupo._id }, { projection: { _id: 1 } });
  res.json({ ...formatarGrupo(grupo, req.usuario.id), conversaId: conversa ? String(conversa._id) : null });
}));

// RF04 — gerar convite válido por 7 dias (CA01.2)
r.post('/:id/convite', rota(async (req, res) => {
  const grupo = await obterGrupoDoMembro(req.params.id, req.usuario.id);
  exigirOrganizador(grupo, req.usuario.id);
  const token = crypto.randomBytes(12).toString('base64url');
  const expiraEm = new Date(Date.now() + regras.conviteDiasValidade * 24 * 3600 * 1000);
  await col('grupos').updateOne({ _id: grupo._id }, { $set: { conviteToken: token, conviteExpiraEm: expiraEm } });
  res.json({ token, expiraEm });
}));

// RF15 — nível do jogador (1 a 5), definido pelo organizador
r.patch('/:id/membros/:usuarioId', rota(async (req, res) => {
  const grupo = await obterGrupoDoMembro(req.params.id, req.usuario.id);
  exigirOrganizador(grupo, req.usuario.id);
  const nivel = Number(req.body?.nivel);
  if (!Number.isInteger(nivel) || nivel < 1 || nivel > 5) throw new ErroApp(400, 'O nível deve ser de 1 a 5.');
  const alvo = oid(req.params.usuarioId);
  const r2 = await col('grupos').updateOne(
    { _id: grupo._id, 'membros.usuarioId': alvo },
    { $set: { 'membros.$.nivel': nivel } },
  );
  if (!r2.matchedCount) throw new ErroApp(404, 'Membro não encontrado.');
  res.json({ ok: true });
}));

// RF06 — organizador remove membro / membro sai do grupo
r.delete('/:id/membros/:usuarioId', rota(async (req, res) => {
  const grupo = await obterGrupoDoMembro(req.params.id, req.usuario.id);
  const alvo = oid(req.params.usuarioId);
  const membro = grupo.membros.find((m) => iguais(m.usuarioId, alvo));
  if (!membro) throw new ErroApp(404, 'Membro não encontrado.');
  const saindo = iguais(alvo, req.usuario.id);
  if (!saindo) exigirOrganizador(grupo, req.usuario.id);
  if (iguais(alvo, grupo.organizadorId)) throw new ErroApp(400, 'O organizador não pode sair do próprio grupo.');

  await col('grupos').updateOne({ _id: grupo._id }, { $pull: { membros: { usuarioId: alvo } } });
  await col('jogos').updateMany(
    { grupoId: grupo._id, dataHora: { $gte: new Date() } },
    { $pull: { confirmados: { usuarioId: alvo }, espera: { usuarioId: alvo } } },
  );
  await chat.removerDoChatDoGrupo(grupo._id, alvo, membro.nome); // RA04
  res.status(204).end();
}));

export default r;

/* ------------------------------------------------------------------ convites */

export const convites = Router();
convites.use(exigirLogin);

async function grupoPorConvite(token) {
  const grupo = await col('grupos').findOne({ conviteToken: String(token) });
  if (!grupo) throw new ErroApp(404, 'Convite inválido.');
  if (grupo.conviteExpiraEm < new Date()) throw new ErroApp(410, 'Convite expirado, peça um novo ao organizador.'); // CA02.2
  return grupo;
}

convites.get('/:token', rota(async (req, res) => {
  const grupo = await grupoPorConvite(req.params.token);
  res.json({
    grupoId: String(grupo._id),
    nome: grupo.nome,
    totalMembros: grupo.membros.length,
    jaSouMembro: grupo.membros.some((m) => iguais(m.usuarioId, req.usuario.id)),
  });
}));

// RF05 — entrar no grupo pelo convite (HU02)
convites.post('/:token/entrar', rota(async (req, res) => {
  const grupo = await grupoPorConvite(req.params.token);
  if (grupo.membros.some((m) => iguais(m.usuarioId, req.usuario.id))) {
    return res.json({ grupoId: String(grupo._id), jaEraMembro: true }); // CA02.3
  }
  const usuario = await col('usuarios').findOne({ _id: req.usuario.id });
  const r2 = await col('grupos').updateOne(
    { _id: grupo._id, 'membros.usuarioId': { $ne: usuario._id } },
    { $push: { membros: { usuarioId: usuario._id, nome: usuario.nome, posicao: usuario.posicao, papel: 'membro', nivel: 3, entrouEm: new Date() } } },
  );
  if (r2.modifiedCount) await chat.adicionarAoChatDoGrupo(grupo._id, { id: usuario._id, nome: usuario.nome });
  res.json({ grupoId: String(grupo._id), jaEraMembro: false });
}));
