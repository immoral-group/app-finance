import express from 'express';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import supabase from '../config/supabase.js';
import { renderDunningEmail, SAMPLE_VARS } from '../lib/dunningRenderer.js';
import { renderDunningEmailV2, SAMPLE_INVOICE } from '../lib/dunningEmailV2.js';
import { buildDunningPlan, summarizePlan, holdedFetch } from '../lib/dunningWorker.js';
import { createCheckoutSession, isConfigured as isStripeConfigured } from '../lib/stripe.js';
import { LOGO_BASE64 } from '../lib/dunningLogo.js';

const router = express.Router();

// SMTP transporter reutilizable (mismo patrón que release-notifications).
let transporter = null;
function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            pool: false,
            connectionTimeout: 8000,
            greetingTimeout: 8000,
            socketTimeout: 15000,
        });
    }
    return transporter;
}

function formatDate(ms) {
    if (!ms) return '';
    try {
        return new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return ''; }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Normaliza una lista de emails: recorta, filtra vacíos/inválidos, quita
// duplicados y opcionalmente excluye una dirección concreta (el destinatario
// principal, para que no aparezca también en CC).
function sanitizeEmailList(input, excludeEmail = null) {
    if (!input) return [];
    const arr = Array.isArray(input) ? input : String(input).split(/[,;\s]+/);
    const exclude = excludeEmail ? String(excludeEmail).trim().toLowerCase() : null;
    const seen = new Set();
    const out = [];
    for (const raw of arr) {
        const email = String(raw || '').trim();
        if (!email || !EMAIL_RE.test(email)) continue;
        const lower = email.toLowerCase();
        if (exclude && lower === exclude) continue;
        if (seen.has(lower)) continue;
        seen.add(lower);
        out.push(email);
    }
    return out;
}

function invoiceVars(invoice, daysOverdue) {
    return {
        contact_name: invoice.contact_name || '',
        invoice_number: invoice.invoice_number || '',
        invoice_date: formatDate(invoice.invoice_date),
        due_date: formatDate(invoice.due_date),
        days_overdue: daysOverdue,
        amount: Number(invoice.amount || 0),
        currency: invoice.currency || 'EUR',
        invoice_url: `https://app-finance.vercel.app/payments`,
    };
}

// ── Auth ──────────────────────────────────────────────────────────────────────
// El módulo de impagos es sensible: solo superadmins pueden leer/escribir.
async function requireSuperAdmin(req, res, next) {
    const { authorization } = req.headers;
    if (!authorization) return res.status(401).json({ error: 'no-auth' });
    const token = authorization.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'invalid-token' });
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if (!profile || profile.role !== 'superadmin') {
        return res.status(403).json({ error: 'forbidden' });
    }
    req.userId = user.id;
    next();
}

// ── Cron auth + endpoints ─────────────────────────────────────────────────────
// Vercel Cron llama a estos endpoints con el header
//   Authorization: Bearer ${CRON_SECRET}
// El resto de rutas (`/dunning/*`) requieren superadmin (ver más abajo).

// GET /dunning/logo — sirve el PNG del logo. Público (sin auth) para que
// funcione como <img src> en los emails.
router.get('/logo', (_req, res) => {
    try {
        const dataUri = String(LOGO_BASE64);
        const commaIdx = dataUri.indexOf(',');
        if (commaIdx < 0) return res.status(500).send('logo-not-available');
        const b64 = dataUri.slice(commaIdx + 1);
        const buf = Buffer.from(b64, 'base64');
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).end(buf);
    } catch (err) {
        res.status(500).send('logo-error');
    }
});

// GET /dunning/logo-debug — endpoint diagnóstico para ver qué URL se usa en emails.
router.get('/logo-debug', (req, res) => {
    const host = req.get('host');
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const cleanAppUrl = String(process.env.APP_URL || '').trim();
    const cleanVercelUrl = String(process.env.VERCEL_URL || '').trim();
    const baseUrl = `${proto}://${host}`;
    const computed = baseUrl
        || (cleanVercelUrl ? `https://${cleanVercelUrl}` : null)
        || cleanAppUrl
        || 'https://imfinance.immoral.es';
    res.json({
        env_APP_URL_raw: process.env.APP_URL || null,
        env_APP_URL_trimmed: cleanAppUrl || null,
        env_APP_URL_has_whitespace: (process.env.APP_URL || '') !== cleanAppUrl,
        env_VERCEL_URL: cleanVercelUrl || null,
        request_host: host,
        request_proto: proto,
        computed_base: computed,
        logo_full_url_used_in_email: `${computed}/api/admin/dunning/logo`,
        logo_endpoint_direct: `${baseUrl}/api/admin/dunning/logo`,
    });
});

function requireCronSecret(req, res, next) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(500).json({ error: 'cron-secret-not-set' });
    const auth = req.headers.authorization || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : req.query.secret;
    if (provided !== secret) return res.status(401).json({ error: 'invalid-cron-secret' });
    next();
}

// Detecta si estamos en el día/hora configurados según la timezone de config.
function isCronScheduledNow(config, now = new Date()) {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: config.timezone || 'Europe/Madrid',
            hour: 'numeric',
            hour12: false,
            weekday: 'short',
        }).formatToParts(now);
        const hour = Number(parts.find(p => p.type === 'hour')?.value || -1);
        const weekdayShort = parts.find(p => p.type === 'weekday')?.value || '';
        const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const dow = DAY_MAP[weekdayShort];
        const hourOk = hour === Number(config.send_hour);
        const dayOk = (config.send_days || []).includes(dow);
        return { ok: hourOk && dayOk, local_hour: hour, local_dow: dow };
    } catch (err) {
        console.warn('[dunning] isCronScheduledNow error:', err.message);
        return { ok: false, error: err.message };
    }
}

// Detecta el origen de la llamada al cron para diferenciar vercel vs manual.
function detectCronSource(req) {
    // Vercel Cron añade el header 'x-vercel-cron' con valor '1'.
    if (req.headers['x-vercel-cron']) return 'vercel-cron';
    return 'manual';
}

// Persiste una entrada en dunning_cron_runs. No lanza — si falla el log,
// no queremos romper la propia ejecución del cron.
async function logCronRun({ endpoint, status, reason, summary, is_test, startedMs }) {
    try {
        await supabase.from('dunning_cron_runs').insert({
            endpoint,
            status,
            reason: reason || null,
            summary: summary || {},
            is_test: !!is_test,
            duration_ms: startedMs ? Date.now() - startedMs : null,
        });
    } catch (err) {
        console.warn('[dunning] logCronRun failed:', err.message);
    }
}

// GET/POST /dunning/cron/run — ejecuta el envío si toca según config.
// IMPORTANTE: Vercel Cron llama con método GET, así que el handler debe estar
// registrado en GET. Aceptamos también POST para poder disparar manualmente
// desde curl u otra herramienta si hace falta.
// Idempotente: si el cron corre 2 veces en la misma hora, la segunda no repite.
async function cronRunHandler(req, res) {
    const startedMs = Date.now();
    const source = detectCronSource(req);
    try {
        const { data: config } = await supabase.from('dunning_config').select('*').eq('id', 1).single();
        if (!config) {
            await logCronRun({ endpoint: 'run', status: 'error', reason: 'no-config', summary: {}, startedMs });
            return res.status(500).json({ error: 'no-config' });
        }

        // Trazabilidad: dejar constancia de cada llamada del cron aunque acabe
        // siendo un skip, así en la UI se puede ver que Vercel sí está pegando.
        const nowIso = new Date().toISOString();
        const stampSkip = async (reason, extra = {}) => {
            await supabase.from('dunning_config').update({
                last_cron_run_at: nowIso,
                last_cron_status: `skipped: ${reason}`,
                last_cron_summary: { skipped: true, reason, source, ...extra },
            }).eq('id', 1).then(() => {}, () => {});
            await logCronRun({
                endpoint: 'run',
                status: 'skipped',
                reason,
                summary: { source, ...extra },
                is_test: !!config.test_mode,
                startedMs,
            });
        };

        // La alerta multi-vencida es independiente del schedule de recordatorios:
        // tiene su propio día/hora y su propio flag enabled. Se dispara aquí
        // porque el cron 'run' es el único que corre a cada hora en punto.
        let multiAlert = null;
        try {
            multiAlert = await maybeDispatchMultiAlert({ config, baseUrl: computeBaseUrl(req) });
        } catch (mErr) {
            console.warn('[dunning] multi-alert dispatch failed:', mErr.message);
            multiAlert = { error: mErr.message };
        }

        // Helper: dispatch del reporte de vencidas. Se invoca en cada camino
        // (skip o envío) para que el reporte tenga su schedule independiente.
        const dispatchReport = async () => {
            try {
                const { data: freshCfg } = await supabase.from('dunning_config').select('*').eq('id', 1).single();
                return await maybeDispatchOverdueReport({ config: freshCfg || config, baseUrl: computeBaseUrl(req) });
            } catch (rErr) {
                console.warn('[dunning] overdue-report dispatch failed:', rErr.message);
                return { error: rErr.message };
            }
        };

        if (!config.enabled) {
            const overdueReport = await dispatchReport();
            await stampSkip('system-disabled', { multi_alert: multiAlert, overdue_report: overdueReport });
            return res.json({ skipped: true, reason: 'system-disabled', multi_alert: multiAlert, overdue_report: overdueReport });
        }

        const schedule = isCronScheduledNow(config);
        if (!schedule.ok) {
            const overdueReport = await dispatchReport();
            await stampSkip('not-scheduled', { schedule, multi_alert: multiAlert, overdue_report: overdueReport });
            return res.json({ skipped: true, reason: 'not-scheduled', schedule, multi_alert: multiAlert, overdue_report: overdueReport });
        }

        // Idempotencia: si ya se ejecutó hace menos de 30 minutos, saltar.
        if (config.last_cron_run_at) {
            const lastMs = new Date(config.last_cron_run_at).getTime();
            if (Date.now() - lastMs < 30 * 60 * 1000) {
                const overdueReport = await dispatchReport();
                await logCronRun({
                    endpoint: 'run',
                    status: 'skipped',
                    reason: 'ran-recently',
                    summary: { source, last_cron_run_at: config.last_cron_run_at, overdue_report: overdueReport },
                    is_test: !!config.test_mode,
                    startedMs,
                });
                return res.json({ skipped: true, reason: 'ran-recently', last_cron_run_at: config.last_cron_run_at, overdue_report: overdueReport });
            }
        }

        // Reutilizamos la lógica del endpoint superadmin haciendo una petición interna
        // en el mismo Express app no es directo; en su lugar ejecutamos la misma
        // secuencia inline. Cambios importantes están en executeSend abajo.
        const result = await executeSend({ dryRun: false, forcedConfig: config, baseUrl: computeBaseUrl(req) });

        const summarySent = result.executed.filter(r => r.status === 'sent').length;
        const summaryFailed = result.executed.filter(r => r.status === 'failed').length;
        const summarySkipped = result.executed.filter(r => r.status === 'skipped').length;

        // Reporte de facturas vencidas — DESPUÉS de executeSend para que la
        // columna "Recordatorio enviado" incluya lo que acaba de salir.
        const overdueReport = await dispatchReport();

        // Actualizar timestamps de trazabilidad.
        await supabase.from('dunning_config').update({
            last_cron_run_at: new Date().toISOString(),
            last_cron_status: 'ok',
            last_cron_summary: {
                source,
                sent: summarySent,
                failed: summaryFailed,
                skipped: summarySkipped,
                summary: result.summary,
            },
        }).eq('id', 1);

        await logCronRun({
            endpoint: 'run',
            status: 'ok',
            reason: null,
            summary: {
                source,
                sent: summarySent,
                failed: summaryFailed,
                skipped: summarySkipped,
                plan_will_skip: (result.plan_skipped || []).length,
                summary: result.summary,
                executed: result.executed,
                plan_skipped: result.plan_skipped || [],
                multi_alert: multiAlert,
                overdue_report: overdueReport,
            },
            is_test: !!config.test_mode,
            startedMs,
        });

        res.json({ ok: true, ...result, multi_alert: multiAlert, overdue_report: overdueReport });
    } catch (err) {
        console.error('[dunning] cron/run error:', err);
        await supabase.from('dunning_config').update({
            last_cron_run_at: new Date().toISOString(),
            last_cron_status: `error: ${String(err.message || err).slice(0, 200)}`,
        }).eq('id', 1).then(() => {}, () => {});
        await logCronRun({
            endpoint: 'run',
            status: 'error',
            reason: String(err.message || err).slice(0, 300),
            summary: { source },
            startedMs,
        });
        res.status(500).json({ error: err.message });
    }
}
router.get('/cron/run', requireCronSecret, cronRunHandler);
router.post('/cron/run', requireCronSecret, cronRunHandler);

// GET/POST /dunning/cron/sync-paid — sincroniza cobros diariamente.
// Aprovecha la misma ejecución diaria para disparar la alerta de clientes
// con múltiples facturas vencidas, con anti-spam de 24h.
async function cronSyncPaidHandler(req, res) {
    const startedMs = Date.now();
    const source = detectCronSource(req);
    try {
        const result = await runSyncPaid();
        await supabase.from('dunning_config').update({
            last_sync_paid_at: new Date().toISOString(),
        }).eq('id', 1);

        // Snapshot diario del historial multi-vencida. Solo guarda, no envía —
        // el envío lo dispara el cron horario `run` a la hora configurada.
        let multiAlert = { skipped: true, reason: 'disabled' };
        try {
            const { data: cfg } = await supabase.from('dunning_config').select('*').eq('id', 1).single();
            if (cfg?.multi_alert_enabled) {
                const { alerts } = await computeMultiOverdueAlerts({ config: cfg });
                if (alerts.length) {
                    const snapshot = await snapshotMultiOverdueAlerts({ alerts, emailSent: false });
                    multiAlert = { snapshot, alerts_count: alerts.length, note: 'snapshot-only' };
                } else {
                    multiAlert = { skipped: true, reason: 'no-alerts' };
                }
            }
        } catch (alertErr) {
            console.warn('[dunning] multi-alert snapshot during cron failed:', alertErr.message);
            multiAlert = { error: alertErr.message };
        }

        await logCronRun({
            endpoint: 'sync-paid',
            status: 'ok',
            summary: { source, ...result, multi_alert: multiAlert },
            startedMs,
        });
        res.json({ ok: true, ...result, multi_alert: multiAlert });
    } catch (err) {
        console.error('[dunning] cron/sync-paid error:', err);
        await logCronRun({
            endpoint: 'sync-paid',
            status: 'error',
            reason: String(err.message || err).slice(0, 300),
            summary: { source },
            startedMs,
        });
        res.status(500).json({ error: err.message });
    }
}
router.get('/cron/sync-paid', requireCronSecret, cronSyncPaidHandler);
router.post('/cron/sync-paid', requireCronSecret, cronSyncPaidHandler);


// ── GET /dunning/track/open/:reminderId.gif ─────────────────────────────
// Endpoint PÚBLICO (sin auth) — cuando el gestor de correo del destinatario
// carga el pixel invisible del email, registramos la apertura. Devuelve
// siempre un GIF 1x1 transparente aunque el UUID no exista, para no filtrar
// información al escáner ni romper el pipe si nos toca un reminder borrado.
const TRANSPARENT_GIF = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
);
router.get('/track/open/:reminderId.gif', async (req, res) => {
    // Servimos el pixel PRIMERO, registramos DESPUÉS. Así, un fallo de BD
    // no rompe la carga del email ni deja pixels rotos.
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).end(TRANSPARENT_GIF);

    const raw = String(req.params.reminderId || '');
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(raw)) return;

    try {
        // Leemos primero para incrementar open_count sin RPC (Supabase no
        // permite bump nativo desde el cliente sin función).
        const { data: current } = await supabase
            .from('dunning_reminders').select('open_count, first_opened_at')
            .eq('id', raw).maybeSingle();
        if (!current) return;
        const nowIso = new Date().toISOString();
        await supabase.from('dunning_reminders').update({
            first_opened_at: current.first_opened_at || nowIso,
            last_opened_at: nowIso,
            open_count: (current.open_count || 0) + 1,
        }).eq('id', raw);
    } catch (err) {
        console.warn('[dunning] track/open failed:', err.message);
    }
});


// ── Lógica compartida: ejecución de envíos y sync-paid ──────────────────────
// Se llama desde el endpoint superadmin `/run` y desde `/cron/run`.
// (Function declarations están hoisted, se pueden usar desde arriba.)

function computeBaseUrl(req) {
    if (!req) return null;
    const host = req.get?.('host');
    if (!host) return null;
    const proto = req.get?.('x-forwarded-proto') || req.protocol || 'https';
    return `${proto}://${host}`;
}

async function executeSend({ dryRun = false, forcedConfig = null, baseUrl = null }) {
    const { plan, config, templates } = await buildDunningPlan({ supabase });
    const activeConfig = forcedConfig || config;

    const tplByLevel = new Map();
    for (const t of templates) if (t.active && !tplByLevel.has(t.level)) tplByLevel.set(t.level, t);

    const { data: overridesRows } = await supabase
        .from('dunning_email_overrides').select('contact_id, override_email, override_cc_emails');
    const overrideByContact = new Map((overridesRows || []).map(o => [o.contact_id, o.override_email]));
    const overrideCcByContact = new Map((overridesRows || []).map(o => [o.contact_id, o.override_cc_emails || []]));

    // CC globales del config (siempre visibles). En modo prueba los suprimimos
    // — un email de test no debe copiar a terceros aunque estén configurados.
    const globalCcEmails = activeConfig.test_mode
        ? []
        : sanitizeEmailList(activeConfig.cc_emails);

    const results = [];
    const toSend = plan.filter(p => p.action === 'send');

    for (const item of toSend) {
        const template = tplByLevel.get(item.level);
        if (!template) {
            results.push({
                invoice_id: item.invoice.id,
                invoice_number: item.invoice.invoice_number,
                contact_name: item.invoice.contact_name,
                status: 'skipped',
                reason: 'no-template',
            });
            continue;
        }
        const originalEmail = item.invoice.contact_email;
        const overrideEmail = overrideByContact.get(item.invoice.contact_id);
        let destEmail = originalEmail;
        let redirect_reason = null;
        if (activeConfig.test_mode && activeConfig.test_mode_email) {
            destEmail = activeConfig.test_mode_email;
            redirect_reason = 'test_mode';
        } else if (overrideEmail) {
            destEmail = overrideEmail;
            redirect_reason = 'override';
        }
        if (!destEmail) {
            results.push({
                invoice_id: item.invoice.id,
                invoice_number: item.invoice.invoice_number,
                contact_name: item.invoice.contact_name,
                status: 'skipped',
                reason: 'no-email',
            });
            continue;
        }
        if (dryRun) {
            const dryOverrideCcList = activeConfig.test_mode
                ? []
                : sanitizeEmailList(overrideCcByContact.get(item.invoice.contact_id));
            const dryCcList = sanitizeEmailList(
                [...globalCcEmails, ...dryOverrideCcList],
                destEmail,
            );
            results.push({
                invoice_id: item.invoice.id,
                invoice_number: item.invoice.invoice_number,
                contact_name: item.invoice.contact_name,
                status: 'would-send',
                level: item.level,
                to: destEmail,
                cc: dryCcList,
                original_to: originalEmail,
                redirect_reason,
            });
            continue;
        }

        try {
            const isTestEnvio = !!redirect_reason;
            const { data: caseRow, error: caseErr } = await supabase
                .from('dunning_cases')
                .upsert({
                    invoice_id: item.invoice.id,
                    invoice_number: item.invoice.invoice_number,
                    contact_id: item.invoice.contact_id,
                    contact_name: item.invoice.contact_name,
                    contact_email: item.invoice.contact_email,
                    amount: item.invoice.amount,
                    currency: item.invoice.currency,
                    invoice_date: item.invoice.invoice_date ? new Date(item.invoice.invoice_date).toISOString() : null,
                    due_date: item.invoice.due_date ? new Date(item.invoice.due_date).toISOString() : null,
                    status: 'open',
                    is_test: isTestEnvio,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'invoice_id' })
                .select().single();
            if (caseErr) throw new Error(caseErr.message);

            let stripe_session_id = null;
            let stripe_url = null;
            if (isStripeConfigured() && Number(item.invoice.amount) > 0) {
                try {
                    const session = await createCheckoutSession({
                        amountCents: Math.round(Number(item.invoice.amount) * 100),
                        currency: (item.invoice.currency || 'EUR').toLowerCase(),
                        concept: `Factura ${item.invoice.invoice_number || item.invoice.id}`,
                        customerEmail: item.invoice.contact_email,
                        metadata: {
                            source: 'dunning',
                            dunning_level: String(item.level),
                            holded_invoice_id: item.invoice.id,
                            holded_doc_number: item.invoice.invoice_number || '',
                            days_overdue: String(item.days_overdue),
                        },
                    });
                    stripe_session_id = session.id;
                    stripe_url = session.url;
                } catch (stripeErr) {
                    console.warn('[dunning] Stripe checkout failed:', stripeErr.message);
                }
            }

            // Pre-generamos el id del reminder para poder inyectar en el email
            // un pixel de tracking que apunte a /dunning/track/open/:id.gif y
            // saber si el destinatario abrió el correo. Necesitamos baseUrl
            // para construir la URL pública absoluta (si no lo tenemos, la
            // apertura no se puede medir). Se registra igual en modo prueba,
            // para poder validar end-to-end sin arriesgar.
            const reminderId = crypto.randomUUID();
            const trackingPixelUrl = baseUrl
                ? `${baseUrl}/api/admin/dunning/track/open/${reminderId}.gif`
                : null;

            const rendered = renderDunningEmailV2({
                config: activeConfig,
                base_url: baseUrl,
                template,
                invoice: {
                    contact_name: item.invoice.contact_name,
                    invoice_number: item.invoice.invoice_number,
                    invoice_date: item.invoice.invoice_date ? new Date(item.invoice.invoice_date).toLocaleDateString('es-ES') : '',
                    due_date: item.invoice.due_date ? new Date(item.invoice.due_date).toLocaleDateString('es-ES') : '',
                    days_overdue: item.days_overdue,
                    amount: item.invoice.amount,
                    currency: item.invoice.currency || 'EUR',
                },
                stripe_url,
                test_context: redirect_reason ? {
                    original_email: originalEmail,
                    contact_name: item.invoice.contact_name,
                } : null,
                tracking_pixel_url: trackingPixelUrl,
            });

            // CC efectivo: globales + los específicos del contacto, deduplicado
            // y excluyendo la dirección destino para no dispararle dos copias.
            // En modo prueba no metemos CC — solo debe llegar al email de test.
            const overrideCcList = activeConfig.test_mode
                ? []
                : sanitizeEmailList(overrideCcByContact.get(item.invoice.contact_id));
            const ccList = sanitizeEmailList(
                [...globalCcEmails, ...overrideCcList],
                destEmail,
            );

            const info = await getTransporter().sendMail({
                from: `"Immoral Finance" <${process.env.SMTP_USER}>`,
                to: destEmail,
                cc: ccList.length ? ccList : undefined,
                bcc: activeConfig.bcc_email || undefined,
                subject: redirect_reason ? `[${redirect_reason === 'test_mode' ? 'PRUEBA' : 'REDIRIGIDO'}] ${rendered.subject}` : rendered.subject,
                html: rendered.html,
            });

            await supabase.from('dunning_reminders').insert({
                id: reminderId,
                case_id: caseRow.id,
                invoice_id: item.invoice.id,
                level: item.level,
                template_id: template.id,
                days_overdue: item.days_overdue,
                sent_to: destEmail,
                cc_emails: ccList,
                subject: rendered.subject,
                body_html_snapshot: rendered.html,
                smtp_message_id: info.messageId || null,
                stripe_session_id,
                stripe_payment_url: stripe_url,
                status: 'sent',
                is_test: isTestEnvio,
            });

            await supabase.from('dunning_cases').update({
                reminders_count: (caseRow.reminders_count || 0) + 1,
                last_reminder_at: new Date().toISOString(),
                last_reminder_level: item.level,
                first_reminder_at: caseRow.first_reminder_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }).eq('id', caseRow.id);

            results.push({
                invoice_id: item.invoice.id,
                invoice_number: item.invoice.invoice_number,
                contact_name: item.invoice.contact_name,
                status: 'sent',
                level: item.level,
                to: destEmail,
                cc: ccList,
                original_to: originalEmail,
                redirect_reason,
            });
        } catch (sendErr) {
            console.error('[dunning] send failed for invoice', item.invoice.id, sendErr);
            try {
                const { data: caseRow } = await supabase
                    .from('dunning_cases').select('id').eq('invoice_id', item.invoice.id).maybeSingle();
                if (caseRow) {
                    await supabase.from('dunning_reminders').insert({
                        case_id: caseRow.id,
                        invoice_id: item.invoice.id,
                        level: item.level,
                        template_id: template.id,
                        days_overdue: item.days_overdue,
                        sent_to: item.invoice.contact_email || 'unknown',
                        status: 'failed',
                        error_message: String(sendErr.message || sendErr).slice(0, 500),
                    });
                }
            } catch { /* ignore */ }
            results.push({
                invoice_id: item.invoice.id,
                invoice_number: item.invoice.invoice_number,
                contact_name: item.invoice.contact_name,
                status: 'failed',
                error: String(sendErr.message || sendErr),
            });
        }
    }

    // También devolvemos los items del plan que se saltaron con su motivo, para
    // que la UI y el log expliquen POR QUÉ solo se enviaron N de M vencidas.
    // Antes solo llegaban al summary agregado ("will_skip: 10") sin detalle.
    const skippedItems = plan
        .filter(p => p.action === 'skip')
        .map(p => ({
            invoice_id: p.invoice.id,
            invoice_number: p.invoice.invoice_number,
            contact_name: p.invoice.contact_name,
            level: p.level,
            days_overdue: p.days_overdue,
            reason: p.reason,
        }));

    return {
        dry_run: dryRun,
        summary: summarizePlan(plan),
        executed: results,
        plan_skipped: skippedItems,
    };
}

// ── Alertas de clientes con múltiples facturas vencidas ────────────────
// Agrupa las facturas vencidas por contacto y devuelve los que superan el
// umbral (>=2 por defecto). Reutiliza la misma fuente (Holded live) que
// /overdue-invoices para que app y email digan lo mismo.
async function computeMultiOverdueAlerts({ config, now = Date.now() }) {
    const [holdedInvoices, holdedContacts] = await Promise.all([
        holdedFetch('/documents/invoice?paid=0'),
        holdedFetch('/contacts').catch(err => { console.warn('[dunning] no /contacts:', err.message); return []; }),
    ]);
    const invoices = Array.isArray(holdedInvoices) ? holdedInvoices : [];
    const emailByContact = new Map();
    for (const c of (Array.isArray(holdedContacts) ? holdedContacts : [])) {
        if (c.id && c.email) emailByContact.set(c.id, c.email);
    }

    const byContact = new Map();
    for (const inv of invoices) {
        const dueMs = normalizeTimestamp(inv.dueDate);
        if (!dueMs) continue;
        const daysOverdue = Math.floor((now - dueMs) / 86_400_000);
        if (daysOverdue < 1) continue;
        const total = Number(inv.total || 0);
        if (total < Number(config.min_amount || 0)) continue;
        if ((config.excluded_contact_ids || []).includes(inv.contact)) continue;

        const key = inv.contact || inv.contactName || 'unknown';
        if (!byContact.has(key)) {
            byContact.set(key, {
                contact_id: inv.contact || '',
                contact_name: inv.contactName || '',
                contact_email: inv.contactEmail || inv.email || emailByContact.get(inv.contact) || '',
                invoices: [],
                total_amount: 0,
            });
        }
        const bucket = byContact.get(key);
        bucket.invoices.push({
            invoice_id: inv.id,
            invoice_number: inv.docNumber || inv.num || '',
            amount: total,
            currency: inv.currency || 'EUR',
            days_overdue: daysOverdue,
            due_date: dueMs,
        });
        bucket.total_amount += total;
    }

    const threshold = Math.max(2, Number(config.multi_alert_threshold || 2));
    const alerts = [];
    for (const bucket of byContact.values()) {
        if (bucket.invoices.length < threshold) continue;
        bucket.invoices.sort((a, b) => b.days_overdue - a.days_overdue);
        alerts.push({
            ...bucket,
            invoice_count: bucket.invoices.length,
            max_days_overdue: bucket.invoices[0]?.days_overdue || 0,
        });
    }
    alerts.sort((a, b) => b.invoice_count - a.invoice_count || b.total_amount - a.total_amount);
    return { alerts, threshold };
}

function renderMultiOverdueEmail({ alerts, threshold, appUrl }) {
    const fmt = (n, cur = 'EUR') => new Intl.NumberFormat('es-ES', {
        style: 'currency', currency: cur, maximumFractionDigits: 2,
    }).format(Number(n || 0));
    const totalOverall = alerts.reduce((s, a) => s + Number(a.total_amount || 0), 0);
    const totalInvoices = alerts.reduce((s, a) => s + a.invoice_count, 0);

    const clientRows = alerts.map(a => `
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#111827;">
                ${escapeHtml(a.contact_name || '(sin nombre)')}
                ${a.contact_email ? `<div style="font-weight:400;color:#6b7280;font-size:12px;">${escapeHtml(a.contact_email)}</div>` : ''}
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
                <span style="display:inline-block;background:#fee2e2;color:#b91c1c;padding:2px 10px;border-radius:999px;font-weight:700;font-size:13px;">
                    ${a.invoice_count} facturas
                </span>
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:#111827;">
                ${fmt(a.total_amount)}
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#b45309;font-weight:600;">
                ${a.max_days_overdue} días
            </td>
        </tr>`).join('');

    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
        <div style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <div style="background:linear-gradient(135deg,#dc2626,#991b1b);padding:20px 24px;color:#fff;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;opacity:0.85;">Alerta de impagos</div>
                <div style="font-size:20px;font-weight:700;margin-top:4px;">
                    ${alerts.length} cliente${alerts.length === 1 ? '' : 's'} con ${threshold}+ facturas vencidas
                </div>
                <div style="font-size:13px;opacity:0.9;margin-top:2px;">
                    ${totalInvoices} facturas · ${fmt(totalOverall)} totales
                </div>
            </div>
            <div style="padding:20px 24px;color:#374151;font-size:14px;line-height:1.5;">
                <p style="margin:0 0 16px;">
                    Los siguientes clientes acumulan ${threshold} o más facturas vencidas simultáneamente. Revisa el módulo Impagos para gestionar recordatorios y contactos:
                </p>
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead>
                        <tr style="background:#f9fafb;">
                            <th style="padding:8px 12px;text-align:left;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Cliente</th>
                            <th style="padding:8px 12px;text-align:center;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Facturas</th>
                            <th style="padding:8px 12px;text-align:right;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Deuda</th>
                            <th style="padding:8px 12px;text-align:center;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Máx. vencido</th>
                        </tr>
                    </thead>
                    <tbody>${clientRows}</tbody>
                </table>
                ${appUrl ? `
                <div style="text-align:center;margin-top:24px;">
                    <a href="${appUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                        Abrir módulo Impagos
                    </a>
                </div>` : ''}
            </div>
            <div style="padding:12px 24px;background:#f9fafb;color:#9ca3af;font-size:11px;text-align:center;">
                Aviso automático de Immoral Finance · Umbral configurado: ${threshold}+ facturas por cliente
            </div>
        </div>
    </div>
</body></html>`;
    // Asunto natural, sin corchetes ni tecnicismos, adaptado a si es un solo
    // cliente o varios — así la bandeja de entrada se lee bien de un vistazo.
    const subject = alerts.length === 1
        ? `Alerta de impagos · ${alerts[0].contact_name || 'un cliente'} acumula ${alerts[0].invoice_count} facturas vencidas`
        : `Alerta de impagos · ${alerts.length} clientes con facturas vencidas pendientes`;
    return { html, subject };
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
}

// Envía el email a los destinatarios configurados. Registra last_sent_at
// y summary aunque falle parcialmente. No dispara si to+cc están vacíos.
async function sendMultiOverdueEmail({ alerts, config, baseUrl }) {
    if (!alerts.length) return { skipped: true, reason: 'no-alerts' };
    if (!process.env.SMTP_USER) return { skipped: true, reason: 'smtp-not-configured' };

    const toEmail = (config.multi_alert_to || '').trim();
    const ccList = sanitizeEmailList(config.multi_alert_cc_emails, toEmail);
    if (!toEmail && ccList.length === 0) {
        return { skipped: true, reason: 'no-recipients' };
    }

    const { html, subject } = renderMultiOverdueEmail({
        alerts,
        threshold: Math.max(2, Number(config.multi_alert_threshold || 2)),
        appUrl: baseUrl ? `${baseUrl.replace(/\/+$/, '')}/payments/dunning` : null,
    });

    const info = await getTransporter().sendMail({
        from: `"Immoral Finance" <${process.env.SMTP_USER}>`,
        to: toEmail || ccList[0],
        cc: (toEmail && ccList.length ? ccList : (toEmail ? undefined : ccList.slice(1))) || undefined,
        subject,
        html,
    });
    return {
        sent: true,
        message_id: info.messageId || null,
        to: toEmail || ccList[0],
        cc: (toEmail ? ccList : ccList.slice(1)),
        alerts_count: alerts.length,
    };
}

// Persiste un snapshot por cliente en dunning_multi_alert_history. Idempotente
// gracias al índice único (contact_id, ran_date): si el cron corre dos veces
// el mismo día, la segunda actualiza en vez de duplicar. `emailSent` marca
// si el correo salió realmente (para no confundir "hubo alerta" con "hubo email").
async function snapshotMultiOverdueAlerts({ alerts, emailSent = false }) {
    if (!alerts.length) return 0;
    const rows = alerts.map(a => ({
        contact_id: a.contact_id || null,
        contact_name: a.contact_name || null,
        contact_email: a.contact_email || null,
        invoice_count: a.invoice_count,
        max_days_overdue: a.max_days_overdue,
        total_amount: a.total_amount,
        currency: a.invoices?.[0]?.currency || 'EUR',
        invoices: a.invoices || [],
        email_sent: !!emailSent,
    }));
    const { error, count } = await supabase
        .from('dunning_multi_alert_history')
        .upsert(rows, { onConflict: 'contact_id,ran_date', count: 'exact' });
    if (error) {
        console.warn('[dunning] snapshotMultiOverdueAlerts failed:', error.message);
        return 0;
    }
    return count || rows.length;
}

// Devuelve el día de la semana (0=domingo … 6=sábado) y hora actual en la
// zona horaria del config. Se usa para respetar `multi_alert_send_days` y
// `multi_alert_send_hour` de forma consistente con lo que ven los usuarios.
function currentTimeInTz(config, now = new Date()) {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: config.timezone || 'Europe/Madrid',
            weekday: 'short',
            hour: 'numeric',
            hour12: false,
        }).formatToParts(now);
        const short = parts.find(p => p.type === 'weekday')?.value || '';
        const MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const weekday = MAP[short] ?? now.getDay();
        const hour = Number(parts.find(p => p.type === 'hour')?.value ?? now.getHours());
        return { weekday, hour };
    } catch { return { weekday: now.getDay(), hour: now.getHours() }; }
}

// Compat: usado por otras funciones internas.
function currentWeekday(config, now = new Date()) {
    return currentTimeInTz(config, now).weekday;
}

// Verifica si toca disparar la alerta multi-vencida ahora, compone el envío y
// persiste snapshot. Devuelve el resultado para logging. No lanza — cualquier
// error se captura en el caller para no romper el resto del cron.
async function maybeDispatchMultiAlert({ config, baseUrl, force = false }) {
    if (!config?.multi_alert_enabled) return { skipped: true, reason: 'disabled' };
    const { weekday, hour } = currentTimeInTz(config);
    const sendDays = Array.isArray(config.multi_alert_send_days) ? config.multi_alert_send_days : [];
    const sendHour = Number(config.multi_alert_send_hour ?? 9);
    const lastSent = config.multi_alert_last_sent_at ? new Date(config.multi_alert_last_sent_at).getTime() : 0;
    const sentRecently = Date.now() - lastSent < 20 * 60 * 60 * 1000;

    if (!force) {
        if (!sendDays.includes(weekday)) return { skipped: true, reason: 'not-send-day', weekday };
        if (hour !== sendHour) return { skipped: true, reason: 'not-send-hour', hour, expected: sendHour };
        if (sentRecently) return { skipped: true, reason: 'sent-recently' };
    }

    const { alerts, threshold } = await computeMultiOverdueAlerts({ config });
    if (!alerts.length) return { skipped: true, reason: 'no-alerts' };

    const sendResult = await sendMultiOverdueEmail({ alerts, config, baseUrl });
    // El anti-spam solo cuenta envíos automáticos. Un envío manual (force) no
    // debe bloquear el próximo tick del cron — si el usuario prueba a las 22h,
    // el auto de las 9h del día siguiente debe seguir saliendo.
    if (sendResult.sent && !force) {
        await supabase.from('dunning_config').update({
            multi_alert_last_sent_at: new Date().toISOString(),
            multi_alert_last_summary: {
                alerts_count: alerts.length,
                threshold,
                total_invoices: alerts.reduce((s, a) => s + a.invoice_count, 0),
                total_amount: alerts.reduce((s, a) => s + Number(a.total_amount || 0), 0),
            },
        }).eq('id', 1);
    }
    const snapshot = await snapshotMultiOverdueAlerts({ alerts, emailSent: !!sendResult.sent });
    return { ...sendResult, snapshot, alerts_count: alerts.length };
}

// ── Reporte de facturas vencidas ────────────────────────────────────────
// Devuelve la lista COMPLETA de facturas vencidas (>=1 día) con un cruce
// contra dunning_reminders para saber si ha salido recordatorio real.
async function computeOverdueReport({ config, now = Date.now() }) {
    const [holdedInvoices, holdedContacts] = await Promise.all([
        holdedFetch('/documents/invoice?paid=0'),
        holdedFetch('/contacts').catch(() => []),
    ]);
    const invoices = Array.isArray(holdedInvoices) ? holdedInvoices : [];
    const emailByContact = new Map();
    for (const c of (Array.isArray(holdedContacts) ? holdedContacts : [])) {
        if (c.id && c.email) emailByContact.set(c.id, c.email);
    }

    const overdue = [];
    for (const inv of invoices) {
        const dueMs = normalizeTimestamp(inv.dueDate);
        if (!dueMs) continue;
        const daysOverdue = Math.floor((now - dueMs) / 86_400_000);
        if (daysOverdue < 1) continue;
        const total = Number(inv.total || 0);
        if (total < Number(config.min_amount || 0)) continue;
        if ((config.excluded_contact_ids || []).includes(inv.contact)) continue;
        overdue.push({
            invoice_id: inv.id,
            invoice_number: inv.docNumber || inv.num || '',
            contact_id: inv.contact || '',
            contact_name: inv.contactName || '',
            contact_email: inv.contactEmail || inv.email || emailByContact.get(inv.contact) || '',
            amount: total,
            currency: inv.currency || 'EUR',
            invoice_date: normalizeTimestamp(inv.date),
            due_date: dueMs,
            days_overdue: daysOverdue,
        });
    }
    overdue.sort((a, b) => b.days_overdue - a.days_overdue);

    // Cruce con dunning_reminders para saber si ya salió recordatorio real
    // (no test) por factura. Guardamos el último enviado por invoice_id.
    const invoiceIds = overdue.map(o => o.invoice_id);
    const remindersByInvoice = new Map();
    if (invoiceIds.length) {
        const { data: rem } = await supabase
            .from('dunning_reminders')
            .select('invoice_id, level, sent_at, status')
            .in('invoice_id', invoiceIds)
            .eq('status', 'sent')
            .eq('is_test', false)
            .order('sent_at', { ascending: false });
        for (const r of rem || []) {
            if (!remindersByInvoice.has(r.invoice_id)) {
                remindersByInvoice.set(r.invoice_id, r);
            }
        }
    }
    for (const o of overdue) {
        const rem = remindersByInvoice.get(o.invoice_id);
        o.reminder_sent = !!rem;
        o.reminder_level = rem?.level || null;
        o.reminder_sent_at = rem?.sent_at || null;
    }

    const critLevel = Number(config.level_3_days_min || 15);
    return {
        invoices: overdue,
        total_count: overdue.length,
        total_amount: overdue.reduce((s, o) => s + Number(o.amount || 0), 0),
        critical_threshold: critLevel,
    };
}

function renderOverdueReportEmail({ report, config, appUrl }) {
    const fmt = (n) => new Intl.NumberFormat('es-ES', {
        style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
    }).format(Number(n || 0));
    const dateFmt = (ms) => {
        if (!ms) return '—';
        try { return new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
        catch { return '—'; }
    };
    const critLevel = report.critical_threshold;
    const criticalCount = report.invoices.filter(i => i.days_overdue >= critLevel).length;
    const warningCount = report.total_count - criticalCount;
    const remindedCount = report.invoices.filter(i => i.reminder_sent).length;

    // Filas compactas: padding vertical mínimo, tipografías uniformes.
    // Objetivo: caben 20-25 filas sin scroll en pantalla estándar.
    const rows = report.invoices.map((inv, idx) => {
        const isCritical = inv.days_overdue >= critLevel;
        const zebra = idx % 2 === 0 ? '#ffffff' : '#fafbfc';
        const badgeBg = isCritical ? '#dc2626' : '#f59e0b';
        const badgeLabel = isCritical ? 'CRÍTICO' : 'WARNING';
        const daysColor = isCritical ? '#b91c1c' : '#b45309';
        const reminderCell = inv.reminder_sent
            ? `<span style="color:#059669;font-weight:600;">✓ Sí${inv.reminder_level ? ` · N${inv.reminder_level}` : ''}</span>`
            : `<span style="color:#9ca3af;">No</span>`;
        return `
            <tr style="background:${zebra};">
                <td style="padding:8px 14px;border-bottom:1px solid #f1f3f5;color:#111827;font-size:13px;font-weight:600;">${escapeHtml(inv.contact_name || '(sin nombre)')}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f1f3f5;color:#4b5563;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;font-size:12.5px;white-space:nowrap;">${escapeHtml(inv.invoice_number || '')}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f1f3f5;color:#6b7280;font-size:12.5px;white-space:nowrap;">${dateFmt(inv.invoice_date)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f1f3f5;color:#6b7280;font-size:12.5px;white-space:nowrap;">${dateFmt(inv.due_date)}</td>
                <td style="padding:8px 14px;border-bottom:1px solid #f1f3f5;color:#111827;text-align:right;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap;">${fmt(inv.amount)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #f1f3f5;text-align:center;font-weight:800;font-size:14px;color:${daysColor};font-variant-numeric:tabular-nums;">${inv.days_overdue}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #f1f3f5;text-align:center;">
                    <span style="display:inline-block;background:${badgeBg};color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;font-size:10.5px;letter-spacing:0.4px;">${badgeLabel}</span>
                </td>
                <td style="padding:8px 12px;border-bottom:1px solid #f1f3f5;text-align:center;font-size:12.5px;">${reminderCell}</td>
            </tr>`;
    }).join('');

    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111827;">
    <div style="max-width:1100px;margin:0 auto;padding:16px 12px;">
        <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

            <!-- Header -->
            <div style="padding:14px 20px 12px;border-bottom:1px solid #eef1f4;">
                <div style="font-size:18px;font-weight:700;color:#111827;line-height:1.2;">Relación de facturas vencidas</div>
                <div style="font-size:12px;color:#6b7280;margin-top:2px;">Corte del ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
            </div>

            <!-- KPIs en 4 columnas separadas -->
            <div style="padding:14px 20px;background:#fafbfc;border-bottom:1px solid #eef1f4;">
                <table style="width:100%;border-collapse:collapse;">
                    <tr>
                        <td style="padding-right:20px;">
                            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.7px;color:#6b7280;font-weight:600;margin-bottom:3px;">Total facturas</div>
                            <div style="font-size:20px;font-weight:800;color:#111827;line-height:1;">${report.total_count}</div>
                        </td>
                        <td style="padding:0 20px;border-left:1px solid #e5e7eb;">
                            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.7px;color:#6b7280;font-weight:600;margin-bottom:3px;">Total deuda</div>
                            <div style="font-size:20px;font-weight:800;color:#111827;line-height:1;font-variant-numeric:tabular-nums;">${fmt(report.total_amount)}</div>
                        </td>
                        <td style="padding:0 20px;border-left:1px solid #e5e7eb;">
                            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.7px;color:#6b7280;font-weight:600;margin-bottom:3px;">Estado</div>
                            <div style="font-size:14px;line-height:1.2;color:#111827;">
                                <span style="color:#dc2626;font-weight:700;">${criticalCount}</span> crítico${criticalCount === 1 ? '' : 's'} ·
                                <span style="color:#b45309;font-weight:700;">${warningCount}</span> warning
                            </div>
                        </td>
                        <td style="padding-left:20px;border-left:1px solid #e5e7eb;">
                            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.7px;color:#6b7280;font-weight:600;margin-bottom:3px;">Con recordatorio</div>
                            <div style="font-size:14px;line-height:1.2;color:#111827;">
                                <span style="color:#059669;font-weight:700;">${remindedCount}</span> / ${report.total_count} enviados
                            </div>
                        </td>
                    </tr>
                </table>
            </div>

            <!-- Tabla densa -->
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#1f2937;color:#fff;">
                        <th style="padding:9px 14px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Cliente</th>
                        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;white-space:nowrap;">Nº Factura</th>
                        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Emisión</th>
                        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Venc.</th>
                        <th style="padding:9px 14px;text-align:right;font-size:10.5px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Monto</th>
                        <th style="padding:9px 10px;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Días</th>
                        <th style="padding:9px 10px;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Estado</th>
                        <th style="padding:9px 12px;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Recordat.</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="8" style="padding:30px;text-align:center;color:#6b7280;font-size:13px;">Sin facturas vencidas ahora mismo.</td></tr>'}</tbody>
            </table>

            ${appUrl ? `
            <!-- CTA -->
            <div style="padding:16px 20px;background:#fafbfc;border-top:1px solid #eef1f4;text-align:center;">
                <a href="${appUrl}" style="display:inline-block;background:#111827;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;letter-spacing:0.2px;">
                    Abrir módulo Impagos →
                </a>
            </div>` : ''}

            <!-- Footer -->
            <div style="padding:8px 20px;background:#f3f4f6;border-top:1px solid #eef1f4;font-size:11px;color:#6b7280;text-align:center;">
                Reporte automático · Immoral Finance · Umbral crítico ≥ ${critLevel} días
            </div>
        </div>
    </div>
</body></html>`;

    const subject = `Relación de facturas vencidas · ${report.total_count} pendientes · ${fmt(report.total_amount)}`;
    return { html, subject };
}

async function sendOverdueReportEmail({ report, config, baseUrl }) {
    if (!process.env.SMTP_USER) return { skipped: true, reason: 'smtp-not-configured' };
    const toEmail = (config.overdue_report_to || '').trim();
    const ccList = sanitizeEmailList(config.overdue_report_cc_emails, toEmail);
    if (!toEmail && ccList.length === 0) return { skipped: true, reason: 'no-recipients' };

    const { html, subject } = renderOverdueReportEmail({
        report, config,
        appUrl: baseUrl ? `${baseUrl.replace(/\/+$/, '')}/payments/dunning` : null,
    });
    const info = await getTransporter().sendMail({
        from: `"Immoral Finance" <${process.env.SMTP_USER}>`,
        to: toEmail || ccList[0],
        cc: (toEmail && ccList.length ? ccList : (toEmail ? undefined : ccList.slice(1))) || undefined,
        subject,
        html,
    });
    return {
        sent: true,
        message_id: info.messageId || null,
        to: toEmail || ccList[0],
        cc: (toEmail ? ccList : ccList.slice(1)),
        total_count: report.total_count,
        total_amount: report.total_amount,
    };
}

async function maybeDispatchOverdueReport({ config, baseUrl, force = false }) {
    if (!config?.overdue_report_enabled) return { skipped: true, reason: 'disabled' };
    const { weekday, hour } = currentTimeInTz(config);
    const sendDays = Array.isArray(config.overdue_report_send_days) ? config.overdue_report_send_days : [];
    const sendHour = Number(config.overdue_report_send_hour ?? 10);
    const lastSent = config.overdue_report_last_sent_at ? new Date(config.overdue_report_last_sent_at).getTime() : 0;
    const sentRecently = Date.now() - lastSent < 20 * 60 * 60 * 1000;

    if (!force) {
        if (!sendDays.includes(weekday)) return { skipped: true, reason: 'not-send-day', weekday };
        if (hour !== sendHour) return { skipped: true, reason: 'not-send-hour', hour, expected: sendHour };
        if (sentRecently) return { skipped: true, reason: 'sent-recently' };
    }

    const report = await computeOverdueReport({ config });
    // Aunque no haya facturas se puede mandar (para dejar constancia "0 vencidas"),
    // pero por defecto omitimos: es más útil silenciar el ruido.
    if (report.total_count === 0 && !force) return { skipped: true, reason: 'no-overdue' };

    const sendResult = await sendOverdueReportEmail({ report, config, baseUrl });
    // Anti-spam solo para envíos automáticos. Un manual (force) no debe
    // bloquear el próximo tick del cron.
    if (sendResult.sent && !force) {
        await supabase.from('dunning_config').update({
            overdue_report_last_sent_at: new Date().toISOString(),
            overdue_report_last_summary: {
                total_count: report.total_count,
                total_amount: report.total_amount,
                with_reminder: report.invoices.filter(i => i.reminder_sent).length,
            },
        }).eq('id', 1);
    }
    return { ...sendResult, total_count: report.total_count };
}

async function runSyncPaid() {
    const { data: openCases, error } = await supabase
        .from('dunning_cases').select('*').eq('status', 'open');
    if (error) throw new Error(error.message);
    if (!openCases?.length) return { closed: 0, checked: 0 };

    const paidRes = await holdedFetch('/documents/invoice?paid=1');
    const paidIds = new Set((Array.isArray(paidRes) ? paidRes : []).map(inv => inv.id));

    let closed = 0;
    for (const c of openCases) {
        if (!paidIds.has(c.invoice_id)) continue;
        const nowIso = new Date().toISOString();
        const first = c.first_reminder_at ? new Date(c.first_reminder_at).getTime() : Date.now();
        const daysToPay = Math.max(0, Math.floor((Date.now() - first) / 86_400_000));
        await supabase.from('dunning_cases').update({
            status: 'paid',
            paid_at: nowIso,
            days_to_pay: daysToPay,
            updated_at: nowIso,
        }).eq('id', c.id);
        closed++;
    }
    return { checked: openCases.length, closed };
}


router.use(requireSuperAdmin);

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(fromMs, toMs) {
    return Math.floor((toMs - fromMs) / 86_400_000);
}

// Holded devuelve fechas como timestamps unix (segundos) en varios campos.
// dueDate es normalmente segundos, pero por seguridad detectamos milisegundos.
function normalizeTimestamp(ts) {
    if (!ts && ts !== 0) return null;
    const n = Number(ts);
    if (!Number.isFinite(n)) return null;
    return n > 1e12 ? n : n * 1000;
}

function classifyLevel(daysOverdue, config) {
    if (daysOverdue < config.level_1_days_min) return 0;
    if (daysOverdue <= config.level_1_days_max) return 1;
    if (daysOverdue <= config.level_2_days_max) return 2;
    return 3;
}

async function getConfig() {
    const { data, error } = await supabase
        .from('dunning_config')
        .select('*')
        .eq('id', 1)
        .single();
    if (error) throw new Error(error.message);
    return data;
}

// ── GET /dunning/config ───────────────────────────────────────────────────────
router.get('/config', async (_req, res) => {
    try {
        res.json({ config: await getConfig() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /dunning/config ───────────────────────────────────────────────────────
router.put('/config', async (req, res) => {
    try {
        const allowed = [
            'enabled', 'send_days', 'send_hour', 'send_minute', 'timezone',
            'level_1_days_min', 'level_1_days_max',
            'level_2_days_min', 'level_2_days_max', 'level_3_days_min',
            'level_3_repeat_every_days',
            'min_amount', 'excluded_contact_ids', 'bcc_email', 'cc_emails',
            // Fase 4 — alerta de clientes con múltiples vencidas
            'multi_alert_enabled', 'multi_alert_threshold', 'multi_alert_to', 'multi_alert_cc_emails',
            'multi_alert_send_days', 'multi_alert_send_hour',
            // Fase 4b — reporte periódico de vencidas
            'overdue_report_enabled', 'overdue_report_to', 'overdue_report_cc_emails',
            'overdue_report_send_days', 'overdue_report_send_hour',
            // Fase 3: marca + bancos + labels
            'brand_logo_text', 'brand_primary_color', 'brand_secondary_color',
            'signature_html', 'cta_stripe_label', 'cta_bank_prefix', 'status_label',
            'banks',
            // Fase 3.1: logo por URL + modo prueba dirigido
            'brand_logo_url', 'test_mode', 'test_mode_email',
            // Fase 3.3: toggle logo
            'show_logo',
        ];
        const patch = {};
        for (const k of allowed) if (k in req.body) patch[k] = req.body[k];

        // Los CC son visibles al cliente — no queremos guardar basura ahí.
        // Normalizamos siempre: recortamos, filtramos inválidos y deduplicamos.
        if ('cc_emails' in patch) {
            const cleaned = sanitizeEmailList(patch.cc_emails);
            if (Array.isArray(patch.cc_emails) && patch.cc_emails.some(v => v && !cleaned.includes(String(v).trim()))) {
                // Al menos una dirección de entrada era inválida — respondemos error
                // para que el usuario corrija en la UI en lugar de perder el dato.
                return res.status(400).json({
                    error: 'invalid-cc-emails',
                    hint: 'Alguna dirección de CC no es un email válido.',
                });
            }
            patch.cc_emails = cleaned;
        }

        // Alerta multi-vencida: mismos criterios de saneo.
        if ('multi_alert_cc_emails' in patch) {
            const cleaned = sanitizeEmailList(patch.multi_alert_cc_emails);
            if (Array.isArray(patch.multi_alert_cc_emails) && patch.multi_alert_cc_emails.some(v => v && !cleaned.includes(String(v).trim()))) {
                return res.status(400).json({
                    error: 'invalid-multi-alert-cc',
                    hint: 'Alguna dirección de CC de la alerta no es un email válido.',
                });
            }
            patch.multi_alert_cc_emails = cleaned;
        }
        if ('multi_alert_to' in patch) {
            const to = String(patch.multi_alert_to || '').trim();
            if (to && !EMAIL_RE.test(to)) {
                return res.status(400).json({
                    error: 'invalid-multi-alert-to',
                    hint: 'El destinatario principal de la alerta no es un email válido.',
                });
            }
            patch.multi_alert_to = to || null;
        }
        if ('multi_alert_threshold' in patch) {
            const t = Number(patch.multi_alert_threshold);
            if (!Number.isFinite(t) || t < 2) {
                return res.status(400).json({
                    error: 'invalid-multi-alert-threshold',
                    hint: 'El umbral tiene que ser un entero mayor o igual a 2.',
                });
            }
            patch.multi_alert_threshold = Math.floor(t);
        }
        if ('multi_alert_send_hour' in patch) {
            const h = Number(patch.multi_alert_send_hour);
            if (!Number.isInteger(h) || h < 0 || h > 23) {
                return res.status(400).json({
                    error: 'invalid-multi-alert-send-hour',
                    hint: 'La hora tiene que ser un entero entre 0 y 23.',
                });
            }
            patch.multi_alert_send_hour = h;
        }

        // Reporte de vencidas: mismas validaciones que la alerta.
        if ('overdue_report_cc_emails' in patch) {
            const cleaned = sanitizeEmailList(patch.overdue_report_cc_emails);
            if (Array.isArray(patch.overdue_report_cc_emails) && patch.overdue_report_cc_emails.some(v => v && !cleaned.includes(String(v).trim()))) {
                return res.status(400).json({
                    error: 'invalid-overdue-report-cc',
                    hint: 'Alguna dirección de CC del reporte no es un email válido.',
                });
            }
            patch.overdue_report_cc_emails = cleaned;
        }
        if ('overdue_report_to' in patch) {
            const to = String(patch.overdue_report_to || '').trim();
            if (to && !EMAIL_RE.test(to)) {
                return res.status(400).json({
                    error: 'invalid-overdue-report-to',
                    hint: 'El destinatario principal del reporte no es un email válido.',
                });
            }
            patch.overdue_report_to = to || null;
        }
        if ('overdue_report_send_hour' in patch) {
            const h = Number(patch.overdue_report_send_hour);
            if (!Number.isInteger(h) || h < 0 || h > 23) {
                return res.status(400).json({
                    error: 'invalid-overdue-report-send-hour',
                    hint: 'La hora del reporte tiene que ser un entero entre 0 y 23.',
                });
            }
            patch.overdue_report_send_hour = h;
        }

        patch.updated_at = new Date().toISOString();
        patch.updated_by = req.userId;

        const { data, error } = await supabase
            .from('dunning_config')
            .update(patch)
            .eq('id', 1)
            .select()
            .single();
        if (error) throw new Error(error.message);
        res.json({ config: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/templates ────────────────────────────────────────────────────
router.get('/templates', async (req, res) => {
    try {
        let q = supabase.from('dunning_templates').select('*').order('level').order('created_at');
        if (req.query.level) q = q.eq('level', Number(req.query.level));
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        res.json({ templates: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /dunning/templates/:id ────────────────────────────────────────────────
router.put('/templates/:id', async (req, res) => {
    try {
        const allowed = ['name', 'subject', 'blocks', 'active',
            'hero_title', 'hero_subtitle', 'intro_copy', 'outro_copy'];
        const patch = {};
        for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
        patch.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('dunning_templates')
            .update(patch)
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        res.json({ template: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /dunning/preview ─────────────────────────────────────────────────────
// (LEGACY) Renderiza HTML a partir de bloques + subject con SAMPLE_VARS. Mantengo
// para compatibilidad con el editor por bloques, aunque el flujo por defecto es V2.
router.post('/preview', (req, res) => {
    try {
        const { blocks = [], subject = '', vars } = req.body || {};
        const rendered = renderDunningEmail({
            blocks,
            subject,
            vars: { ...SAMPLE_VARS, ...(vars || {}) },
        });
        res.json({ ...rendered, sample_vars: SAMPLE_VARS });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /dunning/preview-v2 ──────────────────────────────────────────────────
// Renderiza el diseño premium con el config + template dados (o los de BD si no).
// Body: { template?: {...}, config?: {...}, invoice?: {...}, stripe_url?: string }
// Si no se pasa template/config, se cargan de BD.
router.post('/preview-v2', async (req, res) => {
    try {
        let template = req.body?.template;
        let config = req.body?.config;

        if (!template && req.body?.template_id) {
            const { data } = await supabase.from('dunning_templates')
                .select('*').eq('id', req.body.template_id).single();
            template = data;
        }
        if (!template && req.body?.level) {
            const { data } = await supabase.from('dunning_templates')
                .select('*').eq('level', req.body.level).eq('active', true).limit(1).single();
            template = data;
        }
        if (!config) {
            const { data } = await supabase.from('dunning_config').select('*').eq('id', 1).single();
            config = data;
        }

        if (!template || !config) {
            return res.status(400).json({ error: 'missing-template-or-config' });
        }

        const invoice = { ...SAMPLE_INVOICE, ...(req.body?.invoice || {}) };
        // Preview usa una URL simulada. En envío real se genera Stripe live.
        const stripe_url = req.body?.stripe_url || 'https://checkout.stripe.com/preview';

        const rendered = renderDunningEmailV2({ config, template, invoice, stripe_url, base_url: computeBaseUrl(req) });
        res.json({ ...rendered, sample_invoice: SAMPLE_INVOICE });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/overdue-invoices ─────────────────────────────────────────────
// Lee facturas pendientes en Holded, filtra las vencidas, calcula días vencidos
// y nivel sugerido. Cruza con dunning_cases para saber cuántos recordatorios ya
// se han enviado.
router.get('/overdue-invoices', async (_req, res) => {
    try {
        const config = await getConfig();
        const [holdedInvoices, holdedContacts] = await Promise.all([
            holdedFetch('/documents/invoice?paid=0'),
            holdedFetch('/contacts').catch(err => { console.warn('[dunning] no /contacts:', err.message); return []; }),
        ]);
        const invoices = Array.isArray(holdedInvoices) ? holdedInvoices : [];
        const now = Date.now();

        // Mapa contact_id → email (Holded no incluye email en /documents/invoice).
        const emailByContact = new Map();
        for (const c of (Array.isArray(holdedContacts) ? holdedContacts : [])) {
            if (c.id && c.email) emailByContact.set(c.id, c.email);
        }

        // Cargar casos existentes en un solo query para cruzar.
        // Ignoramos los casos marcados is_test=true: no queremos que envíos de
        // prueba ensucien el "último recordatorio" de una factura viva. Los
        // KPIs del dashboard filtran igual — así ambos sitios son coherentes.
        const ids = invoices.map(i => i.id).filter(Boolean);
        const { data: cases } = ids.length
            ? await supabase.from('dunning_cases').select('*').in('invoice_id', ids).eq('is_test', false)
            : { data: [] };
        const caseByInvoice = new Map((cases || []).map(c => [c.invoice_id, c]));

        const overdue = [];
        for (const inv of invoices) {
            const dueMs = normalizeTimestamp(inv.dueDate);
            if (!dueMs) continue;
            const daysOverdue = daysBetween(dueMs, now);
            // Mostramos TODAS las vencidas (>=1 día). Las que aún no llegan al
            // umbral del nivel 1 aparecen con suggested_level=0 ("Sin nivel"):
            // se ven en la lista pero el motor no les envía recordatorio hasta
            // que crucen level_1_days_min.
            if (daysOverdue < 1) continue;

            // Filtros de configuración
            const total = Number(inv.total || 0);
            if (total < Number(config.min_amount || 0)) continue;
            if ((config.excluded_contact_ids || []).includes(inv.contact)) continue;

            const level = classifyLevel(daysOverdue, config);
            const existingCase = caseByInvoice.get(inv.id);
            const contactEmail = inv.contactEmail || inv.email || emailByContact.get(inv.contact) || '';

            overdue.push({
                invoice_id: inv.id,
                invoice_number: inv.docNumber || inv.num || '',
                contact_id: inv.contact || '',
                contact_name: inv.contactName || '',
                contact_email: contactEmail,
                amount: total,
                currency: inv.currency || 'EUR',
                invoice_date: normalizeTimestamp(inv.date),
                due_date: dueMs,
                days_overdue: daysOverdue,
                suggested_level: level,
                reminders_count: existingCase?.reminders_count || 0,
                last_reminder_at: existingCase?.last_reminder_at || null,
                last_reminder_level: existingCase?.last_reminder_level || null,
                case_status: existingCase?.status || 'open',
            });
        }

        overdue.sort((a, b) => b.days_overdue - a.days_overdue);
        res.json({ invoices: overdue, total_count: overdue.length });
    } catch (err) {
        console.error('[dunning] overdue-invoices error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/cases ────────────────────────────────────────────────────────
router.get('/cases', async (req, res) => {
    try {
        const status = req.query.status;
        let q = supabase
            .from('dunning_cases')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Number(req.query.limit) || 200);
        if (status) q = q.eq('status', status);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        res.json({ cases: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/cases/:id ────────────────────────────────────────────────────
router.get('/cases/:id', async (req, res) => {
    try {
        const [{ data: caseRow, error: caseErr }, { data: reminders, error: remErr }] = await Promise.all([
            supabase.from('dunning_cases').select('*').eq('id', req.params.id).single(),
            supabase.from('dunning_reminders').select('*').eq('case_id', req.params.id).order('sent_at', { ascending: false }),
        ]);
        if (caseErr) throw new Error(caseErr.message);
        if (remErr) throw new Error(remErr.message);
        res.json({ case: caseRow, reminders: reminders || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/stats ────────────────────────────────────────────────────────
// KPIs para el dashboard. Se calcula sobre lo que hay en Supabase — el conteo
// de facturas vencidas actuales viene de /overdue-invoices (Holded live).
router.get('/stats', async (_req, res) => {
    try {
        // Excluimos los envíos hechos en modo prueba (is_test=true) para que
        // no ensucien los KPIs. Los casos test tampoco cuentan.
        const [
            { count: openCases },
            { count: paidCases },
            { data: paidWithDays },
            { count: totalReminders },
            { data: remindersByLevel },
        ] = await Promise.all([
            supabase.from('dunning_cases').select('*', { count: 'exact', head: true }).eq('status', 'open').eq('is_test', false),
            supabase.from('dunning_cases').select('*', { count: 'exact', head: true }).eq('status', 'paid').eq('is_test', false),
            supabase.from('dunning_cases').select('days_to_pay').eq('status', 'paid').eq('is_test', false).not('days_to_pay', 'is', null),
            supabase.from('dunning_reminders').select('*', { count: 'exact', head: true }).eq('is_test', false),
            supabase.from('dunning_reminders').select('level').eq('status', 'sent').eq('is_test', false),
        ]);

        const daysArr = (paidWithDays || []).map(r => r.days_to_pay).filter(n => n != null);
        const avgDaysToPay = daysArr.length
            ? Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length)
            : null;

        const perLevel = { 1: 0, 2: 0, 3: 0 };
        for (const r of remindersByLevel || []) {
            if (perLevel[r.level] !== undefined) perLevel[r.level] += 1;
        }

        res.json({
            open_cases: openCases || 0,
            paid_cases: paidCases || 0,
            total_reminders: totalReminders || 0,
            avg_days_to_pay: avgDaysToPay,
            reminders_by_level: perLevel,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/cron-runs ────────────────────────────────────────────────────
// Historial de ejecuciones del cron (Vercel Cron + disparos manuales).
// Query params:
//   limit    número de filas (default 50, máx 500)
//   status   filtro: 'ok' | 'skipped' | 'error'
//   endpoint filtro: 'run' | 'sync-paid'
router.get('/cron-runs', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 500);
        let q = supabase
            .from('dunning_cron_runs')
            .select('*')
            .order('ran_at', { ascending: false })
            .limit(limit);
        if (req.query.status) q = q.eq('status', String(req.query.status));
        if (req.query.endpoint) q = q.eq('endpoint', String(req.query.endpoint));
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        res.json({ runs: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/reminders ────────────────────────────────────────────────────
// Historial global de recordatorios enviados (no por caso). Incluye tracking
// de aperturas (open_count, first_opened_at, last_opened_at).
// Query params:
//   limit         número de filas (default 100, máx 1000)
//   status        filtro: 'sent' | 'failed' | 'skipped'
//   include_test  si '1', incluye también envíos de modo prueba
router.get('/reminders', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 100, 1000);
        const includeTest = req.query.include_test === '1' || req.query.include_test === 'true';
        let q = supabase
            .from('dunning_reminders')
            .select('id, case_id, invoice_id, level, days_overdue, sent_at, sent_to, cc_emails, subject, smtp_message_id, status, error_message, is_test, first_opened_at, last_opened_at, open_count, stripe_payment_url')
            .order('sent_at', { ascending: false })
            .limit(limit);
        if (req.query.status) q = q.eq('status', String(req.query.status));
        if (!includeTest) q = q.eq('is_test', false);
        const { data, error } = await q;
        if (error) throw new Error(error.message);

        // Enriquecer con datos del caso (invoice_number, contact_name) sin
        // hacer join complejo: cargamos solo los cases referenciados.
        const caseIds = Array.from(new Set((data || []).map(r => r.case_id).filter(Boolean)));
        const { data: cases } = caseIds.length
            ? await supabase.from('dunning_cases')
                .select('id, invoice_number, contact_name, contact_email, amount, currency')
                .in('id', caseIds)
            : { data: [] };
        const caseById = new Map((cases || []).map(c => [c.id, c]));

        const reminders = (data || []).map(r => {
            const c = caseById.get(r.case_id);
            return {
                ...r,
                invoice_number: c?.invoice_number || null,
                contact_name: c?.contact_name || null,
                contact_email: c?.contact_email || null,
                amount: c?.amount || null,
                currency: c?.currency || 'EUR',
            };
        });

        res.json({ reminders });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// Fase 2a — motor de envío (todo bajo demanda, sin cron)
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /dunning/preview-run ─────────────────────────────────────────────────
// Devuelve el plan de envíos que se ejecutaría AHORA. No envía ni escribe.
router.post('/preview-run', async (_req, res) => {
    try {
        const { plan, config } = await buildDunningPlan({ supabase });

        // Resolvemos el destino final por item (respetando test_mode > override > cliente).
        const { data: overridesRows } = await supabase
            .from('dunning_email_overrides').select('contact_id, override_email, override_cc_emails');
        const overrideByContact = new Map((overridesRows || []).map(o => [o.contact_id, o.override_email]));
        const overrideCcByContact = new Map((overridesRows || []).map(o => [o.contact_id, o.override_cc_emails || []]));

        // Los CC globales del config solo aplican fuera de modo prueba (igual
        // que en executeSend: en test no queremos disparar copias a terceros).
        const globalCcEmails = config.test_mode ? [] : sanitizeEmailList(config.cc_emails);

        const enrichedPlan = plan.map(item => {
            let dest_email = item.invoice.contact_email;
            let redirect_reason = null;
            if (config.test_mode && config.test_mode_email) {
                dest_email = config.test_mode_email;
                redirect_reason = 'test_mode';
            } else if (overrideByContact.get(item.invoice.contact_id)) {
                dest_email = overrideByContact.get(item.invoice.contact_id);
                redirect_reason = 'override';
            }
            const overrideCc = config.test_mode
                ? []
                : sanitizeEmailList(overrideCcByContact.get(item.invoice.contact_id));
            const dest_cc = sanitizeEmailList(
                [...globalCcEmails, ...overrideCc],
                dest_email,
            );
            return { ...item, dest_email, dest_cc, redirect_reason };
        });

        // Recalcular summary considerando el destino final (en test_mode no se blockea por no-email).
        const sendsFinal = enrichedPlan.filter(p => p.action === 'send' && !!p.dest_email);
        const summary = {
            total: enrichedPlan.length,
            will_send: sendsFinal.length,
            will_skip: enrichedPlan.length - sendsFinal.length,
            blocked: enrichedPlan.filter(p => p.action === 'send' && !p.dest_email).length,
            by_level: {
                1: sendsFinal.filter(p => p.level === 1).length,
                2: sendsFinal.filter(p => p.level === 2).length,
                3: sendsFinal.filter(p => p.level === 3).length,
            },
        };

        res.json({
            plan: enrichedPlan,
            summary,
            config_enabled: config.enabled,
            test_mode: !!config.test_mode,
            test_mode_email: config.test_mode_email || null,
        });
    } catch (err) {
        console.error('[dunning] preview-run error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /dunning/test-send ───────────────────────────────────────────────────
// Envía UN recordatorio de prueba (diseño V2) a una dirección. Genera un link
// Stripe REAL con el importe de sample para validar el flujo completo.
// No toca dunning_cases ni dunning_reminders.
// Body: { template_id: uuid, to_email: string, sample?: object }
router.post('/test-send', async (req, res) => {
    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            return res.status(500).json({ error: 'smtp-not-configured' });
        }
        const { template_id, to_email, sample } = req.body || {};
        if (!template_id || !to_email) {
            return res.status(400).json({ error: 'missing-template_id-or-to_email' });
        }
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRe.test(to_email)) return res.status(400).json({ error: 'invalid-email' });

        const [{ data: template, error: tplErr }, { data: config }] = await Promise.all([
            supabase.from('dunning_templates').select('*').eq('id', template_id).single(),
            supabase.from('dunning_config').select('*').eq('id', 1).single(),
        ]);
        if (tplErr || !template) return res.status(404).json({ error: 'template-not-found' });

        const invoice = { ...SAMPLE_INVOICE, ...(sample || {}) };

        // Stripe REAL para validar deliverability y flujo end-to-end.
        let stripe_url = null;
        if (isStripeConfigured() && Number(invoice.amount) > 0) {
            try {
                const session = await createCheckoutSession({
                    amountCents: Math.round(Number(invoice.amount) * 100),
                    currency: (invoice.currency || 'EUR').toLowerCase(),
                    concept: `[PRUEBA] Factura ${invoice.invoice_number || 'F-TEST'}`,
                    customerEmail: to_email,
                    metadata: { source: 'dunning-test', invoice_number: invoice.invoice_number || 'F-TEST' },
                });
                stripe_url = session.url;
            } catch (stripeErr) {
                console.warn('[dunning] test-send Stripe failed:', stripeErr.message);
            }
        }

        const rendered = renderDunningEmailV2({ config, template, invoice, stripe_url, base_url: computeBaseUrl(req) });

        const info = await getTransporter().sendMail({
            from: `"Immoral Finance" <${process.env.SMTP_USER}>`,
            to: to_email,
            subject: `[PRUEBA] ${rendered.subject}`,
            html: rendered.html,
        });

        res.json({ success: true, message_id: info.messageId, to: to_email, stripe_url });
    } catch (err) {
        console.error('[dunning] test-send error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── /dunning/overrides ────────────────────────────────────────────────────────
// CRUD de emails redirigidos por contact_id.

router.get('/overrides', async (_req, res) => {
    try {
        const { data, error } = await supabase
            .from('dunning_email_overrides').select('*')
            .order('updated_at', { ascending: false });
        if (error) throw new Error(error.message);
        res.json({ overrides: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/overrides/:contact_id', async (req, res) => {
    try {
        const { override_email, contact_name, note, override_cc_emails } = req.body || {};
        if (!override_email || !EMAIL_RE.test(override_email)) {
            return res.status(400).json({ error: 'invalid-override_email' });
        }
        // Igual que en /config: si alguno de los CC no es un email válido,
        // devolvemos error en lugar de tragárnoslo silenciosamente.
        const cleanedCc = sanitizeEmailList(override_cc_emails);
        if (Array.isArray(override_cc_emails) && override_cc_emails.some(v => v && !cleanedCc.includes(String(v).trim()))) {
            return res.status(400).json({
                error: 'invalid-override_cc_emails',
                hint: 'Alguna dirección de CC no es un email válido.',
            });
        }
        const { data, error } = await supabase
            .from('dunning_email_overrides')
            .upsert({
                contact_id: req.params.contact_id,
                override_email,
                override_cc_emails: cleanedCc,
                contact_name: contact_name || null,
                note: note || null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'contact_id' })
            .select().single();
        if (error) throw new Error(error.message);
        res.json({ override: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/overrides/:contact_id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('dunning_email_overrides')
            .delete().eq('contact_id', req.params.contact_id);
        if (error) throw new Error(error.message);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /dunning/run ─────────────────────────────────────────────────────────
// Ejecuta el envío real siguiendo el plan.
// Body: { dry_run?: boolean, force?: boolean }
//   - dry_run: si true, no envía ni escribe (útil para testing sin efectos).
//   - force: si true, ignora config.enabled. Útil para lanzar manualmente
//     desde la UI antes de activar el sistema automático.
router.post('/run', async (req, res) => {
    try {
        const dryRun = !!req.body?.dry_run;
        const force = !!req.body?.force;

        if (!dryRun && !process.env.SMTP_USER) {
            return res.status(500).json({ error: 'smtp-not-configured' });
        }

        const { data: cfg } = await supabase.from('dunning_config').select('*').eq('id', 1).single();
        if (!force && !cfg?.enabled) {
            return res.status(400).json({
                error: 'system-disabled',
                hint: 'Activa el sistema en configuración o usa force=true para una ejecución manual puntual.',
            });
        }

        const result = await executeSend({ dryRun, baseUrl: computeBaseUrl(req) });
        return res.json(result);
    } catch (err) {
        console.error('[dunning] run error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// (bloque legacy — eliminado, se sustituye por executeSend arriba)

// ── POST /dunning/sync-paid ───────────────────────────────────────────────────
// Cruza casos abiertos contra Holded. Si una factura ya está pagada, cierra
// el caso y calcula days_to_pay (desde primer recordatorio hasta ahora).
router.post('/sync-paid', async (_req, res) => {
    try {
        const result = await runSyncPaid();
        res.json(result);
    } catch (err) {
        console.error('[dunning] sync-paid error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /dunning/reset-test-data ─────────────────────────────────────────────
// Borra el histórico de recordatorios y casos para poder volver a ejecutar
// la prueba desde cero. Solo permitido si test_mode está ACTIVO — protección
// para no borrar histórico real por accidente.
router.post('/reset-test-data', async (_req, res) => {
    try {
        const { data: config } = await supabase.from('dunning_config').select('test_mode').eq('id', 1).single();
        if (!config?.test_mode) {
            return res.status(400).json({
                error: 'not-in-test-mode',
                hint: 'Activa el modo prueba antes de resetear datos (protección contra borrado accidental).',
            });
        }
        const { count: remindersDeleted } = await supabase
            .from('dunning_reminders').delete({ count: 'exact' }).not('id', 'is', null);
        const { count: casesDeleted } = await supabase
            .from('dunning_cases').delete({ count: 'exact' }).not('id', 'is', null);
        res.json({
            success: true,
            reminders_deleted: remindersDeleted || 0,
            cases_deleted: casesDeleted || 0,
        });
    } catch (err) {
        console.error('[dunning] reset-test-data error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/multi-overdue-alerts ─────────────────────────────────────────
// Devuelve la lista de clientes con >= threshold facturas vencidas ahora.
// La consume el banner global de la app y también sirve para probar la
// alerta desde la config.
router.get('/multi-overdue-alerts', async (_req, res) => {
    try {
        const config = await getConfig();
        const result = await computeMultiOverdueAlerts({ config });
        res.json({
            ...result,
            enabled: !!config.multi_alert_enabled,
            last_sent_at: config.multi_alert_last_sent_at || null,
        });
    } catch (err) {
        console.error('[dunning] multi-overdue-alerts error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /dunning/multi-overdue-alerts/send ───────────────────────────────────
// Fuerza el envío del email de alerta ignorando el anti-spam de 24h. Útil
// para probar tras configurar los destinatarios.
router.post('/multi-overdue-alerts/send', async (req, res) => {
    try {
        const config = await getConfig();
        // Delegamos en maybeDispatchMultiAlert con force=true — así:
        //   1) el envío manual NO actualiza multi_alert_last_sent_at (el
        //      anti-spam del cron no se contamina con pruebas del usuario).
        //   2) el snapshot del histórico se registra igual.
        const result = await maybeDispatchMultiAlert({
            config, baseUrl: computeBaseUrl(req), force: true,
        });
        res.json(result);
    } catch (err) {
        console.error('[dunning] multi-overdue-alerts/send error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/multi-overdue-history ────────────────────────────────────────
// Historial de alertas por cliente. Dos modos:
//   • Sin contact_id: resumen agregado por cliente y mes de los últimos 12
//     meses — para el dashboard general de reincidentes.
//   • Con contact_id: detalle día a día de ese cliente.
router.get('/multi-overdue-history', async (req, res) => {
    try {
        const contactId = req.query.contact_id ? String(req.query.contact_id) : null;
        const months = Math.max(1, Math.min(24, Number(req.query.months) || 12));
        const sinceIso = new Date(Date.now() - months * 31 * 86_400_000).toISOString();

        let q = supabase
            .from('dunning_multi_alert_history')
            .select('*')
            .gte('ran_at', sinceIso)
            .order('ran_at', { ascending: false });
        if (contactId) q = q.eq('contact_id', contactId);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const rows = data || [];

        if (contactId) {
            return res.json({ contact_id: contactId, snapshots: rows });
        }

        // Agregación: por cliente, contar cuántos días distintos apareció
        // en cada mes YYYY-MM. Devolvemos también el máximo de facturas y
        // deuda media para poder ordenar por gravedad.
        const byContactMonth = new Map();
        for (const r of rows) {
            const month = String(r.ran_date || '').slice(0, 7);
            if (!month) continue;
            const key = `${r.contact_id || r.contact_name}||${month}`;
            let bucket = byContactMonth.get(key);
            if (!bucket) {
                bucket = {
                    contact_id: r.contact_id,
                    contact_name: r.contact_name,
                    month,
                    days_flagged: 0,
                    max_invoice_count: 0,
                    max_days_overdue: 0,
                    peak_amount: 0,
                };
                byContactMonth.set(key, bucket);
            }
            bucket.days_flagged += 1;
            if (r.invoice_count > bucket.max_invoice_count) bucket.max_invoice_count = r.invoice_count;
            if (r.max_days_overdue > bucket.max_days_overdue) bucket.max_days_overdue = r.max_days_overdue;
            if (Number(r.total_amount || 0) > bucket.peak_amount) bucket.peak_amount = Number(r.total_amount || 0);
        }

        const byMonth = Array.from(byContactMonth.values());

        // Reagrupamos por cliente para tener una fila por cliente con la
        // línea temporal de meses en los que ha tenido múltiples vencidas.
        const byContact = new Map();
        for (const b of byMonth) {
            const key = b.contact_id || b.contact_name || 'unknown';
            let c = byContact.get(key);
            if (!c) {
                c = {
                    contact_id: b.contact_id,
                    contact_name: b.contact_name,
                    months_flagged: 0,
                    total_days_flagged: 0,
                    peak_invoice_count: 0,
                    peak_amount: 0,
                    months: [],
                };
                byContact.set(key, c);
            }
            c.months_flagged += 1;
            c.total_days_flagged += b.days_flagged;
            if (b.max_invoice_count > c.peak_invoice_count) c.peak_invoice_count = b.max_invoice_count;
            if (b.peak_amount > c.peak_amount) c.peak_amount = b.peak_amount;
            c.months.push({
                month: b.month,
                days_flagged: b.days_flagged,
                max_invoice_count: b.max_invoice_count,
                max_days_overdue: b.max_days_overdue,
                peak_amount: b.peak_amount,
            });
        }

        const clients = Array.from(byContact.values())
            .map(c => ({ ...c, months: c.months.sort((a, b) => b.month.localeCompare(a.month)) }))
            .sort((a, b) => b.months_flagged - a.months_flagged || b.peak_invoice_count - a.peak_invoice_count);

        res.json({ months_window: months, clients });
    } catch (err) {
        console.error('[dunning] multi-overdue-history error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/overdue-report/preview ───────────────────────────────────────
// Devuelve el reporte que se enviaría por email ahora mismo (sin enviarlo).
router.get('/overdue-report/preview', async (_req, res) => {
    try {
        const config = await getConfig();
        const report = await computeOverdueReport({ config });
        res.json({ ...report, enabled: !!config.overdue_report_enabled });
    } catch (err) {
        console.error('[dunning] overdue-report/preview error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /dunning/overdue-report/send ─────────────────────────────────────────
// Fuerza el envío del reporte ignorando el schedule y el anti-spam. Para
// probar destinatarios y formato tras configurar.
router.post('/overdue-report/send', async (req, res) => {
    try {
        const config = await getConfig();
        const result = await maybeDispatchOverdueReport({
            config, baseUrl: computeBaseUrl(req), force: true,
        });
        res.json(result);
    } catch (err) {
        console.error('[dunning] overdue-report/send error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
