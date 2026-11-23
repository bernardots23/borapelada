import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useApp } from './contexto.jsx';
import { api, formatar } from './api.js';
import Entrar from './paginas/Entrar.jsx';
import Inicio from './paginas/Inicio.jsx';
import Grupo from './paginas/Grupo.jsx';
import Jogo from './paginas/Jogo.jsx';
import Conversas from './paginas/Conversas.jsx';
import Conversa from './paginas/Conversa.jsx';
import Convite from './paginas/Convite.jsx';

function Avisos() {
  const { avisos } = useApp();
  const navegar = useNavigate();
  return (
    <div className="avisos" aria-live="polite">
      {avisos.map((a) => (
        <button key={a.id} className={`aviso aviso-${a.tipo}`} onClick={() => a.link && navegar(a.link)}>
          {a.texto}
        </button>
      ))}
    </div>
  );
}

function Sino() {
  const { notificacoes, setNotificacoes } = useApp();
  const [aberto, setAberto] = useState(false);
  const navegar = useNavigate();
  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  const abrir = () => {
    setAberto((v) => !v);
    if (!aberto && naoLidas) {
      api('/notificacoes/lidas', { metodo: 'POST' }).catch(() => {});
      setNotificacoes((l) => l.map((n) => ({ ...n, lida: true })));
    }
  };

  return (
    <div className="sino">
      <button className="botao-icone" onClick={abrir} aria-label="Notificações" title="Notificações">
        🔔{naoLidas > 0 && <span className="bolinha">{naoLidas}</span>}
      </button>
      {aberto && (
        <div className="painel-notificacoes" onMouseLeave={() => setAberto(false)}>
          <strong>Notificações</strong>
          {notificacoes.length === 0 && <p className="suave">Nada por aqui ainda.</p>}
          {notificacoes.map((n) => (
            <button key={n.id} className="notificacao" onClick={() => { setAberto(false); if (n.link) navegar(n.link); }}>
              <span>{n.texto}</span>
              <small>{formatar.quando(n.criadaEm)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Layout({ children }) {
  const { usuario, sair, totalNaoLidas, conectado } = useApp();
  const local = useLocation();
  const emConversa = /^\/conversas\/.+/.test(local.pathname);
  return (
    <div className={`app ${emConversa ? 'app-conversa' : ''}`}>
      <header className="topo">
        <NavLink to="/" className="marca">⚽ <span className="marca-texto">BoraPelada</span></NavLink>
        <nav className="menu">
          <NavLink to="/" end>Início</NavLink>
          <NavLink to="/conversas">
            Conversas{totalNaoLidas > 0 && <span className="bolinha">{totalNaoLidas}</span>}
          </NavLink>
        </nav>
        <div className="topo-direita">
          <span className={`status ${conectado ? 'on' : 'off'}`} title={conectado ? 'Conectado em tempo real' : 'Reconectando…'} />
          <Sino />
          <span className="avatar" title={usuario.nome}>{formatar.iniciais(usuario.nome)}</span>
          <button className="botao-texto" onClick={sair}>Sair</button>
        </div>
      </header>
      <main className="conteudo">{children}</main>
      <Avisos />
    </div>
  );
}

export default function App() {
  const { usuario, carregando } = useApp();
  const local = useLocation();
  if (carregando) return <div className="carregando-tela">⚽</div>;
  if (!usuario) {
    return (
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="*" element={<Navigate to={`/entrar?voltar=${encodeURIComponent(local.pathname)}`} replace />} />
      </Routes>
    );
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/grupos/:id" element={<Grupo />} />
        <Route path="/jogos/:id" element={<Jogo />} />
        <Route path="/conversas" element={<Conversas />} />
        <Route path="/conversas/:id" element={<Conversa />} />
        <Route path="/convite/:token" element={<Convite />} />
        <Route path="/entrar" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
