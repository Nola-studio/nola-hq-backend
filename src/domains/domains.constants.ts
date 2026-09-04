/**
 * The twelve functional domains of the Nolaa HQ referential (§4A) and their
 * capabilities, as canonical seed data.
 *
 * `D01`..`D12` and `D06.C03` are **stable keys**, not display order: they are
 * referenced by Execution Manifests, by URLs and by every object carrying a
 * `domain_id`. Reordering the sidebar, renaming a domain or inserting a new
 * one must never renumber an existing code — add the next free number
 * instead. `position` is what ordering is for.
 *
 * This file is the source the seed migration reads. Editing a `name` here
 * does not update a deployed database; that takes its own migration, the same
 * as any other data change.
 */

export const DOMAIN_CODES = [
  'D01', 'D02', 'D03', 'D04', 'D05', 'D06',
  'D07', 'D08', 'D09', 'D10', 'D11', 'D12',
] as const;

export type DomainCode = (typeof DOMAIN_CODES)[number];

export interface DomainSeed {
  code: DomainCode;
  name: string;
  /** One sentence, taken from the referential's « ce que ce domaine représente ». */
  purpose: string;
  capabilities: { code: string; name: string }[];
}

export const DOMAIN_SEED: DomainSeed[] = [
  {
    code: 'D01',
    name: 'Groupe et gouvernance',
    purpose:
      "L'existence institutionnelle de NolaaStudio : sociétés, filiales, participations, organes de décision, détenteurs, mandats et règles d'autorité.",
    capabilities: [
      { code: 'D01.C01', name: 'Registre corporatif' },
      { code: 'D01.C02', name: 'Décisions et délégations' },
    ],
  },
  {
    code: 'D02',
    name: 'Organisations, départements et équipes',
    purpose:
      "Comment le travail humain est organisé dans chaque entité : organisation, département, équipe, poste et rattachement.",
    capabilities: [
      { code: 'D02.C01', name: 'Structure organisationnelle' },
      { code: 'D02.C02', name: 'Postes et responsabilités' },
    ],
  },
  {
    code: 'D03',
    name: 'Personnes, ressources humaines et accès',
    purpose:
      "La relation entre NolaaStudio et les personnes qui y travaillent, et leur capacité à accéder aux ressources. Nola Auth reste la source d'identité.",
    capabilities: [
      { code: 'D03.C01', name: 'Dossier collaborateur' },
      { code: 'D03.C02', name: 'Compétences et capacité' },
      { code: 'D03.C03', name: 'Accès' },
    ],
  },
  {
    code: 'D04',
    name: 'Marques, produits et propriété intellectuelle',
    purpose:
      "Le portefeuille de produits, marques et actifs intellectuels, traités comme des objets de gouvernance et non comme de simples repositories.",
    capabilities: [
      { code: 'D04.C01', name: 'Registre produit' },
      { code: 'D04.C02', name: 'Lifecycle et portefeuille' },
      { code: 'D04.C03', name: 'Propriété intellectuelle' },
    ],
  },
  {
    code: 'D05',
    name: 'Stratégie, objectifs et décisions',
    purpose:
      "La transformation de la vision en objectifs mesurables, puis le lien entre ces objectifs et le travail réellement exécuté.",
    capabilities: [
      { code: 'D05.C01', name: 'Planification stratégique' },
      { code: 'D05.C02', name: 'Exécution stratégique' },
    ],
  },
  {
    code: 'D06',
    name: 'Projets, ingénierie et qualité',
    purpose:
      "Le moteur d'exécution : transformer les besoins et référentiels en travail planifié, puis le relier au code, aux tests, aux releases et aux déploiements.",
    capabilities: [
      { code: 'D06.C01', name: 'Modèle de travail unifié' },
      { code: 'D06.C02', name: 'Planification et exécution' },
      { code: 'D06.C03', name: 'GitHub et livraison' },
      { code: 'D06.C04', name: 'Qualité' },
      { code: 'D06.C05', name: "Development Workspace et exécution liée au code" },
      { code: 'D06.C06', name: "Contribution et reconnaissance de l'exécution" },
    ],
  },
  {
    code: 'D07',
    name: 'Clients, commercial et cycle de vente',
    purpose:
      "La relation économique avec les organisations clientes, de la qualification au contrat, au projet, à la facturation et au renouvellement.",
    capabilities: [
      { code: 'D07.C01', name: 'Organisation cliente canonique' },
      { code: 'D07.C02', name: 'Audit numérique' },
      { code: 'D07.C03', name: 'Vente et contrats' },
    ],
  },
  {
    code: 'D08',
    name: 'Finance et modèle mère-filles',
    purpose:
      "La vérité financière de gestion : contribution par produit, entité, client, projet et pays, et flux internes entre la mère et ses filiales.",
    capabilities: [
      { code: 'D08.C01', name: 'Référentiel financier' },
      { code: 'D08.C02', name: 'Performance' },
      { code: 'D08.C03', name: 'Flux mère-filles' },
      { code: 'D08.C04', name: 'Contrôles' },
    ],
  },
  {
    code: 'D09',
    name: 'Support, exploitation et gestion de services',
    purpose:
      "L'exploitation quotidienne des services après mise à disposition : demandes, incidents, problèmes, changements, SLA, disponibilité et continuité.",
    capabilities: [
      { code: 'D09.C01', name: 'Catalogue de services' },
      { code: 'D09.C02', name: 'ITSM' },
      { code: 'D09.C03', name: 'Fiabilité' },
    ],
  },
  {
    code: 'D10',
    name: 'Marketing, marques et croissance',
    purpose:
      "La manière dont NolaaStudio et ses produits sont présentés au marché, acquièrent de l'audience et la transforment en opportunités et revenus.",
    capabilities: [
      { code: 'D10.C01', name: 'Planification marketing' },
      { code: 'D10.C02', name: 'Assets et marques' },
      { code: 'D10.C03', name: 'Croissance' },
    ],
  },
  {
    code: 'D11',
    name: 'Juridique, risques et conformité',
    purpose:
      "La protection du groupe : contrats, obligations, risques, contrôles et exigences de protection des données applicables aux entités et produits.",
    capabilities: [
      { code: 'D11.C01', name: 'Contrats juridiques' },
      { code: 'D11.C02', name: 'Risques' },
      { code: 'D11.C03', name: 'Protection des données' },
      { code: 'D11.C04', name: 'Obligations' },
    ],
  },
  {
    code: 'D12',
    name: "Documentation, savoir et architecture d'entreprise",
    purpose:
      "La mémoire institutionnelle : ce que le groupe sait, pourquoi les décisions ont été prises, comment ses processus fonctionnent et comment ses systèmes sont construits.",
    capabilities: [
      { code: 'D12.C01', name: 'Gestion documentaire' },
      { code: 'D12.C02', name: 'Processus et procédures' },
      { code: 'D12.C03', name: "Architecture d'entreprise" },
      { code: 'D12.C04', name: "Référentiels d'exécution et ingestion structurée" },
    ],
  },
];

/**
 * Which domain each backend module answers to.
 *
 * Deliberately a map rather than a folder move: relocating forty modules
 * would break `git blame`, invalidate in-flight branches and touch every
 * import in the repo, for no user-visible gain. `domains.constants.spec.ts`
 * asserts the map stays exhaustive, so a new module cannot be added without
 * someone deciding where it belongs — which is the point of the exercise.
 *
 * Three modules straddle two domains, and each straddle is a real scoping
 * question rather than an oversight:
 *   - `deploys`  — delivery (D06) vs operations (D09); REL-03 decides.
 *   - `momo`     — collection (D07) vs financial flows (D08). §6 of the
 *                  referential already rules: payments are canonical in
 *                  K-river, HQ keeps only the management view, so D08.
 *   - `broadcast`— service comms (D09) vs marketing (D10); MKT-01 decides.
 */
export const MODULE_DOMAIN: Record<string, DomainCode> = {
  company: 'D01',
  audit: 'D01',
  activity: 'D01',

  team: 'D03',
  directory: 'D03',
  iam: 'D03',
  auth: 'D03',
  assist: 'D03',

  apps: 'D04',
  modules: 'D04',
  plans: 'D04',

  roadmap: 'D05',
  analytics: 'D05',

  'work-items': 'D06',
  studio: 'D06',
  deploys: 'D06',

  business: 'D07',
  pipeline: 'D07',
  tenants: 'D07',
  verify: 'D07',
  'kelasi-proxy': 'D07',

  invoices: 'D08',
  subscriptions: 'D08',
  momo: 'D08',

  tickets: 'D09',
  sla: 'D09',
  health: 'D09',
  infra: 'D09',
  logs: 'D09',
  notifications: 'D09',
  push: 'D09',

  broadcast: 'D10',

  domains: 'D12',
  'execution-references': 'D12',
  manifest: 'D12',
  config: 'D12',
};

/**
 * Modules with no domain of their own: framework plumbing and reference data
 * that every domain consumes. Listed explicitly so the exhaustiveness test
 * can tell « cross-cutting » apart from « nobody decided yet ».
 */
export const CROSS_CUTTING_MODULES = ['common', 'countries', 'migrations', 'scripts'];
