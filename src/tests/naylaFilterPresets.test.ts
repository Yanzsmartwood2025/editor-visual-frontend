import { describe, expect, it } from 'vitest';
import { NAYLA_FILTER_PRESETS, NAYLA_FILTER_PRESET_NAMES, getNaylaFilterCssFilter } from '../lib/naylaFilterPresets';
import { parseNaylaAction } from '../lib/naylaActions';
import { parseNaylaDirectInstruction } from '../lib/naylaDirectInstructions';
import { NAYLA_EDITOR_FEATURE_CATALOG, getNaylaFeatureCatalogTotal } from '../lib/naylaFeatureCatalog';

describe('Nayla filter presets and visible catalog', () => {
  it('publishes every requested filter as a deterministic preset', () => {
    const expected = [
      'cool-blue', 'warm', 'teal-orange', 'noir', 'desaturated-drama', 'horror-green',
      'dreamy', 'faded-film', 'cyberpunk', 'moonlight', 'sunset', 'bleach-bypass',
      'purple-night', 'blue-fire',
    ];

    for (const id of expected) {
      expect(NAYLA_FILTER_PRESET_NAMES).toContain(id);
      expect(getNaylaFilterCssFilter(id)).toBeTruthy();
    }

    expect(NAYLA_FILTER_PRESETS.find((preset) => preset.id === 'none')?.cssFilter).toBe('');
  });

  it('accepts new filters through BUILD_TIMELINE and @direct', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [{ type: 'foto', source: 'label', label: 'F1', durationInSeconds: 5, efecto: 'purple-night' }],
      render: true,
    }));

    expect(action?.action).toBe('BUILD_TIMELINE');
    if (action?.action === 'BUILD_TIMELINE') {
      expect(action.assets[0].efecto).toBe('purple-night');
    }

    const direct = parseNaylaDirectInstruction(`@direct
assets:
- F1 | 5s | blue-fire | fade | 0.4s
`);
    expect(direct.ok).toBe(true);
    if (direct.ok) {
      expect(direct.plan.action.assets[0].efecto).toBe('blue-fire');
    }
  });

  it('uses the same active sources in the visible feature catalog', () => {
    const filters = NAYLA_EDITOR_FEATURE_CATALOG.find((category) => category.id === 'filters');
    const subtitles = NAYLA_EDITOR_FEATURE_CATALOG.find((category) => category.id === 'subtitles');

    expect(filters?.items.map((item) => item.id)).toContain('teal-orange');
    expect(filters?.items.map((item) => item.id)).toContain('blue-fire');
    expect(subtitles?.items.map((item) => item.id)).toContain('extrude-3d');
    expect(getNaylaFeatureCatalogTotal()).toBeGreaterThan(50);
  });
});
