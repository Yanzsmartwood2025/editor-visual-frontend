import { z } from 'zod';
import { getAvailableEmojis } from '@remotion/animated-emoji';
import * as sounds from '@remotion/sfx';
import { parsePath } from '@remotion/paths';
export const EMOJI_NAMES = getAvailableEmojis().map(item => item.name);
export const SOUND_NAMES = Object.keys(sounds) as Array<keyof typeof sounds>;
export const fontFields = {
  fontFamily: z.enum(['Arial', 'Roboto', 'Montserrat', 'Playfair Display', 'custom']).optional().default('Arial'),
  fontUrl: z.string().url().max(4000).optional(),
};
export const fontSelectionSchema = z.object(fontFields).refine(item => item.fontFamily !== 'custom' || Boolean(item.fontUrl), 'Una fuente personalizada necesita fontUrl.');
const common = {
  start: z.number().min(0).max(7200), end: z.number().min(0).max(7200),
  x: z.number().min(0).max(100).optional().default(50), y: z.number().min(0).max(100).optional().default(50),
  width: z.number().min(20).max(3840).optional().default(300), height: z.number().min(20).max(3840).optional().default(300),
  opacity: z.number().min(0).max(1).optional().default(1),
};
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const text = { text: z.string().min(1).max(500), color: color.optional().default('#ffffff'), fontSize: z.number().min(16).max(180).optional().default(64), ...fontFields };
const path = z.string().min(1).max(2000).refine(value => { try { return parsePath(value).length > 0; } catch { return false; } }, 'Trazado SVG inválido');
export const decorationSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('emoji'), emoji: z.enum(EMOJI_NAMES), playbackRate: z.number().min(0.1).max(4).optional().default(1) }),
  z.object({ ...common, kind: z.literal('gif'), url: z.string().url().max(4000).optional(), label: z.string().regex(/^F\d+$/i).optional(), mediaId: z.string().uuid().optional(), playbackRate: z.number().min(0.1).max(4).optional().default(1) }),
  z.object({ ...common, ...text, kind: z.literal('annotation'), mark: z.enum(['underline', 'highlight', 'circle', 'box', 'strike-through', 'crossed-off']), accentColor: color.optional().default('#fbbf24') }),
  z.object({ ...common, ...text, kind: z.literal('text-box'), backgroundColor: color.optional().default('#111827') }),
  z.object({ ...common, kind: z.literal('svg-path'), path, color: color.optional().default('#7dd3fc'), strokeWidth: z.number().min(1).max(30).optional().default(4) }),
  z.object({ ...common, kind: z.literal('svg-3d'), path, color: color.optional().default('#7dd3fc'), depth: z.number().min(1).max(100).optional().default(20), rotationSpeed: z.number().min(-180).max(180).optional().default(24) }),
  z.object({ ...common, kind: z.literal('starburst'), rays: z.number().int().min(3).max(100).optional().default(12), colors: z.array(color).min(2).max(6).optional().default(['#111827', '#7dd3fc']) }),
  z.object({ ...common, kind: z.literal('sfx'), sound: z.enum(SOUND_NAMES), volume: z.number().min(0).max(1).optional().default(0.6) }),
]).superRefine((item, ctx) => {
  if (item.kind === 'gif' && !item.url && !item.label) ctx.addIssue({ code: 'custom', message: 'El GIF necesita etiqueta F o URL.' });
  if (item.end <= item.start) ctx.addIssue({ code: 'custom', message: 'El final debe ser posterior al inicio.' });
  if ('fontFamily' in item && item.fontFamily === 'custom' && !item.fontUrl) ctx.addIssue({ code: 'custom', message: 'Una fuente personalizada necesita fontUrl.' });
});
export const decorationsSchema = z.array(decorationSchema).max(60);
export type NaylaDecoration = z.infer<typeof decorationSchema>;
