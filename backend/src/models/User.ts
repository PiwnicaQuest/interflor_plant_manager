import { query } from './database';
import { User, UserWithoutPassword, UserRole } from '../types';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export interface UserWithProfile extends UserWithoutPassword {
  profileId?: number;
  profileName?: string;
  companyName?: string;
}

export class UserModel {
  static async getAll(): Promise<UserWithProfile[]> {
    const result = await query<any>(
      `SELECT u.id, u.email, u.login, u.first_name as "firstName", u.last_name as "lastName",
       u.role, u.is_active as "isActive",
       u.profile_id as "profileId",
       pp.name as "profileName",
       c.company_name as "companyName",
       u.created_at as "createdAt", u.updated_at as "updatedAt"
       FROM users u
       LEFT JOIN permission_profiles pp ON u.profile_id = pp.id
       LEFT JOIN customers c ON c.user_id = u.id
       ORDER BY u.created_at DESC`
    );
    return result.rows;
  }

  static async getById(id: number): Promise<User | null> {
    const result = await query<any>(
      `SELECT id, email, login, first_name as "firstName", last_name as "lastName",
       password_hash as "passwordHash", role, is_active as "isActive",
       profile_id as "profileId",
       created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async getByEmail(email: string): Promise<User | null> {
    const result = await query<any>(
      `SELECT id, email, login, first_name as "firstName", last_name as "lastName",
       password_hash as "passwordHash", role, is_active as "isActive",
       profile_id as "profileId",
       created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE email = $1`,
      [email]
    );
    return result.rows[0] || null;
  }

  static async getByLogin(login: string): Promise<User | null> {
    const result = await query<any>(
      `SELECT id, email, login, first_name as "firstName", last_name as "lastName",
       password_hash as "passwordHash", role, is_active as "isActive",
       profile_id as "profileId",
       created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE LOWER(login) = LOWER($1)`,
      [login]
    );
    return result.rows[0] || null;
  }

  static async getByEmailOrLogin(emailOrLogin: string): Promise<User | null> {
    const isEmail = emailOrLogin.includes('@');
    if (isEmail) {
      return this.getByEmail(emailOrLogin);
    } else {
      const userByLogin = await this.getByLogin(emailOrLogin);
      if (userByLogin) return userByLogin;
      return this.getByEmail(emailOrLogin);
    }
  }

  static async create(
    email: string,
    password: string,
    role: UserRole = UserRole.CUSTOMER,
    profileId?: number,
    options?: { firstName?: string; lastName?: string; login?: string }
  ): Promise<UserWithProfile> {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

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
      `INSERT INTO users (email, password_hash, role, profile_id, first_name, last_name, login)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, login, first_name as "firstName", last_name as "lastName",
       role, is_active as "isActive", profile_id as "profileId",
       created_at as "createdAt", updated_at as "updatedAt"`,
      [email, passwordHash, role, finalProfileId, options?.firstName || null, options?.lastName || null, options?.login || null]
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
       RETURNING id, email, login, first_name as "firstName", last_name as "lastName",
       role, is_active as "isActive", profile_id as "profileId",
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
    data: { email?: string; role?: UserRole; isActive?: boolean; profileId?: number; firstName?: string; lastName?: string; login?: string }
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

    if (data.firstName !== undefined) {
      updates.push(`first_name = $${paramCount++}`);
      values.push(data.firstName || null);
    }

    if (data.lastName !== undefined) {
      updates.push(`last_name = $${paramCount++}`);
      values.push(data.lastName || null);
    }

    if (data.login !== undefined) {
      updates.push(`login = $${paramCount++}`);
      values.push(data.login || null);
    }

    if (updates.length === 0) {
      return null;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await query<any>(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING id, email, login, first_name as "firstName", last_name as "lastName",
       role, is_active as "isActive", profile_id as "profileId",
       created_at as "createdAt", updated_at as "updatedAt"`,
      values
    );

    if (result.rows[0]) {
      const profileResult = await query<any>(
        'SELECT Name FROM permission_profiles WHERE id = $1',
        [result.rows[0].profileId]
      );
      result.rows[0].profileName = profileResult.rows[0]?.name;
    }

    return result.rows[0] || null;
  }

  static async toggleActive(id: number): Promise<UserWithProfile | null> {
    const result = await query<any>(
      `UPDATE users SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE id = $1
       RETURNING id, email, login, first_name as "firstName", last_name as "lastName",
       role, is_active as "isActive", profile_id as "profileId",
       created_at as "createdAt", updated_at as "updatedAt"`,
      [id]
    );

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

  static async hardDelete(id: number): Promise<{ success: boolean; deletedCustomer: boolean }> {
    const customerResult = await query<any>(
      'SELECT id FROM customers WHERE user_id = $1',
      [id]
    );
    const hasCustomer = customerResult.rows.length > 0;
    const customerId = hasCustomer ? customerResult.rows[0].id : null;

    if (customerId) {
      await query('DELETE FROM customers WHERE id = $1', [customerId]);
    }

    const result = await query('DELETE FROM users WHERE id = $1', [id]);
    const success = (result.rowCount || 0) > 0;

    return { success, deletedCustomer: hasCustomer };
  }

  static async getRelatedData(id: number): Promise<{
    hasCustomer: boolean;
    orderCount: number;
    invoiceCount: number;
    movementCount: number;
  }> {
    const [customerResult, orderResult, invoiceResult, movementResult] = await Promise.all([
      query<any>('SELECT id FROM customers WHERE user_id = $1', [id]),
      query<any>('SELECT COUNT(*) as count FROM orders WHERE created_by_user_id = $1', [id]),
      query<any>('SELECT COUNT(*) as count FROM invoices WHERE created_by_user_id = $1', [id]),
      query<any>('SELECT COUNT(*) as count FROM inventory_movements WHERE user_id = $1', [id]),
    ]);

    return {
      hasCustomer: customerResult.rows.length > 0,
      orderCount: parseInt(orderResult.rows[0]?.count || '0'),
      invoiceCount: parseInt(invoiceResult.rows[0]?.count || '0'),
      movementCount: parseInt(movementResult.rows[0]?.count || '0'),
    };
  }

  static async loginExists(login: string, excludeUserId?: number): Promise<boolean> {
    let sql = 'SELECT id FROM users WHERE LOWER(login) = LOWER($1)';
    const params: any[] = [login];

    if (excludeUserId) {
      sql += ' AND id != $2';
      params.push(excludeUserId);
    }

    const result = await query<any>(sql, params);
    return result.rows.length > 0;
  }
}
