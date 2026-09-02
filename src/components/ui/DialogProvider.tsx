import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
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

interface DialogApi {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);

type DialogState =
  | { mode: 'confirm'; options: ConfirmOptions }
  | { mode: 'alert'; options: AlertOptions };

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DialogState | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

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
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
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
