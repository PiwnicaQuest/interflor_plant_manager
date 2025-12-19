-- Seed data dla PlantManager
-- Dodanie dodatkowych danych testowych

-- ============================================
-- PRODUKTY (ROŚLINY)
-- ============================================

INSERT INTO products (barcode, plant_name, pot_size, plant_height_cm, plant_passport, pallet_count, units_per_pallet, purchase_price_pln, visible_in_shop, delivery_date) VALUES
-- Rośliny tropikalne
('5901234567900', 'Monstera Adansonii', '17 cm', 50, 'PL-123460', 4, 15, 22.00, true, '2025-01-20'),
('5901234567901', 'Philodendron Scandens', '14 cm', 40, 'PL-123461', 6, 20, 16.00, true, '2025-01-18'),
('5901234567902', 'Scindapsus Pictus', '17 cm', 45, 'PL-123462', 3, 12, 20.00, true, '2025-01-22'),
('5901234567903', 'Alocasia Polly', '21 cm', 55, 'PL-123463', 2, 8, 35.00, true, '2025-01-25'),
('5901234567904', 'Calathea Ornata', '17 cm', 50, 'PL-123464', 5, 12, 28.00, true, '2025-01-20'),
('5901234567905', 'Maranta Leuconeura', '14 cm', 30, 'PL-123465', 4, 18, 19.00, true, '2025-01-18'),
('5901234567906', 'Anthurium Andraeanum', '17 cm', 45, 'PL-123466', 3, 10, 32.00, true, '2025-01-23'),
('5901234567907', 'Spathiphyllum Wallisii', '17 cm', 50, 'PL-123467', 7, 15, 17.00, true, '2025-01-15'),
('5901234567908', 'Dieffenbachia Camille', '19 cm', 60, 'PL-123468', 4, 12, 24.00, true, '2025-01-20'),
('5901234567909', 'Aglaonema Silver Bay', '17 cm', 45, 'PL-123469', 5, 14, 26.00, true, '2025-01-22'),

-- Kaktusy i sukulenty
('5901234567910', 'Echeveria Elegans', '12 cm', 15, 'PL-123470', 8, 25, 8.00, true, '2025-01-15'),
('5901234567911', 'Crassula Ovata', '14 cm', 25, 'PL-123471', 6, 20, 10.00, true, '2025-01-16'),
('5901234567912', 'Haworthia Fasciata', '10 cm', 12, 'PL-123472', 10, 30, 7.00, true, '2025-01-15'),
('5901234567913', 'Aloe Vera', '17 cm', 35, 'PL-123473', 5, 15, 15.00, true, '2025-01-18'),
('5901234567914', 'Sedum Morganianum', '14 cm', 20, 'PL-123474', 4, 18, 12.00, true, '2025-01-17'),
('5901234567915', 'Kalanchoe Blossfeldiana', '12 cm', 25, 'PL-123475', 7, 22, 9.00, true, '2025-01-15'),
('5901234567916', 'Schlumbergera Truncata', '14 cm', 20, 'PL-123476', 5, 16, 14.00, true, '2025-01-20'),

-- Paprocie
('5901234567917', 'Nephrolepis Exaltata', '17 cm', 40, 'PL-123477', 6, 14, 18.00, true, '2025-01-19'),
('5901234567918', 'Asplenium Nidus', '17 cm', 35, 'PL-123478', 4, 12, 22.00, true, '2025-01-21'),
('5901234567919', 'Platycerium Bifurcatum', '19 cm', 45, 'PL-123479', 2, 8, 38.00, true, '2025-01-25'),

-- Rośliny ampelowe
('5901234567920', 'Chlorophytum Comosum', '14 cm', 30, 'PL-123480', 8, 20, 11.00, true, '2025-01-16'),
('5901234567921', 'Tradescantia Zebrina', '12 cm', 25, 'PL-123481', 9, 24, 8.00, true, '2025-01-15'),
('5901234567922', 'Hedera Helix', '14 cm', 35, 'PL-123482', 7, 18, 13.00, true, '2025-01-17'),
('5901234567923', 'Ceropegia Woodii', '12 cm', 20, 'PL-123483', 5, 20, 16.00, true, '2025-01-19'),

-- Palmy i rośliny o dużych liściach
('5901234567924', 'Chamaedorea Elegans', '17 cm', 60, 'PL-123484', 4, 10, 25.00, true, '2025-01-20'),
('5901234567925', 'Dypsis Lutescens', '21 cm', 80, 'PL-123485', 3, 8, 42.00, true, '2025-01-23'),
('5901234567926', 'Strelitzia Nicolai', '24 cm', 100, 'PL-123486', 2, 6, 65.00, true, '2025-01-28'),
('5901234567927', 'Ficus Lyrata', '21 cm', 75, 'PL-123487', 3, 8, 45.00, true, '2025-01-25'),
('5901234567928', 'Ficus Benjamina', '19 cm', 65, 'PL-123488', 5, 10, 28.00, true, '2025-01-22'),

-- Rośliny kwitnące
('5901234567929', 'Begonia Rex', '14 cm', 30, 'PL-123489', 6, 16, 17.00, true, '2025-01-18'),
('5901234567930', 'Cyclamen Persicum', '14 cm', 25, 'PL-123490', 8, 18, 14.00, true, '2025-01-15'),
('5901234567931', 'Saintpaulia Ionantha', '10 cm', 15, 'PL-123491', 10, 25, 9.00, true, '2025-01-16'),
('5901234567932', 'Hibiscus Rosa-Sinensis', '17 cm', 50, 'PL-123492', 4, 12, 26.00, true, '2025-01-20'),
('5901234567933', 'Gardenia Jasminoides', '17 cm', 40, 'PL-123493', 3, 10, 30.00, true, '2025-01-24'),

-- Rośliny odporne
('5901234567934', 'Zamioculcas Zamiifolia', '17 cm', 50, 'PL-123494', 6, 12, 24.00, true, '2025-01-19'),
('5901234567935', 'Dracaena Marginata', '19 cm', 70, 'PL-123495', 4, 10, 32.00, true, '2025-01-21'),
('5901234567936', 'Dracaena Fragrans', '21 cm', 80, 'PL-123496', 3, 8, 38.00, true, '2025-01-23'),
('5901234567937', 'Yucca Elephantipes', '21 cm', 85, 'PL-123497', 4, 8, 35.00, true, '2025-01-22'),
('5901234567938', 'Beaucarnea Recurvata', '19 cm', 60, 'PL-123498', 3, 10, 40.00, true, '2025-01-25'),

-- Rośliny oczyszczające powietrze
('5901234567939', 'Epipremnum Aureum', '14 cm', 35, 'PL-123499', 8, 18, 15.00, true, '2025-01-17'),
('5901234567940', 'Chlorophytum Variegatum', '14 cm', 30, 'PL-123500', 7, 20, 12.00, true, '2025-01-16'),
('5901234567941', 'Gerbera Jamesonii', '14 cm', 30, 'PL-123501', 6, 16, 16.00, true, '2025-01-18'),

-- Rośliny nietypowe
('5901234567942', 'Peperomia Caperata', '12 cm', 20, 'PL-123502', 8, 22, 11.00, true, '2025-01-15'),
('5901234567943', 'Pilea Peperomioides', '14 cm', 25, 'PL-123503', 6, 18, 18.00, true, '2025-01-19'),
('5901234567944', 'Fittonia Albivenis', '10 cm', 15, 'PL-123504', 10, 28, 8.00, true, '2025-01-15'),
('5901234567945', 'Hoya Carnosa', '14 cm', 30, 'PL-123505', 5, 14, 20.00, true, '2025-01-20'),
('5901234567946', 'Rhipsalis Baccifera', '14 cm', 25, 'PL-123506', 4, 16, 17.00, true, '2025-01-18'),

-- Większe rośliny premium
('5901234567947', 'Monstera Deliciosa XXL', '27 cm', 120, 'PL-123507', 2, 4, 85.00, true, '2025-02-01'),
('5901234567948', 'Ficus Elastica Burgundy', '24 cm', 90, 'PL-123508', 2, 6, 52.00, true, '2025-01-28'),
('5901234567949', 'Alocasia Zebrina', '21 cm', 70, 'PL-123509', 2, 8, 48.00, true, '2025-01-27'),
('5901234567950', 'Philodendron Birkin', '17 cm', 45, 'PL-123510', 4, 12, 32.00, true, '2025-01-22');

-- ============================================
-- KONTRAHENCI
-- ============================================

-- Najpierw dodajmy użytkowników dla kontrahentów
INSERT INTO users (email, password_hash, role) VALUES
('kwiaciarnia.flora@example.pl', '$2b$10$example_hash', 'customer'),
('ogrody.paradise@example.pl', '$2b$10$example_hash', 'customer'),
('green.house@example.pl', '$2b$10$example_hash', 'customer'),
('botanica.shop@example.pl', '$2b$10$example_hash', 'customer'),
('rosliny.dom@example.pl', '$2b$10$example_hash', 'customer'),
('urban.jungle@example.pl', '$2b$10$example_hash', 'customer'),
('plantcorner@example.pl', '$2b$10$example_hash', 'customer'),
('jan.kowalski@example.pl', '$2b$10$example_hash', 'customer'),
('anna.nowak@example.pl', '$2b$10$example_hash', 'customer'),
('piotr.wisniewski@example.pl', '$2b$10$example_hash', 'customer'),
('maria.wojcik@example.pl', '$2b$10$example_hash', 'customer'),
('krzystof.kaminski@example.pl', '$2b$10$example_hash', 'customer'),
('ewa.lewandowska@example.pl', '$2b$10$example_hash', 'customer'),
('tomasz.zielinski@example.pl', '$2b$10$example_hash', 'customer'),
('magdalena.szymanska@example.pl', '$2b$10$example_hash', 'customer');

-- Teraz dodajmy kontrahentów (zakładając, że users zaczyna się od id 1, więc nowi będą mieli id 5+)
INSERT INTO customers (user_id, company_name, nip, street, postal_code, city, phone, email, price_group_id, notes) VALUES
(5, 'Kwiaciarnia Flora', '9876543210', 'ul. Wiosenna 12', '02-456', 'Warszawa', '+48 22 123 45 67', 'kwiaciarnia.flora@example.pl', 3, 'Stały klient, płatności 14 dni'),
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

-- Zamówienie 1: Duże zamówienie hurtowe dla Green House
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00002/2025', 3, 1, 'completed',
'{"company_name": "Green House Centrum Ogrodnicze", "nip": "2233445566", "city": "Kraków", "price_group": "rabat_15"}',
'Zamówienie sezonowe - wiosna 2025', 12450.00, '2025-01-10 09:30:00');

-- Pozycje zamówienia 1
INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross) VALUES
(2, 1, '{"plant_name": "Monstera Deliciosa", "pot_size": "21 cm"}', 60, 42.50),
(2, 2, '{"plant_name": "Ficus Elastica", "pot_size": "17 cm"}', 45, 30.60),
(2, 4, '{"plant_name": "Pothos Aureus", "pot_size": "14 cm"}', 90, 25.50),
(2, 8, '{"plant_name": "Spathiphyllum Wallisii", "pot_size": "17 cm"}', 75, 28.90);

-- Zamówienie 2: Średnie zamówienie dla Kwiaciarni Flora
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00003/2025', 1, 1, 'in_progress',
'{"company_name": "Kwiaciarnia Flora", "nip": "9876543210", "city": "Warszawa", "price_group": "rabat_12"}',
NULL, 3280.00, '2025-01-15 14:20:00');

-- Pozycje zamówienia 2
INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross) VALUES
(3, 5, '{"plant_name": "Calathea Ornata", "pot_size": "17 cm"}', 24, 49.28),
(3, 7, '{"plant_name": "Anthurium Andraeanum", "pot_size": "17 cm"}', 20, 56.32),
(3, 10, '{"plant_name": "Aglaonema Silver Bay", "pot_size": "17 cm"}', 18, 45.76);

-- Zamówienie 3: Małe zamówienie detaliczne
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, customer_notes, total_amount, created_at) VALUES
('ZAM/00004/2025', 8, 2, 'ready_for_pickup',
'{"first_name": "Jan", "last_name": "Kowalski", "city": "Warszawa", "price_group": "podstawowa"}',
NULL, 'Proszę o starannie zapakowanie roślin', 335.00, '2025-01-18 11:45:00');

-- Pozycje zamówienia 3
INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross) VALUES
(4, 1, '{"plant_name": "Monstera Deliciosa", "pot_size": "21 cm"}', 2, 50.00),
(4, 14, '{"plant_name": "Aloe Vera", "pot_size": "17 cm"}', 3, 30.00),
(4, 21, '{"plant_name": "Chlorophytum Comosum", "pot_size": "14 cm"}', 5, 22.00);

-- Zamówienie 4: Zamówienie dla Urban Jungle Store
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00005/2025', 6, 1, 'pending',
'{"company_name": "Urban Jungle Store", "nip": "5566778899", "city": "Warszawa", "price_group": "rabat_15"}',
'Zamówienie miesięczne - styczeń', 8920.00, '2025-01-20 10:15:00');

-- Pozycje zamówienia 4
INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross) VALUES
(5, 35, '{"plant_name": "Zamioculcas Zamiifolia", "pot_size": "17 cm"}', 36, 40.80),
(5, 28, '{"plant_name": "Ficus Lyrata", "pot_size": "21 cm"}', 16, 76.50),
(5, 44, '{"plant_name": "Pilea Peperomioides", "pot_size": "14 cm"}', 32, 30.60),
(5, 40, '{"plant_name": "Epipremnum Aureum", "pot_size": "14 cm"}', 54, 25.50);

-- Zamówienie 5: Zamówienie dla Botanica Shop
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00006/2025', 4, 1, 'in_progress',
'{"company_name": "Botanica Shop", "nip": "3344556677", "city": "Wrocław", "price_group": "rabat_10"}',
'Mix roślin popularnych', 4560.00, '2025-01-22 15:30:00');

-- Pozycje zamówienia 5
INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross) VALUES
(6, 3, '{"plant_name": "Sansevieria Trifasciata", "pot_size": "12 cm"}', 40, 21.60),
(6, 18, '{"plant_name": "Nephrolepis Exaltata", "pot_size": "17 cm"}', 28, 32.40),
(6, 30, '{"plant_name": "Begonia Rex", "pot_size": "14 cm"}', 32, 30.60),
(6, 42, '{"plant_name": "Kalanchoe Blossfeldiana", "pot_size": "12 cm"}', 44, 16.20);

-- Zamówienie 6: Zamówienie detaliczne
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00007/2025', 11, 2, 'completed',
'{"first_name": "Anna", "last_name": "Nowak", "city": "Warszawa", "price_group": "podstawowa"}',
NULL, 186.00, '2025-01-23 13:20:00');

-- Pozycje zamówienia 6
INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross) VALUES
(7, 11, '{"plant_name": "Echeveria Elegans", "pot_size": "12 cm"}', 4, 16.00),
(7, 22, '{"plant_name": "Tradescantia Zebrina", "pot_size": "12 cm"}', 3, 16.00),
(7, 43, '{"plant_name": "Peperomia Caperata", "pot_size": "12 cm"}', 5, 22.00);

-- Zamówienie 7: Zamówienie dla Plant Corner Gdańsk
INSERT INTO orders (order_number, customer_id, created_by_user_id, status, customer_snapshot, notes, total_amount, created_at) VALUES
('ZAM/00008/2025', 7, 1, 'pending',
'{"company_name": "Plant Corner Gdańsk", "nip": "6677889900", "city": "Gdańsk", "price_group": "rabat_12"}',
'Zamówienie testowe - nowa współpraca', 2840.00, '2025-01-24 09:00:00');

-- Pozycje zamówienia 7
INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price_gross) VALUES
(8, 25, '{"plant_name": "Chamaedorea Elegans", "pot_size": "17 cm"}', 20, 44.00),
(8, 29, '{"plant_name": "Ficus Benjamina", "pot_size": "19 cm"}', 15, 49.28),
(8, 46, '{"plant_name": "Hoya Carnosa", "pot_size": "14 cm"}', 24, 35.20);

-- ============================================
-- AKTUALIZACJA SEKWENCJI NUMERACJI
-- ============================================

-- Zaktualizuj sekwencję dla zamówień
INSERT INTO document_sequences (document_type, year, current_number, prefix) VALUES
('order', 2025, 8, 'ZAM')
ON CONFLICT (document_type, year) DO UPDATE
SET current_number = 8, updated_at = CURRENT_TIMESTAMP;
