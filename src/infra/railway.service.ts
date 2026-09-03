import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RailwayProjectMetrics {
  memoryGbHours: number;
  cpuHours: number;
  diskGb: number;
  networkTxGb: number;
}

export interface RailwayProjectNode {
  id: string;
  name: string;
  servicesCount: number;
  metrics: RailwayProjectMetrics;
  services: Array<{
    id: string;
    name: string;
  }>;
}

export type RailwayStatus = 'unconfigured' | 'error' | 'connected';

export interface RailwayUsageResult {
  status: RailwayStatus;
  configured: boolean;
  updatedAt: string;
  totalCostUsd: number;
  workspaceName: string | null;
  projects: RailwayProjectNode[];
  error: string | null;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class RailwayService {
  private readonly logger = new Logger(RailwayService.name);
  private cachedResult: RailwayUsageResult | null = null;
  private lastFetchedAt: number = 0;

  constructor(private readonly config: ConfigService) {}

  async getUsage(forceRefresh: boolean = false): Promise<RailwayUsageResult> {
    const now = Date.now();
    if (!forceRefresh && this.cachedResult && now - this.lastFetchedAt < CACHE_TTL_MS) {
      return this.cachedResult;
    }

    const token =
      this.config.get<string>('RAILWAY_TOKEN') ||
      this.config.get<string>('RAILWAY_API_TOKEN') ||
      this.config.get<string>('RAILWAY_WORKSPACE_TOKEN') ||
      process.env.RAILWAY_TOKEN ||
      process.env.RAILWAY_API_TOKEN ||
      process.env.RAILWAY_WORKSPACE_TOKEN;

    if (!token) {
      return {
        status: 'unconfigured',
        configured: false,
        updatedAt: new Date().toISOString(),
        totalCostUsd: 0,
        workspaceName: null,
        projects: [],
        error: 'RAILWAY_TOKEN non configuré sur ce backend',
      };
    }

    try {
      const { projects, totalCostUsd, workspaceName } = await this.fetchUsageData(token);

      const result: RailwayUsageResult = {
        status: 'connected',
        configured: true,
        updatedAt: new Date().toISOString(),
        totalCostUsd,
        workspaceName,
        projects,
        error: null,
      };

      this.cachedResult = result;
      this.lastFetchedAt = now;
      return result;
    } catch (err: any) {
      const errMsg = err?.message || 'Erreur de communication avec Railway';
      this.logger.warn(`Failed to fetch Railway usage: ${errMsg}`);
      return {
        status: 'error',
        configured: true,
        updatedAt: new Date().toISOString(),
        totalCostUsd: 0,
        workspaceName: null,
        projects: [],
        error: errMsg,
      };
    }
  }

  private async fetchUsageData(token: string): Promise<{
    projects: RailwayProjectNode[];
    totalCostUsd: number;
    workspaceName: string | null;
  }> {
    const endpoint = 'https://backboard.railway.app/graphql/v2';

    const projectsQuery = `
      query GetProjectsAndBilling {
        me {
          name
          projects {
            edges {
              node {
                id
                name
                services {
                  edges {
                    node {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const resProjects = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: projectsQuery }),
    });

    if (!resProjects.ok) {
      throw new Error(`Railway API HTTP ${resProjects.status}: ${resProjects.statusText}`);
    }

    const jsonProjects: any = await resProjects.json();
    if (jsonProjects.errors && jsonProjects.errors.length > 0) {
      throw new Error(jsonProjects.errors[0].message || 'GraphQL Error');
    }

    const edges = jsonProjects.data?.me?.projects?.edges || [];
    const workspaceName = jsonProjects.data?.me?.name || null;

    // Query raw estimated measurements
    const measurementsQuery = `
      query GetEstimatedUsage($measurements: [MetricMeasurement!]!) {
        estimatedUsage(measurements: $measurements) {
          projectId
          measurement
          estimatedValue
        }
      }
    `;

    const measurementsVars = {
      measurements: [
        'CPU_USAGE_2',
        'CPU_USAGE',
        'MEMORY_USAGE_GB',
        'DISK_USAGE_GB',
        'EPHEMERAL_DISK_USAGE_GB',
        'NETWORK_TX_GB',
      ],
    };

    let metricsByProject: Record<string, RailwayProjectMetrics> = {};
    try {
      const resMetrics = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: measurementsQuery, variables: measurementsVars }),
      });
      if (resMetrics.ok) {
        const jsonMetrics: any = await resMetrics.json();
        const usageItems = jsonMetrics.data?.estimatedUsage || [];
        for (const item of usageItems) {
          if (!metricsByProject[item.projectId]) {
            metricsByProject[item.projectId] = {
              memoryGbHours: 0,
              cpuHours: 0,
              diskGb: 0,
              networkTxGb: 0,
            };
          }
          const p = metricsByProject[item.projectId];
          const val = Number(item.estimatedValue) || 0;
          if (item.measurement === 'MEMORY_USAGE_GB') p.memoryGbHours += val;
          else if (item.measurement === 'CPU_USAGE_2' || item.measurement === 'CPU_USAGE') p.cpuHours += val;
          else if (item.measurement === 'DISK_USAGE_GB' || item.measurement === 'EPHEMERAL_DISK_USAGE_GB') p.diskGb += val;
          else if (item.measurement === 'NETWORK_TX_GB') p.networkTxGb += val;
        }
      }
    } catch {
      // Non-blocking for raw metrics
    }

    const projects: RailwayProjectNode[] = edges.map((edge: any) => {
      const node = edge.node;
      const serviceEdges = node.services?.edges || [];
      const services = serviceEdges.map((se: any) => ({
        id: se.node.id,
        name: se.node.name,
      }));

      const raw = metricsByProject[node.id] || {
        memoryGbHours: 0,
        cpuHours: 0,
        diskGb: 0,
        networkTxGb: 0,
      };

      return {
        id: node.id,
        name: node.name,
        servicesCount: services.length,
        metrics: {
          memoryGbHours: Number(raw.memoryGbHours.toFixed(2)),
          cpuHours: Number(raw.cpuHours.toFixed(2)),
          diskGb: Number(raw.diskGb.toFixed(2)),
          networkTxGb: Number(raw.networkTxGb.toFixed(2)),
        },
        services,
      };
    });

    return {
      projects,
      totalCostUsd: 0, // Authoritative billing total populated when Customer.currentUsage is queried
      workspaceName,
    };
  }
}
