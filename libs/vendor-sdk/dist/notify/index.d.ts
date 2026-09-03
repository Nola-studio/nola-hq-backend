import { NolaClient } from '../core/index.js';
export type NotificationChannel = 'email' | 'sms' | 'whatsapp' | 'push';
export interface NotificationRequest {
    channel: NotificationChannel;
    to: string;
    template: string;
    variables: Record<string, string>;
    metadata?: {
        correlationId?: string;
        realm?: string;
        tenantId?: string;
        priority?: 'low' | 'normal' | 'high';
    };
}
export interface NotificationResult {
    id: string;
    status: 'queued' | 'sent' | 'failed';
    channel: NotificationChannel;
    timestamp: string;
}
export declare class NotifyClient {
    private client;
    constructor(client: NolaClient);
    /** Send a notification via the nola-notify service */
    send(request: NotificationRequest): Promise<NotificationResult>;
    /** Send an email notification */
    sendEmail(to: string, template: string, variables: Record<string, string>): Promise<NotificationResult>;
    /** Send an SMS notification */
    sendSms(to: string, template: string, variables: Record<string, string>): Promise<NotificationResult>;
    /** Send a WhatsApp notification */
    sendWhatsApp(to: string, template: string, variables: Record<string, string>): Promise<NotificationResult>;
}
//# sourceMappingURL=index.d.ts.map