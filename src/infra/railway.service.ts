import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const RAILWAY_PRO_RATES = {
  asOf: '2026-09-03',
  source: 'https://railway.com/pricing',
  rates: {
    ramGbHour: 0.000128,
    vcpuHour: 0.000257,
    diskGbHour: 0.0000038,
    egressGb: 0.05,
  },
};

export interface RailwayBillingDetails {
  plan: string;
  baseFeeUsd: number;
  currentUsageUsd: number;
  creditBalanceUsd: number;
  billingPeriod: {
    start: string;
    end: string;
  } | null;
  nextInvoiceDate: string | null;
  nextInvoiceTotalUsd: number | null;
  computeLimit: {
    hardLimitUsd: number;
    softLimitUsd: number;
    isOverLimit: boolean;
  } | null;
  agentLimit: {
    usedUsd: number;
    hardLimitUsd: number;
    softLimitUsd: number;
  } | null;
}

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
  estimatedCostUsd: number;
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
  totalEstimatedCostUsd: number;
  workspaceName: string | null;
  billing: RailwayBillingDetails | null;
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
        totalEstimatedCostUsd: 0,
        workspaceName: null,
        billing: null,
        projects: [],
        error: 'RAILWAY_TOKEN non configuré sur ce backend',
      };
    }

    try {
      const data = await this.fetchUsageData(token);

      const result: RailwayUsageResult = {
        status: 'connected',
        configured: true,
        updatedAt: new Date().toISOString(),
        totalCostUsd: data.totalCostUsd,
        totalEstimatedCostUsd: data.totalEstimatedCostUsd,
        workspaceName: data.workspaceName,
        billing: data.billing,
        projects: data.projects,
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
        totalEstimatedCostUsd: 0,
        workspaceName: null,
        billing: null,
        projects: [],
        error: errMsg,
      };
    }
  }

  private async fetchUsageData(token: string): Promise<{
    projects: RailwayProjectNode[];
    totalCostUsd: number;
    totalEstimatedCostUsd: number;
    workspaceName: string | null;
    billing: RailwayBillingDetails | null;
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

    // 3. Query authoritative Workspace Billing and Limits
    let totalCostUsd = 0;
    let billing: RailwayBillingDetails | null = null;

    if (workspaceId) {
      try {
        const billingQuery = `
          query GetWorkspaceBillingDetails($wsId: String!) {
            workspace(workspaceId: $wsId) {
              id
              name
              plan
              customer {
                currentUsage
                creditBalance
                appliedCredits
                billingPeriod {
                  start
                  end
                }
                usageLimit {
                  hardLimit
                  softLimit
                  isOverLimit
                }
                subscriptions {
                  nextInvoiceCurrentTotal
                  nextInvoiceDate
                  status
                  items {
                    priceDollars
                  }
                }
              }
            }
            agentUsage(workspaceId: $wsId) {
              totalUsedCents
              hardLimitCents
              softLimitCents
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
          const wsData = jsonBilling.data?.workspace;
          const customer = wsData?.customer;
          const agentData = jsonBilling.data?.agentUsage;

          if (typeof customer?.currentUsage === 'number') {
            totalCostUsd = Number(customer.currentUsage.toFixed(2));
          }

          const subscription = customer?.subscriptions?.[0];
          const baseItem = subscription?.items?.find((i: any) => i.priceDollars >= 5);
          const baseFeeUsd = baseItem ? baseItem.priceDollars : (wsData?.plan === 'PRO' ? 20 : 0);

          billing = {
            plan: wsData?.plan || 'PRO',
            baseFeeUsd,
            currentUsageUsd: totalCostUsd,
            creditBalanceUsd: customer?.creditBalance || 0,
            billingPeriod: customer?.billingPeriod ? {
              start: customer.billingPeriod.start,
              end: customer.billingPeriod.end,
            } : null,
            nextInvoiceDate: subscription?.nextInvoiceDate || null,
            nextInvoiceTotalUsd: typeof subscription?.nextInvoiceCurrentTotal === 'number'
              ? Number((subscription.nextInvoiceCurrentTotal / 100).toFixed(2))
              : null,
            computeLimit: customer?.usageLimit ? {
              hardLimitUsd: customer.usageLimit.hardLimit,
              softLimitUsd: customer.usageLimit.softLimit,
              isOverLimit: Boolean(customer.usageLimit.isOverLimit),
            } : null,
            agentLimit: agentData ? {
              usedUsd: Number(((agentData.totalUsedCents || 0) / 100).toFixed(2)),
              hardLimitUsd: Number(((agentData.hardLimitCents || 0) / 100).toFixed(2)),
              softLimitUsd: Number(((agentData.softLimitCents || 0) / 100).toFixed(2)),
            } : null,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch workspace billing details: ${err.message}`);
      }
    }

    // 4. Map projects with computed estimated USD
    let totalEstimatedCostUsd = 0;
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

      const estCost =
        raw.memoryGbHours * RAILWAY_PRO_RATES.rates.ramGbHour +
        raw.cpuHours * RAILWAY_PRO_RATES.rates.vcpuHour +
        raw.diskGb * RAILWAY_PRO_RATES.rates.diskGbHour +
        raw.networkTxGb * RAILWAY_PRO_RATES.rates.egressGb;

      const roundedEstCost = Number(estCost.toFixed(2));
      totalEstimatedCostUsd += roundedEstCost;

      return {
        id: node.id,
        name: node.name,
        servicesCount: services.length,
        estimatedCostUsd: roundedEstCost,
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
      totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(2)),
      workspaceName,
      billing,
    };
  }
}
