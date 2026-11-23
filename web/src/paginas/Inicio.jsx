import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatar } from '../api.js';
import { useApp } from '../contexto.jsx';

export default function Inicio() {
  const { usuario, socket, avisar } = useApp();
  const navegar = useNavigate();
  const [grupos, setGrupos] = useState(null);
  const [jogos, setJogos] = useState([]);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);

  const carregar = () => {
    api('/grupos').then(setGrupos).catch((e) => setErro(e.message));
    api('/jogos/proximos').then(setJogos).catch(() => {});
  };
  useEffect(carregar, []);

  useEffect(() => {
    if (!socket) return undefined;
    const aoMudar = (j) => setJogos((lista) => lista.map((x) => (x.id === j.id ? { ...x, ...j } : x)));
    socket.on('jogo:atualizado', aoMudar);
    return () => socket.off('jogo:atualizado', aoMudar);
  }, [socket]);

  async function criarGrupo(e) {
    e.preventDefault();
    setCriando(true);
    try {
      const g = await api('/grupos', { metodo: 'POST', corpo: { nome } });
      avisar('Grupo criado! Agora gere o convite para chamar a galera.', 'sucesso');
      navegar(`/grupos/${g.id}`);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCriando(false);
    }
  }

  async function confirmar(jogo) {
    try {
      const atualizado = await api(`/jogos/${jogo.id}/presenca`, { metodo: 'POST' });
      setJogos((l) => l.map((x) => (x.id === jogo.id ? { ...x, ...atualizado } : x)));
      avisar(atualizado.minhaSituacao?.lista === 'espera'
        ? `Vagas cheias. Você está na espera (${atualizado.minhaSituacao.posicao}º).`
        : 'Presença confirmada! ⚽', 'sucesso');
    } catch (err) {
      avisar(err.message, 'erro');
    }
  }

  return (
    <div className="pagina">
      <h1>Fala, {usuario.nome.split(' ')[0]}! 👋</h1>

      <section>
        <h2>Próximos jogos</h2>
        {jogos.length === 0 && <p className="vazio">Nenhum jogo marcado nos seus grupos.</p>}
        <div className="grade">
          {jogos.map((j) => (
            <div key={j.id} className="cartao cartao-jogo">
              <Link to={`/jogos/${j.id}`} className="cartao-link">
                <small className="suave">{j.grupoNome}</small>
                <strong className="capitalizar">{formatar.dataJogo(j.dataHora)}</strong>
                <span>📍 {j.local}</span>
                <span>👥 {j.confirmados.length}/{j.vagas} confirmados{j.espera.length > 0 && ` · ${j.espera.length} na espera`}</span>
              </Link>
              {j.minhaSituacao ? (
                <span className={`selo ${j.minhaSituacao.lista === 'confirmado' ? 'selo-ok' : 'selo-espera'}`}>
                  {j.minhaSituacao.lista === 'confirmado' ? '✔ Você está confirmado' : `⏳ Espera (${j.minhaSituacao.posicao}º)`}
                </span>
              ) : (
                <button className="botao" onClick={() => confirmar(j)}>Confirmar presença</button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Meus grupos</h2>
        {grupos === null ? <p className="suave">Carregando…</p> : grupos.length === 0 && (
          <p className="vazio">Você ainda não está em nenhum grupo. Crie um abaixo ou entre pelo link de convite.</p>
        )}
        <div className="grade">
          {grupos?.map((g) => (
            <Link key={g.id} to={`/grupos/${g.id}`} className="cartao cartao-grupo">
              <strong>{g.nome}</strong>
              <span className="suave">{g.membros.length} membros{g.souOrganizador && ' · você organiza'}</span>
            </Link>
          ))}
        </div>

        <form className="cartao form-linha" onSubmit={criarGrupo}>
          <label className="crescer">Criar novo grupo
            <input placeholder="Ex.: Pelada de Quinta - Ponta Verde" value={nome}
              onChange={(e) => { setNome(e.target.value); setErro(''); }} maxLength={50} />
          </label>
          <button className="botao" disabled={criando}>Criar grupo</button>
        </form>
        {erro && <p className="erro">{erro}</p>}
      </section>
    </div>
  );
}
