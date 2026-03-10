-- ================================================
-- IMMORAL ADMINISTRATIVE SYSTEM - DATABASE SCHEMA
-- ================================================
-- Sistema administrativo que replica los Excel de gestión
-- Módulos: P&L, Matriz Facturación, Inversión Publicitaria,
--          Negociación Fees, Comisiones, Gestión Pagos

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- ================================================
-- CORE: STRUCTURE & CONFIGURATION
-- ================================================

-- Companies (DMK, Infinite)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  legal_name VARCHAR(255),
  tax_id VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Departments (Imcontent, Immedia, Immoralia, Immoral General)
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(20) NOT NULL UNIQUE,
  description TEXT,
  is_general BOOLEAN DEFAULT false, -- true para "Immoral General"
  proration_percentage DECIMAL(5, 2) DEFAULT 0, -- % para prorrateo de gastos generales
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_proration CHECK (proration_percentage >= 0 AND proration_percentage <= 100)
);

-- Verticals (Content Creation, Consulting, etc.)
CREATE TABLE IF NOT EXISTS verticals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(20) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- MODULE 1: P&L (PRESUPUESTO vs REAL)
-- ================================================

-- Service Catalog (servicios por departamento)
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  service_type VARCHAR(50) DEFAULT 'revenue', -- 'revenue' o 'expense'
  category VARCHAR(100), -- Para agrupar servicios similares
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(department_id, code)
);

CREATE INDEX idx_services_department ON services(department_id);
CREATE INDEX idx_services_type ON services(service_type);

-- Expense Categories (Gastos de Personal, Comisiones, Marketing, etc.)
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(20) NOT NULL UNIQUE,
  parent_category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  is_general BOOLEAN DEFAULT false, -- true si se proratea entre departamentos
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Budget Lines (Presupuesto anual por servicio/gasto)
CREATE TABLE IF NOT EXISTS budget_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fiscal_year INTEGER NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
  line_type VARCHAR(20) NOT NULL CHECK (line_type IN ('revenue', 'expense')),
  
  -- Para ingresos
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  
  -- Para gastos
  expense_category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  
  -- Presupuesto mensual
  jan DECIMAL(12, 2) DEFAULT 0,
  feb DECIMAL(12, 2) DEFAULT 0,
  mar DECIMAL(12, 2) DEFAULT 0,
  apr DECIMAL(12, 2) DEFAULT 0,
  may DECIMAL(12, 2) DEFAULT 0,
  jun DECIMAL(12, 2) DEFAULT 0,
  jul DECIMAL(12, 2) DEFAULT 0,
  aug DECIMAL(12, 2) DEFAULT 0,
  sep DECIMAL(12, 2) DEFAULT 0,
  oct DECIMAL(12, 2) DEFAULT 0,
  nov DECIMAL(12, 2) DEFAULT 0,
  dec DECIMAL(12, 2) DEFAULT 0,
  
  annual_total DECIMAL(12, 2) GENERATED ALWAYS AS (
    jan + feb + mar + apr + may + jun + jul + aug + sep + oct + nov + dec
  ) STORED,
  
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT budget_line_reference CHECK (
    (line_type = 'revenue' AND service_id IS NOT NULL) OR
    (line_type = 'expense' AND expense_category_id IS NOT NULL)
  )
);

CREATE INDEX idx_budget_year ON budget_lines(fiscal_year);
CREATE INDEX idx_budget_department ON budget_lines(department_id);
CREATE INDEX idx_budget_type ON budget_lines(line_type);

-- Actual Revenue (Ingresos reales mensuales)
CREATE TABLE IF NOT EXISTS actual_revenue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month >= 1 AND fiscal_month <= 12),
  department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
  service_id UUID REFERENCES services(id) ON DELETE RESTRICT,
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT,
  reference_type VARCHAR(50), -- 'billing_matrix', 'manual', etc.
  reference_id UUID,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(fiscal_year, fiscal_month, department_id, service_id)
);

CREATE INDEX idx_actual_revenue_period ON actual_revenue(fiscal_year, fiscal_month);
CREATE INDEX idx_actual_revenue_department ON actual_revenue(department_id);

-- Actual Expenses (Gastos reales mensuales)
CREATE TABLE IF NOT EXISTS actual_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month >= 1 AND fiscal_month <= 12),
  department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
  expense_category_id UUID REFERENCES expense_categories(id) ON DELETE RESTRICT,
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT,
  payment_date DATE,
  vendor VARCHAR(255),
  invoice_number VARCHAR(100),
  is_prorated BOOLEAN DEFAULT false, -- true si vino de prorrateo automático
  prorated_from UUID REFERENCES actual_expenses(id) ON DELETE SET NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_actual_expenses_period ON actual_expenses(fiscal_year, fiscal_month);
CREATE INDEX idx_actual_expenses_department ON actual_expenses(department_id);
CREATE INDEX idx_actual_expenses_category ON actual_expenses(expense_category_id);

-- ================================================
-- MODULE 2: CLIENTS & SERVICES
-- ================================================

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  vertical_id UUID REFERENCES verticals(id) ON DELETE SET NULL,
  tax_id VARCHAR(50),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  billing_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_clients_vertical ON clients(vertical_id);
CREATE INDEX idx_clients_active ON clients(is_active);

-- Client Services (servicios contratados por cliente/departamento)
CREATE TABLE IF NOT EXISTS client_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  is_active BOOLEAN DEFAULT true,
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  base_price DECIMAL(12, 2), -- Precio fijo mensual (opcional)
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, service_id)
);

CREATE INDEX idx_client_services_client ON client_services(client_id);
CREATE INDEX idx_client_services_department ON client_services(department_id);

-- ================================================
-- MODULE 3: AD INVESTMENT (Inversión Publicitaria)
-- ================================================

-- Ad Platforms (Google Ads, Meta, TikTok, etc.)
CREATE TABLE IF NOT EXISTS ad_platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(20) NOT NULL UNIQUE,
  base_cost DECIMAL(10, 2) DEFAULT 0, -- Coste fijo por usar plataforma (ej: €700)
  additional_cost DECIMAL(10, 2) DEFAULT 0, -- Coste adicional (ej: €300 para 2da plataforma)
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Client Ad Investment (inversión mensual por cliente/plataforma)
CREATE TABLE IF NOT EXISTS client_ad_investment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month >= 1 AND fiscal_month <= 12),
  platform_id UUID NOT NULL REFERENCES ad_platforms(id) ON DELETE RESTRICT,
  planned_amount DECIMAL(12, 2) DEFAULT 0,
  actual_amount DECIMAL(12, 2) DEFAULT 0,
  is_complete BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, fiscal_year, fiscal_month, platform_id)
);

CREATE INDEX idx_ad_investment_client ON client_ad_investment(client_id);
CREATE INDEX idx_ad_investment_period ON client_ad_investment(fiscal_year, fiscal_month);

-- ================================================
-- MODULE 4: FEE NEGOTIATION
-- ================================================

-- Fee Tier Templates (plantillas de escalas de fee)
CREATE TABLE IF NOT EXISTS fee_tier_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fee Tiers (escalas de fee por cliente)
CREATE TABLE IF NOT EXISTS client_fee_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  template_id UUID REFERENCES fee_tier_templates(id) ON DELETE SET NULL,
  min_investment DECIMAL(12, 2) NOT NULL,
  max_investment DECIMAL(12, 2), -- NULL = sin límite superior
  fee_percentage DECIMAL(5, 2) NOT NULL CHECK (fee_percentage >= 0 AND fee_percentage <= 100),
  fixed_cost DECIMAL(12, 2) DEFAULT 0,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_investment_range CHECK (max_investment IS NULL OR max_investment > min_investment),
  CONSTRAINT valid_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_fee_tiers_client ON client_fee_tiers(client_id);
CREATE INDEX idx_fee_tiers_active ON client_fee_tiers(is_active);

-- Platform Costs Configuration (costes por número de plataformas)
CREATE TABLE IF NOT EXISTS platform_cost_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_count INTEGER NOT NULL UNIQUE CHECK (platform_count > 0),
  cost_amount DECIMAL(12, 2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- MODULE 5: BILLING MATRIX (Matriz de Facturación)
-- ================================================

-- Monthly Billing Calculation (cálculo mensual por cliente)
CREATE TABLE IF NOT EXISTS monthly_billing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month >= 1 AND fiscal_month <= 12),
  
  -- Cálculo de Fee Paid (Immedia)
  total_ad_investment DECIMAL(12, 2) DEFAULT 0,
  platform_count INTEGER DEFAULT 0,
  applied_fee_percentage DECIMAL(5, 2),
  platform_costs DECIMAL(12, 2) DEFAULT 0,
  fee_paid DECIMAL(12, 2) DEFAULT 0, -- investment × fee% + platform costs
  
  -- Total por departamentos
  immedia_total DECIMAL(12, 2) DEFAULT 0,
  imcontent_total DECIMAL(12, 2) DEFAULT 0,
  immoralia_total DECIMAL(12, 2) DEFAULT 0,
  immoral_general_total DECIMAL(12, 2) DEFAULT 0,
  
  grand_total DECIMAL(12, 2) GENERATED ALWAYS AS (
    immedia_total + imcontent_total + immoralia_total + immoral_general_total
  ) STORED,
  
  is_finalized BOOLEAN DEFAULT false,
  finalized_at TIMESTAMP WITH TIME ZONE,
  finalized_by UUID,
  
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, fiscal_year, fiscal_month)
);

CREATE INDEX idx_monthly_billing_client ON monthly_billing(client_id);
CREATE INDEX idx_monthly_billing_period ON monthly_billing(fiscal_year, fiscal_month);

-- Billing Details (desglose por servicio/departamento)
CREATE TABLE IF NOT EXISTS billing_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monthly_billing_id UUID NOT NULL REFERENCES monthly_billing(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  service_id UUID REFERENCES services(id) ON DELETE RESTRICT,
  service_name VARCHAR(255) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  is_fee_paid BOOLEAN DEFAULT false, -- true para el cálculo de fee paid
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_billing_details_monthly ON billing_details(monthly_billing_id);
CREATE INDEX idx_billing_details_department ON billing_details(department_id);

-- ================================================
-- MODULE 6: COMMISSIONS
-- ================================================

-- Partners/Referidos
CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  commission_type VARCHAR(50) DEFAULT 'percentage', -- 'percentage' o 'fixed'
  default_commission_rate DECIMAL(5, 2), -- % by default
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  payment_info TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Partner-Client Assignments (qué cliente refirió cada partner)
CREATE TABLE IF NOT EXISTS partner_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  commission_rate DECIMAL(5, 2) NOT NULL, -- % específico para este cliente
  commission_base VARCHAR(50) DEFAULT 'fee_paid', -- 'fee_paid', 'grand_total', 'custom'
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(partner_id, client_id)
);

CREATE INDEX idx_partner_clients_partner ON partner_clients(partner_id);
CREATE INDEX idx_partner_clients_client ON partner_clients(client_id);

-- Monthly Partner Commissions (comisiones calculadas por mes)
CREATE TABLE IF NOT EXISTS monthly_partner_commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month >= 1 AND fiscal_month <= 12),
  client_billing_amount DECIMAL(12, 2) NOT NULL, -- Monto sobre el que se calcula
  commission_rate DECIMAL(5, 2) NOT NULL,
  commission_amount DECIMAL(12, 2) NOT NULL,
  is_paid BOOLEAN DEFAULT false,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(partner_id, client_id, fiscal_year, fiscal_month)
);

CREATE INDEX idx_partner_commissions_period ON monthly_partner_commissions(fiscal_year, fiscal_month);
CREATE INDEX idx_partner_commissions_partner ON monthly_partner_commissions(partner_id);

-- Platform Commission Sources (plataformas que pagan comisiones - ej: WillMay)
CREATE TABLE IF NOT EXISTS commission_platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  commission_type VARCHAR(50), -- Tipo de comisión
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Monthly Platform Commissions Earned (comisiones ganadas)
CREATE TABLE IF NOT EXISTS monthly_platform_commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_id UUID NOT NULL REFERENCES commission_platforms(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month >= 1 AND fiscal_month <= 12),
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT,
  received_date DATE,
  is_received BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_platform_commissions_period ON monthly_platform_commissions(fiscal_year, fiscal_month);
CREATE INDEX idx_platform_commissions_platform ON monthly_platform_commissions(platform_id);

-- ================================================
-- MODULE 7: PAYMENT MANAGEMENT
-- ================================================

-- Payment Status Enum
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled');

-- Payment Schedule (gestión de pagos semanales)
CREATE TABLE IF NOT EXISTS payment_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month >= 1 AND fiscal_month <= 12),
  week_number INTEGER CHECK (week_number >= 1 AND week_number <= 5),
  
  -- Información del pago
  payment_concept VARCHAR(255) NOT NULL, -- Cargo
  payee_name VARCHAR(255) NOT NULL, -- Nombre
  bank_details TEXT, -- Datos bancarios
  
  -- Empresa
  issuing_company_id UUID REFERENCES companies(id), -- Banco emisor (DMK/Infinite)
  billed_to_company_id UUID REFERENCES companies(id), -- Facturado a (DMK/Infinite)
  
  -- Fechas y montos
  invoice_received_date DATE,
  due_date DATE,
  payment_date DATE,
  total_amount DECIMAL(12, 2) NOT NULL,
  commission_amount DECIMAL(12, 2) DEFAULT 0,
  
  -- Estado
  status payment_status DEFAULT 'pending',
  
  -- Conversión a gasto
  converted_to_expense BOOLEAN DEFAULT false,
  expense_id UUID REFERENCES actual_expenses(id) ON DELETE SET NULL,
  
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payment_schedule_period ON payment_schedule(fiscal_year, fiscal_month);
CREATE INDEX idx_payment_schedule_status ON payment_schedule(status);
CREATE INDEX idx_payment_schedule_issuing_company ON payment_schedule(issuing_company_id);

-- ================================================
-- MODULE 8: HR / EMPLOYEES & PAYROLL
-- ================================================

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_code VARCHAR(20) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  full_name VARCHAR(255) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  
  -- Employment info
  hire_date DATE NOT NULL,
  termination_date DATE,
  current_salary DECIMAL(12, 2) NOT NULL,
  position VARCHAR(100),
  
  -- Primary department (puede trabajar en varios)
  primary_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  
  -- Payment info
  payment_bank VARCHAR(100),
  payment_account TEXT,
  
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_employees_active ON employees(is_active);
CREATE INDEX idx_employees_department ON employees(primary_department_id);
CREATE INDEX idx_employees_code ON employees(employee_code);

-- Salary History (historial inmutable de cambios de sueldo)
CREATE TABLE IF NOT EXISTS salary_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  old_salary DECIMAL(12, 2),
  new_salary DECIMAL(12, 2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  change_reason VARCHAR(255),
  approved_by UUID, -- Usuario que aprobó el cambio
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_salary_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_salary_history_employee ON salary_history(employee_id);
CREATE INDEX idx_salary_history_dates ON salary_history(effective_from, effective_to);

-- Employee Department Splits (empleado puede dividir su sueldo entre departamentos)
CREATE TABLE IF NOT EXISTS employee_department_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month >= 1 AND fiscal_month <= 12),
  split_type VARCHAR(20) NOT NULL CHECK (split_type IN ('percentage', 'fixed_amount')),
  split_value DECIMAL(12, 2) NOT NULL CHECK (split_value >= 0),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(employee_id, department_id, fiscal_year, fiscal_month)
);

CREATE INDEX idx_employee_splits_employee ON employee_department_splits(employee_id);
CREATE INDEX idx_employee_splits_period ON employee_department_splits(fiscal_year, fiscal_month);

-- Monthly Payroll (nóminas mensuales)
CREATE TABLE IF NOT EXISTS monthly_payroll (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month >= 1 AND fiscal_month <= 12),
  
  -- Amounts
  base_salary DECIMAL(12, 2) NOT NULL,
  bonuses DECIMAL(12, 2) DEFAULT 0,
  variable_pay DECIMAL(12, 2) DEFAULT 0,
  deductions DECIMAL(12, 2) DEFAULT 0,
  
  gross_pay DECIMAL(12, 2) GENERATED ALWAYS AS (base_salary + bonuses + variable_pay) STORED,
  net_pay DECIMAL(12, 2) GENERATED ALWAYS AS (base_salary + bonuses + variable_pay - deductions) STORED,
  
  -- Company cost (coste empresa completo)
  social_security DECIMAL(12, 2) DEFAULT 0,
  other_costs DECIMAL(12, 2) DEFAULT 0,
  total_company_cost DECIMAL(12, 2) GENERATED ALWAYS AS (
    base_salary + bonuses + variable_pay + social_security + other_costs
  ) STORED,
  
  payment_date DATE,
  is_paid BOOLEAN DEFAULT false,
  
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(employee_id, fiscal_year, fiscal_month)
);

CREATE INDEX idx_payroll_employee ON monthly_payroll(employee_id);
CREATE INDEX idx_payroll_period ON monthly_payroll(fiscal_year, fiscal_month);
CREATE INDEX idx_payroll_paid ON monthly_payroll(is_paid);

-- Payroll Department Splits (cómo se divide el coste de nómina entre departamentos)
CREATE TABLE IF NOT EXISTS payroll_department_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payroll_id UUID NOT NULL REFERENCES monthly_payroll(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  split_amount DECIMAL(12, 2) NOT NULL,
  split_percentage DECIMAL(5, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payroll_splits_payroll ON payroll_department_splits(payroll_id);
CREATE INDEX idx_payroll_splits_department ON payroll_department_splits(department_id);

-- ================================================
-- FINANCIAL PERIODS (Cierre mensual)
-- ================================================

CREATE TABLE IF NOT EXISTS financial_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month >= 1 AND fiscal_month <= 12),
  is_closed BOOLEAN DEFAULT false,
  closed_at TIMESTAMP WITH TIME ZONE,
  closed_by UUID,
  reopened_at TIMESTAMP WITH TIME ZONE,
  reopened_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(fiscal_year, fiscal_month)
);

CREATE INDEX idx_financial_periods_year_month ON financial_periods(fiscal_year, fiscal_month);

-- ================================================
-- AUDIT LOG
-- ================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  operation VARCHAR(20) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_by UUID,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_table ON audit_log(table_name);
CREATE INDEX idx_audit_timestamp ON audit_log(changed_at);

-- ================================================
-- TRIGGERS
-- ================================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_verticals_updated_at BEFORE UPDATE ON verticals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_monthly_billing_updated_at BEFORE UPDATE ON monthly_billing FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- INITIAL DATA
-- ================================================

-- Insert companies
INSERT INTO companies (name, legal_name) VALUES
('DMK', 'DMK S.L.'),
('Infinite', 'Infinite S.L.')
ON CONFLICT DO NOTHING;

-- Insert departments con porcentajes de prorrateo
INSERT INTO departments (name, code, is_general, proration_percentage, display_order) VALUES
('Imcontent', 'IMCONT', false, 52.00, 1),
('Immedia', 'IMMED', false, 40.00, 2),
('Immoralia', 'IMMOR', false, 8.00, 3),
('Immoral', 'IMMORAL', true, 0, 4) -- General, no tiene % porque es de donde sale el prorrateo
ON CONFLICT DO NOTHING;

-- Insert ad platforms
INSERT INTO ad_platforms (name, code, base_cost, additional_cost, display_order) VALUES
('Google Ads', 'GOOGLE', 700, 0, 1),
('Meta Ads', 'META', 300, 300, 2), -- €300 como plataforma adicional
('TikTok Ads', 'TIKTOK', 300, 300, 3),
('LinkedIn Ads', 'LINKEDIN', 300, 300, 4),
('Taboola', 'TABOOLA', 300, 300, 5),
('Spotify Ads', 'SPOTIFY', 300, 300, 6),
('Apple Ads', 'APPLE', 300, 300, 7),
('Microsoft Ads', 'MICROSOFT', 300, 300, 8),
('Branding', 'BRAND', 0, 0, 9)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE monthly_billing IS 'Cálculo mensual de facturación por cliente basado en inversión publicitaria y servicios';
COMMENT ON TABLE client_fee_tiers IS 'Escalas de negociación de fees por cliente según rango de inversión';
COMMENT ON TABLE actual_expenses IS 'Gastos reales mensuales por departamento y categoría';
COMMENT ON TABLE budget_lines IS 'Presupuesto anual de ingresos y gastos';
