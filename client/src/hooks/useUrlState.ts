import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Hook para persistir estado del componente en los query params de la URL.
 * Esto permite que tabs, filtros, año, etc. se mantengan al recargar o volver a la página.
 *
 * @param paramKey - El nombre del query param en la URL (ej: 'tab', 'year', 'period')
 * @param defaultValue - El valor por defecto si no hay param en la URL
 * @returns [value, setValue] - Estado sincronizado con la URL
 *
 * @example
 * const [activeTab, setActiveTab] = useUrlState('tab', 'Real');
 * const [year, setYear] = useUrlState('year', new Date().getFullYear(), (v) => Number(v));
 */
export function useUrlState<T extends string | number>(
  paramKey: string,
  defaultValue: T,
  parse?: (value: string) => T
): [T, (value: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const parseValue = parse || ((v: string) => v as T);

  const currentValue = searchParams.get(paramKey);
  const value = currentValue ? parseValue(currentValue) : defaultValue;

  const setValue = useCallback(
    (newValue: T) => {
      const newSearchParams = new URLSearchParams(searchParams);

      if (newValue === defaultValue || newValue === '') {
        newSearchParams.delete(paramKey);
      } else {
        newSearchParams.set(paramKey, String(newValue));
      }

      setSearchParams(newSearchParams, { replace: true });
    },
    [searchParams, setSearchParams, paramKey, defaultValue]
  );

  return [value, setValue];
}
