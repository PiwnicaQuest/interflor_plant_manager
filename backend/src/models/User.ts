import { query } from './database';
import { User, UserWithoutPassword, UserRole } from '../types';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export interface UserWithProfile extends UserWithoutPassword {
  profileId?: number;
  profileName?: string;
}

export class UserModel {
  static async getAll(): Promise<UserWithProfile[]> {
    const result = await query<any>(
      `SELECT u.id, u.email, u.role, u.is_active as "isActive",
       u.profile_id as "profileId",
       pp.name as "profileName",
       u.created_at as "createdAt", u.updated_at as "updatedAt"
       FROM users u
       LEFT JOIN permission_profiles pp ON u.profile_id = pp.id
       ORDER BY u.created_at DESC`
    );
    return result.rows;
  }

  static async getById(id: number): Promise<User | null> {
    const result = await query<any>(
      `SELECT id, email, password_hash as "passwordHash", role, is_active as "isActive",
       profile_id as "profileId",
       created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async getByEmail(email: string): Promise<User | null> {
    const result = await query<any>(
      `SELECT id, email, password_hash as "passwordHash", role, is_active as "isActive",
       profile_id as "profileId",
       created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE email = $1`,
      [email]
    );
    return result.rows[0] || null;
  }

  static async create(
    email: string,
    password: string,
    role: UserRole = UserRole.CUSTOMER,
    profileId?: number
  ): Promise<UserWithProfile> {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // If no profileId provided, get the default one based on role
    let finalProfileId = profileId;
    if (!finalProfileId) {
      const roleToProfileMap: Record<UserRole, string> = {
        [UserRole.ADMIN]: 'Administrator',
        [UserRole.WAREHOUSE]: 'Magazynier',
        [UserRole.POS]: 'Sprzedawca',
        [UserRole.CUSTOMER]: 'Klient'
      };
      const profileResult = await query<any>(
        'SELECT id FROM permission_profiles WHERE name = $1',
        [roleToProfileMap[role]]
      );
      finalProfileId = profileResult.rows[0]?.id;
    }

    const result = await query<any>(
      `INSERT INTO users (email, password_hash, role, profile_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, role, is_active as "isActive", profile_id as "profileId",
       created_at as "createdAt", updated_at as "updatedAt"`,
      [email, passwordHash, role, finalProfileId]
    );

    return result.rows[0];
  }

  static async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  static async updatePassword(id: number, newPassword: string): Promise<boolean> {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const result = await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, id]
    );
    return (result.rowCount || 0) > 0;
  }

  static async updateRole(id: number, role: UserRole): Promise<UserWithoutPassword | null> {
    const result = await query<any>(
      `UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
       RETURNING id, email, role, is_active as "isActive", profile_id as "profileId",
       created_at as "createdAt", updated_at as "updatedAt"`,
      [role, id]
    );
    return result.rows[0] || null;
  }

  static async setActive(id: number, isActive: boolean): Promise<boolean> {
    const result = await query(
      'UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [isActive, id]
    );
    return (result.rowCount || 0) > 0;
  }

  static async update(
    id: number,
    data: { email?: string; role?: UserRole; isActive?: boolean; profileId?: number }
  ): Promise<UserWithProfile | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(data.email);
    }

    if (data.role !== undefined) {
      updates.push(`role = $${paramCount++}`);
      values.push(data.role);
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(data.isActive);
    }

    if (data.profileId !== undefined) {
      updates.push(`profile_id = $${paramCount++}`);
      values.push(data.profileId);
    }

    if (updates.length === 0) {
      return null;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await query<any>(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING id, email, role, is_active as "isActive", profile_id as "profileId",
       created_at as "createdAt", updated_at as "updatedAt"`,
      values
    );

    // Get profile name
    if (result.rows[0]) {
      const profileResult = await query<any>(
        'SELECT name FROM permission_profiles WHERE id = $1',
        [result.rows[0].profileId]
      );
      result.rows[0].profileName = profileResult.rows[0]?.name;
    }

    return result.rows[0] || null;
  }

  static async toggleActive(id: number): Promise<UserWithProfile | null> {
    const result = await query<any>(
      `UPDATE users SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE id = $1
       RETURNING id, email, role, is_active as "isActive", profile_id as "profileId",
       created_at as "createdAt", updated_at as "updatedAt"`,
      [id]
    );

    // Get profile name
    if (result.rows[0]) {
      const profileResult = await query<any>(
        'SELECT name FROM permission_profiles WHERE id = $1',
        [result.rows[0].profileId]
      );
      result.rows[0].profileName = profileResult.rows[0]?.name;
    }

    return result.rows[0] || null;
  }

  static async changePassword(id: number, newPassword: string): Promise<boolean> {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const result = await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, id]
    );
    return (result.rowCount || 0) > 0;
  }

  static async softDelete(id: number): Promise<boolean> {
    const result = await query(
      'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
    return (result.rowCount || 0) > 0;
  }

  static async delete(id: number): Promise<boolean> {
    const result = await query('DELETE FROM users WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  static stripPassword(user: User): UserWithoutPassword {
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword as UserWithoutPassword;
  }
}
