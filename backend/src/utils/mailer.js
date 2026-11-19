import nodemailer from 'nodemailer';
import env from '../config/env.js';

const testOutbox = [];

function createTransporter() {
  if (env.SMTP_TRANSPORT === 'smtp') {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      logger: false,
      debug: false,
    });
  }

  return nodemailer.createTransport({ jsonTransport: true });
}

const transporter = createTransporter();

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeMailerLogMessage(msg) {
  return String(msg || 'Error SMTP desconocido')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL_REDACTED]')
    .replace(/([?&]token=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/\b[0-9a-f]{32,}\b/gi, '[TOKEN_REDACTED]');
}

export async function sendMail({ to, subject, text, html }) {
  const info = await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });

  if (env.SMTP_TRANSPORT !== 'smtp') {
    testOutbox.push({ to, subject, text, html, messageId: info.messageId, sentAt: new Date().toISOString() });
    if (testOutbox.length > 100) testOutbox.shift();
  }

  return info;
}

export function dispatchPasswordResetEmail({ correo, nombre, token }) {
  const resetUrl = `${env.FRONTEND_URL}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
  const safeHtmlNombre = escapeHtml(nombre);
  const safeHtmlUrl = escapeHtml(resetUrl);
  const subject = 'BikeStore — Recuperación de contraseña';
  const text = `Hola ${nombre},\n\nRecibimos una solicitud para restablecer tu contraseña en BikeStore.\nUsa el siguiente enlace dentro de los próximos 60 minutos:\n${resetUrl}\n\nSi no realizaste esta solicitud, ignora este mensaje.`;
  const html = `<p>Hola <strong>${safeHtmlNombre}</strong>,</p><p>Recibimos una solicitud para restablecer tu contraseña en BikeStore.</p><p><a href="${safeHtmlUrl}">Restablecer contraseña</a> (válido por 60 minutos).</p><p>Si no solicitaste este cambio, ignora este correo.</p>`;

  // Despacho no bloqueante: nunca imprime tokens ni URLs de reset en logs
  Promise.resolve()
    .then(() => sendMail({ to: correo, subject, text, html }))
    .catch((err) => {
      console.error(
        'Error enviando correo de recuperación (no bloqueante):',
        sanitizeMailerLogMessage(err?.message)
      );
    });
}

export function getTestOutbox() {
  return testOutbox;
}

export function clearTestOutbox() {
  testOutbox.length = 0;
}
