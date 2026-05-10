// Seed data ported from the nola-hq frontend (src/lib/data.ts).
// Stays in sync with the UI's mocked dataset so the backend ships
// "ready-to-use" with realistic content.

export const COUNTRIES_SEED = [
  { id: 'CD', name: 'RDC', flag: '🇨🇩', cities: ['Kinshasa', 'Lubumbashi', 'Goma', 'Bukavu', 'Mbuji-Mayi', 'Matadi'] },
  { id: 'CI', name: 'Côte d’Ivoire', flag: '🇨🇮', cities: ['Abidjan', 'Yamoussoukro'] },
  { id: 'SN', name: 'Sénégal', flag: '🇸🇳', cities: ['Dakar'] },
  { id: 'CM', name: 'Cameroun', flag: '🇨🇲', cities: ['Douala', 'Yaoundé'] },
  { id: 'RW', name: 'Rwanda', flag: '🇷🇼', cities: ['Kigali'] },
];

export const APPS_SEED = [
  { id: 'kelasi', name: 'Kelasi',       tag: 'Gestion scolaire',   color: '#2D6A4F', mark: 'K', version: '2.4.1', status: 'live',    tenants: 48, mrrCdf: 184_500_000, growth30:  12.4, since: '2024-08', modules: ['bulletins','qcm','absences','paiements-momo','lms','sso'] },
  { id: 'kriver', name: 'Kriver',       tag: 'Formation continue', color: '#1B4965', mark: 'R', version: '0.4.2', status: 'beta',    tenants:  6, mrrCdf:   8_400_000, growth30:  28.1, since: '2025-09', modules: ['cours','video-cv','certificats'] },
  { id: 'mycv',   name: 'MyCVMatcher',  tag: 'Matching CV/offres', color: '#7C2D12', mark: 'M', version: '1.2.0', status: 'live',    tenants: 11, mrrCdf:  21_700_000, growth30:   6.8, since: '2025-02', modules: ['llm-screening','cv-bulk','jobs'] },
  { id: 'stock',  name: 'Nola Stock',   tag: 'Inventaire SME',     color: '#854D0E', mark: 'S', version: '0.9.0', status: 'mvp',     tenants: 14, mrrCdf:  15_300_000, growth30:  18.3, since: '2025-06', modules: ['scan-codebar','inventaire-pro','multi-depot'] },
  { id: 'vente',  name: 'Nola Vente',   tag: 'Point de vente',     color: '#3F3F46', mark: 'V', version: '0.1.0', status: 'dev',     tenants:  0, mrrCdf:           0, growth30:     0, since: '—',        modules: ['caisse','tickets'] },
  { id: 'verify', name: 'Nola Verify',  tag: 'Vérification doc.',  color: '#3730A3', mark: 'D', version: '—',     status: 'planned', tenants:  0, mrrCdf:           0, growth30:     0, since: '—',        modules: ['ocr','kyc'] },
];

export const PLANS_SEED = [
  { id: 'free',   name: 'Free',   priceCdf:        0, users: '≤ 10',     features: '6',  tenants: 22, color: '#94A3B8' },
  { id: 'growth', name: 'Growth', priceCdf: 1_400_000, users: '≤ 250',    features: '14', tenants: 41, color: '#2A6B52' },
  { id: 'scale',  name: 'Scale',  priceCdf: 4_200_000, users: '≤ 2 000',  features: '22', tenants: 14, color: '#1F4D3A' },
  { id: 'custom', name: 'Custom', priceCdf: 9_800_000, users: 'illimité', features: '∞',  tenants:  2, color: '#D4A053' },
];

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

export const TEAM_SEED = [
  { id: 'cm', name: 'Christian Mbuyi',     role: 'Super-Admin',      tag: 'Fondateur',  avatar: 'CM', hue: 158, online: true,  email: 'christian@nola.cd',  country: 'CD', perms: ['admin','finance','tech','support'], last: 'il y a 2 min',  password: 'nola1234' },
  { id: 'pk', name: 'Patricia Kasongo',    role: 'Customer Success', tag: 'Lead CS',    avatar: 'PK', hue:  18, online: true,  email: 'patricia@nola.cd',   country: 'CD', perms: ['support','commercial'],            last: 'il y a 4 min',  password: 'nola1234' },
  { id: 'kn', name: 'Kevin Ngoma',         role: 'Engineer',         tag: 'Senior Eng.', avatar: 'KN', hue: 220, online: true,  email: 'kevin@nola.cd',      country: 'CD', perms: ['tech','deploy'],                   last: 'il y a 11 min', password: 'nola1234' },
  { id: 'ad', name: 'Aïssata Diop',        role: 'Sales',            tag: 'Lead — CI',  avatar: 'AD', hue: 280, online: false, email: 'aissata@nola.ci',    country: 'CI', perms: ['commercial'],                      last: 'il y a 1 h',    password: 'nola1234' },
  { id: 'jl', name: 'Jean-Marc Lukusa',    role: 'Finance',          tag: 'Manager',    avatar: 'JL', hue:  40, online: true,  email: 'jeanmarc@nola.cd',   country: 'CD', perms: ['finance'],                         last: 'il y a 38 min', password: 'nola1234' },
  { id: 'bt', name: 'Bénédicte Tshilumba', role: 'Support N1',       tag: 'Support',    avatar: 'BT', hue: 340, online: false, email: 'benedicte@nola.cd',  country: 'CD', perms: ['support'],                         last: 'il y a 4 h',    password: 'nola1234' },
];

export const TENANTS_SEED = [
  { id:'t-001', name:'École Saint-Joseph',     country:'CD', city:'Kinshasa',     apps:['kelasi'],         plan:'scale',  mrrCdf:47_250_000, status:'healthy',    since:'2024-03', users:1842, owner:'Père Albert Kabamba',  whatsapp:'+243 81 234 11 09',   mobileMoney:'M-Pesa',  arDays:0,  nps:62 },
  { id:'t-002', name:'École Lumumba',          country:'CD', city:'Gombe',        apps:['kelasi'],         plan:'growth', mrrCdf:23_800_000, status:'healthy',    since:'2024-07', users: 940, owner:'Mme Bertine Mukendi',  whatsapp:'+243 99 882 17 03',   mobileMoney:'Airtel',  arDays:0,  nps:54 },
  { id:'t-003', name:'Institut Mokili',        country:'CD', city:'Lubumbashi',   apps:['kelasi','mycv'],  plan:'growth', mrrCdf:28_140_000, status:'healthy',    since:'2024-09', users:1116, owner:'Dr. Jean Ilunga',      whatsapp:'+243 97 110 44 18',   mobileMoney:'Orange',  arDays:0,  nps:48 },
  { id:'t-004', name:'Boutique Mwana',         country:'CD', city:'Kinshasa',     apps:['stock'],          plan:'free',   mrrCdf:        0, status:'trial',      since:'2026-04', users:  12, owner:'Grace Mwana',          whatsapp:'+243 81 940 11 22',   mobileMoney:'M-Pesa',  arDays:0,  nps:null },
  { id:'t-005', name:'Pharmacie Bena Bena',    country:'CD', city:'Goma',         apps:['stock'],          plan:'growth', mrrCdf: 1_400_000, status:'healthy',    since:'2025-11', users:  18, owner:'Dr. Alain Bahati',     whatsapp:'+243 97 654 88 14',   mobileMoney:'Airtel',  arDays:0,  nps:71 },
  { id:'t-006', name:'CV Hub Abidjan',         country:'CI', city:'Abidjan',      apps:['mycv'],           plan:'scale',  mrrCdf: 4_200_000, status:'healthy',    since:'2025-04', users: 312, owner:'Yao Kouassi',          whatsapp:'+225 07 88 41 09 12', mobileMoney:'Orange',  arDays:0,  nps:58 },
  { id:'t-007', name:'Centre Kriver Kigali',   country:'RW', city:'Kigali',       apps:['kriver'],         plan:'growth', mrrCdf: 1_400_000, status:'healthy',    since:'2025-10', users:  84, owner:'Eric Habimana',        whatsapp:'+250 78 220 11 04',   mobileMoney:'MTN MoMo',arDays:0,  nps:66 },
  { id:'t-008', name:'Coopérative Tujenge',    country:'CD', city:'Bukavu',       apps:['stock'],          plan:'growth', mrrCdf: 1_400_000, status:'attention',  since:'2025-08', users:  41, owner:'Aimée Bashizi',        whatsapp:'+243 97 002 18 77',   mobileMoney:'M-Pesa',  arDays:9,  nps:39 },
  { id:'t-009', name:'École Mama Yemo',        country:'CD', city:'Kinshasa',     apps:['kelasi'],         plan:'growth', mrrCdf: 1_400_000, status:'onboarding', since:'2026-05', users:  62, owner:'Sœur Cécile Mbongo',  whatsapp:'+243 81 442 76 11',   mobileMoney:'Airtel',  arDays:0,  nps:null },
  { id:'t-010', name:'Lycée des Lumières',     country:'CI', city:'Yamoussoukro', apps:['kelasi'],         plan:'growth', mrrCdf: 1_540_000, status:'healthy',    since:'2025-12', users: 488, owner:'M. Issouf Traoré',     whatsapp:'+225 05 22 18 70 33', mobileMoney:'Wave',    arDays:0,  nps:51 },
  { id:'t-011', name:'École Sainte-Thérèse',   country:'SN', city:'Dakar',        apps:['kelasi'],         plan:'scale',  mrrCdf: 4_200_000, status:'healthy',    since:'2025-05', users: 921, owner:'M. Mamadou Sow',       whatsapp:'+221 77 884 11 92',   mobileMoney:'Wave',    arDays:0,  nps:69 },
  { id:'t-012', name:'Pharmacie Lucie',        country:'CD', city:'Mbuji-Mayi',   apps:['stock'],          plan:'free',   mrrCdf:        0, status:'trial',      since:'2026-04', users:   6, owner:'Lucie Tshibasu',       whatsapp:'+243 99 110 09 87',   mobileMoney:'M-Pesa',  arDays:0,  nps:null },
  { id:'t-013', name:'TechHub Douala',         country:'CM', city:'Douala',       apps:['mycv'],           plan:'growth', mrrCdf: 1_400_000, status:'attention',  since:'2025-09', users: 142, owner:'Pascaline Kemegne',    whatsapp:'+237 6 95 22 88 41',  mobileMoney:'Orange',  arDays:14, nps:42 },
  { id:'t-014', name:'École La Borne',         country:'CD', city:'Kinshasa',     apps:['kelasi'],         plan:'growth', mrrCdf: 1_540_000, status:'healthy',    since:'2025-02', users: 504, owner:'Pst. Daniel Kasonga',  whatsapp:'+243 81 003 22 19',   mobileMoney:'M-Pesa',  arDays:0,  nps:60 },
  { id:'t-015', name:'Institut Polyvalent',    country:'CD', city:'Matadi',       apps:['kelasi','stock'], plan:'scale',  mrrCdf: 4_620_000, status:'healthy',    since:'2024-11', users:1320, owner:'Mme Charlotte Diaba',  whatsapp:'+243 97 511 28 04',   mobileMoney:'Airtel',  arDays:0,  nps:64 },
  { id:'t-016', name:'Coopérative Solidaire',  country:'CD', city:'Kinshasa',     apps:['stock'],          plan:'growth', mrrCdf: 1_400_000, status:'churn-risk', since:'2025-01', users:  28, owner:'Joseph Mukoko',        whatsapp:'+243 99 220 08 17',   mobileMoney:'Orange',  arDays:23, nps:27 },
  { id:'t-017', name:'École Notre-Dame',       country:'CD', city:'Kinshasa',     apps:['kelasi'],         plan:'growth', mrrCdf: 1_540_000, status:'healthy',    since:'2025-07', users: 612, owner:'Sœur Marie-Ange',      whatsapp:'+243 81 990 11 33',   mobileMoney:'M-Pesa',  arDays:0,  nps:55 },
  { id:'t-018', name:'CV Pro Dakar',           country:'SN', city:'Dakar',        apps:['mycv'],           plan:'growth', mrrCdf: 1_400_000, status:'healthy',    since:'2025-11', users:  98, owner:'Aminata Ndiaye',       whatsapp:'+221 70 442 19 03',   mobileMoney:'Wave',    arDays:0,  nps:73 },
];

export const ACTIVITY_SEED = [
  { t: '2 min',  actor:'pk',  cat:'commercial' as const, text:'a fait passer **École Mama Yemo** de trial → Growth', ref:'t-009' },
  { t: '4 min',  actor:'sys', cat:'finance'    as const, text:'Paiement **2 850 000 CDF** reçu de Boutique Mwana via M-Pesa', ref:'t-004' },
  { t: '11 min', actor:'kn',  cat:'tech'       as const, text:'Déploiement **Kriver v0.4.2** en production · 6 tenants', ref:'kriver' },
  { t: '14 min', actor:'sys', cat:'incident'   as const, text:'⚠ Latence p99 **812ms** sur kelasi-gateway (15 min) — résolu', ref:'kelasi' },
  { t: '22 min', actor:'bt',  cat:'support'    as const, text:'Ticket **#1247** ouvert par École Lumumba — bug génération bulletins', ref:'t-002' },
  { t: '38 min', actor:'jl',  cat:'finance'    as const, text:'a généré la facture **INV-2026-0481** pour Institut Mokili', ref:'t-003' },
  { t: '46 min', actor:'pk',  cat:'commercial' as const, text:'a programmé une démo Kelasi avec **Lycée Mongala** (Kisangani)', ref:null },
  { t: '1 h',    actor:'sys', cat:'finance'    as const, text:'Paiement **47 250 000 CDF** reçu — École Saint-Joseph (Scale)', ref:'t-001' },
  { t: '1 h',    actor:'ad',  cat:'commercial' as const, text:'a ajouté **3 leads** au pipeline (Côte d’Ivoire, Cameroun)', ref:null },
  { t: '2 h',    actor:'kn',  cat:'tech'       as const, text:'Rotation des clés Hydra terminée · 4 realms', ref:null },
  { t: '2 h',    actor:'sys', cat:'finance'    as const, text:'Relance automatique envoyée à **Coopérative Solidaire** (J+23)', ref:'t-016' },
  { t: '3 h',    actor:'cm',  cat:'commercial' as const, text:'a signé **École Sainte-Thérèse** sur le plan Scale', ref:'t-011' },
  { t: '3 h',    actor:'sys', cat:'tech'       as const, text:'NATS cluster — bascule replica leader nodeB → nodeA', ref:null },
  { t: '4 h',    actor:'bt',  cat:'support'    as const, text:'a résolu **5 tickets** (SLA respecté · médiane 38 min)', ref:null },
  { t: '5 h',    actor:'jl',  cat:'finance'    as const, text:'a exporté le rapport **Avril 2026** (comptabilité)', ref:null },
  { t: '6 h',    actor:'pk',  cat:'support'    as const, text:'a partagé un macro WhatsApp à 12 tenants (mise à jour Kelasi)', ref:null },
  { t: '7 h',    actor:'sys', cat:'commercial' as const, text:'**Aïssata** a converti CV Hub Abidjan → Scale', ref:'t-006' },
  { t: '9 h',    actor:'kn',  cat:'tech'       as const, text:'Migration DB Kelasi — partitioning par tenant terminé', ref:'kelasi' },
  { t: '11 h',   actor:'sys', cat:'finance'    as const, text:'Payout Wave **Sénégal** — 8 400 000 CDF', ref:null },
  { t: '13 h',   actor:'bt',  cat:'support'    as const, text:'a fermé **Ticket #1239** — formation bulletins', ref:null },
  { t: '1 j',    actor:'cm',  cat:'tech'       as const, text:'a publié le manifeste **nola.yaml v0.7** sur le registry', ref:null },
  { t: '1 j',    actor:'sys', cat:'commercial' as const, text:'**École Mama Yemo** a complété l’onboarding (étape 6/6)', ref:'t-009' },
  { t: '1 j',    actor:'jl',  cat:'finance'    as const, text:'a réconcilié **34 transactions** mobile money (avril)', ref:null },
];

export const PIPELINE_SEED = [
  { id:'p1',  stage:'prospect'  as const, name:'Lycée Mongala',          country:'CD', amt:1_540_000, owner:'pk', age:'2 j' },
  { id:'p2',  stage:'prospect'  as const, name:'Centre Kibo',            country:'CD', amt:1_400_000, owner:'ad', age:'4 j' },
  { id:'p3',  stage:'prospect'  as const, name:'École Bilingue Akwa',    country:'CM', amt:1_540_000, owner:'ad', age:'5 j' },
  { id:'p4',  stage:'prospect'  as const, name:'Cabinet RH Yaoundé',     country:'CM', amt:4_200_000, owner:'ad', age:'1 j' },
  { id:'d1',  stage:'demo'      as const, name:'Institut Wallengo',      country:'CD', amt:1_540_000, owner:'pk', age:'3 j' },
  { id:'d2',  stage:'demo'      as const, name:'CV Connect Dakar',       country:'SN', amt:1_400_000, owner:'ad', age:'2 j' },
  { id:'d3',  stage:'demo'      as const, name:'École Étoile du Matin',  country:'CD', amt:1_540_000, owner:'pk', age:'6 j' },
  { id:'tr1', stage:'trial'     as const, name:'Boutique Mwana',         country:'CD', amt:1_400_000, owner:'pk', age:'14 j' },
  { id:'tr2', stage:'trial'     as const, name:'Pharmacie Lucie',        country:'CD', amt:1_400_000, owner:'pk', age:'9 j' },
  { id:'tr3', stage:'trial'     as const, name:'École La Source',        country:'CD', amt:1_540_000, owner:'pk', age:'5 j' },
  { id:'s1',  stage:'signed'    as const, name:'École Mama Yemo',        country:'CD', amt:1_400_000, owner:'pk', age:'2 j' },
  { id:'s2',  stage:'signed'    as const, name:'Coopérative Mbote',      country:'CD', amt:1_400_000, owner:'pk', age:'4 j' },
  { id:'o1',  stage:'onboarded' as const, name:'École Sainte-Thérèse',   country:'SN', amt:4_200_000, owner:'cm', age:'7 j' },
  { id:'o2',  stage:'onboarded' as const, name:'CV Pro Dakar',           country:'SN', amt:1_400_000, owner:'ad', age:'12 j' },
];

export const HEALTH_SEED = [
  { id:'kelasi', name:'Kelasi',      uptime:99.98, p50:120, p99:380, errors24h:3, status:'operational' as const },
  { id:'kriver', name:'Kriver',      uptime:99.92, p50: 88, p99:290, errors24h:1, status:'operational' as const },
  { id:'mycv',   name:'MyCVMatcher', uptime:99.99, p50:240, p99:740, errors24h:8, status:'degraded'    as const },
  { id:'stock',  name:'Nola Stock',  uptime:99.86, p50:160, p99:420, errors24h:2, status:'operational' as const },
];

export const TICKETS_SEED = [
  { id:1247, tenant:'t-002', subject:'Bug sur génération bulletins T2', priority:'P1' as const, status:'open' as const,    assignee:'bt', sla:'1h 12m', age:'22 min', ago:'22 min', title:'Bug sur génération bulletins T2', body:'Bonjour, depuis ce matin les bulletins T2 ne se génèrent plus pour la classe 4ème. Erreur "template introuvable".', contact:'Mme Bertine Mukendi', assigned:'bt', replies:[{from:'bt', t:'il y a 8 min', text:'Bonjour Mme Mukendi, on regarde tout de suite. Pouvez-vous nous indiquer la classe concernée ?'}] },
  { id:1246, tenant:'t-008', subject:'Paiement mobile money non détecté', priority:'P1' as const, status:'open' as const,    assignee:'pk', sla:'34 min',  age:'1 h',   ago:'1 h',   title:'Paiement mobile money non détecté', body:'Un paiement Airtel de 1 400 000 CDF n’apparaît pas dans le tableau de bord — référence AM-009166.', contact:'Aimée Bashizi', assigned:'pk', replies:[] },
  { id:1245, tenant:'t-003', subject:'Demande export annuel comptabilité', priority:'P3' as const, status:'pending' as const, assignee:'jl', sla:'8h 11m',  age:'3 h',   ago:'3 h',   title:'Demande export annuel comptabilité', body:'Pouvez-vous générer l’export Sage 2025 sur l’ensemble des factures ?', contact:'Dr. Jean Ilunga', assigned:'jl', replies:[] },
  { id:1244, tenant:'t-013', subject:'Module CV — limite uploads atteinte', priority:'P2' as const, status:'open' as const,    assignee:'bt', sla:'2h 40m',  age:'4 h',   ago:'4 h',   title:'Module CV — limite uploads atteinte', body:'Nous avons dépassé la limite de 500 CV/mois. Quelle est l’option pour upgrade ?', contact:'Pascaline Kemegne', assigned:'bt', replies:[] },
  { id:1243, tenant:'t-001', subject:'Question facture INV-0479', priority:'P3' as const, status:'pending' as const, assignee:'jl', sla:'24h',     age:'7 h',   ago:'7 h',   title:'Question facture INV-0479', body:'Pouvez-vous nous expliquer la ligne « Branding personnalisé » sur la facture d’avril ?', contact:'Père Albert Kabamba', assigned:'jl', replies:[] },
  { id:1242, tenant:'t-005', subject:'Activation module inventaire avancé', priority:'P2' as const, status:'open' as const,    assignee:'pk', sla:'5h',      age:'9 h',   ago:'9 h',   title:'Activation module inventaire avancé', body:'Comment activer le multi-dépôts pour notre stock à Goma ?', contact:'Dr. Alain Bahati', assigned:'pk', replies:[] },
  { id:1241, tenant:'t-007', subject:'Branding personnalisé Kriver', priority:'P3' as const, status:'closed' as const,  assignee:'kn', sla:'—',       age:'1 j',   ago:'1 j',   title:'Branding personnalisé Kriver', body:'—', contact:'Eric Habimana', assigned:'kn', replies:[] },
  { id:1240, tenant:'t-011', subject:'SSO Google Workspace', priority:'P2' as const, status:'closed' as const,  assignee:'kn', sla:'—',       age:'2 j',   ago:'2 j',   title:'SSO Google Workspace', body:'—', contact:'M. Mamadou Sow', assigned:'kn', replies:[] },
];

export const INVOICES_SEED = [
  { id:'INV-2026-0481', tenant:'t-003', amt:28_140_000, due:'2026-05-12', status:'paid'    as const, method:'Orange', issued:'2026-05-01' },
  { id:'INV-2026-0480', tenant:'t-001', amt:47_250_000, due:'2026-05-10', status:'paid'    as const, method:'M-Pesa', issued:'2026-05-01' },
  { id:'INV-2026-0479', tenant:'t-002', amt:23_800_000, due:'2026-05-10', status:'paid'    as const, method:'Airtel', issued:'2026-05-01' },
  { id:'INV-2026-0478', tenant:'t-016', amt: 1_400_000, due:'2026-04-15', status:'overdue' as const, method:'—',      issued:'2026-04-01' },
  { id:'INV-2026-0477', tenant:'t-008', amt: 1_400_000, due:'2026-04-30', status:'late'    as const, method:'—',      issued:'2026-04-15' },
  { id:'INV-2026-0476', tenant:'t-013', amt: 1_400_000, due:'2026-04-26', status:'overdue' as const, method:'—',      issued:'2026-04-12' },
  { id:'INV-2026-0475', tenant:'t-015', amt: 4_620_000, due:'2026-05-15', status:'pending' as const, method:'—',      issued:'2026-05-04' },
  { id:'INV-2026-0474', tenant:'t-011', amt: 4_200_000, due:'2026-05-15', status:'paid'    as const, method:'Wave',   issued:'2026-05-01' },
  { id:'INV-2026-0473', tenant:'t-014', amt: 1_540_000, due:'2026-05-12', status:'paid'    as const, method:'M-Pesa', issued:'2026-05-01' },
  { id:'INV-2026-0472', tenant:'t-006', amt: 4_200_000, due:'2026-05-12', status:'paid'    as const, method:'Orange', issued:'2026-05-02' },
  { id:'INV-2026-0471', tenant:'t-018', amt: 1_400_000, due:'2026-05-12', status:'pending' as const, method:'—',      issued:'2026-05-04' },
];

export const MOMO_SEED = [
  { ts:'08:42',      provider:'M-Pesa' as const, tenant:'t-004', amt: 2_850_000, kind:'in'     as const, ref:'MP-2A91-44' },
  { ts:'08:11',      provider:'Airtel' as const, tenant:'t-002', amt:23_800_000, kind:'in'     as const, ref:'AM-009172' },
  { ts:'07:54',      provider:'Orange' as const, tenant:'t-003', amt:28_140_000, kind:'in'     as const, ref:'OM-554819' },
  { ts:'07:33',      provider:'Wave'   as const, tenant:'t-011', amt: 4_200_000, kind:'in'     as const, ref:'WV-77194Z' },
  { ts:'00:18',      provider:'M-Pesa' as const, tenant:'t-001', amt:47_250_000, kind:'in'     as const, ref:'MP-2A77-12' },
  { ts:'Hier 22:11', provider:'Wave'   as const, tenant:null,    amt: 8_400_000, kind:'payout' as const, ref:'PO-WV-118' },
  { ts:'Hier 19:02', provider:'M-Pesa' as const, tenant:'t-014', amt: 1_540_000, kind:'in'     as const, ref:'MP-1Z03-99' },
  { ts:'Hier 17:48', provider:'Orange' as const, tenant:'t-006', amt: 4_200_000, kind:'in'     as const, ref:'OM-554811' },
  { ts:'Hier 14:30', provider:'Airtel' as const, tenant:'t-005', amt: 1_400_000, kind:'in'     as const, ref:'AM-009166' },
  { ts:'Hier 11:02', provider:'M-Pesa' as const, tenant:null,    amt:14_500_000, kind:'payout' as const, ref:'PO-MP-217' },
  { ts:'Hier 09:14', provider:'MTN'    as const, tenant:'t-007', amt: 1_400_000, kind:'in'     as const, ref:'MTN-44119' },
];

export const MODULES_SEED = [
  { id:'bulletins',     app:'kelasi', label:'Génération bulletins',  default:true,  beta:false },
  { id:'paiement-cdf',  app:'kelasi', label:'Paiement scolarité CDF', default:true,  beta:false },
  { id:'whatsapp-ann',  app:'kelasi', label:'Annonces WhatsApp',      default:true,  beta:false },
  { id:'lms',           app:'kelasi', label:'LMS Élève',              default:false, beta:true  },
  { id:'sso',           app:'kelasi', label:'SSO Google',             default:false, beta:false },
  { id:'inventaire-pro',app:'stock',  label:'Inventaire avancé',      default:false, beta:false },
  { id:'multi-depot',   app:'stock',  label:'Multi-dépôts',           default:false, beta:true  },
  { id:'cv-llm',        app:'mycv',   label:'Matching LLM',           default:true,  beta:false },
  { id:'cv-bulk',       app:'mycv',   label:'Import CSV recruteurs',  default:false, beta:true  },
];

export const DEPLOYS_SEED = [
  { id:'d-921', app:'kriver', version:'0.4.2', env:'production', author:'kn', t:'il y a 11 min', status:'success'     as const, sha:'a91f2e7', changelog:'Tenant isolation + cours en mode hors-ligne' },
  { id:'d-920', app:'kelasi', version:'2.4.1', env:'production', author:'kn', t:'il y a 2 h',    status:'success'     as const, sha:'77b1cd3', changelog:'Patch génération bulletins T2 (RC2)' },
  { id:'d-919', app:'kelasi', version:'2.4.0', env:'staging',    author:'kn', t:'il y a 4 h',    status:'success'     as const, sha:'77b1cb1', changelog:'Refonte vue Owner mobile' },
  { id:'d-918', app:'mycv',   version:'1.2.0', env:'production', author:'cm', t:'hier',          status:'success'     as const, sha:'b22ee05', changelog:'Nouveau scoring + filtres recruteurs' },
  { id:'d-917', app:'stock',  version:'0.9.0', env:'production', author:'kn', t:'2 j',           status:'success'     as const, sha:'1f4a002', changelog:'Multi-dépôts (beta)' },
  { id:'d-916', app:'kelasi', version:'2.3.9', env:'production', author:'kn', t:'3 j',           status:'rolled-back' as const, sha:'77b1ba8', changelog:'Fix N+1 queries' },
];

export const AUDIT_SEED = [
  { ts:'10:42:11', actor:'cm', action:'tenant.suspended',     target:'t-016',           ip:'196.12.44.71', meta:'recouvrement J+23' },
  { ts:'10:38:02', actor:'pk', action:'tenant.plan_changed',  target:'t-009',           ip:'196.12.44.18', meta:'free → growth' },
  { ts:'10:11:55', actor:'kn', action:'deploy.production',    target:'kriver@0.4.2',    ip:'10.0.4.7',     meta:'sha a91f2e7' },
  { ts:'09:54:01', actor:'jl', action:'invoice.created',      target:'INV-2026-0481',   ip:'196.12.44.62', meta:'28 140 000 CDF' },
  { ts:'09:22:18', actor:'cm', action:'auth.key_rotated',     target:'hydra/realm-edu', ip:'10.0.4.7',     meta:'4 realms' },
  { ts:'08:48:09', actor:'pk', action:'broadcast.whatsapp',   target:'macros/upgrade',  ip:'196.12.44.18', meta:'12 tenants' },
];

export const LOGS_SEED = [
  { ts:'10:43:02.118', svc:'kelasi-gateway', lvl:'WARN'  as const, msg:'p99 latency 812ms — pool acquire saturated (15s)' },
  { ts:'10:42:58.201', svc:'kelasi-gateway', lvl:'INFO'  as const, msg:'tenant=t-001 GET /api/v1/students 200 142ms' },
  { ts:'10:42:57.984', svc:'auth-hydra',     lvl:'INFO'  as const, msg:'token issued realm=edu sub=user_91471' },
  { ts:'10:42:57.661', svc:'nats',           lvl:'INFO'  as const, msg:'JetStream consumer kelasi.payments lag=0' },
  { ts:'10:42:55.221', svc:'kelasi-worker',  lvl:'INFO'  as const, msg:'bulletins.generate tenant=t-002 batch=204 ok' },
  { ts:'10:42:50.018', svc:'mycv-llm',       lvl:'INFO'  as const, msg:'embed batch=32 model=text-emb-3 144ms' },
  { ts:'10:42:48.701', svc:'stock-api',      lvl:'ERROR' as const, msg:'tenant=t-008 mobile_money_provider=Airtel callback signature invalid' },
  { ts:'10:42:42.448', svc:'edge-cdn',       lvl:'INFO'  as const, msg:'cache hit ratio 92.8% (kinshasa-pop)' },
];

export function gen(n: number, start: number, end: number, jitter = 0.04): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const base = start + (end - start) * t;
    const j =
      (Math.sin(i * 1.7) + Math.cos(i * 0.6) + Math.sin(i * 3.3) * 0.4) *
      jitter * base;
    out.push(Math.max(0, base + j));
  }
  return out;
}
