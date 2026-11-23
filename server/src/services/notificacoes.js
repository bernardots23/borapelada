import { col } from '../db.js';
import { emitirParaUsuario } from '../realtime.js';

/** Cria uma notificação no app e envia em tempo real (RF17). */
export async function notificar(usuarioId, texto, link = null) {
  const doc = { usuarioId, texto, link, lida: false, criadaEm: new Date() };
  const { insertedId } = await col('notificacoes').insertOne(doc);
  emitirParaUsuario(usuarioId, 'notificacao:nova', formatar({ ...doc, _id: insertedId }));
}

export function formatar(n) {
  return { id: String(n._id), texto: n.texto, link: n.link, lida: n.lida, criadaEm: n.criadaEm };
}
