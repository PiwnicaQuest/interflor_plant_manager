// Helper utility for testing notifications
// Can be called from browser console: window.testNotification()

export function setupTestNotifications() {
  if (typeof window !== 'undefined') {
    (window as any).testNotification = (type: 'order:status_changed' | 'order:cancelled' = 'order:status_changed') => {
      const ws = new WebSocket('ws://localhost:4000/ws');

      ws.onopen = () => {
        console.log('[Test] WebSocket connected');

        // Authenticate first
        const token = localStorage.getItem('token');
        if (!token) {
          console.error('[Test] No token found');
          ws.close();
          return;
        }

        ws.send(JSON.stringify({ type: 'auth', token }));

        // Wait for auth, then send test message
        setTimeout(() => {
          if (type === 'order:status_changed') {
            ws.send(JSON.stringify({
              type: 'order:status_changed',
              data: {
                orderId: 'test-123',
                orderNumber: 'TEST-001',
                oldStatus: 'pending',
                newStatus: 'processing',
                timestamp: new Date().toISOString(),
              },
            }));
            console.log('[Test] Sent order:status_changed event');
          } else if (type === 'order:cancelled') {
            ws.send(JSON.stringify({
              type: 'order:cancelled',
              data: {
                orderId: 'test-456',
                orderNumber: 'TEST-002',
                reason: 'Test cancellation',
                timestamp: new Date().toISOString(),
              },
            }));
            console.log('[Test] Sent order:cancelled event');
          }

          // Close connection after sending
          setTimeout(() => ws.close(), 100);
        }, 500);
      };

      ws.onerror = (error) => {
        console.error('[Test] WebSocket error:', error);
      };
    };

    console.log('[Test] Test notifications setup complete. Use window.testNotification() to test.');
  }
}
