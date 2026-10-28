import { memo, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

import { LANG_LABEL, highlight, normalizeLang } from "./codeHighlight.js";

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const node = document.createElement("textarea");
      node.value = text;
      node.setAttribute("readonly", "");
      node.style.position = "fixed";
      node.style.opacity = "0";
      document.body.appendChild(node);
      node.select();
      document.execCommand("copy");
      document.body.removeChild(node);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);
  const language = normalizeLang(lang);
  const tokens = useMemo(() => highlight(code, language), [code, language]);
  const lineCount = useMemo(() => code.split("\n").length, [code]);

  async function handleCopy() {
    try {
      await copyText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="cb">
      <div className="cb-head">
        <span className="cb-lang">{LANG_LABEL[language] ?? "Teks"}</span>
        <button
          type="button"
          className={`cb-copy ${copied ? "is-copied" : ""}`}
          onClick={handleCopy}
          aria-label={copied ? "Kode tersalin" : "Salin kode"}
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          {copied ? "Tersalin" : "Salin"}
        </button>
      </div>

      <div className="cb-scroll">
        <div className="cb-gutter" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <pre className="cb-pre">
          <code>
            {tokens.map((token, index) =>
              token.type === "plain" ? (
                token.text
              ) : (
                <span key={index} className={`tok-${token.type}`}>
                  {token.text}
                </span>
              ),
            )}
          </code>
        </pre>
      </div>
    </div>
  );
}

export default memo(CodeBlock);
