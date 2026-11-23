# ⚽ BoraPelada

App web para organizar peladas de futebol amador. Com ele, o grupo pode:

- marcar jogos e confirmar presença, com **lista de espera automática**;
- sortear **times equilibrados**;
- **conversar** no chat do grupo ou no privado, com as mensagens guardadas no **MongoDB**.

![Testes](../../actions/workflows/testes.yml/badge.svg)

## 📄 Documentação e acompanhamento

- **[PRD: Documento de Requisitos do Produto](docs/PRD.md)**
- **GitHub Project:** `[cole aqui o link do Project]`

## 👥 Integrantes

| Integrante | Papel |
|---|---|
| Bernardo Torres de Souza | Product Owner, Documentação e Front-end/UX |
| Kaue Cavalcante | Back-end, Banco de dados e Chat |

---

## 🚀 Como rodar (local)

### Opção 1: Docker (recomendado, um comando só)

Pré-requisito: [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e aberto.

```bash
git clone https://github.com/bernardots23/borapelada.git
cd borapelada
docker compose up --build
```

Quando aparecer `BoraPelada rodando em http://localhost:3001`, abra outro terminal e carregue os dados de demonstração:

```bash
docker compose exec app npm run seed
```

Acesse **http://localhost:3001**.

Para parar: `Ctrl + C`, ou `docker compose down`. Os dados continuam salvos no volume do Docker.

### Opção 2: Node.js + MongoDB instalados na máquina

Pré-requisitos: Node.js 20 ou superior e MongoDB 6 ou superior rodando em `localhost:27017`. Também funciona com um cluster gratuito do MongoDB Atlas.

```bash
npm run instalar                       # instala raiz, server e web
cp server/.env.example server/.env     # ajuste MONGO_URL se precisar
npm run seed                           # dados de demonstração (opcional)
npm run dev                            # API em :3001 + front em :5173
```

Acesse **http://localhost:5173**.

### 👤 Contas de demonstração (depois do `seed`)

A senha de todas as contas é **`123456`**.

| E-mail | Perfil |
|---|---|
| `bernardo@borapelada.com` | Organizador do grupo "Pelada de Quinta - Ponta Verde" |
| `kaue@borapelada.com` | Jogador do grupo e organizador do grupo "Racha do Sábado" |
| `lucas@`, `pedro@`, `rafael@`, `joao@`, `caio@`… `@borapelada.com` | Outros jogadores |

> 💡 **Para testar o chat em tempo real:** abra o app em duas janelas, sendo uma delas anônima, e entre com contas diferentes.

---

## ✅ Funcionalidades (MVP do PRD)

| Requisito | O que faz |
|---|---|
| RF01–RF02 | Cadastro e login com JWT. Senha guardada com hash bcrypt. |
| RF03–RF06 | Grupos, link de convite válido por 7 dias, remover membro e sair do grupo |
| RF07 | Criar jogo. Uma mensagem automática é enviada no chat do grupo. |
| RF08–RF10 | Confirmar ou cancelar presença. Lista de espera com promoção automática e controle atômico da última vaga. |
| **RF11** | **Chat do grupo**, criado junto com o grupo |
| **RF12** | **Chat privado** entre membros que dividem um grupo, com no máximo uma conversa por par |
| **RF13** | **Histórico paginado** por cursor (30 por página), em ordem cronológica |
| **RF14** | **Lista de conversas** ordenada pela mais recente, com contador de não lidas |
| RF15–RF16 | Nível de 1 a 5 (visível só para o organizador) e sorteio de 2 a 4 times equilibrados |
| RF17 | Notificações no app: vaga aberta, novo jogo e nova mensagem |
| RF18 | Controle de quem pagou a quadra |
| RNF05 | Exclusão de conta (LGPD): `DELETE /api/auth/eu` |

## 💬 Chat com MongoDB

O PRD detalha o chat na seção 5. Resumo:

- **Coleções:** `conversas` (tipo `grupo` ou `privada`, participantes e não lidas) e `mensagens` (um documento por mensagem).
- **Índices:**
  - `{conversaId, enviadaEm, _id}` para o histórico paginado;
  - `{conversaId, idCliente}` único, contra mensagens duplicadas;
  - `{chavePrivada}` único, para ter uma só conversa privada por par;
  - `{participantesIds, atualizadaEm}` para a lista de conversas.
- **Tempo real:** Socket.IO autenticado com JWT.

| Evento | Direção | Uso |
|---|---|---|
| `conversa:entrar` / `conversa:sair` | cliente → servidor | Entra ou sai da sala da conversa (só participantes) |
| `mensagem:enviar` | cliente → servidor | `{ conversaId, texto, idCliente }`, com resposta (ack) |
| `conversa:lida` | cliente → servidor | Zera as não lidas |
| `mensagem:nova` / `mensagem:apagada` | servidor → cliente | Para quem está com a conversa aberta |
| `conversa:atualizada` / `conversa:removida` | servidor → cliente | Atualiza a lista de conversas |
| `notificacao:nova`, `jogo:atualizado` | servidor → cliente | Notificações e listas de presença ao vivo |

**Rotas REST do chat:**

```
GET    /api/conversas                          lista de conversas
POST   /api/conversas/privada  {usuarioId}     abre ou cria conversa privada
GET    /api/conversas/:id/mensagens?antesDe=   histórico paginado
POST   /api/conversas/:id/mensagens  {texto}   envio (alternativa ao socket)
POST   /api/conversas/:id/lida                 marca como lida
DELETE /api/mensagens/:id                      apaga mensagem (autor ou organizador)
```

## 🧪 Testes

```bash
npm test                  # unitários: sorteio de times (CA06.1 a CA06.3)
npm run test:integracao   # integração: precisa do MongoDB rodando
```

Os testes de integração sobem a API e o Socket.IO e usam o banco `borapelada_teste`. Eles verificam os critérios de aceitação do PRD:

- HU01 a HU06;
- **CA-C01 a CA-C16:** envio, validação, acesso, duplicidade, paginação, ordenação, não lidas e remoção;
- limite de envio (RA09).

O **GitHub Actions** (`.github/workflows/testes.yml`) roda tudo automaticamente com um MongoDB real a cada push.

## 🗂️ Estrutura

```
borapelada/
├── docs/PRD.md               Documento de requisitos
├── server/                   API Node.js + Express + Socket.IO
│   ├── src/
│   │   ├── routes/           auth, grupos, jogos, conversas, notificações
│   │   ├── services/         chat.js (regras do chat), times.js, notificacoes.js
│   │   ├── socket.js         eventos em tempo real
│   │   ├── db.js             conexão e índices do MongoDB
│   │   └── seed.js           dados de demonstração
│   └── test/                 testes unitários e de integração
├── web/                      Front-end React + Vite
│   └── src/paginas/          Entrar, Início, Grupo, Jogo, Conversas, Conversa, Convite
├── scripts/criar_issues.sh   Cadastra o backlog como issues no GitHub
├── Dockerfile
└── docker-compose.yml
```

## 🛠️ Stack

React 18 + Vite · Node.js 22 + Express · Socket.IO 4 · MongoDB 7 · JWT + bcrypt · Docker Compose

---

Ciência da Computação, Centro Universitário de Maceió (UNIMA/Afya), 2026.
