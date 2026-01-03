/**
 * WebSocket Service for PlantManager
 * Handles real-time communication with the backend
 */

type MessageHandler = (data: any) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private isConnected = false;
  private pendingAuth = false;

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

    console.log('[WebSocket] Connecting to:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.authenticate();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.isConnected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error);
      this.scheduleReconnect();
    }
  }

  private authenticate() {
    const token = localStorage.getItem('token');
    if (token && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.pendingAuth = true;
      this.ws.send(JSON.stringify({ type: 'auth', token }));
    }
  }

  private handleMessage(message: any) {
    const { type, ...rest } = message;

    // Handle authentication response
    if (type === 'auth:success') {
      this.pendingAuth = false;
      console.log('[WebSocket] Authenticated successfully');
      // Emit to handlers
      this.emit('auth:success', rest);
      return;
    }

    if (type === 'auth:failed') {
      this.pendingAuth = false;
      console.error('[WebSocket] Authentication failed:', rest.error);
      return;
    }

    // Emit to registered handlers
    this.emit(type, rest.data || rest);
  }

  private emit(type: string, data: any) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error('[WebSocket] Handler error:', error);
        }
      });
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebSocket] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[WebSocket] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  subscribe(channel: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', channel }));
    }
  }

  unsubscribe(channel: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', channel }));
    }
  }

  on(type: string, handler: MessageHandler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.messageHandlers.get(type)?.delete(handler);
    };
  }

  off(type: string, handler: MessageHandler) {
    this.messageHandlers.get(type)?.delete(handler);
  }

  send(type: string, data?: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getConnectionState(): boolean {
    return this.isConnected;
  }
}

export const websocketService = new WebSocketService();
