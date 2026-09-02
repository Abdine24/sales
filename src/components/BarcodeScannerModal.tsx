import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CameraOff, X, RefreshCw, Volume2, Sparkles, Check } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { playScanBeep } from '../utils/barcode';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title?: string;
  continuous?: boolean;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Scanner un Code-barres',
  continuous = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string>('');
  const lastScanTimestamp = useRef<number>(0);
  const animationFrameId = useRef<number | null>(null);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasCamera(false);
        setCameraError("La caméra n'est pas supportée sur ce navigateur.");
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      setHasCamera(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('Camera access error:', err);
      setHasCamera(false);
      setCameraError("Impossible d'accéder à la caméra. Vérifiez les autorisations de votre navigateur.");
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setLastScannedCode(null);
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // Real-time Barcode Detection Loop (BarcodeDetector API ou analyse d'image)
  useEffect(() => {
    if (!isOpen || !hasCamera || !stream) return;

    let isScanning = true;

    // Vérifie si l'API native BarcodeDetector est disponible
    const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let detector: any = null;

    if (hasBarcodeDetector) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'],
        });
      } catch (e) {
        console.warn('BarcodeDetector format init error:', e);
      }
    }

    const scanFrame = async () => {
      if (!isScanning) return;

      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && detector) {
        try {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue?.trim();
            const now = Date.now();

            // Anti-rebond (debounce 1.5s entre deux scans identiques en mode continu)
            if (rawValue && (now - lastScanTimestamp.current > 1500 || rawValue !== lastScannedCode)) {
              lastScanTimestamp.current = now;
              setLastScannedCode(rawValue);
              playScanBeep(true);
              onScan(rawValue);

              if (!continuous) {
                onClose();
                return;
              }
            }
          }
        } catch {
          // Ignore frame processing hiccups
        }
      }

      animationFrameId.current = requestAnimationFrame(scanFrame);
    };

    animationFrameId.current = requestAnimationFrame(scanFrame);

    return () => {
      isScanning = false;
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isOpen, hasCamera, stream, continuous, lastScannedCode, onScan, onClose]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    playScanBeep(true);
    setLastScannedCode(code);
    onScan(code);
    setManualCode('');
    if (!continuous) {
      onClose();
    }
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
      <div className="space-y-4">
        {/* Camera Live View Box with Laser Target */}
        <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-slate-700 shadow-inner">
          {hasCamera ? (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />

              {/* Laser Target Overlay */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                <div className="relative w-4/5 h-3/5 border-2 border-emerald-400/80 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.4)] flex items-center justify-center">
                  {/* Laser line moving */}
                  <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_10px_#10b981] animate-pulse" />
                  
                  {/* Corner brackets */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                </div>
                <p className="text-[11px] font-bold text-white/90 bg-black/60 px-3 py-1 rounded-full mt-3 backdrop-blur-md">
                  Placez le code-barres au centre du cadre
                </p>
              </div>

              {/* Top controls over video */}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleCamera}
                  className="p-2 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-md transition-all border border-white/10"
                  title="Changer de caméra (Avant / Arrière)"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-slate-400 space-y-2">
              <CameraOff className="w-10 h-10 mx-auto text-rose-400 opacity-80" />
              <p className="text-xs font-semibold text-white">Caméra indisponible ou désactivée</p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                {cameraError || 'Vous pouvez saisir le code manuellement ou utiliser une douchette USB/Bluetooth standard.'}
              </p>
              <Button variant="glass" size="sm" onClick={startCamera} icon={<RefreshCw className="w-3.5 h-3.5" />}>
                Réessayer la caméra
              </Button>
            </div>
          )}
        </div>

        {/* Last scanned feedback banner */}
        {lastScannedCode && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 animate-in fade-in">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold font-mono">Dernier scan : {lastScannedCode}</span>
            </div>
            <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-500 text-white">
              Validé
            </span>
          </div>
        )}

        {/* Manual or Barcode Gun Input Fallback */}
        <form onSubmit={handleManualSubmit} className="space-y-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
            Ou saisie manuelle / Douchette laser
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ex: 200489123891..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono font-bold text-slate-900 dark:text-white"
            />
            <Button type="submit" variant="primary" disabled={!manualCode.trim()}>
              Valider
            </Button>
          </div>
        </form>

        <div className="flex justify-end pt-2 border-t border-slate-200/50 dark:border-white/10">
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
};
