import { Cookie } from "lucide-react";
import LegalPage, { A, B, P, Table, Ul } from "../../components/legal/LegalPage";
import { btnPrimary, btnSm } from "../../components/ui";
import { useConsent } from "../../context/ConsentContext";
import { CONSENT_DURATION_DAYS, COOKIE_CATEGORIES, OPTIONAL_CATEGORIES } from "../../config/cookies";

export default function Cookies() {
  const { consent, openPreferences } = useConsent();
  // Seules les catégories réellement utilisées sont listées (un outil non configuré n'apparaît pas)
  const categories = COOKIE_CATEGORIES.filter((c) => c.required || c.enabled);

  const currentChoice = !OPTIONAL_CATEGORIES.length
    ? "Aucun cookie facultatif n'est utilisé actuellement : rien à accepter."
    : !consent
      ? "Vous n'avez pas encore fait de choix."
      : `Votre choix actuel : ${
          OPTIONAL_CATEGORIES.map((c) => `${c.label} ${consent.choices[c.key] ? "acceptée" : "refusée"}`).join(", ")
        } (enregistré le ${new Date(consent.savedAt).toLocaleDateString("fr-FR")}).`;

  const sections = [
    {
      id: "definition",
      title: "Qu'est-ce qu'un cookie ?",
      content: (
        <P>
          Un cookie est un petit fichier déposé sur votre appareil lors de la visite d'un site. Le « stockage local » et le cache
          de l'application jouent un rôle comparable : ils permettent au site de se souvenir d'informations entre deux visites.
          Dans cette politique, le mot « cookies » désigne l'ensemble de ces techniques.
        </P>
      ),
    },
    {
      id: "liste",
      title: "Les cookies utilisés sur MoveColis",
      content: categories.map((category) => (
        <div key={category.key} className="mb-4">
          <h3 className="font-bold text-[15px] text-ink mb-1">
            {category.label} {category.required ? "· toujours actifs" : "· soumis à votre accord"}
          </h3>
          <P>{category.description}</P>
          <Table
            head={["Nom", "Fournisseur", "Type", "Rôle", "Durée"]}
            rows={category.items.map((i) => [<code key="n" className="text-[12px] break-all">{i.name}</code>, i.provider, i.type, i.purpose, i.duration])}
          />
        </div>
      )),
    },
    {
      id: "consentement",
      title: "Votre consentement",
      content: (
        <>
          <P>
            Les cookies indispensables ne demandent pas d'accord : sans eux, la connexion et la messagerie ne fonctionnent pas.
            Les autres ne sont déposés <B>qu'après votre accord</B>, donné via le bandeau affiché lors de votre première visite.
            Refuser n'a aucune conséquence sur l'utilisation de MoveColis.
          </P>
          <P>
            Votre choix est conservé {Math.round(CONSENT_DURATION_DAYS / 30)} mois, puis vous est redemandé. Il vous est aussi
            redemandé si nous ajoutons un nouvel outil.
          </P>
        </>
      ),
    },
    {
      id: "gerer",
      title: "Gérer vos choix",
      content: (
        <>
          <P>{currentChoice}</P>
          <button type="button" onClick={openPreferences} className={`${btnPrimary} ${btnSm} mb-3`}>
            <Cookie size={15} /> Gérer mes cookies
          </button>
          <P>
            Vous pouvez aussi supprimer les cookies et données du site dans les réglages de votre navigateur : vous serez alors
            déconnecté, et l'accès aux conversations des réservations faites sans compte sera perdu sur cet appareil.
          </P>
        </>
      ),
    },
    {
      id: "notifications",
      title: "Notifications et application installée",
      content: (
        <Ul>
          <li>
            Les <B>notifications</B> ne sont pas des cookies : vous les autorisez dans votre navigateur et pouvez les désactiver
            depuis votre <A to="/profil#notifications">profil</A> ou les réglages de l'appareil.
          </li>
          <li>
            L'<B>application installée</B> utilise les mêmes cookies que le site. La désinstaller supprime ses données de l'appareil.
          </li>
        </Ul>
      ),
    },
    {
      id: "plus",
      title: "En savoir plus",
      content: (
        <P>
          Pour comprendre comment nous utilisons vos données personnelles, consultez notre{" "}
          <A to="/confidentialite">Politique de confidentialité</A>.
        </P>
      ),
    },
  ];

  return <LegalPage title="Politique de cookies" sections={sections} />;
}
