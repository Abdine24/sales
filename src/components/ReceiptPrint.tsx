import React from 'react';
import { createPortal } from 'react-dom';
import { AppSettings } from '../db/db';
import { formatCfa } from '../utils/currency';

export type ReceiptFormat = 'thermique' | 'a4';

export interface ReceiptLine {
  nom: string;
  variante?: string;
  quantite: number;
  prix_unitaire: number;
}

export interface ReceiptData {
  ref: string;
  date: string;
  client_nom?: string;
  vendeur_nom?: string;
  vendeur_identifiant?: string;
  lignes: ReceiptLine[];
  remise?: number;
  total: number;
  montant_paye: number;
  reste_a_payer: number;
  methode_paiement?: string;
  regenere?: boolean;
}

interface Props {
  data: ReceiptData;
  format: ReceiptFormat;
  settings?: AppSettings | null;
}

const paiementLabel = (methode?: string) => {
  if (methode === 'mobile_money') return 'Mobile money';
  if (methode === 'virement') return 'Virement';
  if (methode === 'especes') return 'Espèces';
  return methode ?? '—';
};

/**
 * Reçu imprimable. Rendu via un portail sur <body> pour échapper à `#root`,
 * masqué à l'écran et révélé uniquement par les règles `@media print`
 * (voir `.print-receipt` dans index.css).
 */
export const ReceiptPrint: React.FC<Props> = ({ data, format, settings }) => {
  const sousTotal = data.lignes.reduce((sum, l) => sum + l.prix_unitaire * l.quantite, 0);
  const nbArticles = data.lignes.reduce((sum, l) => sum + l.quantite, 0);

  const showLogo = settings?.ticket_show_logo !== false;
  const showVendeur = settings?.ticket_show_vendeur !== false;
  const showAdresse = settings?.ticket_show_adresse !== false;
  const showIfu = settings?.ticket_show_ifu !== false;
  const showQrcode = settings?.ticket_show_qrcode !== false;
  const footerMessage = settings?.ticket_footer_message || 'Merci de votre visite !';

  const content = (
    <div className="print-receipt" data-format={format} aria-hidden="true">
      <div className={`receipt-body receipt-${format}`}>
        <header className="receipt-head">
          {showLogo && settings?.logo_url ? (
            <img src={settings.logo_url} alt="" className="receipt-logo" />
          ) : null}
          <h1>{settings?.nom_site || 'Reçu de caisse'}</h1>
          {settings?.slogan ? <p className="receipt-muted">{settings.slogan}</p> : null}
          {showAdresse && settings?.localite ? <p className="receipt-muted">{settings.localite}</p> : null}
          {showAdresse && settings?.telephone ? <p className="receipt-muted">Tél. {settings.telephone}</p> : null}
          {showAdresse && settings?.email ? <p className="receipt-muted">Email : {settings.email}</p> : null}
          {showIfu && settings?.ifu ? <p className="receipt-muted">IFU : {settings.ifu}</p> : null}
          {showIfu && settings?.rrcm ? <p className="receipt-muted">RCCM : {settings.rrcm}</p> : null}
        </header>

        <div className="receipt-sep" />

        <div className="receipt-meta">
          <div><span>Reçu n°</span><span>{data.ref.substring(0, 8).toUpperCase()}</span></div>
          <div><span>Date</span><span>{new Date(data.date).toLocaleString('fr-FR')}</span></div>
          {data.client_nom ? <div><span>Client</span><span>{data.client_nom}</span></div> : null}
          {showVendeur && data.vendeur_nom ? <div><span>Vendeur</span><span>{data.vendeur_nom}</span></div> : null}
          <div><span>Paiement</span><span>{paiementLabel(data.methode_paiement)}</span></div>
        </div>

        <div className="receipt-sep" />

        <table className="receipt-lines">
          <thead>
            <tr><th>Article</th><th>Qté</th><th>P.U.</th><th>Total</th></tr>
          </thead>
          <tbody>
            {data.lignes.map((l, i) => (
              <tr key={i}>
                <td>{l.nom}{l.variante ? ` (${l.variante})` : ''}</td>
                <td>{l.quantite}</td>
                <td>{formatCfa(l.prix_unitaire)}</td>
                <td>{formatCfa(l.prix_unitaire * l.quantite)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-sep" />

        <div className="receipt-totals">
          <div><span>Sous-total ({nbArticles} art.)</span><span>{formatCfa(sousTotal)}</span></div>
          {data.remise ? <div><span>Remise</span><span>- {formatCfa(data.remise)}</span></div> : null}
          <div className="receipt-total-line"><span>TOTAL</span><span>{formatCfa(data.total)}</span></div>
          <div><span>Payé</span><span>{formatCfa(data.montant_paye)}</span></div>
          {data.reste_a_payer > 0
            ? <div className="receipt-due"><span>Reste à payer</span><span>{formatCfa(data.reste_a_payer)}</span></div>
            : <div><span>Rendu</span><span>{formatCfa(Math.max(0, data.montant_paye - data.total))}</span></div>}
        </div>

        <div className="receipt-sep" />

        <footer className="receipt-foot">
          {data.regenere ? <p className="receipt-muted">Duplicata édité le {new Date().toLocaleString('fr-FR')}</p> : null}
          <p>{footerMessage}</p>
          {showQrcode && (
            <div style={{ marginTop: '6px', fontSize: '9px', opacity: 0.7, fontFamily: 'monospace' }}>
              REF: {data.ref.toUpperCase()}
            </div>
          )}
        </footer>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
