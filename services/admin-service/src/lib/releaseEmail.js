/**
 * scripts/release_email_template.js
 *
 * Plantilla del correo de novedades para la feature "Filas en Escenarios".
 * Diseño responsive, table-based (compatible con Gmail, Outlook, Apple Mail).
 */

export function buildReleaseEmail({ appUrl = 'https://app-finance.vercel.app', previewUrl } = {}) {
    const cta = previewUrl || appUrl;
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
        `Abre la app: ${cta}`,
        '',
        '— Immoral Finance',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<div style="display:none;max-height:0;overflow:hidden;">Los Escenarios ahora simulan altas, bajas y pagas dobles — no solo porcentajes.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 12px;">
  <tr><td align="center">

    <!-- Container -->
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 24px 60px -20px rgba(99,102,241,0.35);">

      <!-- Hero -->
      <tr>
        <td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 45%,#ec4899 100%);padding:36px 32px 28px 32px;color:#ffffff;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <span style="display:inline-block;background:rgba(255,255,255,0.18);color:#ffffff;font-size:10px;font-weight:800;letter-spacing:2px;padding:5px 10px;border-radius:999px;text-transform:uppercase;">✨ Novedad · Escenarios</span>
              </td>
              <td align="right" style="color:rgba(255,255,255,0.75);font-size:11px;">Immoral Finance</td>
            </tr>
          </table>
          <h1 style="margin:18px 0 8px 0;font-size:26px;font-weight:800;line-height:1.2;">
            Añade y quita filas en tus escenarios
          </h1>
          <p style="margin:0;font-size:15px;line-height:1.55;color:rgba(255,255,255,0.92);">
            Ya no tienes que jugar solo con porcentajes. Ahora puedes <strong>simular una baja</strong> a partir de un mes, <strong>añadir un trabajador nuevo</strong> con su coste, e incluso <strong>estimar la paga doble</strong> de diciembre.
          </p>
        </td>
      </tr>

      <!-- Intro -->
      <tr>
        <td style="padding:28px 32px 8px 32px;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
            Disponible en <strong>Presupuesto</strong> y en <strong>Forecast</strong> — bibliotecas independientes, con la misma potencia. Los cambios son 100% visuales, no tocan la base ni afectan lo que ven otros usuarios hasta que compartas el escenario.
          </p>
        </td>
      </tr>

      <!-- Features grid -->
      <tr>
        <td style="padding:12px 32px 8px 32px;">

          <!-- Card 1 · Bajas -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;background:#fff1f2;border:1px solid #fecdd3;border-radius:14px;">
            <tr>
              <td width="52" valign="top" style="padding:16px 0 16px 16px;">
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#f43f5e,#e11d48);border-radius:12px;display:table-cell;vertical-align:middle;text-align:center;color:#ffffff;font-size:20px;font-weight:800;line-height:40px;">−</div>
              </td>
              <td valign="top" style="padding:14px 16px 14px 12px;">
                <div style="font-size:14px;font-weight:700;color:#9f1239;margin-bottom:4px;">Elimina una fila desde un mes</div>
                <div style="font-size:13px;line-height:1.55;color:#4b5563;">
                  ¿Un trabajador se va en octubre? ¿Cortas un software en Q3? Marca la fila, elige el mes de corte y el escenario la pone a 0 desde ahí. La fila sigue con su valor real los meses anteriores.
                </div>
              </td>
            </tr>
          </table>

          <!-- Card 2 · Altas -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;background:#ecfeff;border:1px solid #a5f3fc;border-radius:14px;">
            <tr>
              <td width="52" valign="top" style="padding:16px 0 16px 16px;">
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#8b5cf6,#6366f1);border-radius:12px;display:table-cell;vertical-align:middle;text-align:center;color:#ffffff;font-size:20px;font-weight:800;line-height:40px;">+</div>
              </td>
              <td valign="top" style="padding:14px 16px 14px 12px;">
                <div style="font-size:14px;font-weight:700;color:#0e7490;margin-bottom:4px;">Añade filas nuevas con su coste</div>
                <div style="font-size:13px;line-height:1.55;color:#4b5563;">
                  Simula un fichaje, un nuevo servicio contratado, un cliente que arranca, un adspend puntual… Eliges sección, hub, importe y desde/hasta cuándo aplica. Todo dentro del escenario, sin ensuciar el presupuesto real.
                </div>
              </td>
            </tr>
          </table>

          <!-- Card 3 · Paga doble -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:14px;">
            <tr>
              <td width="52" valign="top" style="padding:16px 0 16px 16px;">
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#a855f7,#ec4899);border-radius:12px;display:table-cell;vertical-align:middle;text-align:center;color:#ffffff;font-size:18px;font-weight:800;line-height:40px;">🎁</div>
              </td>
              <td valign="top" style="padding:14px 16px 14px 12px;">
                <div style="font-size:14px;font-weight:700;color:#6d28d9;margin-bottom:4px;">Paga doble o extra en diciembre</div>
                <div style="font-size:13px;line-height:1.55;color:#4b5563;">
                  Para altas nuevas en <em>Personal</em> puedes marcar <strong>"Paga doble en diciembre"</strong> y el escenario duplica automáticamente ese mes. Si prefieres un importe concreto, hay un campo libre para el extra estimado.
                </div>
              </td>
            </tr>
          </table>

        </td>
      </tr>

      <!-- Cómo se ve -->
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

      <!-- CTA -->
      <tr>
        <td align="center" style="padding:28px 32px 8px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;">
                <a href="${cta}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">
                  Abrir Escenarios en la app →
                </a>
              </td>
            </tr>
          </table>
          <div style="margin-top:10px;font-size:11px;color:#9ca3af;">
            Encuéntralo dentro de <strong>Presupuesto</strong> o <strong>Forecast</strong> → botón <span style="color:#6366f1;">✨ Escenarios</span> → sección <em>Filas del escenario</em>.
          </div>
        </td>
      </tr>

      <!-- Nota compat -->
      <tr>
        <td style="padding:16px 32px 24px 32px;">
          <div style="background:#f9fafb;border:1px dashed #d1d5db;border-radius:10px;padding:12px 14px;font-size:12px;color:#4b5563;line-height:1.55;">
            <strong style="color:#111827;">100% retrocompatible.</strong> Los escenarios que ya tienes guardados siguen funcionando exactamente igual. Los cambios de filas son opcionales — si no añades ni eliminas nada, la vista se comporta como siempre.
          </div>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f9fafb;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:11px;color:#9ca3af;">
                Immoral Finance · Notificación de nueva funcionalidad
              </td>
              <td align="right" style="font-size:11px;">
                <a href="${appUrl}" target="_blank" style="color:#6366f1;text-decoration:none;">Ir a la app</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

    </table>

  </td></tr>
</table>
</body>
</html>`;

    return { subject, html, text };
}
