/**
 * Pochi brand mark — turunan dari ikon launcher proyek Pochi
 * (github.com/dreverrse/pochi): squircle matte dengan sepasang mata senang.
 * Dipakai di sidebar, login, empty state chat, dan favicon.
 */
export default function PochiLogo({ size = 34, className = "", title = "Pochi" }) {
  return (
    <svg
      className={`pochi-logo ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 108 108"
      role="img"
      aria-label={title}
      focusable="false"
    >
      <defs>
        <linearGradient id="pochi-body" x1="14" y1="10" x2="94" y2="98" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2B2742" />
          <stop offset="52%" stopColor="#17161F" />
          <stop offset="100%" stopColor="#101014" />
        </linearGradient>
        <linearGradient id="pochi-rim" x1="10" y1="8" x2="98" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="55%" stopColor="#7470FF" />
          <stop offset="100%" stopColor="#5958F2" />
        </linearGradient>
      </defs>

      <rect x="5" y="5" width="98" height="98" rx="30" fill="#08080B" opacity="0.55" />
      <rect
        x="8"
        y="8"
        width="92"
        height="92"
        rx="27"
        fill="url(#pochi-body)"
        stroke="url(#pochi-rim)"
        strokeWidth="2"
      />
      <path
        d="M24 30c0-5 4-9 9-9h42c5 0 9 4 9 9v4H24z"
        fill="#A78BFA"
        opacity="0.14"
      />

      <g
        fill="none"
        stroke="#F7F7FC"
        strokeWidth="7.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M28 58q10-14 20 0" />
        <path d="M60 58q10-14 20 0" />
      </g>
    </svg>
  );
}
