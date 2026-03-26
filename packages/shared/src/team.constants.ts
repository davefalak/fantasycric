/**
 * Team composition and constraint constants
 * These limits define how many players of each role are required for a valid team
 * Total team size: exactly 11 players
 */

import type { PlayerRole } from "./team.types";

export const TEAM_SIZE = 11;

/**
 * Role-based player limit constraints
 * Each role has [min, max] allowed players in a team
 */
export const ROLE_COMPOSITION_LIMITS = {
  WK: [1, 4] as const,    // Wicket-keepers: minimum 1, maximum 4
  BAT: [3, 6] as const,   // Batsmen: minimum 3, maximum 6
  AR: [1, 4] as const,    // All-rounders: minimum 1, maximum 4
  BOWL: [3, 6] as const,  // Bowlers: minimum 3, maximum 6
} as const;

/**
 * Maximum players from a single IPL team on a fantasy team
 */
export const MAX_PLAYERS_PER_TEAM = 6;

/**
 * Maximum overseas players allowed in a team
 */
export const MAX_OVERSEAS_PLAYERS = 4;

/**
 * Get role composition limits as a plain object
 * Useful for validation and UI display
 */
export function getRoleLimit(role: PlayerRole): [number, number] {
  return ROLE_COMPOSITION_LIMITS[role] as [number, number];
}

/**
 * Validate if a role count meets the composition requirements
 * @param role Player role
 * @param count Current player count for this role
 * @returns Object with valid flag and error message if invalid
 */
export function validateRoleCount(role: PlayerRole, count: number): { valid: boolean; error?: string } {
  const [min, max] = getRoleLimit(role);
  
  if (count < min) {
    return { valid: false, error: `Need at least ${min} ${role}(s)` };
  }
  
  if (count > max) {
    return { valid: false, error: `Maximum ${max} ${role}(s) allowed` };
  }
  
  return { valid: true };
}
