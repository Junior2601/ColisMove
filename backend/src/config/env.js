import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  // Render (et la plupart des bases hébergées) exige une connexion chiffrée depuis l'extérieur
  databaseSsl: process.env.DATABASE_SSL === "true",
  // true = vérifie aussi le certificat du serveur de base de données (plus strict)
  databaseSslVerify: process.env.DATABASE_SSL_VERIFY === "true",
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  // Web Push (facultatif) : sans clés, les notifications restent dans le site
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
    privateKey: process.env.VAPID_PRIVATE_KEY || null,
    subject: process.env.VAPID_SUBJECT || "mailto:contact@movecolis.com",
  },
  // Adresse publique du site (liens dans les e-mails)
  appUrl: (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  // Envoi d'e-mails (Brevo, Resend, e-mail Hostinger…) ; sans SMTP_HOST, les e-mails s'affichent dans la console
  mailFrom: process.env.MAIL_FROM ?? "MoveColis <no-reply@movecolis.com>",
  smtp: {
    host: process.env.SMTP_HOST || null,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true", // true pour le port 465
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null,
  },
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map((o) => o.trim()),
};

export const isDev = env.nodeEnv === "development";
