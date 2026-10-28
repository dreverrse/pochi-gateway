import { Construction } from "lucide-react";

export default function Placeholder({ milestone, description }) {
  return (
    <section className="panel placeholder">
      <div className="placeholder-icon">
        <Construction size={26} aria-hidden="true" />
      </div>
      <div>
        <span className="badge">{milestone}</span>
        <h2>Modul belum aktif</h2>
        <p>{description}</p>
        <p className="muted">
          Fondasi SQLite dan API sudah siap. Modul ini akan dihubungkan pada milestone berikutnya.
        </p>
      </div>
    </section>
  );
}
