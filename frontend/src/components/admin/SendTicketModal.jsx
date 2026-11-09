import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Paperclip, Send, X } from "lucide-react";
import { ErrorState, Field, Modal, Notice, btnOutline, btnPrimary, btnSm, inputClass } from "../ui";
import { adminApi } from "../../api/admin";
import { errorMessage, fieldErrors } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { formatDateTime, formatMoney } from "../../lib/format";
import { passengersLabel } from "../../lib/flights";

// Mêmes limites que le serveur (validators/flight.validator.js)
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_FILES = 5;
const MAX_BYTES = 8 * 1024 * 1024;

const formatSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} ko` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

// Fichier → contenu en base64 (sans le préfixe « data:…;base64, »)
function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error(`Impossible de lire « ${file.name} ».`));
    reader.readAsDataURL(file);
  });
}

/**
 * Envoi du billet au client par e-mail : billet(s) en pièce jointe + reçu détaillé.
 *  - demande « Payée »       : l'envoi la passe à « Billet émis »
 *  - demande « Billet émis » : nouvel envoi (adresse corrigée, e-mail perdu…)
 * onSent(demande mise à jour)
 */
export default function SendTicketModal({ order, onClose, onSent }) {
  const resend = order.status === "ISSUED";
  const [email, setEmail] = useState(order.receiptEmail ?? order.clientEmail ?? "");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState([]); // File[]
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const mail = useApi(() => adminApi.getMailStatus(), []).data; // SMTP absent ou en erreur : prévenu avant de joindre le billet
  const mailProblem = mail && (!mail.configured ? "L'envoi d'e-mails n'est pas configuré sur le serveur : le billet ne partira pas."
    : mail.lastCheck?.ok === false ? `Le dernier contrôle des e-mails a échoué : ${mail.lastCheck.error}` : null);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  function addFiles(list) {
    setError(null);
    const picked = [...list];
    const refused = picked.filter((file) => !ACCEPTED_TYPES.includes(file.type));
    const next = [...files, ...picked.filter((file) => ACCEPTED_TYPES.includes(file.type))].slice(0, MAX_FILES);
    if (refused.length) setError(`Fichier PDF, JPG ou PNG uniquement (${refused.map((f) => f.name).join(", ")} ignoré).`);
    else if (files.length + picked.length > MAX_FILES) setError(`${MAX_FILES} fichiers au maximum.`);
    setFiles(next);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (totalBytes > MAX_BYTES) {
      setError("Fichiers trop lourds : 8 Mo au total au maximum.");
      return;
    }
    setSubmitting(true);
    setErrors({});
    setError(null);
    try {
      const attachments = await Promise.all(
        files.map(async (file) => ({ filename: file.name, contentType: file.type, data: await readBase64(file) }))
      );
      const updated = await adminApi.sendFlightTicket(order.id, { email: email.trim(), note: note.trim() || null, attachments });
      onSent(updated);
    } catch (err) {
      setErrors(fieldErrors(err));
      // 413 : refusé par le serveur (Nginx) avant l'API, sans message lisible
      setError(err.status === 413 ? "Fichiers trop lourds pour le serveur : réduisez-les (PDF de préférence) puis réessayez." : errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal open title={resend ? "Renvoyer le billet par e-mail" : "Billet émis : envoyer le billet"} onClose={submitting ? undefined : onClose}>
      <p className="text-sm text-muted mb-4">
        {order.clientName} · {order.flight.origin.name} → {order.flight.destination.name} · {passengersLabel(order)} ·{" "}
        {formatMoney(order.totalAmount, order.currency)} ({order.reference}). Le client reçoit le billet joint et un reçu
        détaillé (vol, passagers, bagages, prix payé).
        {!resend && " La demande passe à « Billet émis »."}
      </p>
      {mailProblem && (
        <Notice tone="danger">
          {mailProblem}{" "}
          <Link to="/admin/parametres" className="font-bold underline">Vérifier dans les paramètres</Link>
        </Notice>
      )}
      {resend && order.receiptSentAt && (
        <Notice>
          Déjà envoyé à <b>{order.receiptEmail}</b> le {formatDateTime(order.receiptSentAt)}.
        </Notice>
      )}

      <form onSubmit={handleSend}>
        <Field label="E-mail du client" error={errors.email}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="off"
            placeholder="client@exemple.com" className={inputClass} />
        </Field>

        <Field label="Billet (PDF, JPG ou PNG)" hint={`${MAX_FILES} fichiers et 8 Mo au maximum.`} error={errors.attachments}>
          <div className="flex flex-col gap-2">
            {files.map((file, i) => (
              <div key={`${file.name}-${i}`} className="flex items-center gap-2 border border-line-light rounded-xl px-3 py-2 text-sm">
                <FileText size={16} className="text-muted shrink-0" />
                <span className="min-w-0 flex-1 truncate font-semibold">{file.name}</span>
                <span className="text-xs text-muted shrink-0">{formatSize(file.size)}</span>
                <button type="button" aria-label={`Retirer ${file.name}`} disabled={submitting}
                  onClick={() => setFiles((list) => list.filter((_, index) => index !== i))}
                  className="p-1 rounded-full hover:bg-surface shrink-0">
                  <X size={15} />
                </button>
              </div>
            ))}
            {files.length < MAX_FILES && (
              <button type="button" onClick={() => inputRef.current?.click()} disabled={submitting}
                className={`${btnOutline} ${btnSm} self-start`}>
                <Paperclip size={15} /> Joindre le billet
              </button>
            )}
            <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>
        </Field>
        {files.length === 0 && (
          <Notice tone="warn">Aucun billet joint : le client ne recevra que le reçu.</Notice>
        )}

        <Field label="Message au client (facultatif)" hint="Visible dans l'e-mail et dans la conversation." error={errors.note}>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255}
            placeholder="Ex. Numéro de réservation (PNR) : ABC123" className={inputClass} />
        </Field>

        {error && <ErrorState message={error} />}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={submitting} className={`${btnOutline} ${btnSm}`}>Retour</button>
          <button type="submit" disabled={submitting || !email.trim()} className={`${btnPrimary} ${btnSm}`}>
            <Send size={15} /> {submitting ? "Envoi…" : resend ? "Renvoyer" : "Envoyer et marquer émis"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
