import { describe, expect, it } from 'vitest';
import { isSupportedModel3DFile } from '../lib/model3d';

describe('3D asset validation', () => {
  it('accepts GLB by extension or MIME type', () => {
    expect(isSupportedModel3DFile({ name: 'character.glb', type: '' })).toBe(true);
    expect(isSupportedModel3DFile({ name: 'character.bin', type: 'model/gltf-binary' })).toBe(true);
  });

  it('rejects formats that the web viewer cannot safely load as a standalone asset yet', () => {
    expect(isSupportedModel3DFile({ name: 'character.gltf', type: 'model/gltf+json' })).toBe(false);
    expect(isSupportedModel3DFile({ name: 'character.fbx', type: 'application/octet-stream' })).toBe(false);
    expect(isSupportedModel3DFile({ name: 'character.obj', type: 'text/plain' })).toBe(false);
  });
});
