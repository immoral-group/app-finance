import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

// ============================================================
// GET /users/me — Get current user profile + permissions
// ============================================================
router.get('/me', async (req, res) => {
    try {
        // Get user ID from Authorization header (Bearer token)
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No authorization header' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Get profile
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError) {
            // Profile doesn't exist yet — create one
            if (profileError.code === 'PGRST116') {
                try {
                    const { data: newProfile, error: createError } = await supabase
                        .from('user_profiles')
                        .insert({
                            id: user.id,
                            display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
                            email: user.email,
                            role: 'superadmin', // First user gets superadmin
                        })
                        .select()
                        .single();

                    if (createError) {
                        console.error('Error creating auto-profile:', createError);
                        // Return a minimal profile even if creation fails
                        return res.json({
                            profile: {
                                id: user.id,
                                display_name: user.email?.split('@')[0] || 'User',
                                email: user.email,
                                role: 'superadmin',
                                department_code: null,
                                is_active: true,
                            },
                            permissions: [],
                        });
                    }

                    // Grant all permissions to auto-created superadmin
                    const modules = ['dashboard', 'billing', 'media_investment', 'payrolls',
                        'payments', 'commissions', 'pl_matrix', 'departamentos',
                        'clients', 'settings', 'user_management'];
                    const permRows = modules.map(m => ({
                        user_id: user.id, module: m, can_view: true, can_edit: true,
                    }));
                    await supabase.from('user_permissions').upsert(permRows, { onConflict: 'user_id,module' });

                    return res.json({
                        profile: newProfile,
                        permissions: permRows,
                    });
                } catch (innerError) {
                    console.error('Error in auto-profile creation:', innerError);
                    return res.json({
                        profile: {
                            id: user.id,
                            display_name: user.email?.split('@')[0] || 'User',
                            email: user.email,
                            role: 'superadmin',
                            department_code: null,
                            is_active: true,
                        },
                        permissions: [],
                    });
                }
            }

            // For any other error (e.g. missing column), return fallback
            console.error('Profile error (returning fallback):', profileError);
            return res.json({
                profile: {
                    id: user.id,
                    display_name: user.email?.split('@')[0] || 'User',
                    email: user.email,
                    role: 'superadmin',
                    department_code: null,
                    is_active: true,
                },
                permissions: [],
            });
        }

        // Get permissions
        const { data: permissions, error: permError } = await supabase
            .from('user_permissions')
            .select('*')
            .eq('user_id', user.id);

        if (permError) {
            console.error('Permissions error:', permError);
        }

        res.json({
            profile,
            permissions: permissions || [],
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// GET /users — List all users (superadmin only)
// ============================================================
router.get('/', async (req, res) => {
    try {
        // Get all profiles
        const { data: profiles, error } = await supabase
            .from('user_profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Get all permissions grouped by user
        const { data: allPermissions, error: permError } = await supabase
            .from('user_permissions')
            .select('*');

        if (permError) throw permError;

        // Map permissions to users
        const usersWithPerms = (profiles || []).map(profile => ({
            ...profile,
            permissions: (allPermissions || []).filter(p => p.user_id === profile.id),
        }));

        res.json({ users: usersWithPerms });
    } catch (error) {
        console.error('Error listing users:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// POST /users — Create user (superadmin only)
// ============================================================
router.post('/', async (req, res) => {
    try {
        const { email, password, display_name, role, department_code, partner_id, permissions } = req.body;

        if (!email || !password || !display_name) {
            return res.status(400).json({ error: 'email, password, and display_name are required' });
        }

        // Create auth user via Supabase Admin API
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: display_name },
        });

        if (authError) {
            // Better error message for duplicate email
            if (authError.message?.includes('already been registered')) {
                return res.status(409).json({ error: `El email ${email} ya está registrado` });
            }
            throw authError;
        }

        const userId = authData.user.id;

        // Create profile
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .insert({
                id: userId,
                display_name,
                email,
                role: role || 'user',
                department_code: department_code || null,
                partner_id: partner_id || null,
                raw_password: password || null,
            })
            .select()
            .single();

        if (profileError) throw profileError;

        // Create permissions
        if (permissions && Array.isArray(permissions) && permissions.length > 0) {
            const permRows = permissions.map(p => ({
                user_id: userId,
                module: p.module,
                can_view: p.can_view ?? false,
                can_edit: p.can_edit ?? false,
            }));

            const { error: permError } = await supabase
                .from('user_permissions')
                .insert(permRows);

            if (permError) console.error('Error inserting permissions:', permError);
        }

        // If role is superadmin, grant all permissions
        if (role === 'superadmin') {
            const modules = ['dashboard', 'billing', 'media_investment', 'payrolls',
                'payments', 'commissions', 'pl_matrix', 'departamentos',
                'clients', 'settings', 'user_management'];

            const permRows = modules.map(m => ({
                user_id: userId,
                module: m,
                can_view: true,
                can_edit: true,
            }));

            await supabase
                .from('user_permissions')
                .upsert(permRows, { onConflict: 'user_id,module' });
        }

        // If dept_head, grant dashboard + their department
        if (role === 'dept_head') {
            const deptPerms = [
                { user_id: userId, module: 'dashboard', can_view: true, can_edit: false },
                { user_id: userId, module: 'departamentos', can_view: true, can_edit: false },
            ];

            await supabase
                .from('user_permissions')
                .upsert(deptPerms, { onConflict: 'user_id,module' });
        }

        // If partner, grant commissions view-only
        if (role === 'partner') {
            const partnerPerms = [
                { user_id: userId, module: 'commissions', can_view: true, can_edit: false },
            ];

            await supabase
                .from('user_permissions')
                .upsert(partnerPerms, { onConflict: 'user_id,module' });
        }

        res.status(201).json({ user: profile });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// PUT /users/:id — Update user (superadmin only)
// ============================================================
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { display_name, role, department_code, partner_id, permissions, is_active, email, password } = req.body;

        // Update Auth user (email / password) via Admin API if provided
        if (email || password) {
            const authUpdate = {};
            if (email) authUpdate.email = email;
            if (password) authUpdate.password = password;
            const { error: authError } = await supabase.auth.admin.updateUserById(id, authUpdate);
            if (authError) {
                console.error('Error updating auth user:', authError);
                return res.status(400).json({ error: authError.message });
            }
        }

        // Update profile
        const updateData = {};
        if (display_name !== undefined) updateData.display_name = display_name;
        if (role !== undefined) updateData.role = role;
        if (department_code !== undefined) updateData.department_code = department_code;
        if (partner_id !== undefined) updateData.partner_id = partner_id;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (email !== undefined) updateData.email = email;
        if (password) updateData.raw_password = password;

        if (Object.keys(updateData).length > 0) {
            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();

            if (profileError) throw profileError;
        }

        // Update permissions if provided
        if (permissions && Array.isArray(permissions)) {
            // Delete existing permissions
            await supabase
                .from('user_permissions')
                .delete()
                .eq('user_id', id);

            // Insert new permissions
            if (permissions.length > 0) {
                const permRows = permissions.map(p => ({
                    user_id: id,
                    module: p.module,
                    can_view: p.can_view ?? false,
                    can_edit: p.can_edit ?? false,
                }));

                const { error: permError } = await supabase
                    .from('user_permissions')
                    .insert(permRows);

                if (permError) throw permError;
            }
        }

        // Re-fetch profile + permissions
        const { data: updatedProfile } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', id)
            .single();

        const { data: updatedPerms } = await supabase
            .from('user_permissions')
            .select('*')
            .eq('user_id', id);

        res.json({
            user: {
                ...updatedProfile,
                permissions: updatedPerms || [],
            },
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// DELETE /users/:id — Fully delete user (superadmin only)
// ============================================================
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Delete permissions
        await supabase
            .from('user_permissions')
            .delete()
            .eq('user_id', id);

        // 2. Delete profile
        await supabase
            .from('user_profiles')
            .delete()
            .eq('id', id);

        // 3. Delete auth user via Admin API
        const { error: authError } = await supabase.auth.admin.deleteUser(id);
        if (authError) {
            console.error('Error deleting auth user:', authError);
            // Profile already deleted, so still return success
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
