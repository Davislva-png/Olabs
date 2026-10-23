import React, { useState } from "react";
import { toast } from "sonner";
import api, { errMsg } from "@/lib/api";
import { useStore } from "@/olabs/store";
import { TopBar, useNav } from "@/olabs/Shell";
import { AvatarStack, Button, Card, Icon, IconButton, ProjectTile, StageBar } from "@/olabs/ui";
import { NewProjectModal, ProjectSettingsModal } from "@/olabs/modals";
import { fmtDay, stageSegments, timeAgo, isoDay } from "@/olabs/utils";

export default function ProjectsScreen() {
  const { projects, activeProjects, allDemands, isDone, person, setProjects, refreshProjects } = useStore();
  const { nav, query } = useNav();
  const [settings, setSettings] = useState(null);
  const showNew = query.novo === "1";
  const archived = projects.filter((p) => p.archived);
  const sorted = [...activeProjects].sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0));
  const fav = async (p) => { const r = await api.post(`/projects/${p.id}/favorite`); setProjects((ps) => ps.map((x) => (x.id === p.id ? r.data : x))); };
  const restore = async (p) => {
    try { await api.post(`/projects/${p.id}/restore`); await refreshProjects(); toast.success(`${p.name} restaurado`); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="ol-screen">
      <TopBar title="Projetos" subtitle={`${activeProjects.length} ativos · ${archived.length} arquivados`} />
      <div className="ol-projgrid">
        {sorted.map((p) => {
          const ds = allDemands.filter((d) => d.project_id === p.id);
          const open = ds.filter((d) => !isDone(d)).length;
          return (
            <article key={p.id} className="ol-projcard" data-testid={`project-card-${p.name}`}>
              <header>
                <ProjectTile project={p} size={44} />
                <div className="ol-projcard__name"><h3>{p.name}</h3><span>{p.stages.length} etapas · {p.groups.length} {p.groups.length === 1 ? "grupo" : "grupos"}</span></div>
                <IconButton icon="star" label={p.fav ? "Remover dos favoritos" : "Favoritar"} variant="ghost" size="sm" active={p.fav} className="ol-favbtn" onClick={() => fav(p)} data-testid={`fav-${p.name}`} />
                <IconButton icon="ellipsis" label="Opções" variant="ghost" size="sm" onClick={() => setSettings(p)} />
              </header>
              <p>{p.desc || "Sem descrição."}</p>
              <StageBar segments={stageSegments(p.stages, ds)} height={8} />
              <footer>
                <AvatarStack people={p.members.map((m) => person(m.user_id)).filter(Boolean)} size={28} />
                <span className="ol-projcard__meta">{open} abertas · {timeAgo(p.updated_at)}</span>
                <Button size="sm" iconRight="arrow-up-right" onClick={() => nav("board", { projectId: p.id })} data-testid={`open-board-${p.name}`}>Abrir quadro</Button>
              </footer>
            </article>
          );
        })}
        <button type="button" className="ol-projcard ol-projcard--new" onClick={() => nav("projects", { query: { novo: 1 } })} data-testid="new-project-card">
          <span className="ol-projcard__plus"><Icon name="folder-plus" size={22} /></span>
          <b>Novo projeto</b>
          <span>Do zero ou copiando as etapas de outro</span>
        </button>
      </div>
      <Card title="Arquivados" subtitle="Somem da barra lateral, mas as demandas continuam guardadas.">
        {archived.length === 0 ? <p className="ol-muted" style={{ margin: 0 }}>Nenhum projeto arquivado.</p> : (
          <div className="ol-archived">
            {archived.map((p) => (
              <div key={p.id} className="ol-archived__row">
                <ProjectTile project={{ ...p, color: "slate" }} size={32} />
                <b>{p.name}</b>
                <span>{allDemands.filter((d) => d.project_id === p.id).length} demandas</span>
                <span>Arquivado em {fmtDay(isoDay(p.archived_at))}</span>
                {p.my_role === "admin" ? <Button size="sm" variant="ghost" icon="refresh-cw" onClick={() => restore(p)} data-testid={`restore-${p.name}`}>Restaurar</Button> : <span />}
              </div>
            ))}
          </div>
        )}
      </Card>
      {showNew && <NewProjectModal onClose={() => nav("projects")} />}
      {settings && <ProjectSettingsModal project={projects.find((p) => p.id === settings.id) || settings} onClose={() => setSettings(null)} />}
    </div>
  );
}
