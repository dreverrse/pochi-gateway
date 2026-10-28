export default function StatCard({ label, value, hint, icon: Icon, tone = "default" }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <div className="stat-card-head">
        <span>{label}</span>
        {Icon ? <Icon size={18} aria-hidden="true" /> : null}
      </div>
      <strong>{value}</strong>
      <p>{hint}</p>
    </article>
  );
}
