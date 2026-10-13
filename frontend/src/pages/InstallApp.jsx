import { Link } from "react-router-dom";
import { CircleCheck, Download, Monitor, Smartphone } from "lucide-react";
import Layout from "../components/Layout";
import AppSettings from "../components/AppSettings";
import { BENEFITS, InstallSteps } from "../components/InstallAppPrompt";
import { btnPrimary } from "../components/ui";
import { layoutVariantFor, useAuth } from "../context/AuthContext";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

const FAQ = [
  {
    q: "Est-ce une vraie application ?",
    a: "Oui : MoveColis s'installe directement depuis le navigateur, s'ouvre en plein écran depuis son icône et reçoit les notifications, sans passer par le Play Store ni l'App Store.",
  },
  {
    q: "Pourquoi l'installer ?",
    a: "Pour être prévenu immédiatement des nouveaux messages et de chaque étape de votre colis, même quand l'appli est fermée. Sur iPhone, les notifications ne fonctionnent qu'une fois l'appli installée.",
  },
  {
    q: "Quels téléphones sont compatibles ?",
    a: "Android avec Chrome, Edge ou Samsung Internet, et iPhone / iPad avec iOS 16.4 ou plus récent.",
  },
  {
    q: "Comment la désinstaller ?",
    a: "Comme n'importe quelle application : appui long sur l'icône MoveColis, puis « Supprimer » ou « Désinstaller ».",
  },
];

/** Guide d'installation : page à partager à vos utilisateurs (ex. https://movecolis.com/application) */
export default function InstallApp() {
  const { user } = useAuth();
  const { installed, canInstall, install } = useInstallPrompt();

  return (
    <Layout variant={layoutVariantFor(user)}>
      <div className="max-w-2xl mx-auto pb-10">
        {/* ===== En-tête ===== */}
        <div className="flex items-center gap-4 mt-6 mb-4">
          <img src="/icons/icon-192.png" alt="" className="w-16 h-16 rounded-2xl shadow-card" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">L'application MoveColis</h1>
            <p className="text-muted text-sm">Installez-la en quelques secondes, gratuitement.</p>
          </div>
        </div>

        {installed ? (
          <div className="flex items-center gap-2 rounded-xl bg-[#E8F5E9] text-success font-semibold px-4 py-3.5 text-sm mb-4">
            <CircleCheck size={18} /> Vous utilisez l'application installée. Pensez à activer les notifications.
          </div>
        ) : (
          canInstall && (
            <button type="button" onClick={install} className={`${btnPrimary} w-full mb-4`}>
              <Download size={18} /> Installer l'application
            </button>
          )
        )}

        {/* ===== Avantages ===== */}
        <ul className="border border-line-light rounded-2xl bg-white p-4 space-y-2.5 mb-5">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2.5 text-sm">
              <Icon size={18} className="text-primary shrink-0 mt-0.5" /> {text}
            </li>
          ))}
        </ul>

        {/* ===== Sur cet appareil : installation + notifications ===== */}
        <h2 className="text-[17px] font-extrabold mb-3">Sur cet appareil</h2>
        <AppSettings />

        {/* ===== Guides par plateforme ===== */}
        <h2 className="text-[17px] font-extrabold mb-3">Comment installer</h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          <div className="border border-line-light rounded-2xl bg-white p-4">
            <div className="flex items-center gap-2 font-bold text-sm mb-2.5">
              <Smartphone size={17} className="text-primary" /> iPhone et iPad (Safari)
            </div>
            <InstallSteps ios />
          </div>
          <div className="border border-line-light rounded-2xl bg-white p-4">
            <div className="flex items-center gap-2 font-bold text-sm mb-2.5">
              <Smartphone size={17} className="text-primary" /> Android (Chrome)
            </div>
            <InstallSteps android />
          </div>
          <div className="border border-line-light rounded-2xl bg-white p-4 sm:col-span-2">
            <div className="flex items-center gap-2 font-bold text-sm mb-1.5">
              <Monitor size={17} className="text-primary" /> Ordinateur (Chrome, Edge)
            </div>
            <p className="text-[13px]">
              Cliquez sur l'icône d'installation à droite de la barre d'adresse, ou menu <b>⋮</b> puis{" "}
              <b>« Installer MoveColis »</b>.
            </p>
          </div>
        </div>

        {/* ===== Questions fréquentes ===== */}
        <h2 className="text-[17px] font-extrabold mb-3">Questions fréquentes</h2>
        <div className="border border-line-light rounded-2xl bg-white overflow-hidden">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group px-4 py-3.5 border-b border-line-light last:border-0">
              <summary className="font-bold text-sm cursor-pointer list-none flex justify-between gap-3">
                {q} <span className="text-muted group-open:rotate-45 transition">+</span>
              </summary>
              <p className="text-[13px] text-muted mt-2">{a}</p>
            </details>
          ))}
        </div>

        {!user && (
          <p className="text-sm text-center mt-6">
            Les notifications concernent votre compte :{" "}
            <Link to="/inscription" className="font-bold underline">créez un compte</Link> ou{" "}
            <Link to="/connexion" className="font-bold underline">connectez-vous</Link>.
          </p>
        )}
      </div>
    </Layout>
  );
}
