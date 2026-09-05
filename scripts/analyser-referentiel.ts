/**
 * Analyse des documents et écrit le résultat en JSON, pour qu'on puisse le
 * comparer d'une version du parser à l'autre.
 *
 *   bun run scripts/analyser-referentiel.ts ~/refs/D*.md > avant.json
 *   git switch ma-branche
 *   bun run scripts/analyser-referentiel.ts ~/refs/D*.md > apres.json
 *   diff avant.json apres.json
 *
 * Les tests unitaires prouvent que le parser fait ce qu'on lui demande sur des
 * documents écrits pour lui. Ceci répond à l'autre question, celle qu'aucune
 * fixture ne pose : « qu'est-ce que ce changement fait aux documents réels,
 * ceux que personne n'a écrits en pensant à ce test ? »
 *
 * Deux défauts sont sortis de là, qu'aucune fixture n'aurait montrés : deux
 * stories dépassaient 200 caractères sans qu'on le voie, parce qu'on les
 * mesurait à travers le parser qui les tronquait ; et l'empreinte d'un titre
 * long ne dépendait pas de ce qui suivait la coupe, donc une correction au-delà
 * du 200e caractère passait pour « inchangée ».
 *
 * Un diff vide vaut donc quelque chose : il dit que le changement ne touche que
 * ce qu'il prétend toucher. Un diff non vide n'est pas un échec — c'est la
 * question « est-ce bien ce que je voulais ? », posée avant le déploiement
 * plutôt qu'après.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseExecutionReference, summarize } from '../src/execution-references/execution-reference.parser';

const fichiers = process.argv.slice(2);
if (fichiers.length === 0) {
  console.error('usage: bun run scripts/analyser-referentiel.ts <fichier.md> [...]');
  process.exit(1);
}

const sortie = fichiers.map((f) => {
  const parsed = parseExecutionReference(readFileSync(f, 'utf8'));
  return {
    document: basename(f),
    counts: summarize(parsed),
    issues: parsed.issues,
    // Trié par clé : l'ordre du document ne doit pas faire de bruit dans le
    // diff, seul le contenu compte.
    items: [...parsed.items].sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
  };
});

console.log(JSON.stringify(sortie, null, 2));
