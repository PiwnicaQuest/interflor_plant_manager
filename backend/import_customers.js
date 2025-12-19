#!/usr/bin/env node
/**
 * Import kontrahentów z CSV do bazy PlantManager
 */

const fs = require('fs');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: 'localhost',
  database: 'plantmanager',
  user: 'plantmanager',
  password: 'plantmanager2025'
});

// Price group mapping
const PRICE_GROUP_MAP = {
  'podstawowa': 1,
  'rabat 10%': 2,
  'rabat 12%': 3,
  'rabat 15%': 4,
  'rabat 20%': 5,
  'rabat 25%': 6,
  '-': 1,
  'hurt': 1,
  'detal': 1,
  'plus 8%': 1,
  'auchan 8%': 1,
  '': 1,
};

function cleanNip(nip) {
  if (!nip) return null;
  const cleaned = nip.replace(/\D/g, '');
  return cleaned || null;
}

function cleanCompanyName(name) {
  if (!name) return null;
  // Remove leading/trailing quotes and whitespace
  let cleaned = name.trim();
  // Remove surrounding quotes
  while (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length > 2) {
    cleaned = cleaned.slice(1, -1);
  }
  // Remove leading quotes
  cleaned = cleaned.replace(/^"+/, '').trim();
  return cleaned || null;
}

function getPriceGroupId(groupName) {
  if (!groupName) return 1;
  return PRICE_GROUP_MAP[groupName.toLowerCase().trim()] || 1;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ';' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

async function importCustomers(csvFile) {
  const content = fs.readFileSync(csvFile, 'utf-8');
  const lines = content.split(/\r?\n/);

  let imported = 0;
  let skipped = 0;
  let errors = [];

  const client = await pool.connect();

  try {
    // Skip first line "Tabela 1" and header
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const fields = parseCSVLine(line);

        const companyName = cleanCompanyName(fields[0]);
        const nip = cleanNip(fields[1]);
        const priceGroup = fields[2] || '';
        const street = fields[3] ? fields[3].trim() : null;
        const postalCode = fields[4] ? fields[4].trim() : null;
        const city = fields[5] ? fields[5].trim() : null;
        const priceGroupId = getPriceGroupId(priceGroup);

        // Skip empty rows
        if (!companyName && !nip) {
          skipped++;
          continue;
        }

        // Check if NIP already exists
        if (nip) {
          const existing = await client.query(
            'SELECT id FROM customers WHERE nip = $1',
            [nip]
          );
          if (existing.rows.length > 0) {
            console.log(`Row ${i + 1}: NIP ${nip} already exists, skipping`);
            skipped++;
            continue;
          }
        }

        // Insert customer
        await client.query(`
          INSERT INTO customers (company_name, nip, street, postal_code, city, country, price_group_id)
          VALUES ($1, $2, $3, $4, $5, 'Polska', $6)
        `, [companyName, nip, street, postalCode, city, priceGroupId]);

        imported++;

        if (imported % 100 === 0) {
          console.log(`Imported ${imported} customers...`);
        }

      } catch (e) {
        errors.push(`Row ${i + 1}: ${e.message}`);
        console.error(`Error at row ${i + 1}: ${e.message}`);
      }
    }

    console.log('\n=== Import completed ===');
    console.log(`Imported: ${imported}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\nFirst 10 errors:');
      errors.slice(0, 10).forEach(err => console.log(`  ${err}`));
    }

  } finally {
    client.release();
    await pool.end();
  }
}

const csvFile = process.argv[2];
if (!csvFile) {
  console.log('Usage: node import_customers.js <csv_file>');
  process.exit(1);
}

importCustomers(csvFile).catch(console.error);
