import express from 'express';
import Joi from 'joi';
import multer from 'multer';
import nodemailer from 'nodemailer';
import supabase from '../config/supabase.js';

const router = express.Router();

// Multer en memoria para recibir el archivo y luego subirlo a Supabase Storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF, JPG, PNG o WEBP'));
        }
    }
});

// ================================================
// EMAIL SETUP
// ================================================

let transporter = null;

function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            pool: true, // Use connection pooling
            maxConnections: 3,
            maxMessages: 10
        });
    }
    return transporter;
}

async function sendEmail({ to, cc, subject, html }) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('[EMAIL] SMTP not configured (SMTP_USER or SMTP_PASS missing), skipping email');
        return;
    }
    try {
        console.log(`[EMAIL] Sending email to: ${to}${cc ? `, cc: ${cc}` : ''}, subject: ${subject}`);
        const transport = getTransporter();
        
        // Verify connection first
        await transport.verify();
        console.log('[EMAIL] SMTP connection verified');
        
        const info = await transport.sendMail({
            from: `"Immoral Finance" <${process.env.SMTP_USER}>`,
            to,
            cc: cc || undefined,
            subject,
            html
        });
        console.log(`[EMAIL] ✅ Email sent successfully. MessageId: ${info.messageId}`);
    } catch (err) {
        console.error('[EMAIL] ❌ Error sending email:', err);
        // Reset transporter on error to force reconnect next time
        transporter = null;
    }
}

// ================================================
// HELPER: Crear notificación in-app
// ================================================

async function createNotification(userIds, type, title, body, entityType, entityId) {
    if (!userIds?.length) return;
    const records = userIds.map(userId => ({
        user_id: userId,
        type,
        title,
        body: body || null,
        entity_type: entityType || null,
        entity_id: entityId || null,
        is_read: false
    }));
    const { error } = await supabase.from('notifications').insert(records);
    if (error) console.error('Error creating notifications:', error.message);
}

// ================================================
// ENDPOINTS
// ================================================

/**
 * POST /payment-requests
 * Partner solicita pago de comisiones adjuntando factura
 * Body (multipart/form-data):
 *   - partner_id, partner_email, fiscal_year, fiscal_month, total_amount, notes
 *   - invoice (file)
 */
router.post('/', upload.single('invoice'), async (req, res) => {
    try {
        const schema = Joi.object({
            partner_id: Joi.string().uuid().required(),
            partner_email: Joi.string().email().required(),
            fiscal_year: Joi.number().integer().min(2020).required(),
            fiscal_month: Joi.number().integer().min(0).max(12).required(),
            total_amount: Joi.number().min(0).required(),
            notes: Joi.string().allow('', null)
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Debe adjuntar la factura' });
        }

        // Obtener nombre del partner
        const { data: partner } = await supabase
            .from('partners')
            .select('name')
            .eq('id', value.partner_id)
            .single();

        const partnerName = partner?.name || 'Partner';
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const monthName = value.fiscal_month === 0 ? 'Año completo' : monthNames[value.fiscal_month - 1];

        // Subir factura a Supabase Storage
        const fileExt = req.file.originalname.split('.').pop();
        const fileName = `${value.partner_id}/${value.fiscal_year}-${String(value.fiscal_month).padStart(2, '0')}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('invoices')
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });

        if (uploadError) {
            console.error('Error uploading invoice:', uploadError);
            return res.status(500).json({ error: 'Error al subir la factura', details: uploadError.message });
        }

        // Crear registro en la tabla
        const { data: request, error: insertError } = await supabase
            .from('commission_payment_requests')
            .insert({
                partner_id: value.partner_id,
                partner_email: value.partner_email,
                fiscal_year: value.fiscal_year,
                fiscal_month: value.fiscal_month,
                total_amount: value.total_amount,
                invoice_path: fileName,
                invoice_filename: req.file.originalname,
                status: 'pending',
                notes: value.notes || null
            })
            .select()
            .single();

        if (insertError) {
            console.error('Error creating payment request:', insertError);
            return res.status(500).json({ error: 'Error al crear la solicitud', details: insertError.message });
        }

        // Obtener URL firmada de la factura (válida por 7 días)
        const { data: signedUrlData } = await supabase.storage
            .from('invoices')
            .createSignedUrl(fileName, 7 * 24 * 60 * 60);
        const invoiceUrl = signedUrlData?.signedUrl || '';

        // Notificación in-app para admins (superadmin)
        const { data: adminUsers } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('role', 'superadmin');

        const adminUserIds = (adminUsers || []).map(u => u.id);

        await createNotification(
            adminUserIds,
            'payment_request',
            `Solicitud de pago: ${partnerName}`,
            `${partnerName} ha solicitado el pago de comisiones de ${monthName} ${value.fiscal_year} por ${value.total_amount.toLocaleString('es-ES')} €`,
            'commission_payment_request',
            request.id
        );

        // Email al admin
        const adminEmail = process.env.ADMIN_EMAIL || 'administracion@immoral.es';
        const ccEmail = process.env.ADMIN_CC_EMAIL || null;

        await sendEmail({
            to: adminEmail,
            cc: ccEmail,
            subject: `💰 Solicitud de Pago de Comisiones - ${partnerName} (${monthName} ${value.fiscal_year})`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 12px 12px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 20px;">💰 Nueva Solicitud de Pago</h1>
                    </div>
                    <div style="background: #f8f9fa; padding: 24px; border-radius: 0 0 12px 12px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Partner:</td>
                                <td style="padding: 8px 0;">${partnerName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Email:</td>
                                <td style="padding: 8px 0;">${value.partner_email}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Período:</td>
                                <td style="padding: 8px 0;">${monthName} ${value.fiscal_year}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Monto:</td>
                                <td style="padding: 8px 0; font-size: 18px; font-weight: bold; color: #667eea;">${value.total_amount.toLocaleString('es-ES')} €</td>
                            </tr>
                            ${value.notes ? `
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Notas:</td>
                                <td style="padding: 8px 0;">${value.notes}</td>
                            </tr>` : ''}
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Factura:</td>
                                <td style="padding: 8px 0;"><a href="${invoiceUrl}" style="color: #667eea;">Descargar factura</a></td>
                            </tr>
                        </table>
                        <p style="margin-top: 20px; color: #888; font-size: 12px;">Este email fue enviado automáticamente desde Immoral Finance App.</p>
                    </div>
                </div>
            `
        });

        // Email de confirmación al partner
        await sendEmail({
            to: value.partner_email,
            subject: `✅ Solicitud de pago recibida - ${monthName} ${value.fiscal_year}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 24px; border-radius: 12px 12px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 20px;">✅ Solicitud Recibida</h1>
                    </div>
                    <div style="background: #f8f9fa; padding: 24px; border-radius: 0 0 12px 12px;">
                        <p>Hola <strong>${partnerName}</strong>,</p>
                        <p>Tu solicitud de pago de comisiones ha sido recibida y está en revisión.</p>
                        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Período:</td>
                                <td style="padding: 8px 0;">${monthName} ${value.fiscal_year}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Monto solicitado:</td>
                                <td style="padding: 8px 0; font-weight: bold; color: #11998e;">${value.total_amount.toLocaleString('es-ES')} €</td>
                            </tr>
                        </table>
                        <p>Te notificaremos cuando tu solicitud sea procesada.</p>
                        <p style="margin-top: 20px; color: #888; font-size: 12px;">Immoral Finance App</p>
                    </div>
                </div>
            `
        });

        res.json({
            success: true,
            message: 'Solicitud de pago creada exitosamente',
            request
        });

    } catch (err) {
        console.error('Error creating payment request:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * GET /payment-requests
 * Lista solicitudes de pago (filtrable)
 * Query: partner_id, status, year, month
 */
router.get('/', async (req, res) => {
    try {
        const { partner_id, status, year, month } = req.query;

        let query = supabase
            .from('commission_payment_requests')
            .select(`
                *,
                partner:partners(id, name, email)
            `)
            .order('requested_at', { ascending: false });

        if (partner_id) query = query.eq('partner_id', partner_id);
        if (status) query = query.eq('status', status);
        if (year) query = query.eq('fiscal_year', parseInt(year));
        if (month) query = query.eq('fiscal_month', parseInt(month));

        const { data, error } = await query;

        if (error) {
            return res.status(500).json({ error: 'Error al obtener solicitudes', details: error.message });
        }

        res.json({
            success: true,
            total: data.length,
            requests: data
        });

    } catch (err) {
        console.error('Error fetching payment requests:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * GET /payment-requests/:id
 * Obtener detalle de una solicitud con URL firmada de la factura
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('commission_payment_requests')
            .select(`
                *,
                partner:partners(id, name, email)
            `)
            .eq('id', id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Solicitud no encontrada' });
        }

        // Generar URL firmada para la factura
        if (data.invoice_path) {
            const { data: signedUrlData } = await supabase.storage
                .from('invoices')
                .createSignedUrl(data.invoice_path, 60 * 60); // 1 hora
            data.invoice_url = signedUrlData?.signedUrl || null;
        }

        res.json({
            success: true,
            request: data
        });

    } catch (err) {
        console.error('Error fetching payment request:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * PATCH /payment-requests/:id
 * Admin aprueba o rechaza solicitud
 * Body: { status: 'approved'|'rejected', admin_notes?, reviewed_by? }
 */
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const schema = Joi.object({
            status: Joi.string().valid('approved', 'rejected', 'pending').required(),
            admin_notes: Joi.string().allow('', null),
            reviewed_by: Joi.string().uuid().allow(null)
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { data, error: updateError } = await supabase
            .from('commission_payment_requests')
            .update({
                status: value.status,
                admin_notes: value.admin_notes || null,
                reviewed_at: new Date().toISOString(),
                reviewed_by: value.reviewed_by || null
            })
            .eq('id', id)
            .select(`
                *,
                partner:partners(id, name, email)
            `)
            .single();

        if (updateError) {
            return res.status(500).json({ error: 'Error al actualizar solicitud', details: updateError.message });
        }

        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const monthName = data.fiscal_month === 0 ? 'Año completo' : monthNames[data.fiscal_month - 1];
        const partnerName = data.partner?.name || 'Partner';
        const statusText = value.status === 'approved' ? 'aprobada ✅' : 'rechazada ❌';

        // Email al partner informando el resultado
        if (data.partner_email) {
            const statusColor = value.status === 'approved' ? '#11998e' : '#e74c3c';
            const statusEmoji = value.status === 'approved' ? '✅' : '❌';

            await sendEmail({
                to: data.partner_email,
                cc: process.env.ADMIN_CC_EMAIL || null,
                subject: `${statusEmoji} Solicitud de pago ${statusText} - ${monthName} ${data.fiscal_year}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: ${statusColor}; padding: 24px; border-radius: 12px 12px 0 0;">
                            <h1 style="color: white; margin: 0; font-size: 20px;">${statusEmoji} Solicitud ${statusText}</h1>
                        </div>
                        <div style="background: #f8f9fa; padding: 24px; border-radius: 0 0 12px 12px;">
                            <p>Hola <strong>${partnerName}</strong>,</p>
                            <p>Tu solicitud de pago de comisiones de <strong>${monthName} ${data.fiscal_year}</strong> ha sido <strong>${statusText}</strong>.</p>
                            ${value.admin_notes ? `<p><strong>Comentario:</strong> ${value.admin_notes}</p>` : ''}
                            <p style="margin-top: 20px; color: #888; font-size: 12px;">Immoral Finance App</p>
                        </div>
                    </div>
                `
            });
        }

        res.json({
            success: true,
            message: `Solicitud ${statusText}`,
            request: data
        });

    } catch (err) {
        console.error('Error updating payment request:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * DELETE /payment-requests/:id
 * Eliminar/cancelar una solicitud de pago
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get request info before deleting (for storage cleanup)
        const { data: existing } = await supabase
            .from('commission_payment_requests')
            .select('invoice_path')
            .eq('id', id)
            .single();

        // Delete the invoice file from storage
        if (existing?.invoice_path) {
            await supabase.storage.from('invoices').remove([existing.invoice_path]);
        }

        const { error } = await supabase
            .from('commission_payment_requests')
            .delete()
            .eq('id', id);

        if (error) {
            return res.status(500).json({ error: 'Error al eliminar solicitud', details: error.message });
        }

        res.json({ success: true, message: 'Solicitud eliminada exitosamente' });

    } catch (err) {
        console.error('Error deleting payment request:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
