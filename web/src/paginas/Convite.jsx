import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../contexto.jsx';

/** Entrada no grupo pelo link de convite (HU02). */
export default function Convite() {
  const { token } = useParams();
  const { avisar, setConversas } = useApp();
  const navegar = useNavigate();
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api(`/convites/${token}`)
      .then((i) => (i.jaSouMembro ? navegar(`/grupos/${i.grupoId}`, { replace: true }) : setInfo(i)))
      .catch((e) => setErro(e.message));
  }, [token, navegar]);

  async function entrar() {
    try {
      const r = await api(`/convites/${token}/entrar`, { metodo: 'POST' });
      api('/conversas').then(setConversas).catch(() => {});
      avisar(`Bem-vindo ao ${info.nome}! ⚽`, 'sucesso');
      navegar(`/grupos/${r.grupoId}`, { replace: true });
    } catch (e) { setErro(e.message); }
  }

  return (
    <div className="pagina pagina-estreita">
      <div className="cartao centro">
        {erro ? (
          <>
            <h1>😕</h1>
            <p className="erro">{erro}</p>
            <Link to="/">Ir para o início</Link>
          </>
        ) : !info ? <p className="suave">Carregando convite…</p> : (
          <>
            <p className="suave">Você foi convidado para</p>
            <h1>{info.nome}</h1>
            <p>{info.totalMembros} membros</p>
            <button className="botao botao-grande" onClick={entrar}>Entrar no grupo</button>
          </>
        )}
      </div>
    </div>
  );
}
