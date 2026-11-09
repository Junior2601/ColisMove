import { useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import FlightOrdersAdmin from "../../components/admin/FlightOrdersAdmin";
import FlightOffersAdmin from "../../components/admin/FlightOffersAdmin";
import FlightRulesAdmin from "../../components/admin/FlightRulesAdmin";
import FreedKilosAdmin from "../../components/admin/FreedKilosAdmin";
import { ChipRow, ErrorState, FilterChip, Loader, Notice } from "../../components/ui";
import { adminApi } from "../../api/admin";
import { useApi } from "../../hooks/useApi";

// L'onglet actif est dans l'URL (?onglet=regles) : le tableau de bord peut y renvoyer directement
const TABS = [
  { key: "demandes", label: "Demandes" },
  { key: "kilos", label: "Kilos disponibles" },
  { key: "billets", label: "Billets Aviasales" },
  { key: "regles", label: "Réglages" },
];

export default function AdminBillets() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("onglet")) ? params.get("onglet") : "demandes";
  const settings = useApi(() => adminApi.getFlightSettings(), []);
  const data = settings.data;

  return (
    <Layout variant="admin">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-extrabold tracking-tight mt-5 mb-1">Billets d&apos;avion</h1>
        <p className="text-muted text-sm mb-3">
          Demandes d&apos;achat des clients, kilos libérés par les valises retirées, billets issus d&apos;Aviasales et
          réglages.
        </p>

        {data && !data.apiConfigured && (
          <Notice tone="warn">
            Clé API Aviasales manquante : ajoutez <b>TRAVELPAYOUTS_TOKEN</b> dans le fichier <b>.env.api</b> du serveur
            (jeton gratuit sur travelpayouts.com, programme Aviasales), puis redémarrez l&apos;API. Sans elle, aucun prix
            ne peut être récupéré.
          </Notice>
        )}
        {data && data.apiConfigured && !data.settings.enabled && (
          <Notice>
            La vente de billets est désactivée : l&apos;onglet n&apos;apparaît pas sur l&apos;accueil. Activez-la dans{" "}
            <button type="button" onClick={() => setParams({ onglet: "regles" })} className="font-bold underline">
              Réglages
            </button>
            .
          </Notice>
        )}

        <ChipRow>
          {TABS.map((t) => (
            <FilterChip key={t.key} active={tab === t.key} onClick={() => setParams(t.key === "demandes" ? {} : { onglet: t.key })}>
              {t.label}
            </FilterChip>
          ))}
        </ChipRow>

        {tab === "demandes" && <FlightOrdersAdmin />}
        {tab === "kilos" && <FreedKilosAdmin />}
        {!["demandes", "kilos"].includes(tab) && settings.error && <ErrorState error={settings.error} onRetry={settings.reload} />}
        {!["demandes", "kilos"].includes(tab) && !data && settings.loading && <Loader />}
        {tab === "billets" && data && <FlightOffersAdmin settings={data.settings} />}
        {tab === "regles" && data && <FlightRulesAdmin data={data} onSaved={settings.setData} />}
      </div>
    </Layout>
  );
}
