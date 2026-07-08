#!/usr/bin/env node
/**
 * scripts/send_release_email.js
 *
 * Envía un correo con la novedad "Filas en Escenarios" a la dirección indicada,
 * usando las credenciales SMTP configuradas en las variables de entorno.
 *
 * Uso:
 *   SMTP_USER=... SMTP_PASS=... node scripts/send_release_email.js [destino@...]
 *
 * Variables usadas (mismo formato que el resto de services/admin-service):
 *   SMTP_HOST   (por defecto smtp.gmail.com)
 *   SMTP_PORT   (por defecto 587)
 *   SMTP_USER   (obligatoria)
 *   SMTP_PASS   (obligatoria)
 *   APP_URL     (por defecto https://app-finance.vercel.app)
 *   PREVIEW_URL (opcional — URL de Preview de Vercel para la rama fix/escenarios2)
 */

import nodemailer from 'nodemailer';
import { buildReleaseEmail } from './release_email_template.js';

const to = process.argv[2] || 'administracion@immoral.es';

if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ Falta SMTP_USER / SMTP_PASS en el entorno');
    process.exit(1);
}

const appUrl = process.env.APP_URL || 'https://app-finance.vercel.app';
const previewUrl = process.env.PREVIEW_URL || appUrl;

const { subject, html, text } = buildReleaseEmail({ appUrl, previewUrl });

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

try {
    const info = await transporter.sendMail({
        from: `"Immoral Finance" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html,
    });
    console.log(`✅ Correo enviado a ${to}`);
    console.log(`   messageId: ${info.messageId}`);
} catch (err) {
    console.error('❌ Error al enviar:', err.message);
    process.exit(1);
}
