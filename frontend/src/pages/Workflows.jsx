import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Workflow as WorkflowIcon,
} from "lucide-react";

import { api } from "../api/client.js";
import { useUi } from "../app-context.jsx";
import ErrorState from "../components/ErrorState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import WorkflowCanvas from "../components/WorkflowCanvas.jsx";

const NODE_TYPES = [
  { type: "trigger.manual", label: "Trigger manual" },
  { type: "trigger.webhook", label: "Trigger webhook" },
  { type: "trigger.schedule", label: "Trigger jadwal" },
  { type: "action.chat", label: "Chat AI" },
  { type: "action.http", label: "HTTP request" },
  { type: "logic.condition", label: "Kondisi" },
  { type: "logic.set", label: "Set data" },
];

const OPERATORS = [
  ["equals", "sama dengan"],
  ["not_equals", "tidak sama"],
  ["contains", "mengandung"],
  ["not_contains", "tidak mengandung"],
  ["gt", "lebih besar"],
  ["lt", "lebih kecil"],
  ["is_empty", "kosong"],
  ["is_not_empty", "tidak kosong"],
];

function emptyDefinition() {
  return {
    nodes: [
      {
        id: "start",
        type: "trigger.manual",
        name: "Mulai",
        config: {},
        position: { x: 80, y: 120 },
      },
    ],
    edges: [],
  };
}

function defaultConfig(type) {
  switch (type) {
    case "trigger.schedule":
      return { interval_seconds: 300 };
    case "action.chat":
      return { model: "", system: "", prompt: "{{input}}", temperature: 0.7 };
    case "action.http":
      return { method: "POST", url: "https://", headers: {}, body: "" };
    case "logic.condition":
      return { path: "input", operator: "equals", value: "" };
    case "logic.set":
      return { fields: {} };
    default:
      return {};
  }
}

function nextNodeId(nodes, type) {
  const base = type.split(".")[1];
  let index = 1;
  while (nodes.some((node) => node.id === `${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

const RUN_LABEL = { success: "Sukses", error: "Gagal", running: "Jalan" };

function StatusPill({ status }) {
  const tone = status === "success" ? "ok" : status === "error" ? "err" : "warn";
  return <span className={`status-pill ${tone}`}>{RUN_LABEL[status] ?? status}</span>;
}

function EnabledPill({ enabled }) {
  return (
    <span className={`status-pill ${enabled ? "ok" : "off"}`}>
      {enabled ? "Aktif" : "Nonaktif"}
    </span>
  );
}

function JsonField({ label, value, onApply, hint }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState("");

  useEffect(() => {
    setText(JSON.stringify(value ?? {}, null, 2));
    setError("");
  }, [JSON.stringify(value ?? {})]);

  function apply(next) {
    setText(next);
    try {
      const parsed = JSON.parse(next || "{}");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setError("Harus objek JSON");
        return;
      }
      setError("");
      onApply(parsed);
    } catch {
      setError("JSON tidak valid");
    }
  }

  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        className="mono-input"
        rows={4}
        value={text}
        onChange={(event) => apply(event.target.value)}
        spellCheck={false}
      />
      {error ? <small className="form-error">{error}</small> : hint ? <small>{hint}</small> : null}
    </label>
  );
}

export default function Workflows() {
  const { pushToast } = useUi();
  const [items, setItems] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [runInput, setRunInput] = useState('{\n  "pesan": "halo"\n}');
  const [run, setRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([api.workflows(), api.models()])
      .then(([workflows, modelRows]) => {
        if (!active) return;
        setItems(workflows);
        setModels(modelRows.filter((row) => row.enabled));
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") setPending(null);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const selectedNode = useMemo(
    () => draft?.definition.nodes.find((node) => node.id === selectedId) ?? null,
    [draft, selectedId],
  );

  function openEditor(workflow) {
    setDraft(
      workflow
        ? {
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            enabled: workflow.enabled,
            definition: workflow.definition,
            webhook_token: workflow.webhook_token,
          }
        : {
            id: null,
            name: "Workflow baru",
            description: "",
            enabled: true,
            definition: emptyDefinition(),
            webhook_token: null,
          },
    );
    setSelectedId("");
    setPending(null);
    setRun(null);
    setRuns([]);
    setError("");
  }

  function patchNode(nodeId, patch) {
    setDraft((current) => ({
      ...current,
      definition: {
        ...current.definition,
        nodes: current.definition.nodes.map((node) =>
          node.id === nodeId ? { ...node, ...patch } : node,
        ),
      },
    }));
  }

  function patchConfig(nodeId, patch) {
    setDraft((current) => ({
      ...current,
      definition: {
        ...current.definition,
        nodes: current.definition.nodes.map((node) =>
          node.id === nodeId ? { ...node, config: { ...node.config, ...patch } } : node,
        ),
      },
    }));
  }

  function addNode(type) {
    setDraft((current) => {
      const count = current.definition.nodes.length;
      const node = {
        id: nextNodeId(current.definition.nodes, type),
        type,
        name: NODE_TYPES.find((item) => item.type === type)?.label ?? type,
        config: defaultConfig(type),
        position: { x: 80 + (count % 3) * 280, y: 120 + Math.floor(count / 3) * 150 },
      };
      return {
        ...current,
        definition: { ...current.definition, nodes: [...current.definition.nodes, node] },
      };
    });
  }

  function deleteNode(nodeId) {
    setDraft((current) => ({
      ...current,
      definition: {
        nodes: current.definition.nodes.filter((node) => node.id !== nodeId),
        edges: current.definition.edges.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId,
        ),
      },
    }));
    setSelectedId("");
  }

  function connect(source, target, branch) {
    setPending(null);
    if (!source || source === target) return;
    setDraft((current) => {
      const exists = current.definition.edges.some(
        (edge) => edge.source === source && edge.target === target && edge.branch === branch,
      );
      if (exists) return current;
      return {
        ...current,
        definition: {
          ...current.definition,
          edges: [
            ...current.definition.edges,
            { id: `e${Date.now()}`, source, target, branch },
          ],
        },
      };
    });
  }

  function deleteEdge(edge) {
    setDraft((current) => ({
      ...current,
      definition: {
        ...current.definition,
        edges: current.definition.edges.filter(
          (item) =>
            !(
              item.source === edge.source &&
              item.target === edge.target &&
              item.branch === edge.branch
            ),
        ),
      },
    }));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    const payload = {
      name: draft.name.trim() || "Workflow tanpa nama",
      description: draft.description ?? "",
      enabled: draft.enabled,
      definition: draft.definition,
    };
    try {
      const saved = draft.id
        ? await api.updateWorkflow(draft.id, payload)
        : await api.createWorkflow(payload);
      setDraft({ ...saved, definition: saved.definition });
      setItems((current) => {
        const rest = current.filter((item) => item.id !== saved.id);
        return [saved, ...rest];
      });
      pushToast("Workflow tersimpan", "success");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function execute() {
    if (!draft?.id) {
      setError("Simpan workflow dulu sebelum dijalankan.");
      return;
    }
    let input = {};
    try {
      input = runInput.trim() ? JSON.parse(runInput) : {};
    } catch {
      setError("Input run harus JSON yang valid.");
      return;
    }
    setRunning(true);
    setError("");
    try {
      const result = await api.runWorkflow(draft.id, input);
      setRun(result);
      const history = await api.workflowRuns(draft.id);
      setRuns(history);
      pushToast(
        result.status === "success" ? "Workflow selesai" : `Workflow gagal: ${result.error}`,
        result.status === "success" ? "success" : "error",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function loadRunHistory(workflowId) {
    try {
      setRuns(await api.workflowRuns(workflowId));
    } catch {
      setRuns([]);
    }
  }

  async function remove(workflow) {
    if (!window.confirm(`Hapus workflow "${workflow.name}" beserta riwayat run?`)) return;
    try {
      await api.deleteWorkflow(workflow.id);
      setItems((current) => current.filter((item) => item.id !== workflow.id));
      if (draft?.id === workflow.id) setDraft(null);
      pushToast("Workflow dihapus", "success");
    } catch (err) {
      pushToast(err.message, "error");
    }
  }

  function webhookUrl(workflow) {
    if (!workflow?.webhook_token) return "";
    return `${window.location.origin}/api/v1/hooks/${workflow.webhook_token}`;
  }

  if (error && !draft) {
    return (
      <div className="page">
        <PageHeader title="Workflows" description="Otomasi bertahap seperti n8n, dijalankan gateway ini." />
        <ErrorState title="Gagal memuat workflow" message={error} />
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="page">
        <PageHeader
          title="Workflows"
          description="Rangkai trigger dan aksi, lalu jalankan manual, lewat webhook, atau jadwal."
          actions={
            <>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setLoading(true);
                  api
                    .workflows()
                    .then(setItems)
                    .catch((err) => setError(err.message))
                    .finally(() => setLoading(false));
                }}
                disabled={loading}
              >
                <RefreshCw size={14} aria-hidden="true" />
                {loading ? "Memuat" : "Muat ulang"}
              </button>
              <button type="button" className="btn primary small" onClick={() => openEditor(null)}>
                <Plus size={15} aria-hidden="true" />
                Workflow baru
              </button>
            </>
          }
        />

        {items.length === 0 && !loading ? (
          <section className="panel empty-panel">
            <span className="empty-icon" aria-hidden="true">
              <WorkflowIcon size={22} />
            </span>
            <h2>Belum ada workflow</h2>
            <p>
              Mulai dari trigger manual, tambah node Chat AI atau HTTP, lalu hubungkan. Tidak ada
              kode yang dieksekusi; semua node punya tipe tetap.
            </p>
            <button type="button" className="btn primary" onClick={() => openEditor(null)}>
              <Plus size={15} aria-hidden="true" />
              Buat workflow pertama
            </button>
          </section>
        ) : (
          <div className="workflow-grid">
            {items.map((workflow) => (
              <article key={workflow.id} className="workflow-card">
                <header>
                  <div>
                    <h2>{workflow.name}</h2>
                    <p>{workflow.description || "Tanpa deskripsi"}</p>
                  </div>
                  <EnabledPill enabled={workflow.enabled} />
                </header>
                <dl>
                  <div>
                    <dt>Node</dt>
                    <dd>{workflow.definition.nodes.length}</dd>
                  </div>
                  <div>
                    <dt>Koneksi</dt>
                    <dd>{workflow.definition.edges.length}</dd>
                  </div>
                  <div>
                    <dt>Run terakhir</dt>
                    <dd>
                      {workflow.last_run
                        ? `${RUN_LABEL[workflow.last_run.status] ?? workflow.last_run.status} · ${
                            workflow.last_run.started_at
                          }`
                        : "belum pernah"}
                    </dd>
                  </div>
                </dl>
                {workflow.webhook_token ? (
                  <p className="webhook-line">
                    <code>{webhookUrl(workflow)}</code>
                  </p>
                ) : null}
                <footer>
                  <button type="button" className="btn small" onClick={() => openEditor(workflow)}>
                    Buka
                  </button>
                  <button
                    type="button"
                    className="btn small danger-ghost"
                    onClick={() => remove(workflow)}
                    aria-label={`Hapus ${workflow.name}`}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </footer>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page page-workflow-editor">
      <PageHeader
        title={draft.id ? draft.name : "Workflow baru"}
        description={
          draft.id
            ? "Geser node untuk menata, klik titik keluaran lalu titik masukan untuk menyambung."
            : "Simpan dulu untuk mendapatkan ID; setelah itu bisa dijalankan."
        }
        actions={
          <>
            <button type="button" className="btn small" onClick={() => setDraft(null)}>
              <ArrowLeft size={14} aria-hidden="true" />
              Daftar
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                loadRunHistory(draft.id);
                setRun(null);
              }}
              disabled={!draft.id}
            >
              Riwayat
            </button>
            <button type="button" className="btn small" onClick={save} disabled={saving}>
              <Save size={14} aria-hidden="true" />
              {saving ? "Menyimpan" : "Simpan"}
            </button>
            <button
              type="button"
              className="btn primary small"
              onClick={execute}
              disabled={running || !draft.id}
            >
              <Play size={14} aria-hidden="true" />
              {running ? "Jalan" : "Jalankan"}
            </button>
          </>
        }
      />

      <div className="workflow-meta panel">
        <label className="field">
          <span>Nama</span>
          <input
            type="text"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            maxLength={80}
          />
        </label>
        <label className="field">
          <span>Deskripsi</span>
          <input
            type="text"
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            maxLength={400}
          />
        </label>
        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          />
          <span>Aktif</span>
        </label>
      </div>

      {draft.webhook_token ? (
        <p className="webhook-line panel-soft">
          Webhook: <code>{webhookUrl(draft)}</code>
        </p>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="workflow-editor">
        <div className="workflow-main">
          <div className="workflow-toolbar">
            <span className="workflow-toolbar-label">Tambah node</span>
            <div className="workflow-type-list">
              {NODE_TYPES.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  className="chip-button"
                  onClick={() => addNode(item.type)}
                >
                  <Plus size={12} aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <WorkflowCanvas
            nodes={draft.definition.nodes}
            edges={draft.definition.edges}
            selectedId={selectedId}
            pending={pending}
            onSelect={setSelectedId}
            onMove={(nodeId, position) => patchNode(nodeId, { position })}
            onConnect={connect}
            onStartLink={(nodeId, branch) => setPending({ source: nodeId, branch })}
            onCancelLink={() => setPending(null)}
            onDeleteEdge={deleteEdge}
          />
          <div className="workflow-run-bar">
            <label className="field">
              <span>Input run (JSON)</span>
              <textarea
                className="mono-input"
                rows={4}
                value={runInput}
                onChange={(event) => setRunInput(event.target.value)}
                spellCheck={false}
              />
            </label>
            <div className="workflow-run-result">
              {run ? (
                <>
                  <p>
                    <StatusPill status={run.status} /> run #{run.id} · {run.trigger}
                  </p>
                  {run.error ? <p className="form-error">{run.error}</p> : null}
                  <ul className="run-steps">
                    {run.steps.map((step, index) => (
                      <li key={`${step.node_id}-${index}`} className={step.status}>
                        <span className="run-step-name">{step.node_id}</span>
                        <span className="run-step-status">{step.status}</span>
                        <span className="run-step-time">{step.duration_ms} ms</span>
                        {step.error ? <em>{step.error}</em> : null}
                      </li>
                    ))}
                  </ul>
                  <details>
                    <summary>Output mentah</summary>
                    <pre>{JSON.stringify(run.output, null, 2)}</pre>
                  </details>
                </>
              ) : (
                <p className="field-note">
                  Jalankan untuk melihat status per node. Hasil disimpan di riwayat run.
                </p>
              )}
            </div>
          </div>

          {runs.length ? (
            <section className="panel workflow-runs">
              <header className="panel-head">
                <div>
                  <h2>Riwayat run</h2>
                  <p>Klik untuk memuat detail langkah</p>
                </div>
              </header>
              <ul className="run-history">
                {runs.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="run-history-button"
                      onClick={() =>
                        api.workflowRun(item.id).then(setRun).catch((err) => setError(err.message))
                      }
                    >
                      <span>#{item.id}</span>
                      <StatusPill status={item.status} />
                      <span>{item.trigger}</span>
                      <time>{item.started_at}</time>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="workflow-inspector panel">
          <header className="panel-head">
            <div>
              <h2>Node</h2>
              <p>{selectedNode ? selectedNode.id : "Pilih node di kanvas"}</p>
            </div>
          </header>

          {!selectedNode ? (
            <p className="field-note">
              Klik node untuk mengubah konfigurasi. Klik garis untuk menghapus koneksi.
            </p>
          ) : (
            <>
              <label className="field">
                <span>Nama tampilan</span>
                <input
                  type="text"
                  value={selectedNode.name ?? ""}
                  onChange={(event) => patchNode(selectedNode.id, { name: event.target.value })}
                  maxLength={80}
                />
              </label>

              {selectedNode.type === "trigger.schedule" ? (
                <label className="field">
                  <span>Interval (detik, min 60)</span>
                  <input
                    type="number"
                    min={60}
                    value={selectedNode.config.interval_seconds ?? 300}
                    onChange={(event) =>
                      patchConfig(selectedNode.id, {
                        interval_seconds: Number(event.target.value) || 60,
                      })
                    }
                  />
                </label>
              ) : null}

              {selectedNode.type === "action.chat" ? (
                <>
                  <label className="field">
                    <span>Model</span>
                    <select
                      value={selectedNode.config.model ?? ""}
                      onChange={(event) =>
                        patchConfig(selectedNode.id, { model: event.target.value })
                      }
                    >
                      <option value="">Pilih model</option>
                      {models.map((row) => (
                        <option key={row.id} value={row.public_name}>
                          {row.public_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>System prompt</span>
                    <textarea
                      rows={3}
                      value={selectedNode.config.system ?? ""}
                      onChange={(event) =>
                        patchConfig(selectedNode.id, { system: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Prompt</span>
                    <textarea
                      rows={4}
                      value={selectedNode.config.prompt ?? "{{input}}"}
                      onChange={(event) =>
                        patchConfig(selectedNode.id, { prompt: event.target.value })
                      }
                    />
                    <small>
                      Pakai <code>{"{{input.pesan}}"}</code> atau <code>{"{{data.text}}"}</code>.
                    </small>
                  </label>
                  <label className="field">
                    <span>Temperature</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={selectedNode.config.temperature ?? 0.7}
                      onChange={(event) =>
                        patchConfig(selectedNode.id, {
                          temperature: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </>
              ) : null}

              {selectedNode.type === "action.http" ? (
                <>
                  <div className="form-row">
                    <label className="field">
                      <span>Method</span>
                      <select
                        value={selectedNode.config.method ?? "POST"}
                        onChange={(event) =>
                          patchConfig(selectedNode.id, { method: event.target.value })
                        }
                      >
                        {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    <span>URL</span>
                    <input
                      type="url"
                      value={selectedNode.config.url ?? ""}
                      onChange={(event) =>
                        patchConfig(selectedNode.id, { url: event.target.value })
                      }
                    />
                  </label>
                  <JsonField
                    label="Headers"
                    value={selectedNode.config.headers ?? {}}
                    onApply={(value) => patchConfig(selectedNode.id, { headers: value })}
                  />
                  <label className="field">
                    <span>Body (template)</span>
                    <textarea
                      className="mono-input"
                      rows={4}
                      value={selectedNode.config.body ?? ""}
                      onChange={(event) =>
                        patchConfig(selectedNode.id, { body: event.target.value })
                      }
                    />
                    <small>JSON valid dikirim sebagai JSON; selain itu teks biasa.</small>
                  </label>
                </>
              ) : null}

              {selectedNode.type === "logic.condition" ? (
                <>
                  <label className="field">
                    <span>Field</span>
                    <input
                      type="text"
                      value={selectedNode.config.path ?? ""}
                      onChange={(event) =>
                        patchConfig(selectedNode.id, { path: event.target.value })
                      }
                      placeholder="input.skor"
                    />
                  </label>
                  <label className="field">
                    <span>Operator</span>
                    <select
                      value={selectedNode.config.operator ?? "equals"}
                      onChange={(event) =>
                        patchConfig(selectedNode.id, { operator: event.target.value })
                      }
                    >
                      {OPERATORS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Nilai pembanding</span>
                    <input
                      type="text"
                      value={selectedNode.config.value ?? ""}
                      onChange={(event) =>
                        patchConfig(selectedNode.id, { value: event.target.value })
                      }
                    />
                  </label>
                </>
              ) : null}

              {selectedNode.type === "logic.set" ? (
                <JsonField
                  label="Field hasil"
                  value={selectedNode.config.fields ?? {}}
                  onApply={(value) => patchConfig(selectedNode.id, { fields: value })}
                  hint='Contoh: {"ringkasan": "{{data.text}}"}'
                />
              ) : null}

              {selectedNode.type === "trigger.webhook" ? (
                <p className="field-note">
                  Token webhook dibuat saat workflow disimpan. URL muncul di atas kanvas.
                </p>
              ) : null}

              <button
                type="button"
                className="btn danger-ghost full"
                onClick={() => deleteNode(selectedNode.id)}
              >
                <Trash2 size={14} aria-hidden="true" />
                Hapus node
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
