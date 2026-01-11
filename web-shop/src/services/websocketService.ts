/**
 * WebSocket Service for PlantManager Web-Shop
 * Handles connection to backend for online presence tracking
 */

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private isConnected = false;
  private shouldReconnect = true;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Determine WebSocket URL based on environment
    let wsUrl: string;

    // In development (localhost), connect directly to backend port
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.hostname}:4000/ws`;
    } else {
      // In production, use the same host (nginx will proxy /ws to backend)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }

    console.log('[WebSocket Shop] Connecting to:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WebSocket Shop] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.authenticate();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[WebSocket Shop] Error parsing message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('[WebSocket Shop] Disconnected');
        this.isConnected = false;
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket Shop] Error:', error);
      };
    } catch (error) {
      console.error('[WebSocket Shop] Failed to connect:', error);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private authenticate() {
    const token = localStorage.getItem('shop_token');
    if (token && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'auth', token }));
    }
  }

  private handleMessage(message: { type: string; error?: string }) {
    const { type } = message;

    if (type === 'auth:success') {
      console.log('[WebSocket Shop] Authenticated successfully');
      return;
    }

    if (type === 'auth:failed') {
      console.error('[WebSocket Shop] Authentication failed:', message.error);
      return;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebSocket Shop] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[WebSocket Shop] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect();
      }
    }, this.reconnectDelay);
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  // Reconnect with new token (after login)
  reconnect() {
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connect();
  }

  getConnectionState(): boolean {
    return this.isConnected;
  }
}

export const websocketService = new WebSocketService();
