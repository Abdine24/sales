import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'glass' | 'success';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  icon?: React.ReactNode;
}

// Bouton unique de l'application.
// - Pas de grossissement au survol : un bouton métier ne bouge pas sous la souris.
// - Retour au clic en CSS (scale 0.97, 120 ms) : il reste fluide même quand la page est
//   occupée, contrairement à une animation JS.
// - Cible tactile de 44 px sur mobile, hauteur compacte à partir de md.
// - Focus clavier : l'anneau global de index.css (:focus-visible), jamais supprimé ici.
// - Bouton-icône (sans texte) : carré, et `aria-label` obligatoire côté appelant.
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = 'primary', size = 'md', className = '', icon, disabled, ...props }, ref) => {
    const iconOnly = !children;

    const baseStyles =
      'inline-flex items-center justify-center shrink-0 font-medium rounded-lg select-none transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

    const sizeStyles = iconOnly
      ? {
          sm: 'min-w-11 min-h-11 md:min-w-8 md:min-h-8',
          md: 'min-w-11 min-h-11 md:min-w-9 md:min-h-9',
          lg: 'min-w-12 min-h-12',
        }
      : {
          sm: 'min-h-11 md:min-h-8 px-3 text-xs gap-1.5',
          md: 'min-h-11 md:min-h-9 px-4 text-sm gap-2',
          lg: 'min-h-12 px-5 text-base gap-2.5',
        };

    const neutral =
      'bg-surface text-ink border border-line-strong hover:bg-surface-muted shadow-xs';

    const variantStyles = {
      primary: 'bg-accent text-white hover:bg-accent-hover shadow-xs',
      secondary: neutral,
      glass: neutral,
      danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-xs',
      success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs',
      ghost: 'bg-transparent text-ink hover:bg-slate-900/5 dark:hover:bg-white/10',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        disabled={disabled}
        {...props}
      >
        {icon && <span className="shrink-0 inline-flex">{icon}</span>}
        {children && <span>{children}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
