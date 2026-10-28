export function Skeleton({ width, height = 12, radius = 6, style }) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

export function CardSkeletons({ count = 4 }) {
  return (
    <div className="stat-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <article key={index} className="stat-card">
          <Skeleton width="46%" height={10} />
          <Skeleton width="62%" height={26} style={{ marginTop: 14 }} />
          <Skeleton width="78%" height={10} style={{ marginTop: 10 }} />
          <Skeleton width="100%" height={30} style={{ marginTop: 16 }} radius={8} />
        </article>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }) {
  return (
    <div className="table-skeleton" aria-hidden="true">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="table-skeleton-row">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton
              key={columnIndex}
              width={columnIndex === 0 ? "70%" : "48%"}
              height={11}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ height = 240 }) {
  return (
    <div className="panel-skeleton" aria-hidden="true">
      <Skeleton width="30%" height={12} />
      <Skeleton width="100%" height={height} radius={12} style={{ marginTop: 16 }} />
    </div>
  );
}
