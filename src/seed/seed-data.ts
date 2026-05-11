// Catalogue plateforme — référence statique vérifiable côté nola-platform
// (apps réellement existantes dans le monorepo, plans tarifaires définis
// dans le pricing public, pays officiellement supportés).
//
// Aucune donnée opérationnelle ici (tenants, team, activity, finance,
// tickets, deploys, audit, logs, KPIs) — toutes ces tables démarrent vides
// et se peuplent via l'API ou les événements NATS.

export const COUNTRIES_SEED = [
  { id: 'CD', name: 'RDC',           flag: '🇨🇩', cities: ['Kinshasa', 'Lubumbashi', 'Goma', 'Bukavu', 'Mbuji-Mayi', 'Matadi'] },
  { id: 'CI', name: 'Côte d’Ivoire', flag: '🇨🇮', cities: ['Abidjan', 'Yamoussoukro'] },
  { id: 'SN', name: 'Sénégal',       flag: '🇸🇳', cities: ['Dakar'] },
  { id: 'CM', name: 'Cameroun',      flag: '🇨🇲', cities: ['Douala', 'Yaoundé'] },
  { id: 'RW', name: 'Rwanda',        flag: '🇷🇼', cities: ['Kigali'] },
];

// Apps présentes dans le registry plateforme (cf. nola-platform). Aucun
// chiffre opérationnel : `tenants`, `mrrCdf`, `growth30` sont à 0 et seront
// recalculés depuis la table tenants quand elle se remplira.
export const APPS_SEED = [
  { id: 'kelasi', name: 'Kelasi',      tag: 'Gestion scolaire',   color: '#2D6A4F', mark: 'K', version: '0.0.0', status: 'live'    as const, tenants: 0, mrrCdf: 0, growth30: 0, since: '—', modules: [] },
  { id: 'kriver', name: 'Kriver',      tag: 'Formation continue', color: '#1B4965', mark: 'R', version: '0.0.0', status: 'beta'    as const, tenants: 0, mrrCdf: 0, growth30: 0, since: '—', modules: [] },
  { id: 'mycv',   name: 'MyCVMatcher', tag: 'Matching CV/offres', color: '#7C2D12', mark: 'M', version: '0.0.0', status: 'live'    as const, tenants: 0, mrrCdf: 0, growth30: 0, since: '—', modules: [] },
  { id: 'stock',  name: 'Nola Stock',  tag: 'Inventaire SME',     color: '#854D0E', mark: 'S', version: '0.0.0', status: 'mvp'     as const, tenants: 0, mrrCdf: 0, growth30: 0, since: '—', modules: [] },
  { id: 'vente',  name: 'Nola Vente',  tag: 'Point de vente',     color: '#3F3F46', mark: 'V', version: '0.0.0', status: 'dev'     as const, tenants: 0, mrrCdf: 0, growth30: 0, since: '—', modules: [] },
  { id: 'verify', name: 'Nola Verify', tag: 'Vérification doc.',  color: '#3730A3', mark: 'D', version: '0.0.0', status: 'planned' as const, tenants: 0, mrrCdf: 0, growth30: 0, since: '—', modules: [] },
];

// Plans tarifaires publics. `tenants` à 0 — sera recalculé depuis la table
// tenants par un service d'analytics.
export const PLANS_SEED = [
  { id: 'free',   name: 'Free',   priceCdf:         0, users: '≤ 10',     features: '6',  tenants: 0, color: '#94A3B8' },
  { id: 'growth', name: 'Growth', priceCdf: 1_400_000, users: '≤ 250',    features: '14', tenants: 0, color: '#2A6B52' },
  { id: 'scale',  name: 'Scale',  priceCdf: 4_200_000, users: '≤ 2 000',  features: '22', tenants: 0, color: '#1F4D3A' },
  { id: 'custom', name: 'Custom', priceCdf: 9_800_000, users: 'illimité', features: '∞',  tenants: 0, color: '#D4A053' },
];

// Matrice de fonctionnalités (config produit publique).
export const FEATURE_MATRIX_SEED = [
  { feat: 'Tenants utilisateurs',     free: '≤ 10', growth: '≤ 250', scale: '≤ 2 000',  custom: 'illimité' },
  { feat: 'Apps disponibles',         free: '1',    growth: '2',     scale: 'illimité', custom: 'illimité' },
  { feat: 'Modules feature flags',    free: 'false',growth: 'true',  scale: 'true',     custom: 'true'    },
  { feat: 'Mobile Money',             free: 'true', growth: 'true',  scale: 'true',     custom: 'true'    },
  { feat: 'WhatsApp Business',        free: 'false',growth: 'true',  scale: 'true',     custom: 'true'    },
  { feat: 'API publique',             free: 'false',growth: 'false', scale: 'true',     custom: 'true'    },
  { feat: 'SSO / SAML',               free: 'false',growth: 'false', scale: 'true',     custom: 'true'    },
  { feat: 'SLA 99.9% / support 24/7', free: 'false',growth: 'false', scale: 'false',    custom: 'true'    },
  { feat: 'Branding personnalisé',    free: 'false',growth: 'false', scale: 'true',     custom: 'true'    },
];
