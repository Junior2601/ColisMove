import nodemailer from "nodemailer";
import { env, isDev } from "../config/env.js";

/**
 * Envoi d'e-mails transactionnels (mot de passe oublié, alertes de sécurité).
 * Sans SMTP_HOST : en développement, l'e-mail (et son lien) s'affiche dans la console du serveur.
 */
const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

if (!transporter) {
  console.warn("✉️  SMTP non configuré : les e-mails ne sont pas envoyés" + (isDev ? " (affichés dans la console)." : " !"));
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

export async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    // Le lien de réinitialisation est un secret : affiché seulement en développement
    if (isDev) console.log(`\n✉️  E-MAIL (non envoyé, SMTP absent)\nÀ : ${to}\nObjet : ${subject}\n\n${text}\n`);
    else console.warn(`✉️  E-mail « ${subject} » non envoyé : SMTP non configuré.`);
    return;
  }
  await transporter.sendMail({ from: env.mailFrom, to, subject, text, html });
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
