import { memo, useState } from "react";
import { AlertTriangle, Check, Copy, RefreshCw } from "lucide-react";

import PochiLogo from "../PochiLogo.jsx";
import Markdown from "./Markdown.jsx";
import UsageDetails from "./UsageDetails.jsx";

function CopyButton({ text, label = "Salin" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={`msg-action ${copied ? "is-done" : ""}`}
      onClick={handleCopy}
      aria-label={copied ? "Tersalin" : "Salin pesan"}
      title={copied ? "Tersalin" : label}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      {copied ? "Tersalin" : label}
    </button>
  );
}

function clock(value) {
  if (!value) return "";
  const stamp = new Date(String(value).replace(" ", "T") + "Z");
  if (Number.isNaN(stamp.getTime())) return "";
  return stamp.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

const UserMessage = memo(function UserMessage({ message }) {
  return (
    <article className="msg msg-user">
      <div className="msg-user-body">
        <div className="msg-user-bubble">{message.content}</div>
        <div className="msg-user-meta">
          <span>{clock(message.created_at)}</span>
          <CopyButton text={message.content} />
        </div>
      </div>
    </article>
  );
});

const AssistantMessage = memo(function AssistantMessage({
  message,
  isLast,
  streaming,
  onRegenerate,
}) {
  const isStreaming = streaming && isLast;
  const failed = message.status === "error";
  const stopped = message.status === "stopped";

  return (
    <article className={`msg msg-assistant ${isStreaming ? "is-streaming" : ""}`}>
      <span className="msg-avatar" aria-hidden="true">
        <PochiLogo size={26} />
      </span>

      <div className="msg-assistant-body">
        {failed ? (
          <div className="msg-error">
            <p>
              <AlertTriangle size={14} aria-hidden="true" />
              {message.error_message
                ? `Permintaan gagal: ${message.error_message}`
                : "Permintaan gagal diproses provider."}
            </p>
            {isLast ? (
              <button type="button" className="btn small" onClick={() => onRegenerate(message)}>
                <RefreshCw size={13} aria-hidden="true" />
                Coba lagi
              </button>
            ) : null}
          </div>
        ) : message.content ? (
          isStreaming ? (
            <div className="msg-plain">
              {message.content}
              <span className="stream-cursor" aria-hidden="true" />
            </div>
          ) : (
            <Markdown text={message.content} />
          )
        ) : isStreaming ? (
          <div className="msg-typing" aria-label="Pochi sedang menulis">
            <i />
            <i />
            <i />
          </div>
        ) : stopped ? (
          <p className="msg-stopped-note">Balasan dihentikan sebelum sempat mengirim teks.</p>
        ) : null}

        {message.content || stopped || (isLast && !isStreaming) ? (
          <div className="msg-tools">
            {message.content ? <CopyButton text={message.content} /> : null}
            {isLast && !isStreaming ? (
              <button
                type="button"
                className="msg-action"
                onClick={() => onRegenerate(message)}
                title="Kirim ulang pesan terakhir"
              >
                <RefreshCw size={13} aria-hidden="true" />
                Ulangi
              </button>
            ) : null}
            {stopped ? <span className="msg-flag">dihentikan</span> : null}
            {message.model ? <span className="msg-model">{message.model}</span> : null}
          </div>
        ) : null}

        <UsageDetails message={message} />
      </div>
    </article>
  );
});

export default function MessageList({ messages, streaming, onRegenerate, listRef }) {
  return (
    <div className="cw-messages" ref={listRef} role="log" aria-live="polite">
      {messages.map((message, index) =>
        message.role === "user" ? (
          <UserMessage key={message.id ?? `u-${index}`} message={message} />
        ) : (
          <AssistantMessage
            key={message.id ?? `a-${index}`}
            message={message}
            isLast={index === messages.length - 1}
            streaming={streaming}
            onRegenerate={onRegenerate}
          />
        ),
      )}
    </div>
  );
}
