"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthClient = void 0;
const jose_1 = require("jose");
class AuthClient {
    jwks;
    options;
    constructor(options) {
        this.options = options;
        this.jwks = (0, jose_1.createRemoteJWKSet)(new URL(`${options.issuer}/.well-known/jwks.json`));
    }
    /** Verify and decode a JWT token */
    async verifyToken(token) {
        const { payload } = await (0, jose_1.jwtVerify)(token, this.jwks, {
            issuer: this.options.issuer,
            audience: this.options.audience,
        });
        return payload;
    }
    /** Check if a token has a specific role */
    hasRole(payload, role) {
        return payload.roles.includes(role);
    }
    /** Check if token represents an impersonated session */
    isImpersonated(payload) {
        return !!payload.impersonator;
    }
    /** Check if user has access to a specific app */
    hasAppAccess(payload, appName) {
        return payload.apps_actives.includes(appName);
    }
    /** Check if user has access to a specific module */
    hasModuleAccess(payload, moduleName) {
        return payload.modules_actifs.includes(moduleName);
    }
}
exports.AuthClient = AuthClient;
//# sourceMappingURL=index.js.map