import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const STAGE_MAP_UID = 'api::recruitly-stage-map.recruitly-stage-map';
const AUTO_ROWS = 'Rows are added automatically from Recruitly. Do not create rows here: open an existing row and change only Portal Stage.';

// Labels and help text shown on the Recruitly Stage Mapping screens. The fields
// Recruitly owns can still be edited (Parag, 17 Nov); the help text says to change only Portal Stage.
const STAGE_MAP_FIELDS: Record<string, { label: string; description: string; editable: boolean; placeholder?: string }> = {
  stageName: { label: 'Recruitly stage', description: AUTO_ROWS, editable: true },
  recruitlyStatus: { label: 'Recruitly group', description: 'The main Recruitly stage this sub-stage belongs to.', editable: true },
  portalStage: {
    label: 'Portal stage',
    description: 'What clients see for candidates at this Recruitly stage. Empty = the agreed default. Applies to the next import, within a minute.',
    editable: true,
  },
  stageId: { label: 'Recruitly stage ID', description: 'Fixed ID from Recruitly. Renaming the stage in Recruitly keeps this mapping.', editable: true },
  note: { label: 'Note', description: '', editable: true, placeholder: AUTO_ROWS },
};

async function configureStageMapScreens(strapi: Core.Strapi) {
  const store = strapi.store({ type: 'plugin', name: 'content_manager_configuration' });
  const key = `content_types::${STAGE_MAP_UID}`;
  const config = (await store.get({ key })) as any;
  if (!config?.metadatas) return;

  for (const [field, wanted] of Object.entries(STAGE_MAP_FIELDS)) {
    const meta = config.metadatas[field];
    if (!meta) continue;
    meta.edit = { ...meta.edit, label: wanted.label, description: wanted.description, editable: wanted.editable, placeholder: wanted.placeholder ?? meta.edit?.placeholder ?? '' };
    meta.list = { ...meta.list, label: wanted.label };
  }
  config.settings = { ...config.settings, mainField: 'stageName', defaultSortBy: 'stageName', defaultSortOrder: 'ASC' };
  await store.set({ key, value: config });
}

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    // Recruitly Stage Mapping: rows are added by the portal (its API token) from
    // Recruitly's stage list. A row created or duplicated in the admin panel would
    // do nothing, so the admin panel may only edit existing rows.
    strapi.documents.use(async (context, next) => {
      if (context.uid === STAGE_MAP_UID && (context.action === 'create' || context.action === 'clone')) {
        const request = strapi.requestContext.get() as any;
        if (request?.state?.auth?.strategy?.name === 'admin') {
          throw new errors.ApplicationError(AUTO_ROWS);
        }
      }
      return next();
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    try {
      await configureStageMapScreens(strapi);
    } catch (error) {
      strapi.log.warn(`[RECRUITLY_STAGES] Admin screen labels not set: ${(error as Error)?.message}`);
    }
  },
};
