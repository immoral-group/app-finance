// Renderer de bloques del editor drag & drop del módulo de impagos.
// Toma un array de bloques ({ id, type, props }) + un objeto de variables,
// y devuelve HTML compatible con Gmail/Outlook (table-based, inline styles).

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

function renderBlock(block, vars) {
    const { type, props = {} } = block || {};

    switch (type) {
        case 'header': {
            const text = interpolate(props.text || '', vars);
            return `
<tr><td style="padding:24px 32px 8px 32px;">
  <h1 style="margin:0;font-size:22px;font-weight:800;color:#111827;line-height:1.25;">
    ${escapeHtml(text)}
  </h1>
</td></tr>`;
        }
        case 'text': {
            const html = interpolate(props.text || '', vars)
                .split(/\n{2,}/)
                .map(p => `<p style="margin:0 0 12px 0;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
                .join('');
            return `
<tr><td style="padding:8px 32px;font-size:14px;line-height:1.6;color:#374151;">
  ${html}
</td></tr>`;
        }
        case 'cta': {
            const label = interpolate(props.label || 'Ver factura', vars);
            const url = interpolate(props.url || '#', vars);
            return `
<tr><td align="center" style="padding:20px 32px 8px 32px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:10px;">
      <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
        ${escapeHtml(label)} →
      </a>
    </td></tr>
  </table>
</td></tr>`;
        }
        case 'invoice_table': {
            const rows = [
                ['Nº factura', vars.invoice_number],
                ['Fecha emisión', vars.invoice_date],
                ['Fecha vencimiento', vars.due_date],
                ['Días vencida', vars.days_overdue],
                ['Importe', formatAmount(vars.amount_raw, vars.currency)],
            ];
            const rowsHtml = rows.map(([k, v]) => `
      <tr>
        <td style="padding:8px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #f3f4f6;">${escapeHtml(k)}</td>
        <td style="padding:8px 12px;font-size:13px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;">${escapeHtml(v || '—')}</td>
      </tr>`).join('');
            return `
<tr><td style="padding:12px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    ${rowsHtml}
  </table>
</td></tr>`;
        }
        case 'signature': {
            const text = interpolate(props.text || '', vars);
            return `
<tr><td style="padding:16px 32px 24px 32px;font-size:13px;line-height:1.6;color:#4b5563;">
  ${escapeHtml(text).replace(/\n/g, '<br>')}
</td></tr>`;
        }
        case 'spacer': {
            const h = Math.max(4, Math.min(80, Number(props.height) || 16));
            return `<tr><td style="height:${h}px;line-height:${h}px;">&nbsp;</td></tr>`;
        }
        default:
            return '';
    }
}

export function renderDunningEmail({ blocks = [], subject = '', vars = {} }) {
    const enrichedVars = {
        ...vars,
        amount: formatAmount(vars.amount, vars.currency),
        amount_raw: vars.amount,
    };

    const resolvedSubject = interpolate(subject, enrichedVars);
    const body = blocks.map(b => renderBlock(b, enrichedVars)).join('');

    const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(resolvedSubject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px -8px rgba(0,0,0,0.12);">
      ${body}
    </table>
  </td></tr>
</table>
</body></html>`;

    return { subject: resolvedSubject, html };
}

// Ejemplo de variables de muestra — para la previsualización del editor.
export const SAMPLE_VARS = {
    contact_name: 'Ejemplo Cliente SL',
    invoice_number: 'F-2026-0142',
    invoice_date: '01/07/2026',
    due_date: '05/07/2026',
    days_overdue: 12,
    amount: 1250.5,
    currency: 'EUR',
    invoice_url: 'https://app-finance.vercel.app/payments',
};
