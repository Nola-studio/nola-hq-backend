export interface HmacOptions {
    secret: string;
    /** Max age of the signature in milliseconds (default: 5 minutes) */
    maxAge?: number;
}
/**
 * HMAC-based inter-service authentication.
 * Each request is signed with a shared secret + timestamp
 * to prevent replay attacks and ensure authenticity.
 */
export declare class HmacAuth {
    private secret;
    private maxAge;
    constructor(options: HmacOptions);
    /** Generate signature headers for an outgoing request */
    sign(method: string, path: string, body?: string): {
        'x-nola-timestamp': string;
        'x-nola-signature': string;
    };
    /** Verify incoming request signature */
    verify(method: string, path: string, timestamp: string, signature: string, body?: string): boolean;
}
/**
 * Express middleware factory for HMAC verification.
 * Rejects requests without valid inter-service signatures.
 */
export declare function hmacMiddleware(options: HmacOptions): (req: any, res: any, next: any) => any;
//# sourceMappingURL=index.d.ts.map