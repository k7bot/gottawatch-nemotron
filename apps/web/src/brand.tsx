// Brand lockup: eye mark + two-tone wordmark, always together (one component for every header).
export function BrandLockup({ size = 20 }: { size?: number }) {
  const eye = Math.round(size * 1.1);
  return (
    <span className="wordmark" style={{ fontSize: size, lineHeight: `${Math.round(size * 1.2)}px`, gap: Math.round(size * 0.4) }} role="img" aria-label="Gottawatch">
      <svg className="eyemark" width={eye} height={eye} viewBox="0 0 1024 1024" aria-hidden>
        <path d="M96 512 Q512 40 928 512 Q512 984 96 512 Z" fill="#F2B45A" />
        <rect x="352" y="402" width="320" height="220" rx="60" fill="#0E1020" />
        <circle cx="602" cy="462" r="30" fill="#F4F1EA" />
      </svg>
      <span aria-hidden>
        Gotta<span className="wm-accent">watch</span>
      </span>
    </span>
  );
}
