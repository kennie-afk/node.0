import { useScanner } from './useScanner';

export function QrScanView({ active, paused, onCode }: { active: boolean; paused: boolean; onCode: (code: string) => void }) {
  const { video, error, ready } = useScanner(true, (c) => { if (active) onCode(c); });
  return (
    <div className="ops-qr-view">
      {error ? <p className="ops-qr-camerr" role="alert">{error}</p> : (
        <div className="ops-qr-frame">
          <video ref={video} muted playsInline aria-label="Camera preview" />
          <div className="ops-qr-aim" aria-hidden />
          {!ready && <span className="ops-qr-wait">Starting camera…</span>}
          {paused && ready && <span className="ops-qr-wait">Choose the event or sermon to start scanning</span>}
        </div>
      )}
    </div>
  );
}
