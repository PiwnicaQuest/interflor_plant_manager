-- Dodanie kontrahentów i zamówień
-- (użytkownicy 5-19 już istnieją w bazie)

-- ============================================
-- KONTRAHENCI
-- ============================================

INSERT INTO customers (user_id, company_name, nip, street, postal_code, city, phone, email, price_group_id, notes) VALUES
(5, 'Kwiaciarnia Flora', '8765432109', 'ul. Wiosenna 12', '02-456', 'Warszawa', '+48 22 123 45 67', 'kwiaciarnia.flora@example.pl', 3, 'Stały klient, płatności 14 dni'),
(6, 'Ogrody Paradise Sp. z o.o.', '1122334455', 'ul. Ogrodowa 5', '03-789', 'Warszawa', '+48 22 234 56 78', 'ogrody.paradise@example.pl', 4, 'Duże zamówienia sezonowe'),
(7, 'Green House Centrum Ogrodnicze', '2233445566', 'ul. Zielona 28', '01-234', 'Kraków', '+48 12 345 67 89', 'green.house@example.pl', 5, 'Rabat za wolumen'),
(8, 'Botanica Shop', '3344556677', 'ul. Botaniczna 7', '50-123', 'Wrocław', '+48 71 456 78 90', 'botanica.shop@example.pl', 2, NULL),
(9, 'Rośliny do Domu i Ogrodu', '4455667788', 'ul. Kwiatowa 19', '30-567', 'Kraków', '+48 12 567 89 01', 'rosliny.dom@example.pl', 3, 'Preferuje dostawę w poniedziałki'),
(10, 'Urban Jungle Store', '5566778899', 'ul. Miejska 45', '00-789', 'Warszawa', '+48 22 678 90 12', 'urban.jungle@example.pl', 4, 'Sklep internetowy + stacjonarny'),
(11, 'Plant Corner Gdańsk', '6677889900', 'ul. Morska 33', '80-234', 'Gdańsk', '+48 58 789 01 23', 'plantcorner@example.pl', 3, NULL),
(12, NULL, NULL, 'ul. Słoneczna 8', '04-123', 'Warszawa', '+48 501 234 567', 'jan.kowalski@example.pl', 1, 'Klient detaliczny'),
(13, NULL, NULL, 'ul. Polna 15', '02-789', 'Warszawa', '+48 602 345 678', 'anna.nowak@example.pl', 1, 'Klient detaliczny'),
(14, NULL, NULL, 'ul. Leśna 22', '31-456', 'Kraków', '+48 503 456 789', 'piotr.wisniewski@example.pl', 1, NULL),
(15, NULL, NULL, 'ul. Parkowa 9', '50-678', 'Wrocław', '+48 604 567 890', 'maria.wojcik@example.pl', 1, 'Stały klient detaliczny'),
(16, NULL, NULL, 'ul. Nadrzeczna 14', '80-123', 'Gdańsk', '+48 505 678 901', 'krzystof.kaminski@example.pl', 1, NULL),
(17, NULL, NULL, 'ul. Spacerowa 27', '00-456', 'Warszawa', '+48 606 789 012', 'ewa.lewandowska@example.pl', 2, 'Klient VIP'),
(18, NULL, NULL, 'ul. Górska 11', '30-234', 'Kraków', '+48 507 890 123', 'tomasz.zielinski@example.pl', 1, NULL),
(19, NULL, NULL, 'ul. Rzeczna 6', '02-345', 'Warszawa', '+48 608 901 234', 'magdalena.szymanska@example.pl', 1, NULL);

-- ============================================
-- ZAMÓWIENIA
-- ============================================

-- Zamówienie 1: Duże zamówienie hurtowe dla Green House (customer_id = 7)
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00002/2025', 7, 1, 'completed',
'{"company_name": "Green House Centrum Ogrodnicze", "nip": "2233445566", "city": "Kraków", "price_group": "rabat_15"}',
'Zamówienie sezonowe - wiosna 2025', 12450.00, '2025-01-10 09:30:00');

-- Pozycje zamówienia 1 (order_id będzie automatycznie przypisane - zakładam że to będzie 2)
INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross)
SELECT
    (SELECT id FROM orders WHERE order_number = 'ZAM/00002/2025'),
    p.id,
    jsonb_build_object('plant_name', p.plant_name, 'pot_size', p.pot_size),
    q.quantity,
    q.unit_price
FROM (VALUES
    ('5901234567890', 60, 42.50),
    ('5901234567891', 45, 30.60),
    ('5901234567893', 90, 25.50),
    ('5901234567907', 75, 28.90)
) AS q(barcode, quantity, unit_price)
JOIN products p ON p.barcode = q.barcode;

-- Zamówienie 2: Średnie zamówienie dla Kwiaciarni Flora (customer_id = 5)
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00003/2025', 5, 1, 'in_progress',
'{"company_name": "Kwiaciarnia Flora", "nip": "8765432109", "city": "Warszawa", "price_group": "rabat_12"}',
NULL, 3280.00, '2025-01-15 14:20:00');

INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross)
SELECT
    (SELECT id FROM orders WHERE order_number = 'ZAM/00003/2025'),
    p.id,
    jsonb_build_object('plant_name', p.plant_name, 'pot_size', p.pot_size),
    q.quantity,
    q.unit_price
FROM (VALUES
    ('5901234567904', 24, 49.28),
    ('5901234567906', 20, 56.32),
    ('5901234567909', 18, 45.76)
) AS q(barcode, quantity, unit_price)
JOIN products p ON p.barcode = q.barcode;

-- Zamówienie 3: Małe zamówienie detaliczne (customer_id = 12 - Jan Kowalski)
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, customer_notes, total_amount, created_at) VALUES
('ZAM/00004/2025', 12, 2, 'ready_for_pickup',
'{"first_name": "Jan", "last_name": "Kowalski", "city": "Warszawa", "price_group": "podstawowa"}',
NULL, 'Proszę o starannie zapakowanie roślin', 335.00, '2025-01-18 11:45:00');

INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross)
SELECT
    (SELECT id FROM orders WHERE order_number = 'ZAM/00004/2025'),
    p.id,
    jsonb_build_object('plant_name', p.plant_name, 'pot_size', p.pot_size),
    q.quantity,
    q.unit_price
FROM (VALUES
    ('5901234567890', 2, 50.00),
    ('5901234567913', 3, 30.00),
    ('5901234567920', 5, 22.00)
) AS q(barcode, quantity, unit_price)
JOIN products p ON p.barcode = q.barcode;

-- Zamówienie 4: Zamówienie dla Urban Jungle Store (customer_id = 10)
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00005/2025', 10, 1, 'pending',
'{"company_name": "Urban Jungle Store", "nip": "5566778899", "city": "Warszawa", "price_group": "rabat_15"}',
'Zamówienie miesięczne - styczeń', 8920.00, '2025-01-20 10:15:00');

INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross)
SELECT
    (SELECT id FROM orders WHERE order_number = 'ZAM/00005/2025'),
    p.id,
    jsonb_build_object('plant_name', p.plant_name, 'pot_size', p.pot_size),
    q.quantity,
    q.unit_price
FROM (VALUES
    ('5901234567934', 36, 40.80),
    ('5901234567927', 16, 76.50),
    ('5901234567943', 32, 30.60),
    ('5901234567939', 54, 25.50)
) AS q(barcode, quantity, unit_price)
JOIN products p ON p.barcode = q.barcode;

-- Zamówienie 5: Zamówienie dla Botanica Shop (customer_id = 8)
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00006/2025', 8, 1, 'in_progress',
'{"company_name": "Botanica Shop", "nip": "3344556677", "city": "Wrocław", "price_group": "rabat_10"}',
'Mix roślin popularnych', 4560.00, '2025-01-22 15:30:00');

INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross)
SELECT
    (SELECT id FROM orders WHERE order_number = 'ZAM/00006/2025'),
    p.id,
    jsonb_build_object('plant_name', p.plant_name, 'pot_size', p.pot_size),
    q.quantity,
    q.unit_price
FROM (VALUES
    ('5901234567892', 40, 21.60),
    ('5901234567917', 28, 32.40),
    ('5901234567929', 32, 30.60),
    ('5901234567915', 44, 16.20)
) AS q(barcode, quantity, unit_price)
JOIN products p ON p.barcode = q.barcode;

-- Zamówienie 6: Zamówienie detaliczne (customer_id = 13 - Anna Nowak)
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00007/2025', 13, 2, 'completed',
'{"first_name": "Anna", "last_name": "Nowak", "city": "Warszawa", "price_group": "podstawowa"}',
NULL, 186.00, '2025-01-23 13:20:00');

INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross)
SELECT
    (SELECT id FROM orders WHERE order_number = 'ZAM/00007/2025'),
    p.id,
    jsonb_build_object('plant_name', p.plant_name, 'pot_size', p.pot_size),
    q.quantity,
    q.unit_price
FROM (VALUES
    ('5901234567910', 4, 16.00),
    ('5901234567921', 3, 16.00),
    ('5901234567942', 5, 22.00)
) AS q(barcode, quantity, unit_price)
JOIN products p ON p.barcode = q.barcode;

-- Zamówienie 7: Zamówienie dla Plant Corner Gdańsk (customer_id = 11)
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00008/2025', 11, 1, 'pending',
'{"company_name": "Plant Corner Gdańsk", "nip": "6677889900", "city": "Gdańsk", "price_group": "rabat_12"}',
'Zamówienie testowe - nowa współpraca', 2840.00, '2025-01-24 09:00:00');

INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross)
SELECT
    (SELECT id FROM orders WHERE order_number = 'ZAM/00008/2025'),
    p.id,
    jsonb_build_object('plant_name', p.plant_name, 'pot_size', p.pot_size),
    q.quantity,
    q.unit_price
FROM (VALUES
    ('5901234567924', 20, 44.00),
    ('5901234567928', 15, 49.28),
    ('5901234567945', 24, 35.20)
) AS q(barcode, quantity, unit_price)
JOIN products p ON p.barcode = q.barcode;

-- Zamówienie 8: Zamówienie dla Ogrody Paradise (customer_id = 6)
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00009/2025', 6, 1, 'in_progress',
'{"company_name": "Ogrody Paradise Sp. z o.o.", "nip": "1122334455", "city": "Warszawa", "price_group": "rabat_15"}',
'Duże zamówienie na wiosnę', 15680.00, '2025-01-25 10:00:00');

INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross)
SELECT
    (SELECT id FROM orders WHERE order_number = 'ZAM/00009/2025'),
    p.id,
    jsonb_build_object('plant_name', p.plant_name, 'pot_size', p.pot_size),
    q.quantity,
    q.unit_price
FROM (VALUES
    ('5901234567890', 80, 42.50),
    ('5901234567901', 60, 27.20),
    ('5901234567934', 40, 40.80),
    ('5901234567907', 50, 28.90),
    ('5901234567939', 72, 25.50)
) AS q(barcode, quantity, unit_price)
JOIN products p ON p.barcode = q.barcode;

-- Zamówienie 9: Zamówienie detaliczne (customer_id = 15 - Maria Wójcik)
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00010/2025', 15, 2, 'ready_for_pickup',
'{"first_name": "Maria", "last_name": "Wójcik", "city": "Wrocław", "price_group": "podstawowa"}',
NULL, 428.00, '2025-01-26 14:30:00');

INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross)
SELECT
    (SELECT id FROM orders WHERE order_number = 'ZAM/00010/2025'),
    p.id,
    jsonb_build_object('plant_name', p.plant_name, 'pot_size', p.pot_size),
    q.quantity,
    q.unit_price
FROM (VALUES
    ('5901234567904', 3, 56.00),
    ('5901234567918', 2, 44.00),
    ('5901234567930', 4, 28.00),
    ('5901234567913', 2, 30.00)
) AS q(barcode, quantity, unit_price)
JOIN products p ON p.barcode = q.barcode;

-- Zamówienie 10: Zamówienie dla Rośliny do Domu i Ogrodu (customer_id = 9)
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00011/2025', 9, 1, 'pending',
'{"company_name": "Rośliny do Domu i Ogrodu", "nip": "4455667788", "city": "Kraków", "price_group": "rabat_12"}',
'Standardowe miesięczne zamówienie', 6240.00, '2025-01-27 09:15:00');

INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross)
SELECT
    (SELECT id FROM orders WHERE order_number = 'ZAM/00011/2025'),
    p.id,
    jsonb_build_object('plant_name', p.plant_name, 'pot_size', p.pot_size),
    q.quantity,
    q.unit_price
FROM (VALUES
    ('5901234567891', 35, 31.68),
    ('5901234567935', 25, 56.32),
    ('5901234567920', 48, 19.36),
    ('5901234567922', 40, 22.88)
) AS q(barcode, quantity, unit_price)
JOIN products p ON p.barcode = q.barcode;

-- ============================================
-- AKTUALIZACJA SEKWENCJI NUMERACJI
-- ============================================

INSERT INTO document_sequences (document_type, year, current_number, prefix) VALUES
('order', 2025, 11, 'ZAM')
ON CONFLICT (document_type, year) DO UPDATE
SET current_number = 11, updated_at = CURRENT_TIMESTAMP;
