import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./store";
import { Avatar, Icon, IconButton, Logo, ProjectTile, Menu, MenuItem, StageBadge, Empty } from "./ui";
import { cx, timeAgo } from "./utils";
import api from "@/lib/api";

/* ------------------------------------------------------------------ hash router */
const ROUTES = { home: "inicio", projects: "projetos", team: "equipe", settings: "configuracoes", profile: "perfil", mine: "atribuidas-a-mim", week: "vencem-esta-semana" };
const VIEWS = { table: "tabela", kanban: "kanban", calendar: "calendario", files: "arquivos" };
const inv = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));

export function parseHash(hash) {
  const [path, qs] = (hash || "").replace(/^#\/?/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(qs || ""));
  if (parts[0] === "quadro" && parts[1]) return { route: "board", projectId: parts[1], view: inv(VIEWS)[parts[2]] || "table", query };
  return { route: inv(ROUTES)[parts[0]] || "home", query };
}
export const buildHash = (route, opts = {}) =>
  route === "board" ? `#/quadro/${opts.projectId}/${VIEWS[opts.view || "table"]}` : `#/${ROUTES[route] || "inicio"}`;

const Nav = createContext(null);
export const useNav = () => useContext(Nav);

export function NavProvider({ children }) {
  const [loc, setLoc] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const h = () => setLoc(parseHash(window.location.hash));
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const nav = (route, opts = {}) => {
    const h = buildHash(route, opts) + (opts.query ? "?" + new URLSearchParams(opts.query).toString() : "");
    if (window.location.hash !== h) window.location.hash = h;
    window.scrollTo(0, 0);
  };
  return <Nav.Provider value={{ ...loc, nav }}>{children}</Nav.Provider>;
}

/* ------------------------------------------------------------------ sidebar */
function NavItem({ icon, label, active, count, onClick, tile, fav, testid }) {
  return (
    <button type="button" className={cx("ol-nav__item", active && "is-active")} onClick={onClick} aria-current={active ? "page" : undefined} data-testid={testid}>
      {tile || <Icon name={icon} size={20} />}
      <span className="ol-nav__label">{label}</span>
      {fav && <Icon name="star" size={14} className="ol-nav__fav" />}
      {count !== undefined && <span className="ol-nav__count">{count}</span>}
    </button>
  );
}

export function Sidebar({ open, onClose }) {
  const { route, projectId, nav } = useNav();
  const { me, activeProjects, counts } = useStore();
  const favs = activeProjects.filter((p) => p.fav);
  const rest = activeProjects.filter((p) => !p.fav);
  const go = (r, o) => { nav(r, o); onClose && onClose(); };
  return (
    <nav className={cx("ol-sidebar", open && "is-open")} aria-label="Navegação principal">
      <div className="ol-sidebar__brand">
        <Logo variant="tile" size={40} />
        <Logo variant="wordmark" size={22} className="ol-sidebar__word" />
      </div>
      <div className="ol-nav">
        <NavItem icon="house" label="Início" active={route === "home"} onClick={() => go("home")} testid="nav-home" />
        <NavItem icon="folder-kanban" label="Projetos" active={route === "projects"} onClick={() => go("projects")} testid="nav-projects" />
        <NavItem icon="users" label="Equipe" active={route === "team"} onClick={() => go("team")} testid="nav-team" />
        <NavItem icon="settings" label="Configurações" active={route === "settings"} onClick={() => go("settings")} testid="nav-settings" />
      </div>
      <div className="ol-nav">
        <span className="ol-nav__section">Visões salvas</span>
        <NavItem icon="square-check-big" label="Atribuídas a mim" active={route === "mine"} count={counts.mine} onClick={() => go("mine")} testid="nav-mine" />
        <NavItem icon="calendar-clock" label="Vencem esta semana" active={route === "week"} count={counts.week} onClick={() => go("week")} testid="nav-week" />
      </div>
      <div className="ol-nav ol-nav--projects">
        <span className="ol-nav__section">
          Projetos
          <button type="button" className="ol-nav__add" aria-label="Novo projeto" data-testid="nav-new-project" onClick={() => go("projects", { query: { novo: 1 } })}>
            <Icon name="plus" size={14} stroke={2.25} />
          </button>
        </span>
        {[...favs, ...rest].map((p) => (
          <NavItem key={p.id} label={p.name} fav={p.fav} tile={<ProjectTile project={p} size={24} />} testid={`nav-project-${p.id}`}
            active={route === "board" && projectId === p.id} onClick={() => go("board", { projectId: p.id })} />
        ))}
        {activeProjects.length === 0 && <span className="ol-nav__empty">Nenhum projeto ainda</span>}
      </div>
      <div className="ol-sidebar__foot">
        <button type="button" className={cx("ol-me", route === "profile" && "is-active")} onClick={() => go("profile")} data-testid="nav-profile">
          <Avatar person={me} size={36} online />
          <span className="ol-me__txt">
            <b>{me.name}</b>
            <span>{me.role || me.email}</span>
          </span>
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ search */
function GlobalSearch() {
  const { demands, activeProjects, projectMap, stageOf, setOpenDemand } = useStore();
  const { nav } = useNav();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    };
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    window.addEventListener("keydown", k);
    document.addEventListener("mousedown", h);
    return () => { window.removeEventListener("keydown", k); document.removeEventListener("mousedown", h); };
  }, []);
  const term = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!term) return { ds: [], ps: [] };
    return {
      ps: activeProjects.filter((p) => p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)).slice(0, 4),
      ds: demands.filter((d) => d.title.toLowerCase().includes(term) || d.code.toLowerCase().includes(term) || (d.desc || "").toLowerCase().includes(term)).slice(0, 8),
    };
  }, [term, demands, activeProjects]);
  const close = () => { setOpen(false); setQ(""); };
  return (
    <div className="ol-searchwrap" ref={ref}>
      <label className="ol-search ol-search--lg" style={{ width: 300 }}>
        <Icon name="search" size={20} />
        <input ref={inputRef} placeholder="Buscar no Olabs" aria-label="Buscar no Olabs" value={q} data-testid="global-search"
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => e.key === "Escape" && close()} />
        <kbd>⌘K</kbd>
      </label>
      {open && term && (
        <div className="ol-menu ol-menu--right ol-searchpop" data-testid="search-results">
          {results.ps.length === 0 && results.ds.length === 0 && <div className="ol-menu__empty">Nada encontrado para “{q}”</div>}
          {results.ps.length > 0 && <div className="ol-menu__section">Projetos</div>}
          {results.ps.map((p) => (
            <button key={p.id} type="button" className="ol-menu__item" onClick={() => { nav("board", { projectId: p.id }); close(); }}>
              <ProjectTile project={p} size={22} /><span className="ol-menu__label">{p.name}</span>
            </button>
          ))}
          {results.ds.length > 0 && <div className="ol-menu__section">Demandas</div>}
          {results.ds.map((d) => (
            <button key={d.id} type="button" className="ol-menu__item" onClick={() => { setOpenDemand(d.id); close(); }} data-testid={`search-result-${d.code}`}>
              <span className="ol-table__id">{d.code}</span>
              <span className="ol-menu__label">{d.title}<small>{projectMap[d.project_id]?.name}</small></span>
              <StageBadge stage={stageOf(d)} size="sm" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ notifications */
function Notifications() {
  const { notifications, refreshNotifications, setOpenDemand, person, allDemands } = useStore();
  const { nav } = useNav();
  const unread = notifications.filter((n) => !n.read).length;
  const open = async (n, close) => {
    close();
    if (!n.read) api.post(`/notifications/${n.id}/read`).then(refreshNotifications).catch(() => {});
    if (n.demand_id && allDemands.some((d) => d.id === n.demand_id)) setOpenDemand(n.demand_id);
    else if (n.project_id) nav("board", { projectId: n.project_id });
    else if (n.kind === "team") nav("team");
  };
  return (
    <Menu width={380} trigger={({ toggle }) => (
      <IconButton icon="bell" label="Notificações" badge={unread > 0} size="lg" onClick={() => { toggle(); refreshNotifications().catch(() => {}); }} data-testid="notifications-btn" />
    )}>
      {(close) => (
        <div className="ol-notif" data-testid="notifications-panel">
          <div className="ol-notif__head">
            <b>Notificações</b>
            {unread > 0 && (
              <button type="button" className="ol-link ol-notif__all" data-testid="notifications-read-all"
                onClick={() => api.post("/notifications/read-all").then(refreshNotifications)}>Marcar todas como lidas</button>
            )}
          </div>
          {notifications.length === 0 ? (
            <Empty icon="bell" title="Tudo em dia" text="Avisos de atribuições, comentários, menções e prazos aparecem aqui." />
          ) : (
            <div className="ol-notif__list">
              {notifications.map((n) => {
                const actor = n.actor && person(n.actor);
                return (
                  <button key={n.id} type="button" className={cx("ol-notif__row", !n.read && "is-unread")} onClick={() => open(n, close)}>
                    {actor ? <Avatar person={actor} size={32} online={false} /> : (
                      <span className="ol-stat__icon" style={{ background: "var(--amber-soft)", color: "var(--amber-strong)", width: 32, height: 32 }}><Icon name="clock" size={16} /></span>
                    )}
                    <span className="ol-notif__txt"><span>{n.text}</span><small>{timeAgo(n.created_at)}</small></span>
                    {!n.read && <i className="ol-notif__dot" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Menu>
  );
}

/* ------------------------------------------------------------------ topbar */
export const ThemeCtx = createContext({});

export function TopBar({ title, subtitle, children, lead }) {
  const { me, onLogout } = useStore();
  const { nav } = useNav();
  const theme = useContext(ThemeCtx);
  return (
    <header className="ol-topbar">
      <div className="ol-topbar__title">
        <IconButton icon="panel-left" label="Menu" className="ol-menutoggle" onClick={theme.toggleSidebar} />
        {lead}
        <div>
          {title && <h1 data-testid="page-title">{title}</h1>}
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="ol-topbar__tools">
        {children}
        <GlobalSearch />
        <IconButton icon={theme.theme === "dark" ? "sun" : "moon"} label={theme.theme === "dark" ? "Tema claro" : "Tema escuro"} size="lg"
          onClick={theme.toggleTheme} data-testid="theme-toggle" />
        <Notifications />
        <Menu width={220} trigger={({ toggle }) => (
          <button type="button" className="ol-userchip" onClick={toggle} data-testid="user-menu">
            <Avatar person={me} size={36} online />
            <span className="ol-userchip__txt"><b>{me.short}</b><span>{me.role || "Sem cargo"}</span></span>
            <Icon name="chevron-down" size={16} />
          </button>
        )}>
          {(close) => (
            <>
              <MenuItem icon="user" onClick={() => { close(); nav("profile"); }}>Meu perfil</MenuItem>
              <MenuItem icon="settings" onClick={() => { close(); nav("settings"); }}>Configurações</MenuItem>
              <MenuItem icon="log-out" danger onClick={onLogout} testid="logout-btn">Sair</MenuItem>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}
