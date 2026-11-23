// Cliente HTTP da API. O token JWT fica no localStorage.
const CHAVE = 'borapelada_token';

export const token = {
  ler: () => { try { return localStorage.getItem(CHAVE); } catch { return null; } },
  salvar: (t) => { try { localStorage.setItem(CHAVE, t); } catch { /* ignora */ } },
  limpar: () => { try { localStorage.removeItem(CHAVE); } catch { /* ignora */ } },
};

export class ErroApi extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

export async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const t = token.ler();
  const resp = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  if (resp.status === 204) return null;
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 401 && t) {
      token.limpar();
      window.dispatchEvent(new Event('sessao-expirada'));
    }
    throw new ErroApi(resp.status, dados.erro || 'Não foi possível concluir. Tente de novo.');
  }
  return dados;
}

export const formatar = {
  dataJogo: (d) =>
    new Date(d).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
  hora: (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  dia: (d) => {
    const data = new Date(d);
    const hoje = new Date();
    const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
    if (data.toDateString() === hoje.toDateString()) return 'Hoje';
    if (data.toDateString() === ontem.toDateString()) return 'Ontem';
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  },
  quando: (d) => {
    const data = new Date(d);
    return data.toDateString() === new Date().toDateString()
      ? formatar.hora(d)
      : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  },
  dinheiro: (v) => (v ? `R$ ${Number(v).toFixed(2).replace('.', ',')}` : 'Grátis'),
  iniciais: (nome = '') => nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase(),
};
