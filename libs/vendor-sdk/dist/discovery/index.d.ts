import { NolaClient } from '../core/index.js';
export interface ServiceInfo {
    name: string;
    version: string;
    status: 'healthy' | 'degraded' | 'unknown';
    lastHeartbeat: string;
    metadata?: Record<string, unknown>;
}
export interface AppManifest {
    app: string;
    version: string;
    modules: string[];
    endpoints: Record<string, string>;
}
export declare class DiscoveryService {
    private client;
    private services;
    constructor(client: NolaClient);
    /** Start listening for registry events */
    start(): Promise<void>;
    /** Discover a specific service */
    getService(name: string): ServiceInfo | undefined;
    /** List all known services */
    listServices(): ServiceInfo[];
    /** Request app manifest via registry */
    discoverApp(appName: string): Promise<AppManifest>;
}
//# sourceMappingURL=index.d.ts.map