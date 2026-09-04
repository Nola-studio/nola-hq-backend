import { JWTPayload } from 'jose';
export interface NolaJwtPayload extends JWTPayload {
    sub: string;
    realm: string;
    tenant_id: string;
    apps_actives: string[];
    modules_actifs: string[];
    plan: string;
    roles: string[];
    email?: string;
    name?: string;
    impersonator?: {
        sub: string;
        roles: string[];
    };
}
export interface AuthClientOptions {
    issuer: string;
    audience?: string;
}
export declare class AuthClient {
    private jwks;
    private options;
    constructor(options: AuthClientOptions);
    /** Verify and decode a JWT token */
    verifyToken(token: string): Promise<NolaJwtPayload>;
    /** Check if a token has a specific role */
    hasRole(payload: NolaJwtPayload, role: string): boolean;
    /** Check if token represents an impersonated session */
    isImpersonated(payload: NolaJwtPayload): boolean;
    /** Check if user has access to a specific app */
    hasAppAccess(payload: NolaJwtPayload, appName: string): boolean;
    /** Check if user has access to a specific module */
    hasModuleAccess(payload: NolaJwtPayload, moduleName: string): boolean;
}
//# sourceMappingURL=index.d.ts.map