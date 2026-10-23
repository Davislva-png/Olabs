import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { today, weekRange } from "./utils";

const Store = createContext(null);
export const useStore = () => useContext(Store);

export function StoreProvider({ me: initialMe, onLogout, children }) {
  const [me, setMe] = useState(initialMe);
  const [projects, setProjects] = useState([]);
  const [demands, setDemands] = useState([]);
  const [team, setTeam] = useState({ people: [], invites: [] });
  const [settings, setSettings] = useState({ default_stages: [], tags: [], notif: {} });
  const [notifications, setNotifications] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [newDemand, setNewDemand] = useState(null); // init object or null
  const [openDemand, setOpenDemand] = useState(null); // demand id

  const refreshProjects = useCallback(async () => setProjects((await api.get("/projects")).data), []);
  const refreshDemands = useCallback(async () => setDemands((await api.get("/demands")).data), []);
  const refreshTeam = useCallback(async () => setTeam((await api.get("/team")).data), []);
  const refreshSettings = useCallback(async () => setSettings((await api.get("/settings")).data), []);
  const refreshNotifications = useCallback(async () => setNotifications((await api.get("/notifications")).data), []);
  const refreshActivity = useCallback(async () => setActivity((await api.get("/activity?limit=10")).data), []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshProjects(), refreshDemands(), refreshTeam(), refreshSettings(), refreshNotifications(), refreshActivity()]);
    setLoaded(true);
  }, [refreshProjects, refreshDemands, refreshTeam, refreshSettings, refreshNotifications, refreshActivity]);

  // after a mutation on demands
  const refreshWork = useCallback(async () => {
    await Promise.all([refreshDemands(), refreshProjects(), refreshActivity()]);
  }, [refreshDemands, refreshProjects, refreshActivity]);

  useEffect(() => { refreshAll().catch(() => setLoaded(true)); }, [refreshAll]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      Promise.all([refreshDemands(), refreshNotifications(), refreshActivity(), refreshProjects()]).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [refreshDemands, refreshNotifications, refreshActivity, refreshProjects]);

  const peopleMap = useMemo(() => {
    const m = {};
    team.people.forEach((p) => (m[p.id] = p));
    m[me.id] = { ...(m[me.id] || {}), ...me, online: true };
    return m;
  }, [team.people, me]);

  const projectMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const activeProjects = useMemo(() => projects.filter((p) => !p.archived), [projects]);
  const visibleDemands = useMemo(() => demands.filter((d) => projectMap[d.project_id] && !projectMap[d.project_id].archived), [demands, projectMap]);

  const stageOf = useCallback((d) => {
    const p = projectMap[d.project_id];
    return (p && p.stages.find((s) => s.id === d.stage_id)) || (p && p.stages[0]) || { name: "—", color: "slate", kind: "todo" };
  }, [projectMap]);
  const isDone = useCallback((d) => stageOf(d).kind === "done", [stageOf]);
  const person = useCallback((id) => peopleMap[id], [peopleMap]);

  const counts = useMemo(() => {
    const open = visibleDemands.filter((d) => !isDone(d));
    const [ws, we] = weekRange();
    return {
      mine: open.filter((d) => d.resp_id === me.id).length,
      week: open.filter((d) => d.due && d.due >= ws && d.due <= we).length,
      today: today(),
    };
  }, [visibleDemands, isDone, me.id]);

  // all tags known: my library + tags used in visible demands
  const tagLibrary = useMemo(() => {
    const m = new Map();
    (settings.tags || []).forEach((t) => m.set(t.name, t));
    visibleDemands.forEach((d) => d.tags.forEach((t) => !m.has(t.name) && m.set(t.name, t)));
    return [...m.values()];
  }, [settings.tags, visibleDemands]);

  const updateDemand = useCallback(async (id, patch) => {
    setDemands((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    try {
      const r = await api.put(`/demands/${id}`, patch);
      setDemands((ds) => ds.map((d) => (d.id === id ? r.data : d)));
      refreshActivity().catch(() => {});
      return r.data;
    } catch (e) {
      refreshDemands().catch(() => {});
      throw e;
    }
  }, [refreshActivity, refreshDemands]);

  const value = {
    me, setMe, onLogout, loaded,
    projects, activeProjects, projectMap, demands: visibleDemands, allDemands: demands, team, settings, setSettings,
    notifications, activity, peopleMap, person, stageOf, isDone, counts, tagLibrary,
    refreshAll, refreshProjects, refreshDemands, refreshTeam, refreshSettings, refreshNotifications, refreshActivity, refreshWork,
    setProjects, setDemands, updateDemand,
    newDemand, setNewDemand, openDemand, setOpenDemand,
  };
  return <Store.Provider value={value}>{children}</Store.Provider>;
}
