import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatar } from '../api.js';
import { useApp } from '../contexto.jsx';

function amanhaAs20() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T20:00`;
}

export default function Grupo() {
  const { id } = useParams();
  const { usuario, avisar } = useApp();
  const navegar = useNavigate();
  const [grupo, setGrupo] = useState(null);
  const [jogos, setJogos] = useState([]);
  const [erro, setErro] = useState('');
  const [novoJogo, setNovoJogo] = useState({ dataHora: amanhaAs20(), local: '', vagas: 14, valor: '' });
  const [mostrarForm, setMostrarForm] = useState(false);

  const carregar = () => {
    api(`/grupos/${id}`).then(setGrupo).catch((e) => setErro(e.message));
    api(`/jogos/grupo/${id}`).then(setJogos).catch(() => {});
  };
  useEffect(carregar, [id]);

  if (erro) return <div className="pagina"><p className="erro">{erro}</p><Link to="/">Voltar ao início</Link></div>;
  if (!grupo) return <div className="pagina"><p className="suave">Carregando…</p></div>;

  const linkConvite = grupo.convite ? `${window.location.origin}/convite/${grupo.convite.token}` : null;

  async function gerarConvite() {
    try {
      const c = await api(`/grupos/${id}/convite`, { metodo: 'POST' });
      setGrupo({ ...grupo, convite: c });
      avisar('Link de convite gerado (válido por 7 dias).', 'sucesso');
    } catch (e) { avisar(e.message, 'erro'); }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(linkConvite); avisar('Link copiado! Mande no WhatsApp da galera.', 'sucesso'); }
    catch { avisar('Não deu para copiar. Selecione o link e copie manualmente.', 'erro'); }
  }

  async function criarJogo(e) {
    e.preventDefault();
    try {
      await api(`/jogos/grupo/${id}`, {
        metodo: 'POST',
        corpo: { ...novoJogo, dataHora: new Date(novoJogo.dataHora).toISOString(), vagas: Number(novoJogo.vagas) },
      });
      avisar('Jogo criado e avisado no chat do grupo!', 'sucesso');
      setMostrarForm(false);
      setNovoJogo({ ...novoJogo, local: '' });
      carregar();
    } catch (err) { avisar(err.message, 'erro'); }
  }

  async function mudarNivel(membro, nivel) {
    try {
      await api(`/grupos/${id}/membros/${membro.usuarioId}`, { metodo: 'PATCH', corpo: { nivel: Number(nivel) } });
      setGrupo({ ...grupo, membros: grupo.membros.map((m) => (m.usuarioId === membro.usuarioId ? { ...m, nivel: Number(nivel) } : m)) });
    } catch (e) { avisar(e.message, 'erro'); }
  }

  async function remover(membro) {
    const saindo = membro.usuarioId === usuario.id;
    if (!window.confirm(saindo ? `Sair do grupo ${grupo.nome}?` : `Remover ${membro.nome} do grupo?`)) return;
    try {
      await api(`/grupos/${id}/membros/${membro.usuarioId}`, { metodo: 'DELETE' });
      if (saindo) { avisar('Você saiu do grupo.'); navegar('/'); return; }
      avisar(`${membro.nome} foi removido.`);
      carregar();
    } catch (e) { avisar(e.message, 'erro'); }
  }

  async function mensagemPrivada(membro) {
    try {
      const c = await api('/conversas/privada', { metodo: 'POST', corpo: { usuarioId: membro.usuarioId } });
      navegar(`/conversas/${c.id}`);
    } catch (e) { avisar(e.message, 'erro'); }
  }

  return (
    <div className="pagina">
      <div className="cabecalho-pagina">
        <div>
          <Link to="/" className="voltar">← Início</Link>
          <h1>{grupo.nome}</h1>
          <p className="suave">{grupo.membros.length} membros{grupo.souOrganizador && ' · você é o organizador'}</p>
        </div>
        {grupo.conversaId && <Link className="botao" to={`/conversas/${grupo.conversaId}`}>💬 Chat do grupo</Link>}
      </div>

      {grupo.souOrganizador && (
        <section className="cartao">
          <h2>Convidar jogadores</h2>
          {linkConvite ? (
            <div className="form-linha">
              <input readOnly value={linkConvite} onFocus={(e) => e.target.select()} className="crescer" aria-label="Link de convite" />
              <button className="botao" onClick={copiar}>Copiar link</button>
              <button className="botao-secundario" onClick={gerarConvite}>Gerar novo</button>
            </div>
          ) : (
            <button className="botao" onClick={gerarConvite}>Gerar link de convite</button>
          )}
          {grupo.convite && <small className="suave">Válido até {new Date(grupo.convite.expiraEm).toLocaleDateString('pt-BR')}</small>}
        </section>
      )}

      <section>
        <div className="cabecalho-secao">
          <h2>Jogos</h2>
          {grupo.souOrganizador && !mostrarForm && <button className="botao" onClick={() => setMostrarForm(true)}>+ Novo jogo</button>}
        </div>
        {mostrarForm && (
          <form className="cartao form-grade" onSubmit={criarJogo}>
            <label>Data e hora
              <input type="datetime-local" required value={novoJogo.dataHora} onChange={(e) => setNovoJogo({ ...novoJogo, dataHora: e.target.value })} />
            </label>
            <label>Local
              <input required placeholder="Ex.: Society Ponta Verde - Quadra 2" value={novoJogo.local} onChange={(e) => setNovoJogo({ ...novoJogo, local: e.target.value })} />
            </label>
            <label>Vagas
              <input type="number" min={4} max={40} required value={novoJogo.vagas} onChange={(e) => setNovoJogo({ ...novoJogo, vagas: e.target.value })} />
            </label>
            <label>Valor por pessoa (R$)
              <input type="number" min={0} step="0.5" placeholder="0" value={novoJogo.valor} onChange={(e) => setNovoJogo({ ...novoJogo, valor: e.target.value })} />
            </label>
            <div className="acoes">
              <button type="button" className="botao-secundario" onClick={() => setMostrarForm(false)}>Cancelar</button>
              <button className="botao">Criar jogo</button>
            </div>
          </form>
        )}
        {jogos.length === 0 && !mostrarForm && <p className="vazio">Nenhum jogo marcado.</p>}
        <div className="grade">
          {jogos.map((j) => (
            <Link key={j.id} to={`/jogos/${j.id}`} className="cartao cartao-jogo cartao-link">
              <strong className="capitalizar">{formatar.dataJogo(j.dataHora)}</strong>
              <span>📍 {j.local}</span>
              <span>👥 {j.confirmados.length}/{j.vagas}{j.espera.length > 0 && ` · ${j.espera.length} na espera`}</span>
              {j.minhaSituacao && (
                <span className={`selo ${j.minhaSituacao.lista === 'confirmado' ? 'selo-ok' : 'selo-espera'}`}>
                  {j.minhaSituacao.lista === 'confirmado' ? '✔ Confirmado' : `⏳ Espera (${j.minhaSituacao.posicao}º)`}
                </span>
              )}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2>Membros</h2>
        {grupo.souOrganizador && <p className="suave">O nível (1 a 5) é usado no sorteio dos times e só você vê.</p>}
        <ul className="lista-membros cartao">
          {grupo.membros.map((m) => (
            <li key={m.usuarioId}>
              <span className="avatar">{formatar.iniciais(m.nome)}</span>
              <div className="crescer">
                <strong>{m.nome}{m.usuarioId === usuario.id && ' (você)'}</strong>
                <small className="suave">{m.posicao}{m.papel === 'organizador' && ' · organizador'}</small>
              </div>
              {grupo.souOrganizador && (
                <select aria-label={`Nível de ${m.nome}`} value={m.nivel ?? 3} onChange={(e) => mudarNivel(m, e.target.value)}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
                </select>
              )}
              {m.usuarioId !== usuario.id && (
                <button className="botao-icone" title={`Mensagem para ${m.nome}`} aria-label={`Mensagem para ${m.nome}`} onClick={() => mensagemPrivada(m)}>💬</button>
              )}
              {grupo.souOrganizador && m.papel !== 'organizador' && (
                <button className="botao-icone perigo" title={`Remover ${m.nome}`} aria-label={`Remover ${m.nome}`} onClick={() => remover(m)}>✕</button>
              )}
            </li>
          ))}
        </ul>
        {!grupo.souOrganizador && (
          <button className="botao-texto perigo" onClick={() => remover({ usuarioId: usuario.id, nome: usuario.nome })}>Sair do grupo</button>
        )}
      </section>
    </div>
  );
}
