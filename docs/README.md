# PlantManager - Dokumentacja Techniczna

## Spis treści

1. [Przegląd projektu](#przegląd-projektu)
2. [Architektura systemu](#architektura-systemu)
3. [Moduły biznesowe](#moduły-biznesowe)
4. [Przepływ pracy](#przepływ-pracy)
5. [API REST - Endpointy](#api-rest---endpointy)
6. [Uwierzytelnianie i autoryzacja](#uwierzytelnianie-i-autoryzacja)
7. [WebSockets](#websockets)
8. [Integracje zewnętrzne](#integracje-zewnętrzne)
9. [Instalacja i uruchomienie](#instalacja-i-uruchomienie)

---

## Przegląd projektu

**PlantManager** to kompleksowy system zarządzania magazynem i sprzedażą roślin doniczkowych. System składa się z:

- **Backend API** (Node.js + TypeScript + PostgreSQL)
- **Panel administracyjny** (React + TypeScript + Tailwind CSS)
- **Sklep internetowy B2B/B2C** (React + TypeScript)
- **Aplikacja mobilna Android** (React Native + Expo)
- **Moduł POS/Kasa** (część panelu administracyjnego)

### Technologie

- **Backend**: Node.js 18+, TypeScript, Express/Fastify, PostgreSQL 16, pg, bcrypt, jsonwebtoken, ws (WebSockets)
- **Frontend**: React 18+, TypeScript, React Router, Tailwind CSS, Axios
- **Mobile**: React Native, Expo, React Navigation, expo-barcode-scanner
- **Narzędzia**: Vite, ESLint, Prettier

---

## Architektura systemu

### Struktura monorepo

```
PlantManager/
├── backend/               # Backend API
│   ├── src/
│   │   ├── models/        # Modele bazy danych (ORM)
│   │   ├── services/      # Logika biznesowa
│   │   ├── controllers/   # Kontrolery HTTP
│   │   ├── middleware/    # Middleware (auth, validation)
│   │   ├── types/         # Typy TypeScript
│   │   ├── utils/         # Narzędzia pomocnicze
│   │   └── main.ts        # Entrypoint
│   ├── config/
│   └── package.json
├── web-panel/             # Panel administracyjny
│   ├── src/
│   │   ├── components/    # Komponenty React
│   │   ├── pages/         # Strony
│   │   ├── hooks/         # Custom hooks
│   │   ├── services/      # API client
│   │   ├── types/         # Typy TypeScript
│   │   └── styles/        # Style CSS
│   └── package.json
├── web-shop/              # Sklep internetowy
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── ...
│   └── package.json
├── mobile-scanner/        # Aplikacja Android
│   ├── src/
│   │   ├── screens/
│   │   ├── components/
│   │   ├── navigation/
│   │   └── services/
│   └── package.json
├── docs/                  # Dokumentacja
│   ├── README.md
│   └── db_schema.sql
└── package.json           # Root package.json (monorepo)
```

### Przepływ danych

```
┌─────────────────┐
│  Web Panel      │◄────┐
│  (Admin/Staff)  │     │
└─────────────────┘     │
                        │
┌─────────────────┐     │     ┌──────────────┐      ┌──────────────┐
│  Web Shop       │────►├────►│  Backend API │◄────►│  PostgreSQL  │
│  (Customers)    │     │     │  (REST+WS)   │      │   Database   │
└─────────────────┘     │     └──────────────┘      └──────────────┘
                        │
┌─────────────────┐     │
│  Mobile Scanner │────►│
│  (Warehouse)    │     │
└─────────────────┘     │
                        │
┌─────────────────┐     │
│  POS Terminal   │────►│
│  (Cashier)      │     │
└─────────────────┘─────┘
```

---

## Moduły biznesowe

### 1. Magazyn (Inventory)

**Opis**: Katalog wszystkich roślin dostępnych w sprzedaży.

**Funkcjonalności**:
- Zarządzanie pozycjami magazynowymi (CRUD)
- Automatyczne przeliczanie ilości: `total_units = pallet_count × units_per_pallet`
- Automatyczne obliczanie cen z rabatem (10%, 12%, 15%, 20%, 25%)
- Cena podstawowa = cena zakupu × 2.0 (100% marży)
- Automatyczna flaga statusu `NISKI` gdy `pallet_count < 2`
- Przełącznik widoczności w sklepie internetowym (`visible_in_shop`)
- Import CSV/XLSX (parsowanie i tworzenie/aktualizacja pozycji)
- Historia ruchów magazynowych (tabela `inventory_movements`)
- Statystyki sprzedaży

**Widoki**:
- Tabela z sortowaniem i filtrowaniem kolumn (drag&drop)
- Filtr po statusie stanu i nazwie rośliny
- Widok szczegółowy z wykresem rozchodów i historią ruchów
- Formularz dodawania/edycji pozycji

**Pola magazynowe**:
```typescript
{
  id: number;
  barcode: string;
  plantName: string;
  potSize: string;
  plantHeightCm: number;
  plantPassport: string;
  palletCount: number;
  unitsPerPallet: number;
  totalUnits: number; // wyliczane
  purchasePricePln: number;
  basePriceGross: number; // wyliczane
  priceDiscount10: number; // wyliczane
  priceDiscount12: number;
  priceDiscount15: number;
  priceDiscount20: number;
  priceDiscount25: number;
  inventoryStatus: 'ok' | 'low';
  visibleInShop: boolean;
  imageUrl: string;
  deliveryDate: Date;
}
```

### 2. Zamówienia (Orders)

**Opis**: Zarządzanie zamówieniami z dwóch źródeł: sklep internetowy i dodane ręcznie przez pracownika.

**Funkcjonalności**:
- Lista zamówień z filtrowaniem po statusie
- Tworzenie nowego zamówienia (puste → wybór klienta → dodawanie pozycji)
- Edycja zamówienia (dodawanie/usuwanie/zmiana ilości pozycji)
- Zmiana statusu zamówienia: `oczekuje` → `w_przygotowaniu` → `gotowe_do_odbioru` → `completed`
- Live update statusu przez WebSocket
- Notatki klienta i wewnętrzne
- Historia zmian statusu (tabela `order_status_log`)

**Statusy zamówienia**:
- `pending` - Oczekuje
- `in_progress` - W przygotowaniu
- `ready_for_pickup` - Gotowe do odbioru
- `completed` - Zakończone
- `cancelled` - Anulowane

**Struktura zamówienia**:
```typescript
{
  id: number;
  orderNumber: string;
  customerId: number;
  status: OrderStatus;
  items: Array<{
    productId: number;
    quantity: number;
    unitPriceGross: number;
  }>;
  customerSnapshot: object; // snapshot danych klienta
  notes: string;
  customerNotes: string;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3. Faktury (Invoices)

**Opis**: Zarządzanie fakturami VAT.

**Funkcjonalności**:
- Generowanie faktury na podstawie zamówienia
- Tworzenie faktury bez zamówienia (sprzedaż od ręki)
- Snapshot danych nabywcy z momentu wystawienia (niezmienny)
- Automatyczna numeracja faktur (format: `FV/00001/2026`)
- Lista faktur z filtrem po dacie i kliencie
- Eksport do PDF (planowane - obecnie placeholder)

**Struktura faktury**:
```typescript
{
  id: number;
  invoiceNumber: string;
  orderId?: number;
  customerId: number;
  buyerSnapshot: {
    companyName: string;
    nip: string;
    street: string;
    postalCode: string;
    city: string;
  };
  issueDate: Date;
  saleDate: Date;
  paymentDeadline: Date;
  paymentMethod: 'card' | 'cash' | 'transfer';
  items: Array<{
    description: string;
    quantity: number;
    unitPriceNet: number;
    vatRate: number;
  }>;
  subtotalNet: number;
  totalVat: number;
  totalGross: number;
  pdfUrl?: string;
}
```

### 4. Kontrahenci (Customers)

**Opis**: Baza klientów hurtowych i detalicznych.

**Funkcjonalności**:
- CRUD kontrahentów
- Automatyczne pobieranie danych firmy po NIP (integracja z GUS - planowane)
- Przypisywanie grupy cenowej (podstawowa, rabat 10%, 12%, 15%, 20%, 25%)
- Utworzenie konta do sklepu internetowego
- Grupa cenowa decyduje o cenach widocznych w sklepie

**Struktura kontrahenta**:
```typescript
{
  id: number;
  userId?: number; // powiązanie z kontem użytkownika
  companyName?: string;
  firstName?: string;
  lastName?: string;
  nip?: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  priceGroupId: number; // grupa cenowa
  notes: string;
}
```

**Grupy cenowe**:
1. Podstawowa (0% rabatu) - cena_podstawowa_brutto
2. Rabat 10% - cena_rabat_10
3. Rabat 12% - cena_rabat_12
4. Rabat 15% - cena_rabat_15
5. Rabat 20% - cena_rabat_20
6. Rabat 25% - cena_rabat_25

### 5. Moduł POS/Kasa

**Opis**: Stanowisko kasowe do rozliczania zamówień przy wydaniu klientowi.

**Funkcjonalności**:
- Lista aktywnych zamówień (nie rozliczone)
- Wybór zamówienia klienta
- Podgląd pozycji zamówienia
- Korekta ilości last minute
- Wybór formy płatności: karta / gotówka / przelew
- Wybór typu dokumentu: faktura VAT lub paragon detaliczny
- Automatyczna aktualizacja stanu magazynu po zamknięciu sprzedaży
- Zapisanie paragonu lub faktury
- Tryb pełnoekranowy (tablet/laptop)
- Tryb ciemny (dark mode)

**Przepływ POS**:
1. Wybór zamówienia z listy aktywnych
2. Weryfikacja pozycji i ewentualna korekta
3. Kliknięcie "Zamknij sprzedaż"
4. Wybór metody płatności (KARTA / GOTÓWKA / PRZELEW)
5. Wybór typu dokumentu (FAKTURA / PARAGON)
6. Potwierdzenie → rozchód z magazynu, zamknięcie zamówienia, utworzenie dokumentu

### 6. Sklep internetowy (Web Shop)

**Opis**: Publiczna część dla klientów B2B/B2C.

**Funkcjonalności**:
- Lista roślin z flagą `visible_in_shop = true`
- Wyświetlanie ceny zgodnie z grupą cenową zalogowanego klienta
- Logowanie klienta (kontrahenta)
- Koszyk zakupowy
- Składanie zamówienia → tworzy zamówienie w bazie ze statusem `pending`
- Widoczność aktualnego stanu magazynowego

**Wyświetlane informacje o produkcie**:
- Nazwa rośliny
- Zdjęcie
- Rozmiar doniczki
- Wysokość rośliny
- Cena (z grupy cenowej klienta)
- Aktualny stan (ilość sztuk)

### 7. Aplikacja mobilna Android (Scanner)

**Opis**: Narzędzie pracy dla magazyniera ze skanerem kodów kreskowych.

**Funkcjonalności**:
- Logowanie pracownika (token auth)
- **Ekran SKANUJ**:
  - Dostęp do kamery
  - Skanowanie kodu kreskowego paletki
  - Wyświetlanie informacji o produkcie:
    - Nazwa rośliny
    - Aktualny stan (palety, sztuki)
    - Ostatnie 5 ruchów magazynowych
- **Ekran ZAMÓWIENIA**:
  - Lista aktywnych zamówień (z filtrem po statusie)
  - Szczegóły zamówienia
  - Dodawanie pozycji przez skanowanie
- **Ekran ZMIANA STATUSU**:
  - Zmiana statusu zamówienia po skompletowaniu

**Biblioteka do skanowania**: `expo-barcode-scanner`

---

## Przepływ pracy

### Typowy scenariusz - dostawa → sprzedaż

```
1. DOSTAWA
   ├─> Pracownik dodaje nowe pozycje do magazynu (ręcznie lub import CSV)
   ├─> System wylicza ceny z rabatem i ilości
   └─> Tworzy wpis w inventory_movements (typ: purchase)

2. WIDOCZNOŚĆ W SKLEPIE
   └─> Admin/magazynier włącza visible_in_shop dla wybranych pozycji

3. ZAMÓWIENIE
   ├─> Klient składa zamówienie w sklepie online
   │   └─> Zamówienie zapisane ze statusem "pending"
   └─> LUB pracownik tworzy zamówienie ręcznie w panelu

4. KOMPLETACJA
   ├─> Magazynier widzi zamówienie w aplikacji mobilnej
   ├─> Skanuje kody kreskowe pozycji
   ├─> Zmienia status na "w_przygotowaniu" → "gotowe_do_odbioru"
   └─> WebSocket powiadamia inne stanowiska o zmianie statusu

5. WYDANIE / POS
   ├─> Pracownik przy kasie widzi zamówienie "gotowe_do_odbioru"
   ├─> Wybiera zamówienie, weryfikuje pozycje
   ├─> Klient płaci (wybór metody płatności)
   ├─> Wybór dokumentu: FAKTURA lub PARAGON
   └─> System:
       ├─> Aktualizuje stan magazynu (rozchód)
       ├─> Tworzy wpisy w inventory_movements
       ├─> Tworzy fakturę lub paragon
       └─> Zmienia status zamówienia na "completed"

6. ARCHIWIZACJA
   └─> Faktury i paragony dostępne w module Faktury/Rozliczenia
```

---

## API REST - Endpointy

### Uwierzytelnianie

#### `POST /auth/login`
Logowanie użytkownika (pracownik lub klient).

**Request**:
```json
{
  "email": "admin@plantmanager.pl",
  "password": "password123"
}
```

**Response** (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@plantmanager.pl",
    "role": "admin"
  }
}
```

#### `POST /auth/register`
Rejestracja nowego użytkownika (tylko dla klientów).

**Request**:
```json
{
  "email": "klient@example.pl",
  "password": "password123",
  "companyName": "Kwiaciarnia Róża",
  "nip": "1234567890"
}
```

**Response** (201):
```json
{
  "message": "Konto utworzone pomyślnie",
  "userId": 5
}
```

---

### Magazyn (Inventory)

#### `GET /inventory`
Pobierz listę wszystkich produktów w magazynie.

**Query params**:
- `status` (optional): `ok` | `low`
- `visibleInShop` (optional): `true` | `false`
- `search` (optional): wyszukiwanie po nazwie rośliny

**Response** (200):
```json
{
  "products": [
    {
      "id": 1,
      "barcode": "5901234567890",
      "plantName": "Monstera Deliciosa",
      "potSize": "21 cm",
      "plantHeightCm": 60,
      "plantPassport": "PL-123456",
      "palletCount": 5,
      "unitsPerPallet": 12,
      "totalUnits": 60,
      "purchasePricePln": 25.00,
      "basePriceGross": 50.00,
      "priceDiscount10": 45.00,
      "priceDiscount12": 44.00,
      "priceDiscount15": 42.50,
      "priceDiscount20": 40.00,
      "priceDiscount25": 37.50,
      "inventoryStatus": "ok",
      "visibleInShop": true,
      "imageUrl": "/images/monstera.jpg",
      "deliveryDate": "2025-01-15"
    }
  ]
}
```

#### `GET /inventory/:id`
Pobierz szczegóły produktu z historią ruchów.

**Response** (200):
```json
{
  "product": { /* jak wyżej */ },
  "movements": [
    {
      "id": 123,
      "movementType": "sale",
      "deltaUnits": -5,
      "reason": "Zamówienie #ORD/00042/2025",
      "createdAt": "2025-01-20T14:30:00Z",
      "createdBy": "kasa@plantmanager.pl"
    }
  ]
}
```

#### `POST /inventory`
Dodaj nową pozycję magazynową.

**Request**:
```json
{
  "barcode": "5901234567894",
  "plantName": "Philodendron Scandens",
  "potSize": "15 cm",
  "plantHeightCm": 40,
  "palletCount": 4,
  "unitsPerPallet": 16,
  "purchasePricePln": 20.00,
  "visibleInShop": true,
  "deliveryDate": "2025-01-25"
}
```

**Response** (201):
```json
{
  "message": "Produkt dodany pomyślnie",
  "productId": 5
}
```

#### `PUT /inventory/:id`
Zaktualizuj pozycję magazynową.

**Request**: (pola do aktualizacji)
```json
{
  "palletCount": 6,
  "visibleInShop": false
}
```

**Response** (200):
```json
{
  "message": "Produkt zaktualizowany",
  "product": { /* zaktualizowany obiekt */ }
}
```

#### `DELETE /inventory/:id`
Usuń pozycję magazynową (soft delete lub archiwizacja).

**Response** (200):
```json
{
  "message": "Produkt usunięty"
}
```

#### `POST /inventory/import`
Import pozycji z pliku CSV/XLSX.

**Request**: `multipart/form-data`
- `file`: plik CSV/XLSX

**Response** (200):
```json
{
  "message": "Import zakończony",
  "imported": 45,
  "updated": 12,
  "errors": []
}
```

#### `PATCH /inventory/:id/toggle-visibility`
Przełącz widoczność w sklepie.

**Response** (200):
```json
{
  "message": "Widoczność zmieniona",
  "visibleInShop": false
}
```

---

### Zamówienia (Orders)

#### `GET /orders`
Pobierz listę zamówień.

**Query params**:
- `status` (optional): `pending` | `in_progress` | `ready_for_pickup` | `completed` | `cancelled`
- `customerId` (optional): filtr po kliencie

**Response** (200):
```json
{
  "orders": [
    {
      "id": 42,
      "orderNumber": "ORD/00042/2025",
      "customerId": 1,
      "customerName": "Kwiaciarnia Róża",
      "status": "in_progress",
      "totalAmount": 450.00,
      "itemCount": 3,
      "createdAt": "2025-01-20T10:00:00Z",
      "updatedAt": "2025-01-20T11:00:00Z"
    }
  ]
}
```

#### `GET /orders/:id`
Pobierz szczegóły zamówienia.

**Response** (200):
```json
{
  "order": {
    "id": 42,
    "orderNumber": "ORD/00042/2025",
    "customerId": 1,
    "status": "in_progress",
    "items": [
      {
        "id": 1,
        "productId": 1,
        "productName": "Monstera Deliciosa",
        "quantity": 10,
        "unitPriceGross": 45.00,
        "totalPrice": 450.00
      }
    ],
    "customerSnapshot": {
      "companyName": "Kwiaciarnia Róża",
      "nip": "1234567890",
      "city": "Warszawa"
    },
    "notes": "",
    "customerNotes": "Proszę o staranny pakowanie",
    "totalAmount": 450.00,
    "createdAt": "2025-01-20T10:00:00Z"
  }
}
```

#### `POST /orders`
Utwórz nowe zamówienie.

**Request**:
```json
{
  "customerId": 1,
  "items": [
    {
      "productId": 1,
      "quantity": 10
    },
    {
      "productId": 2,
      "quantity": 5
    }
  ],
  "customerNotes": "Dostawa w godzinach popołudniowych"
}
```

**Response** (201):
```json
{
  "message": "Zamówienie utworzone",
  "orderNumber": "ORD/00043/2025",
  "orderId": 43
}
```

#### `PATCH /orders/:id/status`
Zmień status zamówienia.

**Request**:
```json
{
  "status": "ready_for_pickup",
  "notes": "Skompletowane, czeka na odbiór"
}
```

**Response** (200):
```json
{
  "message": "Status zmieniony",
  "order": { /* zaktualizowane zamówienie */ }
}
```

#### `PUT /orders/:id`
Zaktualizuj zamówienie (dodaj/usuń pozycje, zmień ilości).

**Request**:
```json
{
  "items": [
    {
      "productId": 1,
      "quantity": 12
    }
  ]
}
```

**Response** (200):
```json
{
  "message": "Zamówienie zaktualizowane",
  "order": { /* zaktualizowane zamówienie */ }
}
```

---

### Faktury (Invoices)

#### `GET /invoices`
Pobierz listę faktur.

**Query params**:
- `startDate` (optional): data od
- `endDate` (optional): data do
- `customerId` (optional): filtr po kliencie

**Response** (200):
```json
{
  "invoices": [
    {
      "id": 10,
      "invoiceNumber": "FV/00010/2025",
      "customerName": "Kwiaciarnia Róża",
      "issueDate": "2025-01-20",
      "totalGross": 450.00,
      "paymentMethod": "transfer"
    }
  ]
}
```

#### `GET /invoices/:id`
Pobierz szczegóły faktury.

**Response** (200):
```json
{
  "invoice": {
    "id": 10,
    "invoiceNumber": "FV/00010/2025",
    "orderId": 42,
    "buyerSnapshot": {
      "companyName": "Kwiaciarnia Róża Sp. z o.o.",
      "nip": "1234567890",
      "street": "ul. Kwiatowa 15",
      "postalCode": "00-001",
      "city": "Warszawa"
    },
    "issueDate": "2025-01-20",
    "saleDate": "2025-01-20",
    "paymentDeadline": "2025-02-03",
    "paymentMethod": "transfer",
    "items": [
      {
        "description": "Monstera Deliciosa 21cm",
        "quantity": 10,
        "unitPriceNet": 36.59,
        "vatRate": 23.00,
        "totalNet": 365.90,
        "totalVat": 84.16,
        "totalGross": 450.06
      }
    ],
    "subtotalNet": 365.90,
    "totalVat": 84.16,
    "totalGross": 450.06,
    "pdfUrl": null
  }
}
```

#### `POST /invoices`
Utwórz fakturę (z zamówienia lub bez).

**Request**:
```json
{
  "orderId": 42,
  "paymentMethod": "transfer",
  "paymentDeadline": "2025-02-03"
}
```

**Response** (201):
```json
{
  "message": "Faktura utworzona",
  "invoiceNumber": "FV/00010/2025",
  "invoiceId": 10
}
```

#### `GET /invoices/:id/pdf`
Pobierz fakturę w formacie PDF.

**Response** (200): plik PDF

**Uwaga**: Funkcja generowania PDF jest planowana. Obecnie zwraca placeholder lub błąd 501 Not Implemented.

---

### Paragony (Receipts)

#### `GET /receipts`
Pobierz listę paragonów.

**Response** (200):
```json
{
  "receipts": [
    {
      "id": 5,
      "receiptNumber": "PAR/00005/2025",
      "orderId": 43,
      "totalAmount": 120.00,
      "paymentMethod": "cash",
      "createdAt": "2025-01-20T15:30:00Z"
    }
  ]
}
```

#### `POST /receipts`
Utwórz paragon (rozliczenie detaliczne).

**Request**:
```json
{
  "orderId": 43,
  "paymentMethod": "cash",
  "totalAmount": 120.00
}
```

**Response** (201):
```json
{
  "message": "Paragon utworzony",
  "receiptNumber": "PAR/00005/2025",
  "receiptId": 5
}
```

---

### Kontrahenci (Customers)

#### `GET /customers`
Pobierz listę kontrahentów.

**Response** (200):
```json
{
  "customers": [
    {
      "id": 1,
      "companyName": "Kwiaciarnia Róża Sp. z o.o.",
      "nip": "1234567890",
      "city": "Warszawa",
      "email": "klient@example.pl",
      "priceGroupName": "rabat_12",
      "createdAt": "2025-01-10T10:00:00Z"
    }
  ]
}
```

#### `GET /customers/:id`
Pobierz szczegóły kontrahenta.

**Response** (200):
```json
{
  "customer": {
    "id": 1,
    "userId": 4,
    "companyName": "Kwiaciarnia Róża Sp. z o.o.",
    "firstName": null,
    "lastName": null,
    "nip": "1234567890",
    "street": "ul. Kwiatowa 15",
    "postalCode": "00-001",
    "city": "Warszawa",
    "country": "Polska",
    "phone": "+48 123 456 789",
    "email": "klient@example.pl",
    "priceGroupId": 3,
    "priceGroupName": "rabat_12",
    "notes": ""
  }
}
```

#### `POST /customers`
Dodaj nowego kontrahenta.

**Request**:
```json
{
  "companyName": "Ogrodnictwo Zielona Oaza",
  "nip": "9876543210",
  "street": "ul. Ogrodowa 5",
  "postalCode": "00-002",
  "city": "Kraków",
  "phone": "+48 987 654 321",
  "email": "kontakt@zielonaoaza.pl",
  "priceGroupId": 4
}
```

**Response** (201):
```json
{
  "message": "Kontrahent dodany",
  "customerId": 2
}
```

#### `PUT /customers/:id`
Zaktualizuj kontrahenta.

**Request**: (pola do aktualizacji)

**Response** (200):
```json
{
  "message": "Kontrahent zaktualizowany",
  "customer": { /* zaktualizowany obiekt */ }
}
```

#### `POST /customers/lookup-nip`
Pobierz dane firmy po NIP (integracja z GUS).

**Request**:
```json
{
  "nip": "9876543210"
}
```

**Response** (200):
```json
{
  "companyName": "Ogrodnictwo Zielona Oaza Sp. z o.o.",
  "nip": "9876543210",
  "street": "ul. Ogrodowa 5",
  "postalCode": "00-002",
  "city": "Kraków",
  "country": "Polska"
}
```

**Uwaga**: Obecnie endpoint zwraca mock data. Integracja z zewnętrznym API (np. REGON, VIES) jest planowana.

---

### POS / Kasa

#### `POST /pos/checkout`
Zamknij sprzedaż i rozlicz zamówienie.

**Request**:
```json
{
  "orderId": 42,
  "paymentMethod": "card",
  "documentType": "invoice", // lub "receipt"
  "items": [ // opcjonalnie zmodyfikowane pozycje
    {
      "productId": 1,
      "quantity": 10
    }
  ]
}
```

**Response** (200):
```json
{
  "message": "Sprzedaż zamknięta",
  "documentType": "invoice",
  "documentNumber": "FV/00011/2025",
  "documentId": 11,
  "totalAmount": 450.00
}
```

**Logika**:
1. Weryfikacja zamówienia
2. Aktualizacja stanów magazynowych (rozchód)
3. Tworzenie wpisów `inventory_movements`
4. Utworzenie faktury lub paragonu
5. Zmiana statusu zamówienia na `completed`

---

### Sklep internetowy (Shop)

#### `GET /shop/catalog`
Pobierz katalog roślin widocznych w sklepie (publiczny endpoint).

**Query params**:
- `search` (optional): wyszukiwanie po nazwie

**Response** (200):
```json
{
  "products": [
    {
      "id": 1,
      "plantName": "Monstera Deliciosa",
      "potSize": "21 cm",
      "plantHeightCm": 60,
      "imageUrl": "/images/monstera.jpg",
      "price": 45.00, // cena dla zalogowanego użytkownika (lub podstawowa)
      "availableUnits": 60
    }
  ]
}
```

**Uwaga**: Jeśli użytkownik jest zalogowany (token w nagłówku), cena jest pobierana z jego grupy cenowej. Jeśli nie, wyświetlana jest cena podstawowa.

#### `POST /shop/cart/checkout`
Złóż zamówienie z koszyka.

**Request**:
```json
{
  "items": [
    {
      "productId": 1,
      "quantity": 10
    }
  ],
  "customerNotes": "Dostawa po godzinie 14:00"
}
```

**Response** (201):
```json
{
  "message": "Zamówienie złożone",
  "orderNumber": "ORD/00044/2025",
  "orderId": 44,
  "totalAmount": 450.00
}
```

---

### Aplikacja mobilna (Mobile Scanner)

#### `POST /mobile/scan-barcode`
Pobierz informacje o produkcie po zeskanowaniu kodu kreskowego.

**Request**:
```json
{
  "barcode": "5901234567890"
}
```

**Response** (200):
```json
{
  "product": {
    "id": 1,
    "barcode": "5901234567890",
    "plantName": "Monstera Deliciosa",
    "potSize": "21 cm",
    "palletCount": 5,
    "unitsPerPallet": 12,
    "totalUnits": 60,
    "inventoryStatus": "ok"
  },
  "recentMovements": [
    {
      "id": 123,
      "movementType": "sale",
      "deltaUnits": -5,
      "reason": "Zamówienie #ORD/00042/2025",
      "createdAt": "2025-01-20T14:30:00Z"
    }
  ]
}
```

#### `GET /mobile/orders`
Pobierz listę aktywnych zamówień (dla magazyniera).

**Response** (200):
```json
{
  "orders": [
    {
      "id": 42,
      "orderNumber": "ORD/00042/2025",
      "customerName": "Kwiaciarnia Róża",
      "status": "pending",
      "itemCount": 3,
      "createdAt": "2025-01-20T10:00:00Z"
    }
  ]
}
```

---

## Uwierzytelnianie i autoryzacja

### Role użytkowników

1. **admin** - Pełny dostęp do wszystkich modułów
2. **warehouse** - Dostęp do magazynu, zamówień, skanera
3. **pos** - Dostęp do modułu POS/kasy, zamówień, rozliczeń
4. **customer** - Dostęp tylko do sklepu internetowego i własnych zamówień

### JWT Token

Wszystkie endpointy (oprócz publicznych i logowania) wymagają nagłówka:

```
Authorization: Bearer <token>
```

Token zawiera:
```json
{
  "userId": 1,
  "email": "admin@plantmanager.pl",
  "role": "admin",
  "iat": 1705756800,
  "exp": 1705843200
}
```

Ważność tokenu: 24 godziny.

### Zabezpieczenia

- Hasła hashowane przez `bcrypt` (10 rund)
- Token podpisany algorytmem HS256
- Middleware `requireAuth` weryfikuje token
- Middleware `requireRole(['admin', 'warehouse'])` weryfikuje uprawnienia

---

## WebSockets

### Połączenie

```
ws://localhost:3000/ws
```

Po połączeniu klient wysyła token:
```json
{
  "type": "auth",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Subskrypcja zdarzeń

```json
{
  "type": "subscribe",
  "channel": "orders"
}
```

### Zdarzenia

#### `order:status_changed`
Powiadomienie o zmianie statusu zamówienia.

```json
{
  "type": "order:status_changed",
  "data": {
    "orderId": 42,
    "orderNumber": "ORD/00042/2025",
    "oldStatus": "pending",
    "newStatus": "in_progress",
    "changedBy": "magazyn@plantmanager.pl",
    "timestamp": "2025-01-20T11:00:00Z"
  }
}
```

#### `order:created`
Powiadomienie o nowym zamówieniu.

```json
{
  "type": "order:created",
  "data": {
    "orderId": 43,
    "orderNumber": "ORD/00043/2025",
    "customerName": "Kwiaciarnia Róża",
    "itemCount": 2,
    "totalAmount": 220.00,
    "timestamp": "2025-01-20T12:00:00Z"
  }
}
```

#### `inventory:low_stock`
Powiadomienie o niskim stanie magazynowym.

```json
{
  "type": "inventory:low_stock",
  "data": {
    "productId": 3,
    "plantName": "Sansevieria Trifasciata",
    "palletCount": 1,
    "totalUnits": 20,
    "timestamp": "2025-01-20T13:00:00Z"
  }
}
```

---

## Integracje zewnętrzne

### 1. Lookup NIP (GUS API)

**Endpoint**: `POST /customers/lookup-nip`

**Planowane źródła danych**:
- API GUS (Główny Urząd Statystyczny)
- REGON API
- VIES (dla firm UE)

**Obecnie**: Mock data (przykładowe dane firmowe).

**Implementacja**:
```typescript
async function lookupNIP(nip: string): Promise<CompanyData> {
  // TODO: Integracja z zewnętrznym API
  // const response = await fetch(`https://api.gus.gov.pl/regon?nip=${nip}`);
  // return response.json();

  // Mock:
  return {
    companyName: "Przykładowa Firma Sp. z o.o.",
    nip: nip,
    street: "ul. Testowa 1",
    postalCode: "00-000",
    city: "Warszawa",
    country: "Polska"
  };
}
```

### 2. Generowanie PDF faktur

**Endpoint**: `GET /invoices/:id/pdf`

**Planowana biblioteka**: `pdfkit` lub `puppeteer`

**Obecnie**: Placeholder (zwraca 501 Not Implemented).

**Implementacja** (planowana):
```typescript
import PDFDocument from 'pdfkit';

async function generateInvoicePDF(invoiceId: number): Promise<Buffer> {
  const invoice = await getInvoiceById(invoiceId);
  const doc = new PDFDocument();

  // Renderowanie faktury...
  doc.fontSize(20).text(`Faktura VAT ${invoice.invoiceNumber}`, { align: 'center' });
  // ... pełna implementacja

  return doc;
}
```

### 3. Skanowanie kodów kreskowych (Mobile)

**Biblioteka**: `expo-barcode-scanner`

**Typy obsługiwanych kodów**:
- EAN-13
- EAN-8
- Code 128
- QR Code

**Przykład użycia**:
```typescript
import { BarCodeScanner } from 'expo-barcode-scanner';

const handleBarCodeScanned = ({ type, data }: BarCodeEvent) => {
  // data = "5901234567890"
  fetchProductByBarcode(data);
};

<BarCodeScanner
  onBarCodeScanned={handleBarCodeScanned}
  style={StyleSheet.absoluteFillObject}
/>
```

---

## Instalacja i uruchomienie

### Wymagania

- Node.js 18+
- PostgreSQL 16
- npm lub yarn
- Expo CLI (dla aplikacji mobilnej)

### Instalacja

```bash
# Sklonuj repozytorium
git clone <repo-url>
cd PlantManager

# Zainstaluj zależności (monorepo)
npm install

# Zainstaluj zależności dla każdego modułu
cd backend && npm install && cd ..
cd web-panel && npm install && cd ..
cd web-shop && npm install && cd ..
cd mobile-scanner && npm install && cd ..
```

### Konfiguracja bazy danych

```bash
# Utwórz bazę danych PostgreSQL
createdb plantmanager

# Uruchom migracje (schemat SQL)
psql -d plantmanager -f docs/db_schema.sql
```

### Konfiguracja środowiska

Utwórz pliki `.env` w każdym module:

**backend/.env**:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/plantmanager
JWT_SECRET=your-secret-key-here
PORT=3000
NODE_ENV=development
```

**web-panel/.env**:
```env
VITE_API_URL=http://localhost:3000
```

**web-shop/.env**:
```env
VITE_API_URL=http://localhost:3000
```

**mobile-scanner/.env**:
```env
EXPO_PUBLIC_API_URL=http://localhost:3000
```

### Uruchomienie

```bash
# Backend
cd backend
npm run dev

# Web Panel
cd web-panel
npm run dev

# Web Shop
cd web-shop
npm run dev

# Mobile Scanner
cd mobile-scanner
npx expo start
```

### Budowanie produkcyjne

```bash
# Backend
cd backend
npm run build
npm start

# Web Panel
cd web-panel
npm run build
npm run preview

# Web Shop
cd web-shop
npm run build
npm run preview

# Mobile Scanner
cd mobile-scanner
npx expo build:android
```

---


## Struktura tabel - podsumowanie

| Tabela | Kolumny | Opis |
|--------|---------|------|
| `users` | 11 | Pracownicy i klienci (loginy, role, profile) |
| `permission_profiles` | 8 | Profile uprawnien (RBAC) |
| `profile_permissions` | 3 | Uprawnienia przypisane do profili |
| `price_groups` | 5 | Grupy cenowe (podstawowa, rabaty) |
| `customers` | 20 | Kontrahenci B2B/B2C (NIP, VAT-EU, adresy) |
| `products` | 33 | Katalog roslin (ceny, stany, merge, archiwum) |
| `tags` | 4 | Tagi produktow |
| `product_tags` | 2 | Powiazanie produktow z tagami (M:N) |
| `grower_passports` | 6 | Paszporty hodowcow |
| `orders` | 17 | Zamowienia (status, snapshoty, odbiorca) |
| `order_items` | 10 | Pozycje zamowien (palety, snapshot) |
| `order_status_log` | 7 | Historia zmian statusow zamowien |
| `invoices` | 25 | Faktury VAT + proformy (invoice_type) |
| `invoice_items` | 13 | Pozycje faktur (brutto, netto, paszport) |
| `invoice_corrections` | 15 | Korekty faktur |
| `invoice_correction_items` | 10 | Pozycje korekt |
| `receipts` | 12 | Paragony (platnosci, snapshoty) |
| `receipt_items` | 8 | Pozycje paragonow |
| `losses` | 12 | Straty magazynowe (odwracalne) |
| `inventory_movements` | 11 | Historia ruchow magazynowych |
| `user_sessions` | 12 | Sesje uzytkownikow (JWT, refresh) |
| `login_history` | 9 | Historia logowan |
| `settings` | 6 | Ustawienia systemowe (key-value) |
| `print_templates` | 9 | Szablony wydrukow (HTML/CSS) |
| `document_sequences` | 6 | Numeracja dokumentow (auto-reset roczny) |
| `proformas` | 10 | Proformy (legacy, nowe w invoices) |
| `proforma_items` | 8 | Pozycje proform (legacy) |

**Lacznie: 27 tabel, 9 typow enum**

Pelny schemat SQL: `docs/db_schema.sql`

---

## Roadmap / Planowane funkcjonalności

1. **Generowanie PDF faktur** - integracja z `pdfkit` lub `puppeteer`
2. **Integracja GUS/REGON** - automatyczne pobieranie danych firm po NIP
3. **Email notifications** - powiadomienia o zamówieniach, fakturach
4. **Raporty i statystyki** - wykresy sprzedaży, raporty magazynowe
5. **Eksport danych** - eksport faktur, zamówień do CSV/XLSX
6. **Multi-język** - obsługa wielu języków (EN, DE)
7. **Platforma płatności online** - integracja Stripe/PayU dla sklepu
8. **Aplikacja iOS** - wersja aplikacji mobilnej na iOS
9. **Drukowanie etykiet** - generowanie etykiet z kodami kreskowymi
10. **System rabatów dynamicznych** - promocje, kupony

---

## Kontakt i wsparcie

**Autor**: PlantManager Team
**Email**: support@plantmanager.pl
**GitHub**: https://github.com/plantmanager/plantmanager

---

**Koniec dokumentacji**
