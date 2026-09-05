import { NodeSDK } from '@opentelemetry/sdk-node';
export interface TracingOptions {
    serviceName: string;
    serviceVersion: string;
    environment?: string;
    otlpEndpoint?: string;
}
export declare function initTracing(options: TracingOptions): NodeSDK;
//# sourceMappingURL=index.d.ts.map