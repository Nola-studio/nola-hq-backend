import { NolaClient } from '../core/index.js';
export interface CommandEnvelope<T = unknown> {
    command: string;
    payload: T;
    metadata: {
        correlationId: string;
        issuedBy: string;
        issuedAt: string;
        realm?: string;
        tenantId?: string;
        /**
         * Authorization roles of the acting principal, propagated from the trust
         * boundary (e.g. an API gateway that verified a JWT). Optional and additive:
         * services that don't role-scope simply ignore it. Enables downstream
         * role-aware authorization (scope-by-role) without re-reading the token.
         */
        roles?: string[];
        /**
         * Stable identity of the acting principal (e.g. the person/profile id behind
         * the auth subject), for scope-by-link checks downstream (a teacher limited
         * to their classes, a parent to their children). Optional and additive.
         */
        personId?: string;
    };
}
export interface CommandResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
}
export declare class CommandBus {
    private client;
    constructor(client: NolaClient);
    /** Send a command and wait for a response (request-reply) */
    send<TPayload, TResult>(subject: string, payload: TPayload, metadata: Omit<CommandEnvelope['metadata'], 'issuedAt'>, timeoutMs?: number): Promise<CommandResult<TResult>>;
    /** Register a command handler */
    handle<TPayload, TResult>(subject: string, handler: (envelope: CommandEnvelope<TPayload>) => Promise<CommandResult<TResult>>): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map