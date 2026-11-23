/** Erro de regra de negócio com status HTTP. */
export class ErroApp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

/** Envolve handlers async para repassar erros ao Express. */
export const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function tratadorDeErros(err, req, res, _next) {
  if (err instanceof ErroApp) return res.status(err.status).json({ erro: err.message });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
}
