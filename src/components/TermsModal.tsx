import React from 'react';
import { Modal } from './ui/Modal';

// Brouillon de conditions d'utilisation — PAS un conseil juridique, à faire relire/ajuster
// (nom exact de la société, juridiction, éventuel numéro d'enregistrement...) avant de le
// considérer comme définitif. Contenu volontairement spécifique au produit réel (boutiques
// multi-tenant, licence par abonnement, essai gratuit unique) plutôt qu'un texte générique.
export const TermsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Conditions d'utilisation" maxWidth="2xl">
    <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 max-h-[65vh] overflow-y-auto pr-1">
      <p className="text-xs text-slate-400 italic">Dernière mise à jour : à compléter.</p>

      <section className="space-y-1.5">
        <h3 className="font-bold text-slate-900 dark:text-white">1. Objet</h3>
        <p>
          iVente Pro ("le Service") est une application de gestion de ventes, stock et caisse
          destinée aux commerces. En créant une boutique ou en utilisant le Service, vous
          acceptez les présentes conditions.
        </p>
      </section>

      <section className="space-y-1.5">
        <h3 className="font-bold text-slate-900 dark:text-white">2. Compte et boutique</h3>
        <p>
          La création d'une boutique donne accès à un espace dédié et isolé. L'administrateur
          principal de la boutique est responsable de la création et de la gestion des comptes
          de son équipe, ainsi que de la confidentialité des identifiants qu'il leur attribue.
        </p>
      </section>

      <section className="space-y-1.5">
        <h3 className="font-bold text-slate-900 dark:text-white">3. Abonnement et essai gratuit</h3>
        <p>
          Un essai gratuit de 7 jours est proposé une seule fois par boutique. L'utilisation
          continue du Service au-delà de la période d'essai ou de l'abonnement en cours
          nécessite une clé de licence valide. Les tarifs et durées d'abonnement disponibles
          sont communiqués séparément.
        </p>
      </section>

      <section className="space-y-1.5">
        <h3 className="font-bold text-slate-900 dark:text-white">4. Données</h3>
        <p>
          Les données de chaque boutique (produits, ventes, clients, personnel) sont stockées
          séparément de celles des autres boutiques. Vous restez propriétaire de vos données
          commerciales. Nous ne les utilisons pas à des fins autres que le fonctionnement du
          Service, et ne les partageons pas avec des tiers sans votre accord, sauf obligation
          légale.
        </p>
      </section>

      <section className="space-y-1.5">
        <h3 className="font-bold text-slate-900 dark:text-white">5. Disponibilité</h3>
        <p>
          Nous nous efforçons d'assurer une disponibilité continue du Service, sans garantie
          absolue d'absence d'interruption (maintenance, incident technique). Nous vous
          recommandons de conserver vos propres sauvegardes/exports pour les données critiques.
        </p>
      </section>

      <section className="space-y-1.5">
        <h3 className="font-bold text-slate-900 dark:text-white">6. Usage autorisé</h3>
        <p>
          Le Service doit être utilisé dans le respect des lois en vigueur. Toute tentative de
          contournement des mécanismes de sécurité, de licence, ou d'accès aux données d'une
          autre boutique est strictement interdite.
        </p>
      </section>

      <section className="space-y-1.5">
        <h3 className="font-bold text-slate-900 dark:text-white">7. Résiliation</h3>
        <p>
          Vous pouvez cesser d'utiliser le Service à tout moment. Nous nous réservons le droit
          de suspendre une boutique en cas d'usage abusif ou de non-paiement prolongé, après
          notification préalable lorsque cela est raisonnablement possible.
        </p>
      </section>

      <section className="space-y-1.5">
        <h3 className="font-bold text-slate-900 dark:text-white">8. Contact</h3>
        <p>Pour toute question sur ces conditions, contactez-nous via WhatsApp (lien en bas de l'écran de connexion).</p>
      </section>
    </div>
  </Modal>
);
