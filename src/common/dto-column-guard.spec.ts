import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as path from 'path';
import { getMetadataArgsStorage } from 'typeorm';
import { WorkItem } from '../work-items/work-item.entity';
import { WorkItemSubtask } from '../work-items/work-item-subtask.entity';

/**
 * Un DTO ne promet jamais plus long que la colonne qui reçoit.
 *
 * Quand le validateur accepte 500 caractères et que la colonne en tient 200,
 * la requête passe la porte pour mourir en base : « value too long for type
 * character varying(200) ». L'erreur remonte en 500, loin du champ fautif, et
 * l'interface propose gentiment de recommencer.
 *
 * Ce n'est pas une hypothèse : trois DTO studio promettaient 500 contre une
 * colonne de 200, et le formulaire de création posait `maxLength={500}` sur son
 * champ — il invitait à déclencher la panne.
 *
 * La borne de la colonne est lue dans l'entité, pas recopiée : élargir la
 * colonne relâche la garde toute seule, la rétrécir la resserre.
 */
const RACINE = path.join(__dirname, '..');

const CIBLES = [
  { fichier: 'studio/dto/create-task.dto.ts', classe: 'CreateTaskDto', entite: WorkItem },
  { fichier: 'studio/dto/update-task.dto.ts', classe: 'UpdateTaskDto', entite: WorkItem },
  { fichier: 'studio/dto/create-meeting-task.dto.ts', classe: 'CreateMeetingTaskDto', entite: WorkItem },
  { fichier: 'work-items/dto/work-item.dto.ts', classe: 'CaptureWorkItemDto', entite: WorkItem },
  { fichier: 'work-items/dto/work-item.dto.ts', classe: 'CreateWorkItemDto', entite: WorkItem },
  { fichier: 'work-items/dto/work-item.dto.ts', classe: 'UpdateWorkItemDto', entite: WorkItem },
  { fichier: 'work-items/dto/work-item.dto.ts', classe: 'AddWorkItemSubtaskDto', entite: WorkItemSubtask },
  { fichier: 'work-items/dto/work-item.dto.ts', classe: 'UpdateWorkItemSubtaskDto', entite: WorkItemSubtask },
] as const;

function longueurColonne(entite: Function, champ: string): number {
  const colonne = getMetadataArgsStorage().columns.find(
    (c) => c.target === entite && c.propertyName === champ,
  );
  const longueur = (colonne?.options as { length?: number | string } | undefined)?.length;
  if (longueur === undefined) throw new Error(`${entite.name}.${champ} n'a pas de longueur déclarée`);
  return Number(longueur);
}

/** Le bloc d'une classe : de sa déclaration à l'accolade de la suivante. */
function borneDuTitre(fichier: string, classe: string): number {
  const source = readFileSync(path.join(RACINE, fichier), 'utf8');
  const debut = source.indexOf(`export class ${classe} `);
  if (debut < 0) throw new Error(`${classe} introuvable dans ${fichier}`);
  const suivante = source.indexOf('\nexport class ', debut + 1);
  const bloc = source.slice(debut, suivante < 0 ? undefined : suivante);
  const trouve = /@MaxLength\((\d+)\)\s+title/.exec(bloc);
  if (!trouve) throw new Error(`${classe} : aucun @MaxLength sur « title »`);
  return Number(trouve[1]);
}

describe('un DTO ne promet jamais plus long que sa colonne', () => {
  for (const cible of CIBLES) {
    test(`${cible.classe}.title tient dans ${cible.entite.name}.title`, () => {
      const colonne = longueurColonne(cible.entite, 'title');
      expect(borneDuTitre(cible.fichier, cible.classe)).toBeLessThanOrEqual(colonne);
    });
  }
});
