export type MessageType = 'apiRequest' | 'email' | 'other';

export interface TaskMessage {
    type: MessageType;
    id?: string; // generic id (orderId or task id)
    payload?: any;
    createdAt?: string;
    // optional metadata
    tries?: number; // if you want to implement retry counting
}
