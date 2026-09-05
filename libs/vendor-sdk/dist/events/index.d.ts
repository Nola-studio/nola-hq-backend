import { ConsumerConfig, StreamConfig } from 'nats';
import { NolaClient } from '../core/index.js';
export interface EventEnvelope<T = unknown> {
    event: string;
    payload: T;
    metadata: {
        correlationId: string;
        source: string;
        emittedAt: string;
        realm?: string;
        tenantId?: string;
    };
}
export declare class EventBus {
    private client;
    private js;
    private jsm;
    private readonly jc;
    constructor(client: NolaClient);
    /** Initialize JetStream client */
    init(): Promise<void>;
    /** Ensure a stream exists with the given configuration */
    ensureStream(config: Partial<StreamConfig> & {
        name: string;
        subjects: string[];
    }): Promise<void>;
    /** Publish an event to JetStream. Failures are logged but do not throw. */
    emit<T>(subject: string, payload: T, source: string, correlationId?: string): Promise<boolean>;
    /** Subscribe to events from a JetStream stream using a durable consumer */
    consume<T>(stream: string, consumerName: string, filterSubject: string, handler: (envelope: EventEnvelope<T>) => Promise<void>, config?: Partial<ConsumerConfig>): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map