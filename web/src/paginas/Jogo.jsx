import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatar } from '../api.js';
import { useApp } from '../contexto.jsx';

export default function Jogo() {
  const { id } = useParams();
  const { usuario, socket, avisar } = useApp();
  const [jogo, setJogo] = useState(null);
  const [erro, setErro] = useState('');
  const [qtdTimes, setQtdTimes] = useState(2);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api(`/jogos/${id}`).then(setJogo).catch((e) => setErro(e.message));
  }, [id]);

  // CA05.3: a lista se atualiza sozinha quando alguém confirma ou cancela
  useEffect(() => {
    if (!socket) return undefined;
    const aoMudar = (j) => { if (j.id === id) setJogo((atual) => ({ ...atual, ...j })); };
    socket.on('jogo:atualizado', aoMudar);
    return () => socket.off('jogo:atualizado', aoMudar);
  }, [socket, id]);

  if (erro) return <div className="pagina"><p className="erro">{erro}</p><Link to="/">Voltar</Link></div>;
  if (!jogo) return <div className="pagina"><p className="suave">Carregando…</p></div>;

  const acao = async (fn) => {
    setOcupado(true);
    try { await fn(); } catch (e) { avisar(e.message, 'erro'); } finally { setOcupado(false); }
  };

  const confirmar = () => acao(async () => {
    const j = await api(`/jogos/${id}/presenca`, { metodo: 'POST' });
    setJogo((a) => ({ ...a, ...j }));
    avisar(j.minhaSituacao?.lista === 'espera' ? `Vagas cheias. Você está na espera (${j.minhaSituacao.posicao}º).` : 'Presença confirmada! ⚽', 'sucesso');
  });
  const cancelar = () => acao(async () => {
    if (!window.confirm('Cancelar sua presença? Sua vaga vai para o próximo da espera.')) return;
    const j = await api(`/jogos/${id}/presenca`, { metodo: 'DELETE' });
    setJogo((a) => ({ ...a, ...j }));
    avisar('Presença cancelada.');
  });
  const sortear = () => acao(async () => {
    const j = await api(`/jogos/${id}/sortear`, { metodo: 'POST', corpo: { quantidadeTimes: qtdTimes } });
    setJogo((a) => ({ ...a, ...j }));
    avisar('Times sorteados e enviados no chat do grupo! 🎲', 'sucesso');
  });
  const marcarPagamento = (p) => acao(async () => {
    const j = await api(`/jogos/${id}/pagamento/${p.usuarioId}`, { metodo: 'PATCH', corpo: { pagou: !p.pagou } });
    setJogo((a) => ({ ...a, ...j }));
  });

  const vagasLivres = jogo.vagas - jogo.confirmados.length;
  const passou = new Date(jogo.dataHora) < new Date();
  const pagos = jogo.confirmados.filter((p) => p.pagou).length;

  return (
    <div className="pagina">
      <Link to={`/grupos/${jogo.grupoId}`} className="voltar">← {jogo.grupoNome || 'Grupo'}</Link>
      <div className="cartao destaque-jogo">
        <h1 className="capitalizar">{formatar.dataJogo(jogo.dataHora)}</h1>
        <p>📍 {jogo.local}</p>
        <p>💰 {formatar.dinheiro(jogo.valor)} por pessoa</p>
        <p>👥 {jogo.confirmados.length}/{jogo.vagas} confirmados · {vagasLivres > 0 ? `${vagasLivres} vaga(s)` : 'lotado'}{jogo.espera.length > 0 && ` · ${jogo.espera.length} na espera`}</p>
        <div className="acoes">
          {!passou && !jogo.minhaSituacao && (
            <button className="botao botao-grande" onClick={confirmar} disabled={ocupado}>
              {vagasLivres > 0 ? 'Confirmar presença' : 'Entrar na lista de espera'}
            </button>
          )}
          {jogo.minhaSituacao && (
            <>
              <span className={`selo ${jogo.minhaSituacao.lista === 'confirmado' ? 'selo-ok' : 'selo-espera'}`}>
                {jogo.minhaSituacao.lista === 'confirmado'
                  ? `✔ Você está confirmado (${jogo.minhaSituacao.posicao}º)`
                  : `⏳ Você está na espera (${jogo.minhaSituacao.posicao}º)`}
              </span>
              {!passou && <button className="botao-secundario" onClick={cancelar} disabled={ocupado}>Cancelar presença</button>}
            </>
          )}
        </div>
      </div>

      <div className="colunas">
        <section className="cartao">
          <h2>Confirmados ({jogo.confirmados.length}/{jogo.vagas})</h2>
          {jogo.souOrganizador && jogo.confirmados.length > 0 && <p className="suave">Pagamento: {pagos}/{jogo.confirmados.length} pagaram</p>}
          <ol className="lista-presenca">
            {jogo.confirmados.map((p) => (
              <li key={p.usuarioId} className={p.usuarioId === usuario.id ? 'eu' : ''}>
                <span className="crescer">{p.nome}</span>
                {jogo.souOrganizador && (
                  <button className={`selo ${p.pagou ? 'selo-ok' : 'selo-pendente'}`} onClick={() => marcarPagamento(p)} disabled={ocupado}
                    title="Clique para alternar">
                    {p.pagou ? 'Pago' : 'Pendente'}
                  </button>
                )}
              </li>
            ))}
          </ol>
          {jogo.confirmados.length === 0 && <p className="vazio">Ninguém confirmou ainda.</p>}
        </section>

        <section className="cartao">
          <h2>Lista de espera ({jogo.espera.length})</h2>
          <ol className="lista-presenca">
            {jogo.espera.map((p) => (
              <li key={p.usuarioId} className={p.usuarioId === usuario.id ? 'eu' : ''}>{p.nome}</li>
            ))}
          </ol>
          {jogo.espera.length === 0 && <p className="vazio">Ninguém na espera.</p>}
        </section>
      </div>

      <section className="cartao">
        <div className="cabecalho-secao">
          <h2>Times</h2>
          {jogo.souOrganizador && (
            <div className="form-linha">
              <select value={qtdTimes} onChange={(e) => setQtdTimes(Number(e.target.value))} aria-label="Quantidade de times">
                {[2, 3, 4].map((n) => <option key={n} value={n}>{n} times</option>)}
              </select>
              <button className="botao" onClick={sortear} disabled={ocupado}>🎲 {jogo.times ? 'Sortear de novo' : 'Sortear times'}</button>
            </div>
          )}
        </div>
        {!jogo.times && <p className="vazio">{jogo.souOrganizador ? 'Sorteie quando a lista estiver fechada.' : 'O organizador ainda não sorteou os times.'}</p>}
        {jogo.times && (
          <div className="grade">
            {jogo.times.map((t) => (
              <div key={t.nome} className="time">
                <strong>{t.nome}</strong>
                <ul>{t.jogadores.map((j) => <li key={j.usuarioId}>{j.nome}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
