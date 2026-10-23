import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import api, { errMsg, fileUrl } from "@/lib/api";
import { useStore } from "@/olabs/store";
import { TopBar, useNav } from "@/olabs/Shell";
import { AvatarStack, Button, Card, Checkbox, Confirm, DueDate, Empty, Icon, IconButton, Menu, MenuItem, Person, Priority, ProjectTile, StageBadge, StageBar, Tags, ViewTabs, Avatar, fileType } from "@/olabs/ui";
import { EditStagesModal, GroupModal, ProjectSettingsModal, UploadToProjectModal } from "@/olabs/modals";
import { MONTHS_LONG, PRIO, byDue, cx, fmtDay, fmtSize, stageSegments, timeAgo, today, toISO, parse, KIND_SEGMENTS } from "@/olabs/utils";

const COLS = "28px minmax(240px,1fr) 108px 108px 132px 100px 88px 148px";
const COLS_P = "28px minmax(240px,1fr) 168px 108px 132px 100px 88px 148px";

/* ---------------------------------------------------------------- table group */
export function BoardGroup({ group, items, project, collapsed, onToggle, showProject, selected = [], onSelect, onSelectAll, menu }) {
  const { stageOf, projectMap, person, setOpenDemand, setNewDemand } = useStore();
  const cols = showProject ? COLS_P : COLS;
  const segs = project ? stageSegments(project.stages, items) : null;
  const dues = items.map((d) => d.due).filter(Boolean).sort();
  const allSel = items.length > 0 && items.every((d) => selected.includes(d.id));
  return (
    <section className={cx("ol-group", collapsed && "is-collapsed")} style={{ "--gc": `var(--${group.color})`, "--gcs": `var(--${group.color}-strong)` }}
      data-testid={`group-${group.name}`}>
      <header className="ol-group__head">
        <button type="button" className="ol-group__toggle" onClick={onToggle} aria-expanded={!collapsed}>
          <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={18} stroke={2} />
          <span className="ol-group__dot" />
          <span className="ol-group__name">{group.name}</span>
          <span className="ol-group__count">{items.length} {items.length === 1 ? "demanda" : "demandas"}</span>
        </button>
        {collapsed && segs && <div className="ol-group__mini"><StageBar segments={segs} legend={false} height={8} /></div>}
        {!collapsed && menu}
      </header>
      {!collapsed && (
        <div className="ol-table" role="table">
          <div className="ol-table__row ol-table__row--head" role="row" style={{ gridTemplateColumns: cols }}>
            <span role="columnheader">{onSelect && <Checkbox checked={allSel} onChange={() => onSelectAll(items.map((d) => d.id), !allSel)} label="Selecionar todas" />}</span>
            <span role="columnheader">Demanda</span>
            {showProject && <span role="columnheader">Projeto</span>}
            <span role="columnheader">Responsável</span>
            {!showProject && <span role="columnheader">Solicitante</span>}
            <span role="columnheader">Etapa</span>
            <span role="columnheader">Prazo</span>
            <span role="columnheader">Prioridade</span>
            <span role="columnheader">Tags</span>
          </div>
          {items.map((d) => {
            const st = stageOf(d);
            const pr = projectMap[d.project_id];
            return (
              <div key={d.id} className={cx("ol-table__row", selected.includes(d.id) && "is-selected")} role="row" style={{ gridTemplateColumns: cols }}
                onClick={() => setOpenDemand(d.id)} data-testid={`row-${d.code}`}>
                <span role="cell">{onSelect && <Checkbox checked={selected.includes(d.id)} onChange={() => onSelect(d.id)} testid={`select-${d.code}`} />}</span>
                <span role="cell" className="ol-table__title">
                  <span className="ol-table__id">{d.code}</span>
                  <span className="ol-table__text">{d.title}</span>
                  <span className="ol-table__meta">
                    {d.comments > 0 && <span><Icon name="message-circle" size={14} />{d.comments}</span>}
                    {d.files > 0 && <span><Icon name="paperclip" size={14} />{d.files}</span>}
                  </span>
                </span>
                {showProject && <span role="cell" className="ol-table__proj"><ProjectTile project={pr} size={22} /><span>{pr?.name}</span></span>}
                <span role="cell"><Person person={person(d.resp_id)} /></span>
                {!showProject && <span role="cell"><Person person={person(d.solic_id)} /></span>}
                <span role="cell"><StageBadge stage={st} block /></span>
                <span role="cell"><DueDate date={d.due} done={st.kind === "done"} /></span>
                <span role="cell"><Priority level={d.prio} /></span>
                <span role="cell"><Tags tags={d.tags} max={1} /></span>
              </div>
            );
          })}
          {items.length === 0 && <div className="ol-table__empty">Nenhuma demanda neste grupo</div>}
          {project && group.addable !== false && (
            <div className="ol-table__row ol-table__row--add" style={{ gridTemplateColumns: cols }}>
              <span />
              <button type="button" className="ol-table__add" data-testid={`add-demand-${group.name}`}
                onClick={(e) => { e.stopPropagation(); setNewDemand({ projectId: project.id, ...(group.kind === "group" ? { groupId: group.id } : {}), ...(group.kind === "stage" ? { stageId: group.id } : {}) }); }}>
                <Icon name="plus" size={16} />Adicionar demanda
              </button>
            </div>
          )}
          {segs && items.length > 0 && (
            <div className="ol-table__row ol-table__row--sum" style={{ gridTemplateColumns: cols }}>
              <span /><span /><span /><span />
              <span className="ol-table__sumbar"><StageBar segments={segs} legend={false} height={8} /></span>
              <span className="ol-table__range">{dues.length ? fmtDay(dues[0]) + " – " + fmtDay(dues[dues.length - 1]) : ""}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- kanban */
export function KanbanCard({ demand, showProject, draggable }) {
  const { stageOf, projectMap, person, setOpenDemand } = useStore();
  const st = stageOf(demand);
  const pr = projectMap[demand.project_id];
  return (
    <article className="ol-kcard" tabIndex={0} draggable={draggable} data-testid={`kcard-${demand.code}`}
      onDragStart={(e) => { e.dataTransfer.setData("text/demand", demand.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={() => setOpenDemand(demand.id)} onKeyDown={(e) => e.key === "Enter" && setOpenDemand(demand.id)}>
      <div className="ol-kcard__top"><Tags tags={demand.tags} max={1} /><span className="ol-kcard__id">{demand.code}</span></div>
      <h4 className="ol-kcard__title">{demand.title}</h4>
      {showProject && <span className="ol-kcard__proj"><ProjectTile project={pr} size={20} />{pr?.name}</span>}
      <div className="ol-kcard__row"><DueDate date={demand.due} done={st.kind === "done"} /><Priority level={demand.prio} compact /></div>
      <footer className="ol-kcard__foot">
        <Avatar person={person(demand.resp_id)} size={26} online={false} />
        <span className="ol-kcard__counts">
          {demand.comments > 0 && <span><Icon name="message-circle" size={14} />{demand.comments}</span>}
          {demand.files > 0 && <span><Icon name="paperclip" size={14} />{demand.files}</span>}
        </span>
      </footer>
    </article>
  );
}

export function Kanban({ columns, onDrop, onAdd, onNewColumn, showProject }) {
  const [over, setOver] = useState(null);
  const [expanded, setExpanded] = useState({});
  return (
    <div className="ol-kanban" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(232px, 1fr))${onNewColumn ? " 48px" : ""}` }}>
      {columns.map((c) => {
        const limit = c.done && !expanded[c.id] ? 3 : Infinity;
        return (
          <section key={c.id} className={cx("ol-kcol", over === c.id && "is-over")} data-testid={`kcol-${c.stage.name}`}
            onDragOver={onDrop ? (e) => { e.preventDefault(); setOver(c.id); } : undefined}
            onDragLeave={onDrop ? () => setOver((o) => (o === c.id ? null : o)) : undefined}
            onDrop={onDrop ? (e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/demand"); id && onDrop(id, c.id); } : undefined}>
            <header className="ol-kcol__head">
              <StageBadge stage={c.stage} />
              <span className="ol-kcol__count">{c.items.length}</span>
              {onAdd && <IconButton icon="plus" label={"Nova demanda em " + c.stage.name} variant="ghost" size="sm" onClick={() => onAdd(c.id)} />}
            </header>
            <div className="ol-kcol__list">
              {c.items.slice(0, limit).map((d) => <KanbanCard key={d.id} demand={d} showProject={showProject} draggable={!!onDrop} />)}
              {c.items.length > limit && (
                <button type="button" className="ol-kcol__more" onClick={() => setExpanded((x) => ({ ...x, [c.id]: true }))}>Mostrar mais {c.items.length - limit}</button>
              )}
              {c.items.length === 0 && <div className="ol-kcol__empty">{onDrop ? "Arraste demandas para cá" : "Nenhuma demanda nesta etapa"}</div>}
            </div>
          </section>
        );
      })}
      {onNewColumn && (
        <button type="button" className="ol-kcol ol-kcol--new" aria-label="Nova etapa" title="Editar etapas" onClick={onNewColumn} data-testid="kanban-new-stage">
          <Icon name="plus" size={18} />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- calendar */
const WD = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export function CalendarMonth({ demands, onDayAdd }) {
  const { stageOf, setOpenDemand } = useStore();
  const t = parse(today());
  const [ym, setYm] = useState([t.getFullYear(), t.getMonth()]);
  const [y, m] = ym;
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const n = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let i = 1; i <= n; i++) cells.push(i);
  while (cells.length % 7) cells.push(null);
  const shift = (k) => { const d = new Date(y, m + k, 1); setYm([d.getFullYear(), d.getMonth()]); };
  const todayIso = today();
  const noDue = demands.filter((d) => !d.due).length;
  return (
    <div className="ol-cal" data-testid="calendar">
      <header className="ol-cal__head">
        <h3 data-testid="calendar-title">{MONTHS_LONG[m][0].toUpperCase() + MONTHS_LONG[m].slice(1)} de {y}</h3>
        <div className="ol-cal__nav">
          {noDue > 0 && <span className="ol-cal__nodue">{noDue} sem prazo</span>}
          <IconButton icon="chevron-left" label="Mês anterior" size="sm" onClick={() => shift(-1)} data-testid="cal-prev" />
          <Button size="sm" onClick={() => setYm([t.getFullYear(), t.getMonth()])}>Hoje</Button>
          <IconButton icon="chevron-right" label="Próximo mês" size="sm" onClick={() => shift(1)} data-testid="cal-next" />
        </div>
      </header>
      <div className="ol-cal__grid">
        {WD.map((w) => <span key={w} className="ol-cal__wd">{w}</span>)}
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="ol-cal__cell is-out" />;
          const iso = toISO(new Date(y, m, day));
          const evs = demands.filter((d) => d.due === iso);
          const show = evs.length > 3 ? evs.slice(0, 2) : evs;
          return (
            <div key={i} className={cx("ol-cal__cell", i % 7 >= 5 && "is-weekend", iso === todayIso && "is-today", onDayAdd && "is-addable")}
              onDoubleClick={() => onDayAdd && onDayAdd(iso)}>
              <span className="ol-cal__day">{day}</span>
              {onDayAdd && <button type="button" className="ol-cal__add" aria-label={`Nova demanda em ${fmtDay(iso)}`} onClick={() => onDayAdd(iso)}><Icon name="plus" size={12} stroke={2.5} /></button>}
              {show.map((d) => {
                const s = stageOf(d);
                return (
                  <button key={d.id} type="button" className="ol-cal__ev" title={`${d.code} · ${d.title}`} onClick={() => setOpenDemand(d.id)}
                    style={{ background: `var(--${s.color}-soft)`, color: `var(--${s.color}-strong)` }}>
                    <span className="ol-cal__evdot" style={{ background: `var(--${s.color})` }} />{d.title}
                  </button>
                );
              })}
              {evs.length > show.length && (
                <Menu align="left" width={280} trigger={({ toggle }) => <button type="button" className="ol-cal__more ol-link" onClick={toggle}>+{evs.length - show.length} mais</button>}>
                  {(close) => evs.map((d) => <MenuItem key={d.id} onClick={() => { close(); setOpenDemand(d.id); }}>{d.code} · {d.title}</MenuItem>)}
                </Menu>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- files */
function FileTile({ file, demand }) {
  const { person } = useStore();
  const o = fileType(file.type);
  const by = person(file.by);
  return (
    <article className="ol-filetile" data-testid={`filetile-${file.name}`}>
      <a className="ol-filetile__thumb" href={fileUrl(file.id, true)} target="_blank" rel="noreferrer" style={{ background: `var(--${o.color}-soft)`, color: `var(--${o.color}-strong)` }}>
        {file.type === "image" ? <img className="ol-filetile__img" src={fileUrl(file.id, true)} alt={file.name} /> : <Icon name={o.icon} size={36} stroke={1.5} />}
        <span className="ol-filetile__type">{o.label}</span>
      </a>
      <div className="ol-filetile__body">
        <span className="ol-filetile__name" title={file.name}>{file.name}</span>
        <span className="ol-filetile__demand"><b>{demand?.code}</b> {demand?.title}</span>
        <span className="ol-filetile__foot">
          <Avatar person={by} size={20} online={false} />{by?.short} · {timeAgo(file.created_at)}
          <span className="ol-filetile__size">{fmtSize(file.size)}</span>
          <a href={fileUrl(file.id)} className="ol-filetile__dl" aria-label="Baixar" title="Baixar"><Icon name="download" size={14} /></a>
        </span>
      </div>
    </article>
  );
}

function FilesView({ project, files, reload, demandsById }) {
  const { setOpenDemand } = useStore();
  const [filter, setFilter] = useState("all");
  const [upload, setUpload] = useState(false);
  const chips = [{ id: "all", label: "Todos" }, { id: "image", label: "Imagens" }, { id: "sheet", label: "Planilhas" }, { id: "pdf", label: "PDFs" }, { id: "other", label: "Outros" }];
  const match = (f, k) => k === "all" || f.type === k || (k === "other" && (f.type === "other" || f.type === "video"));
  const shown = files.filter((f) => demandsById[f.demand_id] && match(f, filter));
  return (
    <div className="ol-files">
      <div className="ol-files__bar">
        <div className="ol-chips">
          {chips.map((c) => (
            <button key={c.id} type="button" className={cx("ol-chip", filter === c.id && "is-active")} onClick={() => setFilter(c.id)} data-testid={`files-chip-${c.id}`}>
              {c.label}<span>{files.filter((f) => demandsById[f.demand_id] && match(f, c.id)).length}</span>
            </button>
          ))}
        </div>
        <div className="ol-files__right">
          <Button size="sm" variant="primary" icon="upload" onClick={() => setUpload(true)} data-testid="files-upload">Enviar arquivo</Button>
        </div>
      </div>
      {shown.length === 0 ? (
        <Card><Empty icon="paperclip" title={files.length ? "Nada neste filtro" : "Nenhum arquivo ainda"} text="Anexos enviados nas demandas deste quadro aparecem aqui." /></Card>
      ) : (
        <div className="ol-files__grid">
          {shown.map((f) => (
            <div key={f.id} onDoubleClick={() => setOpenDemand(f.demand_id)}><FileTile file={f} demand={demandsById[f.demand_id]} /></div>
          ))}
        </div>
      )}
      {upload && <UploadToProjectModal project={project} onClose={() => setUpload(false)} onUploaded={reload} />}
    </div>
  );
}

/* ---------------------------------------------------------------- board screen */
const VIEWS = [
  { id: "table", label: "Tabela", icon: "table-2" },
  { id: "kanban", label: "Kanban", icon: "square-kanban" },
  { id: "calendar", label: "Calendário", icon: "calendar" },
  { id: "files", label: "Arquivos", icon: "paperclip" },
];
const SORTS = { due: "Prazo", prio: "Prioridade", recent: "Mais recentes" };
const sorter = (k) => (k === "prio" ? (a, b) => PRIO[a.prio].rank - PRIO[b.prio].rank || byDue(a, b) : k === "recent" ? (a, b) => (a.created_at < b.created_at ? 1 : -1) : byDue);

export default function BoardScreen() {
  const { projectId, view, nav, query } = useNav();
  const { projectMap, demands, person, setNewDemand, setOpenDemand, setProjects, updateDemand, refreshWork, tagLibrary, me } = useStore();
  const project = projectMap[projectId];
  const [files, setFiles] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const [selected, setSelected] = useState([]);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState(null);
  const [filters, setFilters] = useState({ resp: null, prio: null, tag: null });
  const [groupBy, setGroupBy] = useState("group");
  const [sortBy, setSortBy] = useState("due");

  const loadFiles = async () => { if (project) setFiles((await api.get(`/projects/${project.id}/files`)).data); };
  useEffect(() => { setSelected([]); loadFiles().catch(() => {}); /* eslint-disable-next-line */ }, [projectId, project?.updated_at]);
  useEffect(() => { if (query.d) setOpenDemand(query.d); /* eslint-disable-next-line */ }, [query.d]);

  if (!project) return <div className="ol-screen"><TopBar title="Projeto" /><Card><Empty icon="folder-kanban" title="Projeto não encontrado" text="Ele pode ter sido excluído ou você não participa mais dele." action={<Button onClick={() => nav("projects")}>Ver projetos</Button>} /></Card></div>;

  const all = demands.filter((d) => d.project_id === project.id);
  const open = all.filter((d) => project.stages.find((s) => s.id === d.stage_id)?.kind !== "done");
  const term = (search || "").trim().toLowerCase();
  const items = all.filter((d) => (!term || d.title.toLowerCase().includes(term) || d.code.toLowerCase().includes(term))
    && (!filters.resp || d.resp_id === filters.resp) && (!filters.prio || d.prio === filters.prio) && (!filters.tag || d.tags.some((t) => t.name === filters.tag)))
    .sort(sorter(sortBy));
  const nFilters = Object.values(filters).filter(Boolean).length;
  const members = project.members.map((m) => person(m.user_id)).filter(Boolean);
  const isAdmin = project.my_role === "admin";
  const byId = Object.fromEntries(all.map((d) => [d.id, d]));
  const setView = (v) => nav("board", { projectId: project.id, view: v });
  const toggleSel = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selAll = (ids, on) => setSelected((s) => (on ? [...new Set([...s, ...ids])] : s.filter((x) => !ids.includes(x))));
  const fav = async () => { const r = await api.post(`/projects/${project.id}/favorite`); setProjects((ps) => ps.map((p) => (p.id === project.id ? r.data : p))); };
  const bulk = async (action, value, msg) => {
    try { await api.post("/demands/bulk", { ids: selected, action, value }); await refreshWork(); toast.success(msg); setSelected([]); } catch (e) { toast.error(errMsg(e)); }
  };

  let groups;
  if (groupBy === "stage") groups = project.stages.map((s) => ({ ...s, kind: "stage", items: items.filter((d) => d.stage_id === s.id) }));
  else if (groupBy === "resp") groups = members.map((u) => ({ id: u.id, name: u.name, color: u.color, kind: "resp", addable: false, items: items.filter((d) => d.resp_id === u.id) })).filter((g) => g.items.length);
  else groups = project.groups.map((g) => ({ ...g, kind: "group", items: items.filter((d) => d.group_id === g.id) }));

  const groupMenu = (g) => g.kind === "group" ? (
    <Menu width={200} trigger={({ toggle }) => <IconButton icon="ellipsis" label="Opções do grupo" variant="ghost" size="sm" onClick={toggle} data-testid={`group-menu-${g.name}`} />}>
      {(close) => (<>
        <MenuItem icon="pencil" onClick={() => { close(); setModal({ type: "group", group: g }); }}>Renomear grupo</MenuItem>
        {project.groups.length > 1 && <MenuItem icon="trash-2" danger onClick={() => { close(); setModal({ type: "delgroup", group: g }); }}>Excluir grupo</MenuItem>}
      </>)}
    </Menu>
  ) : null;

  return (
    <div className="ol-screen">
      <TopBar lead={
        <div className="ol-boardtitle">
          <ProjectTile project={project} size={48} />
          <div>
            <div className="ol-boardtitle__row">
              <h1 data-testid="board-title">{project.name}</h1>
              <IconButton icon="star" label={project.fav ? "Remover dos favoritos" : "Favoritar"} variant="ghost" size="sm" active={project.fav} className="ol-favbtn" onClick={fav} data-testid="board-fav" />
              <IconButton icon="ellipsis" label="Opções do projeto" variant="ghost" size="sm" onClick={() => setModal({ type: "settings", tab: "geral" })} data-testid="board-options" />
            </div>
            <p>{project.desc || (isAdmin ? "Sem descrição. Use as opções do projeto para contar para que serve este quadro." : "")}</p>
          </div>
        </div>
      } />
      <div className="ol-toolbar">
        <ViewTabs items={VIEWS.map((v) => (v.id === "files" ? { ...v, count: files.filter((f) => byId[f.demand_id]).length } : v))} value={view} onChange={setView} />
        <div className="ol-toolbar__right">
          {search !== null ? (
            <label className="ol-search ol-search--sm" style={{ width: 220 }}>
              <Icon name="search" size={16} />
              <input autoFocus value={search} placeholder="Buscar neste quadro" onChange={(e) => setSearch(e.target.value)} data-testid="board-search"
                onKeyDown={(e) => e.key === "Escape" && setSearch(null)} />
              <button type="button" className="ol-tag__x" onClick={() => setSearch(null)} aria-label="Fechar busca"><Icon name="x" size={12} /></button>
            </label>
          ) : <IconButton icon="search" label="Buscar neste quadro" size="sm" onClick={() => setSearch("")} data-testid="board-search-btn" />}
          <Menu width={260} trigger={({ toggle }) => <Button size="sm" icon="list-filter" onClick={toggle} data-testid="board-filter">{nFilters ? `Filtrar · ${nFilters}` : "Filtrar"}</Button>}>
            {(close) => (<>
              <div className="ol-menu__section">Responsável</div>
              {members.map((u) => <MenuItem key={u.id} active={filters.resp === u.id} onClick={() => setFilters((f) => ({ ...f, resp: f.resp === u.id ? null : u.id }))}>{u.name}</MenuItem>)}
              <div className="ol-menu__section">Prioridade</div>
              {Object.keys(PRIO).map((k) => <MenuItem key={k} active={filters.prio === k} onClick={() => setFilters((f) => ({ ...f, prio: f.prio === k ? null : k }))}>{PRIO[k].label}</MenuItem>)}
              {tagLibrary.length > 0 && <div className="ol-menu__section">Tag</div>}
              {tagLibrary.map((t) => <MenuItem key={t.name} active={filters.tag === t.name} onClick={() => setFilters((f) => ({ ...f, tag: f.tag === t.name ? null : t.name }))}>{t.name}</MenuItem>)}
              {nFilters > 0 && <MenuItem icon="x" onClick={() => { setFilters({ resp: null, prio: null, tag: null }); close(); }}>Limpar filtros</MenuItem>}
            </>)}
          </Menu>
          {view === "table" && (
            <Menu width={200} trigger={({ toggle }) => <Button size="sm" icon="layers" onClick={toggle} data-testid="board-groupby">Agrupar</Button>}>
              {(close) => [["group", "Grupo"], ["stage", "Etapa"], ["resp", "Responsável"]].map(([k, l]) => <MenuItem key={k} active={groupBy === k} onClick={() => { setGroupBy(k); close(); }}>{l}</MenuItem>)}
            </Menu>
          )}
          <Menu width={200} trigger={({ toggle }) => <Button size="sm" icon="arrow-up-down" onClick={toggle} data-testid="board-sort">Ordenar</Button>}>
            {(close) => Object.entries(SORTS).map(([k, l]) => <MenuItem key={k} active={sortBy === k} onClick={() => { setSortBy(k); close(); }}>{l}</MenuItem>)}
          </Menu>
          <Button size="sm" variant="primary" icon="plus" onClick={() => setNewDemand({ projectId: project.id })} data-testid="board-new-demand">Nova demanda</Button>
        </div>
      </div>
      <div className="ol-summary">
        <div className="ol-summary__lead"><b data-testid="board-count">{all.length}</b><span>demandas<br />{open.length} abertas</span></div>
        <div className="ol-summary__bar"><StageBar segments={stageSegments(project.stages, all)} height={12} /></div>
        <span className="ol-toolbar__sep" />
        <div className="ol-summary__people">
          <AvatarStack people={members} size={30} />
          <IconButton icon="user-plus" label="Pessoas do projeto" size="sm" onClick={() => setModal({ type: "settings", tab: "pessoas" })} data-testid="board-members" />
        </div>
        {isAdmin && <Button size="sm" variant="ghost" icon="pencil" onClick={() => setModal({ type: "stages" })} data-testid="board-edit-stages">Editar etapas</Button>}
      </div>
      {selected.length > 0 && view === "table" && (
        <div className="ol-bulk" data-testid="bulk-bar">
          <b>{selected.length} selecionada{selected.length > 1 ? "s" : ""}</b>
          <Menu align="left" width={220} trigger={({ toggle }) => <Button size="sm" variant="ghost" icon="move-right" onClick={toggle} data-testid="bulk-stage">Mover etapa</Button>}>
            {(close) => project.stages.map((s) => <MenuItem key={s.id} onClick={() => { close(); bulk("stage", s.id, `Movidas para ${s.name}`); }}><StageBadge stage={s} size="sm" /></MenuItem>)}
          </Menu>
          <Menu align="left" width={220} trigger={({ toggle }) => <Button size="sm" variant="ghost" icon="user" onClick={toggle} data-testid="bulk-assign">Atribuir</Button>}>
            {(close) => members.map((u) => <MenuItem key={u.id} onClick={() => { close(); bulk("assign", u.id, `Atribuídas a ${u.short}`); }}>{u.name}</MenuItem>)}
          </Menu>
          <Button size="sm" variant="ghost" icon="trash-2" onClick={() => setModal({ type: "bulkdel" })} data-testid="bulk-delete">Excluir</Button>
          <IconButton icon="x" label="Limpar seleção" size="sm" variant="ghost" onClick={() => setSelected([])} />
        </div>
      )}

      {all.length === 0 && view !== "files" ? (
        <Card><Empty icon="square-check-big" title="Nenhuma demanda ainda" text="Registre o primeiro pedido deste quadro: quem pediu, quem faz e para quando."
          action={<Button variant="primary" icon="plus" onClick={() => setNewDemand({ projectId: project.id })} data-testid="empty-new-demand">Nova demanda</Button>} /></Card>
      ) : view === "table" ? (
        <div className="ol-groups">
          {groups.map((g) => {
            const key = `${project.id}:${groupBy}:${g.id}`;
            return <BoardGroup key={key} group={g} items={g.items} project={project} collapsed={!!collapsed[key]} onToggle={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
              selected={selected} onSelect={toggleSel} onSelectAll={selAll} menu={groupMenu(g)} />;
          })}
          {groupBy === "group" && <button type="button" className="ol-addgroup" onClick={() => setModal({ type: "group" })} data-testid="add-group"><Icon name="plus" size={16} />Novo grupo</button>}
        </div>
      ) : view === "kanban" ? (
        <Kanban columns={project.stages.map((s) => ({ id: s.id, stage: s, done: s.kind === "done", items: items.filter((d) => d.stage_id === s.id) }))}
          onAdd={(sid) => setNewDemand({ projectId: project.id, stageId: sid })}
          onDrop={(id, sid) => { const d = byId[id]; if (d && d.stage_id !== sid) updateDemand(id, { stage_id: sid }).then(() => toast.success(`${d.code} → ${project.stages.find((s) => s.id === sid).name}`)).catch((e) => toast.error(errMsg(e))); }}
          onNewColumn={isAdmin ? () => setModal({ type: "stages" }) : null} />
      ) : view === "calendar" ? (
        <Card pad={false} className="ol-calcard"><CalendarMonth demands={items} onDayAdd={(iso) => setNewDemand({ projectId: project.id, due: iso })} /></Card>
      ) : (
        <FilesView project={project} files={files} reload={async () => { await loadFiles(); await refreshWork(); }} demandsById={byId} />
      )}

      {modal?.type === "stages" && <EditStagesModal project={project} onClose={() => setModal(null)} />}
      {modal?.type === "group" && <GroupModal project={project} group={modal.group} onClose={() => setModal(null)} />}
      {modal?.type === "settings" && <ProjectSettingsModal project={project} tab={modal.tab} onClose={() => setModal(null)} />}
      {modal?.type === "delgroup" && <Confirm danger title={`Excluir “${modal.group.name}”?`} text={`As demandas do grupo vão para “${project.groups.find((g) => g.id !== modal.group.id)?.name}”.`}
        confirmLabel="Excluir grupo" onClose={() => setModal(null)}
        onConfirm={async () => { const r = await api.delete(`/projects/${project.id}/groups/${modal.group.id}`); setProjects((ps) => ps.map((p) => (p.id === project.id ? r.data : p))); await refreshWork(); }} />}
      {modal?.type === "bulkdel" && <Confirm danger title={`Excluir ${selected.length} demanda(s)?`} text="Comentários e anexos delas também serão apagados." confirmLabel="Excluir"
        onClose={() => setModal(null)} onConfirm={() => bulk("delete", null, "Demandas excluídas")} />}
    </div>
  );
}

export { KIND_SEGMENTS };
