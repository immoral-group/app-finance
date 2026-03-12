import express from 'express';
import Joi from 'joi';
import supabase from '../config/supabase.js';

const router = express.Router();

// ================================================
// EMPLOYEE ENDPOINTS
// ================================================

/**
 * GET /employees
 * List all employees
 */
router.get('/', async (req, res) => {
    try {
        const { is_active, department_id } = req.query;

        // Try with department join first
        let query = supabase
            .from('employees')
            .select(`*, department:departments(id, name, code)`)
            .order('last_name');

        if (is_active !== undefined) {
            query = query.eq('is_active', is_active === 'true');
        }
        if (department_id) {
            query = query.eq('primary_department_id', department_id);
        }

        let { data, error } = await query;

        // If join fails (e.g. departments table missing), fall back to simple select
        if (error) {
            console.warn('Join with departments failed, falling back to simple select:', error.message);
            const fallback = supabase.from('employees').select('*').order('last_name');
            if (is_active !== undefined) fallback.eq('is_active', is_active === 'true');
            if (department_id) fallback.eq('primary_department_id', department_id);
            const result = await fallback;
            data = result.data;
            error = result.error;
        }

        if (error) {
            return res.status(500).json({ error: 'Failed to fetch employees', details: error.message });
        }

        res.json({
            success: true,
            total: data.length,
            employees: data
        });

    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


/**
 * GET /employees/:id
 * Get employee details with salary history
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: employee, error } = await supabase
            .from('employees')
            .select(`
        *,
        department:departments(id, name, code),
        salary_history(
          old_salary,
          new_salary,
          effective_from,
          effective_to,
          change_reason
        )
      `)
            .eq('id', id)
            .single();

        if (error) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        res.json({
            success: true,
            employee
        });

    } catch (err) {
        console.error('Error fetching employee:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /employees
 * Create new employee
 */
router.post('/', async (req, res) => {
    try {
        const schema = Joi.object({
            employee_code: Joi.string().optional(),
            first_name: Joi.string().required(),
            last_name: Joi.string().required(),
            email: Joi.string().email().required(),
            hire_date: Joi.date().iso().required(),
            current_salary: Joi.number().min(0).required(),
            position: Joi.string().required(),
            primary_department_id: Joi.string().uuid().required(),
            is_active: Joi.boolean().default(true),
            currency: Joi.string().valid('USD', 'EUR').optional()
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        // Auto-generate employee_code if not provided
        if (!value.employee_code) {
            const timestamp = Date.now().toString().slice(-6);
            const initials = (value.first_name[0] + value.last_name[0]).toUpperCase();
            value.employee_code = `EMP-${initials}${timestamp}`;
        }

        const insertData = { ...value };

        const { data: employee, error: createError } = await supabase
            .from('employees')
            .insert(insertData)
            .select()
            .single();

        if (createError) {
            return res.status(500).json({ error: 'Failed to create employee', details: createError.message });
        }

        // Create initial salary history
        await supabase
            .from('salary_history')
            .insert({
                employee_id: employee.id,
                old_salary: null,
                new_salary: value.current_salary,
                effective_from: value.hire_date,
                change_reason: 'Initial salary'
            });

        res.json({
            success: true,
            message: 'Employee created successfully',
            employee
        });

    } catch (err) {
        console.error('Error creating employee:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PATCH /employees/:id/salary
 * Update employee salary (creates history)
 */
router.patch('/:id/salary', async (req, res) => {
    try {
        const { id } = req.params;

        const schema = Joi.object({
            new_salary: Joi.number().min(0).required(),
            effective_from: Joi.date().iso().required(),
            change_reason: Joi.string().allow('', null).optional().default('Sin motivo especificado'),
            approved_by: Joi.string().uuid().allow(null)
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        // Call SQL function to update salary with history
        const { data, error: updateError } = await supabase.rpc(
            'update_employee_salary',
            {
                p_employee_id: id,
                p_new_salary: value.new_salary,
                p_effective_from: value.effective_from,
                p_change_reason: value.change_reason,
                p_approved_by: value.approved_by
            }
        );

        if (updateError) {
            return res.status(500).json({ error: 'Failed to update salary', details: updateError.message });
        }

        res.json({
            success: true,
            message: 'Salary updated successfully',
            note: 'Salary history has been recorded'
        });

    } catch (err) {
        console.error('Error updating salary:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PATCH /employees/:id
 * Update employee general data (name, position, email, department, is_active)
 */
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const schema = Joi.object({
            first_name: Joi.string(),
            last_name: Joi.string(),
            email: Joi.string().email(),
            position: Joi.string(),
            primary_department_id: Joi.string().uuid(),
            is_active: Joi.boolean(),
            employee_code: Joi.string(),
            currency: Joi.string().valid('USD', 'EUR')
        }).min(1);

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { data: employee, error: updateError } = await supabase
            .from('employees')
            .update(value)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return res.status(500).json({ error: 'Failed to update employee', details: updateError.message });
        }

        res.json({
            success: true,
            message: 'Employee updated successfully',
            employee
        });

    } catch (err) {
        console.error('Error updating employee:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /employees/:id/permanent
 * Hard delete: permanently removes the employee and their salary history
 * IMPORTANT: must be defined BEFORE DELETE /:id to avoid route conflict
 */
router.delete('/:id/permanent', async (req, res) => {
    try {
        const { id } = req.params;

        // Delete salary history first (FK constraint)
        await supabase.from('salary_history').delete().eq('employee_id', id);

        // Delete the employee
        const { error } = await supabase.from('employees').delete().eq('id', id);

        if (error) {
            return res.status(500).json({ error: 'Failed to delete employee', details: error.message });
        }

        res.json({ success: true, message: 'Employee permanently deleted' });

    } catch (err) {
        console.error('Error deleting employee:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /employees/:id
 * Soft delete: deactivates the employee (is_active = false)
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: employee, error } = await supabase
            .from('employees')
            .update({ is_active: false })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ error: 'Failed to deactivate employee', details: error.message });
        }

        res.json({
            success: true,
            message: 'Employee deactivated successfully',
            employee
        });

    } catch (err) {
        console.error('Error deactivating employee:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
