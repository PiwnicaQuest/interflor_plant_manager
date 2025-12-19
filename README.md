# PlantManager

System zarządzania magazynem roślin, sprzedażą i klientami.

## Quick Start

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd web-panel
npm run dev
```

**Dostęp**: http://localhost:5173
**Login**: admin@plantmanager.pl / admin123

## Technologie

- **Backend**: Node.js + Express + TypeScript + PostgreSQL
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Baza**: PostgreSQL (plantmanager)

## Zaimplementowane Moduły

✅ **Dashboard** (`/dashboard`)
- Statystyki: produkty, niski stan, zamówienia
- Alerty niskiego stanu magazynowego
- Ostatnie zamówienia

✅ **Magazyn** (`/inventory`)
- Lista produktów z miniaturami
- Szczegóły produktu z historią ruchów
- Wszystkie ceny (podstawowa + 5 poziomów rabatu)
- Filtrowanie i wyszukiwanie

✅ **Kontrahenci** (`/customers`)
- Lista klientów
- Dodawanie/edycja z NIP lookup
- Przypisanie grupy cenowej

✅ **Zamówienia** (`/orders`)
- Tworzenie zamówień
- Automatyczne przeliczanie cen wg grupy klienta
- Filtrowanie po statusie
- Szczegóły zamówienia

✅ **POS/Kasa** (`/pos`)
- Checkout z wyborem metody płatności
- Wybór dokumentu (paragon/faktura)
- Auto-odświeżanie co 30s
- Ciemny motyw

✅ **Faktury** (`/invoices`)
- Lista faktur
- Filtrowanie po datach
- Podsumowania (netto/brutto)
- Link do PDF

## Struktura Projektu

```
PlantManager/
├── backend/              # Express API (port 4000)
│   ├── src/
│   └── .env
├── web-panel/           # React frontend (port 5173)
│   └── src/
│       ├── components/  # Komponenty React
│       ├── pages/       # Strony
│       └── services/    # API client
└── .claude/
    └── PROJECT_MEMORY.md  # Pełna dokumentacja
```

## Dane Testowe

**Produkty**: 4 rośliny (3 ze zdjęciami)
**Klienci**: 2 kontrahentów
**Zamówienia**: 1 testowe (ZAM/00001/2025, 450 PLN, status: ready_for_pickup)

## Naprawione Błędy

1. ✅ Biały ekran po logowaniu - konwersja string → number
2. ✅ Crash w szczegółach produktu - optional chaining dla cen
3. ✅ Brak sekcji zdjęcia - placeholder gdy brak URL

## Dokumentacja

Pełna dokumentacja w pliku `.claude/PROJECT_MEMORY.md`
