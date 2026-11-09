import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray';
  size?: 'sm' | 'md';
  className?: string;
  dot?: boolean;
  title?: string;
}

// Étiquette rectangulaire (8 px), teintes pleines et contrastées, sans flou.
// « purple » est conservé pour compatibilité mais rendu en neutre : un seul accent (bleu)
// dans l'interface.
export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'blue',
  size = 'md',
  className = '',
  dot = false,
  title,
}) => {
  const neutral =
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700';
  const variantMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    amber: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    red: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
    purple: neutral,
    gray: neutral,
  };

  const dotMap = {
    blue: 'bg-blue-600',
    green: 'bg-emerald-600',
    amber: 'bg-amber-500',
    red: 'bg-rose-600',
    purple: 'bg-slate-500',
    gray: 'bg-slate-500',
  };

  const sizeMap = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-0.5 text-xs',
  };

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap ${sizeMap[size]} ${variantMap[variant]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotMap[variant]}`} />}
      {children}
    </span>
  );
};
