import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
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

const TOAST_STYLE: Record<ToastType, string> = {
  success: 'bg-emerald-600 border-emerald-400/40',
  error: 'bg-rose-600 border-rose-400/40',
  info: 'bg-blue-600 border-blue-400/40',
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

  const toast = useCallback<DialogApi['toast']>((message, type = 'success') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => dismissToast(id), 4000);
  }, [dismissToast]);

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
        <div className="fixed top-4 right-4 z-[100] flex flex-col items-end gap-2 w-full max-w-sm pointer-events-none">
          {toasts.map((item) => {
            const Icon = TOAST_ICON[item.type];
            return (
              <div
                key={item.id}
                className={`animate-toast-in pointer-events-auto w-full flex items-start gap-2.5 p-3.5 rounded-2xl shadow-xl border text-white text-sm font-semibold ${TOAST_STYLE[item.type]}`}
              >
                <Icon className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <div className="flex-1 leading-snug">{item.message}</div>
                <button
                  type="button"
                  onClick={() => dismissToast(item.id)}
                  className="text-white/80 hover:text-white shrink-0"
                  title="Fermer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
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
