// Regras do chat — PRD seção 5.
import { col, oid } from '../db.js';
import { regras } from '../config.js';
import { ErroApp } from '../erros.js';
import { emitirParaConversa, emitirParaUsuario, removerDaSalaConversa } from '../realtime.js';

const iguais = (a, b) => String(a) === String(b);

/* ---------------------------------------------------------------- formatação */

function formatarMensagem(m) {
  return {
    id: String(m._id),
    conversaId: String(m.conversaId),
    tipo: m.tipo,
    remetenteId: m.remetenteId ? String(m.remetenteId) : null,
    remetenteNome: m.remetenteNome ?? null,
    texto: m.excluida ? '' : m.texto,
    excluida: !!m.excluida,
    evento: m.evento ?? null,
    idCliente: m.idCliente ?? null,
    enviadaEm: m.enviadaEm,
  };
}

/** Visão da conversa para um usuário específico (título e não lidas dele). */
export function formatarConversa(c, usuarioId) {
  const eu = c.participantes.find((p) => iguais(p.usuarioId, usuarioId));
  const outro = c.tipo === 'privada' ? c.participantes.find((p) => !iguais(p.usuarioId, usuarioId)) : null;
  return {
    id: String(c._id),
    tipo: c.tipo,
    grupoId: c.grupoId ? String(c.grupoId) : null,
    titulo: c.tipo === 'grupo' ? c.titulo : outro?.nome ?? 'Conversa',
    outroUsuarioId: outro ? String(outro.usuarioId) : null,
    totalParticipantes: c.participantes.length,
    naoLidas: eu?.naoLidas ?? 0,
    ultimaMensagem: c.ultimaMensagem
      ? { ...c.ultimaMensagem, remetenteId: c.ultimaMensagem.remetenteId ? String(c.ultimaMensagem.remetenteId) : null }
      : null,
    atualizadaEm: c.atualizadaEm,
  };
}

/* ------------------------------------------------------- conversas de grupo */

/** Criada automaticamente junto com o grupo (PRD 5.2). */
export async function criarConversaDoGrupo(grupo, organizador) {
  const agora = new Date();
  await col('conversas').insertOne({
    tipo: 'grupo',
    grupoId: grupo._id,
    titulo: grupo.nome,
    participantes: [{ usuarioId: organizador.id, nome: organizador.nome, papel: 'organizador', entrouEm: agora, naoLidas: 0 }],
    participantesIds: [organizador.id],
    ultimaMensagem: null,
    criadaEm: agora,
    atualizadaEm: agora,
  });
}

/** RA03: novo membro entra no chat do grupo e vê todo o histórico. */
export async function adicionarAoChatDoGrupo(grupoId, usuario) {
  const r = await col('conversas').findOneAndUpdate(
    { tipo: 'grupo', grupoId, participantesIds: { $ne: usuario.id } },
    {
      $push: { participantes: { usuarioId: usuario.id, nome: usuario.nome, papel: 'membro', entrouEm: new Date(), naoLidas: 0 } },
      $addToSet: { participantesIds: usuario.id },
    },
    { returnDocument: 'after' },
  );
  if (r) await enviarMensagemSistema(r._id, 'membro_entrou', `${usuario.nome} entrou no grupo.`);
}

/** RA04: quem sai ou é removido perde o acesso ao chat e ao histórico. */
export async function removerDoChatDoGrupo(grupoId, usuarioId, nome) {
  const conversa = await col('conversas').findOneAndUpdate(
    { tipo: 'grupo', grupoId },
    { $pull: { participantes: { usuarioId }, participantesIds: usuarioId } },
    { returnDocument: 'after' },
  );
  if (!conversa) return;
  removerDaSalaConversa(usuarioId, conversa._id);
  emitirParaUsuario(usuarioId, 'conversa:removida', { conversaId: String(conversa._id) });
  await enviarMensagemSistema(conversa._id, 'membro_saiu', `${nome} saiu do grupo.`);
}

export async function renomearChatDoGrupo(grupoId, titulo) {
  await col('conversas').updateOne({ tipo: 'grupo', grupoId }, { $set: { titulo } });
}

/* ------------------------------------------------------------ conversas privadas */

async function dividemGrupo(a, b) {
  const n = await col('grupos').countDocuments({
    $and: [{ 'membros.usuarioId': a }, { 'membros.usuarioId': b }],
  });
  return n > 0;
}

/** Reabre a conversa privada existente ou cria uma nova (CA-C12, RA05). */
export async function abrirConversaPrivada(eu, outroIdTexto) {
  const outroId = oid(outroIdTexto);
  if (!outroId) throw new ErroApp(400, 'Usuário inválido.');
  if (iguais(outroId, eu.id)) throw new ErroApp(400, 'Você não pode conversar consigo mesmo.');

  const chavePrivada = [String(eu.id), String(outroId)].sort().join('_');
  const existente = await col('conversas').findOne({ chavePrivada });
  if (existente) return formatarConversa(existente, eu.id);

  const outro = await col('usuarios').findOne({ _id: outroId });
  if (!outro) throw new ErroApp(404, 'Usuário não encontrado.');
  if (!(await dividemGrupo(eu.id, outroId))) {
    throw new ErroApp(403, 'Você só pode conversar com quem participa de um grupo com você.');
  }

  const agora = new Date();
  const doc = {
    tipo: 'privada',
    chavePrivada,
    participantes: [
      { usuarioId: eu.id, nome: eu.nome, naoLidas: 0 },
      { usuarioId: outroId, nome: outro.nome, naoLidas: 0 },
    ],
    participantesIds: [eu.id, outroId],
    ultimaMensagem: null,
    criadaEm: agora,
    atualizadaEm: agora,
  };
  try {
    const { insertedId } = await col('conversas').insertOne(doc);
    return formatarConversa({ ...doc, _id: insertedId }, eu.id);
  } catch (e) {
    // Os dois abriram ao mesmo tempo: o índice único garante uma conversa só.
    if (e.code === 11000) return formatarConversa(await col('conversas').findOne({ chavePrivada }), eu.id);
    throw e;
  }
}

/* ------------------------------------------------------------------- consultas */

/** RA02: só participantes acessam. */
export async function obterConversaComAcesso(conversaIdTexto, usuarioId) {
  const conversaId = oid(conversaIdTexto);
  if (!conversaId) throw new ErroApp(400, 'Conversa inválida.');
  const conversa = await col('conversas').findOne({ _id: conversaId });
  if (!conversa) throw new ErroApp(404, 'Conversa não encontrada.');
  if (!conversa.participantesIds.some((id) => iguais(id, usuarioId))) {
    throw new ErroApp(403, 'Você não tem acesso a esta conversa.');
  }
  return conversa;
}

/** CA-C15: ordenadas pela mensagem mais recente. */
export async function listarConversas(usuarioId) {
  const lista = await col('conversas')
    .find({ participantesIds: usuarioId })
    .sort({ atualizadaEm: -1 })
    .toArray();
  return lista.map((c) => formatarConversa(c, usuarioId));
}

/* Cursor = "<data ISO>_<id>" da mensagem mais antiga já carregada (desempate pelo _id — CA-C14). */
function lerCursor(cursor) {
  if (!cursor) return null;
  const [iso, id] = String(cursor).split('_');
  const data = new Date(iso);
  const _id = oid(id);
  if (Number.isNaN(data.getTime()) || !_id) throw new ErroApp(400, 'Cursor inválido.');
  return { data, _id };
}
const criarCursor = (m) => `${new Date(m.enviadaEm).toISOString()}_${m._id}`;

/**
 * Histórico paginado (CA-C07 a CA-C09, CA-C13, CA-C14).
 * Busca em ordem decrescente usando o índice e devolve em ordem crescente.
 */
export async function listarMensagens(conversaIdTexto, usuarioId, antesDe) {
  const conversa = await obterConversaComAcesso(conversaIdTexto, usuarioId);
  const cursor = lerCursor(antesDe);
  const filtro = { conversaId: conversa._id };
  if (cursor) {
    filtro.$or = [
      { enviadaEm: { $lt: cursor.data } },
      { enviadaEm: cursor.data, _id: { $lt: cursor._id } },
    ];
  }
  const limite = regras.mensagensPorPagina;
  const docs = await col('mensagens')
    .find(filtro)
    .sort({ enviadaEm: -1, _id: -1 })
    .limit(limite + 1)
    .toArray();

  const temMais = docs.length > limite;
  const pagina = docs.slice(0, limite).reverse(); // mais antiga em cima
  return {
    mensagens: pagina.map(formatarMensagem),
    temMais,
    proximoCursor: temMais && pagina.length ? criarCursor(pagina[0]) : null,
  };
}

/* ------------------------------------------------------------------------ envio */

const enviosRecentes = new Map(); // usuarioId -> [timestamps]

function verificarLimite(usuarioId) {
  const agora = Date.now();
  const chave = String(usuarioId);
  const lista = (enviosRecentes.get(chave) || []).filter((t) => agora - t < 60_000);
  if (lista.length >= regras.limiteMensagensPorMinuto) {
    throw new ErroApp(429, 'Você enviou muitas mensagens. Espere um pouco.');
  }
  lista.push(agora);
  enviosRecentes.set(chave, lista);
}

export function validarTexto(texto) {
  if (typeof texto !== 'string' || texto.trim().length === 0) {
    throw new ErroApp(400, 'A mensagem não pode ser vazia.'); // CA-C02
  }
  if (texto.length > regras.mensagemMaxChars) {
    throw new ErroApp(400, `Mensagem muito longa (máx. ${regras.mensagemMaxChars} caracteres).`); // CA-C03
  }
  return texto.trim();
}

async function atualizarConversaAposMensagem(conversa, msg) {
  const atualizada = await col('conversas').findOneAndUpdate(
    { _id: conversa._id },
    {
      $set: {
        ultimaMensagem: { texto: msg.texto, remetenteId: msg.remetenteId ?? null, remetenteNome: msg.remetenteNome ?? null, enviadaEm: msg.enviadaEm },
        atualizadaEm: msg.enviadaEm,
      },
      $inc: { 'participantes.$[outro].naoLidas': 1 },
    },
    {
      arrayFilters: [{ 'outro.usuarioId': { $ne: msg.remetenteId ?? null } }],
      returnDocument: 'after',
    },
  );
  // Mensagem em tempo real para quem está com a conversa aberta…
  emitirParaConversa(conversa._id, 'mensagem:nova', formatarMensagem(msg));
  // …e lista de conversas atualizada para todos os participantes (CA-C06).
  for (const p of atualizada.participantes) {
    emitirParaUsuario(p.usuarioId, 'conversa:atualizada', formatarConversa(atualizada, p.usuarioId));
  }
}

/** Envio de mensagem de usuário (PRD 5.2, CA-C01 a CA-C06). */
export async function enviarMensagem(usuario, { conversaId, texto, idCliente }) {
  const conversa = await obterConversaComAcesso(conversaId, usuario.id); // CA-C04
  const limpo = validarTexto(texto);

  if (conversa.tipo === 'privada') {
    const outro = conversa.participantesIds.find((id) => !iguais(id, usuario.id));
    if (!(await dividemGrupo(usuario.id, outro))) {
      throw new ErroApp(403, 'Vocês não participam mais de um grupo em comum. Não é possível enviar mensagens.'); // RA05
    }
  }

  // CA-C05: reenvio com o mesmo idCliente devolve a mensagem já gravada.
  const idCli = typeof idCliente === 'string' && idCliente.length <= 64 ? idCliente : undefined;
  if (idCli) {
    const repetida = await col('mensagens').findOne({ conversaId: conversa._id, idCliente: idCli });
    if (repetida) return formatarMensagem(repetida);
  }

  verificarLimite(usuario.id); // RA09

  const msg = {
    conversaId: conversa._id,
    tipo: 'usuario',
    remetenteId: usuario.id,
    remetenteNome: usuario.nome,
    texto: limpo,
    enviadaEm: new Date(), // RA08: data do servidor
    excluida: false,
  };
  if (idCli) msg.idCliente = idCli;

  try {
    const { insertedId } = await col('mensagens').insertOne(msg);
    msg._id = insertedId;
  } catch (e) {
    if (e.code === 11000 && idCli) {
      return formatarMensagem(await col('mensagens').findOne({ conversaId: conversa._id, idCliente: idCli }));
    }
    throw e;
  }

  await atualizarConversaAposMensagem(conversa, msg);
  return formatarMensagem(msg);
}

/** Mensagens automáticas: jogo marcado, membro entrou etc. */
export async function enviarMensagemSistema(conversaId, evento, texto, dados = {}) {
  const conversa = await col('conversas').findOne({ _id: conversaId });
  if (!conversa) return;
  const msg = { conversaId, tipo: 'sistema', evento, texto, dados, enviadaEm: new Date() };
  const { insertedId } = await col('mensagens').insertOne(msg);
  msg._id = insertedId;
  await atualizarConversaAposMensagem(conversa, msg);
}

export async function enviarMensagemSistemaNoGrupo(grupoId, evento, texto, dados) {
  const conversa = await col('conversas').findOne({ tipo: 'grupo', grupoId });
  if (conversa) await enviarMensagemSistema(conversa._id, evento, texto, dados);
}

/* -------------------------------------------------------------- lida / apagar */

/** CA-C10: zera o contador de não lidas do usuário. */
export async function marcarComoLida(conversaIdTexto, usuarioId) {
  const conversa = await obterConversaComAcesso(conversaIdTexto, usuarioId);
  const atualizada = await col('conversas').findOneAndUpdate(
    { _id: conversa._id, 'participantes.usuarioId': usuarioId },
    { $set: { 'participantes.$.naoLidas': 0 } },
    { returnDocument: 'after' },
  );
  const visao = formatarConversa(atualizada, usuarioId);
  emitirParaUsuario(usuarioId, 'conversa:atualizada', visao);
  return visao;
}

/** RA06: o autor apaga a própria mensagem; o organizador modera o chat do grupo. */
export async function apagarMensagem(mensagemIdTexto, usuarioId) {
  const mensagemId = oid(mensagemIdTexto);
  if (!mensagemId) throw new ErroApp(400, 'Mensagem inválida.');
  const msg = await col('mensagens').findOne({ _id: mensagemId });
  if (!msg || msg.tipo !== 'usuario') throw new ErroApp(404, 'Mensagem não encontrada.');
  const conversa = await obterConversaComAcesso(msg.conversaId, usuarioId);

  let pode = iguais(msg.remetenteId, usuarioId);
  if (!pode && conversa.tipo === 'grupo') {
    const grupo = await col('grupos').findOne({ _id: conversa.grupoId });
    pode = grupo && iguais(grupo.organizadorId, usuarioId);
  }
  if (!pode) throw new ErroApp(403, 'Você não pode apagar esta mensagem.');

  await col('mensagens').updateOne({ _id: mensagemId }, { $set: { excluida: true, texto: '' } });
  const atualizada = formatarMensagem({ ...msg, excluida: true, texto: '' });
  emitirParaConversa(conversa._id, 'mensagem:apagada', atualizada);
  return atualizada;
}
