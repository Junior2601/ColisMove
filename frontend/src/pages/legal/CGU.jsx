import LegalPage, { A, B, Fill, P, Ul } from "../../components/legal/LegalPage";
import { LEGAL } from "../../config/legal";

export default function CGU() {
  const L = LEGAL;

  const sections = [
    {
      id: "objet",
      title: "Objet",
      content: (
        <>
          <P>
            MoveColis est une plateforme qui met en relation des <B>voyageurs</B> disposant de kilos de bagages disponibles sur
            leurs vols et des personnes souhaitant <B>faire transporter un colis</B>. Les présentes Conditions Générales
            d'Utilisation (CGU) fixent les règles d'utilisation du site, de l'application et de la messagerie.
          </P>
          <P>
            Sauf pour les voyages qu'elle publie elle-même (article 6), <B>MoveColis n'est pas transporteur</B> : le transport
            est réalisé par le voyageur, sous sa responsabilité, selon l'accord conclu avec le client.
          </P>
        </>
      ),
    },
    {
      id: "definitions",
      title: "Définitions",
      content: (
        <Ul>
          <li><B>Plateforme</B> : le site MoveColis, l'application installée et la messagerie.</li>
          <li><B>Utilisateur</B> : toute personne qui utilise la Plateforme, avec ou sans compte.</li>
          <li><B>Visiteur</B> : Utilisateur sans compte, qui peut consulter les voyages et réserver.</li>
          <li><B>Client</B> : Utilisateur qui réserve des kilos pour faire transporter un colis.</li>
          <li><B>Voyageur</B> : Utilisateur dont le compte a été approuvé par MoveColis et qui publie des voyages.</li>
          <li><B>Voyage</B> : trajet aérien publié avec ses dates, son prix par kilo et ses kilos disponibles.</li>
          <li><B>Réservation</B> : demande de kilos faite par un Client sur un Voyage, identifiée par un code de suivi.</li>
          <li><B>Conversation</B> : messagerie propre à chaque Réservation, entre le Client et le propriétaire du Voyage.</li>
        </Ul>
      ),
    },
    {
      id: "acceptation",
      title: "Acceptation et modification des CGU",
      content: (
        <P>
          L'inscription suppose l'acceptation expresse des CGU et de la <A to="/confidentialite">Politique de confidentialité</A>{" "}
          (case à cocher). Réserver sans compte vaut également acceptation. MoveColis peut modifier les CGU ; la version en
          vigueur est celle publiée sur cette page, et les changements importants sont signalés aux Utilisateurs.
        </P>
      ),
    },
    {
      id: "compte",
      title: "Accès et compte",
      content: (
        <>
          <P>
            La Plateforme est réservée aux personnes âgées d'au moins {L.minimumAge} ans. L'Utilisateur fournit des informations
            exactes et à jour, garde son mot de passe confidentiel et reste responsable de l'utilisation de son compte. Un seul
            compte par personne.
          </P>
          <P>
            En cas de réservation sans compte, l'accès à la Conversation est conservé sur l'appareil utilisé pour réserver ; le
            Visiteur est invité à noter son code de suivi.
          </P>
        </>
      ),
    },
    {
      id: "voyageurs",
      title: "Comptes voyageurs",
      content: (
        <>
          <P>
            Tout compte voyageur est soumis à l'approbation préalable de MoveColis, qui peut demander des informations
            complémentaires et refuser une demande. L'approbation atteste une vérification par MoveColis au moment de
            l'inscription ; elle ne constitue pas une garantie sur chaque transport réalisé.
          </P>
          <P>MoveColis peut suspendre ou retirer à tout moment l'accès d'un voyageur qui ne respecte pas les CGU.</P>
        </>
      ),
    },
    {
      id: "voyages",
      title: "Publication des voyages",
      content: (
        <>
          <P>Le Voyageur s'engage à ne publier que des voyages réels, et garantit notamment que :</P>
          <Ul>
            <li>les villes, dates et heures (heures locales indiquées sur son billet) sont exactes ;</li>
            <li>les kilos proposés respectent la franchise bagages de sa compagnie aérienne ;</li>
            <li>il informera les Clients sans délai de tout changement, via la Conversation.</li>
          </Ul>
          <P>
            Le Voyageur peut modifier son voyage tant qu'il n'est pas parti, ou l'annuler : les Clients concernés sont alors
            prévenus automatiquement et leurs réservations annulées. Lorsqu'un voyage est publié par MoveColis, MoveColis agit
            elle-même en qualité de Voyageur pour ce voyage.
          </P>
        </>
      ),
    },
    {
      id: "reservation",
      title: "Réservation",
      content: (
        <>
          <P>La réservation se déroule ainsi :</P>
          <Ul>
            <li>le Client indique son nom, son téléphone, la description de son colis et le nombre de kilos ;</li>
            <li>les kilos sont bloqués sur le Voyage et une Conversation s'ouvre avec le propriétaire du Voyage ;</li>
            <li>la réservation reste « à confirmer » jusqu'à sa <B>confirmation par le Voyageur</B> dans la Conversation ;</li>
            <li>chaque étape (colis remis, en vol, arrivé, livré) est ensuite indiquée et consultable avec le code de suivi.</li>
          </Ul>
          <P>
            Le prix par kilo est celui affiché au moment de la réservation. Le montant affiché est une estimation fondée sur les
            kilos réservés : le poids réel est vérifié à la remise du colis et le montant définitif est convenu entre le Client
            et le Voyageur.
          </P>
        </>
      ),
    },
    {
      id: "paiement",
      title: "Prix et paiement",
      content: (
        <P>
          À ce jour, la Plateforme n'encaisse aucun paiement : le prix est réglé directement entre le Client et le Voyageur,
          selon les modalités convenues dans la Conversation. MoveColis n'est pas partie à ce paiement, sauf pour les voyages
          qu'elle publie elle-même. L'utilisation de la Plateforme est actuellement gratuite pour les Clients et les Voyageurs.
        </P>
      ),
    },
    {
      id: "annulation",
      title: "Annulation",
      content: (
        <Ul>
          <li>Le Client peut annuler lui-même sa réservation tant qu'elle n'est pas confirmée.</li>
          <li>Une fois la réservation confirmée, son annulation se décide avec le Voyageur dans la Conversation.</li>
          <li>
            Le Voyageur peut annuler une réservation tant que le colis n'est pas parti, ou annuler son voyage ; les kilos sont
            alors libérés et le Client est prévenu.
          </li>
          <li>Les éventuels remboursements sont réglés directement entre le Client et le Voyageur.</li>
        </Ul>
      ),
    },
    {
      id: "colis",
      title: "Colis : contenu interdit et douane",
      content: (
        <>
          <P>
            Le Client décrit le contenu de son colis de façon exacte et complète, l'emballe correctement et respecte les lois
            des pays de départ, d'escale et d'arrivée ainsi que les règles des compagnies aériennes. Sont notamment{" "}
            <B>strictement interdits</B> :
          </P>
          <Ul>
            <li>stupéfiants et substances illicites ;</li>
            <li>armes, munitions, explosifs et pièces d'armes ;</li>
            <li>matières dangereuses : produits inflammables, gaz, produits corrosifs ou toxiques, batteries non conformes ;</li>
            <li>espèces, métaux précieux, bijoux et objets de valeur, sauf accord écrit et préalable du Voyageur ;</li>
            <li>contrefaçons, objets volés, documents d'identité ou cartes bancaires d'autrui ;</li>
            <li>animaux vivants, denrées périssables et médicaments soumis à prescription ou à restriction ;</li>
            <li>tout objet dont l'exportation, le transit ou l'importation est interdit ou réglementé.</li>
          </Ul>
          <P>
            Le Voyageur peut <B>vérifier le contenu du colis en présence du Client</B> avant de l'accepter, et refuser tout colis
            douteux, mal emballé ou non conforme à sa description. Le Client reste responsable des déclarations en douane et du
            paiement des droits et taxes éventuels. Toute infraction engage la responsabilité personnelle de son auteur.
          </P>
        </>
      ),
    },
    {
      id: "obligations-voyageur",
      title: "Obligations du Voyageur",
      content: (
        <Ul>
          <li>transporter le colis avec soin et le remettre au destinataire convenu ;</li>
          <li>mettre à jour les étapes du colis sur la Plateforme ;</li>
          <li>ne transporter que des colis qu'il a acceptés en connaissance de cause ;</li>
          <li>respecter la réglementation douanière et les règles de sa compagnie aérienne.</li>
        </Ul>
      ),
    },
    {
      id: "messagerie",
      title: "Messagerie",
      content: (
        <P>
          La messagerie sert uniquement à organiser les réservations. Les messages doivent rester courtois et licites :
          harcèlement, contenus illicites, frauduleux ou injurieux, et tentatives d'arnaque sont interdits. Pour la modération,
          l'assistance et le règlement des litiges, <B>l'équipe MoveColis peut consulter les Conversations</B>. Des messages
          automatiques y indiquent les étapes de la réservation.
        </P>
      ),
    },
    {
      id: "responsabilite",
      title: "Responsabilité de MoveColis",
      content: (
        <>
          <P>
            En tant qu'intermédiaire, MoveColis fournit l'outil de mise en relation et met en œuvre les moyens raisonnables pour
            le faire fonctionner. Dans les limites permises par la loi, MoveColis n'est pas responsable :
          </P>
          <Ul>
            <li>de la perte, du vol, de la détérioration, du retard ou de la saisie en douane d'un colis transporté par un Voyageur ;</li>
            <li>de l'exactitude des informations publiées par les Utilisateurs ;</li>
            <li>des accords et des paiements conclus entre Clients et Voyageurs ;</li>
            <li>d'une indisponibilité temporaire de la Plateforme (maintenance, panne, cas de force majeure).</li>
          </Ul>
          <P>Pour les voyages qu'elle publie elle-même, MoveColis répond de ses obligations de Voyageur selon la loi applicable.</P>
        </>
      ),
    },
    {
      id: "litiges-utilisateurs",
      title: "Litiges entre Utilisateurs",
      content: (
        <P>
          Les Utilisateurs s'efforcent de régler leurs différends à l'amiable, dans la Conversation. MoveColis peut, sans y être
          tenue, les aider à trouver une solution, notamment en consultant l'historique de la réservation et de la Conversation.
        </P>
      ),
    },
    {
      id: "suspension",
      title: "Suspension et suppression de compte",
      content: (
        <P>
          En cas de manquement aux CGU, de fraude ou de comportement dangereux, MoveColis peut avertir, suspendre ou supprimer un
          compte, et retirer un voyage ou une réservation. L'Utilisateur peut demander la suppression de son compte à tout
          moment en écrivant à <Fill value={L.privacyEmail || L.email} label="e-mail de contact" />.
        </P>
      ),
    },
    {
      id: "propriete",
      title: "Propriété intellectuelle",
      content: (
        <P>
          La marque, le logo et les éléments de la Plateforme appartiennent à MoveColis. L'Utilisateur conserve ses droits sur
          les contenus qu'il publie et autorise MoveColis à les afficher sur la Plateforme pour le fonctionnement du service.
        </P>
      ),
    },
    {
      id: "donnees",
      title: "Données personnelles",
      content: (
        <P>
          Le traitement des données personnelles est décrit dans la <A to="/confidentialite">Politique de confidentialité</A> et
          la <A to="/cookies">Politique de cookies</A>.
        </P>
      ),
    },
    {
      id: "droit",
      title: "Droit applicable et litiges",
      content: (
        <P>
          Les CGU sont régies par le droit ivoirien. En cas de litige avec MoveColis, une solution amiable est recherchée en
          priorité (contact : <Fill value={L.email} label="e-mail de contact" />). À défaut, le litige relève de {L.court}, sous
          réserve des règles impératives protégeant les consommateurs dans leur pays de résidence.
        </P>
      ),
    },
  ];

  return (
    <LegalPage
      title="Conditions Générales d'Utilisation"
      intro={
        <P>
          Bienvenue sur MoveColis. En utilisant la Plateforme, vous acceptez les règles ci-dessous : elles protègent les
          voyageurs comme les expéditeurs de colis.
        </P>
      }
      sections={sections}
    />
  );
}
