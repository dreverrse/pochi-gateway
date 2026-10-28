export default function PageHeader({ title, description, meta, actions }) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="page-header-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}
