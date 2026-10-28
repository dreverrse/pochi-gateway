import { useEffect, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";

import ModelPicker from "./ModelPicker.jsx";

export default function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder,
  models,
  modelId,
  onModelChange,
}) {
  const textRef = useRef(null);

  useEffect(() => {
    const node = textRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 208)}px`;
  }, [value]);

  useEffect(() => {
    if (!streaming && !disabled) textRef.current?.focus();
  }, [streaming, disabled]);

  function handleKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent?.isComposing) return;
    event.preventDefault();
    if (!streaming) onSend();
  }

  return (
    <div className="cw-composer-wrap">
      <div className="cw-composer-row">
        <div className={`cw-composer ${streaming ? "is-streaming" : ""}`}>
          <textarea
            ref={textRef}
            className="cw-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            maxLength={200000}
            disabled={disabled}
            aria-label="Pesan untuk Pochi"
          />

          <div className="cw-composer-bar">
            <ModelPicker
              models={models}
              modelId={modelId}
              onChange={onModelChange}
            />
          </div>
        </div>

        {streaming ? (
          <button
            type="button"
            className="cw-send is-stop"
            onClick={onStop}
            aria-label="Hentikan balasan"
            title="Hentikan"
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            className="cw-send"
            onClick={onSend}
            disabled={disabled || !value.trim()}
            aria-label="Kirim pesan"
            title="Kirim (Enter) · Shift+Enter baris baru"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
