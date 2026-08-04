import 'reflect-metadata';
import { join } from 'path';
import AppDataSource from '../../src/data-source';
import { readWorkbook, excelSerialToIsoDate } from './xlsx-reader';
import { StudioProject } from '../../src/studio/studio-project.entity';
import { StudioDomain } from '../../src/studio/studio-domain.entity';
import { StudioRecurring } from '../../src/studio/studio-recurring.entity';
import { StudioExpense } from '../../src/studio/studio-expense.entity';

/**
 * One-off, idempotent import of the "Project Management Dashboard" workbook
 * into Studio. Run deliberately — NOT wired into `onModuleInit` (see
 * `docs/ops/studio-retirer-projets-semences.md` for why Studio never
 * auto-seeds anymore):
 *
 *   DATABASE_URL=postgres://... npx ts-node -r tsconfig-paths/register \
 *     scripts/seed/seed-studio.ts
 *
 * The workbook (`scripts/seed/Project Management Dashboard.xlsx`, gitignored
 * — never commit it) is a mostly-empty template: only 3 of the Projects
 * sheet's 9 columns are filled for 4 of its 5 rows, and the Tasks sheet has
 * zero data rows. This script imports exactly what's there and leaves
 * everything else `null` — it does not invent budgets, dates, or tasks.
 *
 * Idempotency:
 *   - Projects/Domains/Recurring: skipped if a row with the same natural
 *     key (project `key`, domain name, recurring `service`) already exists.
 *     Re-running never overwrites a since-edited row.
 *   - Billing → StudioExpense: no natural key exists in the sheet (a few
 *     rows are exact duplicates by design, e.g. two same-day $11 domain
 *     purchases). Instead, for each distinct row *fingerprint* the script
 *     counts how many matching expenses already exist and inserts only the
 *     shortfall, so re-running converges instead of duplicating.
 *
 * Names → assignee emails resolved from the workbook's own Assignees sheet,
 * not hardcoded — see `ASSIGNEE_EMAIL_BY_NAME` below, built from it at
 * runtime.
 */

const WORKBOOK_PATH = join(__dirname, 'Project Management Dashboard.xlsx');

// key: 2-10 chars, uppercase, starts with a letter — CreateProjectDto's rule.
const PROJECT_KEYS: Record<string, string> = {
  'Nolaa HQ': 'NOLAAHQ',
  'K-River': 'KRIVER',
  Yekoli: 'YEKOLI',
  Butterfly: 'BUTTRFLY',
  Mycvmatcher: 'MYCVMATCH',
};

const PROJECT_COLORS: Record<string, string> = {
  'Nolaa HQ': '#4F46E5',
  'K-River': '#0EA5E9',
  Yekoli: '#D4A053',
  Butterfly: '#059669',
  Mycvmatcher: '#DB2777',
};

const PROJECT_TYPE_MAP: Record<string, string> = {
  'Infrastructure & Cloud': 'infrastructure_cloud',
  'Web App Development': 'web_app_development',
  'Mobile App Development': 'mobile_app_development',
  Website: 'website',
  Administrative: 'administrative',
  'Maintenance & Support': 'maintenance_support',
  Other: 'other',
};

const PROJECT_PRIORITY_MAP: Record<string, string> = { High: 'high', Medium: 'medium', Low: 'low' };
const PROJECT_STATUS_MAP: Record<string, string> = {
  'On Track': 'on_track',
  'On Hold': 'on_hold',
  Behind: 'behind',
  Completed: 'completed',
};

// Domains sheet doesn't fill "Linked Project ID" for any row — inferred
// here by an obvious domain-name-to-project match (see the report to Greg
// for this exact call).
const DOMAIN_TO_PROJECT_NAME: Record<string, string> = {
  'yekoli.com': 'Yekoli',
  'mycvmatcher.com': 'Mycvmatcher',
  'butterflytesting.com': 'Butterfly',
};

// Billing sheet only has "Domain" / "Subscription" — mapped onto
// StudioExpense's richer, pre-existing category enum rather than shrinking
// it to match.
const EXPENSE_CATEGORY_MAP: Record<string, string> = {
  Domain: 'domains_saas',
  Subscription: 'infra_hosting',
};

function cell(row: Array<string | number | boolean | null> | undefined, i: number): string | number | boolean | null {
  return row?.[i] ?? null;
}

function str(v: string | number | boolean | null): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function num(v: string | number | boolean | null): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateStr(v: string | number | boolean | null): string | null {
  const n = num(v);
  return n === null ? null : excelSerialToIsoDate(n);
}

async function main() {
  const wb = readWorkbook(WORKBOOK_PATH);
  const ds = await AppDataSource.initialize();
  console.log(`Connected: ${ds.options.type}`);

  try {
    // ── Assignees (reference only — team_members already holds the real records) ──
    const assigneeRows = wb.sheet('Assignees');
    const assigneeEmailByName = new Map<string, string>();
    for (let r = 2; r < assigneeRows.length; r++) {
      const row = assigneeRows[r];
      if (!row) continue;
      const name = str(cell(row, 0));
      const email = str(cell(row, 2));
      if (name && email) assigneeEmailByName.set(name, email);
    }
    console.log(`Assignees read from sheet: ${[...assigneeEmailByName.keys()].join(', ')}`);

    // ── Projects ──
    const projectRepo = ds.getRepository(StudioProject);
    const projectIdByName = new Map<string, string>();
    const projectRows = wb.sheet('Projects');
    let projectsCreated = 0;
    for (let r = 2; r < projectRows.length; r++) {
      const row = projectRows[r];
      if (!row) continue;
      const name = str(cell(row, 1));
      if (!name) continue;
      const description = str(cell(row, 2));
      const type = str(cell(row, 3));
      const priority = str(cell(row, 4));
      const status = str(cell(row, 5));

      const key = PROJECT_KEYS[name];
      if (!key) throw new Error(`No key mapping for project "${name}" — add one to PROJECT_KEYS`);

      const existing = await projectRepo.findOne({ where: { key } });
      if (existing) {
        console.log(`Project "${name}" (${key}) already exists — skipping`);
        projectIdByName.set(name, existing.id);
        continue;
      }

      const saved = await projectRepo.save(
        projectRepo.create({
          name,
          key,
          description,
          status: 'active',
          color: PROJECT_COLORS[name] ?? '#94A3B8',
          ownerEmail: null,
          type: type ? (PROJECT_TYPE_MAP[type] as StudioProject['type']) ?? null : null,
          priority: priority ? (PROJECT_PRIORITY_MAP[priority] as StudioProject['priority']) ?? null : null,
          healthStatus: status ? (PROJECT_STATUS_MAP[status] as StudioProject['healthStatus']) ?? null : null,
          budget: null,
          cost: null,
          startDate: null,
          dueDate: null,
          leadAssigneeEmail: null,
          createdAt: new Date(),
        }),
      );
      projectIdByName.set(name, saved.id);
      projectsCreated++;
      console.log(`Created project "${name}" (${key})`);
    }
    console.log(`Projects: ${projectsCreated} created, ${projectIdByName.size - projectsCreated} already present.`);

    // Tasks sheet has zero data rows in this workbook — nothing to import.
    const taskRows = wb.sheet('Tasks');
    const taskDataRows = taskRows.filter((r, i) => i >= 2 && r && r.some((c) => c !== null && c !== undefined));
    console.log(`Tasks sheet: ${taskDataRows.length} data row(s) found — none expected, none imported.`);

    // ── Domains ──
    const domainRepo = ds.getRepository(StudioDomain);
    const domainRows = wb.sheet('Domains');
    let domainsCreated = 0;
    let domainsSkipped = 0;
    for (let r = 2; r < domainRows.length; r++) {
      const row = domainRows[r];
      if (!row) continue;
      const domain = str(cell(row, 0));
      if (!domain || domain.toLowerCase().startsWith('total')) continue; // skip the summary row

      const existing = await domainRepo.findOne({ where: { domain } });
      if (existing) {
        console.log(`Domain "${domain}" already exists — skipping`);
        domainsSkipped++;
        continue;
      }

      const paidByName = str(cell(row, 13));
      const linkedProjectName = DOMAIN_TO_PROJECT_NAME[domain];

      await domainRepo.save(
        domainRepo.create({
          domain,
          purchaseDate: dateStr(cell(row, 1)),
          renewalDate: dateStr(cell(row, 2)),
          registrar: str(cell(row, 3)),
          platform: str(cell(row, 4)),
          purpose: str(cell(row, 5)),
          price: num(cell(row, 6))?.toFixed(2) ?? null,
          autoRenew: str(cell(row, 7)) !== 'Off',
          status: str(cell(row, 8)),
          linkedProjectId: linkedProjectName ? projectIdByName.get(linkedProjectName) ?? null : null,
          notes: str(cell(row, 10)),
          workspace: str(cell(row, 11)),
          billingEmail: str(cell(row, 12)),
          paidByEmail: paidByName ? assigneeEmailByName.get(paidByName) ?? null : null,
          paymentMethod: str(cell(row, 14)),
          billingCycle: str(cell(row, 15)),
          createdAt: new Date(),
        }),
      );
      domainsCreated++;
      console.log(`Created domain "${domain}"`);
    }
    console.log(`Domains: ${domainsCreated} created, ${domainsSkipped} already present.`);

    // ── Recurring ──
    const recurringRepo = ds.getRepository(StudioRecurring);
    const recurringRows = wb.sheet('Recurring');
    let recurringCreated = 0;
    let recurringSkipped = 0;
    for (let r = 2; r < recurringRows.length; r++) {
      const row = recurringRows[r];
      if (!row) continue;
      const service = str(cell(row, 0));
      if (!service || service.toLowerCase().startsWith('total')) continue;
      const amount = num(cell(row, 2));
      const cycle = str(cell(row, 3));
      if (amount === null || !cycle) continue;

      const existing = await recurringRepo.findOne({ where: { service } });
      if (existing) {
        console.log(`Recurring "${service}" already exists — skipping`);
        recurringSkipped++;
        continue;
      }

      const paidByName = str(cell(row, 5));
      await recurringRepo.save(
        recurringRepo.create({
          service,
          purpose: str(cell(row, 1)),
          amount: amount.toFixed(2),
          cycle,
          chargeDay: str(cell(row, 4)),
          paidByEmail: paidByName ? assigneeEmailByName.get(paidByName) ?? null : null,
          billingAccount: str(cell(row, 6)),
          createdAt: new Date(),
        }),
      );
      recurringCreated++;
      console.log(`Created recurring subscription "${service}"`);
    }
    console.log(`Recurring: ${recurringCreated} created, ${recurringSkipped} already present.`);

    // ── Billing → StudioExpense ──
    //
    // The sheet has no natural row key, and a few rows are genuine
    // duplicates by design (e.g. rows 12 & 13: two separate same-day $11
    // domain purchases with identical description/amount/workspace). A
    // naive "does a matching row already exist?" check per sheet row would
    // insert the first duplicate, then see it as "already present" and
    // silently drop the second on the very first run. Instead: count how
    // many times each fingerprint appears *in the sheet*, compare against
    // how many already exist in the DB for that fingerprint, and insert
    // only the shortfall — so a fingerprint that legitimately appears
    // twice in the sheet ends up as two DB rows, and re-running the script
    // inserts nothing more.
    interface BillingRecord {
      date: string;
      description: string;
      category: string;
      amountCents: number;
      status: string;
      workspace: string | null;
      paidByName: string | null;
      billingEmail: string | null;
      paymentMethod: string | null;
    }
    const billingRows = wb.sheet('Billing');
    const records: BillingRecord[] = [];
    for (let r = 2; r < billingRows.length; r++) {
      const row = billingRows[r];
      if (!row) continue;
      const date = dateStr(cell(row, 0));
      const description = str(cell(row, 1));
      const category = str(cell(row, 2));
      const amount = num(cell(row, 3));
      const status = str(cell(row, 4));
      if (!date || !description || !category || amount === null) continue; // note/summary row

      records.push({
        date,
        description,
        category,
        amountCents: Math.round(amount * 100),
        status: status === 'Void' ? 'void' : 'paid',
        workspace: str(cell(row, 6)),
        paidByName: str(cell(row, 7)),
        billingEmail: str(cell(row, 8)),
        paymentMethod: str(cell(row, 9)),
      });
    }

    const fingerprintOf = (r: BillingRecord) =>
      [r.date, r.description, r.amountCents, r.category, r.workspace ?? '', r.paymentMethod ?? ''].join('|');

    const targetCountByFingerprint = new Map<string, number>();
    const representativeByFingerprint = new Map<string, BillingRecord>();
    for (const r of records) {
      const fp = fingerprintOf(r);
      targetCountByFingerprint.set(fp, (targetCountByFingerprint.get(fp) ?? 0) + 1);
      representativeByFingerprint.set(fp, r);
    }

    const expenseRepo = ds.getRepository(StudioExpense);

    // How many rows already exist per fingerprint, queried once per
    // distinct fingerprint (not per sheet row).
    const existingCountByFingerprint = new Map<string, number>();
    for (const [fp, r] of representativeByFingerprint) {
      const existingCount = await expenseRepo.count({
        where: {
          date: r.date,
          description: r.description,
          amountCents: r.amountCents,
          category: (EXPENSE_CATEGORY_MAP[r.category] ?? 'other') as StudioExpense['category'],
          workspace: r.workspace ?? undefined,
          paymentMethod: r.paymentMethod ?? undefined,
        },
      });
      existingCountByFingerprint.set(fp, existingCount);
    }

    let expensesCreated = 0;
    let expensesSkipped = 0;
    const insertedSoFarByFingerprint = new Map<string, number>();
    for (const r of records) {
      const fp = fingerprintOf(r);
      const target = targetCountByFingerprint.get(fp) ?? 0;
      const existing = existingCountByFingerprint.get(fp) ?? 0;
      const insertedSoFar = insertedSoFarByFingerprint.get(fp) ?? 0;

      if (existing + insertedSoFar >= target) {
        expensesSkipped++;
        continue;
      }

      await expenseRepo.save(
        expenseRepo.create({
          description: r.description,
          amountCents: r.amountCents,
          currency: 'USD',
          category: (EXPENSE_CATEGORY_MAP[r.category] ?? 'other') as StudioExpense['category'],
          paidByEmail: (r.paidByName ? assigneeEmailByName.get(r.paidByName) : undefined) ?? 'unknown@nola.dev',
          date: r.date,
          recurring: false,
          frequency: null,
          status: r.status as StudioExpense['status'],
          workspace: r.workspace,
          billingEmail: r.billingEmail,
          paymentMethod: r.paymentMethod,
          createdAt: new Date(),
        }),
      );
      expensesCreated++;
      insertedSoFarByFingerprint.set(fp, insertedSoFar + 1);
    }
    console.log(`Billing → expenses: ${expensesCreated} created, ${expensesSkipped} already present (fingerprint match).`);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
