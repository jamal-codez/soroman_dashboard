import { useMemo } from 'react';
import { ROLES } from '@/roles';

interface StoredLocation {
  id: number;
  name: string;
  abbreviation?: string;
}

/**
 * Returns the list of location names the current user is allowed to see.
 *
 * Rules:
 *  - SuperAdmin (role 0) or users with `can_view_all_locations` → no filtering
 *  - Otherwise only locations whose name appears in the user's assigned list
 *
 * @param derivedLocations – the unique location strings derived from API data
 */
export function useAllowedLocations(derivedLocations: string[]): string[] {
  return useMemo(() => {
    const role = Number(localStorage.getItem('role') ?? -1);
    const canViewAll: boolean = (() => {
      try {
        return JSON.parse(localStorage.getItem('can_view_all_locations') || 'false');
      } catch {
        return false;
      }
    })();

    // SuperAdmin or explicit "view all" flag → show every location from data
    if (role === ROLES.SUPERADMIN || canViewAll) {
      return derivedLocations;
    }

    // Parse assigned locations
    let assigned: StoredLocation[] = [];
    try {
      assigned = JSON.parse(localStorage.getItem('locations') || '[]');
    } catch {
      assigned = [];
    }

    if (!assigned.length) {
      return [];
    }

    // Build a set of allowed names (case-insensitive)
    const allowedNames = new Set(assigned.map((l) => l.name.toLowerCase()));

    return derivedLocations.filter((loc) => allowedNames.has(loc.toLowerCase()));
  }, [derivedLocations]);
}
