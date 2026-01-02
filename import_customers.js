/**
 * Import kontrahentów z pliku CSV do bazy danych PlantManager.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Konfiguracja bazy danych
const pool = new Pool({
  host: 'localhost',
  database: 'plantmanager',
  user: 'plantmanager',
  password: 'plantmanager2025',
  port: 5432
});

// Mapowanie grup cenowych z CSV na ID w bazie
const PRICE_GROUP_MAP = {
  'Podstawowa': 1,
  'podstawowa': 1,
  '': 1,  // Pusta wartość -> podstawowa
  'Rabat 10%': 2,
  'Rabat 12%': 3,
  'Rabat 15%': 4,
  'Rabat 20%': 5,
  'Rabat 25%': 6,
  'Auchan 8%': 8,
  'Hurt': 9,
  'DETAL': 10,
  'Plus 8%': 11,
};

function cleanNip(nip) {
  if (!nip) return null;
  nip = nip.replace(/[\s\-]/g, '').trim();
  if (!nip) return null;
  return nip;
}

function cleanPhone(phone) {
  if (!phone) return null;
  phone = phone.replace(/[^\d+]/g, '').trim();
  if (!phone || phone.length < 5) return null;
  return phone;
}

function cleanEmail(email) {
  if (!email) return null;
  email = email.trim().toLowerCase();
  if (!email.includes('@') || !email.includes('.')) return null;
  return email;
}

function cleanPostalCode(postal) {
  if (!postal) return null;
  postal = postal.trim();
  return postal || null;
}

async function importCustomers(csvPath) {
  const client = await pool.connect();

  try {
    // Usuwamy wszystkich istniejących kontrahentów
    console.log("Usuwanie istniejących kontrahentów...");
    const deleteResult = await client.query("DELETE FROM customers");
    console.log(`Usunięto ${deleteResult.rowCount} kontrahentów`);

    // Reset sekwencji ID
    await client.query("ALTER SEQUENCE customers_id_seq RESTART WITH 1");

    // Wczytaj CSV
    console.log(`\nWczytywanie pliku: ${csvPath}`);
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');

    const customersData = [];
    const duplicates = new Set();
    let skipped = 0;

    // Pomijamy nagłówki (2 linie)
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const row = line.split(';');
      if (row.length < 8) {
        skipped++;
        continue;
      }

      // Kolumny: Nazwa;NIP;e-mail;grupa rabatowa;ulica;kod pocztowy;Miasto;numer telefonu
      const companyName = row[0] ? row[0].trim() : null;
      const nip = cleanNip(row[1]);
      const email = cleanEmail(row[2]);
      const priceGroup = row[3] ? row[3].trim() : '';
      const street = row[4] ? row[4].trim() : null;
      const postalCode = cleanPostalCode(row[5]);
      const city = row[6] ? row[6].trim() : null;
      const phone = cleanPhone(row[7]);

      // Pomijamy rekordy bez nazwy firmy
      if (!companyName) {
        skipped++;
        continue;
      }

      // Sprawdź duplikaty NIP
      if (nip && duplicates.has(nip)) {
        console.log(`Linia ${i + 1}: Duplikat NIP ${nip}, pomijam (${companyName})`);
        skipped++;
        continue;
      }

      if (nip) {
        duplicates.add(nip);
      }

      // Mapuj grupę cenową
      const priceGroupId = PRICE_GROUP_MAP[priceGroup] || 1;
      const country = nip && nip.startsWith('CZ') ? 'Czechy' : 'Polska';

      customersData.push([
        companyName,
        nip,
        email,
        street,
        postalCode,
        city,
        phone,
        priceGroupId,
        country
      ]);
    }

    console.log(`Wczytano ${customersData.length} rekordów (pominięto: ${skipped})`);

    // Wstaw dane partiami
    console.log("\nImportowanie do bazy...");
    const batchSize = 100;
    let imported = 0;

    for (let i = 0; i < customersData.length; i += batchSize) {
      const batch = customersData.slice(i, i + batchSize);
      const values = batch.map((_, idx) => {
        const offset = idx * 9;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
      }).join(', ');

      const params = batch.flat();

      const insertSql = `
        INSERT INTO customers (
          company_name, nip, email, street, postal_code, city, phone, price_group_id, country
        ) VALUES ${values}
      `;

      await client.query(insertSql, params);
      imported += batch.length;
      process.stdout.write(`\rZaimportowano: ${imported}/${customersData.length}`);
    }

    console.log(`\n\nZaimportowano ${imported} kontrahentów`);

    // Podsumowanie grup cenowych
    const summaryResult = await client.query(`
      SELECT pg.name, COUNT(*) as count
      FROM customers c
      JOIN price_groups pg ON c.price_group_id = pg.id
      GROUP BY pg.name
      ORDER BY count DESC
    `);

    console.log("\nPodsumowanie grup cenowych:");
    for (const row of summaryResult.rows) {
      console.log(`  ${row.name}: ${row.count} kontrahentów`);
    }

  } catch (error) {
    console.error("Błąd:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

const csvPath = process.argv[2] || '/home/polflor/Kontrahenci.csv';
importCustomers(csvPath).catch(console.error);
