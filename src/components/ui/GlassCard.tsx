import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  /**
   * Carte cliquable : bordure plus marquée au survol (souris uniquement). Sans effet sur une
   * carte qui n'a pas d'action — un survol ne doit jamais promettre un clic qui n'existe pas.
   */
  hoverEffect?: boolean;
}

// Carte de base : surface pleine, bordure 1 px, ombre fine. Aucune animation d'entrée — les
// cartes ne « sautent » plus à chaque filtre, onglet ou rechargement de données.
// (Le nom historique GlassCard est conservé pour ne pas toucher les ~50 usages.)
export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  hoverEffect = false,
  ...props
}) => {
  const interactive = hoverEffect && typeof props.onClick === 'function';
  return (
    <div
      className={`glass-card rounded-xl p-5 ${
        interactive ? 'cursor-pointer transition-colors duration-150 hover:border-line-strong' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
