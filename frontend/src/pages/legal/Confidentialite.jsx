import LegalPage, { A, B, Fill, P, Table, Ul } from "../../components/legal/LegalPage";
import { LEGAL } from "../../config/legal";

export default function Confidentialite() {
  const L = LEGAL;
  const contact = <Fill value={L.privacyEmail || L.email} label="e-mail pour les données personnelles" />;

  const sections = [
    {
      id: "responsable",
      title: "Qui est responsable de vos données ?",
      content: (
        <P>
          Le responsable du traitement est <B><Fill value={L.companyName} label="raison sociale" /></B>, éditeur de MoveColis
          (coordonnées complètes dans les <A to="/mentions-legales">mentions légales</A>). Pour toute question sur vos données :{" "}
          <B>{contact}</B>.
        </P>
      ),
    },
    {
      id: "cadre",
      title: "Cadre légal",
      content: (
        <P>
          Nous traitons vos données conformément à la loi ivoirienne n° 2013-450 du 19 juin 2013 relative à la protection des
          données à caractère personnel, sous le contrôle de l'ARTCI (référence : <Fill value={L.artciReference} label="n° ARTCI" />).
          Lorsque vous résidez dans l'Union européenne, vous bénéficiez également des droits prévus par le Règlement général sur la
          protection des données (RGPD).
        </P>
      ),
    },
    {
      id: "donnees",
      title: "Les données que nous collectons",
      content: (
        <Table
          head={["Catégorie", "Données", "Origine"]}
          rows={[
            ["Compte", "Prénom, nom, e-mail, téléphone, ville de résidence (voyageurs), mot de passe (enregistré sous forme chiffrée irréversible), rôle, date d'acceptation des CGU", "Vous, à l'inscription et dans votre profil"],
            ["Voyages publiés", "Villes, dates et heures, escale, kilos proposés, prix par kilo", "Le voyageur"],
            ["Réservations", "Nom, téléphone, description du colis, kilos, montant, code de suivi, étapes du colis", "Vous (avec ou sans compte), le voyageur pour les étapes"],
            ["Messagerie", "Contenu des messages, date d'envoi et de lecture", "Les participants à la conversation"],
            ["Notifications", "Notifications reçues ; si vous les activez : adresse technique de l'appareil, clés de chiffrement, type de navigateur, fuseau horaire", "Votre appareil"],
            ["Préférences de trajets (clients connectés)", "Trajets favoris, trajets recherchés, voyages consultés et déjà réservés ; choix d'alertes", "Vous, et votre utilisation du site"],
            ["Données techniques", "Adresse IP et journaux de connexion (sécurité), données stockées sur votre appareil", "Votre navigateur (voir la Politique de cookies)"],
            ["Mesure d'audience", "Pages consultées, informations sur l'appareil — uniquement si vous l'acceptez", "Votre navigateur"],
          ]}
        />
      ),
    },
    {
      id: "finalites",
      title: "Pourquoi nous les utilisons",
      content: (
        <Table
          head={["Finalité", "Base légale"]}
          rows={[
            ["Créer et gérer votre compte", "Exécution du contrat (CGU)"],
            ["Publier des voyages, réserver des kilos, mettre en relation clients et voyageurs", "Exécution du contrat"],
            ["Messagerie entre client et voyageur, suivi du colis", "Exécution du contrat"],
            ["Vous envoyer des notifications (site et appareil)", "Exécution du contrat ; notifications sur l'appareil : votre autorisation dans le navigateur"],
            ["Alertes de trajets (un voyageur part sur un trajet qui vous intéresse), rappels de départ et sélection de la semaine, à partir de vos trajets favoris, recherchés ou consultés", "Intérêt légitime ; vous pouvez les désactiver à tout moment dans votre profil (« Mes alertes »)"],
            ["Campagnes des périodes fortes (fêtes, Ramadan, Tabaski, rentrée)", "Intérêt légitime ; désactivables à tout moment dans votre profil"],
            ["Vérifier les comptes voyageurs avant publication", "Intérêt légitime : sécurité de la plateforme"],
            ["Modération, assistance et règlement des litiges (y compris lecture des conversations par l'équipe MoveColis)", "Intérêt légitime : sécurité des échanges et des envois"],
            ["Prévenir la fraude et sécuriser le service", "Intérêt légitime"],
            ["Répondre aux demandes des autorités", "Obligation légale"],
            ["Mesure d'audience et publicité", "Votre consentement (bandeau cookies), retirable à tout moment"],
          ]}
        />
      ),
    },
    {
      id: "destinataires",
      title: "Qui peut voir vos données",
      content: (
        <>
          <Ul>
            <li>
              <B>Le propriétaire du voyage</B> que vous réservez (voyageur ou MoveColis) voit votre nom, votre téléphone, la
              description du colis, les kilos réservés et vos messages, pour organiser l'envoi.
            </li>
            <li>
              <B>Le client</B> voit le prénom et l'initiale du nom du voyageur, les informations du voyage et les messages échangés.
              Le téléphone du voyageur ne lui est pas communiqué par la plateforme.
            </li>
            <li>
              <B>Le public</B> voit les voyages publiés, avec le prénom et l'initiale du nom du voyageur.
            </li>
            <li>
              <B>L'équipe MoveColis</B> (administrateurs) peut accéder aux comptes, réservations et conversations pour la
              modération, l'assistance et la résolution des litiges.
            </li>
            <li>
              <B>Nos prestataires techniques</B>, dans la limite de leur mission : hébergeurs (voir les{" "}
              <A to="/mentions-legales">mentions légales</A>), service d'envoi d'e-mails (mot de passe oublié, alertes
              de sécurité), services de notification des navigateurs (Google, Apple, Mozilla,
              Microsoft) qui acheminent les notifications chiffrées, et, si vous l'acceptez, les outils de mesure d'audience et de
              publicité listés dans la <A to="/cookies">Politique de cookies</A>.
            </li>
            <li>
              <B>Les autorités</B>, uniquement sur demande légale.
            </li>
          </Ul>
          <P>Nous ne vendons jamais vos données.</P>
        </>
      ),
    },
    {
      id: "transferts",
      title: "Transferts hors de Côte d'Ivoire",
      content: (
        <P>
          Par nature, MoveColis organise des envois entre plusieurs pays : vos données sont communiquées au voyageur ou au client
          concerné, qui peut se trouver hors de Côte d'Ivoire, pour exécuter la réservation. Nos serveurs sont situés en{" "}
          <Fill value={L.hosting[1]?.dataLocation} label="pays des serveurs" /> et certains prestataires (notifications, mesure
          d'audience) peuvent traiter des données hors d'Afrique. Ces transferts sont encadrés par les garanties et autorisations
          prévues par la réglementation applicable.
        </P>
      ),
    },
    {
      id: "conservation",
      title: "Combien de temps nous les conservons",
      content: (
        <Table
          head={["Données", "Durée de conservation"]}
          rows={[
            ["Compte", L.retention.account],
            ["Réservations et étapes du colis", L.retention.reservations],
            ["Conversations", L.retention.messages],
            ["Notifications", L.retention.notifications],
            ["Préférences de trajets", L.retention.interests],
            ["Abonnement aux notifications de l'appareil", "Jusqu'à la désactivation, la déconnexion ou l'expiration de l'abonnement"],
            ["Journaux techniques", L.retention.technicalLogs],
            ["Cookies et stockage sur l'appareil", "Voir la Politique de cookies"],
          ]}
        />
      ),
    },
    {
      id: "securite",
      title: "Sécurité",
      content: (
        <P>
          Les échanges avec le site sont chiffrés (HTTPS). Les mots de passe sont enregistrés sous forme chiffrée irréversible
          (bcrypt) et ne sont jamais lisibles, y compris par notre équipe. L'accès des visiteurs à leurs conversations repose sur
          un jeton secret dont seule une empreinte est conservée. Chaque personne n'accède qu'aux données nécessaires à son rôle,
          et le contenu des notifications sur l'appareil est chiffré de bout en bout jusqu'à votre navigateur.
        </P>
      ),
    },
    {
      id: "droits",
      title: "Vos droits",
      content: (
        <>
          <P>
            Vous pouvez à tout moment demander l'<B>accès</B> à vos données, leur <B>rectification</B> ou leur{" "}
            <B>suppression</B>, et vous <B>opposer</B> à leur traitement pour un motif légitime. Si vous résidez dans l'Union
            européenne, vous disposez aussi des droits à la limitation et à la portabilité. Vous pouvez retirer votre
            consentement (cookies, notifications) à tout moment, sans effet sur ce qui a été fait auparavant.
          </P>
          <P>
            Vos informations de compte se modifient directement dans votre <A to="/profil">profil</A>, où vous pouvez aussi
            désactiver les alertes de trajets et les campagnes (<A to="/profil#alertes">Mes alertes</A>). Pour les autres demandes,
            écrivez à <B>{contact}</B> : nous pouvons vous demander de justifier de votre identité et répondons dans un délai
            d'un mois au plus.
          </P>
          <P>
            En cas de désaccord, vous pouvez saisir l'ARTCI (www.artci.ci) ou, si vous résidez dans l'Union européenne, l'autorité
            de protection de votre pays (en France, la CNIL).
          </P>
        </>
      ),
    },
    {
      id: "sans-compte",
      title: "Réservation sans compte",
      content: (
        <P>
          Si vous réservez sans créer de compte, nous conservons les informations de la réservation et de la conversation dans
          les mêmes conditions. Le jeton qui vous donne accès à votre conversation est gardé uniquement sur l'appareil utilisé
          pour réserver : si vous effacez les données de votre navigateur, contactez-nous avec votre code de suivi.
        </P>
      ),
    },
    {
      id: "mineurs",
      title: "Mineurs",
      content: <P>MoveColis est réservé aux personnes âgées d'au moins {L.minimumAge} ans.</P>,
    },
    {
      id: "modifications",
      title: "Modifications de cette politique",
      content: (
        <P>
          Nous pouvons faire évoluer cette politique. En cas de changement important, nous vous en informerons sur le site ou
          par notification. La date de dernière mise à jour figure en haut de cette page.
        </P>
      ),
    },
  ];

  return (
    <LegalPage
      title="Politique de confidentialité"
      intro={
        <P>
          Cette politique explique quelles données MoveColis utilise, pourquoi, avec qui elles sont partagées et comment exercer
          vos droits. Elle s'applique au site, à l'application installée et à la messagerie.
        </P>
      }
      sections={sections}
    />
  );
}
