"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
const nats_1 = require("nats");
class EventBus {
    client;
    js = null;
    jsm = null;
    jc = (0, nats_1.JSONCodec)();
    constructor(client) {
        this.client = client;
    }
    /** Initialize JetStream client */
    async init() {
        const nc = this.client.getConnection();
        this.js = nc.jetstream();
        this.jsm = await nc.jetstreamManager();
    }
    /** Ensure a stream exists with the given configuration */
    async ensureStream(config) {
        if (!this.jsm)
            throw new Error('[EventBus] Not initialized. Call init() first.');
        try {
            const info = await this.jsm.streams.info(config.name);
            // Update subjects if they changed
            const current = info.config.subjects?.sort().join(',') ?? '';
            const desired = config.subjects.sort().join(',');
            if (current !== desired) {
                await this.jsm.streams.update(config.name, {
                    ...info.config,
                    subjects: config.subjects,
                });
                console.log(`[EventBus] Stream "${config.name}" updated subjects: [${config.subjects.join(', ')}]`);
            }
        }
        catch {
            await this.jsm.streams.add({
                name: config.name,
                subjects: config.subjects,
                retention: config.retention,
                max_age: config.max_age,
                max_bytes: config.max_bytes,
                storage: config.storage,
                num_replicas: config.num_replicas ?? 1,
            });
            console.log(`[EventBus] Stream "${config.name}" created`);
        }
    }
    /** Publish an event to JetStream. Failures are logged but do not throw. */
    async emit(subject, payload, source, correlationId) {
        if (!this.js) {
            console.warn('[EventBus] Not initialized — skipping emit:', subject);
            return false;
        }
        const envelope = {
            event: subject,
            payload,
            metadata: {
                correlationId: correlationId ?? crypto.randomUUID(),
                source,
                emittedAt: new Date().toISOString(),
            },
        };
        try {
            await this.js.publish(subject, this.jc.encode(envelope));
            return true;
        }
        catch (err) {
            console.error(`[EventBus] Failed to emit "${subject}":`, err.message);
            return false;
        }
    }
    /** Subscribe to events from a JetStream stream using a durable consumer */
    async consume(stream, consumerName, filterSubject, handler, config) {
        if (!this.js)
            throw new Error('[EventBus] Not initialized. Call init() first.');
        const consumer = await this.js.consumers.get(stream, consumerName).catch(async () => {
            if (!this.jsm)
                throw new Error('[EventBus] Not initialized.');
            await this.jsm.consumers.add(stream, {
                durable_name: consumerName,
                filter_subject: filterSubject,
                ack_policy: nats_1.AckPolicy.Explicit,
                deliver_policy: nats_1.DeliverPolicy.All,
                ...config,
            });
            return this.js.consumers.get(stream, consumerName);
        });
        const messages = await consumer.consume();
        (async () => {
            for await (const msg of messages) {
                try {
                    const decoded = this.jc.decode(msg.data);
                    const envelope = decoded.event
                        ? decoded
                        : { event: msg.subject, payload: decoded, metadata: { correlationId: '', source: '', emittedAt: '' } };
                    await handler(envelope);
                    msg.ack();
                }
                catch (err) {
                    console.error(`[EventBus] Error processing event on ${stream}/${consumerName}:`, err);
                    msg.nak();
                }
            }
        })();
    }
}
exports.EventBus = EventBus;
//# sourceMappingURL=index.js.map