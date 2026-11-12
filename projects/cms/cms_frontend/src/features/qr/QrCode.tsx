import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** A QR code drawn as one SVG path, so it prints sharply at any size. */
export function QrCode({ value, size = 132, label }: { value: string; size?: number; label?: string }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { path: d, count: n };
  }, [value]);
  const quiet = 2;
  return (
    <svg role="img" aria-label={label ?? 'QR code'} width={size} height={size} viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`} shapeRendering="crispEdges" style={{ background: '#fff', display: 'block' }}>
      <path d={path} fill="#000" />
    </svg>
  );
}
