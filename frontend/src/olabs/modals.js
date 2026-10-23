import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import api, { errMsg } from "@/lib/api";
import { useStore } from "./store";
import { useNav } from "./Shell";
import { Avatar, Button, ColorPick, Icon, IconButton, Modal, SelectField, StageBadge, Tag, TextField, ProjectTile, Menu, MenuItem, Confirm } from "./ui";
import { COLORS, KINDS, addDays, cx, today } from "./utils";

/* ------------------------------------------------------------- tag picker */
export function TagPicker({ value, onChange }) {
  const { tagLibrary, settings, setSettings } = useStore();
  const [name, setName] = useState("");
  const [color, setColor] = useState("sky");
  const has = (n) => value.findIndex((t) => t.name === n);
  const toggle = (t) => onChange(has(t.name) >= 0 ? value.filter((x) => x.name !== t.name) : [...value, t]);
  const create = async () => {
    const n = name.trim().toLowerCase();
    if (!n) return;
    const t = tagLibrary.find((x) => x.name === n) || { name: n, color };
    if (has(n) < 0) onChange([...value, t]);
    setName("");
    if (!(settings.tags || []).some((x) => x.name === n)) {
      try { setSettings((await api.put("/settings", { tags: [...(settings.tags || []), t] })).data); } catch (e) { /* tag still applied */ }
    }
  };
  const all = [...tagLibrary, ...value.filter((v) => !tagLibrary.some((t) => t.name === v.name))];
  return (
    <div className="ol-tagpicker">
      <div className="ol-chips">
        {all.map((t) => {
          const i = has(t.name);
          return (
            <button key={t.name} type="button" className={cx("ol-tagpick", i >= 0 && "is-on")} aria-pressed={i >= 0} onClick={() => toggle(t)} data-testid={`tagpick-${t.name}`}>
              <Tag tag={t} main={i >= 0} />
              {i === 0 && <span className="ol-tagpick__main">principal</span>}
            </button>
          );
        })}
        {all.length === 0 && <span className="ol-field__hint">Nenhuma tag ainda. Crie a primeira abaixo.</span>}
      </div>
      <div className="ol-tagnew">
        <span className="ol-field__box">
          <Icon name="tag" size={16} />
          <input value={name} placeholder="Nova tag (ex.: urgente)" onChange={(e) => setName(e.target.value)} data-testid="tag-new-input"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }} />
        </span>
        <ColorPick value={color} onChange={setColor} />
        <Button size="sm" icon="plus" onClick={create} disabled={!name.trim()} data-testid="tag-new-add">Criar</Button>
      </div>
    </div>
  );
}

const memberOptions = (project, person) =>
  (project?.members || []).map((m) => person(m.user_id)).filter(Boolean).map((u) => ({ value: u.id, label: u.name }));

/* ------------------------------------------------------------- new demand */
export function NewDemandModal({ init, onClose }) {
  const { activeProjects, me, person, refreshWork, setOpenDemand } = useStore();
  const first = activeProjects.find((p) => p.id === init.projectId) || activeProjects[0];
  const [f, setF] = useState({
    title: init.title || "", desc: "", project_id: first?.id, group_id: init.groupId || first?.groups[0]?.id,
    stage_id: init.stageId || first?.stages[0]?.id, resp_id: me.id, solic_id: me.id, due: init.due || addDays(today(), 7), prio: "media", tags: [],
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const proj = activeProjects.find((p) => p.id === f.project_id);
  const changeProject = (pid) => {
    const p = activeProjects.find((x) => x.id === pid);
    setF((s) => ({ ...s, project_id: pid, group_id: p.groups[0]?.id, stage_id: p.stages[0]?.id,
      resp_id: p.members.some((m) => m.user_id === s.resp_id) ? s.resp_id : me.id, solic_id: p.members.some((m) => m.user_id === s.solic_id) ? s.solic_id : me.id }));
  };
  const ok = f.title.trim().length > 0 && proj;
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const r = await api.post("/demands", { ...f, due: f.due || null });
      await refreshWork();
      toast.success(`${r.data.code} criada`);
      onClose();
      setOpenDemand(r.data.id);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  if (!proj)
    return (
      <Modal title="Nova demanda" onClose={onClose} width={520}>
        <p className="ol-muted">Crie um projeto primeiro: toda demanda mora dentro de um quadro.</p>
      </Modal>
    );
  const people = memberOptions(proj, person);
  return (
    <Modal title="Nova demanda" subtitle="Registre quem pediu, quem faz, em que etapa está e quando vence." width={700} onClose={onClose} testid="new-demand-modal"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" icon="check" disabled={!ok} loading={busy} onClick={submit} data-testid="new-demand-submit">Criar demanda</Button>
      </>}>
      <TextField label="Título" value={f.title} onChange={set("title")} autoFocus testid="new-demand-title"
        placeholder="Ex.: Revisar fotos do anúncio da chaleira elétrica" onKeyDown={(e) => e.key === "Enter" && submit()} />
      <TextField label="Descrição" multiline value={f.desc} onChange={set("desc")} testid="new-demand-desc"
        placeholder="O que precisa ser feito, o critério de pronto e onde estão as referências." />
      <div className="ol-formgrid">
        <SelectField label="Projeto" icon="folder-kanban" value={f.project_id} onChange={changeProject} testid="new-demand-project"
          options={activeProjects.map((p) => ({ value: p.id, label: p.name }))} />
        <SelectField label="Grupo" icon="layers" value={f.group_id} onChange={set("group_id")} testid="new-demand-group"
          options={proj.groups.map((g) => ({ value: g.id, label: g.name }))} />
        <SelectField label="Responsável" icon="user" value={f.resp_id} onChange={set("resp_id")} options={people} testid="new-demand-resp" />
        <SelectField label="Solicitante" icon="at-sign" value={f.solic_id} onChange={set("solic_id")} options={people} testid="new-demand-solic" />
        <SelectField label="Etapa" icon="flag" value={f.stage_id} onChange={set("stage_id")} testid="new-demand-stage"
          options={proj.stages.map((s) => ({ value: s.id, label: s.name }))} />
        <TextField label="Prazo" type="date" icon="calendar" value={f.due || ""} onChange={set("due")} testid="new-demand-due" />
      </div>
      <PrioChips value={f.prio} onChange={set("prio")} />
      <div className="ol-field">
        <span className="ol-field__label">Tags</span>
        <TagPicker value={f.tags} onChange={set("tags")} />
        <span className="ol-field__hint">A primeira tag escolhida é a principal: define o tipo e ganha destaque no quadro.</span>
      </div>
    </Modal>
  );
}

export function PrioChips({ value, onChange }) {
  return (
    <div className="ol-field">
      <span className="ol-field__label">Prioridade</span>
      <div className="ol-chips">
        {[["alta", "Alta", "arrow-up"], ["media", "Média", "equal"], ["baixa", "Baixa", "arrow-down"]].map(([id, l, ic]) => (
          <button key={id} type="button" className={cx("ol-chip ol-chip--icon", value === id && "is-active")} aria-pressed={value === id}
            onClick={() => onChange(id)} data-testid={`prio-${id}`}>
            <Icon name={ic} size={14} stroke={2.25} />{l}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- people picker (contacts) */
function PeoplePick({ value, onChange, exclude = [] }) {
  const { team, me } = useStore();
  const contacts = team.people.filter((p) => p.is_contact && p.id !== me.id && !exclude.includes(p.id));
  const selected = contacts.filter((p) => value.includes(p.id));
  return (
    <div className="ol-people-pick">
      <span className="ol-avatars">
        <Avatar person={me} size={32} ring online={false} />
        {selected.map((p) => <Avatar key={p.id} person={p} size={32} ring online={false} />)}
      </span>
      <Menu align="left" width={280} trigger={({ toggle }) => (
        <Button size="sm" variant="ghost" icon="user-plus" onClick={toggle} data-testid="people-pick-btn">Adicionar</Button>
      )}>
        {contacts.length === 0 ? <div className="ol-menu__empty">Adicione pessoas na Equipe para poder incluí-las.</div> :
          contacts.map((p) => (
            <MenuItem key={p.id} active={value.includes(p.id)} testid={`people-pick-${p.email}`}
              onClick={() => onChange(value.includes(p.id) ? value.filter((x) => x !== p.id) : [...value, p.id])}>
              {p.name}<small>{p.email}</small>
            </MenuItem>
          ))}
      </Menu>
    </div>
  );
}

/* ------------------------------------------------------------- new project */
export function NewProjectModal({ onClose }) {
  const { activeProjects, settings, refreshProjects } = useStore();
  const { nav } = useNav();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("sky");
  const [desc, setDesc] = useState("");
  const [start, setStart] = useState("default");
  const [copyFrom, setCopyFrom] = useState(activeProjects[0]?.id || "");
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const src = activeProjects.find((p) => p.id === copyFrom);
  const defFlow = (settings.default_stages || []).map((s) => s.name).join(" → ");
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = await api.post("/projects", { name, code, color, desc, start, copy_from: start === "copy" ? copyFrom : null, members });
      await refreshProjects();
      toast.success("Projeto criado");
      onClose();
      nav("board", { projectId: r.data.id });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const options = [
    { id: "default", icon: "layers", title: "Etapas padrão", text: defFlow || "Definidas em Configurações" },
    { id: "copy", icon: "copy", title: "Copiar etapas de um projeto", text: "Reaproveita o fluxo de um quadro que já existe", disabled: activeProjects.length === 0 },
    { id: "blank", icon: "plus", title: "Do zero", text: "Só a etapa Pedido; você monta o resto" },
  ];
  return (
    <Modal title="Novo projeto" subtitle="Cada projeto tem o seu quadro e o seu fluxo de etapas." onClose={onClose} width={640} testid="new-project-modal"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" icon="check" disabled={!name.trim()} loading={busy} onClick={submit} data-testid="new-project-submit">Criar projeto</Button>
      </>}>
      <div className="ol-formgrid ol-formgrid--name">
        <TextField label="Nome do projeto" value={name} onChange={setName} placeholder="Ex.: Revisão de embalagens" autoFocus testid="new-project-name" />
        <TextField label="Sigla" value={code} onChange={(v) => setCode(v.toUpperCase().slice(0, 3))} placeholder="Auto" testid="new-project-code" hint="Prefixo das demandas" />
      </div>
      <TextField label="Descrição" value={desc} onChange={setDesc} placeholder="Para que serve este quadro" testid="new-project-desc" />
      <div className="ol-field"><span className="ol-field__label">Cor</span><ColorPick value={color} onChange={setColor} /></div>
      <div className="ol-field">
        <span className="ol-field__label">Ponto de partida</span>
        <div className="ol-options">
          {options.map((o) => (
            <button type="button" key={o.id} disabled={o.disabled} className={cx("ol-option", start === o.id && "is-active")} onClick={() => setStart(o.id)}
              aria-pressed={start === o.id} data-testid={`start-${o.id}`}>
              <span className="ol-option__icon"><Icon name={o.icon} size={18} /></span>
              <b>{o.title}</b><span>{o.text}</span><span className="ol-option__radio" />
            </button>
          ))}
        </div>
      </div>
      {start === "copy" && src && (
        <div className="ol-copyfrom">
          <SelectField label="Copiar etapas de" icon="folder-kanban" value={copyFrom} onChange={setCopyFrom}
            options={activeProjects.map((p) => ({ value: p.id, label: p.name }))} />
          <div className="ol-copyfrom__flow">
            {src.stages.map((s, i) => <React.Fragment key={s.id}>{i > 0 && <Icon name="chevron-right" size={14} />}<StageBadge stage={s} size="sm" /></React.Fragment>)}
          </div>
        </div>
      )}
      <div className="ol-field"><span className="ol-field__label">Pessoas</span><PeoplePick value={members} onChange={setMembers} /></div>
    </Modal>
  );
}

/* ------------------------------------------------------------- stages editor (shared by project + settings) */
export function StagesEditor({ stages, setStages, counts }) {
  const upd = (i, patch) => setStages(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= stages.length) return;
    const n = [...stages];
    [n[i], n[j]] = [n[j], n[i]];
    setStages(n);
  };
  return (
    <div className="ol-stagelist">
      {stages.map((s, i) => (
        <div key={s.id || s._k || i} className="ol-stagelist__row ol-stageedit" data-testid={`stage-row-${i}`}>
          <span className="ol-stagelist__n">{i + 1}</span>
          <Menu align="left" width={220} trigger={({ toggle }) => (
            <button type="button" className="ol-swatch" style={{ background: `var(--${s.color})` }} aria-label="Cor" onClick={toggle} />
          )}>
            <div style={{ padding: 8 }}><ColorPick value={s.color} onChange={(c) => upd(i, { color: c })} /></div>
          </Menu>
          <input className="ol-inline" value={s.name} onChange={(e) => upd(i, { name: e.target.value })} aria-label="Nome da etapa" data-testid={`stage-name-${i}`} />
          <select className="ol-inline ol-inline--select" value={s.kind} onChange={(e) => upd(i, { kind: e.target.value })} aria-label="Tipo">
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          {counts && <span className="ol-stagelist__count">{counts[s.id] || 0} demandas</span>}
          <IconButton icon="arrow-up-1" label="Subir" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} />
          <IconButton icon="arrow-down-1" label="Descer" variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === stages.length - 1} />
          <IconButton icon="trash-2" label="Excluir" variant="ghost" size="sm" disabled={stages.length <= 1} data-testid={`stage-del-${i}`}
            onClick={() => setStages(stages.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="sm" icon="plus" className="ol-stageadd" data-testid="stage-add"
        onClick={() => setStages([...stages, { _k: Math.random(), name: "Nova etapa", color: COLORS[stages.length % COLORS.length], kind: "doing" }])}>Adicionar etapa</Button>
      <div className="ol-flowpreview">
        <span>Como fica:</span>
        {stages.map((s, i) => <React.Fragment key={s.id || s._k || i}>{i > 0 && <Icon name="chevron-right" size={14} />}<StageBadge stage={s} size="sm" /></React.Fragment>)}
      </div>
    </div>
  );
}

export function EditStagesModal({ project, onClose }) {
  const { demands, setProjects, refreshDemands } = useStore();
  const [stages, setStages] = useState(project.stages.map((s) => ({ ...s })));
  const [busy, setBusy] = useState(false);
  const counts = useMemo(() => {
    const c = {};
    demands.filter((d) => d.project_id === project.id).forEach((d) => (c[d.stage_id] = (c[d.stage_id] || 0) + 1));
    return c;
  }, [demands, project.id]);
  const removedWithItems = project.stages.filter((s) => !stages.some((x) => x.id === s.id) && counts[s.id]);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put(`/projects/${project.id}/stages`, { stages });
      setProjects((ps) => ps.map((p) => (p.id === project.id ? r.data : p)));
      await refreshDemands();
      toast.success("Etapas salvas");
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Editar etapas" subtitle={`O fluxo do quadro ${project.name}. Arraste a ordem com as setas e defina o tipo de cada etapa.`} width={760} onClose={onClose}
      testid="edit-stages-modal"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" loading={busy} onClick={save} data-testid="stages-save">Salvar etapas</Button></>}>
      <StagesEditor stages={stages} setStages={setStages} counts={counts} />
      {removedWithItems.length > 0 && (
        <p className="ol-warn"><Icon name="circle-alert" size={16} /> As demandas de {removedWithItems.map((s) => s.name).join(", ")} vão para “{stages[0]?.name}”.</p>
      )}
      <p className="ol-field__hint">Demandas em etapas do tipo “Concluída” contam como entregues.</p>
    </Modal>
  );
}

/* ------------------------------------------------------------- group modal */
export function GroupModal({ project, group, onClose }) {
  const { setProjects } = useStore();
  const [name, setName] = useState(group?.name || "");
  const [color, setColor] = useState(group?.color || "sky");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = group ? await api.put(`/projects/${project.id}/groups/${group.id}`, { name, color }) : await api.post(`/projects/${project.id}/groups`, { name, color });
      setProjects((ps) => ps.map((p) => (p.id === project.id ? r.data : p)));
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={group ? "Editar grupo" : "Novo grupo"} subtitle="Grupos organizam a tabela: semanas, linhas de produto, tipos de pedido." width={480} onClose={onClose}
      testid="group-modal"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" loading={busy} disabled={!name.trim()} onClick={save} data-testid="group-save">Salvar</Button></>}>
      <TextField label="Nome" value={name} onChange={setName} autoFocus placeholder="Ex.: Semana 44 · 26 out a 1 nov" testid="group-name" onKeyDown={(e) => e.key === "Enter" && save()} />
      <div className="ol-field"><span className="ol-field__label">Cor</span><ColorPick value={color} onChange={setColor} /></div>
    </Modal>
  );
}

/* ------------------------------------------------------------- project settings + members */
export function ProjectSettingsModal({ project, onClose, tab: initialTab = "geral" }) {
  const { setProjects, refreshProjects, person, team, me } = useStore();
  const { nav } = useNav();
  const [tab, setTab] = useState(initialTab);
  const [f, setF] = useState({ name: project.name, code: project.code, color: project.color, desc: project.desc || "" });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const isAdmin = project.my_role === "admin";
  const apply = (r) => setProjects((ps) => ps.map((p) => (p.id === project.id ? r.data : p)));
  const save = async () => {
    setBusy(true);
    try { apply(await api.put(`/projects/${project.id}`, f)); toast.success("Projeto atualizado"); onClose(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const memberIds = project.members.map((m) => m.user_id);
  const candidates = team.people.filter((p) => p.is_contact && !memberIds.includes(p.id));
  const act = async (fn, msg) => { try { const r = await fn(); if (r?.data?.id) apply(r); else await refreshProjects(); msg && toast.success(msg); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal title={project.name} subtitle={isAdmin ? "Configurações e pessoas do projeto" : "Você é membro deste projeto"} width={640} onClose={onClose} testid="project-settings-modal"
      footer={tab === "geral" && isAdmin ? <><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" loading={busy} onClick={save} data-testid="project-save">Salvar</Button></> : null}>
      <div className="ol-chips">
        {[["geral", "Geral"], ["pessoas", `Pessoas · ${project.members.length}`]].map(([id, l]) => (
          <button key={id} type="button" className={cx("ol-chip", tab === id && "is-active")} onClick={() => setTab(id)} data-testid={`project-tab-${id}`}>{l}</button>
        ))}
      </div>
      {tab === "geral" ? (
        <>
          <div className="ol-formgrid ol-formgrid--name">
            <TextField label="Nome" value={f.name} onChange={(v) => setF({ ...f, name: v })} testid="project-edit-name" />
            <TextField label="Sigla" value={f.code} onChange={(v) => setF({ ...f, code: v.toUpperCase().slice(0, 3) })} hint="Vale para demandas novas" />
          </div>
          <TextField label="Descrição" multiline rows={2} value={f.desc} onChange={(v) => setF({ ...f, desc: v })} />
          <div className="ol-field"><span className="ol-field__label">Cor</span><ColorPick value={f.color} onChange={(c) => setF({ ...f, color: c })} /></div>
          {isAdmin && (
            <div className="ol-dangerzone">
              <Button size="sm" icon="archive" onClick={() => setConfirm("archive")} data-testid="project-archive">Arquivar projeto</Button>
              {project.owner_id === me.id && <Button size="sm" variant="danger" icon="trash-2" onClick={() => setConfirm("delete")} data-testid="project-delete">Excluir projeto</Button>}
            </div>
          )}
          {!isAdmin && <Button size="sm" variant="danger" icon="log-out" onClick={() => setConfirm("leave")}>Sair do projeto</Button>}
        </>
      ) : (
        <div className="ol-memberlist">
          {project.members.map((m) => {
            const u = person(m.user_id);
            if (!u) return null;
            const owner = m.user_id === project.owner_id;
            return (
              <div key={m.user_id} className="ol-memberlist__row" data-testid={`member-row-${u.email}`}>
                <Avatar person={u} size={36} />
                <span className="ol-invites__txt"><b>{u.name}{u.id === me.id && " (você)"}</b><span>{u.email}</span></span>
                {isAdmin && !owner ? (
                  <select className="ol-inline ol-inline--select" value={m.role} aria-label="Papel"
                    onChange={(e) => act(() => api.put(`/projects/${project.id}/members/${u.id}`, { user_id: u.id, role: e.target.value }), "Papel atualizado")}>
                    <option value="admin">Administrador</option><option value="membro">Membro</option>
                  </select>
                ) : <span className={cx("ol-role", m.role === "admin" && "ol-role--admin")}>{owner ? "Criador" : m.role === "admin" ? "Administrador" : "Membro"}</span>}
                {isAdmin && !owner && u.id !== me.id ? (
                  <IconButton icon="user-minus" label="Remover do projeto" variant="ghost" size="sm" data-testid={`member-remove-${u.email}`}
                    onClick={() => act(() => api.delete(`/projects/${project.id}/members/${u.id}`), "Pessoa removida do projeto")} />
                ) : <span style={{ width: 32 }} />}
              </div>
            );
          })}
          {isAdmin && (
            <Menu align="left" width={300} trigger={({ toggle }) => <Button size="sm" icon="user-plus" onClick={toggle} data-testid="member-add-btn">Adicionar pessoa</Button>}>
              {(close) => candidates.length === 0 ? (
                <div className="ol-menu__empty">Ninguém disponível. Adicione pessoas na <button type="button" className="ol-link" onClick={() => { close(); onClose(); nav("team"); }}>Equipe</button> primeiro.</div>
              ) : candidates.map((p) => (
                <MenuItem key={p.id} testid={`member-add-${p.email}`} onClick={() => { close(); act(() => api.post(`/projects/${project.id}/members`, { user_id: p.id, role: "membro" }), `${p.short} entrou no projeto`); }}>
                  {p.name}<small>{p.email}</small>
                </MenuItem>
              ))}
            </Menu>
          )}
        </div>
      )}
      {confirm === "archive" && <Confirm title="Arquivar projeto?" text="Ele some da barra lateral, mas as demandas continuam guardadas. Você pode restaurar em Projetos." confirmLabel="Arquivar"
        onClose={() => setConfirm(null)} onConfirm={async () => { await api.post(`/projects/${project.id}/archive`); await refreshProjects(); onClose(); nav("projects"); toast.success("Projeto arquivado"); }} />}
      {confirm === "delete" && <Confirm danger title="Excluir projeto?" text="Todas as demandas, comentários e anexos deste projeto serão apagados. Não dá para desfazer." confirmLabel="Excluir para sempre"
        onClose={() => setConfirm(null)} onConfirm={async () => { await api.delete(`/projects/${project.id}`); await refreshProjects(); onClose(); nav("projects"); toast.success("Projeto excluído"); }} />}
      {confirm === "leave" && <Confirm title="Sair do projeto?" text="Você deixa de ver as demandas deste quadro." confirmLabel="Sair"
        onClose={() => setConfirm(null)} onConfirm={async () => { await api.delete(`/projects/${project.id}/members/${me.id}`); await refreshProjects(); onClose(); nav("home"); }} />}
    </Modal>
  );
}

/* ------------------------------------------------------------- add person */
export function AddPersonModal({ onClose }) {
  const { refreshTeam } = useStore();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const r = await api.post("/team/add", { email });
      await refreshTeam();
      if (r.data.status === "added") toast.success(`${r.data.user.name} agora está na sua equipe`);
      else toast.success("Convite registrado. Copie o link e envie para a pessoa criar a conta.");
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Adicionar pessoa" subtitle="Quem já tem conta entra na sua equipe na hora. Quem ainda não tem recebe um convite: ao criar a conta com este e-mail, vocês ficam conectados."
      width={520} onClose={onClose} testid="add-person-modal"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" icon="user-plus" loading={busy} disabled={!email.trim()} onClick={submit} data-testid="add-person-submit">Adicionar</Button></>}>
      <TextField label="E-mail" icon="mail" type="email" value={email} onChange={setEmail} autoFocus placeholder="nome@empresa.com" testid="add-person-email"
        onKeyDown={(e) => e.key === "Enter" && submit()} />
    </Modal>
  );
}

/* ------------------------------------------------------------- upload file to a demand of the project */
export function UploadToProjectModal({ project, onClose, onUploaded }) {
  const { demands } = useStore();
  const list = demands.filter((d) => d.project_id === project.id);
  const [demandId, setDemandId] = useState(list[0]?.id || "");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!demandId || !files.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        await api.post(`/demands/${demandId}/files`, fd);
      }
      toast.success(files.length > 1 ? `${files.length} arquivos enviados` : "Arquivo enviado");
      await onUploaded();
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Enviar arquivo" subtitle="Todo arquivo fica anexado a uma demanda do quadro." width={560} onClose={onClose} testid="upload-modal"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" icon="upload" loading={busy} disabled={!demandId || !files.length} onClick={submit} data-testid="upload-submit">Enviar</Button></>}>
      {list.length === 0 ? <p className="ol-muted">Crie uma demanda neste projeto para anexar arquivos.</p> : (
        <>
          <SelectField label="Demanda" icon="square-check-big" value={demandId} onChange={setDemandId} options={list.map((d) => ({ value: d.id, label: `${d.code} · ${d.title}` }))} testid="upload-demand" />
          <label className="ol-dropzone">
            <Icon name="upload" size={22} />
            <b>{files.length ? files.map((f) => f.name).join(", ") : "Escolher arquivos"}</b>
            <span>Imagens, planilhas, PDFs e outros · até 25 MB cada</span>
            <input type="file" multiple onChange={(e) => setFiles([...e.target.files])} data-testid="upload-input" />
          </label>
        </>
      )}
    </Modal>
  );
}

export { ProjectTile };
