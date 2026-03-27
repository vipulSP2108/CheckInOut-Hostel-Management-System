import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, Loader } from 'lucide-react';

export default function QRCameraScanner({ onScan, onError, active, onStop }) {
  const scannerRef  = useRef(null);
  const isRunning   = useRef(false);   // true only after .start() resolves
  const regionId    = useRef(`qr-region-${Math.random().toString(36).slice(2)}`);
  const [status, setStatus] = useState('idle');

  const safeStop = async () => {
    if (scannerRef.current && isRunning.current) {
      isRunning.current = false;
      try { await scannerRef.current.stop(); } catch (_) {}
    }
    scannerRef.current = null;
  };

  useEffect(() => {
    if (!active) return;

    let mounted = true;

    const startScanner = async () => {
      setStatus('starting');
      try {
        const scanner = new Html5Qrcode(regionId.current, { verbose: false });
        scannerRef.current = scanner;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) throw new Error('No camera found on this device.');

        // Prefer back/environment camera
        const cam = cameras.find(c =>
          c.label.toLowerCase().includes('back') ||
          c.label.toLowerCase().includes('rear') ||
          c.label.toLowerCase().includes('environment')
        ) || cameras[cameras.length - 1];

        await scanner.start(
          cam.id,
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
          async (decodedText) => {
            if (!mounted || !isRunning.current) return;
            setStatus('done');
            await safeStop();
            if (mounted) onScan(decodedText);
          },
          () => {} // per-frame decode failures — ignore
        );

        // Mark as running ONLY after .start() resolves
        if (mounted) {
          isRunning.current = true;
          setStatus('scanning');
        } else {
          // Component unmounted while camera was starting — stop immediately
          await safeStop();
        }
      } catch (err) {
        isRunning.current = false;
        if (mounted) {
          setStatus('error');
          if (onError) onError(err.message || String(err));
        }
      }
    };

    startScanner();

    return () => {
      mounted = false;
      safeStop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  return (
    <div className="w-full flex flex-col items-center gap-4">
      {/* Camera viewport */}
      <div className="relative w-full max-w-xs aspect-square rounded-2xl overflow-hidden border-4 border-dashed border-slate-200 bg-black shadow-inner">
        <div id={regionId.current} className="w-full h-full" />

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white gap-3">
            <Loader size={36} className="animate-spin text-blue-400" />
            <p className="text-sm font-bold">Starting camera…</p>
          </div>
        )}

        {status === 'done' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-900/80 text-white gap-3">
            <Camera size={36} className="text-emerald-400" />
            <p className="text-sm font-bold">QR Detected!</p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-900/80 text-white gap-3 p-4 text-center">
            <CameraOff size={36} className="text-rose-400" />
            <p className="text-sm font-bold">Camera Error — check browser permissions</p>
          </div>
        )}
      </div>

      {status === 'scanning' && (
        <p className="text-xs font-semibold text-slate-500 animate-pulse">
          📷 Scanning — point QR code at the camera
        </p>
      )}

      <button
        onClick={async () => { await safeStop(); onStop(); }}
        className="w-full flex items-center justify-center gap-2 px-5 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all"
      >
        <CameraOff size={16} /> Stop Camera
      </button>
    </div>
  );
}
