import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3001),
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017',
  mongoDb: process.env.MONGO_DB || 'borapelada',
  jwtSecret: process.env.JWT_SECRET || 'troque-este-segredo-em-producao',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
};

// Regras de negócio definidas no PRD
export const regras = {
  mensagemMaxChars: 2000,        // CA-C03
  mensagensPorPagina: 30,        // RNF02 / CA-C07
  limiteMensagensPorMinuto: 20,  // RA09
  conviteDiasValidade: 7,        // CA01.2
  vagasMin: 4,                   // CA03.1
  vagasMax: 40,
};
