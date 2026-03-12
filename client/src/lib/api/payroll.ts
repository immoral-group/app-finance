import { fetchApi } from './client';

export interface Employee {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    employee_code: string;
    position: string;
    department_id: string;
    primary_department_id: string;
    current_salary: number;
    is_active: boolean;
    email?: string;
    hire_date?: string;
    currency?: 'EUR' | 'USD';
    department?: { id: string; name: string; code: string };
}

export interface CreateEmployeeDTO {
    employee_code?: string;
    first_name: string;
    last_name: string;
    email: string;
    hire_date: string;
    current_salary: number;
    position: string;
    primary_department_id: string;
    is_active?: boolean;
    currency?: 'USD' | 'EUR';
}

export interface UpdateEmployeeDTO {
    first_name?: string;
    last_name?: string;
    email?: string;
    position?: string;
    primary_department_id?: string;
    is_active?: boolean;
    employee_code?: string;
    currency?: 'EUR' | 'USD';
}

export interface PayrollRecord {
    id: string;
    employee_id: string;
    employee: { full_name: string; position: string };
    fiscal_year: number;
    fiscal_month: number;
    base_salary: number;
    bonuses: number;
    variable_pay: number;
    gross_pay: number;
    net_pay: number;
    total_company_cost: number;
    is_paid: boolean;
}

export const payrollApi = {
    // Employees
    getEmployees: () => {
        return fetchApi<{ employees: Employee[] }>('/employees', { service: 'PAYROLL' });
    },

    getEmployee: (id: string) => {
        return fetchApi<{ employee: Employee & { salary_history: any[] } }>(`/employees/${id}`, { service: 'PAYROLL' });
    },

    createEmployee: (data: CreateEmployeeDTO) => {
        return fetchApi<{ employee: Employee }>('/employees', {
            service: 'PAYROLL',
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    updateEmployee: (id: string, data: UpdateEmployeeDTO) => {
        return fetchApi<{ employee: Employee }>(`/employees/${id}`, {
            service: 'PAYROLL',
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },

    deactivateEmployee: (id: string) => {
        return fetchApi(`/employees/${id}`, {
            service: 'PAYROLL',
            method: 'DELETE',
        });
    },

    deleteEmployee: (id: string) => {
        return fetchApi(`/employees/${id}/permanent`, {
            service: 'PAYROLL',
            method: 'DELETE',
        });
    },

    updateSalary: (id: string, data: { new_salary: number; effective_from: string; change_reason: string }) => {
        return fetchApi(`/employees/${id}/salary`, {
            service: 'PAYROLL',
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },

    // Payroll
    getPayroll: (year: number, month: number) => {
        return fetchApi<{ payroll: PayrollRecord[] }>(`/payroll/${year}/${month}`, { service: 'PAYROLL' });
    },

    generatePayroll: (year: number, month: number) => {
        return fetchApi('/payroll/generate', {
            service: 'PAYROLL',
            method: 'POST',
            body: JSON.stringify({ fiscal_year: year, fiscal_month: month })
        });
    },

    updatePayrollItem: (id: string, data: Partial<PayrollRecord>) => {
        return fetchApi(`/payroll/${id}`, {
            service: 'PAYROLL',
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },
};

