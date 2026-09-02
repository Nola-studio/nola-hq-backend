import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RailwayProjectNode {
  id: string;
  name: string;
  servicesCount: number;
  estimatedCostUsd: number;
  services: Array<{
    id: string;
    name: string;
    estimatedCostUsd?: number;
  }>;
}

export interface RailwayUsageResult {
  configured: boolean;
  updatedAt: string;
  totalCostUsd: number;
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

    const token = this.config.get<string>('RAILWAY_API_TOKEN') || process.env.RAILWAY_API_TOKEN;
    if (!token) {
      return {
        configured: false,
        updatedAt: new Date().toISOString(),
        totalCostUsd: 0,
        projects: [],
        error: 'RAILWAY_API_TOKEN non configuré',
      };
    }

    try {
      const projects = await this.fetchProjects(token);
      const totalCostUsd = projects.reduce((acc, p) => acc + p.estimatedCostUsd, 0);

      const result: RailwayUsageResult = {
        configured: true,
        updatedAt: new Date().toISOString(),
        totalCostUsd: Number(totalCostUsd.toFixed(2)),
        projects,
        error: null,
      };

      this.cachedResult = result;
      this.lastFetchedAt = now;
      return result;
    } catch (err: any) {
      this.logger.warn(`Failed to fetch Railway usage: ${err.message}`);
      return {
        configured: true,
        updatedAt: new Date().toISOString(),
        totalCostUsd: 0,
        projects: [],
        error: err.message || 'Erreur de communication avec Railway',
      };
    }
  }

  private async fetchProjects(token: string): Promise<RailwayProjectNode[]> {
    const query = `
      query GetProjects {
        me {
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

    const res = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      throw new Error(`Railway API HTTP ${res.status}: ${res.statusText}`);
    }

    const json: any = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0].message || 'GraphQL Error');
    }

    const edges = json.data?.me?.projects?.edges || [];
    return edges.map((edge: any) => {
      const node = edge.node;
      const serviceEdges = node.services?.edges || [];
      const services = serviceEdges.map((se: any) => ({
        id: se.node.id,
        name: se.node.name,
      }));

      return {
        id: node.id,
        name: node.name,
        servicesCount: services.length,
        estimatedCostUsd: 0,
        services,
      };
    });
  }
}
