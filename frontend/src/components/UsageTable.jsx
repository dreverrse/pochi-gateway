import { formatCompact, formatNumber, formatUsd } from "../utils/format.js";

export default function UsageTable({ title, subtitle, rows }) {
  return (
    <section className="panel table-panel">
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="empty-state">Belum ada data pada periode ini.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col" className="numeric">Request</th>
                <th scope="col" className="numeric">Token in / out</th>
                <th scope="col" className="numeric">Biaya</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td className="name-cell" title={row.name}>{row.name}</td>
                  <td className="numeric">{formatNumber(row.requests)}</td>
                  <td className="numeric token-cell">
                    {formatCompact(row.input_tokens)} / {formatCompact(row.output_tokens)}
                  </td>
                  <td className="numeric">{formatUsd(row.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
