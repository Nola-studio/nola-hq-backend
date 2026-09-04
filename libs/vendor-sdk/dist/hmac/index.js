"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HmacAuth = void 0;
exports.hmacMiddleware = hmacMiddleware;
const crypto_1 = require("crypto");
/**
 * HMAC-based inter-service authentication.
 * Each request is signed with a shared secret + timestamp
 * to prevent replay attacks and ensure authenticity.
 */
class HmacAuth {
    secret;
    maxAge;
    constructor(options) {
        this.secret = options.secret;
        this.maxAge = options.maxAge ?? 5 * 60 * 1000; // 5 minutes
    }
    /** Generate signature headers for an outgoing request */
    sign(method, path, body) {
        const timestamp = Date.now().toString();
        const payload = `${method.toUpperCase()}\n${path}\n${timestamp}\n${body ?? ''}`;
        const signature = (0, crypto_1.createHmac)('sha256', this.secret).update(payload).digest('hex');
        return {
            'x-nola-timestamp': timestamp,
            'x-nola-signature': signature,
        };
    }
    /** Verify incoming request signature */
    verify(method, path, timestamp, signature, body) {
        const age = Date.now() - parseInt(timestamp, 10);
        if (isNaN(age) || age > this.maxAge || age < -this.maxAge) {
            return false; // Replay or clock drift
        }
        const payload = `${method.toUpperCase()}\n${path}\n${timestamp}\n${body ?? ''}`;
        const expected = (0, crypto_1.createHmac)('sha256', this.secret).update(payload).digest('hex');
        try {
            return (0, crypto_1.timingSafeEqual)(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
        }
        catch {
            return false;
        }
    }
}
exports.HmacAuth = HmacAuth;
/**
 * Express middleware factory for HMAC verification.
 * Rejects requests without valid inter-service signatures.
 */
function hmacMiddleware(options) {
    const hmac = new HmacAuth(options);
    return (req, res, next) => {
        const timestamp = req.headers['x-nola-timestamp'];
        const signature = req.headers['x-nola-signature'];
        if (!timestamp || !signature) {
            return res.status(401).json({ error: 'missing_hmac', message: 'Missing HMAC signature headers' });
        }
        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? '');
        const valid = hmac.verify(req.method, req.path, timestamp, signature, body);
        if (!valid) {
            return res.status(401).json({ error: 'invalid_hmac', message: 'Invalid or expired HMAC signature' });
        }
        next();
    };
}
//# sourceMappingURL=index.js.map