# Olabs — Plano de execução (plan.md)

## 1) Objectives
- Converter o protótipo `olabs.html` em um sistema funcional multiusuário (e-mail/senha) mantendo fielmente o visual/UX do HTML.
- Entregar o fluxo central completo: **Projeto → Demandas → Anexos reais (upload/download) → Comentários → Mudança de etapa**.
- Começar vazio (sem seed) e permitir que usuários se conectem (contatos/invites) para serem adicionados em projetos.
- Remover integrações “fake” (Trello/Drive/e-mail digest) e manter apenas o que for realmente funcional no MVP.

## 2) Implementation Steps

### Phase 1 — POC do Core (isolado) 
**Core mais arriscado:** upload/download autenticado de arquivos via Object Storage (integração externa) + persistência Mongo.

User stories (POC)
1. Como usuário autenticado, quero enviar um arquivo e receber um `file_id` para anexar na demanda.
2. Como usuário autenticado, quero baixar o mesmo arquivo usando `file_id` e validar integridade.
3. Como usuário, quero que um arquivo “deletado” (soft delete) não apareça mais na listagem.
4. Como usuário, quero que o backend rejeite upload acima do limite (ex.: 20MB).
5. Como usuário, quero que o download seja negado se eu não for membro do projeto da demanda.

Passos
- (Websearch) Revisar melhores práticas de “authenticated file streaming + Mongo reference” em FastAPI (range requests opcionais).
- Criar script Python minimal (fora do app) para:
  - `init_storage()` + PUT object + GET object (usando playbook emergent objstore).
  - Validar Content-Type, size, e fallback de `init_storage(force=True)` em caso de 404 key.
- Implementar endpoints mínimos no backend (FastAPI) com auth mock temporária **ou** um token fixo só para o POC.
- Testar: upload→persistir doc Mongo→download→soft delete→download 404.
- Só avançar após POC 100% verde.

### Phase 2 — V1 App Development (sem auth completa primeiro)
Foco: entregar o produto utilizável com o visual do protótipo e o core já provado; **auth completa fica para Phase 4**.

User stories (V1)
1. Como usuário, quero criar um projeto com etapas e grupos para organizar demandas.
2. Como usuário, quero criar/editar demanda (título, descrição, responsável, solicitante, prioridade, tags, prazo).
3. Como usuário, quero visualizar demandas em Tabela/Kanban/Calendário e abrir o drawer de detalhes.
4. Como usuário, quero anexar arquivos reais à demanda e vê-los no drawer e na aba Arquivos do projeto.
5. Como usuário, quero comentar na demanda e ver o histórico no drawer.

Backend (MVP)
- Modelagem Mongo (collections): users (ainda sem login), contacts/invites, projects, demands, comments, files, settings.
- CRUD básico:
  - Projects: create/list/update (fav, archive), members.
  - Demands: create/list/update (stage, due, prio, tags, group, resp/solic), list por views (mine/week).
  - Comments: add/list por demand.
  - Files: upload ligado a `demand_id`, list por project/demand, download por `file_id`.
- Regras de acesso (MVP): workspace single-tenant; autorização baseada em membership do projeto.

Frontend (MVP)
- Substituir o app “splash” pelo app Olabs, usando CSS/ícones extraídos do HTML.
- Reimplementar componentes/telas principais preservando a UI:
  - Sidebar, Topbar (search UI apenas), Home, Board (tabs table/kanban/calendar/files), Projects, Team, Settings, Profile.
  - Drawer de demanda + Modal de nova demanda + Modal de novo projeto.
- Conectar com backend via `axios` e `react-query`.
- Estado: puxar do backend (sem dados hardcoded), começar vazio com empty-states.

Checkpoint de teste (final Phase 2)
- Rodar 1 rodada de E2E com testing agent: criar projeto → criar demanda → mudar etapa → comentar → anexar arquivo → baixar arquivo → ver arquivos do projeto.

### Phase 3 — Features adicionais (produção leve)
User stories (Phase 3)
1. Como usuário, quero convidar pessoas por e-mail e elas virarem contato quando criarem conta.
2. Como usuário, quero adicionar/remover membros em projetos para controlar acesso.
3. Como usuário, quero configurar tags e etapas padrão do espaço.
4. Como usuário, quero ver notificações in-app (atribuído/comentário/@mention/prazo amanhã).
5. Como usuário, quero filtros mínimos na tabela (por etapa, por responsável, por tag principal).

Passos
- Implementar sistema de invites/contatos:
  - “Adicionar contato por e-mail” cria invite pendente se usuário não existir.
  - Ao signup, auto-conectar convites recebidos.
  - Permitir copiar link de convite (token) opcional.
- Implementar settings reais (stages default, tags) e aplicar ao criar projeto.
- Notificações in-app:
  - armazenar events e preferências; marcar lidas.
  - gatilhos: atribuição, comentário, menção simples via regex `@nome`.
- Rodar 1 rodada de E2E com testing agent.

### Phase 4 — Autenticação (e-mail/senha) + hardening
User stories (Phase 4)
1. Como usuário, quero criar conta com e-mail e senha.
2. Como usuário, quero login/logout e persistência de sessão.
3. Como usuário, quero trocar minha senha.
4. Como usuário, quero que meus dados estejam isolados por permissões de projeto.
5. Como admin do projeto, quero promover/remover membros do projeto.

Passos
- JWT (access + opcional refresh), bcrypt; middleware de auth.
- Ajustar endpoints para exigir auth; atualizar frontend para fluxo de login.
- Revisar segurança de downloads: sempre validar membership antes de servir bytes.
- Rodar rodada final de E2E.

## 3) Next Actions
1. Implementar e rodar o **script POC** do Object Storage (PUT/GET) e registrar resultado.
2. Criar endpoints mínimos de `files/upload` e `files/{id}/download` (com validação de size e soft delete).
3. Definir schemas Mongo e migrations iniciais (coleções vazias) + endpoints CRUD essenciais de projects/demands/comments.
4. Substituir `frontend/src/App.js` pelo app Olabs (rotas hash) e integrar com backend.
5. Executar teste E2E do V1 (Phase 2) e iterar até ficar estável.

## 4) Success Criteria
- Visual do app corresponde ao protótipo (layout, componentes e temas) e inicia vazio com empty-states claros.
- Fluxo core funciona end-to-end: projeto + demanda + upload/download de anexos + comentários + mudança de etapa.
- Arquivos são reais (Object Storage), com referências no Mongo e soft delete.
- Views principais funcionam: Board (Tabela/Kanban/Calendário/Arquivos) e drawer.
- Após Phase 4, login e permissões por projeto impedem acesso indevido a demandas/anexos.
