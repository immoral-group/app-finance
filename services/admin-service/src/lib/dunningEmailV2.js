// Renderer premium del email de impagos.
// Reproduce el diseño oficial: hero con degradado, 6 cards de datos,
// CTA Stripe, botones de bancos configurables, copies estructurados y firma.
// Compatible con Gmail/Outlook (table-based + inline styles).

import { LOGO_BASE64 } from './dunningLogo.js';

// Detecta URLs de default vacías o que aún no están disponibles (preview branches
// donde imfinance.immoral.es aún no sirve el logo). En esos casos usamos el
// logo embebido en base64 para asegurar que siempre se ve.
function resolveLogoSrc(url) {
    if (!url) return LOGO_BASE64;
    const trimmed = String(url).trim();
    if (!trimmed) return LOGO_BASE64;
    // Si el user pone una URL propia (imgur, cloudinary, etc.), la respetamos.
    // Si es la URL default de producción, usamos el embed para que funcione
    // también en previews y localhost.
    if (trimmed === 'https://imfinance.immoral.es/logo.png') return LOGO_BASE64;
    return trimmed;
}

const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function interpolate(str, vars) {
    if (!str) return '';
    return String(str).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
        const val = vars[key];
        return val === undefined || val === null ? '' : String(val);
    });
}

function formatAmount(amount, currency = 'EUR') {
    const n = Number(amount || 0);
    try {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(n);
    } catch {
        return `${n.toFixed(2)} ${currency}`;
    }
}

function paragraphs(text) {
    if (!text) return '';
    return String(text)
        .split(/\n{2,}/)
        .map(p => `<p style="margin:0 0 14px 0;font-size:14px;line-height:1.65;color:#374151;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
        .join('');
}

function renderBank(bank) {
    const color = bank.color || '#1e40af';
    const url = escapeHtml(bank.url || '#');
    const name = escapeHtml(bank.name || 'Banco');
    return `
<td align="center" style="padding:0 6px;">
  <a href="${url}" target="_blank" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:0.3px;">${name}</a>
</td>`;
}

/**
 * Genera el HTML completo del email premium de impagos.
 *
 * @param {Object} p
 * @param {Object} p.config   fila de dunning_config
 * @param {Object} p.template fila de dunning_templates
 * @param {Object} p.invoice  datos de la factura
 * @param {String} p.stripe_url  URL de checkout Stripe generada previamente
 * @param {Object} [p.test_context] Si se pasa, añade banner "MODO PRUEBA" al inicio.
 *                                  { original_email: string, contact_name?: string }
 */
export function renderDunningEmailV2({ config, template, invoice, stripe_url, test_context }) {
    const primary = config.brand_primary_color || '#0ea5e9';
    const secondary = config.brand_secondary_color || '#1e40af';
    const gradient = `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`;

    const vars = {
        contact_name: invoice.contact_name || '',
        invoice_number: invoice.invoice_number || '',
        invoice_date: invoice.invoice_date || '',
        due_date: invoice.due_date || '',
        days_overdue: invoice.days_overdue,
        amount: formatAmount(invoice.amount, invoice.currency),
        currency: invoice.currency || 'EUR',
    };

    const subject = interpolate(template.subject || 'Recordatorio de pago — factura {{invoice_number}}', vars);
    const heroTitle = interpolate(template.hero_title || 'Recordatorio de pago', vars);
    const heroSubtitle = interpolate(template.hero_subtitle || 'Seguimiento automático de factura pendiente', vars);
    const intro = interpolate(template.intro_copy || '', vars);
    const outro = interpolate(template.outro_copy || '', vars);

    const banks = Array.isArray(config.banks) ? config.banks : [];
    const banksRow = banks.length
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 0 auto;"><tr>${banks.map(renderBank).join('')}</tr></table>`
        : '';

    const stripeButton = stripe_url ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:12px auto;">
  <tr><td align="center" style="background:${gradient};border-radius:10px;">
    <a href="${escapeHtml(stripe_url)}" target="_blank" style="display:inline-block;padding:14px 34px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">
      ${escapeHtml(config.cta_stripe_label || 'Pagar ahora con tarjeta')}
    </a>
  </td></tr>
</table>` : '';

    const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 12px;">
  <tr><td align="center">

    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px -8px rgba(0,0,0,0.08);">

      ${test_context ? `
      <tr><td style="background:#fef3c7;border-bottom:2px solid #f59e0b;padding:10px 20px;color:#78350f;font-size:12px;font-family:monospace;">
        <strong>⚠ MODO PRUEBA</strong> — Destinatario original: <strong>${escapeHtml(test_context.original_email || '?')}</strong>${test_context.contact_name ? ` (${escapeHtml(test_context.contact_name)})` : ''}. Este email se ha redirigido para QA.
      </td></tr>` : ''}

      <!-- Hero -->
      <tr><td style="background:${gradient};padding:26px 28px 24px 28px;color:#ffffff;">
        <div style="margin-bottom:10px;">
          <img src="${resolveLogoSrc(config.brand_logo_url)}" alt="${escapeHtml(config.brand_logo_text || 'Logo')}" style="max-height:34px;width:auto;display:block;" />
        </div>
        <h1 style="margin:0 0 6px 0;font-size:22px;font-weight:800;line-height:1.25;color:#ffffff;">
          ${escapeHtml(heroTitle)}
        </h1>
        <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.85);">
          ${escapeHtml(heroSubtitle)}
        </p>
      </td></tr>

      <!-- Intro copy -->
      <tr><td style="padding:22px 28px 4px 28px;">
        ${paragraphs(intro)}
      </td></tr>

      <!-- Cards: fila 1 (Factura / Estado) -->
      <tr><td style="padding:8px 28px 6px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" valign="top" style="padding:0 6px 0 0;">
              <div style="background:#f3f4f6;border-radius:10px;padding:12px 14px;">
                <div style="font-size:10px;font-weight:700;letter-spacing:1.4px;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">FACTURA</div>
                <div style="font-size:18px;font-weight:800;color:#111827;">${escapeHtml(vars.invoice_number || '—')}</div>
              </div>
            </td>
            <td width="50%" valign="top" style="padding:0 0 0 6px;">
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;">
                <div style="font-size:10px;font-weight:700;letter-spacing:1.4px;color:#b91c1c;text-transform:uppercase;margin-bottom:4px;">ESTADO</div>
                <div style="font-size:16px;font-weight:800;color:#991b1b;">${escapeHtml(config.status_label || 'Pendiente de pago')}</div>
              </div>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Cards: fila 2 (Emisión / Vencimiento) -->
      <tr><td style="padding:6px 28px 6px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" valign="top" style="padding:0 6px 0 0;">
              <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;">
                <div style="font-size:10px;font-weight:700;letter-spacing:1.4px;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">EMISIÓN</div>
                <div style="font-size:15px;font-weight:700;color:#111827;">${escapeHtml(vars.invoice_date || '—')}</div>
              </div>
            </td>
            <td width="50%" valign="top" style="padding:0 0 0 6px;">
              <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;">
                <div style="font-size:10px;font-weight:700;letter-spacing:1.4px;color:#c2410c;text-transform:uppercase;margin-bottom:4px;">VENCIMIENTO</div>
                <div style="font-size:15px;font-weight:700;color:#9a3412;">${escapeHtml(vars.due_date || '—')}</div>
              </div>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Cards: fila 3 (Días vencida / Importe) -->
      <tr><td style="padding:6px 28px 14px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" valign="top" style="padding:0 6px 0 0;">
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;">
                <div style="font-size:10px;font-weight:700;letter-spacing:1.4px;color:#b91c1c;text-transform:uppercase;margin-bottom:4px;">DÍAS VENCIDA</div>
                <div style="font-size:18px;font-weight:800;color:#991b1b;">${escapeHtml(String(vars.days_overdue))} días</div>
              </div>
            </td>
            <td width="50%" valign="top" style="padding:0 0 0 6px;">
              <div style="background:#0f172a;border-radius:10px;padding:12px 14px;">
                <div style="font-size:10px;font-weight:700;letter-spacing:1.4px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;">IMPORTE PENDIENTE</div>
                <div style="font-size:18px;font-weight:800;color:#ffffff;">${escapeHtml(vars.amount)}</div>
              </div>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- CTA line -->
      ${stripe_url ? `
      <tr><td align="center" style="padding:6px 28px 0 28px;">
        <p style="margin:0;font-size:12px;color:#6b7280;">A tan solo un clic de quedar al corriente — paga de forma rápida y segura.</p>
      </td></tr>` : ''}

      <!-- Stripe button -->
      <tr><td align="center" style="padding:4px 28px 6px 28px;">
        ${stripeButton}
      </td></tr>

      <!-- Bancos -->
      ${banks.length ? `
      <tr><td align="center" style="padding:6px 28px 14px 28px;">
        <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;">${escapeHtml(config.cta_bank_prefix || '')}</p>
        ${banksRow}
      </td></tr>` : ''}

      <!-- Outro copy -->
      ${outro ? `
      <tr><td style="padding:14px 28px 6px 28px;border-top:1px solid #f3f4f6;">
        ${paragraphs(outro)}
      </td></tr>` : ''}

      <!-- Firma -->
      <tr><td style="padding:12px 28px 26px 28px;">
        <div style="font-size:13px;line-height:1.6;color:#4b5563;">
          ${config.signature_html || 'Un saludo,'}
        </div>
      </td></tr>

    </table>

    <div style="max-width:600px;margin:12px auto 0 auto;text-align:center;font-size:11px;color:#9ca3af;">
      Este email se envía automáticamente desde Immoral Finance.
    </div>

  </td></tr>
</table>
</body></html>`;

    return { subject, html };
}

// Variables de muestra — para la previsualización del editor.
export const SAMPLE_INVOICE = {
    contact_name: 'Ejemplo Cliente SL',
    invoice_number: 'F261021',
    invoice_date: '01-06-2026',
    due_date: '30-06-2026',
    days_overdue: 13,
    amount: 1936.00,
    currency: 'EUR',
};
