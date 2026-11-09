import React from 'react';

/** Bloc gris de la forme du contenu à venir. Pulsation lente (supprimée si l'utilisateur
 *  demande moins d'animations, voir index.css). */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div aria-hidden className={`animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-800 ${className}`} />
);

type Variant = 'dashboard' | 'pos' | 'list' | 'form' | 'cards';

const Header = () => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
    <div className="space-y-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
    <div className="flex gap-2">
      <Skeleton className="h-10 w-28" />
      <Skeleton className="h-10 w-32" />
    </div>
  </div>
);

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`glass-card rounded-xl p-4 sm:p-5 ${className}`}>{children}</div>
);

/**
 * Squelette d'une page en cours de chargement : il reprend la forme de l'écran attendu
 * (cartes KPI, grille produits, tableau…) pour que rien ne « saute » quand les données
 * arrivent. Remplace l'ancien texte « Chargement… ».
 */
export const PageSkeleton: React.FC<{ variant?: Variant }> = ({ variant = 'list' }) => (
  <div role="status" aria-live="polite" className="space-y-4 sm:space-y-6">
    <span className="sr-only">Chargement…</span>

    {variant !== 'pos' && <Header />}

    {variant === 'dashboard' && (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-36 mt-4" />
              <Skeleton className="h-3 w-24 mt-3" />
            </Card>
          ))}
        </div>
        <Card>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-48 w-full mt-4" />
        </Card>
      </>
    )}

    {variant === 'pos' && (
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        <div className="flex-1 space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-11 flex-1 sm:flex-none sm:w-72" />
            <Skeleton className="h-11 w-20 hidden sm:block" />
            <Skeleton className="h-11 w-24 hidden sm:block" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Card key={i} className="!p-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-4/5 mt-3" />
                <Skeleton className="h-3 w-1/3 mt-2" />
                <div className="flex items-center justify-between mt-5">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-10 rounded-lg" />
                </div>
              </Card>
            ))}
          </div>
        </div>
        <Card className="hidden lg:block w-96 space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
      </div>
    )}

    {variant === 'list' && (
      <Card className="!p-0 overflow-hidden">
        <div className="p-4 border-b border-line flex gap-2">
          <Skeleton className="h-10 flex-1 max-w-sm" />
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="h-4 flex-1 max-w-[16rem]" />
              <Skeleton className="h-4 w-20 hidden sm:block" />
              <Skeleton className="h-4 w-24 ml-auto" />
            </div>
          ))}
        </div>
      </Card>
    )}

    {variant === 'cards' && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i}>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/2 mt-3" />
            <Skeleton className="h-3 w-1/3 mt-2" />
          </Card>
        ))}
      </div>
    )}

    {variant === 'form' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }, (_, i) => (
          <Card key={i} className="space-y-4">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 4 }, (__, j) => (
              <div key={j} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </Card>
        ))}
      </div>
    )}
  </div>
);
