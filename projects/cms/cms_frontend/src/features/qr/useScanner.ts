import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/**
 * Reads QR codes from the device camera. Calls onCode once per distinct code, and not again for the same
 * code for `cooldownMs`, so holding a card in view does not scan it twenty times.
 */
export function useScanner(active: boolean, onCode: (code: string) => void, cooldownMs = 4000) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const handler = useRef(onCode);
  useEffect(() => { handler.current = onCode; });

  useEffect(() => {
    if (!active) return undefined;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const last = { code: '', at: 0 };
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      const v = video.current;
      if (stopped || !v) return;
      if (v.readyState >= 2 && v.videoWidth > 0 && ctx) {
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const hit = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
        const now = Date.now();
        if (hit?.data && (hit.data !== last.code || now - last.at > cooldownMs)) {
          last.code = hit.data;
          last.at = now;
          handler.current(hit.data);
        }
      }
      raf = window.setTimeout(tick, 120) as unknown as number;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setError('This browser cannot use the camera here. The camera needs a secure (https) page.'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        setReady(true);
        tick();
      } catch (e) {
        const name = (e as { name?: string }).name;
        setError(name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera for this site, or use the code box below.' : name === 'NotFoundError' ? 'No camera was found. Use the code box below, or a USB scanner.' : 'The camera could not be started. Use the code box below.');
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
      setReady(false);
    };
  }, [active, cooldownMs]);

  return { video, error, ready };
}
