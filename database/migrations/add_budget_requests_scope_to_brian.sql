-- Añade el scope 'budget-requests:read' a la API key de Brian/Claude
-- Ejecutar en Supabase SQL Editor

-- Primero verifica qué keys existen y sus scopes actuales:
-- SELECT id, name, permissions, is_active FROM api_keys;

-- Añade el scope a la key que tenga 'claude' o 'brian' en el nombre:
UPDATE api_keys
SET permissions = array_append(permissions, 'budget-requests:read')
WHERE (
    lower(name) LIKE '%claude%'
    OR lower(name) LIKE '%brian%'
    OR lower(name) LIKE '%mcp%'
)
AND is_active = true
AND NOT ('budget-requests:read' = ANY(permissions))
AND NOT ('*' = ANY(permissions));  -- Si ya tiene wildcard (*) no hace falta

-- Verifica el resultado:
SELECT id, name, permissions, is_active FROM api_keys;
