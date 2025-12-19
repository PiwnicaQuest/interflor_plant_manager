# Real-time Notifications System - Dokumentacja

## Przegląd

System powiadomień w czasie rzeczywistym dla aplikacji PlantManager web-panel. Wykorzystuje WebSocket do odbierania eventów z backendu i wyświetlania ich użytkownikowi poprzez toast notifications oraz notification center.

## Zaimplementowane komponenty

### 1. **Typy TypeScript** (`src/types/notifications.ts`)

Definicje typów dla powiadomień i eventów WebSocket:
- `NotificationType`: 'success' | 'error' | 'info' | 'warning'
- `Notification`: Interfejs dla pojedynczego powiadomienia
- `WebSocketMessage`: Struktura wiadomości WebSocket
- `OrderStatusChangedEvent`: Event zmiany statusu zamówienia
- `OrderCancelledEvent`: Event anulowania zamówienia

### 2. **WebSocket Hook** (`src/hooks/useWebSocket.ts`)

Hook do zarządzania połączeniem WebSocket z automatyczną reconnect logiką.

**Funkcjonalności:**
- Automatyczne połączenie przy montowaniu komponentu
- Autentykacja przez token JWT z localStorage
- Automatyczne wznawianie połączenia przy utracie (max 10 prób, co 3 sekundy)
- Czyszczenie połączenia przy unmount
- Parsowanie wiadomości JSON
- Callback handlers dla: onMessage, onConnect, onDisconnect, onError

**Użycie:**
```typescript
const { isConnected, isReconnecting, sendMessage, disconnect, reconnect } = useWebSocket({
  url: 'ws://localhost:4000/ws',
  onMessage: (message) => console.log(message),
  onConnect: () => console.log('Connected'),
  onDisconnect: () => console.log('Disconnected'),
  onError: (error) => console.error(error),
});
```

### 3. **Toast Component** (`src/components/Common/Toast.tsx`)

Komponent wyświetlający toast notifications w prawym górnym rogu ekranu.

**Funkcjonalności:**
- 4 typy powiadomień: success, error, warning, info
- Auto-dismiss po 5 sekundach (konfigurowalne)
- Możliwość ręcznego zamknięcia
- Animacje wejścia/wyjścia
- Stack notifications (max 3 widoczne jednocześnie)
- Kolorowe ikony i bordery w zależności od typu

**Komponenty:**
- `Toast`: Pojedyncze powiadomienie toast
- `ToastContainer`: Container zarządzający stackiem toastów

### 4. **Notification Context** (`src/contexts/NotificationContext.tsx`)

Context Provider zarządzający globalnym stanem powiadomień.

**Funkcjonalności:**
- Przechowywanie historii powiadomień (max 20)
- Persystencja w localStorage
- Licznik nieprzeczytanych powiadomień
- Funkcje zarządzania: showNotification, markAsRead, markAllAsRead, clearHistory, removeNotification

**Użycie:**
```typescript
const {
  notifications,
  showNotification,
  markAsRead,
  markAllAsRead,
  clearHistory,
  unreadCount
} = useNotifications();

// Dodaj powiadomienie
showNotification('Zamówienie zostało zaktualizowane', 'success');
```

### 5. **NotificationCenter Component** (`src/components/Common/NotificationCenter.tsx`)

Dropdown z historią powiadomień, dostępny z headera aplikacji.

**Funkcjonalności:**
- Ikona dzwonka z licznikiem nieprzeczytanych
- Dropdown lista ostatnich 20 powiadomień
- Formatowanie czasu względnego (np. "2 minuty temu") w języku polskim
- Oznaczanie jako przeczytane przez kliknięcie
- Przyciski: "Oznacz wszystkie jako przeczytane", "Wyczyść historię"
- Auto-zamykanie przy kliknięciu poza komponentem
- Wizualne rozróżnienie przeczytanych/nieprzeczytanych
- Przewijanie dla długiej listy (max-height: 400px)

### 6. **Layout Integration** (`src/components/Common/Layout.tsx`)

Integracja systemu powiadomień w głównym layoucie aplikacji.

**Zaimplementowane:**
- Inicjalizacja połączenia WebSocket
- Handler dla eventów WebSocket
- Wyświetlanie toast przy nowych eventach
- Dodawanie do notification center przy nowych eventach
- NotificationCenter w headerze obok przycisku wylogowania
- ToastContainer na górze strony

**Obsługiwane eventy:**
- `order:status_changed`: "Zamówienie {orderNumber} zmieniono status z {oldStatus} na {newStatus}"
- `order:cancelled`: "Zamówienie {orderNumber} zostało anulowane"

### 7. **Test Utilities** (`src/utils/testNotifications.ts`)

Narzędzie pomocnicze do testowania powiadomień z konsoli przeglądarki.

**Użycie:**
```javascript
// W konsoli przeglądarki:
window.testNotification('order:status_changed')
window.testNotification('order:cancelled')
```

## Architektura

```
┌─────────────────────────────────────────────────────────────┐
│                        Layout Component                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  NotificationProvider (Context)                       │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  useWebSocket Hook                              │  │  │
│  │  │  - Łączy się z ws://localhost:4000/ws          │  │  │
│  │  │  - Autentykacja tokenem JWT                     │  │  │
│  │  │  - Auto-reconnect                               │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                          │                             │  │
│  │                          ▼                             │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  handleWebSocketMessage                         │  │  │
│  │  │  - Parsuje eventy                               │  │  │
│  │  │  - Wywołuje showNotification()                  │  │  │
│  │  │  - Dodaje toast do stacku                       │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────┐         ┌─────────────────────────┐  │
│  │ NotificationCenter│         │   ToastContainer        │  │
│  │ - Dropdown        │         │   - Stack toastów       │  │
│  │ - Historia (20)   │         │   - Auto-dismiss        │  │
│  │ - Unread badge    │         │   - Max 3 widoczne      │  │
│  └──────────────────┘         └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Integracja z App.tsx

```typescript
import { NotificationProvider } from './contexts/NotificationContext';

function App() {
  return (
    <NotificationProvider>
      <Routes>
        {/* ... routes ... */}
      </Routes>
    </NotificationProvider>
  );
}
```

## Wymagania

### Zainstalowane zależności:
- ✅ react-icons (^5.x.x)
- ✅ date-fns (^3.0.6) - już zainstalowane
- ✅ tailwindcss - już skonfigurowane

### Backend requirements:
- WebSocket server na `ws://localhost:4000/ws`
- Autentykacja JWT przez wiadomość `{ type: 'auth', token: '...' }`
- Broadcast eventów w formacie:
  ```json
  {
    "type": "order:status_changed",
    "data": {
      "orderId": "123",
      "orderNumber": "ORD-001",
      "oldStatus": "pending",
      "newStatus": "processing",
      "timestamp": "2025-10-29T10:00:00Z"
    }
  }
  ```

## Testowanie

### 1. Testowanie z backendowym WebSocket

Jeśli backend działa na `http://localhost:4000`:

1. Uruchom backend: `npm run dev` (w katalogu backend)
2. Uruchom frontend: `npm run dev` (w katalogu web-panel)
3. Zaloguj się do aplikacji
4. Otwórz DevTools Console - powinny pojawić się logi:
   - `[WebSocket] Connected`
   - `[Layout] WebSocket authenticated`
5. Wykonaj akcje na backendzie które triggerują eventy (np. zmiana statusu zamówienia)

### 2. Testowanie z konsoli przeglądarki

```javascript
// Import test utilities w main.tsx lub Layout.tsx
import { setupTestNotifications } from './utils/testNotifications';
setupTestNotifications();

// W konsoli przeglądarki:
window.testNotification('order:status_changed')
window.testNotification('order:cancelled')
```

### 3. Testowanie ręczne funkcjonalności

**Toast Notifications:**
- ✅ Toast pojawia się w prawym górnym rogu
- ✅ Auto-dismiss po 5 sekundach
- ✅ Możliwość ręcznego zamknięcia (X)
- ✅ Max 3 toasty widoczne jednocześnie
- ✅ Animacje wejścia/wyjścia

**Notification Center:**
- ✅ Ikona dzwonka w headerze
- ✅ Badge z liczbą nieprzeczytanych
- ✅ Dropdown z historią po kliknięciu
- ✅ Formatowanie czasu ("2 minuty temu")
- ✅ Oznaczanie jako przeczytane
- ✅ "Oznacz wszystkie jako przeczytane"
- ✅ "Wyczyść historię"
- ✅ Zamknięcie dropdown przy kliknięciu poza
- ✅ Persystencja w localStorage

**WebSocket:**
- ✅ Połączenie przy zalogowaniu
- ✅ Disconnect przy wylogowaniu/unmount
- ✅ Auto-reconnect przy utracie połączenia
- ✅ Autentykacja tokenem JWT
- ✅ Parsowanie wiadomości JSON

## Rozszerzanie systemu

### Dodawanie nowego typu eventu

1. **Dodaj typ w `src/types/notifications.ts`:**
```typescript
export interface ProductLowStockEvent {
  type: 'product:low_stock';
  data: {
    productId: string;
    productName: string;
    currentStock: number;
    minStock: number;
    timestamp: string;
  };
}

export type WebSocketEvent =
  | OrderStatusChangedEvent
  | OrderCancelledEvent
  | ProductLowStockEvent; // dodaj nowy typ
```

2. **Dodaj handler w `Layout.tsx`:**
```typescript
if (message.type === 'product:low_stock') {
  const event = message as ProductLowStockEvent;
  const { productName, currentStock, minStock } = event.data;
  const notificationMessage = `Niski stan magazynowy: ${productName} (${currentStock}/${minStock})`;

  const toastId = `${Date.now()}-${Math.random()}`;
  setToasts((prev) => [...prev, {
    id: toastId,
    type: 'warning',
    message: notificationMessage
  }]);

  showNotification(notificationMessage, 'warning');
}
```

### Customizacja toast duration

W `Toast.tsx` zmień domyślny duration:
```typescript
duration?: number; // default: 5000 (5 sekund)
```

Lub przy wywołaniu:
```typescript
<Toast duration={10000} {...props} />
```

### Zmiana max liczby powiadomień w historii

W `NotificationContext.tsx`:
```typescript
const MAX_NOTIFICATIONS = 50; // zmień z 20 na 50
```

## Potencjalne problemy i rozwiązania

### 1. WebSocket nie łączy się

**Problem:** Brak połączenia WebSocket, błąd w konsoli.

**Rozwiązania:**
- Sprawdź czy backend działa na `localhost:4000`
- Sprawdź czy token JWT jest w localStorage
- Sprawdź czy backend akceptuje połączenia WebSocket na `/ws`
- Sprawdź logi backendu

### 2. Toast nie znika automatycznie

**Problem:** Toast pozostaje na ekranie po 5 sekundach.

**Rozwiązanie:**
- Sprawdź czy `onClose` callback jest poprawnie przekazany
- Sprawdź czy nie ma błędów w konsoli blokujących timer

### 3. Powiadomienia nie zapisują się w localStorage

**Problem:** Po odświeżeniu strony historia jest pusta.

**Rozwiązania:**
- Sprawdź czy localStorage nie jest pełny (quota exceeded)
- Sprawdź czy przeglądarka nie blokuje localStorage (tryb incognito)
- Sprawdź logi w konsoli

### 4. Reconnect nie działa

**Problem:** Po utracie połączenia WebSocket nie próbuje się ponownie połączyć.

**Rozwiązania:**
- Sprawdź czy `maxReconnectAttempts` nie został osiągnięty (default: 10)
- Sprawdź czy komponent nie został odmontowany
- Sprawdź logi w konsoli

### 5. Licznik nieprzeczytanych nie aktualizuje się

**Problem:** Badge pozostaje po przeczytaniu powiadomień.

**Rozwiązanie:**
- Sprawdź czy `markAsRead` jest wywoływany poprawnie
- Sprawdź czy localStorage jest aktualizowany
- Odśwież stronę

## Pliki utworzone

```
/Users/mateuszmatula/PlantManager/web-panel/
├── src/
│   ├── types/
│   │   └── notifications.ts                  # Typy TypeScript
│   ├── hooks/
│   │   └── useWebSocket.ts                   # WebSocket hook
│   ├── contexts/
│   │   └── NotificationContext.tsx           # Context provider
│   ├── components/
│   │   └── Common/
│   │       ├── Toast.tsx                     # Toast component
│   │       ├── NotificationCenter.tsx        # Notification center
│   │       └── Layout.tsx                    # Zmodyfikowany layout
│   ├── utils/
│   │   └── testNotifications.ts              # Test utilities
│   └── App.tsx                               # Zmodyfikowany (dodano Provider)
└── NOTIFICATIONS_README.md                    # Ta dokumentacja
```

## Podsumowanie

System real-time notifications został w pełni zaimplementowany i jest gotowy do użycia. Wszystkie komponenty są responsywne, zgodne z TypeScript strict mode, i wykorzystują Tailwind CSS do stylowania. System jest łatwy w rozszerzaniu o nowe typy eventów i może być dostosowany do specyficznych potrzeb aplikacji.
