/**
 * SEQOIA - Utilitaires pour l'envoi des sessions vers Supabase
 * Exemple de structure prête pour l'API Supabase
 */

import type { SessionData } from "@/types/session";

/**
 * Prépare les données de session pour l'insertion Supabase.
 * Compatible avec une table 'sessions' :
 *
 * CREATE TABLE sessions (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   started_at TIMESTAMPTZ NOT NULL,
 *   ended_at TIMESTAMPTZ NOT NULL,
 *   data_points JSONB NOT NULL,
 *   metadata JSONB,
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 */
export function prepareSessionForSupabase(
  session: SessionData,
  options?: { userId?: string }
): Record<string, unknown> {
  return {
    started_at: session.started_at,
    ended_at: session.ended_at,
    data_points: session.data_points,
    metadata: {
      ...session.metadata,
      ...(options?.userId && { user_id: options.userId }),
    },
  };
}
