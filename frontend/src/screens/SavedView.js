import React, { useState } from "react";
import { useStore } from "@/olabs/store";
import { TopBar } from "@/olabs/Shell";
import { Card, Empty, ViewTabs } from "@/olabs/ui";
import { BoardGroup, Kanban, CalendarMonth } from "./Board";
import { KIND_SEGMENTS, byDue, daysFrom, fmtDay, weekRange } from "@/olabs/utils";

const TABS = [
  { id: "table", label: "Tabela", icon: "table-2" },
  { id: "kanban", label: "Kanban", icon: "square-kanban" },
  { id: "calendar", label: "Calendário", icon: "calendar" },
];

export default function SavedViewScreen({ kind }) {
  const { demands, isDone, stageOf, me, activeProjects } = useStore();
  const [view, setView] = useState("table");
  const open = demands.filter((d) => !isDone(d));
  const [ws, we] = weekRange();
  let list, title, subtitle, groups;
  if (kind === "mine") {
    list = open.filter((d) => d.resp_id === me.id).sort(byDue);
    title = "Atribuídas a mim";
    subtitle = `${list.length} demandas abertas em que você é responsável, em todos os projetos`;
    groups = [
      { id: "late", name: "Atrasadas", color: "coral", test: (d) => d.due && daysFrom(d.due) < 0 },
      { id: "today", name: "Vencem hoje", color: "amber", test: (d) => d.due && daysFrom(d.due) === 0 },
      { id: "week", name: "Próximos 7 dias", color: "sky", test: (d) => d.due && daysFrom(d.due) > 0 && daysFrom(d.due) <= 7 },
      { id: "later", name: "Mais tarde", color: "slate", test: (d) => d.due && daysFrom(d.due) > 7 },
      { id: "nodue", name: "Sem prazo", color: "slate", test: (d) => !d.due },
    ].map((g) => ({ ...g, addable: false, items: list.filter(g.test) }));
  } else {
    list = open.filter((d) => d.due && d.due >= ws && d.due <= we).sort(byDue);
    title = "Vencem esta semana";
    subtitle = `${list.length} demandas com prazo entre ${fmtDay(ws)} e ${fmtDay(we)}, de todo o time`;
    groups = activeProjects.map((p) => ({ id: p.id, name: p.name, color: p.color, addable: false, project: p, items: list.filter((d) => d.project_id === p.id) }));
  }
  groups = groups.filter((g) => g.items.length);
  return (
    <div className="ol-screen">
      <TopBar title={title} subtitle={subtitle} />
      <div className="ol-toolbar">
        <ViewTabs items={TABS} value={view} onChange={setView} />
        <div className="ol-toolbar__right"><span className="ol-muted">{kind === "mine" ? "Agrupado por prazo" : "Agrupado por projeto"}</span></div>
      </div>
      {list.length === 0 ? (
        <Card><Empty icon={kind === "mine" ? "square-check-big" : "calendar-clock"} title={kind === "mine" ? "Nenhuma demanda aberta com você" : "Nada vence esta semana"}
          text={kind === "mine" ? "As demandas em que você é responsável aparecem aqui, de todos os projetos." : "Demandas abertas com prazo nesta semana aparecem aqui."} /></Card>
      ) : view === "table" ? (
        <div className="ol-groups">
          {groups.map((g) => <BoardGroup key={g.id} group={g} items={g.items} project={g.project} showProject={kind === "mine"} collapsed={false} onToggle={() => {}} />)}
        </div>
      ) : view === "kanban" ? (
        <Kanban showProject columns={KIND_SEGMENTS.map((k) => ({ id: k.kind, stage: { name: k.name, color: k.color }, items: list.filter((d) => stageOf(d).kind === k.kind) }))} />
      ) : (
        <Card pad={false} className="ol-calcard"><CalendarMonth demands={list} /></Card>
      )}
    </div>
  );
}
