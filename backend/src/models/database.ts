import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL?.includes("localhost") || process.env.DATABASE_URL?.includes("127.0.0.1")) ? false : (process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : false),
  max: 20, // Increase pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

pool.on('connect', () => {
  console.log('[POOL] New client connected. Total:', pool.totalCount, 'Idle:', pool.idleCount, 'Waiting:', pool.waitingCount);
});

pool.on('acquire', () => {
  console.log('[POOL] Client acquired. Total:', pool.totalCount, 'Idle:', pool.idleCount, 'Waiting:', pool.waitingCount);
});

pool.on('release', () => {
  console.log('[POOL] Client released. Total:', pool.totalCount, 'Idle:', pool.idleCount, 'Waiting:', pool.waitingCount);
});

// Convert snake_case keys to camelCase
const snakeToCamel = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;

  // Handle strings - try to parse if it looks like JSON
  if (typeof obj === 'string') {
    // Try to parse JSON strings
    if ((obj.startsWith('{') && obj.endsWith('}')) || (obj.startsWith('[') && obj.endsWith(']'))) {
      try {
        const parsed = JSON.parse(obj);
        return snakeToCamel(parsed); // Recursively convert parsed JSON
      } catch {
        // Not valid JSON, return as is
        return obj;
      }
    }
    return obj;
  }

  if (typeof obj !== 'object') return obj;

  // Don't convert Date objects
  if (obj instanceof Date) return obj;

  if (Array.isArray(obj)) return obj.map(snakeToCamel);

  const camelObj: any = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
    camelObj[camelKey] = snakeToCamel(obj[key]);
  }
  return camelObj;
};

export const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  const start = Date.now();
  const queryId = Math.random().toString(36).substring(7);
  console.log(`[QUERY ${queryId}] Starting query. Pool status - Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
  console.log(`[QUERY ${queryId}] SQL: ${text.substring(0, 100)}...`);
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    console.log(`[QUERY ${queryId}] Completed in ${duration}ms, rows: ${res.rowCount}`);

    // Convert rows to camelCase
    if (res.rows && res.rows.length > 0) {
      res.rows = res.rows.map(snakeToCamel) as T[];
    }

    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

export const getClient = async (): Promise<PoolClient> => {
  const client = await pool.connect();
  return client;
};

// Wrapped client that converts snake_case to camelCase
interface WrappedClient extends PoolClient {
  originalQuery: PoolClient['query'];
}

const wrapClient = (client: PoolClient): WrappedClient => {
  // Store the original query function BEFORE any modifications
  const originalQueryFn = client.query.bind(client);

  const wrappedClient = client as WrappedClient;
  wrappedClient.originalQuery = originalQueryFn;

  // Create new query function that wraps the original
  const wrappedQueryFn = function(queryTextOrConfig: any, values?: any) {
    const result = originalQueryFn(queryTextOrConfig, values);

    // If it returns a promise, wrap it to convert results
    if (result && typeof result.then === 'function') {
      return result.then((res: any) => {
        if (res.rows && res.rows.length > 0) {
          res.rows = res.rows.map(snakeToCamel);
        }
        return res;
      });
    }

    return result;
  } as any;

  wrappedClient.query = wrappedQueryFn;

  return wrappedClient;
};

export const transaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await getClient();
  // IMPORTANT: Save original query BEFORE wrapping to use for transaction control
  const originalQuery = client.query.bind(client);
  const wrappedClient = wrapClient(client);

  try {
    console.log('[TRANSACTION] BEGIN');
    await originalQuery('BEGIN');
    const result = await callback(wrappedClient);
    console.log('[TRANSACTION] COMMIT');
    await originalQuery('COMMIT');
    return result;
  } catch (error) {
    console.log('[TRANSACTION] ROLLBACK due to error:', error);
    try {
      await originalQuery('ROLLBACK');
    } catch (rollbackError) {
      console.error('[TRANSACTION] ROLLBACK failed:', rollbackError);
    }
    throw error;
  } finally {
    console.log('[TRANSACTION] Releasing connection');
    // CRITICAL: Restore original query function before releasing to pool
    // Otherwise, next user of this pooled connection will have wrapped query
    client.query = originalQuery;
    client.release();
  }
};

export default {
  query,
  getClient,
  transaction,
  pool,
};
