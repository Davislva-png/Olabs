import React from "react";
import { useStore } from "@/olabs/store";
import { TopBar, useNav } from "@/olabs/Shell";
import { Avatar, Button, Card, DueDate, Donut, Empty, Icon, IconButton, ProjectTile, StageBadge, StageBar } from "@/olabs/ui";
import { KIND_SEGMENTS, byDue, greeting, isoDay, longToday, stageSegments, timeAgo, today, weekRange, addDays, fmtDay, plural } from "@/olabs/utils";
import { toast } from "sonner";
import api, { errMsg } from "@/lib/api";

const kindSegs = (list, stageOf) => KIND_SEGMENTS.map((k) => ({ name: k.name, color: k.color, count: list.filter((d) => stageOf(d).kind === k.kind).length }));

function WeekSummary({ demands }) {
  const { stageOf, isDone } = useStore();
  const [ws, we] = weekRange();
  const open = demands.filter((d) => !isDone(d));
  const segs = kindSegs(open, stageOf);
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const data = days.map((iso, i) => ({
    day: labels[i], iso,
    created: demands.filter((d) => isoDay(d.created_at) === iso).length,
    delivered: demands.filter((d) => d.done_at && isDone(d) && isoDay(d.done_at) === iso).length,
  }));
  const delivered = data.reduce((a, d) => a + d.delivered, 0);
  const max = Math.max(1, ...data.map((d) => Math.max(d.created, d.delivered)));
  const t = today();
  return (
    <section className="ol-feature" data-testid="week-summary">
      <header className="ol-feature__head">
        <div><h3>Resumo da semana</h3><p>{fmtDay(ws)} a {fmtDay(we)} · todos os projetos</p></div>
      </header>
      <div className="ol-feature__mid">
        <div className="ol-feature__donut">
          <Donut segments={[...segs, { name: "Entregues", color: "teal", count: delivered }]} />
          <div className="ol-feature__center"><b>{open.length}</b><span>abertas</span></div>
        </div>
        <ul className="ol-feature__legend">
          {segs.map((s) => <li key={s.name}><span style={{ background: `var(--${s.color})` }} />{s.name}<b>{s.count}</b></li>)}
          <li><span style={{ background: "var(--teal)" }} />Entregues na semana<b>{delivered}</b></li>
        </ul>
      </div>
      <div className="ol-feature__bars">
        <div className="ol-feature__barshead">
          <span>Criadas e entregues por dia</span>
          <span className="ol-feature__key"><i style={{ background: "var(--sky)" }} />criadas<i style={{ background: "var(--teal)" }} />entregues</span>
        </div>
        <div className="ol-feature__chart">
          {data.map((d) => (
            <div key={d.day} className={d.iso === t ? "ol-feature__col is-today" : "ol-feature__col"}>
              <div className="ol-feature__pair">
                <span style={{ height: (d.created / max) * 100 + "%", background: "var(--sky)" }} title={d.created + " criadas"} />
                <span style={{ height: (d.delivered / max) * 100 + "%", background: "var(--teal)" }} title={d.delivered + " entregues"} />
              </div>
              <span className="ol-feature__day">{d.day}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HomeScreen() {
  const { me, demands, activeProjects, projectMap, stageOf, isDone, person, activity, setNewDemand, setOpenDemand, refreshWork, allDemands } = useStore();
  const { nav } = useNav();
  const t = today();
  const mine = demands.filter((d) => d.resp_id === me.id && !isDone(d)).sort(byDue);
  const mineToday = mine.filter((d) => d.due === t);
  const dueToday = demands.filter((d) => d.due === t && !isDone(d));
  const recent = [...activeProjects].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 4);
  const quickProject = recent[0];
  const quickAdd = async (e) => {
    if (e.key !== "Enter" || !e.target.value.trim() || !quickProject) return;
    const title = e.target.value.trim();
    e.target.value = "";
    try {
      const r = await api.post("/demands", { project_id: quickProject.id, title, resp_id: me.id, solic_id: me.id, due: addDays(t, 7) });
      await refreshWork();
      toast.success(`${r.data.code} criada em ${quickProject.name}`);
    } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <div className="ol-screen">
      <TopBar title="Início" />
      <section className="ol-hero" style={{ backgroundImage: "url(/olabs-key.webp)" }}>
        <div className="ol-hero__panel">
          <span className="ol-hero__date">{longToday()}</span>
          <h2 className="ol-hero__hello" data-testid="hero-hello">{greeting()}, {me.short}</h2>
          <p className="ol-hero__text">
            {activeProjects.length === 0 ? <>Comece criando um projeto: cada um tem o seu quadro e o seu fluxo de etapas.</> :
              <>Você tem <b>{plural(mine.length, "demanda aberta", "demandas abertas")}</b> e <b className="ol-hero__hl">{mineToday.length} {mineToday.length === 1 ? "vence" : "vencem"} hoje</b>.</>}
          </p>
          {mine.length > 0 && <StageBar segments={kindSegs(mine, stageOf)} height={8} />}
          <div className="ol-hero__actions">
            {activeProjects.length === 0 ? (
              <Button variant="primary" size="lg" icon="folder-plus" onClick={() => nav("projects", { query: { novo: 1 } })} data-testid="hero-new-project">Criar projeto</Button>
            ) : (
              <Button variant="primary" size="lg" iconRight="arrow-up-right" onClick={() => nav("mine")} data-testid="hero-mine">Ver minhas demandas</Button>
            )}
            <Button size="lg" icon="plus" onClick={() => setNewDemand({})} disabled={activeProjects.length === 0} data-testid="hero-new-demand">Nova demanda</Button>
          </div>
        </div>
        <div className="ol-hero__chip"><Icon name="clock" size={16} /><b>{dueToday.length}</b> {dueToday.length === 1 ? "demanda do time vence" : "demandas do time vencem"} hoje</div>
      </section>

      <div className="ol-homegrid">
        <Card title="Atribuídas a mim" subtitle="Em todos os projetos, por prazo" className="ol-span2" testid="home-mine"
          actions={<Button variant="ghost" size="sm" iconRight="chevron-right" onClick={() => nav("mine")}>Ver todas</Button>}>
          {mine.length === 0 ? (
            <Empty icon="square-check-big" title="Nada com você agora" text="Quando alguém te colocar como responsável por uma demanda, ela aparece aqui." />
          ) : (
            <div className="ol-mylist">
              <div className="ol-mylist__row ol-mylist__row--head"><span>Demanda</span><span>Projeto</span><span>Prazo</span><span>Etapa</span></div>
              {mine.slice(0, 8).map((d) => {
                const p = projectMap[d.project_id];
                return (
                  <button type="button" key={d.id} className="ol-mylist__row" onClick={() => setOpenDemand(d.id)} data-testid={`mine-row-${d.code}`}>
                    <span className="ol-mylist__title"><span className="ol-table__id">{d.code}</span>{d.title}</span>
                    <span className="ol-mylist__proj"><ProjectTile project={p} size={22} />{p?.name}</span>
                    <span><DueDate date={d.due} /></span>
                    <span><StageBadge stage={stageOf(d)} size="sm" /></span>
                  </button>
                );
              })}
            </div>
          )}
          {quickProject && (
            <div className="ol-quickadd">
              <Icon name="plus" size={16} />
              <input placeholder="Criar uma demanda para mim… (Enter para salvar)" aria-label="Criar demanda" onKeyDown={quickAdd} data-testid="quick-add" />
              <span className="ol-quickadd__hint">em {quickProject.name}</span>
            </div>
          )}
        </Card>
        <WeekSummary demands={demands} />
        <Card title="Vencem hoje" subtitle={`${plural(dueToday.length, "demanda", "demandas")} · todo o time`}>
          {dueToday.length === 0 ? <Empty icon="clock" title="Nada vence hoje" text="Respire. Os prazos de hoje do time aparecem aqui." /> : (
            <div className="ol-duelist">
              {dueToday.map((d) => (
                <button type="button" key={d.id} className="ol-duelist__row" onClick={() => setOpenDemand(d.id)}>
                  <Avatar person={person(d.resp_id)} size={32} online={false} />
                  <span className="ol-duelist__txt"><b>{d.title}</b><span>{projectMap[d.project_id]?.name} · {person(d.resp_id)?.short}</span></span>
                  <StageBadge stage={stageOf(d)} size="sm" />
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card title="Projetos recentes" actions={<Button variant="ghost" size="sm" iconRight="chevron-right" onClick={() => nav("projects")}>Todos</Button>}>
          {recent.length === 0 ? <Empty icon="folder-kanban" title="Nenhum projeto" text="Crie um quadro para cada frente de trabalho." action={<Button size="sm" icon="plus" onClick={() => nav("projects", { query: { novo: 1 } })}>Novo projeto</Button>} /> : (
            <div className="ol-recent">
              {recent.map((p) => {
                const ds = allDemands.filter((d) => d.project_id === p.id);
                const open = ds.filter((d) => !isDone(d));
                return (
                  <button type="button" key={p.id} className="ol-recent__tile" onClick={() => nav("board", { projectId: p.id })}>
                    <div className="ol-recent__top"><ProjectTile project={p} size={36} /><Icon name="arrow-up-right" size={16} /></div>
                    <b>{p.name}</b>
                    <span>{open.length} abertas · {timeAgo(p.updated_at)}</span>
                    <StageBar segments={stageSegments(p.stages, ds)} legend={false} height={6} />
                  </button>
                );
              })}
            </div>
          )}
        </Card>
        <Card title="Atividade da equipe" subtitle="O que mudou por último">
          {activity.length === 0 ? <Empty icon="history" title="Sem atividade ainda" text="Criações, mudanças de etapa, comentários e anexos aparecem aqui." /> : (
            <div className="ol-activitylist">
              {activity.map((a) => {
                const who = person(a.who);
                return (
                  <div key={a.id} className="ol-activity">
                    <span className="ol-activity__avatar"><Avatar person={who} size={36} online={false} /><span className="ol-activity__icon"><Icon name={a.icon} size={12} stroke={2.25} /></span></span>
                    <div className="ol-activity__txt">
                      <p><b>{who?.short || "Alguém"}</b> {a.verb}{" "}
                        {a.demand_id ? <button type="button" className="ol-link" onClick={() => setOpenDemand(a.demand_id)}>{a.target_title || a.target}</button> : <b>{a.target}</b>}
                      </p>
                      <span>{a.demand_id ? a.target + " · " : ""}{timeAgo(a.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
