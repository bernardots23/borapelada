import { Link } from 'react-router-dom';
import { formatar } from '../api.js';
import { useApp } from '../contexto.jsx';

/** Lista de conversas ordenada pela mais recente, com não lidas (RF14 / CA-C15). */
export default function Conversas() {
  const { conversas, usuario } = useApp();

  return (
    <div className="pagina">
      <h1>Conversas</h1>
      {conversas.length === 0 && (
        <p className="vazio">Nenhuma conversa ainda. Entre em um grupo ou toque em 💬 ao lado de um membro para mandar mensagem.</p>
      )}
      <ul className="lista-conversas cartao">
        {conversas.map((c) => {
          const m = c.ultimaMensagem;
          const previa = !m ? 'Nenhuma mensagem ainda'
            : m.remetenteId === null ? m.texto
            : `${m.remetenteId === usuario.id ? 'Você' : c.tipo === 'grupo' ? m.remetenteNome?.split(' ')[0] : ''}${m.remetenteId === usuario.id || c.tipo === 'grupo' ? ': ' : ''}${m.texto || 'Mensagem apagada'}`;
          return (
            <li key={c.id}>
              <Link to={`/conversas/${c.id}`} className={c.naoLidas > 0 ? 'nao-lida' : ''}>
                <span className={`avatar ${c.tipo === 'grupo' ? 'avatar-grupo' : ''}`}>{c.tipo === 'grupo' ? '⚽' : formatar.iniciais(c.titulo)}</span>
                <div className="crescer resumo">
                  <strong>{c.titulo}</strong>
                  <small>{previa}</small>
                </div>
                <div className="meta">
                  {m && <small>{formatar.quando(m.enviadaEm)}</small>}
                  {c.naoLidas > 0 && <span className="bolinha">{c.naoLidas}</span>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
