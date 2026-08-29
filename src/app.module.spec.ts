import { describe, test, expect, beforeAll } from 'bun:test';
import { NestContainer } from '@nestjs/core/injector/container';
import { DependenciesScanner } from '@nestjs/core/scanner';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { GraphInspector } from '@nestjs/core/inspector/graph-inspector';
import { ApplicationConfig } from '@nestjs/core/application-config';

describe('AppModule bootstrap smoke test', () => {
  beforeAll(() => {
    process.env.SESSION_ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY || Buffer.alloc(32).toString('base64');
  });

  test('module dependency graph compiles without circular or undefined references', async () => {
    const { AppModule } = await import('./app.module');
    const container = new NestContainer();
    const metadataScanner = new MetadataScanner();
    const graphInspector = new GraphInspector(container);
    const appConfig = new ApplicationConfig();
    const scanner = new DependenciesScanner(container, metadataScanner, graphInspector, appConfig);

    // Scans the full module hierarchy, imports, providers, controllers, and exports.
    // Throws immediately if any module in an imports array is undefined or unresolvable.
    await scanner.scan(AppModule);
    expect(container.getModules().size).toBeGreaterThan(10);
  });
});
