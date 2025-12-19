const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'plantmanager',
  user: 'polflor',
  password: 'polflor123',
});

async function testOrder() {
  try {
    const result = await pool.query('SELECT * FROM order_items WHERE order_id = 1 LIMIT 2');
    console.log('Order items columns:', Object.keys(result.rows[0] || {}));
    console.log('First item:', JSON.stringify(result.rows[0], null, 2));
    
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = 1');
    console.log('Order data:', JSON.stringify(orderResult.rows[0], null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testOrder();
