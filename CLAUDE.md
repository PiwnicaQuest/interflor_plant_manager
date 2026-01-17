# PlantManager - Informacje dla Claude

## Połączenie z serwerem
```bash
sshpass -p '1234' ssh polflor@192.168.88.125
```
- **IP:** 192.168.88.125
- **User:** polflor
- **Hasło:** 1234
- **Ścieżka projektu:** /home/polflor/PlantManager/

## GitHub
- **Repo:** https://github.com/PiwnicaQuest/PlantManager (prywatne)
- **Username:** PiwnicaQuest
- **Branch:** main

## Struktura projektu
```
PlantManager/
├── backend/           # Node.js + Express + TypeScript API
│   └── src/
│       ├── controllers/   # Kontrolery API
│       ├── models/        # Modele danych
│       ├── services/      # Serwisy (email import, CSV, etc.)
│       └── main.ts        # Główny plik serwera
├── web-panel/         # React + Vite + TailwindCSS (panel admin)
│   └── src/
│       ├── components/    # Komponenty React
│       ├── pages/         # Strony
│       ├── services/api.ts # Klient API
│       └── types/         # Typy TypeScript
├── web-shop/          # Sklep B2B dla klientów
├── mobile-scanner/    # React Native app do skanowania
└── print-agent/       # Agent drukujący
```

## Komendy

### Backend
```bash
cd /home/polflor/PlantManager/backend
npm run build          # Kompilacja TypeScript
pm2 restart plantmanager-backend  # Restart serwera
pm2 logs plantmanager-backend     # Logi
```

### Frontend
```bash
cd /home/polflor/PlantManager/web-panel
npm run build          # Build produkcyjny (do dist/)
npm run dev            # Dev server (port 5173)
```

### Git
```bash
cd /home/polflor/PlantManager
git add -A && git commit -m opis && git push
```

## Dane logowania

### Panel Admin
- **URL:** https://pm.polflor.wroclaw.pl
- **Email:** admin@plantmanager.pl
- **Hasło:** admin123

### Baza danych PostgreSQL
- **Host:** localhost
- **Database:** plantmanager
- **User:** plantmanager
- **Hasło:** plantmanager2025

```bash
PGPASSWORD=plantmanager2025 psql -U plantmanager -h localhost plantmanager
```

## Porty
- **Backend API:** 4000
- **Frontend dev:** 5173
- **Produkcja:** nginx na 80/443

## Kluczowe pliki

### Backend
- `backend/src/main.ts` - główny serwer Express
- `backend/src/models/Product.ts` - model produktu
- `backend/src/models/Order.ts` - model zamówienia
- `backend/src/models/Settings.ts` - ustawienia cenowe
- `backend/src/controllers/inventory.controller.ts` - CRUD magazynu
- `backend/src/services/emailImportService.ts` - import z EDI

### Frontend
- `web-panel/src/components/Inventory/InventoryTable.tsx` - tabela magazynu
- `web-panel/src/components/Inventory/ProductDetails.tsx` - modal produktu
- `web-panel/src/components/Inventory/columnDefinitions.ts` - definicje kolumn
- `web-panel/src/pages/SettingsPage.tsx` - ustawienia
- `web-panel/src/services/api.ts` - klient API

## Ostatnie zmiany (2025-12-29)
- Edycja stawki VAT w szczegółach produktu (0%, 8%, 23%)
- Wyśrodkowanie checkboxów w tabeli magazynu
- Wrzucenie projektu na GitHub

## Funkcje systemu
- Zarządzanie magazynem roślin
- Obsługa zamówień
- System POS/Kasa
- Faktury i paragony
- Import produktów z maili EDI
- Skanowanie kodów kreskowych
- Raporty sprzedaży
- Zarządzanie kontrahentami
