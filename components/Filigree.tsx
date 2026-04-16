// Gold filigree corner ornaments. Four SVG copies pinned to frame corners.

export default function Filigree() {
  return (
    <>
      <Corner className="filigree tl" />
      <Corner className="filigree tr" />
      <Corner className="filigree bl" />
      <Corner className="filigree br" />
    </>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 90 90" aria-hidden="true">
      <g stroke="#A68835" strokeWidth="1" fill="none">
        <path d="M 0 20 Q 15 20 20 15 T 40 10 M 20 0 Q 20 15 15 20 T 10 40" />
        <path d="M 5 25 Q 15 25 20 20 L 25 15 Q 30 10 35 10" />
        <path d="M 12 12 Q 20 15 25 22 Q 15 20 12 12 Z" fill="#A68835" fillOpacity="0.4" />
        <circle cx="8" cy="8" r="2" fill="#A68835" />
        <path d="M 0 45 Q 10 45 18 38 M 45 0 Q 45 10 38 18" />
      </g>
    </svg>
  );
}
