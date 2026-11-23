import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../contexto.jsx';

const POSICOES = ['goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante'];

export default function Entrar() {
  const { entrar } = useApp();
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const [modo, setModo] = useState('login');
  const [form, setForm] = useState({ nome: '', email: '', senha: '', posicao: 'meia' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const mudar = (campo) => (e) => { setForm({ ...form, [campo]: e.target.value }); setErro(''); };

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      const dados = await api(modo === 'login' ? '/auth/login' : '/auth/cadastro', {
        metodo: 'POST',
        corpo: modo === 'login' ? { email: form.email, senha: form.senha } : form,
      });
      entrar(dados);
      const voltar = params.get('voltar');
      navegar(voltar && voltar.startsWith('/') && voltar !== '/entrar' ? voltar : '/', { replace: true });
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tela-entrar">
      <div className="entrar-lado">
        <h1>⚽ BoraPelada</h1>
        <p>Lista de presença sem copiar e colar, lista de espera automática, times equilibrados e o papo do grupo num lugar só.</p>
      </div>
      <form className="cartao entrar-form" onSubmit={enviar}>
        <div className="abas">
          <button type="button" className={modo === 'login' ? 'ativa' : ''} onClick={() => { setModo('login'); setErro(''); }}>Entrar</button>
          <button type="button" className={modo === 'cadastro' ? 'ativa' : ''} onClick={() => { setModo('cadastro'); setErro(''); }}>Criar conta</button>
        </div>
        {modo === 'cadastro' && (
          <>
            <label>Nome
              <input value={form.nome} onChange={mudar('nome')} required minLength={2} autoComplete="name" />
            </label>
            <label>Posição preferida
              <select value={form.posicao} onChange={mudar('posicao')}>
                {POSICOES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </label>
          </>
        )}
        <label>E-mail
          <input type="email" value={form.email} onChange={mudar('email')} required autoComplete="email" />
        </label>
        <label>Senha
          <input type="password" value={form.senha} onChange={mudar('senha')} required minLength={6}
            autoComplete={modo === 'login' ? 'current-password' : 'new-password'} />
          {modo === 'cadastro' && <small className="suave">Mínimo de 6 caracteres</small>}
        </label>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <button className="botao" disabled={enviando}>
          {enviando ? 'Aguarde…' : modo === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
    </div>
  );
}
