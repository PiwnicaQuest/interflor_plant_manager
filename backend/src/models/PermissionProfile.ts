import { query } from './database';

export interface PermissionProfile {
  id: number;
  name: string;
  description?: string;
  color: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePermissionProfileRequest {
  name: string;
  description?: string;
  color?: string;
  permissions: string[];
}

export interface UpdatePermissionProfileRequest {
  name?: string;
  description?: string;
  color?: string;
  permissions?: string[];
}

export class PermissionProfileModel {
  static async getAll(): Promise<PermissionProfile[]> {
    const result = await query<any>(`
      SELECT
        pp.id,
        pp.name,
        pp.description,
        pp.color,
        pp.is_system as "isSystem",
        pp.created_at as "createdAt",
        pp.updated_at as "updatedAt",
        COALESCE(
          array_agg(prm.permission) FILTER (WHERE prm.permission IS NOT NULL),
          '{}'
        ) as permissions
      FROM permission_profiles pp
      LEFT JOIN profile_permissions prm ON pp.id = prm.profile_id
      GROUP BY pp.id
      ORDER BY pp.is_system DESC, pp.name ASC
    `);
    return result.rows;
  }

  static async getById(id: number): Promise<PermissionProfile | null> {
    const result = await query<any>(`
      SELECT
        pp.id,
        pp.name,
        pp.description,
        pp.color,
        pp.is_system as "isSystem",
        pp.created_at as "createdAt",
        pp.updated_at as "updatedAt",
        COALESCE(
          array_agg(prm.permission) FILTER (WHERE prm.permission IS NOT NULL),
          '{}'
        ) as permissions
      FROM permission_profiles pp
      LEFT JOIN profile_permissions prm ON pp.id = prm.profile_id
      WHERE pp.id = $1
      GROUP BY pp.id
    `, [id]);
    return result.rows[0] || null;
  }

  static async getByName(name: string): Promise<PermissionProfile | null> {
    const result = await query<any>(`
      SELECT
        pp.id,
        pp.name,
        pp.description,
        pp.color,
        pp.is_system as "isSystem",
        pp.created_at as "createdAt",
        pp.updated_at as "updatedAt",
        COALESCE(
          array_agg(prm.permission) FILTER (WHERE prm.permission IS NOT NULL),
          '{}'
        ) as permissions
      FROM permission_profiles pp
      LEFT JOIN profile_permissions prm ON pp.id = prm.profile_id
      WHERE pp.name = $1
      GROUP BY pp.id
    `, [name]);
    return result.rows[0] || null;
  }

  static async create(data: CreatePermissionProfileRequest): Promise<PermissionProfile> {
    // Start transaction
    await query('BEGIN');

    try {
      // Insert profile
      const profileResult = await query<any>(`
        INSERT INTO permission_profiles (name, description, color, is_system)
        VALUES ($1, $2, $3, FALSE)
        RETURNING id, name, description, color, is_system as "isSystem",
                  created_at as "createdAt", updated_at as "updatedAt"
      `, [data.name, data.description || null, data.color || 'gray']);

      const profile = profileResult.rows[0];

      // Insert permissions
      if (data.permissions && data.permissions.length > 0) {
        const values = data.permissions.map((_, i) => `($1, $${i + 2})`).join(', ');
        const params = [profile.id, ...data.permissions];
        await query(`
          INSERT INTO profile_permissions (profile_id, permission)
          VALUES ${values}
          ON CONFLICT DO NOTHING
        `, params);
      }

      await query('COMMIT');

      // Return full profile with permissions
      return {
        ...profile,
        permissions: data.permissions || []
      };
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  }

  static async update(id: number, data: UpdatePermissionProfileRequest): Promise<PermissionProfile | null> {
    // Check if profile exists and is not system (except for permissions update)
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    // System profiles can only have permissions updated, not name/description/color
    if (existing.isSystem && (data.name || data.description !== undefined || data.color)) {
      throw new Error('Nie można modyfikować profilu systemowego');
    }

    await query('BEGIN');

    try {
      // Update profile fields if provided and not system
      if (!existing.isSystem && (data.name || data.description !== undefined || data.color)) {
        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (data.name) {
          updates.push(`name = $${paramCount++}`);
          values.push(data.name);
        }
        if (data.description !== undefined) {
          updates.push(`description = $${paramCount++}`);
          values.push(data.description);
        }
        if (data.color) {
          updates.push(`color = $${paramCount++}`);
          values.push(data.color);
        }

        if (updates.length > 0) {
          updates.push(`updated_at = CURRENT_TIMESTAMP`);
          values.push(id);

          await query(`
            UPDATE permission_profiles
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
          `, values);
        }
      }

      // Update permissions if provided (allowed even for non-admin system profiles)
      if (data.permissions !== undefined) {
        // Don't allow changing Administrator permissions
        if (existing.name === 'Administrator') {
          throw new Error('Nie można modyfikować uprawnień Administratora');
        }

        // Delete existing permissions
        await query('DELETE FROM profile_permissions WHERE profile_id = $1', [id]);

        // Insert new permissions
        if (data.permissions.length > 0) {
          const values = data.permissions.map((_, i) => `($1, $${i + 2})`).join(', ');
          const params = [id, ...data.permissions];
          await query(`
            INSERT INTO profile_permissions (profile_id, permission)
            VALUES ${values}
            ON CONFLICT DO NOTHING
          `, params);
        }
      }

      await query('COMMIT');

      // Return updated profile
      return this.getById(id);
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  }

  static async delete(id: number): Promise<boolean> {
    // Check if profile exists and is not system
    const existing = await this.getById(id);
    if (!existing) {
      return false;
    }

    if (existing.isSystem) {
      throw new Error('Nie można usunąć profilu systemowego');
    }

    // Check if any users are using this profile
    const usersResult = await query<any>(
      'SELECT COUNT(*) as count FROM users WHERE profile_id = $1',
      [id]
    );

    if (parseInt(usersResult.rows[0].count) > 0) {
      throw new Error('Nie można usunąć profilu, który jest przypisany do użytkowników');
    }

    const result = await query('DELETE FROM permission_profiles WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  static async getUserCount(profileId: number): Promise<number> {
    const result = await query<any>(
      'SELECT COUNT(*) as count FROM users WHERE profile_id = $1',
      [profileId]
    );
    return parseInt(result.rows[0].count);
  }

  static async getUserPermissions(userId: number): Promise<string[]> {
    const result = await query<any>(`
      SELECT DISTINCT prm.permission
      FROM users u
      JOIN permission_profiles pp ON u.profile_id = pp.id
      JOIN profile_permissions prm ON pp.id = prm.profile_id
      WHERE u.id = $1
    `, [userId]);
    return result.rows.map(r => r.permission);
  }

  static async userHasPermission(userId: number, permission: string): Promise<boolean> {
    const result = await query<any>(`
      SELECT EXISTS(
        SELECT 1
        FROM users u
        JOIN permission_profiles pp ON u.profile_id = pp.id
        JOIN profile_permissions prm ON pp.id = prm.profile_id
        WHERE u.id = $1 AND prm.permission = $2
      ) as has_permission
    `, [userId, permission]);
    return result.rows[0]?.has_permission || false;
  }
}
