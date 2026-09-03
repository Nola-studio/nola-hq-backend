"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initTracing = initTracing;
const sdk_node_1 = require("@opentelemetry/sdk-node");
const exporter_trace_otlp_http_1 = require("@opentelemetry/exporter-trace-otlp-http");
const exporter_metrics_otlp_http_1 = require("@opentelemetry/exporter-metrics-otlp-http");
const sdk_metrics_1 = require("@opentelemetry/sdk-metrics");
const resources_1 = require("@opentelemetry/resources");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const instrumentation_http_1 = require("@opentelemetry/instrumentation-http");
const instrumentation_express_1 = require("@opentelemetry/instrumentation-express");
const instrumentation_nestjs_core_1 = require("@opentelemetry/instrumentation-nestjs-core");
function initTracing(options) {
    const env = options.environment ?? process.env.NODE_ENV ?? 'development';
    const endpoint = options.otlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
    const resource = new resources_1.Resource({
        [semantic_conventions_1.SEMRESATTRS_SERVICE_NAME]: options.serviceName,
        [semantic_conventions_1.SEMRESATTRS_SERVICE_VERSION]: options.serviceVersion,
        [semantic_conventions_1.SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: env,
    });
    const sdk = new sdk_node_1.NodeSDK({
        resource,
        traceExporter: new exporter_trace_otlp_http_1.OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
        metricReader: new sdk_metrics_1.PeriodicExportingMetricReader({
            exporter: new exporter_metrics_otlp_http_1.OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
            exportIntervalMillis: 30_000,
        }),
        instrumentations: [
            new instrumentation_http_1.HttpInstrumentation(),
            new instrumentation_express_1.ExpressInstrumentation(),
            new instrumentation_nestjs_core_1.NestInstrumentation(),
        ],
    });
    sdk.start();
    process.on('SIGTERM', () => sdk.shutdown());
    process.on('SIGINT', () => sdk.shutdown());
    return sdk;
}
//# sourceMappingURL=index.js.map