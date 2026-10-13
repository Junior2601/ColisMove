import { useEffect, useRef, useState } from "react";
import { Check, MessageSquare } from "lucide-react";
import Layout from "../../components/Layout";
import { ErrorState, Field, Loader, Notice, btnPrimary, inputClass } from "../../components/ui";
import { adminApi } from "../../api/admin";
import { errorMessage } from "../../api/client";
import { useApi } from "../../hooks/useApi";

// Valeurs d'exemple pour l'aperçu en direct
const PREVIEW_DATA = {
  kilos: "5",
  trajet: "Abidjan → Moscou",
  date: "sam. 25 juil.",
  nom: "Koné Awa",
  code: "MC-20260725-AB3D",
};

const VARIABLE_REGEX = /\{(\w+)\}/g;

// Remplace {kilos}, {trajet}… par les valeurs d'exemple
function interpolate(template, data) {
  return template.replace(VARIABLE_REGEX, (match, key) => data[key] ?? match);
}

function extractVariables(template) {
  return [...new Set([...template.matchAll(VARIABLE_REGEX)].map((m) => m[1]))];
}

// "+225 07 12 34 56 78" → "2250712345678" (pour comparer avec la valeur enregistrée)
const digitsOnly = (value) => value.replace(/\D/g, "");

export default function Parametres() {
  const { data, loading, error, reload, setData } = useApi(() => adminApi.getSettings(), []);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const templateRef = useRef(null);

  // Pré-remplit (ou réinitialise) le formulaire quand les paramètres arrivent du serveur
  useEffect(() => {
    if (!data) return;
    setForm({
      supportWhatsapp: data.supportWhatsapp ? `+${data.supportWhatsapp}` : "",
      template: data.reservationMessageTemplate,
    });
  }, [data]);

  if (!form) {
    return (
      <Layout variant="admin">
        <div className="max-w-2xl mx-auto">
          {error ? <ErrorState error={error} onRetry={reload} /> : loading && <Loader />}
        </div>
      </Layout>
    );
  }

  const variables = data.availableVariables;
  const unknownVariables = extractVariables(form.template).filter((v) => !variables.includes(v));
  const preview = interpolate(form.template, PREVIEW_DATA);
  const isDirty =
    form.template !== data.reservationMessageTemplate ||
    digitsOnly(form.supportWhatsapp) !== (data.supportWhatsapp ?? "");

  // Insère {variable} à la position du curseur dans le message
  function insertVariable(name) {
    const el = templateRef.current;
    const token = `{${name}}`;
    const start = el?.selectionStart ?? form.template.length;
    const end = el?.selectionEnd ?? start;
    setForm((f) => ({ ...f, template: f.template.slice(0, start) + token + f.template.slice(end) }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await adminApi.updateSettings({
        supportWhatsapp: form.supportWhatsapp.trim() || null,
        reservationMessageTemplate: form.template,
      });
      setData(updated); // le formulaire se recale sur les valeurs enregistrées
      setSaved(true);
      setTimeout(() => setSaved(false), 2500); // confirmation temporaire
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout variant="admin">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-extrabold tracking-tight mt-5 mb-1">Paramètres de messagerie</h1>
        <p className="text-muted text-sm mb-4">
          Le message qui ouvre automatiquement la conversation lorsqu'un client réserve des kilos.
        </p>

        <form onSubmit={handleSave} className="border border-line rounded-2xl p-5 bg-white">
          <Field
            label="Premier message de la conversation"
            hint={
              <>
                Cliquez sur une variable pour l'insérer :{" "}
                {variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="bg-surface hover:bg-line-light px-1.5 py-0.5 rounded font-bold font-mono mr-1 transition"
                  >
                    {`{${v}}`}
                  </button>
                ))}
              </>
            }
          >
            <textarea
              ref={templateRef}
              value={form.template}
              onChange={(e) => setForm((f) => ({ ...f, template: e.target.value }))}
              rows={4}
              maxLength={1000}
              className={inputClass}
            />
          </Field>

          {unknownVariables.length > 0 && (
            <p className="text-danger text-xs font-semibold -mt-2 mb-4">
              Variable(s) inconnue(s) : {unknownVariables.map((v) => `{${v}}`).join(", ")}
            </p>
          )}

          {/* ===== Aperçu en direct : bulle de la messagerie MoveColis ===== */}
          <div className="mb-5">
            <div className="text-[13px] font-bold mb-1.5">Aperçu dans la conversation</div>
            <div className="bg-surface rounded-xl p-4">
              <div className="bg-primary text-white rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm max-w-[85%] ml-auto whitespace-pre-wrap break-words">
                {preview}
                <span className="block text-right text-[10.5px] opacity-80 mt-1">14:32 · Koné Awa</span>
              </div>
            </div>
            <div className="text-xs text-muted mt-1.5">
              Exemple avec : 5 kg, Abidjan → Moscou, sam. 25 juil., Koné Awa, MC-20260725-AB3D.
            </div>
          </div>

          <Field
            label="WhatsApp du support (facultatif)"
            hint="Affiché comme contact d'assistance. Les réservations, elles, passent désormais par la messagerie MoveColis."
          >
            <input
              value={form.supportWhatsapp}
              onChange={(e) => setForm((f) => ({ ...f, supportWhatsapp: e.target.value }))}
              type="tel"
              placeholder="+225 07 00 00 00 00"
              className={inputClass}
            />
          </Field>

          {saveError && <ErrorState message={saveError} />}

          <button
            type="submit"
            disabled={saving || unknownVariables.length > 0 || (!isDirty && !saved)}
            className={`${btnPrimary} w-full`}
          >
            {saved ? (
              <>
                <Check size={18} /> Paramètres enregistrés
              </>
            ) : (
              <>
                <MessageSquare size={18} /> {saving ? "Enregistrement…" : "Enregistrer les paramètres"}
              </>
            )}
          </button>
        </form>

        <Notice>
          Ce message est envoyé automatiquement, au nom du client, dans la conversation créée à chaque
          réservation — sur <b>vos voyages comme sur ceux des voyageurs</b>. Le propriétaire du voyage le
          reçoit et confirme la réservation directement dans la messagerie.
        </Notice>
      </div>
    </Layout>
  );
}
