import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { oid } from './db.js';

export function gerarToken(usuario) {
  return jwt.sign({ sub: String(usuario._id), nome: usuario.nome }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function verificarToken(token) {
  const dados = jwt.verify(token, config.jwtSecret);
  return { id: oid(dados.sub), nome: dados.nome };
}

/** Middleware Express: exige JWT válido (RNF04 / RA01). */
export function exigirLogin(req, res, next) {
  const cabecalho = req.headers.authorization || '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Faça login para continuar.' });
  try {
    req.usuario = verificarToken(token);
    if (!req.usuario.id) throw new Error('token inválido');
    next();
  } catch {
    res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  }
}
