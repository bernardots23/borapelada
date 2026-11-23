import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatar } from '../api.js';
import { useApp } from '../contexto.jsx';

const MAX = 2000;
const novoIdCliente = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Ordem cronológica crescente com desempate pelo id (CA-C13 / CA-C14). */
const ordenar = (lista) => [...lista].sort((a, b) =>
  new Date(a.enviadaEm) - new Date(b.enviadaEm) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export default function Conversa() {
  const { id } = useParams();
  const { usuario, socket, conectado, conversaAberta, avisar } = useApp();
  const [conversa, setConversa] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [pendentes, setPendentes] = useState([]); // enviadas, aguardando confirmação do servidor
  const [cursor, setCursor] = useState(null);
  const [temMais, setTemMais] = useState(false);
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const caixa = useRef(null);
  const rolarPara = useRef('fim'); // 'fim' | { alturaAntes } | null

  const marcarLida = useCallback(() => {
    socket?.emit('conversa:lida', { conversaId: id });
  }, [socket, id]);

  // Carrega a conversa e as 30 mensagens mais recentes (CA-C07)
  useEffect(() => {
    let ativo = true;
    setConversa(null); setMensagens([]); setPendentes([]); setErro('');
    Promise.all([api(`/conversas/${id}`), api(`/conversas/${id}/mensagens`)])
      .then(([c, h]) => {
        if (!ativo) return;
        setConversa(c);
        rolarPara.current = 'fim';
        setMensagens(h.mensagens);
        setCursor(h.proximoCursor);
        setTemMais(h.temMais);
      })
      .catch((e) => ativo && setErro(e.message));
    conversaAberta.current = id;
    return () => { ativo = false; conversaAberta.current = null; };
  }, [id, conversaAberta]);

  // Entra na sala da conversa (e reentra ao reconectar)
  useEffect(() => {
    if (!socket || !conectado) return undefined;
    socket.emit('conversa:entrar', { conversaId: id }, (r) => {
      if (!r?.ok) setErro(r?.erro || 'Sem acesso a esta conversa.');
    });
    marcarLida(); // CA-C10
    return () => { socket.emit('conversa:sair', { conversaId: id }); };
  }, [socket, conectado, id, marcarLida]);

  // Mensagens em tempo real
  useEffect(() => {
    if (!socket) return undefined;
    const aoChegar = (m) => {
      if (m.conversaId !== id) return;
      const el = caixa.current;
      const pertoDoFim = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (pertoDoFim || m.remetenteId === usuario.id) rolarPara.current = 'fim';
      setMensagens((lista) => (lista.some((x) => x.id === m.id) ? lista : ordenar([...lista, m])));
      if (m.idCliente) setPendentes((p) => p.filter((x) => x.idCliente !== m.idCliente));
      marcarLida();
    };
    const aoApagar = (m) => {
      if (m.conversaId !== id) return;
      setMensagens((lista) => lista.map((x) => (x.id === m.id ? m : x)));
    };
    const aoRemover = ({ conversaId }) => { if (conversaId === id) setErro('Você não participa mais desta conversa.'); };
    socket.on('mensagem:nova', aoChegar);
    socket.on('mensagem:apagada', aoApagar);
    socket.on('conversa:removida', aoRemover);
    return () => {
      socket.off('mensagem:nova', aoChegar);
      socket.off('mensagem:apagada', aoApagar);
      socket.off('conversa:removida', aoRemover);
    };
  }, [socket, id, usuario.id, marcarLida]);

  // Controle de rolagem: fim da conversa ou manter posição ao carregar antigas
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el || !rolarPara.current) return;
    if (rolarPara.current === 'fim') el.scrollTop = el.scrollHeight;
    else el.scrollTop = el.scrollHeight - rolarPara.current.alturaAntes;
    rolarPara.current = null;
  }, [mensagens, pendentes]);

  // CA-C08 / CA-C09: carrega as anteriores ao chegar no topo
  async function carregarAntigas() {
    if (!temMais || carregandoAntigas) return;
    setCarregandoAntigas(true);
    try {
      const h = await api(`/conversas/${id}/mensagens?antesDe=${encodeURIComponent(cursor)}`);
      rolarPara.current = { alturaAntes: caixa.current.scrollHeight };
      setMensagens((lista) => {
        const ids = new Set(lista.map((m) => m.id));
        return ordenar([...h.mensagens.filter((m) => !ids.has(m.id)), ...lista]);
      });
      setCursor(h.proximoCursor);
      setTemMais(h.temMais);
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setCarregandoAntigas(false);
    }
  }

  function aoRolar(e) {
    if (e.currentTarget.scrollTop < 60) carregarAntigas();
  }

  function enviarPendente(p) {
    setPendentes((lista) => lista.map((x) => (x.idCliente === p.idCliente ? { ...x, status: 'enviando' } : x)));
    if (!socket?.connected) {
      setPendentes((lista) => lista.map((x) => (x.idCliente === p.idCliente ? { ...x, status: 'erro', erro: 'Sem conexão' } : x)));
      return;
    }
    socket.timeout(8000).emit('mensagem:enviar', { conversaId: id, texto: p.texto, idCliente: p.idCliente }, (falhaTempo, r) => {
      if (falhaTempo || !r?.ok) {
        const msgErro = falhaTempo ? 'Sem resposta do servidor' : r.erro;
        setPendentes((lista) => lista.map((x) => (x.idCliente === p.idCliente ? { ...x, status: 'erro', erro: msgErro } : x)));
        if (r && !r.ok) avisar(r.erro, 'erro');
        return;
      }
      const m = r.dados;
      setPendentes((lista) => lista.filter((x) => x.idCliente !== p.idCliente));
      setMensagens((lista) => (lista.some((x) => x.id === m.id) ? lista : ordenar([...lista, m])));
    });
  }

  function enviar(e) {
    e.preventDefault();
    if (!texto.trim() || texto.length > MAX) return; // CA-C02 / CA-C03 (validação também no servidor)
    const p = { idCliente: novoIdCliente(), texto: texto.trim(), status: 'enviando', enviadaEm: new Date().toISOString() };
    rolarPara.current = 'fim';
    setPendentes((lista) => [...lista, p]);
    setTexto('');
    enviarPendente(p);
  }

  async function apagar(m) {
    if (!window.confirm('Apagar esta mensagem para todos?')) return;
    try {
      const atualizada = await api(`/mensagens/${m.id}`, { metodo: 'DELETE' });
      setMensagens((lista) => lista.map((x) => (x.id === m.id ? atualizada : x)));
    } catch (err) { avisar(err.message, 'erro'); }
  }

  if (erro) {
    return (
      <div className="pagina">
        <p className="erro">{erro}</p>
        <Link to="/conversas">← Voltar para conversas</Link>
      </div>
    );
  }
  if (!conversa) return <div className="pagina"><p className="suave">Carregando…</p></div>;

  let diaAnterior = null;
  const itens = [];
  for (const m of mensagens) {
    const dia = new Date(m.enviadaEm).toDateString();
    if (dia !== diaAnterior) {
      itens.push(<div key={`d-${m.id}`} className="separador-dia"><span>{formatar.dia(m.enviadaEm)}</span></div>);
      diaAnterior = dia;
    }
    if (m.tipo === 'sistema') {
      itens.push(<div key={m.id} className="msg-sistema">{m.texto}</div>);
      continue;
    }
    const minha = m.remetenteId === usuario.id;
    itens.push(
      <div key={m.id} className={`msg ${minha ? 'minha' : ''} ${m.excluida ? 'apagada' : ''}`}>
        {!minha && conversa.tipo === 'grupo' && <span className="msg-autor">{m.remetenteNome}</span>}
        <span className="msg-texto">{m.excluida ? '🚫 Mensagem apagada' : m.texto}</span>
        <span className="msg-hora">
          {formatar.hora(m.enviadaEm)}
          {minha && !m.excluida && <button className="msg-apagar" onClick={() => apagar(m)} title="Apagar mensagem" aria-label="Apagar mensagem">🗑</button>}
        </span>
      </div>,
    );
  }

  return (
    <div className="chat">
      <header className="chat-topo">
        <Link to="/conversas" className="voltar">←</Link>
        <span className={`avatar ${conversa.tipo === 'grupo' ? 'avatar-grupo' : ''}`}>{conversa.tipo === 'grupo' ? '⚽' : formatar.iniciais(conversa.titulo)}</span>
        <div className="crescer">
          <strong>{conversa.titulo}</strong>
          <small className="suave">{conversa.tipo === 'grupo' ? `${conversa.totalParticipantes} participantes` : 'Conversa privada'}</small>
        </div>
        {conversa.grupoId && <Link to={`/grupos/${conversa.grupoId}`} className="botao-secundario">Ver grupo</Link>}
      </header>

      <div className="chat-mensagens" ref={caixa} onScroll={aoRolar}>
        {temMais ? (
          <button className="carregar-antigas" onClick={carregarAntigas} disabled={carregandoAntigas}>
            {carregandoAntigas ? 'Carregando…' : 'Carregar mensagens anteriores'}
          </button>
        ) : (
          <div className="inicio-conversa">Início da conversa</div>
        )}
        {itens}
        {pendentes.map((p) => (
          <div key={p.idCliente} className={`msg minha pendente ${p.status === 'erro' ? 'falhou' : ''}`}>
            <span className="msg-texto">{p.texto}</span>
            <span className="msg-hora">
              {p.status === 'erro' ? (
                <button className="reenviar" onClick={() => enviarPendente(p)}>⚠ {p.erro}. Tentar de novo</button>
              ) : '🕓 enviando…'}
            </span>
          </div>
        ))}
      </div>

      <form className="chat-envio" onSubmit={enviar}>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) enviar(e); }}
          placeholder={conectado ? 'Escreva uma mensagem…' : 'Reconectando…'}
          rows={1}
          aria-label="Mensagem"
        />
        <button className="botao" disabled={!texto.trim() || texto.length > MAX}>Enviar</button>
        {texto.length > MAX - 200 && (
          <small className={`contador ${texto.length > MAX ? 'erro' : 'suave'}`}>
            {texto.length > MAX ? `Mensagem muito longa (máx. ${MAX} caracteres)` : `${texto.length}/${MAX}`}
          </small>
        )}
      </form>
    </div>
  );
}
