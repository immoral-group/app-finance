/**
 * client/src/lib/releaseEmailBuilder.ts
 *
 * Genera el correo HTML de novedad a partir de una entrada del CHANGELOG.
 * Se ejecuta en el cliente: la preview se dibuja en un iframe (srcDoc) y el
 * HTML resultante se manda al backend para el envío.
 *
 * Hay un builder por defecto (compatible con cualquier ChangelogEntry) y
 * builders específicos para entradas con contenido enriquecido.
 */

import type { ChangelogEntry } from './changelog';

const TYPE_META: Record<ChangelogEntry['type'], { label: string; heroGradient: string; badgeBg: string; badgeText: string; accent: string }> = {
    new_module: {
        label: 'NOVEDAD',
        heroGradient: 'linear-gradient(135deg,#10b981 0%,#06b6d4 50%,#6366f1 100%)',
        badgeBg: '#ecfdf5', badgeText: '#065f46', accent: '#10b981',
    },
    improvement: {
        label: 'MEJORA',
        heroGradient: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#ec4899 100%)',
        badgeBg: '#eef2ff', badgeText: '#3730a3', accent: '#6366f1',
    },
    fix: {
        label: 'CORRECCIÓN',
        heroGradient: 'linear-gradient(135deg,#f59e0b 0%,#f97316 50%,#ef4444 100%)',
        badgeBg: '#fffbeb', badgeText: '#92400e', accent: '#f59e0b',
    },
    in_progress: {
        label: 'EN DESARROLLO',
        heroGradient: 'linear-gradient(135deg,#a855f7 0%,#7c3aed 50%,#4f46e5 100%)',
        badgeBg: '#f5f3ff', badgeText: '#5b21b6', accent: '#a855f7',
    },
};

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function prettyDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    return `${d} de ${MONTHS_ES[m - 1] || m} de ${y}`;
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface BuiltEmail {
    subject: string;
    html: string;
    text: string;
}

interface BuildOpts {
    appUrl?: string;
    ctaLabel?: string;
}

// Fallback seguro para el appUrl cuando el caller no lo pasa.
// Prioriza el origin actual del navegador (siempre válido), y si estamos
// en Node/SSR/CLI usa un placeholder inofensivo. Nunca devolvemos una URL
// que se sabe que no existe (como el antiguo hardcoded app-finance.vercel.app).
function resolveAppUrl(explicit?: string): string {
    if (explicit) return explicit.replace(/\/$/, '');
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder por defecto — usa el tipo, título, descripción y fecha del entry
// ─────────────────────────────────────────────────────────────────────────────

function buildDefault(entry: ChangelogEntry, opts: BuildOpts = {}): BuiltEmail {
    const appUrl = resolveAppUrl(opts.appUrl);
    const ctaLabel = opts.ctaLabel || 'Abrir en la app';
    const meta = TYPE_META[entry.type];
    const subject = `✨ ${entry.title}`;

    const text = [
        `Immoral Finance — ${meta.label}`,
        '',
        entry.title,
        '',
        entry.description,
        '',
        `Abre la app: ${appUrl}`,
        `— ${prettyDate(entry.date)}`,
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(entry.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(entry.description.slice(0, 140))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 12px;"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 24px 60px -20px rgba(99,102,241,0.35);">
    <tr>
      <td style="background:${meta.heroGradient};padding:36px 32px 28px 32px;color:#ffffff;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td><span style="display:inline-block;background:rgba(255,255,255,0.18);color:#ffffff;font-size:10px;font-weight:800;letter-spacing:2px;padding:5px 10px;border-radius:999px;">${meta.label}</span></td>
          <td align="right" style="color:rgba(255,255,255,0.75);font-size:11px;">Immoral Finance · ${prettyDate(entry.date)}</td>
        </tr></table>
        <h1 style="margin:18px 0 8px 0;font-size:24px;font-weight:800;line-height:1.25;">${esc(entry.title)}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px 4px 32px;">
        <p style="margin:0;font-size:14px;line-height:1.65;color:#374151;">${esc(entry.description)}</p>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:28px 32px 8px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background:${meta.heroGradient};border-radius:12px;">
            <a href="${appUrl}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(ctaLabel)} →</a>
          </td>
        </tr></table>
      </td>
    </tr>
    <tr>
      <td style="padding:12px 32px 24px 32px;">
        <div style="background:#f9fafb;border:1px dashed #d1d5db;border-radius:10px;padding:12px 14px;font-size:12px;color:#4b5563;line-height:1.55;">
          Recibes este correo porque un administrador te ha notificado esta novedad en <strong>Immoral Finance</strong>.
        </div>
      </td>
    </tr>
    <tr>
      <td style="background:#f9fafb;padding:18px 32px;border-top:1px solid #e5e7eb;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-size:11px;color:#9ca3af;">Immoral Finance · Notificación de novedad</td>
          <td align="right" style="font-size:11px;"><a href="${appUrl}" target="_blank" style="color:${meta.accent};text-decoration:none;">Ir a la app</a></td>
        </tr></table>
      </td>
    </tr>
  </table>
</td></tr></table>
</body></html>`;

    return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder específico — Escenarios: Filas (contenido rico)
// ─────────────────────────────────────────────────────────────────────────────

function buildScenariosRows(entry: ChangelogEntry, opts: BuildOpts = {}): BuiltEmail {
    const appUrl = resolveAppUrl(opts.appUrl);
    const subject = '✨ Nuevo en Escenarios: añade y quita filas para simular altas, bajas y pagas dobles';
    const text = [
        'Novedad en Immoral Finance — Escenarios',
        '',
        'Los Escenarios ya no se limitan a subir o bajar porcentajes.',
        'Ahora puedes simular:',
        '  • Bajas: elimina una fila (trabajador, software, gasto...) a partir de un mes concreto.',
        '  • Altas: añade una fila nueva con su coste mensual y rango de meses.',
        '  • Paga doble o extra en diciembre para nuevos trabajadores (14 pagas).',
        '',
        `Abre la app: ${appUrl}`,
        '— Immoral Finance',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<div style="display:none;max-height:0;overflow:hidden;">Los Escenarios ahora simulan altas, bajas y pagas dobles — no solo porcentajes.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 24px 60px -20px rgba(99,102,241,0.35);">

      <tr>
        <td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 45%,#ec4899 100%);padding:36px 32px 28px 32px;color:#ffffff;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td><span style="display:inline-block;background:rgba(255,255,255,0.18);color:#ffffff;font-size:10px;font-weight:800;letter-spacing:2px;padding:5px 10px;border-radius:999px;text-transform:uppercase;">✨ Novedad · Escenarios</span></td>
              <td align="right" style="color:rgba(255,255,255,0.75);font-size:11px;">Immoral Finance</td>
            </tr>
          </table>
          <h1 style="margin:18px 0 8px 0;font-size:26px;font-weight:800;line-height:1.2;">Añade y quita filas en tus escenarios</h1>
          <p style="margin:0;font-size:15px;line-height:1.55;color:rgba(255,255,255,0.92);">Ya no tienes que jugar solo con porcentajes. Ahora puedes <strong>simular una baja</strong> a partir de un mes, <strong>añadir un trabajador nuevo</strong> con su coste, e incluso <strong>estimar la paga doble</strong> de diciembre.</p>
        </td>
      </tr>

      <tr>
        <td style="padding:28px 32px 8px 32px;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">Disponible en <strong>Presupuesto</strong> y en <strong>Forecast</strong> — bibliotecas independientes, con la misma potencia. Los cambios son 100% visuales, no tocan la base ni afectan lo que ven otros usuarios hasta que compartas el escenario.</p>
        </td>
      </tr>

      <tr>
        <td style="padding:12px 32px 8px 32px;">

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;background:#fff1f2;border:1px solid #fecdd3;border-radius:14px;">
            <tr>
              <td width="52" valign="top" style="padding:16px 0 16px 16px;">
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#f43f5e,#e11d48);border-radius:12px;color:#ffffff;font-size:20px;font-weight:800;text-align:center;line-height:40px;">−</div>
              </td>
              <td valign="top" style="padding:14px 16px 14px 12px;">
                <div style="font-size:14px;font-weight:700;color:#9f1239;margin-bottom:4px;">Elimina una fila desde un mes</div>
                <div style="font-size:13px;line-height:1.55;color:#4b5563;">¿Un trabajador se va en octubre? ¿Cortas un software en Q3? Marca la fila, elige el mes de corte y el escenario la pone a 0 desde ahí. La fila sigue con su valor real los meses anteriores.</div>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;background:#ecfeff;border:1px solid #a5f3fc;border-radius:14px;">
            <tr>
              <td width="52" valign="top" style="padding:16px 0 16px 16px;">
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#8b5cf6,#6366f1);border-radius:12px;color:#ffffff;font-size:20px;font-weight:800;text-align:center;line-height:40px;">+</div>
              </td>
              <td valign="top" style="padding:14px 16px 14px 12px;">
                <div style="font-size:14px;font-weight:700;color:#0e7490;margin-bottom:4px;">Añade filas nuevas con su coste</div>
                <div style="font-size:13px;line-height:1.55;color:#4b5563;">Simula un fichaje, un nuevo servicio contratado, un cliente que arranca, un adspend puntual… Eliges sección, hub, importe y desde/hasta cuándo aplica. Todo dentro del escenario, sin ensuciar el presupuesto real.</div>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:14px;">
            <tr>
              <td width="52" valign="top" style="padding:16px 0 16px 16px;">
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#a855f7,#ec4899);border-radius:12px;color:#ffffff;font-size:18px;font-weight:800;text-align:center;line-height:40px;">🎁</div>
              </td>
              <td valign="top" style="padding:14px 16px 14px 12px;">
                <div style="font-size:14px;font-weight:700;color:#6d28d9;margin-bottom:4px;">Paga doble o extra en diciembre</div>
                <div style="font-size:13px;line-height:1.55;color:#4b5563;">Para altas nuevas en <em>Personal</em> puedes marcar <strong>"Paga doble en diciembre"</strong> y el escenario duplica automáticamente ese mes. Si prefieres un importe concreto, hay un campo libre para el extra estimado.</div>
              </td>
            </tr>
          </table>

        </td>
      </tr>

      <tr>
        <td style="padding:14px 32px 4px 32px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:1.6px;color:#6366f1;text-transform:uppercase;margin-bottom:8px;">CÓMO SE VE EN LA MATRIZ</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td width="50%" style="padding:14px 16px;background:#f5f3ff;border-right:1px solid #e5e7eb;vertical-align:top;">
                <div style="font-size:11px;font-weight:800;color:#7c3aed;letter-spacing:1px;margin-bottom:4px;">NUEVA</div>
                <div style="font-size:13px;color:#4c1d95;line-height:1.5;">Las filas <strong>añadidas</strong> aparecen sombreadas en violeta con la etiqueta <em>NUEVA</em>.</div>
              </td>
              <td width="50%" style="padding:14px 16px;background:#fff1f2;vertical-align:top;">
                <div style="font-size:11px;font-weight:800;color:#e11d48;letter-spacing:1px;margin-bottom:4px;">−100%</div>
                <div style="font-size:13px;color:#9f1239;line-height:1.5;">Las filas <strong>eliminadas</strong> se ponen en rosa con el valor base tachado.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td align="center" style="padding:28px 32px 8px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;">
              <a href="${appUrl}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">Abrir Escenarios en la app →</a>
            </td>
          </tr></table>
          <div style="margin-top:10px;font-size:11px;color:#9ca3af;">Encuéntralo dentro de <strong>Presupuesto</strong> o <strong>Forecast</strong> → botón <span style="color:#6366f1;">✨ Escenarios</span> → sección <em>Filas del escenario</em>.</div>
        </td>
      </tr>

      <tr>
        <td style="padding:16px 32px 24px 32px;">
          <div style="background:#f9fafb;border:1px dashed #d1d5db;border-radius:10px;padding:12px 14px;font-size:12px;color:#4b5563;line-height:1.55;">
            <strong style="color:#111827;">100% retrocompatible.</strong> Los escenarios que ya tienes guardados siguen funcionando exactamente igual. Los cambios de filas son opcionales — si no añades ni eliminas nada, la vista se comporta como siempre.
          </div>
        </td>
      </tr>

      <tr>
        <td style="background:#f9fafb;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size:11px;color:#9ca3af;">Immoral Finance · Notificación de nueva funcionalidad</td>
            <td align="right" style="font-size:11px;"><a href="${appUrl}" target="_blank" style="color:#6366f1;text-decoration:none;">Ir a la app</a></td>
          </tr></table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body></html>`;
    // entry marker just to satisfy TS in case unused
    void entry;
    return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro de builders específicos (opcional). Si no hay match, usa el default.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Builder específico — Enviar novedades por email
// ─────────────────────────────────────────────────────────────────────────────

function buildEnviarNovedadesEmail(entry: ChangelogEntry, opts: BuildOpts = {}): BuiltEmail {
    const appUrl = resolveAppUrl(opts.appUrl);
    const subject = '📬 Nuevo en Immoral Finance: envía novedades por email desde la app';
    const text = [
        'Novedad en Immoral Finance — Enviar novedades',
        '',
        'Los superadmins ahora pueden mandar novedades por correo desde la propia app:',
        '  • Elige cualquier novedad del historial (todas las que se han publicado).',
        '  • Filtra usuarios por rol y departamento, y escríbe también emails externos.',
        '  • Previsualiza el correo antes de enviar.',
        '  • Cada destinatario recibe un correo dedicado, no ve al resto.',
        '',
        `Abre la app: ${appUrl}/release-notifications`,
        '— Immoral Finance',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<div style="display:none;max-height:0;overflow:hidden;">Ya puedes enviar novedades por email desde la propia app — elige la novedad, los destinatarios y envía.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 24px 60px -20px rgba(16,185,129,0.35);">

      <tr>
        <td style="background:linear-gradient(135deg,#10b981 0%,#06b6d4 45%,#6366f1 100%);padding:36px 32px 28px 32px;color:#ffffff;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td><span style="display:inline-block;background:rgba(255,255,255,0.18);color:#ffffff;font-size:10px;font-weight:800;letter-spacing:2px;padding:5px 10px;border-radius:999px;text-transform:uppercase;">📬 Novedad · Comunicación</span></td>
              <td align="right" style="color:rgba(255,255,255,0.75);font-size:11px;">Immoral Finance · Solo superadmins</td>
            </tr>
          </table>
          <h1 style="margin:18px 0 8px 0;font-size:26px;font-weight:800;line-height:1.2;">Envía novedades por email desde la app</h1>
          <p style="margin:0;font-size:15px;line-height:1.55;color:rgba(255,255,255,0.92);">Ya no hace falta redactar correos por fuera. Elige una novedad, escoge a quién enviársela y <strong>previsualiza el correo antes de darle al botón</strong>. Cada destinatario recibe su copia dedicada.</p>
        </td>
      </tr>

      <tr>
        <td style="padding:28px 32px 8px 32px;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
            Encuéntralo en el menú lateral, bajo <strong>✉️ Enviar novedades</strong>. La biblioteca de novedades es la misma que ves en el badge <span style="color:#6366f1;">✨</span> — así que todo lo que se publique en el <em>changelog</em> ya está listo para enviar por email.
          </p>
        </td>
      </tr>

      <tr>
        <td style="padding:12px 32px 8px 32px;">

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;">
            <tr>
              <td width="52" valign="top" style="padding:16px 0 16px 16px;">
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#10b981,#059669);border-radius:12px;color:#ffffff;font-size:18px;font-weight:800;text-align:center;line-height:40px;">1</div>
              </td>
              <td valign="top" style="padding:14px 16px 14px 12px;">
                <div style="font-size:14px;font-weight:700;color:#065f46;margin-bottom:4px;">Elige la novedad</div>
                <div style="font-size:13px;line-height:1.55;color:#4b5563;">Lista completa del historial con buscador y filtro por tipo (Nuevo / Mejora / Corrección / En desarrollo). El correo se genera automáticamente con el diseño de Immoral Finance.</div>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;background:#ecfeff;border:1px solid #a5f3fc;border-radius:14px;">
            <tr>
              <td width="52" valign="top" style="padding:16px 0 16px 16px;">
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#06b6d4,#0891b2);border-radius:12px;color:#ffffff;font-size:18px;font-weight:800;text-align:center;line-height:40px;">2</div>
              </td>
              <td valign="top" style="padding:14px 16px 14px 12px;">
                <div style="font-size:14px;font-weight:700;color:#0e7490;margin-bottom:4px;">Elige destinatarios</div>
                <div style="font-size:13px;line-height:1.55;color:#4b5563;">Marca uno o varios usuarios de la app filtrando por rol o departamento, o añade <strong>emails externos</strong> escribiéndolos a mano (útil para clientes, partners o gente que no está dentro de la plataforma).</div>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;background:#eef2ff;border:1px solid #c7d2fe;border-radius:14px;">
            <tr>
              <td width="52" valign="top" style="padding:16px 0 16px 16px;">
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#6366f1,#4f46e5);border-radius:12px;color:#ffffff;font-size:18px;font-weight:800;text-align:center;line-height:40px;">3</div>
              </td>
              <td valign="top" style="padding:14px 16px 14px 12px;">
                <div style="font-size:14px;font-weight:700;color:#3730a3;margin-bottom:4px;">Previsualiza y envía</div>
                <div style="font-size:13px;line-height:1.55;color:#4b5563;">A la derecha ves el correo tal y como lo recibirá el destinatario. Antes de enviar, la app te muestra un resumen con los destinatarios y te pide confirmación. Puedes probar el SMTP en cualquier momento con el botón "Probar SMTP".</div>
              </td>
            </tr>
          </table>

        </td>
      </tr>

      <tr>
        <td align="center" style="padding:28px 32px 8px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background:linear-gradient(135deg,#10b981,#06b6d4);border-radius:12px;">
              <a href="${appUrl}/release-notifications" target="_blank" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">Abrir Enviar novedades →</a>
            </td>
          </tr></table>
          <div style="margin-top:10px;font-size:11px;color:#9ca3af;">Disponible solo para <strong>superadmins</strong> · en el sidebar bajo <span style="color:#10b981;">✉️ Enviar novedades</span></div>
        </td>
      </tr>

      <tr>
        <td style="padding:16px 32px 24px 32px;">
          <div style="background:#f9fafb;border:1px dashed #d1d5db;border-radius:10px;padding:12px 14px;font-size:12px;color:#4b5563;line-height:1.55;">
            <strong style="color:#111827;">Privacidad:</strong> cada destinatario recibe un correo dedicado a su dirección. La lista de destinatarios no se expone (no se usa BCC).
          </div>
        </td>
      </tr>

      <tr>
        <td style="background:#f9fafb;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size:11px;color:#9ca3af;">Immoral Finance · Notificación de nueva funcionalidad</td>
            <td align="right" style="font-size:11px;"><a href="${appUrl}" target="_blank" style="color:#10b981;text-decoration:none;">Ir a la app</a></td>
          </tr></table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body></html>`;
    void entry;
    return { subject, html, text };
}

const CUSTOM_BUILDERS: Record<string, (entry: ChangelogEntry, opts?: BuildOpts) => BuiltEmail> = {
    'v1.41-escenarios-filas': buildScenariosRows,
    'v1.42-enviar-novedades-email': buildEnviarNovedadesEmail,
};

export function buildChangelogEmail(entry: ChangelogEntry, opts: BuildOpts = {}): BuiltEmail {
    const custom = CUSTOM_BUILDERS[entry.id];
    if (custom) return custom(entry, opts);
    return buildDefault(entry, opts);
}
