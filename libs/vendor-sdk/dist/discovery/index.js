"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscoveryService = void 0;
class DiscoveryService {
    client;
    services = new Map();
    constructor(client) {
        this.client = client;
    }
    /** Start listening for registry events */
    async start() {
        await this.client.subscribe('nola.registry.register', (data) => {
            const info = data;
            this.services.set(info.name, { ...info, status: 'healthy' });
        });
        await this.client.subscribe('nola.registry.heartbeat', (data) => {
            const { name, timestamp } = data;
            const existing = this.services.get(name);
            if (existing) {
                existing.lastHeartbeat = timestamp;
                existing.status = 'healthy';
            }
        });
        await this.client.subscribe('nola.registry.deregister', (data) => {
            const { name } = data;
            this.services.delete(name);
        });
    }
    /** Discover a specific service */
    getService(name) {
        return this.services.get(name);
    }
    /** List all known services */
    listServices() {
        return Array.from(this.services.values());
    }
    /** Request app manifest via registry */
    async discoverApp(appName) {
        return this.client.request('nola.registry.discover', { app: appName });
    }
}
exports.DiscoveryService = DiscoveryService;
//# sourceMappingURL=index.js.map