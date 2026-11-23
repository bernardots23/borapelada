import { MongoClient, ObjectId } from 'mongodb';
import { config } from './config.js';

let client;
let db;

export async function conectar() {
  client = new MongoClient(config.mongoUrl);
  await client.connect();
  db = client.db(config.mongoDb);
  await criarIndices();
  console.log(`[db] conectado em ${config.mongoUrl}/${config.mongoDb}`);
  return db;
}

export function col(nome) {
  if (!db) throw new Error('Banco não conectado');
  return db.collection(nome);
}

export async function desconectar() {
  await client?.close();
}

/** Converte string para ObjectId; devolve null se for inválida. */
export function oid(valor) {
  if (valor instanceof ObjectId) return valor;
  return ObjectId.isValid(valor) && String(new ObjectId(valor)) === String(valor)
    ? new ObjectId(valor)
    : null;
}

/** Índices descritos no PRD, seção 5.4 */
async function criarIndices() {
  await col('usuarios').createIndex({ email: 1 }, { unique: true });

  await col('grupos').createIndex({ 'membros.usuarioId': 1 });
  await col('grupos').createIndex({ conviteToken: 1 }, { unique: true, sparse: true });

  await col('jogos').createIndex({ grupoId: 1, dataHora: 1 });

  await col('mensagens').createIndex({ conversaId: 1, enviadaEm: -1, _id: -1 });
  await col('mensagens').createIndex(
    { conversaId: 1, idCliente: 1 },
    { unique: true, partialFilterExpression: { idCliente: { $type: 'string' } } },
  );

  await col('conversas').createIndex({ participantesIds: 1, atualizadaEm: -1 });
  await col('conversas').createIndex(
    { chavePrivada: 1 },
    { unique: true, partialFilterExpression: { chavePrivada: { $type: 'string' } } },
  );
  await col('conversas').createIndex(
    { grupoId: 1 },
    { unique: true, partialFilterExpression: { tipo: 'grupo' } },
  );

  await col('notificacoes').createIndex({ usuarioId: 1, criadaEm: -1 });
}
