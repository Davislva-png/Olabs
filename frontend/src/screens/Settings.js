import React, { useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { errMsg } from "@/lib/api";
import { useStore } from "@/olabs/store";
import { TopBar, ThemeCtx } from "@/olabs/Shell";
import { Button, Card, ColorPick, Icon, IconButton, Switch, Tag, Empty } from "@/olabs/ui";
import { StagesEditor } from "@/olabs/modals";
import { cx } from "@/olabs/utils";

const SECTIONS = [
  { id: "etapas", label: "Etapas padrão", icon: "layers" },
  { id: "tags", label: "Tags", icon: "tag" },
  { id: "notif", label: "Notificações", icon: "bell-ring" },
  { id: "tema", label: "Aparência", icon: "sun" },
];

export default function SettingsScreen() {
  const { settings, setSettings, demands } = useStore();
  const theme = useContext(ThemeCtx);
  const [active, setActive] = useState("etapas");
  const [stages, setStages] = useState(settings.default_stages || []);
  const [busy, setBusy] = useState(false);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("sky");
  const [editTag, setEditTag] = useState(null);
  useEffect(() => setStages(settings.default_stages || []), [settings.default_stages]);
  const save = async (body, msg) => {
    try { setSettings((await api.put("/settings", body)).data); msg && toast.success(msg); } catch (e) { toast.error(errMsg(e)); }
  };
  const go = (id) => { setActive(id); document.getElementById("sec-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const tags = settings.tags || [];
  const uses = (n) => demands.filter((d) => d.tags.some((t) => t.name === n)).length;
  const maxUse = Math.max(1, ...tags.map((t) => uses(t.name)));
  const addTag = () => {
    const n = tagName.trim().toLowerCase();
    if (!n) return;
    if (tags.some((t) => t.name === n)) return toast.error("Essa tag já existe");
    save({ tags: [...tags, { name: n, color: tagColor }] }, "Tag criada");
    setTagName("");
  };
  const dirty = JSON.stringify(stages) !== JSON.stringify(settings.default_stages || []);
  return (
    <div className="ol-screen">
      <TopBar title="Configurações" subtitle="Suas preferências e o ponto de partida de cada projeto novo" />
      <div className="ol-settings">
        <nav className="ol-subnav" aria-label="Seções">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={cx("ol-subnav__item", active === s.id && "is-active")} onClick={() => go(s.id)} data-testid={`settings-nav-${s.id}`}>
              <Icon name={s.icon} size={18} />{s.label}
            </button>
          ))}
          <p className="ol-subnav__note"><Icon name="lock" size={14} />Valem para a sua conta. Projetos existentes mantêm as próprias etapas.</p>
        </nav>
        <div className="ol-settings__body">
          <div id="sec-etapas">
            <Card title="Etapas padrão" subtitle="Todo projeto novo criado por você começa com este fluxo. Cada projeto pode criar, renomear e reordenar as suas."
              actions={dirty && <Button size="sm" variant="primary" icon="check" loading={busy} data-testid="default-stages-save"
                onClick={async () => { setBusy(true); await save({ default_stages: stages }, "Etapas padrão salvas"); setBusy(false); }}>Salvar etapas</Button>}>
              <StagesEditor stages={stages} setStages={setStages} />
            </Card>
          </div>
          <div id="sec-tags">
            <Card title="Tags" subtitle="A primeira tag de uma demanda é a principal: define o tipo e ganha destaque no quadro.">
              <div className="ol-tagnew" style={{ marginBottom: 12 }}>
                <span className="ol-field__box"><Icon name="tag" size={16} />
                  <input value={tagName} placeholder="Nova tag" onChange={(e) => setTagName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} data-testid="settings-tag-input" />
                </span>
                <ColorPick value={tagColor} onChange={setTagColor} />
                <Button size="sm" icon="plus" onClick={addTag} disabled={!tagName.trim()} data-testid="settings-tag-add">Nova tag</Button>
              </div>
              {tags.length === 0 ? <Empty icon="tag" title="Nenhuma tag" text="Crie tags como urgente, fotografia ou pesquisa para classificar as demandas." /> : (
                <div className="ol-taglist">
                  {tags.map((t) => (
                    <div key={t.name} className="ol-taglist__row" data-testid={`settings-tag-${t.name}`}>
                      {editTag === t.name ? <ColorPick value={t.color} onChange={(c) => { save({ tags: tags.map((x) => (x.name === t.name ? { ...x, color: c } : x)) }); setEditTag(null); }} /> : <Tag tag={t} main />}
                      <span className="ol-taglist__use"><span className="ol-taglist__bar"><span style={{ width: (uses(t.name) / maxUse) * 100 + "%", background: `var(--${t.color})` }} /></span>em {uses(t.name)} demandas</span>
                      <IconButton icon="pencil" label={"Mudar cor de " + t.name} variant="ghost" size="sm" onClick={() => setEditTag(editTag === t.name ? null : t.name)} />
                      <IconButton icon="trash-2" label={"Excluir " + t.name} variant="ghost" size="sm" onClick={() => save({ tags: tags.filter((x) => x.name !== t.name) }, "Tag removida da biblioteca")} data-testid={`settings-tag-del-${t.name}`} />
                    </div>
                  ))}
                </div>
              )}
              <p className="ol-field__hint" style={{ marginTop: 12 }}>Excluir uma tag da biblioteca não a remove das demandas que já a usam.</p>
            </Card>
          </div>
          <div id="sec-notif">
            <Card title="Notificações" subtitle="Avisos no sino do Olabs">
              <div className="ol-switches">
                {[
                  ["assigned", "Quando eu receber uma demanda", "Alguém me colocou como responsável."],
                  ["comments", "Quando mexerem em demandas minhas", "Comentários e mudanças de etapa onde sou responsável ou solicitante."],
                  ["mentions", "Quando me mencionarem", "Alguém escreveu @meu-nome em um comentário."],
                  ["due_soon", "Um dia antes do prazo vencer", "Para demandas abertas em que sou responsável."],
                ].map(([k, l, d]) => (
                  <Switch key={k} label={l} description={d} checked={!!settings.notif?.[k]} testid={`notif-${k}`}
                    onChange={(v) => save({ notif: { ...settings.notif, [k]: v } })} />
                ))}
              </div>
            </Card>
          </div>
          <div id="sec-tema">
            <Card title="Aparência" subtitle="O tema fica salvo neste navegador">
              <div className="ol-chips">
                {[["light", "Claro", "sun"], ["dark", "Escuro", "moon"]].map(([id, l, ic]) => (
                  <button key={id} type="button" className={cx("ol-chip ol-chip--icon", theme.theme === id && "is-active")} onClick={() => theme.setTheme(id)} data-testid={`theme-${id}`}>
                    <Icon name={ic} size={14} />{l}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
