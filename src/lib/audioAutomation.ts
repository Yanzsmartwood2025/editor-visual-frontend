import { z } from 'zod';

// Seconds are relative to the clip's placement, not the source file or each loop.
export const volumeKeyframesSchema = z.array(z.object({
  time: z.number().min(0).max(7200),
  gain: z.number().min(0).max(1),
}).strict()).min(2).max(200).superRefine((points, ctx) => {
  for (let i = 1; i < points.length; i++) {
    if (points[i].time <= points[i - 1].time) {
      ctx.addIssue({ code: 'custom', path: [i, 'time'], message: 'Los tiempos deben ser estrictamente crecientes.' });
    }
  }
});
export type VolumeKeyframe = z.infer<typeof volumeKeyframesSchema>[number];

export const getAutomatedGain = (points: VolumeKeyframe[] | undefined, seconds: number): number => {
  if (!points?.length) return 1;
  if (seconds <= points[0].time) return points[0].gain;
  for (let i = 1; i < points.length; i++) {
    if (seconds <= points[i].time) {
      const previous = points[i - 1];
      const progress = (seconds - previous.time) / (points[i].time - previous.time);
      return previous.gain + (points[i].gain - previous.gain) * progress;
    }
  }
  return points[points.length - 1].gain;
};
