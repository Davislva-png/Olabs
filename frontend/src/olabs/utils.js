export const cx = (...a) => a.filter(Boolean).join(" ");

export const COLORS = ["sky", "lilac", "amber", "teal", "coral", "slate"];
export const COLOR_LABEL = { sky: "Azul", lilac: "Lilás", amber: "Âmbar", teal: "Verde", coral: "Coral", slate: "Cinza" };
export const KINDS = [
  { id: "todo", label: "A fazer" },
  { id: "doing", label: "Em andamento" },
  { id: "waiting", label: "Em aguardo" },
  { id: "done", label: "Concluída" },
];
export const KIND_SEGMENTS = [
  { kind: "todo", name: "Pedido", color: "sky" },
  { kind: "doing", name: "Em andamento", color: "lilac" },
  { kind: "waiting", name: "Em aguardo", color: "amber" },
];
export const PRIO = {
  alta: { label: "Alta", icon: "arrow-up", color: "coral", rank: 0 },
  media: { label: "Média", icon: "equal", color: "amber", rank: 1 },
  baixa: { label: "Baixa", icon: "arrow-down", color: "slate", rank: 2 },
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

const pad = (n) => String(n).padStart(2, "0");
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => toISO(new Date());
export const addDays = (iso, n) => {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const daysFrom = (iso, base = today()) => Math.round((parse(iso) - parse(base)) / 864e5);
export const fmtDay = (iso) => {
  if (!iso) return "";
  const d = parse(iso);
  return d.getDate() + " " + MONTHS[d.getMonth()];
};
export const weekRange = () => {
  const t = parse(today());
  const dow = (t.getDay() + 6) % 7;
  const start = new Date(t);
  start.setDate(t.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [toISO(start), toISO(end)];
};
export const longToday = () => {
  const d = new Date();
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
};
export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};
export const isoDay = (ts) => (ts ? toISO(new Date(ts)) : null);

export const timeAgo = (ts) => {
  if (!ts) return "";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  const d = new Date(ts);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (toISO(d) === toISO(y)) return `ontem, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return fmtDay(toISO(d));
};
export const stamp = (ts) => {
  const d = new Date(ts);
  return `${fmtDay(toISO(d))}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtSize = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
};

export const initials = (name = "?") =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

export const byDue = (a, b) => {
  if (!a.due && !b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
};

export const stageSegments = (stages, demands) =>
  stages.map((s) => ({ name: s.name, color: s.color, count: demands.filter((d) => d.stage_id === s.id).length }));

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
