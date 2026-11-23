// Tempo real do chat — PRD seção 5.2 e 5.7.
import { Server } from 'socket.io';
import { verificarToken } from './auth.js';
import { config } from './config.js';
import { definirIo, salaUsuario, salaConversa } from './realtime.js';
import * as chat from './services/chat.js';
import { ErroApp } from './erros.js';

/** Responde ao "ack" do cliente com { ok, dados } ou { ok:false, erro }. */
function responder(ack, promessa) {
  promessa
    .then((dados) => typeof ack === 'function' && ack({ ok: true, dados }))
    .catch((e) => {
      if (!(e instanceof ErroApp)) console.error(e);
      if (typeof ack === 'function') ack({ ok: false, erro: e instanceof ErroApp ? e.message : 'Erro interno.', status: e.status ?? 500 });
    });
}

export function iniciarSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: config.webOrigin, credentials: true } });
  definirIo(io);

  // RA01: só conecta com JWT válido
  io.use((socket, next) => {
    try {
      const usuario = verificarToken(socket.handshake.auth?.token);
      if (!usuario.id) throw new Error();
      socket.data.usuario = usuario;
      next();
    } catch {
      next(new Error('nao_autorizado'));
    }
  });

  io.on('connection', (socket) => {
    const usuario = socket.data.usuario;
    socket.join(salaUsuario(usuario.id));

    // Abrir uma conversa: entra na sala dela (só se for participante — RA02)
    socket.on('conversa:entrar', ({ conversaId } = {}, ack) => {
      responder(ack, (async () => {
        const c = await chat.obterConversaComAcesso(conversaId, usuario.id);
        socket.join(salaConversa(c._id));
        return { conversaId: String(c._id) };
      })());
    });

    socket.on('conversa:sair', ({ conversaId } = {}) => {
      socket.leave(salaConversa(conversaId));
    });

    // Envio: { conversaId, texto, idCliente }
    socket.on('mensagem:enviar', (dados = {}, ack) => {
      responder(ack, chat.enviarMensagem(usuario, dados));
    });

    socket.on('conversa:lida', ({ conversaId } = {}, ack) => {
      responder(ack, chat.marcarComoLida(conversaId, usuario.id));
    });
  });

  return io;
}
