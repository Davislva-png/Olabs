import React, { useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import "@/App.css";
import api, { getToken, setToken } from "@/lib/api";
import { StoreProvider, useStore } from "@/olabs/store";
import { NavProvider, Sidebar, ThemeCtx, useNav } from "@/olabs/Shell";
import DemandDrawer from "@/olabs/DemandDrawer";
import { NewDemandModal } from "@/olabs/modals";
import { Logo } from "@/olabs/ui";
import AuthScreen from "@/screens/Auth";
import HomeScreen from "@/screens/Home";
import BoardScreen from "@/screens/Board";
import SavedViewScreen from "@/screens/SavedView";
import ProjectsScreen from "@/screens/Projects";
import TeamScreen from "@/screens/Team";
import SettingsScreen from "@/screens/Settings";
import ProfileScreen from "@/screens/Profile";

function Splash() {
  return <div className="ol-splash"><Logo variant="tile" size={56} /><span className="ol-spin ol-spin--lg" /></div>;
}

function Shell() {
  const { route } = useNav();
  const { loaded, newDemand, setNewDemand, openDemand, setOpenDemand } = useStore();
  const [sidebar, setSidebar] = useState(false);
  const theme = React.useContext(ThemeCtx);
  useEffect(() => {
    const k = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.metaKey || e.ctrlKey) return;
      if (e.key === "n" && !document.querySelector(".ol-modal")) { e.preventDefault(); setNewDemand({}); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [setNewDemand]);
  if (!loaded) return <Splash />;
  let screen;
  if (route === "board") screen = <BoardScreen />;
  else if (route === "mine" || route === "week") screen = <SavedViewScreen kind={route} key={route} />;
  else if (route === "projects") screen = <ProjectsScreen />;
  else if (route === "team") screen = <TeamScreen />;
  else if (route === "settings") screen = <SettingsScreen />;
  else if (route === "profile") screen = <ProfileScreen />;
  else screen = <HomeScreen />;
  return (
    <ThemeCtx.Provider value={{ ...theme, toggleSidebar: () => setSidebar((s) => !s) }}>
      <div className="ol-app">
        <Sidebar open={sidebar} onClose={() => setSidebar(false)} />
        {sidebar && <div className="ol-sidebar__scrim" onClick={() => setSidebar(false)} />}
        <main className="ol-main">{screen}</main>
        {openDemand && <DemandDrawer demandId={openDemand} onClose={() => setOpenDemand(null)} />}
        {newDemand && <NewDemandModal init={newDemand} onClose={() => setNewDemand(null)} />}
      </div>
    </ThemeCtx.Provider>
  );
}

export default function App() {
  const [theme, setThemeState] = useState(() => localStorage.getItem("olabs_theme") ||
    (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("olabs_theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!getToken()) return;
    api.get("/auth/me").then((r) => setMe(r.data)).catch(() => setToken(null)).finally(() => setChecking(false));
  }, []);
  const logout = useCallback(() => { setToken(null); setMe(null); window.location.hash = "#/entrar"; }, []);
  const themeValue = { theme, setTheme: setThemeState, toggleTheme: () => setThemeState((t) => (t === "dark" ? "light" : "dark")) };
  return (
    <ThemeCtx.Provider value={themeValue}>
      <Toaster position="bottom-right" theme={theme} richColors closeButton />
      {checking ? <Splash /> : !me ? <AuthScreen onAuthed={setMe} /> : (
        <NavProvider>
          <StoreProvider me={me} onLogout={logout} key={me.id}><Shell /></StoreProvider>
        </NavProvider>
      )}
    </ThemeCtx.Provider>
  );
}
