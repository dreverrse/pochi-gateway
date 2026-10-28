import { Bug, Code2, Lightbulb } from "lucide-react";

import PochiLogo from "../PochiLogo.jsx";

const SUGGESTIONS = [
  {
    icon: Code2,
    title: "Tulis kode",
    prompt: "Buatkan komponen React untuk kartu statistik dengan angka besar dan tren kecil.",
  },
  {
    icon: Bug,
    title: "Jelaskan error",
    prompt: "Jelaskan error Python ini dan cara memperbaikinya: KeyError: 'user_id'.",
  },
  {
    icon: Lightbulb,
    title: "Cari ide",
    prompt: "Beri lima ide fitur ringan untuk dashboard gateway AI yang hemat RAM.",
  },
];

export default function EmptyChatState({ onPrompt, modelReady }) {
  return (
    <div className="cw-empty">
      <span className="cw-empty-logo">
        <PochiLogo size={64} />
      </span>
      <h2>What can Pochi help you with?</h2>
      <p>
        Tanya apa saja. Setiap balasan dikirim lewat gateway dan tercatat di usage logs —
        biaya, token, dan latensinya bisa kamu lihat di bawah pesan.
      </p>

      <div className="cw-suggest">
        {SUGGESTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              type="button"
              className="cw-suggest-card"
              onClick={() => onPrompt(item.prompt)}
              disabled={!modelReady}
              title={modelReady ? item.prompt : "Tambahkan model aktif dulu"}
            >
              <span className="cw-suggest-icon" aria-hidden="true">
                <Icon size={17} />
              </span>
              <span className="cw-suggest-copy">
                <strong>{item.title}</strong>
                <small>{item.prompt}</small>
              </span>
            </button>
          );
        })}
      </div>

      {!modelReady ? (
        <p className="cw-empty-warn">
          Belum ada model aktif. Tambahkan provider dan model di halaman <strong>Models</strong> dulu.
        </p>
      ) : null}
    </div>
  );
}
