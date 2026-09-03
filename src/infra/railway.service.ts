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

    const token = this.config.get<string>('RAILWAY_TOKEN') || process.env.RAILWAY_TOKEN;

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

    // 1. Query Workspace identity, Projects, and Estimated Measurements
    const mainQuery = `
      query GetWorkspaceData($measurements: [MetricMeasurement!]!) {
        apiToken {
          workspaces {
            id
            name
          }
        }
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
        estimatedUsage(measurements: $measurements) {
          projectId
          measurement
          estimatedValue
        }
      }
    `;

    const mainVars = {
      measurements: [
        'CPU_USAGE_2',
        'CPU_USAGE',
        'MEMORY_USAGE_GB',
        'DISK_USAGE_GB',
        'EPHEMERAL_DISK_USAGE_GB',
        'NETWORK_TX_GB',
      ],
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: mainQuery, variables: mainVars }),
    });

    if (!res.ok) {
      throw new Error(`Railway API HTTP ${res.status}: ${res.statusText}`);
    }

    const json: any = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0].message || 'GraphQL Error');
    }

    const workspace = json.data?.apiToken?.workspaces?.[0];
    const workspaceId = workspace?.id || null;
    const workspaceName = workspace?.name || null;
    const edges = json.data?.projects?.edges || [];
    const usageItems = json.data?.estimatedUsage || [];

    // 2. Aggregate raw measurements per project
    const metricsByProject: Record<string, RailwayProjectMetrics> = {};
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
      if (item.measurement === 'MEMORY_USAGE_GB') {
        p.memoryGbHours += val;
      } else if (item.measurement === 'CPU_USAGE_2' || item.measurement === 'CPU_USAGE') {
        p.cpuHours += val;
      } else if (item.measurement === 'DISK_USAGE_GB' || item.measurement === 'EPHEMERAL_DISK_USAGE_GB') {
        p.diskGb += val;
      } else if (item.measurement === 'NETWORK_TX_GB') {
        p.networkTxGb += val;
      }
    }

    // 3. Query authoritative Workspace Customer currentUsage if workspaceId is present
    let totalCostUsd = 0;
    if (workspaceId) {
      try {
        const billingQuery = `
          query GetWorkspaceBilling($wsId: String!) {
            workspace(workspaceId: $wsId) {
              customer {
                currentUsage
              }
            }
          }
        `;
        const resBilling = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query: billingQuery, variables: { wsId: workspaceId } }),
        });
        if (resBilling.ok) {
          const jsonBilling: any = await resBilling.json();
          const rawUsage = jsonBilling.data?.workspace?.customer?.currentUsage;
          if (typeof rawUsage === 'number') {
            totalCostUsd = Number(rawUsage.toFixed(2));
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch workspace billing: ${err.message}`);
      }
    }

    // 4. Map projects
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
      totalCostUsd,
      workspaceName,
    };
  }
}
