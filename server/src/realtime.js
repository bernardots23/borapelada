// Ponto único de acesso ao Socket.IO, para os serviços emitirem eventos.
let io = null;

export function definirIo(instancia) {
  io = instancia;
}

/** Sala pessoal de cada usuário: recebe notificações e atualizações da lista de conversas. */
export const salaUsuario = (id) => `usuario:${id}`;
/** Sala de cada conversa: recebe as mensagens novas em tempo real. */
export const salaConversa = (id) => `conversa:${id}`;

export function emitirParaUsuario(usuarioId, evento, dados) {
  io?.to(salaUsuario(usuarioId)).emit(evento, dados);
}

export function emitirParaConversa(conversaId, evento, dados) {
  io?.to(salaConversa(conversaId)).emit(evento, dados);
}

/** Tira um usuário da sala de uma conversa (ex.: removido do grupo — RA04). */
export function removerDaSalaConversa(usuarioId, conversaId) {
  io?.in(salaUsuario(usuarioId)).socketsLeave(salaConversa(conversaId));
}
