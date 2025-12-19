require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Lista nazw roślin
const plantNames = [
  'Monstera Deliciosa', 'Philodendron', 'Pothos', 'Snake Plant', 'ZZ Plant',
  'Peace Lily', 'Spider Plant', 'Rubber Plant', 'Fiddle Leaf Fig', 'Aloe Vera',
  'Jade Plant', 'Chinese Money Plant', 'String of Pearls', 'Boston Fern', 'Calathea',
  'Dracaena', 'Aglaonema', 'Schefflera', 'Dieffenbachia', 'Anthurium',
  'Croton', 'Peperomia', 'Maranta', 'Begonia', 'Hoya',
  'English Ivy', 'Parlor Palm', 'Areca Palm', 'Bird of Paradise', 'Orchid',
  'African Violet', 'Christmas Cactus', 'Succulent Mix', 'Haworthia', 'Echeveria',
  'Crassula', 'Sedum', 'Kalanchoe', 'Bromeliad', 'Cyclamen',
  'Geranium', 'Impatiens', 'Marigold', 'Petunia', 'Pansy',
  'Lavender', 'Rosemary', 'Basil', 'Mint', 'Thyme'
];

const potSizes = ['8cm', '10cm', '12cm', '14cm', '17cm', '19cm', '21cm', '24cm', '27cm', '30cm'];

// Lista nazw firm
const companyNames = [
  'Ogrody Warszawy Sp. z o.o.', 'Zielona Przyszłość S.A.', 'Flora Garden',
  'Rośliny Premium', 'EkoRośliny Polska', 'Garden Center Max',
  'Kwiaciarnia Roma', 'Zieleń i Ogród', 'Plant Paradise',
  'Natura Viva', 'Ogród Botaniczny Trade', 'Green House Polska',
  'Tropikalne Rośliny Sp. z o.o.', 'Urban Jungle', 'Plantarium'
];

// Imiona i nazwiska
const firstNames = ['Jan', 'Anna', 'Piotr', 'Maria', 'Krzysztof', 'Katarzyna', 'Tomasz', 'Agnieszka', 'Michał', 'Magdalena'];
const lastNames = ['Kowalski', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak'];

// Miasta
const cities = ['Warszawa', 'Kraków', 'Łódź', 'Wrocław', 'Poznań', 'Gdańsk', 'Szczecin', 'Bydgoszcz', 'Lublin', 'Katowice'];
const streets = ['Główna', 'Kwiatowa', 'Ogrodowa', 'Polna', 'Leśna', 'Parkowa', 'Słoneczna', 'Zielona', 'Lipowa', 'Różana'];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateBarcode() {
  return '590' + String(randomInt(10000000, 99999999)) + randomInt(0, 9);
}

function generateNIP() {
  return String(randomInt(1000000000, 9999999999));
}

function generatePhone() {
  return `+48 ${randomInt(500, 999)} ${randomInt(100, 999)} ${randomInt(100, 999)}`;
}

function generateEmail(name) {
  return name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '') + '@example.com';
}

async function seedProducts(count) {
  console.log(`Dodawanie ${count} produktów...`);

  for (let i = 0; i < count; i++) {
    const plantName = randomChoice(plantNames);
    const variety = randomInt(1, 100) > 70 ? ` '${randomChoice(['Variegata', 'Compacta', 'Mini', 'Giant', 'Aurea'])}'` : '';
    const fullName = plantName + variety;
    const potSize = randomChoice(potSizes);
    const plantHeight = randomInt(15, 200);
    const barcode = generateBarcode();
    const purchasePrice = randomInt(5, 100) + 0.50;
    const palletCount = randomInt(1, 20);
    const unitsPerPallet = randomInt(10, 50);
    const visibleInShop = randomInt(1, 100) > 20; // 80% visible

    await pool.query(
      `INSERT INTO products (plant_name, pot_size, plant_height_cm, barcode, purchase_price_pln, pallet_count, units_per_pallet, visible_in_shop)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [fullName, potSize, plantHeight, barcode, purchasePrice, palletCount, unitsPerPallet, visibleInShop]
    );
  }

  console.log(`✓ Dodano ${count} produktów`);
}

async function seedCustomers(count) {
  console.log(`Dodawanie ${count} kontrahentów...`);

  // Połowa to firmy, połowa to osoby prywatne
  for (let i = 0; i < count; i++) {
    const isCompany = i < count / 2;

    if (isCompany) {
      const companyName = i < companyNames.length ? companyNames[i] : `${randomChoice(companyNames)} ${i}`;
      const city = randomChoice(cities);
      const street = randomChoice(streets);

      await pool.query(
        `INSERT INTO customers (company_name, nip, street, city, postal_code, phone, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          companyName,
          generateNIP(),
          `ul. ${street} ${randomInt(1, 200)}`,
          city,
          `${randomInt(10, 99)}-${randomInt(100, 999)}`,
          generatePhone(),
          generateEmail(companyName)
        ]
      );
    } else {
      const firstName = randomChoice(firstNames);
      const lastName = randomChoice(lastNames);
      const city = randomChoice(cities);
      const street = randomChoice(streets);

      await pool.query(
        `INSERT INTO customers (first_name, last_name, street, city, postal_code, phone, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          firstName,
          lastName,
          `ul. ${street} ${randomInt(1, 200)}`,
          city,
          `${randomInt(10, 99)}-${randomInt(100, 999)}`,
          generatePhone(),
          generateEmail(`${firstName}.${lastName}`)
        ]
      );
    }
  }

  console.log(`✓ Dodano ${count} kontrahentów`);
}

async function seedOrders(count) {
  console.log(`Dodawanie ${count} zamówień...`);

  // Pobierz wszystkich klientów i produkty
  const customersResult = await pool.query('SELECT * FROM customers ORDER BY id');
  const customers = customersResult.rows;

  const productsResult = await pool.query('SELECT id, plant_name, pot_size, plant_height_cm, barcode, base_price_gross, image_url FROM products ORDER BY id LIMIT 100');
  const products = productsResult.rows;

  if (customers.length === 0 || products.length === 0) {
    console.log('Brak klientów lub produktów w bazie danych');
    return;
  }

  const statuses = ['pending', 'in_progress', 'ready_for_pickup', 'completed', 'cancelled'];

  for (let i = 0; i < count; i++) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const customer = randomChoice(customers);
      const status = randomChoice(statuses);

      // Generuj numer zamówienia
      const orderNumberResult = await client.query(
        "SELECT get_next_document_number('order', 'ORD') as order_number"
      );
      const orderNumber = orderNumberResult.rows[0].order_number;

      // Snapshot klienta
      const customerSnapshot = {
        companyName: customer.company_name,
        firstName: customer.first_name,
        lastName: customer.last_name,
        nip: customer.nip,
        street: customer.street,
        city: customer.city,
        postalCode: customer.postal_code,
        phone: customer.phone,
        email: customer.email
      };

      // Losowa liczba pozycji w zamówieniu (2-8)
      const itemCount = randomInt(2, 8);
      const orderItems = [];
      let totalAmount = 0;

      for (let j = 0; j < itemCount; j++) {
        const product = randomChoice(products);
        const quantity = randomInt(5, 100);
        const unitPriceGross = parseFloat(product.base_price_gross);

        orderItems.push({
          productId: product.id,
          quantity,
          unitPriceGross,
          productSnapshot: {
            id: product.id,
            plantName: product.plant_name,
            potSize: product.pot_size,
            plantHeightCm: product.plant_height_cm,
            barcode: product.barcode,
            imageUrl: product.image_url
          }
        });

        totalAmount += quantity * unitPriceGross;
      }

      // Utwórz zamówienie
      const orderResult = await client.query(
        `INSERT INTO orders (order_number, customer_id, customer_snapshot, total_amount, status, created_by_user_id, customer_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          orderNumber,
          customer.id,
          JSON.stringify(customerSnapshot),
          totalAmount,
          status,
          1, // admin user
          randomInt(1, 100) > 80 ? 'Proszę o kontakt przed dostawą' : null
        ]
      );

      const order = orderResult.rows[0];

      // Dodaj pozycje zamówienia
      for (const item of orderItems) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross)
           VALUES ($1, $2, $3, $4, $5)`,
          [order.id, item.productId, JSON.stringify(item.productSnapshot), item.quantity, item.unitPriceGross]
        );
      }

      // Jeśli zamówienie nie jest pending, dodaj wpis do logu statusów
      if (status !== 'pending') {
        await client.query(
          `INSERT INTO order_status_log (order_id, old_status, new_status, changed_by_user_id, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [order.id, 'pending', status, 1, 'Status zmieniony automatycznie podczas seedowania']
        );
      }

      await client.query('COMMIT');
      console.log(`✓ Dodano zamówienie ${orderNumber} (${status})`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Błąd podczas tworzenia zamówienia:', error);
    } finally {
      client.release();
    }
  }

  console.log(`✓ Dodano ${count} zamówień`);
}

async function seedInventoryMovements() {
  console.log('Dodawanie ruchów magazynowych...');

  const productsResult = await pool.query('SELECT id FROM products LIMIT 50');
  const products = productsResult.rows;

  const movementTypes = ['purchase', 'sale', 'correction', 'return'];
  const reasons = [
    'Przyjęcie towaru od dostawcy',
    'Sprzedaż do klienta',
    'Korekta inwentaryzacji',
    'Zwrot od klienta',
    'Uszkodzenie towaru',
    'Promocja sezonowa'
  ];

  for (let i = 0; i < 30; i++) {
    const product = randomChoice(products);
    const movementType = randomChoice(movementTypes);
    const deltaUnits = randomInt(5, 100) * (movementType === 'sale' ? -1 : 1);
    const deltaPallets = Math.floor(Math.abs(deltaUnits) / 20) * (deltaUnits < 0 ? -1 : 1);

    await pool.query(
      `INSERT INTO inventory_movements (product_id, user_id, movement_type, delta_units, delta_pallets, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [product.id, 1, movementType, deltaUnits, deltaPallets, randomChoice(reasons)]
    );
  }

  console.log('✓ Dodano ruchy magazynowe');
}

async function main() {
  try {
    console.log('=== Rozpoczynam seedowanie danych testowych ===\n');

    await seedProducts(150);
    await seedCustomers(20);
    await seedOrders(10);
    await seedInventoryMovements();

    console.log('\n=== Seedowanie zakończone pomyślnie! ===');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Błąd podczas seedowania:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
