import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";

export function priceLabel(model) {
  if (model?.input_usd_per_million == null && model?.output_usd_per_million == null) {
    return "Harga belum diatur";
  }
  const input = model.input_usd_per_million ?? 0;
  const output = model.output_usd_per_million ?? 0;
  return `$${input.toFixed(2)} masuk · $${output.toFixed(2)} keluar / 1M token`;
}

export default function ModelPicker({ models, modelId, onChange }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const selected = models.find((row) => row.public_name === modelId) ?? null;

  useEffect(() => {
    if (!open) return undefined;
    function handlePointer(event) {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="cw-model" ref={boxRef}>
      <button
        type="button"
        className="cw-model-btn"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={models.length === 0}
        title={selected ? `${selected.provider_name} · ${priceLabel(selected)}` : "Pilih model"}
      >
        <Sparkles size={13} aria-hidden="true" />
        <span className="cw-model-name">
          {selected ? selected.public_name : models.length ? "Pilih model" : "Belum ada model"}
        </span>
        <ChevronDown size={13} aria-hidden="true" className={open ? "flip" : ""} />
      </button>

      {open ? (
        <div className="cw-model-pop" role="listbox" aria-label="Pilih model gateway">
          {models.map((row) => {
            const active = row.public_name === modelId;
            return (
              <button
                key={row.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`cw-model-item ${active ? "is-active" : ""}`}
                onClick={() => {
                  onChange(row.public_name);
                  setOpen(false);
                }}
              >
                <span className="cw-model-item-top">
                  <strong>{row.public_name}</strong>
                  {active ? <Check size={13} aria-hidden="true" /> : null}
                </span>
                <span className="cw-model-item-meta">{row.provider_name}</span>
                <span className="cw-model-item-price">{priceLabel(row)}</span>
              </button>
            );
          })}
          {models.length === 0 ? (
            <p className="cw-model-empty">
              Tambahkan provider dan model dulu di halaman Models.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
