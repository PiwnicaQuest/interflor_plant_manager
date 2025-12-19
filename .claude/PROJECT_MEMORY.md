# PlantManager - Project Memory

## Project Overview

**PlantManager** is a full-stack web application for managing plant inventory, sales, orders, and customer relationships.

- **Location**: `/Users/mateuszmatula/PlantManager/`
- **Backend**: Node.js/Express + TypeScript (port 4000)
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS (port 5173)
- **Database**: PostgreSQL (database name: `plantmanager`, user: `mateuszmatula`)

## Quick Start

```bash
# Terminal 1 - Backend
cd /Users/mateuszmatula/PlantManager/backend
npm run dev

# Terminal 2 - Frontend
cd /Users/mateuszmatula/PlantManager/web-panel
npm run dev
```

Access: http://localhost:5173
Login: admin@plantmanager.pl / admin123

## Tech Stack

### Backend
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL via `pg` library
- **Authentication**: JWT with bcrypt
- **Port**: 4000
- **Environment**: `.env` file with DATABASE_URL, JWT_SECRET, PORT

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **HTTP Client**: Axios with interceptors
- **Port**: 5173

### Key Frontend Features
- Automatic snake_case ↔ camelCase conversion in API calls
- Automatic conversion of numeric strings to numbers
- JWT token management in localStorage
- 401 error handling with redirect to login

## Database Schema

### Main Tables
- `users` - User accounts with roles (admin, warehouse, pos, customer)
- `customers` - Customer/contractor data with price groups
- `price_groups` - 5 discount levels (10%, 12%, 15%, 20%, 25%)
- `products` - Plant inventory with images and pricing
- `orders` - Order management with status workflow
- `order_items` - Order line items with product snapshots (JSONB)
- `invoices` - Invoice documents
- `invoice_items` - Invoice line items
- `receipts` - Receipt documents
- `inventory_movements` - Stock movement tracking

### Order Status Workflow
```
pending → in_progress → ready_for_pickup → completed
                                        ↘ cancelled
```

## Implemented Modules

### 1. Dashboard (`/dashboard`)
**File**: `/web-panel/src/pages/DashboardPage.tsx`

**Features**:
- 4 stat cards: total products, low stock count, pending orders, ready for pickup
- Low stock alert section (orange banner) with product list
- Recent pending orders table (first 5)
- Quick links to: new order, customers, POS
- Default landing page after login

### 2. Customers Module (`/customers`)
**Location**: `/web-panel/src/components/Customers/` + `CustomersPage.tsx`

**Components**:
- `CustomersTable` - Display customer list
- `CustomerForm` - Add/edit form with NIP lookup

**Features**:
- Search filter (company name, NIP, email)
- NIP lookup integration (GUS API via backend)
- Price group assignment (5 levels)
- Support for both companies (with NIP) and individuals
- Full CRUD operations

### 3. Orders Module (`/orders`)
**Location**: `/web-panel/src/components/Orders/` + `OrdersPage.tsx`

**Components**:
- `OrdersTable` - Orders list with inline status change
- `OrderForm` - Create order with customer and products selection
- `OrderDetails` - Full order details modal

**Features**:
- Create orders with multiple products
- Automatic price calculation based on customer price group
- Status filtering
- Quick status change from table
- Order details with customer notes and internal notes
- Test order: `ZAM/00001/2025` (status: ready_for_pickup, 450 PLN)

### 4. POS/Kasa Module (`/pos`)
**File**: `/web-panel/src/pages/POSPage.tsx`

**Features**:
- Dark theme interface optimized for checkout
- Shows orders with status `ready_for_pickup`
- Auto-refresh every 30 seconds
- Document type selection: Receipt (Paragon) or Invoice (Faktura)
- Payment methods: Card 💳, Cash 💵, Transfer 🏦
- Checkout endpoint: `/pos/checkout`
- Updates inventory and creates documents automatically
- Success notifications (auto-clear after 5s)

### 5. Invoices Module (`/invoices`)
**Location**: `/web-panel/src/components/Invoices/` + `InvoicesPage.tsx`

**Components**:
- `InvoicesTable` - Invoice list
- `InvoiceDetails` - Full invoice details modal

**Features**:
- Date range filtering (from-to)
- Summary statistics (total net, total gross)
- PDF download links (when available)
- Display: invoice number, customer, dates, payment method, amounts

### 6. Inventory Module (`/inventory`)
**Location**: `/web-panel/src/components/Inventory/` + `InventoryPage.tsx`

**Components**:
- `InventoryTable` - Product list with thumbnails
- `ProductDetails` - Detailed product view with movement history

**Features**:
- Product thumbnails (64x64px) in table
- Placeholder icon 🌿 when no image
- All columns: image, name, pot size, height, pallets, units/pallet, total units
- All prices: purchase, base, -10%, -12%, -15%, -20%, -25%
- Status badges (OK/LOW)
- Toggle visibility in shop
- Search and status filtering
- **Movement History**: type (in/out/adjustment/sale), pallets, units, reason, user, date

## API Client

**File**: `/web-panel/src/services/api.ts`

**Key Features**:
- Automatic snake_case ↔ camelCase conversion
- Numeric string auto-conversion to numbers (e.g., "25.00" → 25.00)
- JWT token injection from localStorage
- 401 error handling (redirect to `/login`)

**Conversion Logic**:
```typescript
// Detects numeric strings and converts them
if (typeof obj === 'string' && /^\d+\.?\d*$/.test(obj)) {
  const num = parseFloat(obj);
  if (!isNaN(num)) return num;
}
```

**Available Methods**:
- Auth: `login()`, `register()`, `me()`
- Inventory: `getInventory()`, `getProduct()`, `createProduct()`, `updateProduct()`, `toggleProductVisibility()`, `getLowStockProducts()`
- Orders: `getOrders()`, `getOrder()`, `createOrder()`, `updateOrderStatus()`
- Customers: `getCustomers()`, `getCustomer()`, `createCustomer()`, `updateCustomer()`, `lookupNIP()`
- Invoices: `getInvoices()`, `getInvoice()`, `createInvoice()`
- Receipts: `getReceipts()`
- POS: `checkout()`

## Test Data

### Products (4 items)
1. **Monstera Deliciosa** (21cm) - has image
2. **Ficus Elastica** (17cm) - has image
3. **Sansevieria Trifasciata** (12cm) - has image
4. **Pothos Aureus** - no image (shows placeholder)

### Customers (2 items)
Test customers inserted via SQL

### Orders (1 item)
- Order: `ZAM/00001/2025`
- Status: `ready_for_pickup`
- Total: 450.00 PLN
- Items:
  - 5x Monstera Deliciosa @ 45.00 = 225.00 PLN
  - 5x Ficus Elastica @ 45.00 = 225.00 PLN

## Known Issues Fixed

### Issue 1: White Screen After Login
**Error**: `TypeError: product.purchasePricePln.toFixed is not a function`

**Cause**: Backend returns numeric values as strings (e.g., `"25.00"`), frontend expected numbers

**Solution**: Modified `snakeToCamel()` function in `api.ts` to detect numeric strings using regex `/^\d+\.?\d*$/` and convert using `parseFloat()`

**Location**: `/web-panel/src/services/api.ts:11-14`

### Issue 2: Product Details Crash
**Error**: `can't access property "toFixed", product.priceDiscount10 is undefined`

**Cause**: Some products don't have all discount prices defined

**Solution**:
- Added optional chaining `?.toFixed(2)` for basic prices
- Added null checks `!= null` before rendering discount prices
- Only show discount price fields if value exists

**Location**: `/web-panel/src/components/Inventory/ProductDetails.tsx:93-144`

### Issue 3: Missing Image Section
**Cause**: Image section only rendered when `imageUrl` exists

**Solution**: Always render image section, show placeholder (🌿 icon + "Brak zdjęcia") when no URL

**Location**: `/web-panel/src/components/Inventory/ProductDetails.tsx:175-191`

## Navigation Structure

```
/login              - Login page (not authenticated)
/                   - Redirects to /dashboard
/dashboard          - Main overview with stats and alerts
/inventory          - Product inventory management
/orders             - Order management
/pos                - Point of Sale checkout
/invoices           - Invoice listing
/customers          - Customer/contractor management
```

## Styling System

**Tailwind CSS Classes Used**:
- `card` - White background card with shadow
- `btn btn-primary` - Primary action button
- `btn btn-secondary` - Secondary action button
- `input` - Form input styling
- `table` - Table styling
- `badge` - Status badges
  - `badge-success` - Green (OK, completed)
  - `badge-warning` - Orange (low stock, in progress)
  - `badge-info` - Blue (pending)
  - `badge-danger` - Red (cancelled)

## Development Notes

### Adding New Price Fields
When displaying prices, always use optional chaining to prevent crashes:
```typescript
{product.purchasePricePln?.toFixed(2) || '-'} PLN
```

### Adding New Modules
1. Create components in `/web-panel/src/components/ModuleName/`
2. Create page in `/web-panel/src/pages/ModuleNamePage.tsx`
3. Add route in `/web-panel/src/App.tsx`
4. Add navigation link in `/web-panel/src/components/Common/Layout.tsx`
5. Add API methods in `/web-panel/src/services/api.ts`

### Database Queries
Use PostgreSQL via psql:
```bash
/usr/local/opt/postgresql@16/bin/psql -U mateuszmatula -d plantmanager -c "SELECT * FROM products;"
```

## Future Enhancements (Not Yet Implemented)

### High Priority
- None (all completed)

### Medium Priority
- None (all completed)

### Low Priority
- Product add/edit forms
- Customer edit/delete functionality
- Order editing
- Bulk operations
- Export to Excel/CSV
- Print functionality for invoices/receipts
- Product search by barcode
- Mobile responsive improvements
- Image upload functionality
- Advanced reporting

## Project Status

**Current State**: ✅ All high and medium priority features implemented

**Completed Modules**:
1. ✅ Customers - list and add/edit
2. ✅ Orders - list, create, filter, details
3. ✅ POS/Kasa - checkout with payment methods
4. ✅ Invoices - list, filter, details
5. ✅ Inventory - product details with movement history
6. ✅ Dashboard - stats and low stock alerts

**Date**: 2025-10-26
**Last Updated**: Current session
