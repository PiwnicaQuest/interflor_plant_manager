export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: Date;
  read: boolean;
}

export interface WebSocketMessage {
  type: string;
  data?: any;
  token?: string;
  userId?: string;
  error?: string;
}

export interface OrderStatusChangedEvent {
  type: 'order:status_changed';
  data: {
    orderId: string;
    orderNumber: string;
    oldStatus: string;
    newStatus: string;
    timestamp: string;
  };
}

export interface OrderCancelledEvent {
  type: 'order:cancelled';
  data: {
    orderId: string;
    orderNumber: string;
    reason?: string;
    timestamp: string;
  };
}

export type WebSocketEvent = OrderStatusChangedEvent | OrderCancelledEvent;
