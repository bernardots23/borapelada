#!/usr/bin/env bash
# Cria os rótulos, os marcos (etapas) e as issues do backlog do BoraPelada.
# Pré-requisitos: GitHub CLI instalado e logado (gh auth login),
# executado dentro da pasta do repositório já publicado no GitHub.
#
# Antes de rodar, troque os usuários do GitHub abaixo:
BERNARDO="usuario-github-do-bernardo"
KAUE="usuario-github-do-kaue"
DEV2="$KAUE"   # back-end
DEV3="$KAUE"   # banco/chat
DEV4="$BERNARDO" # front-end

set -e

echo "== Rótulos =="
gh label create P0 --color B60205 --description "Obrigatório no MVP" --force
gh label create P1 --color FBCA04 --description "Alto valor" --force
gh label create P2 --color 0E8A16 --description "Desejável" --force
for area in docs backend frontend chat banco; do
  gh label create "$area" --color 1D76DB --force
done

echo "== Marcos (etapas) =="
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
criar_marco () {
  gh api "repos/$REPO/milestones" -f title="$1" -f due_on="$2" >/dev/null 2>&1 || echo "Marco '$1' já existe"
}
criar_marco "Etapa 1 - Planejamento"   "2026-11-30T23:59:59Z"
criar_marco "Etapa 2 - Base e jogos"   "2026-12-14T23:59:59Z"
criar_marco "Etapa 3 - Chat (NoSQL)"   "2026-12-28T23:59:59Z"
criar_marco "Etapa 4 - Finalização"    "2027-01-11T23:59:59Z"

echo "== Issues =="
issue () { # titulo | corpo | labels | responsavel | marco
  gh issue create --title "$1" --body "$2" --label "$3" --assignee "$4" --milestone "$5"
}

E1="Etapa 1 - Planejamento"; E2="Etapa 2 - Base e jogos"; E3="Etapa 3 - Chat (NoSQL)"; E4="Etapa 4 - Finalização"

issue "Escrever e publicar o PRD" "Publicar o PRD em docs/PRD.md e linkar no README. Ver docs/PRD.md." "P0,docs" "$BERNARDO" "$E1"
issue "Criar repositório, README e GitHub Project" "Repositório público, README com link do PRD e Project com colunas A fazer / Em andamento / Em revisão / Concluído." "P0,docs" "$BERNARDO" "$E1"
issue "Protótipo das telas principais" "Protótipo no Figma das 6 telas do MVP (PRD, seção 6.2)." "P0,frontend" "$DEV4" "$E1"
issue "Modelagem do banco NoSQL" "Coleções usuarios, conversas e mensagens, e índices (PRD, seção 5.4)." "P0,banco,chat" "$DEV3" "$E1"
issue "Configurar projeto base" "Front (React + Vite), back (Node + Express) e conexão com o MongoDB Atlas." "P0,backend" "$DEV2" "$E2"
issue "Cadastro e login com JWT (RF01, RF02)" "Senha com bcrypt, token JWT. Ver RNF03 e RNF04." "P0,backend" "$DEV2" "$E2"
issue "Criar grupo e convite por link (RF03 a RF06)" "Critérios: HU01 e HU02." "P0,backend" "$DEV2" "$E2"
issue "Criar jogo (RF07)" "Critérios: HU03. Inclui a mensagem automática no chat do grupo." "P0,backend" "$DEV2" "$E2"
issue "Presença e lista de espera (RF08 a RF10)" "Critérios: HU04 e HU05. Atualização atômica na última vaga." "P0,backend" "$DEV2" "$E2"
issue "Telas de grupo, jogo e lista de presença" "Implementar as telas 2, 3 e 4 do protótipo." "P0,frontend" "$DEV4" "$E2"
issue "Servidor de chat com Socket.IO" "Autenticação JWT no socket e uma sala (room) por conversa." "P0,chat" "$DEV3" "$E3"
issue "Chat do grupo: envio e histórico paginado (RF11, RF13)" "Critérios: CA-C01 a CA-C09, CA-C13, CA-C14 e CA-C16." "P0,chat,banco" "$DEV3" "$E3"
issue "Chat privado (RF12)" "Critérios: CA-C12 e regras RA05 e RA07." "P0,chat" "$DEV3" "$E3"
issue "Lista de conversas e não lidas (RF14)" "Critérios: CA-C06, CA-C10 e CA-C15." "P0,chat" "$DEV3" "$E3"
issue "Tela do chat" "Implementar as telas 5 e 6: lista de conversas e conversa." "P0,frontend,chat" "$DEV4" "$E3"
issue "Nível dos jogadores e sorteio de times (RF15, RF16)" "Critérios: HU06." "P1,backend" "$DEV2" "$E4"
issue "Notificações no app (RF17)" "Vaga aberta (CA05.2) e nova mensagem." "P1,chat" "$DEV3" "$E4"
issue "Testes dos critérios de aceitação" "Roteiro de testes cobrindo todos os critérios do PRD." "P1,docs" "$BERNARDO" "$E4"
issue "Configuração local com Docker Compose" "Dockerfile + docker-compose (MongoDB + app) e seed de demonstração. Deploy opcional no Render + Atlas." "P1,backend" "$DEV2" "$E4"
issue "Controle de pagamento (RF18)" "Marcar quem pagou o jogo. Item cortável." "P2,frontend" "$DEV4" "$E4"

echo "Pronto! Agora adicione as issues ao Project (veja o passo a passo no GUIA)."
