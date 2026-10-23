import React, { useState } from "react";
import { toast } from "sonner";
import api, { errMsg } from "@/lib/api";
import { useStore } from "@/olabs/store";
import { TopBar } from "@/olabs/Shell";
import { Avatar, Button, Card, Confirm, Empty, IconButton, Menu, MenuItem, ProjectTile, StatTile, WorkloadBar } from "@/olabs/ui";
import { AddPersonModal } from "@/olabs/modals";
import { KIND_SEGMENTS, MONTHS_LONG, fmtDay, isoDay, plural } from "@/olabs/utils";

export default function TeamScreen() {
  const { team, demands, activeProjects, isDone, stageOf, me, refreshTeam } = useStore();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [sortDesc, setSortDesc] = useState(false);
  const open = demands.filter((d) => !isDone(d));
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const rows = team.people.map((p) => {
    const mine = open.filter((d) => d.resp_id === p.id);
    return {
      p, mine,
      segs: KIND_SEGMENTS.map((k) => ({ name: k.name, color: k.color, count: mine.filter((d) => stageOf(d).kind === k.kind).length })),
      delivered: demands.filter((d) => d.resp_id === p.id && isDone(d) && d.done_at && isoDay(d.done_at).startsWith(monthPrefix)).length,
      projects: activeProjects.filter((pr) => pr.members.some((m) => m.user_id === p.id)),
    };
  }).sort((a, b) => (sortDesc ? b.mine.length - a.mine.length : a.mine.length - b.mine.length));
  const lowest = [...rows].sort((a, b) => a.mine.length - b.mine.length)[0];
  const online = team.people.filter((p) => p.online || p.id === me.id).length;
  const deliveredMonth = demands.filter((d) => isDone(d) && d.done_at && isoDay(d.done_at).startsWith(monthPrefix)).length;
  const monthName = MONTHS_LONG[new Date().getMonth()];
  const copyInvite = async (inv) => {
    const url = `${window.location.origin}/#/cadastro?email=${encodeURIComponent(inv.email)}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link de convite copiado. Envie para a pessoa."); } catch { toast.message(url); }
  };
  const cancelInvite = async (inv) => { try { await api.delete(`/invites/${inv.id}`); await refreshTeam(); toast.success("Convite cancelado"); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="ol-screen">
      <TopBar title="Equipe" subtitle={`${plural(team.people.length, "pessoa", "pessoas")} · ${plural(team.invites.length, "convite pendente", "convites pendentes")}`}>
        <Button variant="primary" size="lg" icon="user-plus" onClick={() => setAdding(true)} data-testid="team-add">Adicionar pessoa</Button>
      </TopBar>
      <div className="ol-statrow">
        <StatTile label="Demandas abertas" value={open.length} hint={`somando ${plural(activeProjects.length, "projeto", "projetos")}`} icon="inbox" color="sky" />
        <StatTile label={`Entregues em ${monthName}`} value={deliveredMonth} hint="nos seus projetos" icon="circle-check" color="teal" />
        <StatTile label="Menor carga agora" value={lowest?.p.short || "—"} hint={lowest ? plural(lowest.mine.length, "demanda aberta", "demandas abertas") : ""} icon="user" color="coral" />
        <StatTile label="Online agora" value={`${online} de ${team.people.length}`} hint="nos últimos 5 minutos" icon="users" color="lilac" />
      </div>
      <Card pad={false} title="Pessoas" subtitle={`Ordenadas pela ${sortDesc ? "maior" : "menor"} carga — veja quem pode receber a próxima demanda`}
        actions={<>
          <span className="ol-loadkey">{KIND_SEGMENTS.map((k) => <span key={k.kind}><i style={{ background: `var(--${k.color})` }} />{k.name}</span>)}</span>
          <Button size="sm" icon="arrow-up-down" onClick={() => setSortDesc((s) => !s)}>Carga</Button>
        </>}>
        <div className="ol-team">
          <div className="ol-team__row ol-team__row--head"><span>Pessoa</span><span>Vínculo</span><span>E-mail</span><span>Carga atual</span><span>Entregas no mês</span><span>Projetos</span><span /></div>
          {rows.map(({ p, segs, delivered, projects }) => (
            <div key={p.id} className="ol-team__row" data-testid={`team-row-${p.email}`}>
              <span className="ol-team__person"><Avatar person={p} size={40} online={p.online || p.is_me} /><span><b>{p.name}</b><span>{p.role || "Sem cargo"}</span></span></span>
              <span><span className={p.is_me ? "ol-role ol-role--admin" : "ol-role"}>{p.is_me ? "Você" : p.is_contact ? "Equipe" : "Projeto em comum"}</span></span>
              <span className="ol-team__email">{p.email}</span>
              <span><WorkloadBar segments={segs} max={6} /></span>
              <span className="ol-team__num">{delivered}</span>
              <span className="ol-team__projs">{projects.map((pr) => <ProjectTile key={pr.id} project={pr} size={26} />)}</span>
              <span>
                {p.is_contact && (
                  <Menu width={220} trigger={({ toggle }) => <IconButton icon="ellipsis" label={"Opções de " + p.short} variant="ghost" size="sm" onClick={toggle} data-testid={`team-menu-${p.email}`} />}>
                    {(close) => <MenuItem icon="user-minus" danger onClick={() => { close(); setRemoving(p); }}>Remover da equipe</MenuItem>}
                  </Menu>
                )}
              </span>
            </div>
          ))}
        </div>
        {team.people.length <= 1 && <Empty icon="users" title="Só você por aqui" text="Adicione pessoas pelo e-mail para incluí-las nos projetos e atribuir demandas."
          action={<Button size="sm" icon="user-plus" onClick={() => setAdding(true)}>Adicionar pessoa</Button>} />}
      </Card>
      <div className="ol-teamgrid">
        <Card title="Convites pendentes" subtitle="Quem você chamou e ainda não criou conta" testid="invites-card">
          {team.invites.length === 0 ? <p className="ol-muted" style={{ margin: 0 }}>Nenhum convite pendente.</p> : (
            <div className="ol-invites">
              {team.invites.map((inv) => (
                <div key={inv.id} className="ol-invites__row" data-testid={`invite-${inv.email}`}>
                  <Avatar name={inv.email.split("@")[0].replace(".", " ")} color="slate" size={36} online={false} />
                  <span className="ol-invites__txt"><b>{inv.email}</b><span>enviado em {fmtDay(isoDay(inv.created_at))} · conecta quando a pessoa criar a conta</span></span>
                  <Button size="sm" icon="copy" onClick={() => copyInvite(inv)} data-testid={`invite-copy-${inv.email}`}>Copiar link</Button>
                  <Button size="sm" variant="danger" onClick={() => cancelInvite(inv)} data-testid={`invite-cancel-${inv.email}`}>Cancelar</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Papéis nos projetos" subtitle="Dois papéis, definidos em cada projeto">
          <div className="ol-roles">
            <div><span className="ol-role ol-role--admin">Administrador</span><p>Edita etapas, nome e pessoas do projeto, arquiva e restaura.</p></div>
            <div><span className="ol-role">Membro</span><p>Cria e trabalha nas demandas, comenta e envia anexos.</p></div>
          </div>
        </Card>
      </div>
      {adding && <AddPersonModal onClose={() => setAdding(false)} />}
      {removing && <Confirm title={`Remover ${removing.short} da equipe?`} text="A pessoa continua nos projetos em que já está. Você só deixa de poder incluí-la em novos."
        confirmLabel="Remover" danger onClose={() => setRemoving(null)}
        onConfirm={async () => { await api.delete(`/team/${removing.id}`); await refreshTeam(); toast.success("Removida da equipe"); }} />}
    </div>
  );
}
