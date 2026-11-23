import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, token } from './api.js';

const Contexto = createContext(null);
export const useApp = () => useContext(Contexto);

/** Guarda usuário logado, conexão Socket.IO, conversas (não lidas) e notificações. */
export function ProvedorApp({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [socket, setSocket] = useState(null);
  const [conectado, setConectado] = useState(false);
  const [conversas, setConversas] = useState([]);
  const [notificacoes, setNotificacoes] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const conversaAberta = useRef(null);

  const avisar = useCallback((texto, tipo = 'info', link = null) => {
    const id = Math.random().toString(36).slice(2);
    setAvisos((a) => [...a, { id, texto, tipo, link }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4500);
  }, []);

  const sair = useCallback(() => {
    token.limpar();
    setUsuario(null);
  }, []);

  const entrar = useCallback((dados) => {
    token.salvar(dados.token);
    setUsuario(dados.usuario);
  }, []);

  // Restaura a sessão ao abrir o app
  useEffect(() => {
    if (!token.ler()) { setCarregando(false); return; }
    api('/auth/eu').then(setUsuario).catch(() => token.limpar()).finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    const aoExpirar = () => setUsuario(null);
    window.addEventListener('sessao-expirada', aoExpirar);
    return () => window.removeEventListener('sessao-expirada', aoExpirar);
  }, []);

  // Conecta o Socket.IO quando há usuário logado
  useEffect(() => {
    if (!usuario) { setSocket(null); setConversas([]); setNotificacoes([]); return undefined; }

    api('/conversas').then(setConversas).catch(() => {});
    api('/notificacoes').then(setNotificacoes).catch(() => {});

    const s = io({ auth: { token: token.ler() }, transports: ['websocket', 'polling'] });
    s.on('connect', () => setConectado(true));
    s.on('disconnect', () => setConectado(false));
    s.on('connect_error', (e) => { if (e.message === 'nao_autorizado') sair(); });

    s.on('conversa:atualizada', (c) => {
      setConversas((lista) => [c, ...lista.filter((x) => x.id !== c.id)]
        .sort((a, b) => new Date(b.atualizadaEm) - new Date(a.atualizadaEm)));
      // Aviso de nova mensagem quando a conversa não está aberta (RF17)
      const m = c.ultimaMensagem;
      if (m && c.naoLidas > 0 && conversaAberta.current !== c.id && m.remetenteId && m.remetenteId !== usuario.id) {
        avisar(`💬 ${c.tipo === 'grupo' ? `${m.remetenteNome} em ${c.titulo}` : m.remetenteNome}: ${m.texto.slice(0, 60)}`, 'info', `/conversas/${c.id}`);
      }
    });
    s.on('conversa:removida', ({ conversaId }) => {
      setConversas((lista) => lista.filter((x) => x.id !== conversaId));
    });
    s.on('notificacao:nova', (n) => {
      setNotificacoes((lista) => [n, ...lista]);
      avisar(`🔔 ${n.texto}`, 'sucesso', n.link);
    });

    setSocket(s);
    return () => { s.disconnect(); };
  }, [usuario, avisar, sair]);

  const valor = useMemo(() => ({
    usuario, carregando, entrar, sair, socket, conectado,
    conversas, setConversas, conversaAberta,
    notificacoes, setNotificacoes,
    avisos, avisar,
    totalNaoLidas: conversas.reduce((s, c) => s + (c.naoLidas || 0), 0),
  }), [usuario, carregando, entrar, sair, socket, conectado, conversas, notificacoes, avisos, avisar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
