import React, { useEffect, useRef, useState } from "react";
import ICONS from "./icons";
import LOGO from "./logoPaths";
import { cx, PRIO, daysFrom, fmtDay, initials, COLORS, COLOR_LABEL } from "./utils";
import { avatarUrl } from "@/lib/api";

export function Icon({ name, size = 18, stroke = 1.75, className, style, label }) {
  return (
    <svg className={cx("ol-icon", className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} aria-label={label}
      role={label ? "img" : undefined} style={style} dangerouslySetInnerHTML={{ __html: ICONS[name] || "" }} />
  );
}

export function Logo({ variant = "lockup", size = 28, className }) {
  if (variant === "tile")
    return (
      <span className={cx("ol-logo-tile", className)} style={{ width: size, height: size }}>
        <svg viewBox="0 0 267 158" width={size * 0.72} height={(size * 0.72 * 158) / 267} aria-hidden="true">
          <path fill="currentColor" fillRule="evenodd" d={LOGO.eagle} />
        </svg>
      </span>
    );
  if (variant === "wordmark")
    return (
      <svg className={className} viewBox="0 0 270 85" height={size} width={(size * 270) / 85} role="img" aria-label="Olabs">
        <path fill="currentColor" fillRule="evenodd" d={LOGO.word} />
      </svg>
    );
  return (
    <svg className={className} viewBox="0 0 548 158" height={size} width={(size * 548) / 158} role="img" aria-label="Olabs">
      <g fill="currentColor" fillRule="evenodd">
        <path d={LOGO.eagle} />
        <path transform="translate(278 34)" d={LOGO.word} />
      </g>
    </svg>
  );
}

export function Button({ variant = "secondary", size = "md", icon, iconRight, children, className, loading, disabled, ...rest }) {
  return (
    <button type="button" {...rest} disabled={disabled || loading}
      className={cx("ol-btn", "ol-btn--" + variant, "ol-btn--" + size, !children && "ol-btn--icononly", className)}>
      {loading ? <span className="ol-spin" /> : icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 14 : 16} />}
    </button>
  );
}

export function IconButton({ icon, label, variant = "surface", size = "md", badge, active, className, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={cx("ol-iconbtn", "ol-iconbtn--" + variant, "ol-iconbtn--" + size, active && "is-active", className)}>
      <Icon name={icon} size={size === "sm" ? 16 : size === "lg" ? 20 : 18} />
      {badge ? <span className="ol-iconbtn__badge" aria-hidden="true" /> : null}
    </button>
  );
}

export function Avatar({ person, name, color, size = 32, online, ring, className }) {
  const n = name || person?.name || "?";
  const c = color || person?.color || "slate";
  const on = online !== undefined ? online : person?.online;
  const dot = Math.min(16, Math.max(8, size * 0.28));
  return (
    <span className={cx("ol-avatar", ring && "ol-avatar--ring", className)} title={n}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: `var(--${c}-soft)`, color: `var(--${c}-strong)` }}>
      {person?.avatar_v ? <img className="ol-avatar__img" src={avatarUrl(person)} alt={n} /> : initials(n)}
      {on ? <span className="ol-avatar__dot" style={{ width: dot, height: dot }} aria-label="online" /> : null}
    </span>
  );
}

export function AvatarStack({ people = [], max = 4, size = 28 }) {
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <span className="ol-avatars">
      {shown.map((p) => <Avatar key={p.id} person={p} size={size} ring online={false} />)}
      {more > 0 && (
        <span className="ol-avatar ol-avatar--ring ol-avatar--more" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>+{more}</span>
      )}
    </span>
  );
}

export function Person({ person, size = 26, sub }) {
  if (!person) return <span className="ol-person ol-muted">—</span>;
  return (
    <span className="ol-person">
      <Avatar person={person} size={size} online={false} />
      <span className="ol-person__txt">
        <span className="ol-person__name">{person.short || person.name}</span>
        {sub && <span className="ol-person__sub">{person.role || person.email}</span>}
      </span>
    </span>
  );
}

export function ProjectTile({ project, size = 28 }) {
  const c = project?.color || "slate";
  return (
    <span className="ol-ptile" style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: `var(--${c}-soft)`,
      color: `var(--${c}-strong)`, borderRadius: size >= 40 ? "var(--radius-md)" : "var(--radius-sm)" }}>
      {project?.code}
    </span>
  );
}

export function StageBadge({ stage, block, size = "md", onClick }) {
  const s = stage || { name: "—", color: "slate" };
  const Tag = onClick ? "button" : "span";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={cx("ol-stage", block && "ol-stage--block", "ol-stage--" + size)}
      style={{ background: `var(--${s.color}-soft)`, color: `var(--${s.color}-strong)` }}>
      <span className="ol-stage__dot" style={{ background: `var(--${s.color})` }} />
      {s.name}
    </Tag>
  );
}

export function Priority({ level = "media", compact }) {
  const o = PRIO[level] || PRIO.media;
  return (
    <span className={cx("ol-prio", compact && "ol-prio--compact")} style={{ color: `var(--${o.color}-strong)` }}>
      <span className="ol-prio__icon" style={{ background: `var(--${o.color}-soft)` }}>
        <Icon name={o.icon} size={13} stroke={2.25} />
      </span>
      {o.label}
    </span>
  );
}

export function Tag({ tag, main, onRemove }) {
  const c = tag.color || "slate";
  return (
    <span className={cx("ol-tag", main && "ol-tag--main")} style={main ? { background: `var(--${c}-soft)`, color: `var(--${c}-strong)` } : undefined}>
      <span className="ol-tag__dot" style={{ background: `var(--${c})` }} />
      {tag.name}
      {onRemove && (
        <button type="button" className="ol-tag__x" aria-label={"Remover " + tag.name} onClick={onRemove}>
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}

export function Tags({ tags = [], max = 2 }) {
  const shown = tags.slice(0, max);
  const more = tags.length - shown.length;
  return (
    <span className="ol-tags">
      {shown.map((t, i) => <Tag key={t.name} tag={t} main={i === 0} />)}
      {more > 0 && <span className="ol-tag ol-tag--more">+{more}</span>}
    </span>
  );
}

export function DueDate({ date, done, long }) {
  if (!date) return <span className="ol-due ol-due--none">Sem prazo</span>;
  const n = daysFrom(date);
  let kind = "normal", label = fmtDay(date), icon = "calendar";
  if (done) { kind = "done"; icon = "check"; }
  else if (n < 0) { kind = "late"; icon = "circle-alert"; label = long ? "Atrasada · " + fmtDay(date) : fmtDay(date); }
  else if (n === 0) { kind = "today"; icon = "clock"; label = "Hoje"; }
  else if (n === 1) { kind = "soon"; label = "Amanhã"; }
  return (
    <span className={"ol-due ol-due--" + kind} title={kind === "late" ? "Atrasada" : undefined}>
      <Icon name={icon} size={14} stroke={2} />
      {label}
    </span>
  );
}

export function ViewTabs({ items, value, onChange, size = "md" }) {
  return (
    <div className={cx("ol-tabs", "ol-tabs--" + size)} role="tablist">
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" aria-selected={value === it.id} data-testid={`tab-${it.id}`}
          className={cx("ol-tabs__item", value === it.id && "is-active")} onClick={() => onChange && onChange(it.id)}>
          {it.icon && <Icon name={it.icon} size={16} />}
          <span>{it.label}</span>
          {it.count !== undefined && <span className="ol-tabs__count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className, pad = true, style, testid }) {
  return (
    <section className={cx("ol-card", !pad && "ol-card--flush", className)} style={style} data-testid={testid}>
      {(title || actions) && (
        <header className="ol-card__head">
          <div>
            {title && <h3 className="ol-card__title">{title}</h3>}
            {subtitle && <p className="ol-card__sub">{subtitle}</p>}
          </div>
          {actions && <div className="ol-card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint, icon, color = "sky" }) {
  return (
    <div className="ol-stat">
      <div className="ol-stat__top">
        <span className="ol-stat__icon" style={{ background: `var(--${color}-soft)`, color: `var(--${color}-strong)` }}><Icon name={icon} size={18} /></span>
        <span className="ol-stat__label">{label}</span>
      </div>
      <div className="ol-stat__value">{value}</div>
      {hint && <div className="ol-stat__hint">{hint}</div>}
    </div>
  );
}

export function StageBar({ segments, legend = true, height = 10 }) {
  return (
    <div className="ol-stagebar">
      <div className="ol-stagebar__track" style={{ height }}>
        {segments.filter((s) => s.count > 0).map((s) => (
          <span key={s.name} style={{ flexGrow: s.count, background: `var(--${s.color})` }} title={s.name + ": " + s.count} />
        ))}
      </div>
      {legend && (
        <div className="ol-stagebar__legend">
          {segments.map((s) => (
            <span key={s.name} className="ol-stagebar__item">
              <span className="ol-stagebar__dot" style={{ background: `var(--${s.color})` }} />
              {s.name}
              <b>{s.count}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function StageProgress({ stages, current, onSelect }) {
  return (
    <ol className="ol-steps">
      {stages.map((s, n) => {
        const st = n < current ? "done" : n === current ? "current" : "next";
        return (
          <li key={s.id || s.name} className={"ol-steps__item is-" + st}
            style={{ "--c": `var(--${s.color})`, "--cs": `var(--${s.color}-strong)`, "--csoft": `var(--${s.color}-soft)` }}>
            <button type="button" className="ol-steps__btn" onClick={() => onSelect && onSelect(n)} aria-current={st === "current" ? "step" : undefined}
              data-testid={`stage-step-${n}`}>
              <span className="ol-steps__node">
                {st === "done" ? <Icon name="check" size={14} stroke={2.5} /> : st === "current" ? <span className="ol-steps__core" /> : n + 1}
              </span>
              <span className="ol-steps__label">{s.name}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function WorkloadBar({ segments, max = 8 }) {
  const total = segments.reduce((a, s) => a + s.count, 0);
  const m = Math.max(max, total);
  return (
    <div className="ol-load">
      <div className="ol-load__track">
        {segments.filter((s) => s.count > 0).map((s) => (
          <span key={s.name} title={s.name + ": " + s.count} style={{ width: (s.count / m) * 100 + "%", background: `var(--${s.color})` }} />
        ))}
      </div>
      <b className="ol-load__n">{total}</b>
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, hint, multiline, icon, type = "text", rows = 3, testid, autoFocus, onKeyDown, right }) {
  return (
    <label className="ol-field">
      {label && <span className="ol-field__label">{label}</span>}
      <span className={cx("ol-field__box", multiline && "ol-field__box--multi")}>
        {icon && <Icon name={icon} size={16} />}
        {multiline ? (
          <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={testid} autoFocus={autoFocus} />
        ) : (
          <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={testid}
            autoFocus={autoFocus} onKeyDown={onKeyDown} />
        )}
        {right}
      </span>
      {hint && <span className="ol-field__hint">{hint}</span>}
    </label>
  );
}

export function SelectField({ label, value, onChange, options, icon, hint, testid }) {
  return (
    <label className="ol-field">
      {label && <span className="ol-field__label">{label}</span>}
      <span className="ol-field__box ol-field__native">
        {icon && <Icon name={icon} size={16} />}
        <select value={value} onChange={(e) => onChange && onChange(e.target.value)} data-testid={testid}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Icon name="chevron-down" size={16} className="ol-field__chev" />
      </span>
      {hint && <span className="ol-field__hint">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, description, testid }) {
  return (
    <div className="ol-switchrow">
      {(label || description) && (
        <div className="ol-switchrow__txt">
          {label && <span className="ol-switchrow__label">{label}</span>}
          {description && <span className="ol-switchrow__desc">{description}</span>}
        </div>
      )}
      <button type="button" role="switch" aria-checked={checked} aria-label={label} data-testid={testid}
        className={cx("ol-switch", checked && "is-on")} onClick={() => onChange(!checked)}>
        <span className="ol-switch__knob" />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label = "Selecionar", testid }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} data-testid={testid}
      className={cx("ol-check", checked && "is-on")} onClick={(e) => { e.stopPropagation(); onChange(!checked); }}>
      {checked && <Icon name="check" size={12} stroke={3} />}
    </button>
  );
}

export function Modal({ title, subtitle, children, footer, onClose, width = 560, testid }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="ol-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className="ol-modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title} data-testid={testid}>
        <header className="ol-modal__head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton icon="x" label="Fechar" variant="ghost" onClick={onClose} data-testid="modal-close" />
        </header>
        <div className="ol-modal__body">{children}</div>
        {footer && <footer className="ol-modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Confirm({ title, text, confirmLabel = "Confirmar", danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} subtitle={text} onClose={onClose} width={460} testid="confirm-dialog"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant={danger ? "coral" : "primary"} loading={busy} data-testid="confirm-ok"
          onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>{confirmLabel}</Button>
      </>} />
  );
}

export function Empty({ icon = "inbox", title, text, action }) {
  return (
    <div className="ol-empty">
      <span className="ol-empty__icon"><Icon name={icon} size={22} /></span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

const FILE_TYPES = {
  image: { icon: "file-image", color: "lilac", label: "Imagem" },
  sheet: { icon: "file-spreadsheet", color: "teal", label: "Planilha" },
  pdf: { icon: "file-text", color: "coral", label: "PDF" },
  video: { icon: "video", color: "sky", label: "Vídeo" },
  other: { icon: "file", color: "slate", label: "Arquivo" },
};
export const fileType = (t) => FILE_TYPES[t] || FILE_TYPES.other;

export function FileIcon({ type, size = 40 }) {
  const o = fileType(type);
  return (
    <span className="ol-fileicon" style={{ width: size, height: size, background: `var(--${o.color}-soft)`, color: `var(--${o.color}-strong)` }}>
      <Icon name={o.icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

/* Dropdown menu anchored to its trigger */
export function Menu({ trigger, children, align = "right", width = 240, className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const k = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <span className={cx("ol-menuwrap", className)} ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={cx("ol-menu", "ol-menu--" + align)} style={{ width }} onClick={(e) => e.stopPropagation()}>
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </span>
  );
}

export function MenuItem({ icon, children, onClick, danger, active, testid, right }) {
  return (
    <button type="button" className={cx("ol-menu__item", danger && "is-danger", active && "is-active")} onClick={onClick} data-testid={testid}>
      {icon && <Icon name={icon} size={16} />}
      <span className="ol-menu__label">{children}</span>
      {right}
      {active && <Icon name="check" size={14} stroke={2.5} />}
    </button>
  );
}

export function ColorPick({ value, onChange }) {
  return (
    <div className="ol-colorpick" role="radiogroup">
      {COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} title={COLOR_LABEL[c]} data-testid={`color-${c}`}
          className={cx("ol-colorpick__sw", value === c && "is-on")} style={{ background: `var(--${c})` }} onClick={() => onChange(c)}>
          {value === c && <Icon name="check" size={14} stroke={3} />}
        </button>
      ))}
    </div>
  );
}

export function Donut({ segments, size = 168, stroke = 18 }) {
  const total = segments.reduce((a, s) => a + s.count, 0);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const gap = total > 1 ? 10 : 0;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ol-donut" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--on-feature)" strokeOpacity=".08" strokeWidth={stroke} />
      {total > 0 && segments.filter((s) => s.count).map((s) => {
        const len = (s.count / total) * circ;
        const el = (
          <circle key={s.name} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`var(--${s.color})`} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${Math.max(len - gap, 1)} ${circ}`} strokeDashoffset={-off}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        );
        off += len;
        return el;
      })}
    </svg>
  );
}
