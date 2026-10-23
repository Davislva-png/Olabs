import React, { useRef, useState } from "react";
import { toast } from "sonner";
import api, { errMsg } from "@/lib/api";
import { useStore } from "@/olabs/store";
import { TopBar } from "@/olabs/Shell";
import { Avatar, Button, Card, ColorPick, ProjectTile, TextField } from "@/olabs/ui";
import { MONTHS_LONG, isoDay } from "@/olabs/utils";

export default function ProfileScreen() {
  const { me, setMe, demands, isDone, activeProjects, refreshTeam } = useStore();
  const [f, setF] = useState({ name: me.name, short: me.short, role: me.role || "", phone: me.phone || "", email: me.email, about: me.about || "", color: me.color });
  const [pw, setPw] = useState({ current: "", new: "", confirm: "" });
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const month = new Date().toISOString().slice(0, 7);
  const open = demands.filter((d) => d.resp_id === me.id && !isDone(d)).length;
  const delivered = demands.filter((d) => d.resp_id === me.id && isDone(d) && d.done_at && isoDay(d.done_at).startsWith(month)).length;
  const projs = activeProjects;
  const save = async () => {
    setBusy("save");
    try { setMe((await api.put("/users/me", f)).data); refreshTeam(); toast.success("Perfil salvo"); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  const upload = async (file) => {
    if (!file) return;
    setBusy("photo");
    try { const fd = new FormData(); fd.append("file", file); setMe((await api.post("/users/me/avatar", fd)).data); refreshTeam(); toast.success("Foto atualizada"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  const removePhoto = async () => { try { setMe((await api.delete("/users/me/avatar")).data); refreshTeam(); } catch (e) { toast.error(errMsg(e)); } };
  const changePw = async () => {
    if (pw.new !== pw.confirm) return toast.error("As senhas novas não conferem");
    setBusy("pw");
    try { await api.put("/auth/password", { current: pw.current, new: pw.new }); setPw({ current: "", new: "", confirm: "" }); toast.success("Senha atualizada"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  return (
    <div className="ol-screen">
      <TopBar title="Perfil" subtitle="Seus dados aparecem para as pessoas da sua equipe" />
      <section className="ol-profilehead">
        <div className="ol-profilehead__cover" style={{ backgroundImage: "url(/olabs-key.webp)" }} />
        <div className="ol-profilehead__body">
          <Avatar person={{ ...me, color: f.color }} size={96} ring online />
          <div className="ol-profilehead__txt">
            <h2 data-testid="profile-name">{me.name}</h2>
            <span>{me.role || "Sem cargo"} · {me.email}</span>
          </div>
          <div className="ol-profilehead__actions">
            <Button icon="upload" loading={busy === "photo"} onClick={() => fileRef.current?.click()} data-testid="profile-photo">Trocar foto</Button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
            {me.avatar_v && <Button variant="ghost" onClick={removePhoto}>Remover</Button>}
          </div>
        </div>
      </section>
      <div className="ol-profilegrid">
        <Card title="Dados pessoais" actions={<Button variant="primary" size="sm" icon="check" loading={busy === "save"} onClick={save} data-testid="profile-save">Salvar</Button>}>
          <div className="ol-formgrid">
            <TextField label="Nome completo" value={f.name} onChange={set("name")} testid="profile-input-name" />
            <TextField label="Como prefere ser chamado" value={f.short} onChange={set("short")} testid="profile-input-short" hint="Também é o @ para te mencionar" />
            <TextField label="Cargo" icon="briefcase" value={f.role} onChange={set("role")} placeholder="Ex.: Coordenador de marketplace" testid="profile-input-role" />
            <TextField label="Telefone" icon="phone" value={f.phone} onChange={set("phone")} placeholder="(31) 99999-0000" />
            <div className="ol-span2"><TextField label="E-mail" icon="mail" value={f.email} onChange={set("email")} hint="Usado para entrar e para as pessoas te adicionarem." /></div>
            <div className="ol-span2"><TextField label="Sobre" multiline value={f.about} onChange={set("about")} placeholder="Conte em que você pode ajudar o time." /></div>
            <div className="ol-span2 ol-field"><span className="ol-field__label">Cor do avatar</span><ColorPick value={f.color} onChange={set("color")} /></div>
          </div>
        </Card>
        <div className="ol-stack">
          <Card title="Seu mês" subtitle={`${MONTHS_LONG[new Date().getMonth()][0].toUpperCase() + MONTHS_LONG[new Date().getMonth()].slice(1)} de ${new Date().getFullYear()}`}>
            <div className="ol-minis">
              <div><b>{open}</b><span>abertas</span></div>
              <div><b>{delivered}</b><span>entregues</span></div>
              <div><b>{projs.length}</b><span>projetos</span></div>
            </div>
            <div className="ol-profprojs">{projs.map((p) => <span key={p.id}><ProjectTile project={p} size={24} />{p.name}</span>)}</div>
          </Card>
          <Card title="Alterar senha">
            <div className="ol-formstack">
              <TextField label="Senha atual" type="password" icon="lock" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} testid="pw-current" />
              <TextField label="Nova senha" type="password" icon="lock" value={pw.new} onChange={(v) => setPw({ ...pw, new: v })} placeholder="Pelo menos 8 caracteres" testid="pw-new" />
              <TextField label="Confirmar nova senha" type="password" icon="lock" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} placeholder="Repita a nova senha" testid="pw-confirm" />
              <Button variant="primary" loading={busy === "pw"} disabled={!pw.current || pw.new.length < 8} onClick={changePw} data-testid="pw-save">Atualizar senha</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
