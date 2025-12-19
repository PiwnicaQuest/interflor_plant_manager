// Migration runner script
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  // Connection configuration - uses same as backend
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'plantmanager',
    user: process.env.DB_USER || 'polflor',
    password: process.env.DB_PASSWORD || 'polflor',
  });

  try {
    console.log('📊 Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connected to database');

    // Read migration file
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migration_settings.sql'),
      'utf8'
    );

    console.log('🔄 Running migration...');
    await client.query(migrationSQL);
    console.log('✅ Migration completed successfully');

    client.release();
    await pool.end();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
