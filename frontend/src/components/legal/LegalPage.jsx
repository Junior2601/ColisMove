import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import Layout from "../Layout";
import { layoutVariantFor, useAuth } from "../../context/AuthContext";
import { LEGAL_UPDATED_AT, LEGAL_VERSION } from "../../config/legal";

/**
 * Valeur issue de config/legal.js. Vide → pastille jaune « À compléter » :
 * impossible d'oublier une information avant la mise en ligne.
 */
export function Fill({ value, label }) {
  if (value) return <>{value}</>;
  return (
    <mark className="bg-[#FFF3C4] text-[#7A5B00] rounded px-1 font-semibold not-italic">[À compléter : {label}]</mark>
  );
}

// Briques de mise en forme des textes
export const P = ({ children }) => <p className="mb-3">{children}</p>;
export const Ul = ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>;
export const B = ({ children }) => <b className="text-ink">{children}</b>;
export const A = ({ to, children }) => (
  <Link to={to} className="font-semibold underline text-ink">{children}</Link>
);

export function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto mb-3 border border-line-light rounded-xl">
      <table className="w-full text-[13px] text-left">
        <thead className="bg-surface">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-bold whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-line-light align-top">
              {row.map((cell, j) => <td key={j} className="px-3 py-2">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Mise en page commune des pages légales.
 * sections = [{ id, title, content }] → sommaire cliquable + ancres (#id) partageables.
 */
export default function LegalPage({ title, intro, sections }) {
  const { user } = useAuth();
  const location = useLocation();

  // Lien direct vers une section (ex. /confidentialite#droits)
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    else window.scrollTo({ top: 0 });
  }, [location.pathname, location.hash]);

  return (
    <Layout variant={layoutVariantFor(user)}>
      <article className="max-w-3xl mx-auto pb-12 text-[14.5px] leading-relaxed text-ink/90">
        <h1 className="text-2xl lg:text-[28px] font-extrabold tracking-tight mt-6 mb-1 text-ink">{title}</h1>
        <p className="text-xs text-muted mb-4">
          Dernière mise à jour : {LEGAL_UPDATED_AT} · version {LEGAL_VERSION}
        </p>
        {intro && <div className="mb-5">{intro}</div>}

        <nav aria-label="Sommaire" className="border border-line-light rounded-2xl bg-surface px-4 py-3.5 mb-7">
          <div className="font-bold text-sm mb-2 text-ink">Sommaire</div>
          <ol className="list-decimal pl-5 space-y-1 text-[13.5px]">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:underline">{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24 mb-7">
            <h2 className="text-[17px] font-extrabold mb-2.5 text-ink">
              {i + 1}. {s.title}
            </h2>
            {s.content}
          </section>
        ))}

        <p className="text-[13px] text-muted border-t border-line-light pt-4">
          Voir aussi : <A to="/mentions-legales">Mentions légales</A> · <A to="/cgu">Conditions Générales d'Utilisation</A> ·{" "}
          <A to="/confidentialite">Politique de confidentialité</A> · <A to="/cookies">Politique de cookies</A>
        </p>
      </article>
    </Layout>
  );
}
