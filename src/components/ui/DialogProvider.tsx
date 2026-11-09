import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmOptions {
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface AlertOptions {
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
}

type ToastType = 'success' | 'error' | 'info';

interface DialogApi {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
  // Confirmation passagère, non bloquante — pour les succès fréquents (enregistrement, mise à
  // jour...) où demander de cliquer "OK" à chaque fois serait plus gênant qu'utile. Réservez
  // `alert()` aux cas qui ont vraiment besoin d'un accusé de réception (erreurs, avertissements).
  toast: (message: React.ReactNode, type?: ToastType) => void;
}

const DialogContext = createContext<DialogApi | null>(null);

type DialogState =
  | { mode: 'confirm'; options: ConfirmOptions }
  | { mode: 'alert'; options: AlertOptions };

interface ToastItem {
  id: number;
  message: React.ReactNode;
  type: ToastType;
}

const TOAST_ICON: Record<ToastType, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const TOAST_ICON_STYLE: Record<ToastType, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-rose-600 dark:text-rose-400',
  info: 'text-blue-600 dark:text-blue-400',
};

const TOAST_DURATION = 4000;

// Un toast : surface neutre, icône colorée selon le type. Le minuteur se met en pause tant
// que la souris est dessus ou que l'onglet est masqué — un message ne disparaît jamais
// pendant qu'on le lit ou qu'on n'est pas devant l'écran.
const ToastView: React.FC<{ item: ToastItem; onDismiss: (id: number) => void }> = ({ item, onDismiss }) => {
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const remainingRef = useRef(TOAST_DURATION);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (hovered || hidden) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onDismiss(item.id), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(800, remainingRef.current - (Date.now() - startedAt));
    };
  }, [hovered, hidden, item.id, onDismiss]);

  const Icon = TOAST_ICON[item.type];
  return (
    <div
      role={item.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="animate-toast-in pointer-events-auto w-full flex items-start gap-3 pl-4 pr-1 py-1 rounded-xl shadow-lg border border-line bg-surface text-ink text-sm"
    >
      <Icon className={`w-5 h-5 shrink-0 mt-3 ${TOAST_ICON_STYLE[item.type]}`} />
      <div className="flex-1 leading-snug py-3 font-medium">{item.message}</div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="touch-target md:min-w-9 md:min-h-9 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink shrink-0"
        aria-label="Fermer la notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DialogState | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // La fermeture automatique est gérée par chaque toast (ToastView), qui met son minuteur en
  // pause au survol et quand l'onglet est masqué.
  const toast = useCallback<DialogApi['toast']>((message, type = 'success') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
  }, []);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setIsOpen(false);
  }, []);

  const confirm = useCallback<DialogApi['confirm']>((options) => {
    const normalized = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ mode: 'confirm', options: normalized });
      setIsOpen(true);
    });
  }, []);

  const alert = useCallback<DialogApi['alert']>((options) => {
    const normalized = typeof options === 'string' ? { message: options } : options;
    return new Promise<void>((resolve) => {
      resolverRef.current = () => resolve();
      setState({ mode: 'alert', options: normalized });
      setIsOpen(true);
    });
  }, []);

  const isConfirm = state?.mode === 'confirm';
  const danger = isConfirm && state.options.danger;
  const defaultTitle = isConfirm ? 'Confirmation' : 'Information';

  return (
    <DialogContext.Provider value={{ confirm, alert, toast }}>
      {children}
      {createPortal(
        // Mobile : en bas, au-dessus de la barre d'onglets (à portée du regard et du pouce,
        // sans masquer le header). Desktop : en haut à droite. Zone annoncée aux lecteurs
        // d'écran (aria-live), sans voler le focus.
        <div
          aria-live="polite"
          aria-relevant="additions"
          className="fixed z-[100] flex flex-col gap-2 pointer-events-none inset-x-3 bottom-[calc(var(--bottom-nav-h)+12px)] md:inset-x-auto md:bottom-auto md:top-4 md:right-4 md:w-full md:max-w-sm"
        >
          {toasts.map((item) => (
            <ToastView key={item.id} item={item} onDismiss={dismissToast} />
          ))}
        </div>,
        document.body
      )}
      <Modal
        isOpen={isOpen && state !== null}
        onClose={() => settle(false)}
        title={state?.options.title ?? defaultTitle}
        maxWidth="sm"
      >
        {state && (
          <div className="space-y-5">
            <div className="flex gap-3">
              <div
                className={`shrink-0 p-2 rounded-xl h-fit ${
                  danger ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-500'
                }`}
              >
                {danger ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300 pt-1">
                {state.options.message}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              {isConfirm && (
                <Button variant="ghost" onClick={() => settle(false)}>
                  {state.options.cancelLabel ?? 'Annuler'}
                </Button>
              )}
              <Button
                variant={danger ? 'danger' : 'primary'}
                onClick={() => settle(true)}
              >
                {state.options.confirmLabel ?? (isConfirm ? 'Confirmer' : 'OK')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DialogContext.Provider>
  );
};

export const useDialog = (): DialogApi => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog doit être utilisé à l\'intérieur d\'un DialogProvider');
  }
  return context;
};
