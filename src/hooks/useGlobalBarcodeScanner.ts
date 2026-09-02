import { useEffect, useRef } from 'react';

interface UseGlobalBarcodeScannerOptions {
  // Désactive l'écoute (ex: pendant qu'une modale est ouverte, pour ne pas voler la touche Entrée).
  enabled: boolean;
  onScan: (code: string) => void;
  // Nombre minimum de caractères pour considérer une frappe comme un scan (évite les faux positifs).
  minLength?: number;
  // Délai max (ms) entre deux touches pour rester dans la même rafale. Un lecteur code-barres
  // tape en quelques millisecondes ; un humain qui tape vite reste largement au-dessus.
  maxIntervalMs?: number;
}

const EDITABLE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

// Capture un scan de douchette code-barres (USB/Bluetooth en mode "clavier") où que soit le
// focus sur la page — tant qu'il n'est pas dans un champ de saisie (l'utilisateur y tape alors
// normalement, pas de conflit). Un lecteur émule un clavier : il tape le code très vite puis
// envoie Entrée. On distingue ça d'une frappe humaine par la vitesse entre les touches.
export function useGlobalBarcodeScanner({
  enabled,
  onScan,
  minLength = 3,
  maxIntervalMs = 60,
}: UseGlobalBarcodeScannerOptions) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = '';
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (EDITABLE_TAGS.includes(target.tagName) || target.isContentEditable)) {
        return; // L'utilisateur tape normalement dans un champ — on ne touche à rien.
      }

      const now = Date.now();
      const elapsed = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (event.key === 'Enter') {
        const code = bufferRef.current.trim();
        bufferRef.current = '';
        if (code.length >= minLength) {
          event.preventDefault();
          onScanRef.current(code);
        }
        return;
      }

      // Ignore les touches modificatrices/spéciales (Shift, Tab, flèches...) — seuls les
      // caractères imprimables (event.key d'un seul caractère) composent le code scanné.
      if (event.key.length !== 1) return;

      if (elapsed > maxIntervalMs) {
        // Trop lent pour être un lecteur : on démarre une nouvelle rafale potentielle.
        bufferRef.current = '';
      }
      bufferRef.current += event.key;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      bufferRef.current = '';
    };
  }, [enabled, minLength, maxIntervalMs]);
}
