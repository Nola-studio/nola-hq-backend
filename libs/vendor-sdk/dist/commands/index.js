"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandBus = void 0;
class CommandBus {
    client;
    constructor(client) {
        this.client = client;
    }
    /** Send a command and wait for a response (request-reply) */
    async send(subject, payload, metadata, timeoutMs = 5000) {
        const envelope = {
            command: subject,
            payload,
            metadata: {
                ...metadata,
                issuedAt: new Date().toISOString(),
            },
        };
        return this.client.request(subject, envelope, timeoutMs);
    }
    /** Register a command handler */
    async handle(subject, handler) {
        const nc = this.client.getConnection();
        const sub = nc.subscribe(subject);
        (async () => {
            for await (const msg of sub) {
                try {
                    const { JSONCodec } = await import('nats');
                    const jc = JSONCodec();
                    const envelope = jc.decode(msg.data);
                    const result = await handler(envelope);
                    if (msg.reply) {
                        msg.respond(jc.encode(result));
                    }
                }
                catch (err) {
                    console.error(`[CommandBus] Error handling ${subject}:`, err);
                    if (msg.reply) {
                        const { JSONCodec } = await import('nats');
                        const jc = JSONCodec();
                        msg.respond(jc.encode({
                            success: false,
                            error: { code: 'INTERNAL_ERROR', message: String(err) },
                        }));
                    }
                }
            }
        })();
    }
}
exports.CommandBus = CommandBus;
//# sourceMappingURL=index.js.map