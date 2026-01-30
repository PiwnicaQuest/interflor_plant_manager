import { query } from './database';

export interface SessionEntry {
  id: number;
  userId: number;
  sessionId: string;
  ipAddress: string | null;
  userAgent: string | null;
  source: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

export class SessionModel {
  /**
   * Tworzy nową sesję i zwraca session_id (UUID)
   */
  static async create(data: {
    userId: number;
    ipAddress?: string;
    userAgent?: string;
    source?: string;
    expiresAt: Date;
  }): Promise<string> {
    const result = await query<{ sessionId: string }>(
      `INSERT INTO user_sessions (user_id, ip_address, user_agent, source, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING session_id`,
      [
        data.userId,
        data.ipAddress || null,
        data.userAgent || null,
        data.source || 'panel',
        data.expiresAt,
      ]
    );
    return result.rows[0].sessionId;
  }

  /**
   * Zwraca liczbę aktywnych (is_active=true + nie wygasłych) sesji użytkownika
   */
  static async getActiveCount(userId: number): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM user_sessions
       WHERE user_id = $1 AND is_active = true AND expires_at > NOW()`,
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Zwraca listę aktywnych sesji użytkownika (od najstarszej)
   */
  static async getActiveSessions(userId: number): Promise<SessionEntry[]> {
    const result = await query<SessionEntry>(
      `SELECT id, user_id, session_id, ip_address, user_agent, source,
              created_at, expires_at, is_active
       FROM user_sessions
       WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
       ORDER BY created_at ASC`,
      [userId]
    );
    return result.rows;
  }

  /**
   * Sprawdza czy sesja jest aktywna i nie wygasła
   */
  static async isValid(sessionId: string): Promise<boolean> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM user_sessions
       WHERE session_id = $1 AND is_active = true AND expires_at > NOW()`,
      [sessionId]
    );
    return parseInt(result.rows[0].count, 10) > 0;
  }

  /**
   * Dezaktywuje sesję
   */
  static async invalidate(sessionId: string): Promise<void> {
    await query(
      `UPDATE user_sessions SET is_active = false WHERE session_id = $1`,
      [sessionId]
    );
  }

  /**
   * Dezaktywuje najstarszą aktywną sesję użytkownika.
   * Zwraca sessionId wyrzuconej sesji lub null.
   */
  static async invalidateOldest(userId: number): Promise<string | null> {
    const result = await query<{ sessionId: string }>(
      `UPDATE user_sessions SET is_active = false
       WHERE id = (
         SELECT id FROM user_sessions
         WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
         ORDER BY created_at ASC
         LIMIT 1
       )
       RETURNING session_id`,
      [userId]
    );
    return result.rows[0]?.sessionId || null;
  }

  /**
   * Dezaktywuje wszystkie sesje użytkownika
   */
  static async invalidateAll(userId: number): Promise<number> {
    const result = await query(
      `UPDATE user_sessions SET is_active = false
       WHERE user_id = $1 AND is_active = true`,
      [userId]
    );
    return result.rowCount || 0;
  }

  /**
   * Czyści wygasłe sesje (do crona)
   */
  static async cleanExpired(): Promise<number> {
    const result = await query(
      `DELETE FROM user_sessions WHERE expires_at < NOW() OR is_active = false`
    );
    return result.rowCount || 0;
  }
}
