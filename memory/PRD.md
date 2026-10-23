# Olabs — Back office de demandas (PRD)
Origem: protótipo HTML estático `olabs.html` transformado em sistema funcional (React + FastAPI + MongoDB).
## Escolhas do usuário
- Login e-mail/senha; cada pessoa cria a própria conta e adiciona outras por e-mail (contatos/convites) para incluí-las em projetos.
- Anexos reais (Emergent Object Storage): upload, download, soft delete.
- Começar vazio (sem dados de exemplo).
## Implementado (v1)
- Auth (registro, login, troca de senha), perfil com foto, cor do avatar.
- Equipe: adicionar por e-mail (conecta na hora ou gera convite pendente que conecta no cadastro), copiar link, cancelar, remover; carga por pessoa, entregas no mês, online.
- Projetos: criar (etapas padrão / copiar de outro / do zero), sigla, cor, pessoas; favoritar; arquivar/restaurar; excluir; papéis admin/membro por projeto.
- Quadro: Tabela (grupos, recolher, seleção em massa: mover etapa/atribuir/excluir, agrupar por grupo/etapa/responsável), Kanban (arrastar entre etapas), Calendário (navegação de mês, criar no dia), Arquivos (filtros, enviar). Busca, filtros, ordenação, editar etapas, grupos.
- Demanda: drawer com stepper de etapas, campos editáveis, descrição, anexos (arrastar e soltar), comentários com @menção, copiar link, excluir.
- Início: saudação, minhas demandas, criação rápida, resumo da semana (donut + barras reais), vencem hoje, projetos recentes, atividade.
- Visões salvas: Atribuídas a mim (por prazo), Vencem esta semana (por projeto) em tabela/kanban/calendário.
- Notificações in-app (atribuição, comentários/etapa, menções, prazo amanhã) com preferências; busca global ⌘K; tema claro/escuro.
## Removido do protótipo (não funcional/sem pedido): integrações Trello/Google Drive, resumo por e-mail.
## Backlog
- E-mail real de convite/avisos; anexar do Google Drive; relatórios; campos personalizados.
