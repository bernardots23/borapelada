// Testes de integração: API + Socket.IO + MongoDB real.
// Cobrem os critérios de aceitação do PRD (HU01–HU06 e CA-C01 a CA-C16).
// Requer MongoDB rodando (MONGO_URL). Usa o banco "borapelada_teste", que é apagado.
// Rodar: npm run test:integracao
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as clienteIo } from 'socket.io-client';

process.env.MONGO_DB = 'borapelada_teste';
process.env.MONGO_URL ||= 'mongodb://localhost:27017';

const { conectar, col, desconectar } = await import('../src/db.js');
const { criarApp } = await import('../src/app.js');
const { iniciarSocket } = await import('../src/socket.js');
const http = await import('node:http');

let servidor;
let io;
let base;
const sockets = [];

before(async () => {
  const db = await conectar();
  await db.dropDatabase();
  await desconectar();
  await conectar(); // recria os índices no banco limpo
  servidor = http.createServer(criarApp());
  io = iniciarSocket(servidor);
  await new Promise((r) => servidor.listen(0, r));
  base = `http://localhost:${servidor.address().port}`;
});

after(async () => {
  sockets.forEach((s) => s.disconnect());
  io.close();
  await new Promise((r) => servidor.close(r));
  await desconectar();
});

async function req(caminho, { token, metodo = 'GET', corpo } = {}) {
  const resp = await fetch(`${base}/api${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  return { status: resp.status, dados: texto ? JSON.parse(texto) : null };
}

async function usuario(nome) {
  const email = `${nome.toLowerCase().replace(/\s/g, '')}@teste.com`;
  const r = await req('/auth/cadastro', { metodo: 'POST', corpo: { nome, email, senha: '123456' } });
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  return { token: r.dados.token, id: r.dados.usuario.id, nome };
}

function conectarSocket(u) {
  return new Promise((resolve, reject) => {
    const s = clienteIo(base, { auth: { token: u.token }, transports: ['websocket'], forceNew: true });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const emitir = (s, evento, dados) => new Promise((r) => s.emit(evento, dados, r));
const esperarEvento = (s, evento, filtro = () => true, ms = 2000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { s.off(evento, h); reject(new Error(`timeout esperando ${evento}`)); }, ms);
  const h = (d) => { if (filtro(d)) { clearTimeout(t); s.off(evento, h); resolve(d); } };
  s.on(evento, h);
});

// Estado compartilhado entre os testes (executam em ordem)
const ctx = {};

test('HU01: criar grupo e gerar convite', async () => {
  ctx.org = await usuario('Organizador Teste');
  const curto = await req('/grupos', { token: ctx.org.token, metodo: 'POST', corpo: { nome: 'Ab' } });
  assert.equal(curto.status, 400); // CA01.3
  assert.match(curto.dados.erro, /3 caracteres/);

  const g = await req('/grupos', { token: ctx.org.token, metodo: 'POST', corpo: { nome: 'Pelada Teste' } });
  assert.equal(g.status, 201);
  assert.equal(g.dados.souOrganizador, true); // CA01.1
  ctx.grupoId = g.dados.id;

  const c = await req(`/grupos/${ctx.grupoId}/convite`, { token: ctx.org.token, metodo: 'POST' });
  const dias = (new Date(c.dados.expiraEm) - Date.now()) / 86400000;
  assert.ok(dias > 6.9 && dias <= 7); // CA01.2
  ctx.convite = c.dados.token;
});

test('HU02: entrar pelo convite (sem duplicar) e convite expirado', async () => {
  ctx.jogadores = [];
  for (let i = 1; i <= 15; i++) ctx.jogadores.push(await usuario(`Jogador ${i}`));
  for (const j of ctx.jogadores) {
    const r = await req(`/convites/${ctx.convite}/entrar`, { token: j.token, metodo: 'POST' });
    assert.equal(r.status, 200);
  }
  const denovo = await req(`/convites/${ctx.convite}/entrar`, { token: ctx.jogadores[0].token, metodo: 'POST' });
  assert.equal(denovo.dados.jaEraMembro, true); // CA02.3
  const g = await req(`/grupos/${ctx.grupoId}`, { token: ctx.org.token });
  assert.equal(g.dados.membros.length, 16);
  ctx.conversaGrupo = g.dados.conversaId;

  await col('grupos').updateOne({ conviteToken: ctx.convite }, { $set: { conviteExpiraEm: new Date(Date.now() - 1000) } });
  const fora = await usuario('Atrasado');
  const exp = await req(`/convites/${ctx.convite}/entrar`, { token: fora.token, metodo: 'POST' });
  assert.equal(exp.status, 410); // CA02.2
  assert.match(exp.dados.erro, /expirado/i);
  ctx.estranho = fora;
});

test('HU03: criar jogo (data futura) e mensagem automática no chat', async () => {
  const passado = await req(`/jogos/grupo/${ctx.grupoId}`, {
    token: ctx.org.token, metodo: 'POST',
    corpo: { dataHora: new Date(Date.now() - 3600e3).toISOString(), local: 'Quadra', vagas: 14 },
  });
  assert.equal(passado.status, 400); // CA03.2

  const naoOrg = await req(`/jogos/grupo/${ctx.grupoId}`, {
    token: ctx.jogadores[0].token, metodo: 'POST',
    corpo: { dataHora: new Date(Date.now() + 86400e3).toISOString(), local: 'Quadra', vagas: 14 },
  });
  assert.equal(naoOrg.status, 403);

  const j = await req(`/jogos/grupo/${ctx.grupoId}`, {
    token: ctx.org.token, metodo: 'POST',
    corpo: { dataHora: new Date(Date.now() + 86400e3).toISOString(), local: 'Society Teste', vagas: 14, valor: 15 },
  });
  assert.equal(j.status, 201); // CA03.1
  ctx.jogoId = j.dados.id;

  const h = await req(`/conversas/${ctx.conversaGrupo}/mensagens`, { token: ctx.org.token });
  const sistema = h.dados.mensagens.filter((m) => m.evento === 'jogo_criado');
  assert.equal(sistema.length, 1); // CA03.3
  assert.match(sistema[0].texto, /Society Teste/);
});

test('HU04: confirmar presença, lista de espera e corrida pela última vaga', async () => {
  // 13 confirmam em sequência
  for (let i = 0; i < 13; i++) {
    const r = await req(`/jogos/${ctx.jogoId}/presenca`, { token: ctx.jogadores[i].token, metodo: 'POST' });
    assert.equal(r.dados.minhaSituacao.lista, 'confirmado');
    assert.equal(r.dados.minhaSituacao.posicao, i + 1); // CA04.1
  }
  // CA04.3: confirmar de novo não duplica
  await req(`/jogos/${ctx.jogoId}/presenca`, { token: ctx.jogadores[0].token, metodo: 'POST' });
  // CA04.4: dois jogadores disputam a última vaga ao mesmo tempo
  const [a, b] = await Promise.all([
    req(`/jogos/${ctx.jogoId}/presenca`, { token: ctx.jogadores[13].token, metodo: 'POST' }),
    req(`/jogos/${ctx.jogoId}/presenca`, { token: ctx.jogadores[14].token, metodo: 'POST' }),
  ]);
  const situacoes = [a.dados.minhaSituacao, b.dados.minhaSituacao].map((s) => s.lista).sort();
  assert.deepEqual(situacoes, ['confirmado', 'espera']);

  const jogo = (await req(`/jogos/${ctx.jogoId}`, { token: ctx.org.token })).dados;
  assert.equal(jogo.confirmados.length, 14);
  assert.equal(jogo.espera.length, 1); // CA04.2
  assert.equal(new Set(jogo.confirmados.map((p) => p.usuarioId)).size, 14);
  ctx.naEspera = [ctx.jogadores[13], ctx.jogadores[14]].find((j) => j.id === jogo.espera[0].usuarioId);
});

test('HU05: cancelar promove o 1º da espera e notifica em tempo real', async () => {
  const sEspera = await conectarSocket(ctx.naEspera);
  const sOutro = await conectarSocket(ctx.jogadores[5]);
  const notificacao = esperarEvento(sEspera, 'notificacao:nova', (n) => /Abriu vaga/.test(n.texto));
  const listaAtualizada = esperarEvento(sOutro, 'jogo:atualizado', (j) => j.id === ctx.jogoId && j.espera.length === 0);

  const inicio = Date.now();
  await req(`/jogos/${ctx.jogoId}/presenca`, { token: ctx.jogadores[0].token, metodo: 'DELETE' });
  await notificacao; // CA05.2
  await listaAtualizada; // CA05.3
  assert.ok(Date.now() - inicio < 2000);

  const jogo = (await req(`/jogos/${ctx.jogoId}`, { token: ctx.naEspera.token })).dados;
  assert.equal(jogo.minhaSituacao.lista, 'confirmado'); // CA05.1
  assert.equal(jogo.confirmados.length, 14);
});

test('HU06: sortear times equilibrados', async () => {
  const r = await req(`/jogos/${ctx.jogoId}/sortear`, { token: ctx.org.token, metodo: 'POST', corpo: { quantidadeTimes: 2 } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.dados.times.map((t) => t.jogadores.length), [7, 7]); // CA06.1
});

test('CA-C01/C06: envio em tempo real, não lidas e lista ordenada', async () => {
  const autor = ctx.jogadores[1];
  const leitor = ctx.jogadores[2];
  const sAutor = await conectarSocket(autor);
  const sLeitor = await conectarSocket(leitor);
  assert.equal((await emitir(sLeitor, 'conversa:entrar', { conversaId: ctx.conversaGrupo })).ok, true);
  await emitir(sLeitor, 'conversa:lida', { conversaId: ctx.conversaGrupo });

  const chegou = esperarEvento(sLeitor, 'mensagem:nova', (m) => m.texto === 'Bora!');
  const listaLeitor = esperarEvento(sLeitor, 'conversa:atualizada', (c) => c.id === ctx.conversaGrupo && c.ultimaMensagem?.texto === 'Bora!');
  const inicio = Date.now();
  const r = await emitir(sAutor, 'mensagem:enviar', { conversaId: ctx.conversaGrupo, texto: '  Bora!  ', idCliente: 'cli-1' });
  assert.equal(r.ok, true);
  const m = await chegou;
  assert.ok(Date.now() - inicio < 2000); // RNF01
  assert.equal(m.texto, 'Bora!');
  assert.equal(m.remetenteId, autor.id);

  const doc = await col('mensagens').findOne({ texto: 'Bora!' });
  assert.ok(doc.conversaId && doc.remetenteId && doc.enviadaEm); // gravada no MongoDB

  const c = await listaLeitor;
  assert.equal(c.naoLidas, 1); // CA-C06
  const lista = (await req('/conversas', { token: leitor.token })).dados;
  assert.equal(lista[0].id, ctx.conversaGrupo); // no topo (CA-C15)
});

test('CA-C02/C03/C04/C05: validações, acesso e duplicidade', async () => {
  const s = await conectarSocket(ctx.jogadores[3]);
  const vazia = await emitir(s, 'mensagem:enviar', { conversaId: ctx.conversaGrupo, texto: '    ' });
  assert.equal(vazia.ok, false); // CA-C02
  const longa = await emitir(s, 'mensagem:enviar', { conversaId: ctx.conversaGrupo, texto: 'a'.repeat(2001) });
  assert.equal(longa.ok, false);
  assert.match(longa.erro, /muito longa/); // CA-C03

  const sEstranho = await conectarSocket(ctx.estranho);
  const negado = await emitir(sEstranho, 'mensagem:enviar', { conversaId: ctx.conversaGrupo, texto: 'oi' });
  assert.equal(negado.status, 403); // CA-C04
  const hist = await req(`/conversas/${ctx.conversaGrupo}/mensagens`, { token: ctx.estranho.token });
  assert.equal(hist.status, 403); // RA02

  const um = await emitir(s, 'mensagem:enviar', { conversaId: ctx.conversaGrupo, texto: 'reenvio', idCliente: 'cli-dup' });
  const dois = await emitir(s, 'mensagem:enviar', { conversaId: ctx.conversaGrupo, texto: 'reenvio', idCliente: 'cli-dup' });
  assert.equal(um.dados.id, dois.dados.id);
  assert.equal(await col('mensagens').countDocuments({ idCliente: 'cli-dup' }), 1); // CA-C05

  const semToken = await req(`/conversas/${ctx.conversaGrupo}/mensagens`);
  assert.equal(semToken.status, 401); // RA01
});

test('CA-C07/C08/C09/C13/C14: paginação e ordenação do histórico', async () => {
  const autor = ctx.jogadores[4];
  const privada = await req('/conversas/privada', { token: autor.token, metodo: 'POST', corpo: { usuarioId: ctx.jogadores[6].id } });
  const conv = privada.dados.id;
  const { ObjectId } = await import('mongodb');
  // 100 mensagens; as 10 últimas com o MESMO horário para testar o desempate pelo _id
  const base0 = Date.now() - 100000;
  const docs = Array.from({ length: 100 }, (_, i) => ({
    conversaId: new ObjectId(conv), tipo: 'usuario', remetenteId: new ObjectId(autor.id), remetenteNome: autor.nome,
    texto: `msg ${i}`, enviadaEm: new Date(i < 90 ? base0 + i * 1000 : base0 + 90000), excluida: false,
  }));
  await col('mensagens').insertMany(docs);

  const p1 = (await req(`/conversas/${conv}/mensagens`, { token: autor.token })).dados;
  assert.equal(p1.mensagens.length, 30); // CA-C07
  assert.equal(p1.mensagens.at(-1).texto, 'msg 99');
  assert.equal(p1.temMais, true);

  const todas = [...p1.mensagens];
  let cursor = p1.proximoCursor;
  let paginas = 1;
  while (cursor) {
    const p = (await req(`/conversas/${conv}/mensagens?antesDe=${encodeURIComponent(cursor)}`, { token: autor.token })).dados;
    todas.unshift(...p.mensagens);
    cursor = p.proximoCursor;
    paginas++;
    if (!p.temMais) assert.equal(p.proximoCursor, null); // CA-C09
  }
  assert.equal(paginas, 4);
  assert.deepEqual(todas.map((m) => m.texto), docs.map((d) => d.texto)); // CA-C08: sem repetir nem pular, CA-C13/C14

  const denovo = (await req(`/conversas/${conv}/mensagens`, { token: autor.token })).dados;
  assert.deepEqual(denovo.mensagens.map((m) => m.id), p1.mensagens.map((m) => m.id)); // ordem estável
});

test('CA-C10/C12/RA05/RA06/RA07: lida, conversa privada única, exclusão e privacidade', async () => {
  const a = ctx.jogadores[7];
  const b = ctx.jogadores[8];
  const c1 = (await req('/conversas/privada', { token: a.token, metodo: 'POST', corpo: { usuarioId: b.id } })).dados;
  const c2 = (await req('/conversas/privada', { token: b.token, metodo: 'POST', corpo: { usuarioId: a.id } })).dados;
  assert.equal(c1.id, c2.id); // CA-C12

  const sA = await conectarSocket(a);
  const env = await emitir(sA, 'mensagem:enviar', { conversaId: c1.id, texto: 'carona?' });
  let listaB = (await req('/conversas', { token: b.token })).dados;
  assert.equal(listaB.find((c) => c.id === c1.id).naoLidas, 1);
  await req(`/conversas/${c1.id}/lida`, { token: b.token, metodo: 'POST' });
  listaB = (await req('/conversas', { token: b.token })).dados;
  assert.equal(listaB.find((c) => c.id === c1.id).naoLidas, 0); // CA-C10

  const org = await req(`/conversas/${c1.id}/mensagens`, { token: ctx.org.token });
  assert.equal(org.status, 403); // RA07

  const naoPode = await req(`/mensagens/${env.dados.id}`, { token: b.token, metodo: 'DELETE' });
  assert.equal(naoPode.status, 403);
  const apagou = await req(`/mensagens/${env.dados.id}`, { token: a.token, metodo: 'DELETE' });
  assert.equal(apagou.dados.excluida, true); // RA06
  assert.equal(apagou.dados.texto, '');

  const comEstranho = await req('/conversas/privada', { token: a.token, metodo: 'POST', corpo: { usuarioId: ctx.estranho.id } });
  assert.equal(comEstranho.status, 403); // RA05
});

test('CA-C11/RA04: removido do grupo perde acesso ao chat', async () => {
  const alvo = ctx.jogadores[9];
  const s = await conectarSocket(alvo);
  const removida = esperarEvento(s, 'conversa:removida', (d) => d.conversaId === ctx.conversaGrupo);
  const r = await req(`/grupos/${ctx.grupoId}/membros/${alvo.id}`, { token: ctx.org.token, metodo: 'DELETE' });
  assert.equal(r.status, 204);
  await removida;
  const hist = await req(`/conversas/${ctx.conversaGrupo}/mensagens`, { token: alvo.token });
  assert.equal(hist.status, 403);
  const lista = (await req('/conversas', { token: alvo.token })).dados;
  assert.ok(!lista.some((c) => c.id === ctx.conversaGrupo));
});

test('RA09: limite de 20 mensagens por minuto', async () => {
  const s = await conectarSocket(ctx.jogadores[10]);
  let recusada = null;
  for (let i = 0; i < 21; i++) {
    const r = await emitir(s, 'mensagem:enviar', { conversaId: ctx.conversaGrupo, texto: `spam ${i}` });
    if (!r.ok) recusada = r;
  }
  assert.equal(recusada?.status, 429);
});
