import LegalPage, { A, B, Fill, P } from "../../components/legal/LegalPage";
import { LEGAL } from "../../config/legal";

export default function MentionsLegales() {
  const L = LEGAL;
  const sections = [
    {
      id: "editeur",
      title: "Éditeur du site",
      content: (
        <>
          <P>
            Le site et l'application <B>MoveColis</B> sont édités par <B><Fill value={L.companyName} label="raison sociale" /></B>,{" "}
            <Fill value={L.legalForm} label="forme juridique" /> au capital de <Fill value={L.capital} label="capital social" />.
          </P>
          <P>
            Immatriculée au Registre du Commerce et du Crédit Mobilier (RCCM) sous le numéro <Fill value={L.rccm} label="n° RCCM" /> ·
            numéro de compte contribuable : <Fill value={L.taxId} label="NCC" />.
            <br />
            Siège social : <Fill value={L.address} label="adresse du siège" />.
            <br />
            E-mail : <Fill value={L.email} label="e-mail de contact" /> · téléphone : <Fill value={L.phone} label="téléphone" />.
          </P>
        </>
      ),
    },
    {
      id: "directeur",
      title: "Directeur de la publication",
      content: <P><Fill value={L.publicationDirector} label="nom et fonction du directeur de la publication" />.</P>,
    },
    {
      id: "hebergement",
      title: "Hébergement",
      content: L.hosting.map((h) => (
        <P key={h.role}>
          <B>{h.role}</B> : <Fill value={h.name} label="nom de l'hébergeur" />, <Fill value={h.address} label="adresse de l'hébergeur" />
          {h.website && <> · {h.website}</>}
          {"dataLocation" in h && <> · données hébergées : <Fill value={h.dataLocation} label="pays des serveurs" /></>}.
        </P>
      )),
    },
    {
      id: "donnees",
      title: "Données personnelles",
      content: (
        <P>
          Les traitements de données personnelles réalisés par MoveColis sont soumis à la loi ivoirienne n° 2013-450 du 19 juin
          2013 relative à la protection des données à caractère personnel, sous le contrôle de l'ARTCI (Autorité de protection).
          Référence de la formalité auprès de l'ARTCI : <Fill value={L.artciReference} label="n° de récépissé ou d'autorisation ARTCI" />.
          Pour tout savoir sur vos données et vos droits, consultez notre <A to="/confidentialite">Politique de confidentialité</A> et
          notre <A to="/cookies">Politique de cookies</A>.
        </P>
      ),
    },
    {
      id: "propriete",
      title: "Propriété intellectuelle",
      content: (
        <>
          <P>
            La marque, le logo et l'identité visuelle MoveColis, ainsi que l'ensemble des éléments du site (textes, graphismes,
            logiciels, base de données) sont protégés par le droit de la propriété intellectuelle. Toute reproduction ou
            utilisation sans autorisation écrite préalable est interdite.
          </P>
          <P>
            Les contenus publiés par les utilisateurs (voyages, messages, descriptions de colis) restent sous leur responsabilité.
          </P>
        </>
      ),
    },
    {
      id: "responsabilite",
      title: "Responsabilité",
      content: (
        <P>
          MoveColis met en relation des voyageurs et des expéditeurs de colis : son rôle et ses limites de responsabilité sont
          détaillés dans les <A to="/cgu">Conditions Générales d'Utilisation</A>. Les informations du site sont fournies à titre
          indicatif et peuvent être modifiées à tout moment.
        </P>
      ),
    },
    {
      id: "droit",
      title: "Droit applicable",
      content: (
        <P>
          Les présentes mentions sont régies par le droit ivoirien. Tout litige relève de la compétence de {L.court}, sous réserve
          des règles impératives protégeant les consommateurs dans leur pays de résidence.
        </P>
      ),
    },
  ];

  return <LegalPage title="Mentions légales" sections={sections} />;
}
