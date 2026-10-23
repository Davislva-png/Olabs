import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import api, { errMsg, fileUrl } from "@/lib/api";
import { useStore } from "./store";
import { buildHash } from "./Shell";
import { TagPicker } from "./modals";
import { Avatar, Button, Confirm, DueDate, FileIcon, Icon, IconButton, Menu, MenuItem, Person, Priority, ProjectTile, StageBadge, StageProgress, Tag, fileType } from "./ui";
import { PRIO, cx, fmtSize, stamp, timeAgo } from "./utils";

function AttachmentRow({ file, canDelete, onDelete }) {
  const { person } = useStore();
  const by = person(file.by);
  return (
    <div className="ol-attach" data-testid={`attachment-${file.name}`}>
      {file.type === "image" ? <img className="ol-attach__thumb" src={fileUrl(file.id, true)} alt="" /> : <FileIcon type={file.type} />}
      <div className="ol-attach__txt">
        <span className="ol-attach__name" title={file.name}>{file.name}</span>
        <span className="ol-attach__meta">{fmtSize(file.size)} · enviado por {by?.short || "alguém"} · {timeAgo(file.created_at)}</span>
      </div>
      <a className="ol-iconbtn ol-iconbtn--ghost ol-iconbtn--sm" href={fileUrl(file.id, true)} target="_blank" rel="noreferrer" title="Abrir" aria-label="Abrir"><Icon name="arrow-up-right" size={16} /></a>
      <a className="ol-iconbtn ol-iconbtn--ghost ol-iconbtn--sm" href={fileUrl(file.id)} title="Baixar" aria-label="Baixar" data-testid={`download-${file.name}`}><Icon name="download" size={16} /></a>
      {canDelete && <IconButton icon="trash-2" label="Remover anexo" variant="ghost" size="sm" onClick={onDelete} data-testid={`delete-file-${file.name}`} />}
    </div>
  );
}

function Composer({ members, onSend, onAttach }) {
  const { me } = useStore();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mention, setMention] = useState(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const onChange = (v) => {
    setText(v);
    const m = v.match(/@([\wÀ-ÿ]*)$/);
    setMention(m ? m[1].toLowerCase() : null);
  };
  const matches = mention !== null ? members.filter((u) => u.id !== me.id && (u.short || u.name).toLowerCase().startsWith(mention)).slice(0, 5) : [];
  const pick = (u) => {
    setText(text.replace(/@([\wÀ-ÿ]*)$/, "@" + (u.short || u.name.split(" ")[0]) + " "));
    setMention(null);
    inputRef.current?.focus();
  };
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await onSend(text.trim()); setText(""); } finally { setBusy(false); }
  };
  return (
    <div className="ol-composer">
      <Avatar person={me} size={32} online={false} />
      <div className="ol-composer__box">
        {matches.length > 0 && (
          <div className="ol-menu ol-menu--left ol-mentions">
            {matches.map((u) => (
              <button key={u.id} type="button" className="ol-menu__item" onMouseDown={(e) => { e.preventDefault(); pick(u); }}>
                <Avatar person={u} size={22} online={false} /><span className="ol-menu__label">{u.name}</span>
              </button>
            ))}
          </div>
        )}
        <input ref={inputRef} value={text} placeholder="Escreva um comentário… use @ para mencionar" aria-label="Comentário" data-testid="comment-input"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { if (matches.length) { e.preventDefault(); pick(matches[0]); } else send(); } if (e.key === "Escape") setMention(null); }} />
        <IconButton icon="paperclip" label="Anexar" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} />
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { onAttach([...e.target.files]); e.target.value = ""; }} />
        <IconButton icon="send" label="Enviar" variant="primary" size="sm" onClick={send} disabled={busy} data-testid="comment-send" />
      </div>
    </div>
  );
}

const renderText = (t, members) => {
  const names = new Set(members.map((m) => (m.short || "").toLowerCase()));
  return t.split(/(@[\wÀ-ÿ.]+)/g).map((part, i) =>
    part.startsWith("@") && names.has(part.slice(1).toLowerCase()) ? <b key={i} className="ol-mention">{part}</b> : part);
};

export default function DemandDrawer({ demandId, onClose }) {
  const { demands, projectMap, person, me, updateDemand, refreshWork, setDemands } = useStore();
  const d = demands.find((x) => x.id === demandId);
  const p = d && projectMap[d.project_id];
  const [comments, setComments] = useState([]);
  const [files, setFiles] = useState([]);
  const [editTitle, setEditTitle] = useState(null);
  const [editDesc, setEditDesc] = useState(null);
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const fileRef = useRef(null);
  const threadEnd = useRef(null);

  const loadSide = async () => {
    const [c, f] = await Promise.all([api.get(`/demands/${demandId}/comments`), api.get(`/demands/${demandId}/files`)]);
    setComments(c.data);
    setFiles(f.data);
  };
  useEffect(() => { setEditTitle(null); setEditDesc(null); loadSide().catch(() => {}); /* eslint-disable-next-line */ }, [demandId]);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && !document.querySelector(".ol-modal") && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  if (!d || !p) return null;
  const stageIdx = Math.max(0, p.stages.findIndex((s) => s.id === d.stage_id));
  const stage = p.stages[stageIdx];
  const group = p.groups.find((g) => g.id === d.group_id);
  const members = p.members.map((m) => person(m.user_id)).filter(Boolean);
  const isAdmin = p.my_role === "admin";

  const patch = async (body, msg) => {
    try { await updateDemand(d.id, body); msg && toast.success(msg); } catch (e) { toast.error(errMsg(e)); }
  };
  const upload = async (list) => {
    if (!list.length) return;
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        await api.post(`/demands/${d.id}/files`, fd);
      } catch (e) { toast.error(`${file.name}: ${errMsg(e)}`); }
      setUploading((n) => n - 1);
    }
    await loadSide();
    refreshWork();
  };
  const delFile = async (f) => {
    try { await api.delete(`/files/${f.id}`); await loadSide(); refreshWork(); toast.success("Anexo removido"); } catch (e) { toast.error(errMsg(e)); }
  };
  const sendComment = async (text) => {
    try {
      const r = await api.post(`/demands/${d.id}/comments`, { text });
      setComments((c) => [...c, r.data]);
      setDemands((ds) => ds.map((x) => (x.id === d.id ? { ...x, comments: x.comments + 1 } : x)));
      setTimeout(() => threadEnd.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const delComment = async (c) => {
    try {
      await api.delete(`/comments/${c.id}`);
      setComments((cs) => cs.filter((x) => x.id !== c.id));
      setDemands((ds) => ds.map((x) => (x.id === d.id ? { ...x, comments: Math.max(0, x.comments - 1) } : x)));
    } catch (e) { toast.error(errMsg(e)); }
  };
  const copyLink = async () => {
    const url = `${window.location.origin}/${buildHash("board", { projectId: p.id })}?d=${d.id}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link copiado"); } catch { toast.message(url); }
  };
  const saveTitle = () => {
    if (editTitle !== null && editTitle.trim() && editTitle.trim() !== d.title) patch({ title: editTitle.trim() });
    setEditTitle(null);
  };
  const personMenu = (field, label) => (
    <Menu align="left" width={260} trigger={({ toggle }) => (
      <button type="button" className="ol-fieldbtn" onClick={toggle} data-testid={`field-${field}`}><Person person={person(d[field])} sub size={28} /></button>
    )}>
      {(close) => members.map((u) => (
        <MenuItem key={u.id} active={d[field] === u.id} testid={`pick-${field}-${u.email}`} onClick={() => { close(); patch({ [field]: u.id }, `${label}: ${u.short}`); }}>
          {u.name}
        </MenuItem>
      ))}
    </Menu>
  );

  return (
    <div className="ol-scrim ol-scrim--drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={cx("ol-drawer", dragOver && "is-dragover")} role="dialog" aria-modal="true" aria-label={d.title} data-testid="demand-drawer"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); upload([...e.dataTransfer.files]); }}>
        <header className="ol-drawer__head">
          <div className="ol-drawer__crumbs">
            <ProjectTile project={p} size={24} />
            <span>{p.name}</span>
            <Icon name="chevron-right" size={14} />
            <span>{group?.name}</span>
            <span className="ol-drawer__id" data-testid="drawer-code">{d.code}</span>
          </div>
          <div className="ol-drawer__tools">
            <IconButton icon="link" label="Copiar link" variant="ghost" size="sm" onClick={copyLink} data-testid="drawer-copy-link" />
            <Menu width={240} trigger={({ toggle }) => <IconButton icon="ellipsis" label="Mais opções" variant="ghost" size="sm" onClick={toggle} data-testid="drawer-more" />}>
              {(close) => (
                <>
                  <div className="ol-menu__section">Mover para grupo</div>
                  {p.groups.map((g) => (
                    <MenuItem key={g.id} icon="layers" active={g.id === d.group_id} onClick={() => { close(); patch({ group_id: g.id }, `Movida para ${g.name}`); }}>{g.name}</MenuItem>
                  ))}
                  <MenuItem icon="trash-2" danger testid="drawer-delete" onClick={() => { close(); setConfirm(true); }}>Excluir demanda</MenuItem>
                </>
              )}
            </Menu>
            <IconButton icon="x" label="Fechar" variant="surface" size="sm" onClick={onClose} data-testid="drawer-close" />
          </div>
        </header>
        <div className="ol-drawer__scroll">
          {editTitle !== null ? (
            <textarea className="ol-drawer__title ol-titleedit" value={editTitle} autoFocus rows={2} data-testid="drawer-title-input"
              onChange={(e) => setEditTitle(e.target.value)} onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveTitle(); } if (e.key === "Escape") { e.stopPropagation(); setEditTitle(null); } }} />
          ) : (
            <h2 className="ol-drawer__title ol-editable" title="Clique para editar" onClick={() => setEditTitle(d.title)} data-testid="drawer-title">{d.title}</h2>
          )}
          <div className="ol-drawer__progress">
            <div className="ol-drawer__progresshead"><span>Progresso</span><b>Etapa {stageIdx + 1} de {p.stages.length}</b></div>
            <StageProgress stages={p.stages} current={stageIdx} onSelect={(i) => i !== stageIdx && patch({ stage_id: p.stages[i].id }, `Movida para ${p.stages[i].name}`)} />
          </div>
          <dl className="ol-fields">
            <div><dt>Responsável</dt><dd>{personMenu("resp_id", "Responsável")}</dd></div>
            <div><dt>Solicitante</dt><dd>{personMenu("solic_id", "Solicitante")}</dd></div>
            <div><dt>Etapa</dt><dd>
              <Menu align="left" width={220} trigger={({ toggle }) => <StageBadge stage={stage} onClick={toggle} />}>
                {(close) => p.stages.map((s) => (
                  <MenuItem key={s.id} active={s.id === d.stage_id} onClick={() => { close(); patch({ stage_id: s.id }, `Movida para ${s.name}`); }}>
                    <StageBadge stage={s} size="sm" />
                  </MenuItem>
                ))}
              </Menu>
            </dd></div>
            <div><dt>Prazo</dt><dd>
              <label className="ol-dateedit" title="Alterar prazo">
                <DueDate date={d.due} done={stage?.kind === "done"} long />
                <input type="date" value={d.due || ""} onChange={(e) => (e.target.value ? patch({ due: e.target.value }) : patch({ clear_due: true }))} data-testid="field-due" />
              </label>
            </dd></div>
            <div><dt>Prioridade</dt><dd>
              <Menu align="left" width={180} trigger={({ toggle }) => <button type="button" className="ol-fieldbtn" onClick={toggle} data-testid="field-prio"><Priority level={d.prio} /></button>}>
                {(close) => Object.keys(PRIO).map((k) => (
                  <MenuItem key={k} active={d.prio === k} testid={`pick-prio-${k}`} onClick={() => { close(); patch({ prio: k }); }}><Priority level={k} compact /></MenuItem>
                ))}
              </Menu>
            </dd></div>
            <div><dt>Tags</dt><dd className="ol-fields__tags">
              {d.tags.map((t, i) => <Tag key={t.name} tag={t} main={i === 0} onRemove={() => patch({ tags: d.tags.filter((x) => x.name !== t.name) })} />)}
              <Menu align="right" width={420} trigger={({ toggle }) => (
                <button type="button" className="ol-tag ol-tag--add" aria-label="Adicionar tag" onClick={toggle} data-testid="field-tags-add"><Icon name="plus" size={12} /></button>
              )}>
                <div style={{ padding: 12 }}><TagPicker value={d.tags} onChange={(tags) => patch({ tags })} /></div>
              </Menu>
            </dd></div>
            <div><dt>Grupo</dt><dd><span className="ol-groupchip"><i style={{ background: `var(--${group?.color || "slate"})` }} />{group?.name}</span></dd></div>
            <div><dt>Criada</dt><dd className="ol-muted">{stamp(d.created_at)} por {person(d.created_by)?.short || "—"}</dd></div>
          </dl>

          <section className="ol-drawer__sec">
            <div className="ol-drawer__sechead">
              <h3>Descrição</h3>
              {editDesc === null && <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditDesc(d.desc || "")} data-testid="desc-edit">Editar</Button>}
            </div>
            {editDesc !== null ? (
              <div className="ol-formstack">
                <span className="ol-field__box ol-field__box--multi">
                  <textarea rows={5} value={editDesc} autoFocus onChange={(e) => setEditDesc(e.target.value)} data-testid="desc-input"
                    placeholder="O que precisa ser feito, o critério de pronto e onde estão as referências." />
                </span>
                <div className="ol-row0">
                  <Button size="sm" variant="ghost" onClick={() => setEditDesc(null)}>Cancelar</Button>
                  <Button size="sm" variant="primary" icon="check" data-testid="desc-save" onClick={() => { patch({ desc: editDesc }); setEditDesc(null); }}>Salvar</Button>
                </div>
              </div>
            ) : (
              <p className={cx("ol-drawer__desc", !d.desc && "ol-drawer__muted")} data-testid="drawer-desc">
                {d.desc || "Sem descrição ainda. Conte o que precisa ser feito, o critério de pronto e onde estão as referências."}
              </p>
            )}
          </section>

          <section className="ol-drawer__sec">
            <div className="ol-drawer__sechead">
              <h3>Anexos <span>{files.length}</span></h3>
              <div className="ol-drawer__secactions">
                <Button size="sm" icon="upload" loading={uploading > 0} onClick={() => fileRef.current?.click()} data-testid="attach-btn">{uploading > 0 ? "Enviando…" : "Anexar"}</Button>
                <input ref={fileRef} type="file" multiple hidden data-testid="attach-input" onChange={(e) => { upload([...e.target.files]); e.target.value = ""; }} />
              </div>
            </div>
            {files.length ? (
              <div className="ol-attachlist">
                {files.map((f) => <AttachmentRow key={f.id} file={f} canDelete={f.by === me.id || isAdmin} onDelete={() => delFile(f)} />)}
              </div>
            ) : <p className="ol-drawer__muted">Nenhum anexo. Arraste imagens, planilhas ou PDFs para cá.</p>}
          </section>

          <section className="ol-drawer__sec">
            <h3>Comentários <span>{comments.length}</span></h3>
            <div className="ol-thread" data-testid="comment-thread">
              {comments.length === 0 && <p className="ol-drawer__muted">Nenhum comentário ainda. Combine detalhes, prazos e entregas por aqui.</p>}
              {comments.map((c) => {
                const by = person(c.by);
                return (
                  <div key={c.id} className={cx("ol-comment", c.by === me.id && "ol-comment--mine")}>
                    <Avatar person={by} size={32} online={false} />
                    <div className="ol-comment__body">
                      <div className="ol-comment__head">
                        <b>{by?.name || "Alguém"}</b><span>{stamp(c.created_at)}</span>
                        {c.by === me.id && <button type="button" className="ol-comment__del" onClick={() => delComment(c)} aria-label="Apagar comentário"><Icon name="trash-2" size={13} /></button>}
                      </div>
                      <p>{renderText(c.text, members)}</p>
                    </div>
                  </div>
                );
              })}
              <span ref={threadEnd} />
            </div>
          </section>
        </div>
        <footer className="ol-drawer__foot">
          <Composer members={members} onSend={sendComment} onAttach={upload} />
        </footer>
        {dragOver && <div className="ol-drawer__drop"><Icon name="upload" size={28} /><b>Solte para anexar em {d.code}</b></div>}
      </aside>
      {confirm && <Confirm danger title="Excluir demanda?" text={`${d.code} e seus comentários e anexos serão apagados.`} confirmLabel="Excluir"
        onClose={() => setConfirm(false)} onConfirm={async () => { await api.delete(`/demands/${d.id}`); onClose(); await refreshWork(); toast.success("Demanda excluída"); }} />}
    </div>
  );
}

export { fileType };
