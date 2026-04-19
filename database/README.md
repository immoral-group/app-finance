# Database Setup

This directory contains all SQL files for setting up the Immoral Finance App database in Supabase.

---

## ⚡ Migraciones recientes (ejecutar si recreas la BD o incorporas a un equipo nuevo)

Las migraciones están en `database/migrations/`. Todas usan `IF NOT EXISTS` / `IF EXISTS` — son seguras de re-ejecutar.

| Archivo | Fecha | Qué hace |
|---|---|---|
| `migrations/001_user_roles.sql` | — | Roles de usuario |
| `migrations/002_fix_user_profiles.sql` | — | Fix perfiles |
| `migrations/05_add_actuals_column.sql` | — | Columna actuals |
| `migrations/06_add_cell_metadata.sql` | — | Metadatos de celda |
| `migrations/add_fee_config.sql` | — | Config de fees |
| `migrations/add_pl_custom_rows.sql` | — | Filas custom en P&L |
| `migrations/cleanup_duplicate_expenses.sql` | — | Limpieza duplicados |
| `change_log.sql` _(raíz database/)_ | 2026-04-17 | Tabla `change_log` para historial de cambios por módulo |
| `migrations/add_proveedor_cop_payments.sql` | 2026-04-17 | Tipo `proveedor` en beneficiaries + permite COP en payments |
| `migrations/add_hidden_from_clients.sql` | 2026-04-17 | Columna `hidden_from_yyyymm` en `clients` para ocultar filas por período |

### Orden de ejecución para una BD desde cero
```
1. schema.sql
2. functions.sql
3. materialized_views.sql
4. rls_policies.sql
5. (migrations/* en orden cronológico)
6. change_log.sql
7. migrations/add_proveedor_cop_payments.sql
8. migrations/add_hidden_from_clients.sql
```

---

## Files

- **schema.sql** - Complete database schema with tables, indexes, and constraints
- **functions.sql** - Business logic functions for calculations and validations
- **materialized_views.sql** - Pre-aggregated views for dashboard performance
- **rls_policies.sql** - Row-Level Security policies for role-based access control
- **change_log.sql** - Tabla `change_log` para auditoría de cambios por módulo (2026-04-17)

## Deployment Order

Apply the SQL files in this exact order:

```bash
1. schema.sql
2. functions.sql
3. materialized_views.sql
4. rls_policies.sql
```

## Installation

### Via Supabase Dashboard

1. Go to your Supabase project
2. Navigate to SQL Editor
3. Open each file and execute in order

### Via Supabase CLI

```bash
supabase db reset
supabase db push
```

Or manually:

```bash
psql -h your-project.supabase.co -U postgres -d postgres -f database/schema.sql
psql -h your-project.supabase.co -U postgres -d postgres -f database/functions.sql
psql -h your-project.supabase.co -U postgres -d postgres -f database/materialized_views.sql
psql -h your-project.supabase.co -U postgres -d postgres -f database/rls_policies.sql
```

## User Roles

The system supports the following roles (stored in `auth.users.user_metadata.role`):

- **CFO / admin** - Full access to all data and operations
- **CEO / COO** - Read access to all data, limited writes
- **department_head** - Read access to their department only
- **admin_assistant** - Limited read/write based on specific tables

### Setting User Roles

After creating users in Supabase Auth, update their metadata:

```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"CFO"'
)
WHERE email = 'cfo@immoral.com';

-- For department heads, also set department_id
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{role}',
    '"department_head"'
  ),
  '{department_id}',
  '"uuid-of-department"'
)
WHERE email = 'head@immoral.com';
```

## Key Concepts

### Ledger Entries (Single Source of Truth)

All financial events are recorded in `ledger_entries`. This table is **immutable** - entries are never updated or deleted. For corrections, create adjustment entries:

```sql
-- Original entry (mistake)
INSERT INTO ledger_entries (...) VALUES (...);

-- Correction entry
SELECT create_ledger_entry(
  p_entry_type := 'adjustment',
  p_is_adjustment := true,
  p_adjustment_of := 'uuid-of-original-entry',
  ...
);
```

### Financial Periods

Periods can be closed to prevent new entries:

```sql
SELECT close_financial_period(2026, 1); -- Close January 2026
SELECT reopen_financial_period(2026, 1); -- Reopen if needed (admin only)
```

### Materialized Views

Dashboard views are pre-aggregated for performance. Refresh them:

```sql
-- Refresh all views
SELECT refresh_all_materialized_views();

-- Or individual views
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_department_summary;
```

## Testing RLS Policies

Test RLS policies by setting JWT claims:

```sql
-- Simulate CFO user
SET request.jwt.claims = '{"sub": "user-uuid", "user_metadata": {"role": "CFO"}}';

-- Simulate department head
SET request.jwt.claims = '{"sub": "user-uuid", "user_metadata": {"role": "department_head", "department_id": "dept-uuid"}}';

-- Test queries
SELECT * FROM ledger_entries;
```

## Data Model Overview

```
clients → contracts → contract_department_splits
                  ↓
         ledger_entries (source of truth)
                  ↑
employees → payrolls → employee_department_splits
                  ↑
expenses → expense_categories
                  ↑
commissions
```

## Environment Variables for Microservices

Microservices will need these environment variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key (for frontend)
```

⚠️ **Important**: Microservices must use the `SERVICE_ROLE_KEY` to bypass RLS and write to ledger_entries. The frontend uses `ANON_KEY` with RLS enabled.
