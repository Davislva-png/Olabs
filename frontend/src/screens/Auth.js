import React, { useState } from "react";
import api, { errMsg, setToken } from "@/lib/api";
import { Button, Logo, TextField, Icon } from "@/olabs/ui";
import { parseHash } from "@/olabs/Shell";

export default function AuthScreen({ onAuthed }) {
  const initial = parseHash(window.location.hash);
  const [mode, setMode] = useState(window.location.hash.startsWith("#/cadastro") ? "register" : "login");
  const [f, setF] = useState({ name: "", email: initial.query.email || "", password: "", role: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const switchMode = (m) => { setMode(m); setError(""); window.location.hash = m === "register" ? "#/cadastro" : "#/entrar"; };
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = mode === "login" ? await api.post("/auth/login", { email: f.email, password: f.password }) : await api.post("/auth/register", f);
      setToken(r.data.token);
      window.location.hash = "#/inicio";
      onAuthed(r.data.user);
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  const eye = <button type="button" className="ol-tag__x" onClick={() => setShow((s) => !s)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}><Icon name={show ? "eye-off" : "eye"} size={16} /></button>;
  return (
    <div className="ol-auth">
      <div className="ol-auth__side" style={{ backgroundImage: "url(/olabs-key.webp)" }}>
        <div className="ol-auth__quote"><b>Back office de demandas</b><span>Quem pediu, quem faz, em que etapa está e quando vence — tudo num só lugar.</span></div>
      </div>
      <main className="ol-auth__main">
        <form className="ol-auth__card" onSubmit={submit} data-testid="auth-form">
          <div className="ol-auth__brand"><Logo variant="tile" size={44} /><Logo variant="wordmark" size={24} /></div>
          <div>
            <h1>{mode === "login" ? "Entrar no Olabs" : "Criar sua conta"}</h1>
            <p>{mode === "login" ? "Use o e-mail e a senha da sua conta." : "Depois é só adicionar as pessoas da equipe pelo e-mail."}</p>
          </div>
          {mode === "register" && (
            <div className="ol-formgrid">
              <TextField label="Nome completo" value={f.name} onChange={set("name")} autoFocus testid="auth-name" placeholder="Davi Silva" />
              <TextField label="Cargo" value={f.role} onChange={set("role")} testid="auth-role" placeholder="Opcional" />
            </div>
          )}
          <TextField label="E-mail" type="email" icon="mail" value={f.email} onChange={set("email")} autoFocus={mode === "login"} testid="auth-email" placeholder="nome@empresa.com" />
          <TextField label="Senha" type={show ? "text" : "password"} icon="lock" value={f.password} onChange={set("password")} testid="auth-password"
            placeholder={mode === "register" ? "Pelo menos 8 caracteres" : "Sua senha"} right={eye} />
          {error && <p className="ol-auth__error" data-testid="auth-error"><Icon name="circle-alert" size={16} />{error}</p>}
          <Button type="submit" variant="primary" size="lg" loading={busy} data-testid="auth-submit" onClick={submit}
            disabled={!f.email || !f.password || (mode === "register" && !f.name)}>{mode === "login" ? "Entrar" : "Criar conta"}</Button>
          <p className="ol-auth__switch">
            {mode === "login" ? <>Ainda não tem conta? <button type="button" className="ol-link" onClick={() => switchMode("register")} data-testid="auth-to-register">Criar conta</button></>
              : <>Já tem conta? <button type="button" className="ol-link" onClick={() => switchMode("login")} data-testid="auth-to-login">Entrar</button></>}
          </p>
        </form>
      </main>
    </div>
  );
}
