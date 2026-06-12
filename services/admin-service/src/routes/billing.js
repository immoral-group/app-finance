import express from 'express';
import Joi from 'joi';
import supabase from '../config/supabase.js';
import { createNotifications } from './notifications.js';
import { logChange, extractUser } from '../utils/changeLogger.js';

const router = express.Router();

// ================================================
// BILLING MATRIX ENDPOINTS
// ================================================

/**
 * GET /matrix
 * Get all billing data structured for the spreadsheet view (Pivot)
 */
router.get('/matrix', async (req, res) => {
    try {
        const { year, month } = req.query;

        if (!year || !month) return res.status(400).json({ error: 'Year and month required' });

        console.log(`Fetching matrix for ${year}-${month}`);

        // 1. Fetch clients assigned to this year (via junction table)
        const { data: clientAssignments } = await supabase
            .from('client_year_assignments')
            .select('client_id')
            .eq('fiscal_year', year)
            .eq('is_active', true);

        const assignedClientIds = (clientAssignments || []).map(a => a.client_id);

        let clients = [];
        let clientError = null;
        if (assignedClientIds.length > 0) {
            const result = await supabase
                .from('clients')
                .select(`
                    id,
                    name,
                    vertical_id,
                    fee_config,
                    hidden_from_yyyymm,
                    visible_from_yyyymm,
                    vertical:verticals(code, name)
                `)
                .in('id', assignedClientIds)
                .eq('is_active', true)
                .order('name');
            clients = result.data || [];
            clientError = result.error;
        }

        if (clientError) throw clientError;

        // Filtrar clientes ocultos para este mes (no afecta cálculos de fees — solo la respuesta visual)
        // Un cliente está oculto en X si: hidden_from_yyyymm <= X AND (visible_from_yyyymm IS NULL OR visible_from_yyyymm > X)
        const yyyymm = parseInt(year) * 100 + parseInt(month);
        const visibleClients = clients.filter(c => {
            if (!c.hidden_from_yyyymm || c.hidden_from_yyyymm > yyyymm) return true;   // nunca oculto o oculto en futuro
            return c.visible_from_yyyymm != null && c.visible_from_yyyymm <= yyyymm;    // fue reactivado antes o en este mes
        });

        // 1b. Fetch Contracts separately (for Vencimiento)
        const clientIds = clients.map(c => c.id);
        const { data: contracts, error: contractError } = await supabase
            .from('contracts')
            .select('client_id, effective_to')
            .in('client_id', clientIds)
            .eq('is_active', true);

        const contractsMap = {};
        // If contracts table doesn't exist or errors, we just ignore it for now to not break the page
        if (!contractError && contracts) {
            contracts.forEach(c => {
                // If multiple, just take the first one found or latest
                contractsMap[c.client_id] = c;
            });
        } else if (contractError) {
            console.warn("Could not fetch contracts:", contractError.message);
        }

        // 2. Fetch services assigned to this year (via junction table)
        const { data: serviceAssignments } = await supabase
            .from('service_year_assignments')
            .select('service_id')
            .eq('fiscal_year', year)
            .eq('is_active', true);

        const assignedServiceIds = (serviceAssignments || []).map(a => a.service_id);

        let services = [];
        let serviceError = null;
        if (assignedServiceIds.length > 0) {
            const result = await supabase
                .from('services')
                .select(`
                    id, code, name, department_id, display_order,
                    department:departments(id, code, name, display_order)
                `)
                .in('id', assignedServiceIds)
                .order('display_order', { ascending: true })
                .order('display_order', { foreignTable: 'departments', ascending: true });
            services = result.data || [];
            serviceError = result.error;
        }

        if (serviceError) throw serviceError;

        // JS Sort (Department Order -> Service Order)
        services.sort((a, b) => {
            const deptOrderA = a.department?.display_order || 99;
            const deptOrderB = b.department?.display_order || 99;
            if (deptOrderA !== deptOrderB) return deptOrderA - deptOrderB;
            return a.display_order - b.display_order;
        });

        // 3. Fetch Monthly Billing
        const { data: billingRecords, error: billingError } = await supabase
            .from('monthly_billing')
            .select('*')
            .eq('fiscal_year', year)
            .eq('fiscal_month', month);

        if (billingError) throw billingError;

        // 4. Fetch Billing Details
        const billingIds = billingRecords.map(b => b.id);
        let details = [];
        if (billingIds.length > 0) {
            const { data: d, error: dError } = await supabase
                .from('billing_details')
                .select('*')
                .in('monthly_billing_id', billingIds);
            if (dError) throw dError;
            details = d;
        }

        // 5. Sync with Actuals (Ad Investment)
        // Use 'client_ad_investment' table to get Real Data
        const { data: actuals } = await supabase
            .from('client_ad_investment')
            .select('client_id, platform_id, actual_amount')
            .eq('fiscal_year', year)
            .eq('fiscal_month', month);

        const actualsMap = {};
        if (actuals) {
            actuals.forEach(a => {
                const amt = Number(a.actual_amount || 0);
                if (!actualsMap[a.client_id]) {
                    actualsMap[a.client_id] = { total_spend: 0, platforms: new Set() };
                }
                actualsMap[a.client_id].total_spend += amt;
                if (amt > 0) {
                    actualsMap[a.client_id].platforms.add(a.platform_id);
                }
            });
        }

        // Pre-fetch Strategy Service (for optimization)
        const stratService = services.find(s => s.code === 'PAID_MEDIA_STRATEGY');

        const billingUpserts = []; // Changed to Upserts (Full Rows)
        const detailUpserts = [];

        // Iterate Billing Records and Sync
        for (const r of billingRecords) {
            const actual = actualsMap[r.client_id];
            const realInvestment = actual ? actual.total_spend : 0;
            const realCount = actual ? actual.platforms.size : 0;

            const updates = {};
            let currentInv = Number(r.total_actual_investment || 0);
            let currentCount = Number(r.platform_count || 1);

            // 1. Sync Investment (Actuals)
            if (currentInv !== realInvestment) {
                updates.total_actual_investment = realInvestment;
                currentInv = realInvestment;
                r.total_actual_investment = realInvestment;
            }

            // 2. Sync Platform Count
            if (actual) {
                const newCount = realCount > 0 ? realCount : 1;
                if (currentCount !== newCount) {
                    updates.platform_count = newCount;
                    currentCount = newCount;
                    r.platform_count = newCount;
                }
            }

            // 3. FORCE Calculate Fee (Ignora Manual Override para reactivar cálculo)
            let feeToStore = r.fee_paid;

            const clientObj = clients.find(c => c.id === r.client_id);
            if (clientObj && clientObj.fee_config) {
                const config = clientObj.fee_config;
                let pct = 0;

                // Verify Config Type - Type Safe
                if (config.fee_type === 'variable') {
                    if (config.variable_ranges && config.variable_ranges.length > 0) {
                        const range = config.variable_ranges.find(rg => {
                            const min = Number(rg.min || 0);
                            const max = (rg.max === null || rg.max === undefined) ? Infinity : Number(rg.max);
                            return currentInv >= min && currentInv <= max;
                        });
                        pct = range ? Number(range.pct) : 0;
                    } else {
                        pct = 0;
                    }
                } else {
                    pct = Number(config.fixed_pct || 0);
                }

                // Platform Costs - Type Safe
                const usePlat = config.use_platform_costs === true;
                // Ensure count is at least 1 for calculation IF it should apply
                // LOGIC CHANGE: Only apply platform costs if there is actual investment OR manual count > 0
                const shouldApplyPlatformCost = currentInv > 0 || currentCount > 1; // >1 because default is often 1 via defaults

                let pCost = 0;
                if (usePlat && shouldApplyPlatformCost) {
                    const calcCount = Math.max(1, currentCount);
                    pCost = (Number(config.platform_cost_first || 0) + (calcCount - 1) * Number(config.platform_cost_additional || 0));
                }

                // Calculate Raw Fee
                const rawFee = (currentInv * (pct / 100)) + pCost;
                const newFee = Math.round(rawFee);
                const pCostRounded = Math.round(pCost);

                // Check for changes (Always update metadata)
                if (Math.abs((r.applied_fee_percentage || 0) - pct) > 0.001) {
                    updates.applied_fee_percentage = pct;
                    r.applied_fee_percentage = pct;
                }
                if (Math.abs((r.platform_costs || 0) - pCostRounded) > 0.001) {
                    updates.platform_costs = pCostRounded;
                    r.platform_costs = pCostRounded;
                }

                // FEE LOGIC: Respect Manual Override
                if (r.is_manual_override) {
                    // User manually set the fee, do NOT overwrite it with calculation
                    // But ensure we store the manual value if not present?
                    // Just keep existing r.fee_paid
                    feeToStore = Math.round(r.fee_paid || 0);
                } else {
                    // Auto-Calculate
                    if (Math.abs((r.fee_paid || 0) - newFee) > 0.01) {
                        updates.fee_paid = newFee;
                        r.fee_paid = newFee;
                        feeToStore = newFee;
                    } else {
                        feeToStore = newFee;
                    }
                }
            }

            // Collect Upserts (Sanitize object)
            if (Object.keys(updates).length > 0) {
                // We must use the FULL record for upsert to ensure we don't lose data?
                // Actually, if we use the object 'r' which comes from 'select *', it has all columns.
                // We just need to remove the joined 'client' property.
                const { client, ...cleanRecord } = r;
                billingUpserts.push(cleanRecord);
            }

            // Collect Detail Upserts (Sync Strategy Column)
            if (stratService && typeof feeToStore === 'number' && !isNaN(feeToStore)) {
                detailUpserts.push({
                    monthly_billing_id: r.id,
                    service_id: stratService.id,
                    department_id: stratService.department_id,
                    service_name: stratService.name,
                    amount: feeToStore // Already Rounded
                });
            }
        }

        // BATCH EXECUTION
        if (billingUpserts.length > 0) {
            // SINGLE Bulk Upsert Request
            await supabase.from('monthly_billing').upsert(billingUpserts);
        }

        if (detailUpserts.length > 0) {
            // Bulk Upsert Details
            await supabase.from('billing_details').upsert(detailUpserts, { onConflict: 'monthly_billing_id, service_id' });

            // Update in-memory 'details' for immediate response
            detailUpserts.forEach(up => {
                const existingIdx = details.findIndex(d => d.monthly_billing_id === up.monthly_billing_id && d.service_id === up.service_id);
                if (existingIdx >= 0) {
                    details[existingIdx].amount = up.amount;
                } else {
                    details.push(up);
                }
            });
        }

        // 5b. Create missing billing records for clients with ad investment but no billing record
        const existingClientIds = new Set(billingRecords.map(b => b.client_id));
        const missingInserts = [];
        const missingDetailInserts = [];

        for (const [clientId, actual] of Object.entries(actualsMap)) {
            if (existingClientIds.has(clientId)) continue; // Already has billing record
            if (!actual.total_spend || actual.total_spend <= 0) continue; // No investment

            const clientObj = clients.find(c => c.id === clientId);
            if (!clientObj) continue; // Not an active client

            const config = clientObj.fee_config || { fee_type: 'fixed', fixed_pct: 10, use_platform_costs: false, platform_cost_first: 0, platform_cost_additional: 0 };
            let pct = 0;
            if (config.fee_type === 'variable' && config.variable_ranges?.length > 0) {
                const range = config.variable_ranges.find(rg => {
                    const min = Number(rg.min || 0);
                    const max = (rg.max === null || rg.max === undefined) ? Infinity : Number(rg.max);
                    return actual.total_spend >= min && actual.total_spend <= max;
                });
                pct = range ? Number(range.pct) : 0;
            } else {
                pct = Number(config.fixed_pct || 0);
            }

            const usePlat = config.use_platform_costs === true;
            const platCount = actual.platforms.size > 0 ? actual.platforms.size : 1;
            let pCost = 0;
            if (usePlat && actual.total_spend > 0) {
                pCost = (Number(config.platform_cost_first || 0)) + ((Math.max(1, platCount) - 1) * Number(config.platform_cost_additional || 0));
            }

            const fee = Math.round((actual.total_spend * (pct / 100)) + pCost);

            missingInserts.push({
                client_id: clientId,
                fiscal_year: parseInt(year),
                fiscal_month: parseInt(month),
                total_actual_investment: actual.total_spend,
                total_ad_investment: 0,
                applied_fee_percentage: pct,
                platform_count: platCount,
                platform_costs: Math.round(pCost),
                fee_paid: fee,
                is_manual_override: false,
                cell_metadata: {}
            });
        }

        if (missingInserts.length > 0) {
            const { data: newBillings, error: insertError } = await supabase
                .from('monthly_billing')
                .insert(missingInserts)
                .select();

            if (!insertError && newBillings) {
                // Add to billingRecords for the response & create strategy details
                newBillings.forEach(nb => {
                    billingRecords.push(nb);
                    if (stratService && nb.fee_paid > 0) {
                        missingDetailInserts.push({
                            monthly_billing_id: nb.id,
                            service_id: stratService.id,
                            department_id: stratService.department_id,
                            service_name: stratService.name,
                            amount: nb.fee_paid
                        });
                    }
                });

                if (missingDetailInserts.length > 0) {
                    const { data: newDetails } = await supabase
                        .from('billing_details')
                        .upsert(missingDetailInserts, { onConflict: 'monthly_billing_id, service_id' })
                        .select();
                    if (newDetails) details.push(...newDetails);
                }
                console.log(`Created ${newBillings.length} missing billing records from ad investment data`);
            }
        }

        // 6. Structure Data (solo clientes visibles en este período)
        const matrix = visibleClients.map(client => {
            const billing = billingRecords.find(b => b.client_id === client.id) || null;
            const clientDetails = billing ? details.filter(d => d.monthly_billing_id === billing.id) : [];

            // Get Vencimiento (Contract End or 'DD' if default)
            // Use the map we built
            const contract = contractsMap[client.id];
            // Calculate numeric day if needed, or just date string
            const vencimiento = contract?.effective_to ? new Date(contract.effective_to).getDate() : 15; // Default 15th if missing

            // Map services
            const serviceValues = {};
            services.forEach(svc => {
                const detail = clientDetails.find(d => d.service_id === svc.id);
                serviceValues[svc.id] = detail ? detail.amount : 0;
            });

            return {
                client_id: client.id,
                client_name: client.name,
                vertical: client.vertical?.name || 'Grand', // Default vertical
                vencimiento: vencimiento,
                fee_config: client.fee_config,
                billing_id: billing?.id || null,
                metadata: {
                    // Show ACTUAL Investment in Matrix (from new column or sync)
                    investment: billing?.total_actual_investment || 0,
                    // Pass Planned for reference if needed
                    planned_investment: billing?.total_ad_investment || 0,

                    fee_pct: billing?.applied_fee_percentage || 0,
                    platform_count: billing?.platform_count || 1,
                    platform_costs: billing?.platform_costs || 0,
                    fee_min: 0,
                    fee_paid: billing?.fee_paid || 0,
                    immedia_total: billing?.immedia_total || 0,
                    imcontent_total: billing?.imcontent_total || 0,
                    immoralia_total: billing?.immoralia_total || 0,
                    immoral_total: billing?.immoral_general_total || 0,
                    grand_total: billing?.grand_total || 0
                },
                services: serviceValues,
                comments: {
                    metadata: billing?.cell_metadata || {},
                    services: clientDetails.reduce((acc, d) => {
                        if (d.cell_metadata && (d.cell_metadata.comment || (d.cell_metadata.assigned_to && d.cell_metadata.assigned_to.length > 0))) {
                            acc[d.service_id] = d.cell_metadata;
                        } else if (d.notes) {
                            acc[d.service_id] = d.notes;
                        }
                        return acc;
                    }, {})
                }
            };
        });

        res.json({
            year,
            month,
            columns: services,
            rows: matrix
        });

    } catch (err) {
        console.error('Matrix Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /billing/hidden-clients?year=X&month=Y
 * Devuelve clientes asignados a ese año que están ocultos en ese período
 */
router.get('/hidden-clients', async (req, res) => {
    try {
        const { year, month } = req.query;
        if (!year || !month) return res.status(400).json({ error: 'Year and month required' });

        const yyyymm = parseInt(year) * 100 + parseInt(month);

        // Solo clientes asignados a este año
        const { data: assignments } = await supabase
            .from('client_year_assignments')
            .select('client_id')
            .eq('fiscal_year', parseInt(year))
            .eq('is_active', true);

        const assignedIds = (assignments || []).map(a => a.client_id);
        if (assignedIds.length === 0) return res.json({ hidden: [] });

        const { data: allHidden, error } = await supabase
            .from('clients')
            .select('id, name, hidden_from_yyyymm, visible_from_yyyymm')
            .in('id', assignedIds)
            .eq('is_active', true)
            .not('hidden_from_yyyymm', 'is', null)
            .lte('hidden_from_yyyymm', yyyymm)
            .order('name');

        if (error) return res.status(500).json({ error: error.message });

        // Excluir los que ya fueron reactivados antes o en este mes
        const hidden = (allHidden || []).filter(c =>
            c.visible_from_yyyymm == null || c.visible_from_yyyymm > yyyymm
        );

        res.json({ hidden });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /billing/hide-client
 * Oculta un cliente a partir del mes indicado (solo visual, no borra datos)
 */
router.post('/hide-client', async (req, res) => {
    try {
        const schema = Joi.object({
            client_id:    Joi.string().uuid().required(),
            fiscal_year:  Joi.number().integer().required(),
            fiscal_month: Joi.number().integer().min(1).max(12).required(),
        });
        const { error, value } = schema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const yyyymm = value.fiscal_year * 100 + value.fiscal_month;
        const { error: updateError } = await supabase
            .from('clients')
            .update({ hidden_from_yyyymm: yyyymm, visible_from_yyyymm: null })
            .eq('id', value.client_id);

        if (updateError) return res.status(500).json({ error: updateError.message });

        const { userId, userEmail } = extractUser(req);
        logChange(supabase, {
            module: 'billing', table: 'clients', recordId: value.client_id,
            recordLabel: `Cliente oculto desde ${value.fiscal_year}/${String(value.fiscal_month).padStart(2, '0')}`,
            operation: 'update', fieldName: 'hidden_from_yyyymm', newValue: String(yyyymm),
            userId, userEmail,
        }).catch(() => {});

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /billing/unhide-client
 * Reactiva un cliente oculto
 */
router.post('/unhide-client', async (req, res) => {
    try {
        const schema = Joi.object({
            client_id:    Joi.string().uuid().required(),
            fiscal_year:  Joi.number().integer().required(),
            fiscal_month: Joi.number().integer().min(1).max(12).required(),
        });
        const { error, value } = schema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        // Marcar visible_from_yyyymm en lugar de borrar hidden_from_yyyymm,
        // para preservar el historial en meses anteriores
        const visibleFrom = value.fiscal_year * 100 + value.fiscal_month;
        const { error: updateError } = await supabase
            .from('clients')
            .update({ visible_from_yyyymm: visibleFrom })
            .eq('id', value.client_id);

        if (updateError) return res.status(500).json({ error: updateError.message });

        const { userId, userEmail } = extractUser(req);
        logChange(supabase, {
            module: 'billing', table: 'clients', recordId: value.client_id,
            recordLabel: `Cliente reactivado en Billing Matrix desde ${value.fiscal_year}/${String(value.fiscal_month).padStart(2, '0')}`,
            operation: 'update', fieldName: 'visible_from_yyyymm', newValue: String(visibleFrom),
            userId, userEmail,
        }).catch(() => {});

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /matrix/save
 * Update a specific cell (Service Amount or Metadata)
 */
router.post('/matrix/save', async (req, res) => {
    try {
        const { year, month, client_id, field, value, service_id, comment, assigned_to } = req.body;

        console.log(`Saving matrix cell: ${field} = ${value} (comment: ${comment}, assigned: ${assigned_to}) for Client ${client_id}`);

        // 1. Get or Create Monthly Billing Record
        let { data: billing, error: getError } = await supabase
            .from('monthly_billing')
            .select('id, total_ad_investment, applied_fee_percentage, platform_count, platform_costs, cell_metadata')
            .eq('client_id', client_id)
            .eq('fiscal_year', year)
            .eq('fiscal_month', month)
            .single();

        if (getError && getError.code === 'PGRST116') {
            // Create if missing
            const { data: newBilling, error: createError } = await supabase
                .from('monthly_billing')
                .insert({
                    client_id,
                    fiscal_year: year,
                    fiscal_month: month,
                    total_ad_investment: 0,
                    applied_fee_percentage: 10,
                    platform_count: 1,
                    cell_metadata: {}
                })
                .select()
                .single();

            if (createError) throw createError;
            billing = newBilling;
        } else if (getError) {
            throw getError;
        }

        // 2. Handle Update Logic
        if (field === 'vencimiento') {
            const { data: contracts } = await supabase
                .from('contracts')
                .select('id, effective_to')
                .eq('client_id', client_id)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1);

            if (contracts && contracts.length > 0) {
                const contract = contracts[0];
                let newDate = new Date(contract.effective_to || new Date());
                newDate.setDate(parseInt(value)); // Set day
                await supabase.from('contracts').update({ effective_to: newDate.toISOString() }).eq('id', contract.id);
            }

        } else if (field === 'vertical') {
            const { data: vert } = await supabase
                .from('verticals')
                .select('id')
                .ilike('name', value)
                .maybeSingle();

            if (vert) {
                await supabase.from('clients').update({ vertical_id: vert.id }).eq('id', client_id);
            }

        } else if (field === 'service_amount') {
            if (!service_id) throw new Error('Service ID required for service amount update');

            const { data: service } = await supabase.from('services').select('department_id, name').eq('id', service_id).single();
            if (!service) throw new Error('Service not found');

            // Handle Manual Override Logic (Strategy)
            const { data: stratService } = await supabase.from('services').select('id').eq('code', 'PAID_MEDIA_STRATEGY').maybeSingle();

            if (stratService && stratService.id === service_id) {
                await supabase.from('monthly_billing')
                    .update({ is_manual_override: true, fee_paid: parseFloat(value) })
                    .eq('id', billing.id);
            }

            // Upsert Detail
            const { data: existingDetail } = await supabase
                .from('billing_details')
                .select('id, cell_metadata, amount')
                .eq('monthly_billing_id', billing.id)
                .eq('service_id', service_id)
                .single();

            const numValue = parseFloat(value);
            const isEmptyValue = !value || value === '' || numValue === 0 || isNaN(numValue);
            const hasComment = (comment !== undefined && comment !== null && comment !== '') || (assigned_to && assigned_to.length > 0);

            if (isEmptyValue && !hasComment && existingDetail) {
                await supabase.from('billing_details').delete().eq('id', existingDetail.id);
            } else if (!isEmptyValue || hasComment) {
                // Prepare Updates
                const payload = {
                    amount: isEmptyValue ? 0 : numValue
                };

                // Sync Notes (Legacy/Simple)
                if (comment !== undefined) payload.notes = comment;

                // Sync Cell Metadata (Rich)
                if (comment !== undefined || assigned_to !== undefined) {
                    const currentMeta = existingDetail?.cell_metadata || {};
                    const newMeta = {
                        ...currentMeta,
                        updated_at: new Date().toISOString()
                    };
                    if (comment !== undefined) newMeta.comment = comment;
                    if (assigned_to !== undefined) newMeta.assigned_to = assigned_to;

                    payload.cell_metadata = newMeta;
                }

                if (existingDetail) {
                    await supabase.from('billing_details').update(payload).eq('id', existingDetail.id);
                } else {
                    await supabase.from('billing_details').insert({
                        monthly_billing_id: billing.id,
                        department_id: service.department_id,
                        service_id: service_id,
                        service_name: service.name,
                        amount: isEmptyValue ? 0 : numValue,
                        notes: comment || null,
                        cell_metadata: payload.cell_metadata || {}
                    });
                }

                // Notificar a usuarios asignados en esta celda
                if (assigned_to?.length > 0) {
                    const title = '📋 Has sido asignado en Billing Matrix';
                    const body = `Cliente · ${field || service_id} · ${year}/${month}${comment ? `\n"${comment}"` : ''}`;
                    createNotifications(assigned_to, 'note_assigned', title, body, 'billing_note', `${client_id}-${service_id}-${year}-${month}`)
                        .catch(e => console.error('Billing notif error:', e.message));
                }
            }

            // Log cambio de celda: detecta create/update/delete, omite guardados de solo-comentario
            if (value !== undefined && value !== null) {
                const { userId: _bUid, userEmail: _bUe } = extractUser(req);
                let _billingOp;
                if (isEmptyValue && !hasComment && existingDetail) {
                    _billingOp = 'delete';
                } else if (!existingDetail && !isEmptyValue) {
                    _billingOp = 'create';
                } else if (existingDetail && !isEmptyValue && Math.abs(numValue - parseFloat(existingDetail.amount || 0)) > 0.001) {
                    _billingOp = 'update';
                }
                if (_billingOp) {
                    logChange(supabase, {
                        module: 'billing',
                        table: 'billing_details',
                        recordId: existingDetail?.id || null,
                        recordLabel: `${service.name} — ${year}/${String(month).padStart(2, '0')}`,
                        operation: _billingOp,
                        fieldName: 'amount',
                        oldValue: existingDetail ? String(parseFloat(existingDetail.amount || 0)) : null,
                        newValue: _billingOp !== 'delete' ? String(numValue) : null,
                        userId: _bUid, userEmail: _bUe,
                    }).catch(() => {});
                }
            }

        } else {
            // Metadata Update (Header Cells)
            const updateData = {};
            if (field === 'investment') updateData.total_actual_investment = value;
            if (field === 'fee_pct') updateData.applied_fee_percentage = value;
            if (field === 'platform_count') updateData.platform_count = value;

            // Updated Cell Metadata (Header)
            if (comment !== undefined || assigned_to !== undefined) {
                const currentMeta = billing.cell_metadata || {};
                const cellData = currentMeta[field] || {};

                const newCellData = {
                    ...cellData,
                    updated_at: new Date().toISOString()
                };

                // Update properties if provided
                if (comment !== undefined) newCellData.comment = comment;
                if (assigned_to !== undefined) newCellData.assigned_to = assigned_to;

                // Si completely empty, limpiar; si no, guardar
                if ((!newCellData.comment) && (!newCellData.assigned_to || newCellData.assigned_to.length === 0)) {
                    delete currentMeta[field];
                } else {
                    currentMeta[field] = newCellData;
                    // Notificar usuarios asignados en header cell
                    if (assigned_to?.length > 0) {
                        const title = '📋 Has sido asignado en Billing Matrix';
                        const body = `Campo: ${field} · ${year}/${month}${comment ? `\n"${comment}"` : ''}`;
                        createNotifications(assigned_to, 'note_assigned', title, body, 'billing_note', `${client_id}-${field}-${year}-${month}`)
                            .catch(e => console.error('Billing header notif error:', e.message));
                    }
                }

                updateData.cell_metadata = currentMeta;
            }

            // ... Recalculate Fees logic (simplified copy from original) ...
            if (['investment', 'fee_pct', 'platform_count'].includes(field)) {
                const { data: clientData } = await supabase.from('clients').select('fee_config').eq('id', client_id).single();
                const feeConfig = clientData?.fee_config || { fee_type: 'fixed', fixed_pct: 10, platform_cost_first: 700, platform_cost_additional: 300 };

                const inv = field === 'investment' ? parseFloat(value) : (billing.total_actual_investment || 0);
                const count = field === 'platform_count' ? parseInt(value) : (billing.platform_count || 1);

                let feePct = 0;
                if (field === 'fee_pct') {
                    feePct = parseFloat(value);
                } else if (feeConfig.fee_type === 'variable') {
                    // ... variable logic ...
                    if (feeConfig.variable_ranges?.length > 0) {
                        const range = feeConfig.variable_ranges.find(r => {
                            const min = Number(r.min || 0);
                            const max = (r.max === null || r.max === undefined) ? Infinity : Number(r.max);
                            return inv >= min && inv <= max;
                        });
                        feePct = range ? Number(range.pct) : 0;
                    }
                } else {
                    feePct = billing.applied_fee_percentage || Number(feeConfig.fixed_pct || 0);
                }

                const usePlatformCosts = feeConfig.use_platform_costs === true;
                const shouldApply = inv > 0 || count > 1;
                let platformCost = 0;
                if (usePlatformCosts && shouldApply) {
                    const calcCount = Math.max(1, count);
                    platformCost = (Number(feeConfig.platform_cost_first) || 0) + ((calcCount - 1) * (Number(feeConfig.platform_cost_additional) || 0));
                }

                const computedFee = (inv * (feePct / 100)) + platformCost;

                updateData.platform_costs = Math.round(platformCost);
                updateData.fee_paid = Math.round(computedFee);
                updateData.applied_fee_percentage = feePct;

                // Sync Strategy Service Detail
                const { data: stratService } = await supabase
                    .from('services')
                    .select('id, department_id, name')
                    .eq('code', 'PAID_MEDIA_STRATEGY')
                    .maybeSingle();

                if (stratService) {
                    await supabase.from('billing_details').upsert({
                        monthly_billing_id: billing.id,
                        service_id: stratService.id,
                        department_id: stratService.department_id,
                        service_name: stratService.name,
                        amount: computedFee
                    }, { onConflict: 'monthly_billing_id, service_id' });
                }
            }

            if (Object.keys(updateData).length > 0) {
                if (field === 'investment' || field === 'fee_pct') {
                    updateData.is_manual_override = true;
                }
                await supabase.from('monthly_billing').update(updateData).eq('id', billing.id);
            }
        }

        res.json({ success: true });

    } catch (err) {
        console.error('Save Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /matrix/row
 * Remove a billing row (monthly_billing + billing_details)
 */
router.delete('/matrix/row', async (req, res) => {
    try {
        const { year, month, client_id } = req.query;

        if (!year || !month || !client_id) {
            return res.status(400).json({ error: 'year, month and client_id are required' });
        }

        // Find the monthly_billing record
        const { data: billing, error: findError } = await supabase
            .from('monthly_billing')
            .select('id')
            .eq('client_id', client_id)
            .eq('fiscal_year', year)
            .eq('fiscal_month', month)
            .single();

        if (findError && findError.code === 'PGRST116') {
            return res.json({ success: true, message: 'No billing record found, nothing to delete' });
        }
        if (findError) throw findError;

        // Delete billing_details first (FK)
        await supabase.from('billing_details').delete().eq('monthly_billing_id', billing.id);

        // Delete the monthly_billing record
        await supabase.from('monthly_billing').delete().eq('id', billing.id);

        console.log(`Deleted billing row for client ${client_id}, ${year}/${month}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete Row Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /matrix/row/duplicate
 * Duplicate a billing row (monthly_billing + billing_details)
 * Creates a copy with the same amounts for the same client/month
 */
router.post('/matrix/row/duplicate', async (req, res) => {
    try {
        const { year, month, client_id } = req.body;

        if (!year || !month || !client_id) {
            return res.status(400).json({ error: 'year, month and client_id are required' });
        }

        // Find the source monthly_billing record
        const { data: source, error: findError } = await supabase
            .from('monthly_billing')
            .select('*')
            .eq('client_id', client_id)
            .eq('fiscal_year', year)
            .eq('fiscal_month', month)
            .single();

        if (findError) throw findError;
        if (!source) return res.status(404).json({ error: 'Source billing record not found' });

        // Find source billing_details
        const { data: sourceDetails } = await supabase
            .from('billing_details')
            .select('*')
            .eq('monthly_billing_id', source.id);

        // Note: If there's a unique constraint on (client_id, fiscal_year, fiscal_month),
        // duplicating in the same month for the same client will fail.
        // In that case, we just return the existing data as confirmation.
        // The frontend will show a toast about it.
        res.json({
            success: true,
            source_billing: source,
            source_details: sourceDetails || [],
            message: 'Row data retrieved for duplication'
        });

    } catch (err) {
        console.error('Duplicate Row Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /billing
 * Get all billing records for a year/month
 */
router.get('/', async (req, res) => {
    try {
        const { year, month } = req.query;

        console.log('Fetching billing matrix for', year, month);

        if (!year || !month) {
            return res.status(400).json({ error: 'Year and month are required' });
        }

        const { data: billing_records, error } = await supabase
            .from('monthly_billing')
            .select(`
                *,
                client:clients(name)
            `)
            .eq('fiscal_year', parseInt(year))
            .eq('fiscal_month', parseInt(month))
            .order('client_name');

        if (error) {
            console.error('Error fetching billing list:', error);
            return res.status(500).json({ error: 'Failed to fetch billing list' });
        }

        res.json({
            success: true,
            billing_records
        });

    } catch (err) {
        console.error('Error in billing list:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /billing/calculate
 * Calculate suggested billing for a client/period
 * Returns suggestions but DOES NOT save automatically
 */
router.post('/calculate', async (req, res) => {
    try {
        const schema = Joi.object({
            client_id: Joi.string().uuid().required(),
            fiscal_year: Joi.number().integer().min(2020).required(),
            fiscal_month: Joi.number().integer().min(1).max(12).required(),
            save: Joi.boolean().default(false) // Explicit save flag
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { client_id, fiscal_year, fiscal_month, save } = value;

        // Call SQL function (dry_run = !save)
        const { data, error: calcError } = await supabase.rpc(
            'calculate_monthly_billing',
            {
                p_client_id: client_id,
                p_fiscal_year: fiscal_year,
                p_fiscal_month: fiscal_month,
                p_dry_run: !save
            }
        );

        if (calcError) {
            console.error('Calculation error:', calcError);
            return res.status(500).json({ error: 'Failed to calculate billing', details: calcError.message });
        }

        res.json({
            success: true,
            saved: save,
            message: save ? 'Billing calculated and saved' : 'Billing calculated (not saved - preview only)',
            calculation: data[0],
            note: 'All values are editable. Use PATCH /billing/:id to modify.'
        });

    } catch (err) {
        console.error('Error in billing calculation:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /billing/:client_id/:year/:month
 * Get billing details for a client/period
 */
router.get('/:client_id/:year/:month', async (req, res) => {
    try {
        const { client_id, year, month } = req.params;

        // Get monthly billing
        const { data: billing, error: billingError } = await supabase
            .from('monthly_billing')
            .select(`
        *,
        client:clients(name, legal_name),
        details:billing_details(
          *,
          department:departments(name, code),
          service:services(name, code)
        )
      `)
            .eq('client_id', client_id)
            .eq('fiscal_year', parseInt(year))
            .eq('fiscal_month', parseInt(month))
            .single();

        if (billingError && billingError.code !== 'PGRST116') {
            return res.status(500).json({ error: 'Failed to fetch billing', details: billingError.message });
        }

        if (!billing) {
            return res.status(404).json({ error: 'Billing not found for this period' });
        }

        res.json({
            success: true,
            billing,
            editable: !billing.is_finalized,
            note: 'Use PATCH /billing/:id to modify values manually'
        });

    } catch (err) {
        console.error('Error fetching billing:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PATCH /billing/:id
 * Manually edit billing values (FULL EXCEL-LIKE FLEXIBILITY)
 */
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const schema = Joi.object({
            applied_fee_percentage: Joi.number().min(0).max(100),
            platform_costs: Joi.number().min(0),
            fee_paid: Joi.number().min(0),
            immedia_total: Joi.number().min(0),
            imcontent_total: Joi.number().min(0),
            immoralia_total: Joi.number().min(0),
            immoral_general_total: Joi.number().min(0),
            notes: Joi.string().allow(''),
            is_finalized: Joi.boolean()
        }).min(1); // At least one field required

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        // Check if period is closed
        const { data: billing } = await supabase
            .from('monthly_billing')
            .select('fiscal_year, fiscal_month')
            .eq('id', id)
            .single();

        if (billing) {
            const { data: period } = await supabase.rpc('is_period_closed', {
                p_fiscal_year: billing.fiscal_year,
                p_fiscal_month: billing.fiscal_month
            });

            if (period) {
                return res.status(403).json({
                    error: 'Cannot edit billing for closed period',
                    note: 'Admin must reopen period first'
                });
            }
        }

        // Update billing
        const { data, error: updateError } = await supabase
            .from('monthly_billing')
            .update(value)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return res.status(500).json({ error: 'Failed to update billing', details: updateError.message });
        }

        res.json({
            success: true,
            message: 'Billing updated successfully',
            billing: data,
            note: 'Values updated manually as requested'
        });

    } catch (err) {
        console.error('Error updating billing:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /billing/details
 * Add/edit individual service line items (like Excel rows)
 */
router.post('/details', async (req, res) => {
    try {
        const schema = Joi.object({
            monthly_billing_id: Joi.string().uuid().required(),
            department_id: Joi.string().uuid().required(),
            service_id: Joi.string().uuid().allow(null),
            service_name: Joi.string().required(),
            amount: Joi.number().min(0).required(),
            is_fee_paid: Joi.boolean().default(false),
            notes: Joi.string().allow('')
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { data, error: insertError } = await supabase
            .from('billing_details')
            .insert(value)
            .select()
            .single();

        if (insertError) {
            return res.status(500).json({ error: 'Failed to add billing detail', details: insertError.message });
        }

        res.json({
            success: true,
            message: 'Service line added',
            detail: data
        });

    } catch (err) {
        console.error('Error adding billing detail:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PATCH /billing/details/:id
 * Edit individual service line item
 */
router.patch('/details/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const schema = Joi.object({
            service_name: Joi.string(),
            amount: Joi.number().min(0),
            notes: Joi.string().allow('')
        }).min(1);

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { data, error: updateError } = await supabase
            .from('billing_details')
            .update(value)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return res.status(500).json({ error: 'Failed to update detail', details: updateError.message });
        }

        res.json({
            success: true,
            message: 'Service line updated',
            detail: data
        });

    } catch (err) {
        console.error('Error updating detail:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /billing/details/:id
 * Delete service line item
 */
router.delete('/details/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error: deleteError } = await supabase
            .from('billing_details')
            .delete()
            .eq('id', id);

        if (deleteError) {
            return res.status(500).json({ error: 'Failed to delete detail', details: deleteError.message });
        }

        res.json({
            success: true,
            message: 'Service line deleted'
        });

    } catch (err) {
        console.error('Error deleting detail:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /client-month-detail?year=YYYY&month=MM&client_id=UUID
 * Service breakdown for a single client in a single month (for the detail modal).
 */
router.get('/client-month-detail', async (req, res) => {
    try {
        const { year, month, client_id } = req.query;
        if (!year || !month || !client_id) {
            return res.status(400).json({ error: 'year, month and client_id required' });
        }

        const { data: billing } = await supabase
            .from('monthly_billing')
            .select('id, fee_paid, total_actual_investment, applied_fee_percentage, platform_count, platform_costs')
            .eq('client_id', client_id)
            .eq('fiscal_year', parseInt(year))
            .eq('fiscal_month', parseInt(month))
            .maybeSingle();

        if (!billing) return res.json({ services: [], fee_paid: 0, total: 0 });

        // Fetch PAID_MEDIA_STRATEGY id to exclude from details
        const { data: stratSvc } = await supabase
            .from('services')
            .select('id')
            .eq('code', 'PAID_MEDIA_STRATEGY')
            .maybeSingle();
        const stratSvcId = stratSvc?.id || null;

        // All billing_details except the auto-calculated fee (we use fee_paid instead)
        let q = supabase
            .from('billing_details')
            .select('amount, service_id, service_name, department_id')
            .eq('monthly_billing_id', billing.id)
            .gt('amount', 0);
        if (stratSvcId) q = q.neq('service_id', stratSvcId);
        const { data: details } = await q;

        // Enrich with department name
        const deptIds = [...new Set((details || []).map(d => d.department_id).filter(Boolean))];
        let deptMap = {};
        if (deptIds.length > 0) {
            const { data: depts } = await supabase
                .from('departments')
                .select('id, name, code')
                .in('id', deptIds);
            (depts || []).forEach(d => { deptMap[d.id] = { name: d.name, code: d.code }; });
        }

        const feePaid = Number(billing.fee_paid || 0);

        const services = (details || [])
            .map(d => ({
                service_name: d.service_name,
                department: deptMap[d.department_id]?.name || '',
                department_code: deptMap[d.department_id]?.code || '',
                amount: Number(d.amount || 0),
            }))
            .sort((a, b) => b.amount - a.amount);

        const otherTotal = services.reduce((s, d) => s + d.amount, 0);
        const total = otherTotal + feePaid;

        res.json({
            fee_paid: feePaid,
            investment: Number(billing.total_actual_investment || 0),
            fee_pct: Number(billing.applied_fee_percentage || 0),
            services,
            total,
        });
    } catch (err) {
        console.error('Error in client-month-detail:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /annual-client-summary?year=YYYY
 * Returns all clients with their grand_total per month for the full year.
 * Does NOT filter hidden clients — shows everyone regardless of visibility settings.
 */
router.get('/annual-client-summary', async (req, res) => {
    try {
        const { year } = req.query;
        if (!year) return res.status(400).json({ error: 'Year required' });

        const yearInt = parseInt(year);

        // All clients assigned to this year (no hidden filter)
        const { data: clientAssignments } = await supabase
            .from('client_year_assignments')
            .select('client_id')
            .eq('fiscal_year', yearInt)
            .eq('is_active', true);

        const assignedClientIds = (clientAssignments || []).map(a => a.client_id);
        if (assignedClientIds.length === 0) {
            return res.json({ year: yearInt, clients: [] });
        }

        const { data: clients, error: clientError } = await supabase
            .from('clients')
            .select('id, name, vertical:verticals(code, name)')
            .in('id', assignedClientIds)
            .eq('is_active', true)
            .order('name');

        if (clientError) throw clientError;

        // Fetch PAID_MEDIA_STRATEGY service id (fee column managed by auto-sync).
        // Its billing_details entry can be stale between syncs, so we use
        // monthly_billing.fee_paid as the authoritative value instead.
        const { data: stratSvc } = await supabase
            .from('services')
            .select('id')
            .eq('code', 'PAID_MEDIA_STRATEGY')
            .maybeSingle();
        const stratSvcId = stratSvc?.id || null;

        // All monthly_billing rows for this year — includes fee_paid (always up-to-date)
        const { data: billingRows, error: billingError } = await supabase
            .from('monthly_billing')
            .select('id, client_id, fiscal_month, fee_paid')
            .eq('fiscal_year', yearInt)
            .in('client_id', assignedClientIds);

        if (billingError) throw billingError;

        // Sum billing_details.amount per monthly_billing_id,
        // excluding PAID_MEDIA_STRATEGY (we use fee_paid from monthly_billing instead)
        const billingIds = (billingRows || []).map(r => r.id);
        let details = [];
        if (billingIds.length > 0) {
            let q = supabase
                .from('billing_details')
                .select('monthly_billing_id, amount')
                .in('monthly_billing_id', billingIds);
            if (stratSvcId) q = q.neq('service_id', stratSvcId);
            const { data: d, error: dErr } = await q;
            if (dErr) throw dErr;
            details = d || [];
        }

        // Sum non-strategy details per billing record
        const detailTotals = {};
        details.forEach(d => {
            detailTotals[d.monthly_billing_id] = (detailTotals[d.monthly_billing_id] || 0) + Number(d.amount || 0);
        });

        // Build map: client_id -> month (1-12) -> total
        // total = other services + fee_paid (authoritative fee, same as Billing Matrix shows)
        const billingMap = {};
        (billingRows || []).forEach(r => {
            if (!billingMap[r.client_id]) billingMap[r.client_id] = {};
            const otherServices = detailTotals[r.id] || 0;
            const fee = Number(r.fee_paid || 0);
            billingMap[r.client_id][r.fiscal_month] = otherServices + fee;
        });

        const result = (clients || []).map(c => {
            const months = Array.from({ length: 12 }, (_, i) => billingMap[c.id]?.[i + 1] || 0);
            const annual = months.reduce((s, v) => s + v, 0);
            return {
                client_id: c.id,
                client_name: c.name,
                vertical: c.vertical?.name || c.vertical?.code || '',
                months,
                annual,
            };
        });

        res.json({ year: yearInt, clients: result });
    } catch (err) {
        console.error('Error fetching annual client summary:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
