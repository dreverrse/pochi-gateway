import { useRef, useState } from "react";

const NODE_WIDTH = 216;
const NODE_HEIGHT = 82;
const STAGE_PADDING = 160;
const MIN_STAGE_WIDTH = 720;
const MIN_STAGE_HEIGHT = 440;

const TYPE_LABEL = {
  "trigger.manual": "Manual",
  "trigger.schedule": "Jadwal",
  "trigger.webhook": "Webhook",
  "action.chat": "Chat AI",
  "action.http": "HTTP",
  "logic.condition": "Kondisi",
  "logic.set": "Set data",
};

const TYPE_TONE = {
  "trigger.manual": "trigger",
  "trigger.schedule": "trigger",
  "trigger.webhook": "trigger",
  "action.chat": "action",
  "action.http": "action",
  "logic.condition": "logic",
  "logic.set": "logic",
};

function nodeSummary(node) {
  const config = node.config ?? {};
  switch (node.type) {
    case "trigger.schedule":
      return `tiap ${config.interval_seconds ?? 300}s`;
    case "trigger.webhook":
      return "token di panel";
    case "action.chat":
      return config.model ? `model ${config.model}` : "model belum dipilih";
    case "action.http":
      return `${(config.method ?? "POST").toUpperCase()} ${config.url ?? ""}`.slice(0, 34);
    case "logic.condition":
      return `${config.path ?? "input"} ${config.operator ?? "equals"} ${String(
        config.value ?? "",
      ).slice(0, 12)}`;
    case "logic.set":
      return Object.keys(config.fields ?? {}).join(", ") || "belum ada field";
    default:
      return "mulai dari sini";
  }
}

function edgePath(from, to, fromOffset = 0.5) {
  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT * fromOffset;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;
  const dx = Math.max(48, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export default function WorkflowCanvas({
  nodes,
  edges,
  selectedId,
  pending,
  onSelect,
  onMove,
  onConnect,
  onStartLink,
  onCancelLink,
  onDeleteEdge,
}) {
  const [dragging, setDragging] = useState(null);
  const dragRef = useRef(null);

  function handlePointerDown(event, node) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.position?.x ?? 0,
      originY: node.position?.y ?? 0,
    };
    setDragging(node.id);
    onSelect(node.id);
  }

  function handlePointerMove(event) {
    if (!dragRef.current) return;
    const { id, startX, startY, originX, originY } = dragRef.current;
    const nextX = Math.max(0, originX + event.clientX - startX);
    const nextY = Math.max(0, originY + event.clientY - startY);
    onMove(id, { x: Math.round(nextX), y: Math.round(nextY) });
  }

  function endDrag() {
    dragRef.current = null;
    setDragging(null);
  }

  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const stageWidth = Math.max(
    MIN_STAGE_WIDTH,
    ...nodes.map((node) => (node.position?.x ?? 0) + NODE_WIDTH + STAGE_PADDING),
  );
  const stageHeight = Math.max(
    MIN_STAGE_HEIGHT,
    ...nodes.map((node) => (node.position?.y ?? 0) + NODE_HEIGHT + STAGE_PADDING),
  );

  return (
    <div
      className="wf-canvas"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onSelect("");
          onCancelLink();
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <div
        className="wf-stage"
        style={{ width: stageWidth, height: stageHeight }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onCancelLink();
        }}
      >
        <svg className="wf-edges" width={stageWidth} height={stageHeight} aria-hidden="true">
          {edges.map((edge, index) => {
            const source = byId[edge.source];
            const target = byId[edge.target];
            if (!source || !target) return null;
            const offset = edge.branch === "true" ? 0.3 : edge.branch === "false" ? 0.7 : 0.5;
            return (
              <g key={edge.id ?? `${edge.source}-${edge.target}-${index}`} className={`wf-edge ${edge.branch}`}>
                <path d={edgePath(source.position, target.position, offset)} />
                <path
                  className="wf-edge-hit"
                  d={edgePath(source.position, target.position, offset)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteEdge(edge);
                  }}
                >
                  <title>Klik untuk menghapus koneksi</title>
                </path>
              </g>
            );
          })}
        </svg>

        {nodes.map((node) => {
          const isCondition = node.type === "logic.condition";
          return (
            <article
              key={node.id}
              className={`wf-node ${TYPE_TONE[node.type]} ${selectedId === node.id ? "selected" : ""} ${
                dragging === node.id ? "dragging" : ""
              }`}
              style={{ left: node.position?.x ?? 0, top: node.position?.y ?? 0 }}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(node.id);
              }}
            >
              <header
                className="wf-node-head"
                onPointerDown={(event) => handlePointerDown(event, node)}
              >
                <span className="wf-node-type">{TYPE_LABEL[node.type] ?? node.type}</span>
                <strong>{node.name || node.id}</strong>
              </header>
              <p className="wf-node-summary">{nodeSummary(node)}</p>

              <button
                type="button"
                className="wf-port in"
                aria-label={`Masukan ${node.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (pending) onConnect(pending.source, node.id, pending.branch);
                  else onSelect(node.id);
                }}
              />

              {isCondition ? (
                <>
                  <button
                    type="button"
                    className="wf-port out true"
                    aria-label="Keluaran true"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStartLink(node.id, "true");
                    }}
                  >
                    <span>✓</span>
                  </button>
                  <button
                    type="button"
                    className="wf-port out false"
                    aria-label="Keluaran false"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStartLink(node.id, "false");
                    }}
                  >
                    <span>✕</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="wf-port out"
                  aria-label={`Keluaran ${node.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStartLink(node.id, "always");
                  }}
                />
              )}
            </article>
          );
        })}

        {pending ? (
          <p className="wf-pending-hint">Klik titik masukan node tujuan · Esc batal</p>
        ) : null}
      </div>
    </div>
  );
}
