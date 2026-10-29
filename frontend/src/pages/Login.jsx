import { useState } from "react";
import { Eye, EyeOff, ShieldCheck, Terminal, TriangleAlert } from "lucide-react";

import { api } from "../api/client.js";
import PochiLogo from "../components/PochiLogo.jsx";

export default function Login({ onLogin }) {
  const [token, setToken] = useState("");
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const value = token.trim();
    if (!value) {
      setError("Admin token wajib diisi.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await api.login(value);
      onLogin(value);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-glow" aria-hidden="true" />
      <div className="login-card">
        <div className="login-brand">
          <PochiLogo size={34} className="brand-logo" />
          <span className="brand-name">
            <strong>Pochi</strong>
            <small>Gateway</small>
          </span>
        </div>

        <h1>Masuk ke dashboard</h1>
        <p className="login-copy">
          Dashboard lokal untuk mengelola provider, model, dan virtual key gateway. Akses
          memakai admin token yang tersimpan di server.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Admin token</span>
            <div className="password-wrap">
              <input
                type={visible ? "text" : "password"}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Tempel admin token"
                name="pochi-admin-token"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setVisible((value) => !value)}
                aria-label={visible ? "Sembunyikan token" : "Tampilkan token"}
              >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {error ? (
            <p className="form-error" role="alert">
              <TriangleAlert size={15} aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn primary login-submit" disabled={submitting}>
            <ShieldCheck size={16} aria-hidden="true" />
            {submitting ? "Memeriksa token..." : "Masuk"}
          </button>
        </form>

        <div className="login-hint">
          <Terminal size={16} aria-hidden="true" />
          <div>
            <span>Baca token dari file lokal:</span>
            <code>cat ~/Proyek/Pochi/pochi-gateway/data/admin_token</code>
          </div>
        </div>
      </div>
    </div>
  );
}
