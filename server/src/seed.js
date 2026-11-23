// Popula o banco com dados de demonstração para a apresentação.
// Uso: npm run seed   (APAGA os dados atuais do banco "borapelada")
import bcrypt from 'bcryptjs';
import { conectar, col, desconectar } from './db.js';
import * as chat from './services/chat.js';

const SENHA = '123456';
const pessoas = [
  ['Bernardo Torres', 'bernardo@borapelada.com', 'meia', 4],
  ['Kaue Cavalcante', 'kaue@borapelada.com', 'atacante', 4],
  ['Lucas Andrade', 'lucas@borapelada.com', 'goleiro', 3],
  ['Pedro Lima', 'pedro@borapelada.com', 'zagueiro', 3],
  ['Rafael Costa', 'rafael@borapelada.com', 'lateral', 2],
  ['João Victor', 'joao@borapelada.com', 'volante', 5],
  ['Matheus Rocha', 'matheus@borapelada.com', 'atacante', 3],
  ['Gabriel Melo', 'gabriel@borapelada.com', 'meia', 2],
  ['Thiago Nunes', 'thiago@borapelada.com', 'zagueiro', 4],
  ['Felipe Barros', 'felipe@borapelada.com', 'goleiro', 3],
  ['André Souza', 'andre@borapelada.com', 'lateral', 1],
  ['Diego Alves', 'diego@borapelada.com', 'volante', 3],
  ['Caio Ferreira', 'caio@borapelada.com', 'atacante', 5],
  ['Vinícius Dias', 'vinicius@borapelada.com', 'meia', 2],
  ['Bruno Santos', 'bruno@borapelada.com', 'zagueiro', 3],
  ['Igor Pacheco', 'igor@borapelada.com', 'atacante', 2],
];

async function seed() {
  await conectar();
  for (const c of ['usuarios', 'grupos', 'jogos', 'conversas', 'mensagens', 'notificacoes']) {
    await col(c).deleteMany({});
  }

  const hash = await bcrypt.hash(SENHA, 10);
  const usuarios = [];
  for (const [nome, email, posicao] of pessoas) {
    const u = { nome, email, senhaHash: hash, posicao, criadoEm: new Date() };
    u._id = (await col('usuarios').insertOne(u)).insertedId;
    usuarios.push(u);
  }
  const [bernardo, kaue] = usuarios;

  // Grupo organizado pelo Bernardo
  const grupo = {
    nome: 'Pelada de Quinta - Ponta Verde',
    organizadorId: bernardo._id,
    membros: [{ usuarioId: bernardo._id, nome: bernardo.nome, posicao: bernardo.posicao, papel: 'organizador', nivel: pessoas[0][3], entrouEm: new Date() }],
    criadoEm: new Date(),
  };
  grupo._id = (await col('grupos').insertOne(grupo)).insertedId;
  await chat.criarConversaDoGrupo(grupo, { id: bernardo._id, nome: bernardo.nome });

  for (let i = 1; i < usuarios.length; i++) {
    const u = usuarios[i];
    await col('grupos').updateOne({ _id: grupo._id }, {
      $push: { membros: { usuarioId: u._id, nome: u.nome, posicao: u.posicao, papel: 'membro', nivel: pessoas[i][3], entrouEm: new Date() } },
    });
    await chat.adicionarAoChatDoGrupo(grupo._id, { id: u._id, nome: u.nome });
  }

  // Jogo na próxima quinta às 20h, com 14 vagas e 12 confirmados
  const data = new Date();
  data.setDate(data.getDate() + ((4 - data.getDay() + 7) % 7 || 7));
  data.setHours(20, 0, 0, 0);
  const confirmados = usuarios.slice(0, 12).map((u, i) => ({ usuarioId: u._id, nome: u.nome, em: new Date(Date.now() + i * 1000), pagou: i < 5 }));
  const jogoId = (await col('jogos').insertOne({
    grupoId: grupo._id, dataHora: data, local: 'Society Ponta Verde - Quadra 2', vagas: 14, valor: 15,
    confirmados, espera: [], criadoPor: bernardo._id, criadoEm: new Date(),
  })).insertedId;
  await chat.enviarMensagemSistemaNoGrupo(grupo._id, 'jogo_criado',
    `⚽ Jogo marcado: quinta, ${data.toLocaleDateString('pt-BR')}, 20h — Society Ponta Verde - Quadra 2. 14 vagas. R$ 15,00 por pessoa.`,
    { jogoId: String(jogoId) });

  // Conversa do grupo
  const fala = async (u, texto) => {
    const conv = await col('conversas').findOne({ tipo: 'grupo', grupoId: grupo._id });
    await chat.enviarMensagem({ id: u._id, nome: u.nome }, { conversaId: String(conv._id), texto });
    await new Promise((r) => setTimeout(r, 15));
  };
  await fala(bernardo, 'Fala, galera! Jogo marcado pra quinta. Confirmem pelo app 👊');
  await fala(usuarios[5], 'Confirmado! Alguém tem bola nova?');
  await fala(kaue, 'Eu levo a bola.');
  await fala(usuarios[2], 'Vou no gol de novo, sem problema.');
  await fala(usuarios[12], 'Faltam 2 vagas, chamem o pessoal!');

  // Conversa privada Bernardo ↔ Kaue
  const priv = await chat.abrirConversaPrivada({ id: bernardo._id, nome: bernardo.nome }, String(kaue._id));
  await chat.enviarMensagem({ id: kaue._id, nome: kaue.nome }, { conversaId: priv.id, texto: 'Bernardo, me dá uma carona na quinta?' });
  await new Promise((r) => setTimeout(r, 15));
  await chat.enviarMensagem({ id: bernardo._id, nome: bernardo.nome }, { conversaId: priv.id, texto: 'Dou sim, passo aí 19h30.' });

  // Segundo grupo (organizado pelo Kaue), para mostrar vários grupos
  const grupo2 = {
    nome: 'Racha do Sábado - Jatiúca',
    organizadorId: kaue._id,
    membros: [{ usuarioId: kaue._id, nome: kaue.nome, posicao: kaue.posicao, papel: 'organizador', nivel: 4, entrouEm: new Date() }],
    criadoEm: new Date(),
  };
  grupo2._id = (await col('grupos').insertOne(grupo2)).insertedId;
  await chat.criarConversaDoGrupo(grupo2, { id: kaue._id, nome: kaue.nome });
  await col('grupos').updateOne({ _id: grupo2._id }, {
    $push: { membros: { usuarioId: bernardo._id, nome: bernardo.nome, posicao: bernardo.posicao, papel: 'membro', nivel: 3, entrouEm: new Date() } },
  });
  await chat.adicionarAoChatDoGrupo(grupo2._id, { id: bernardo._id, nome: bernardo.nome });

  console.log('\n✅ Dados de demonstração criados!');
  console.log(`   Senha de todos os usuários: ${SENHA}`);
  console.log('   Organizador: bernardo@borapelada.com');
  console.log('   Jogador:     kaue@borapelada.com');
  console.log('   Outros:      lucas@, pedro@, rafael@ ... (@borapelada.com)\n');
  await desconectar();
}

seed().catch(async (e) => {
  console.error('Erro no seed:', e.message);
  await desconectar();
  process.exit(1);
});
