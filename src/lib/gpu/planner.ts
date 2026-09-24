import { GPU_VIDEO_RECIPE, validateGpuVideoInput } from './videoContract';
import { getGpuProfile, type GpuWorkload } from './profiles';
import {
  getGpuRecipePlan,
  validateRecipeInputs,
  type GpuRecipePlan,
} from './recipes';

export type GpuExecutionInput = {
  workload: GpuWorkload;
  recipe?: string;
  prompt?: string;
  inputUrls?: string[];
  options?: Record<string, unknown>;
};

export type ResolvedGpuExecutionPlan = {
  profile: ReturnType<typeof getGpuProfile>;
  recipePlan: GpuRecipePlan | null;
  workerImage?: string;
};

export const resolveGpuExecutionPlan = (
  input: GpuExecutionInput
): ResolvedGpuExecutionPlan => {
  if (input.recipe === GPU_VIDEO_RECIPE) {
    if (input.workload !== 'video') throw new Error('La receta requiere video.');
    validateGpuVideoInput(input);
  }
  const genericProfile = getGpuProfile(input.workload);
  const recipePlan = getGpuRecipePlan(input.workload, input.recipe);

  if (recipePlan) {
    validateRecipeInputs(recipePlan, input.inputUrls || []);
  }

  const profile = recipePlan
    ? {
        ...recipePlan.profile,
        // Una receta nunca puede relajar el tope global configurado.
        maxHourlyUsd: Math.min(
          recipePlan.profile.maxHourlyUsd,
          genericProfile.maxHourlyUsd
        ),
      }
    : genericProfile;

  return {
    profile,
    recipePlan,
    workerImage: recipePlan?.workerImage || profile.workerImage,
  };
};
