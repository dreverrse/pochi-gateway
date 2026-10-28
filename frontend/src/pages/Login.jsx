import { useState } from "react";
import { Eye, EyeOff, ShieldCheck, Terminal, TriangleAlert } from "lucide-react";

import { api } from "../api/client.js";

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
      <div className="login-card">
        <div className="brand login-brand">
          <div className="brand-mark" aria-hidden="true">P</div>
          <div>
            <strong>Pochi</strong>
            <span>Gateway</span>
          </div>
        </div>

        <p className="eyebrow">Admin access</p>
        <h1>Masuk ke dashboard</h1>
        <p className="login-copy">
          Dashboard ini dilindungi admin token lokal. Token disimpan di perangkat dan hanya
          dikirim ke server Pochi Gateway.
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
                autoComplete="current-password"
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

          <button type="submit" className="button primary login-submit" disabled={submitting}>
            <ShieldCheck size={16} aria-hidden="true" />
            {submitting ? "Memeriksa token..." : "Masuk"}
          </button>
        </form>

        <div className="login-hint">
          <Terminal size={16} aria-hidden="true" />
          <div>
            <span>Baca token dari file lokal:</span>
            <code>cat ~/Projects/pochi-gateway/data/admin_token</code>
          </div>
        </div>
      </div>
    </div>
  );
}
