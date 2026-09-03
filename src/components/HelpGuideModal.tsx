import React from 'react';
import { Store, KeyRound, Users, Package, ShoppingCart, Wallet } from 'lucide-react';
import { Modal } from './ui/Modal';

const STEPS = [
  {
    icon: Store,
    title: '1. Créer ta boutique',
    text: "Depuis l'écran d'accueil, indique le nom de ta boutique — une adresse en ligne rien qu'à toi (ex: taboutique.azanga.tech) est créée automatiquement.",
  },
  {
    icon: KeyRound,
    title: '2. Activer ton compte',
    text: "Sur cette nouvelle adresse, clique sur \"Activer une nouvelle licence\", renseigne tes informations et une clé de licence (l'essai gratuit de 7 jours suffit pour commencer). Un code de vérification t'est envoyé par email.",
  },
  {
    icon: Users,
    title: '3. Ajouter ton équipe',
    text: "Dans Personnel, ajoute tes employés (caissiers, gérants) — c'est toi, l'administrateur, qui choisis leur mot de passe. Ils n'ont pas besoin de créer leur propre compte.",
  },
  {
    icon: Package,
    title: '4. Ajouter tes produits',
    text: "Dans Stock, ajoute tes produits avec leur prix de vente et leur prix d'achat (important pour calculer ton bénéfice réel) — simples ou avec variantes (couleur, taille...).",
  },
  {
    icon: ShoppingCart,
    title: '5. Encaisser une vente',
    text: 'La Caisse (POS) te permet de scanner ou chercher un produit, encaisser en espèces/mobile money/virement, et imprimer ou envoyer le reçu par WhatsApp.',
  },
  {
    icon: Wallet,
    title: '6. Suivre tes finances',
    text: 'Le Tableau de bord et Ventes te montrent ton chiffre d\'affaires, ton bénéfice réel, et tes créances clients à recouvrer.',
  },
];

export const HelpGuideModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Comment utiliser iVente Pro" maxWidth="2xl">
    <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
      {STEPS.map((step) => (
        <div key={step.title} className="flex gap-3.5 p-3.5 rounded-2xl bg-slate-500/5 border border-slate-200/50 dark:border-white/10">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <step.icon className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">{step.title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{step.text}</p>
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-400 text-center pt-1">
        Une question précise ? Contacte-nous via WhatsApp (lien en bas de l'écran de connexion).
      </p>
    </div>
  </Modal>
);
