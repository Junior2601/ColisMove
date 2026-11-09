import nodemailer from "nodemailer";
import { env, isDev } from "../config/env.js";

/**
 * Envoi d'e-mails transactionnels (mot de passe oublié, alertes de sécurité, billets d'avion).
 * Sans SMTP_HOST : en développement, l'e-mail (et son lien) s'affiche dans la console du serveur.
 */
const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
      // Serveur injoignable : erreur en 15 s plutôt que 2 min d'attente (60 s pour envoyer un billet lourd)
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
    })
  : null;

if (!transporter) {
  console.warn("✉️  SMTP non configuré : les e-mails ne sont pas envoyés" + (isDev ? " (affichés dans la console)." : " !"));
}

export const isMailConfigured = () => transporter !== null;

/**
 * Explication en français d'une erreur SMTP, pour l'admin (jamais le mot de passe : nodemailer ne l'inclut pas).
 * Codes nodemailer : EAUTH, ECONNECTION, ETIMEDOUT, ESOCKET, EDNS, EENVELOPE… + code de réponse du serveur (535, 550…)
 */
export function describeMailError(err) {
  const reply = err?.response ? ` (réponse du serveur : ${String(err.response).slice(0, 160)})` : "";
  const code = err?.responseCode;
  if (err?.code === "EAUTH" || code === 535 || code === 534) {
    return `Identifiant ou mot de passe SMTP refusé : vérifiez SMTP_USER et SMTP_PASS${reply}.`;
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED"].includes(err?.code)) {
    return `Serveur d'e-mails injoignable (${env.smtp.host}:${env.smtp.port}) : vérifiez SMTP_HOST, SMTP_PORT et SMTP_SECURE (true seulement pour le port 465).`;
  }
  if (err?.code === "ETLS") return "Connexion chiffrée impossible : SMTP_SECURE=true pour le port 465, false pour le port 587.";
  if (code === 552 || /size|too large|trop volumineux/i.test(err?.response ?? "")) {
    return `Message trop volumineux pour le fournisseur d'e-mails : envoyez des fichiers plus légers${reply}.`;
  }
  if (err?.command === "MAIL FROM") {
    return `Adresse d'expéditeur refusée : MAIL_FROM doit être une adresse ou un domaine validé chez le fournisseur d'e-mails${reply}.`;
  }
  if (err?.command === "RCPT TO" || err?.code === "EENVELOPE") return `Adresse du destinataire refusée${reply}.`;
  return `Envoi refusé par le serveur d'e-mails${reply || ` (${err?.message ?? "erreur inconnue"})`}.`;
}

/* ---------- État du SMTP, pour l'admin ---------- */

let lastCheck = null; // { ok, error, at } : dernier test de connexion au serveur d'e-mails

/** Teste la connexion et l'identifiant SMTP, sans envoyer d'e-mail. Au démarrage et depuis l'admin. */
export async function verifyMailConnection() {
  if (!transporter) return null;
  try {
    await transporter.verify();
    lastCheck = { ok: true, error: null, at: new Date().toISOString() };
    console.log(`✉️  SMTP prêt : ${env.smtp.host}:${env.smtp.port}, expéditeur ${env.mailFrom}`);
  } catch (err) {
    lastCheck = { ok: false, error: describeMailError(err), at: new Date().toISOString() };
    console.error(`✉️  SMTP en erreur : ${lastCheck.error}`);
  }
  return lastCheck;
}

/** Configuration visible par l'admin (sans identifiant ni mot de passe) */
export function mailStatus() {
  return {
    configured: transporter !== null,
    host: env.smtp.host,
    port: env.smtp.host ? env.smtp.port : null,
    from: env.mailFrom,
    replyTo: env.mailReplyTo,
    lastCheck,
  };
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Mise en page commune (tableaux + styles en ligne : compatible avec tous les logiciels de messagerie) */
function layout({ preheader, title, paragraphs, button, footer }) {
  const buttonHtml = button
    ? `<tr><td style="padding:8px 0 20px">
         <a href="${button.url}" style="display:inline-block;background:#F26122;color:#ffffff;text-decoration:none;
            font-weight:700;font-size:15px;padding:13px 26px;border-radius:10px">${escapeHtml(button.label)}</a>
       </td></tr>`
    : "";
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#F5F6F8;font-family:Arial,Helvetica,sans-serif;color:#0B1F3A">
  <span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6F8;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px">
        <tr><td style="padding-bottom:18px">
          <img src="${env.appUrl}/icons/icon-192.png" width="44" height="44" alt="MoveColis" style="border-radius:10px;vertical-align:middle">
          <span style="font-size:20px;font-weight:800;vertical-align:middle;margin-left:8px">move<span style="color:#F26122">colis</span></span>
        </td></tr>
        <tr><td style="font-size:20px;font-weight:800;padding-bottom:12px">${escapeHtml(title)}</td></tr>
        ${paragraphs.map((p) => `<tr><td style="font-size:15px;line-height:1.55;padding-bottom:12px">${p}</td></tr>`).join("")}
        ${buttonHtml}
        <tr><td style="font-size:12.5px;line-height:1.5;color:#5B6B82;border-top:1px solid #E8EAEE;padding-top:14px">${footer}</td></tr>
      </table>
      <div style="font-size:12px;color:#5B6B82;padding-top:14px">MoveColis · Voyage &amp; expédition de colis</div>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Envoie un e-mail. Renvoie true s'il est parti, false si le SMTP n'est pas configuré.
 * attachments : [{ filename, content: Buffer, contentType }]
 */
export async function sendMail({ to, subject, text, html, attachments = [] }) {
  if (!transporter) {
    // Le lien de réinitialisation est un secret : affiché seulement en développement
    if (isDev) {
      const files = attachments.length ? `\nPièces jointes : ${attachments.map((a) => a.filename).join(", ")}` : "";
      console.log(`\n✉️  E-MAIL (non envoyé, SMTP absent)\nÀ : ${to}\nObjet : ${subject}${files}\n\n${text}\n`);
    } else {
      console.warn(`✉️  E-mail « ${subject} » non envoyé : SMTP non configuré.`);
    }
    return false;
  }
  await transporter.sendMail({ from: env.mailFrom, replyTo: env.mailReplyTo ?? undefined, to, subject, text, html, attachments });
  return true;
}

/**
 * E-mail de test envoyé depuis l'admin : vérifie la configuration de bout en bout (et la boîte de réception).
 * Renvoie true s'il est parti (false : SMTP absent, e-mail affiché dans la console en développement).
 */
export async function sendTestMail(to) {
  const date = new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" });
  try {
    const sent = await composeTestMail(to, date);
    if (sent) lastCheck = { ok: true, error: null, at: new Date().toISOString() };
    return sent;
  } catch (err) {
    lastCheck = { ok: false, error: describeMailError(err), at: new Date().toISOString() };
    throw err;
  }
}

function composeTestMail(to, date) {
  return sendMail({
    to,
    subject: "Test d'envoi MoveColis",
    text:
      `Bonjour,\n\nCet e-mail de test confirme que MoveColis peut envoyer des e-mails (${date}, heure d'Abidjan).\n` +
      `Expéditeur : ${env.mailFrom}\n` +
      (env.mailReplyTo ? `Les réponses des clients arrivent à : ${env.mailReplyTo}\n` : "") +
      `\nS'il est arrivé dans les indésirables, marquez-le comme « non indésirable ».\n\nL'équipe MoveColis`,
    html: layout({
      preheader: "Les e-mails de MoveColis fonctionnent.",
      title: "Les e-mails fonctionnent ✅",
      paragraphs: [
        `Cet e-mail de test confirme que MoveColis peut envoyer des e-mails : mot de passe oublié, billets d'avion et reçus.`,
        `Envoyé le <b>${escapeHtml(date)}</b> (heure d'Abidjan) par <b>${escapeHtml(env.mailFrom)}</b>.` +
          (env.mailReplyTo ? `<br>Les réponses des clients arrivent à <b>${escapeHtml(env.mailReplyTo)}</b>.` : ""),
      ],
      footer: "Il est arrivé dans les indésirables (spam) ? Marquez-le comme « non indésirable » et vérifiez l'authentification du domaine chez votre fournisseur d'e-mails.",
    }),
  });
}

/** Lien pour choisir un nouveau mot de passe */
export function sendPasswordReset({ email, firstName }, link, minutes) {
  const name = escapeHtml(firstName);
  return sendMail({
    to: email,
    subject: "Réinitialisez votre mot de passe MoveColis",
    text:
      `Bonjour ${firstName},\n\nVous avez demandé à réinitialiser votre mot de passe MoveColis.\n` +
      `Choisissez-en un nouveau avec ce lien (valable ${minutes} minutes, une seule fois) :\n${link}\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe ne change pas.\n\nL'équipe MoveColis`,
    html: layout({
      preheader: `Votre lien est valable ${minutes} minutes.`,
      title: "Nouveau mot de passe",
      paragraphs: [
        `Bonjour ${name},`,
        "Vous avez demandé à réinitialiser votre mot de passe MoveColis. Cliquez sur le bouton pour en choisir un nouveau.",
      ],
      button: { label: "Choisir un nouveau mot de passe", url: link },
      footer:
        `Ce lien est valable <b>${minutes} minutes</b> et ne fonctionne qu'une fois.<br>` +
        "Vous n'êtes pas à l'origine de cette demande ? Ignorez cet e-mail : votre mot de passe ne change pas.",
    }),
  });
}

/** Alerte de sécurité après chaque changement de mot de passe */
export function sendPasswordChanged({ email, firstName }) {
  const name = escapeHtml(firstName);
  const date = new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" });
  return sendMail({
    to: email,
    subject: "Votre mot de passe MoveColis a été modifié",
    text:
      `Bonjour ${firstName},\n\nLe mot de passe de votre compte MoveColis a été modifié le ${date} (heure d'Abidjan).\n` +
      `Toutes vos sessions ont été déconnectées.\n\n` +
      `Si ce n'est pas vous, réinitialisez-le immédiatement : ${env.appUrl}/mot-de-passe-oublie\n\nL'équipe MoveColis`,
    html: layout({
      preheader: "Toutes vos sessions ont été déconnectées.",
      title: "Mot de passe modifié",
      paragraphs: [
        `Bonjour ${name},`,
        `Le mot de passe de votre compte MoveColis a été modifié le <b>${escapeHtml(date)}</b> (heure d'Abidjan). Par sécurité, toutes vos sessions ont été déconnectées.`,
      ],
      button: { label: "Ce n'est pas moi : réinitialiser", url: `${env.appUrl}/mot-de-passe-oublie` },
      footer: "Si c'est bien vous, vous n'avez rien à faire.",
    }),
  });
}

/**
 * Billet d'avion émis : reçu détaillé (vol, passagers, bagages, prix payé) + billet en pièce jointe.
 *  details    : [[libellé, valeur], …]  (référence, vol, compagnie, passagers, bagages)
 *  priceLines : [[libellé, montant formaté], …]  puis total : montant formaté
 */
export function sendFlightTicket({ to, clientName, route, details, priceLines, total, note, attachments, url }) {
  const files = attachments.length;
  const attached = files ? ` Vous le trouverez en pièce jointe${files > 1 ? "s" : ""}.` : "";
  const row = (label, value, strong = false) =>
    `<tr><td style="padding:7px 0;color:#5B6B82;font-size:14px;vertical-align:top">${escapeHtml(label)}</td>` +
    `<td style="padding:7px 0 7px 12px;font-size:${strong ? "16px;font-weight:800" : "14px;font-weight:600"};text-align:right">${escapeHtml(value)}</td></tr>`;
  const table = (rows) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E8EAEE">${rows}</table>`;

  const receiptHtml =
    table(details.map(([label, value]) => row(label, value)).join("")) +
    `<div style="font-size:15px;font-weight:800;padding:16px 0 4px">Reçu</div>` +
    table(priceLines.map(([label, value]) => row(label, value)).join("") + row("Total payé", total, true));

  const text = [
    `Bonjour ${clientName},`,
    "",
    `Votre billet ${route} est émis.${attached}`,
    ...(note ? [`Information de l'équipe MoveColis : ${note}`] : []),
    "",
    ...details.map(([label, value]) => `${label} : ${value}`),
    "",
    "Reçu",
    ...priceLines.map(([label, value]) => `${label} : ${value}`),
    `Total payé : ${total}`,
    "",
    `Votre conversation avec l'équipe MoveColis : ${url}`,
    "",
    "Bon voyage !",
    "L'équipe MoveColis",
  ].join("\n");

  return sendMail({
    to,
    subject: `Votre billet d'avion ${route}`,
    text,
    attachments,
    html: layout({
      preheader: `Votre billet ${route} est émis.`,
      title: "Votre billet d'avion",
      paragraphs: [
        `Bonjour ${escapeHtml(clientName)},`,
        `Votre billet <b>${escapeHtml(route)}</b> est émis.${escapeHtml(attached)}`,
        ...(note ? [`<b>Information de l'équipe MoveColis :</b> ${escapeHtml(note)}`] : []),
        receiptHtml,
      ],
      button: { label: "Ouvrir ma conversation", url },
      footer:
        "Vérifiez les noms des passagers et les horaires sur votre billet. " +
        "Une question ? Écrivez à l'équipe MoveColis dans la conversation.<br>Bon voyage !",
    }),
  });
}
