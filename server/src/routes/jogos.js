import { Router } from 'express';
import { col, oid } from '../db.js';
import { regras } from '../config.js';
import { exigirLogin } from '../auth.js';
import { ErroApp, rota } from '../erros.js';
import { obterGrupoDoMembro, exigirOrganizador } from './grupos.js';
import { enviarMensagemSistemaNoGrupo } from '../services/chat.js';
import { notificar } from '../services/notificacoes.js';
import { sortearTimes } from '../services/times.js';
import { emitirParaUsuario } from '../realtime.js';

const r = Router();
r.use(exigirLogin);

const iguais = (a, b) => String(a) === String(b);
const fmtData = (d) =>
  new Date(d).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Maceio' });

function formatarJogo(j, usuarioId, souOrganizador) {
  const pessoa = (p) => ({ usuarioId: String(p.usuarioId), nome: p.nome, em: p.em, pagou: souOrganizador ? !!p.pagou : undefined });
  const posConf = j.confirmados.findIndex((p) => iguais(p.usuarioId, usuarioId));
  const posEsp = j.espera.findIndex((p) => iguais(p.usuarioId, usuarioId));
  return {
    id: String(j._id),
    grupoId: String(j.grupoId),
    dataHora: j.dataHora,
    local: j.local,
    vagas: j.vagas,
    valor: j.valor,
    confirmados: j.confirmados.map(pessoa),
    espera: j.espera.map(pessoa),
    minhaSituacao: posConf >= 0 ? { lista: 'confirmado', posicao: posConf + 1 }
      : posEsp >= 0 ? { lista: 'espera', posicao: posEsp + 1 } : null,
    times: j.times ?? null,
    souOrganizador,
  };
}

async function obterJogoDoMembro(jogoIdTexto, usuarioId) {
  const jogoId = oid(jogoIdTexto);
  if (!jogoId) throw new ErroApp(400, 'Jogo inválido.');
  const jogo = await col('jogos').findOne({ _id: jogoId });
  if (!jogo) throw new ErroApp(404, 'Jogo não encontrado.');
  const grupo = await obterGrupoDoMembro(jogo.grupoId, usuarioId);
  return { jogo, grupo };
}

/** CA05.3: avisa todos os membros do grupo que a lista mudou. */
async function avisarMudanca(jogoId, grupo) {
  const jogo = await col('jogos').findOne({ _id: jogoId });
  for (const m of grupo.membros) {
    emitirParaUsuario(m.usuarioId, 'jogo:atualizado', formatarJogo(jogo, m.usuarioId, iguais(grupo.organizadorId, m.usuarioId)));
  }
  return jogo;
}

// Jogos do grupo (próximos primeiro)
r.get('/grupo/:grupoId', rota(async (req, res) => {
  const grupo = await obterGrupoDoMembro(req.params.grupoId, req.usuario.id);
  const souOrg = iguais(grupo.organizadorId, req.usuario.id);
  const limite = new Date(Date.now() - 6 * 3600 * 1000); // mostra também jogos que começaram há pouco
  const jogos = await col('jogos').find({ grupoId: grupo._id, dataHora: { $gte: limite } }).sort({ dataHora: 1 }).toArray();
  res.json(jogos.map((j) => formatarJogo(j, req.usuario.id, souOrg)));
}));

// Próximos jogos de todos os meus grupos (tela inicial)
r.get('/proximos', rota(async (req, res) => {
  const grupos = await col('grupos').find({ 'membros.usuarioId': req.usuario.id }).toArray();
  const porId = new Map(grupos.map((g) => [String(g._id), g]));
  const jogos = await col('jogos')
    .find({ grupoId: { $in: grupos.map((g) => g._id) }, dataHora: { $gte: new Date(Date.now() - 6 * 3600 * 1000) } })
    .sort({ dataHora: 1 })
    .limit(10)
    .toArray();
  res.json(jogos.map((j) => {
    const g = porId.get(String(j.grupoId));
    return { ...formatarJogo(j, req.usuario.id, iguais(g.organizadorId, req.usuario.id)), grupoNome: g.nome };
  }));
}));

// RF07 — criar jogo (HU03)
r.post('/grupo/:grupoId', rota(async (req, res) => {
  const grupo = await obterGrupoDoMembro(req.params.grupoId, req.usuario.id);
  exigirOrganizador(grupo, req.usuario.id);
  const { dataHora, local, vagas, valor } = req.body || {};
  const data = new Date(dataHora);
  if (Number.isNaN(data.getTime())) throw new ErroApp(400, 'Informe data e hora.');
  if (data <= new Date()) throw new ErroApp(400, 'A data do jogo precisa ser no futuro.'); // CA03.2
  if (!local || String(local).trim().length < 2) throw new ErroApp(400, 'Informe o local.');
  const nVagas = Number(vagas);
  if (!Number.isInteger(nVagas) || nVagas < regras.vagasMin || nVagas > regras.vagasMax) {
    throw new ErroApp(400, `O número de vagas deve ser entre ${regras.vagasMin} e ${regras.vagasMax}.`);
  }
  const nValor = valor === '' || valor == null ? 0 : Number(valor);
  if (Number.isNaN(nValor) || nValor < 0) throw new ErroApp(400, 'Valor inválido.');

  const jogo = {
    grupoId: grupo._id,
    dataHora: data,
    local: String(local).trim(),
    vagas: nVagas,
    valor: nValor,
    confirmados: [],
    espera: [],
    criadoPor: req.usuario.id,
    criadoEm: new Date(),
  };
  const { insertedId } = await col('jogos').insertOne(jogo);
  jogo._id = insertedId;

  // CA03.3: mensagem automática no chat do grupo
  const valorTxt = nValor > 0 ? ` R$ ${nValor.toFixed(2).replace('.', ',')} por pessoa.` : '';
  await enviarMensagemSistemaNoGrupo(
    grupo._id,
    'jogo_criado',
    `⚽ Jogo marcado: ${fmtData(data)} — ${jogo.local}. ${nVagas} vagas.${valorTxt}`,
    { jogoId: String(insertedId) },
  );
  for (const m of grupo.membros) {
    if (!iguais(m.usuarioId, req.usuario.id)) {
      await notificar(m.usuarioId, `Novo jogo no grupo ${grupo.nome}: ${fmtData(data)}`, `/jogos/${insertedId}`);
    }
  }
  res.status(201).json(formatarJogo(jogo, req.usuario.id, true));
}));

r.get('/:id', rota(async (req, res) => {
  const { jogo, grupo } = await obterJogoDoMembro(req.params.id, req.usuario.id);
  res.json({ ...formatarJogo(jogo, req.usuario.id, iguais(grupo.organizadorId, req.usuario.id)), grupoNome: grupo.nome });
}));

// RF08 — confirmar presença; se lotado, vai para a espera (HU04)
r.post('/:id/presenca', rota(async (req, res) => {
  const { jogo, grupo } = await obterJogoDoMembro(req.params.id, req.usuario.id);
  if (jogo.dataHora < new Date()) throw new ErroApp(400, 'Este jogo já começou.');
  const membro = grupo.membros.find((m) => iguais(m.usuarioId, req.usuario.id));
  const pessoa = { usuarioId: req.usuario.id, nome: membro.nome, em: new Date(), pagou: false };
  const naoEstaEmNenhuma = { 'confirmados.usuarioId': { $ne: req.usuario.id }, 'espera.usuarioId': { $ne: req.usuario.id } };

  // Operação atômica: só entra nos confirmados se ainda houver vaga (CA04.4)
  const entrou = await col('jogos').updateOne(
    { _id: jogo._id, ...naoEstaEmNenhuma, $expr: { $lt: [{ $size: '$confirmados' }, '$vagas'] } },
    { $push: { confirmados: pessoa } },
  );
  if (!entrou.modifiedCount) {
    // Sem vaga (ou já está numa lista — CA04.3): tenta a lista de espera
    await col('jogos').updateOne({ _id: jogo._id, ...naoEstaEmNenhuma }, { $push: { espera: pessoa } });
  }
  const atualizado = await avisarMudanca(jogo._id, grupo);
  res.json(formatarJogo(atualizado, req.usuario.id, iguais(grupo.organizadorId, req.usuario.id)));
}));

// RF09 — cancelar presença e promover o 1º da espera (HU05)
r.delete('/:id/presenca', rota(async (req, res) => {
  const { jogo, grupo } = await obterJogoDoMembro(req.params.id, req.usuario.id);
  await col('jogos').updateOne(
    { _id: jogo._id },
    { $pull: { confirmados: { usuarioId: req.usuario.id }, espera: { usuarioId: req.usuario.id } } },
  );

  // Promove enquanto houver vaga e gente esperando (condição atômica sobre o 1º da fila)
  for (let i = 0; i < 5; i++) {
    const atual = await col('jogos').findOne({ _id: jogo._id });
    if (atual.confirmados.length >= atual.vagas || atual.espera.length === 0) break;
    const primeiro = atual.espera[0];
    const promovido = await col('jogos').updateOne(
      { _id: jogo._id, 'espera.0.usuarioId': primeiro.usuarioId, $expr: { $lt: [{ $size: '$confirmados' }, '$vagas'] } },
      { $pop: { espera: -1 }, $push: { confirmados: { ...primeiro, em: new Date() } } },
    );
    if (promovido.modifiedCount) {
      // CA05.2
      await notificar(primeiro.usuarioId, `Abriu vaga! Você está confirmado no jogo de ${fmtData(atual.dataHora)}.`, `/jogos/${jogo._id}`);
    }
  }
  const atualizado = await avisarMudanca(jogo._id, grupo);
  res.json(formatarJogo(atualizado, req.usuario.id, iguais(grupo.organizadorId, req.usuario.id)));
}));

// RF16 — sortear times (HU06)
r.post('/:id/sortear', rota(async (req, res) => {
  const { jogo, grupo } = await obterJogoDoMembro(req.params.id, req.usuario.id);
  exigirOrganizador(grupo, req.usuario.id);
  const qtd = Number(req.body?.quantidadeTimes || 2);
  if (!Number.isInteger(qtd) || qtd < 2 || qtd > 4) throw new ErroApp(400, 'Escolha de 2 a 4 times.');
  if (jogo.confirmados.length < qtd * 2) throw new ErroApp(400, `São necessários pelo menos ${qtd * 2} confirmados.`);

  const nivelDe = new Map(grupo.membros.map((m) => [String(m.usuarioId), m.nivel ?? 3]));
  const jogadores = jogo.confirmados.map((p) => ({ usuarioId: String(p.usuarioId), nome: p.nome, nivel: nivelDe.get(String(p.usuarioId)) ?? 3 }));
  const times = sortearTimes(jogadores, qtd).map((t) => ({
    nome: t.nome,
    jogadores: t.jogadores.map(({ usuarioId, nome }) => ({ usuarioId, nome })), // níveis não são divulgados
  }));
  await col('jogos').updateOne({ _id: jogo._id }, { $set: { times, timesSorteadosEm: new Date() } });

  const resumo = times.map((t) => `${t.nome}: ${t.jogadores.map((j) => j.nome.split(' ')[0]).join(', ')}`).join(' | ');
  await enviarMensagemSistemaNoGrupo(grupo._id, 'times_sorteados', `🎲 Times sorteados — ${resumo}`, { jogoId: String(jogo._id) });

  const atualizado = await avisarMudanca(jogo._id, grupo);
  res.json(formatarJogo(atualizado, req.usuario.id, true));
}));

// RF18 — marcar pagamento
r.patch('/:id/pagamento/:usuarioId', rota(async (req, res) => {
  const { jogo, grupo } = await obterJogoDoMembro(req.params.id, req.usuario.id);
  exigirOrganizador(grupo, req.usuario.id);
  const alvo = oid(req.params.usuarioId);
  const r2 = await col('jogos').updateOne(
    { _id: jogo._id, 'confirmados.usuarioId': alvo },
    { $set: { 'confirmados.$.pagou': !!req.body?.pagou } },
  );
  if (!r2.matchedCount) throw new ErroApp(404, 'Jogador não está na lista de confirmados.');
  const atualizado = await avisarMudanca(jogo._id, grupo);
  res.json(formatarJogo(atualizado, req.usuario.id, true));
}));

export default r;
