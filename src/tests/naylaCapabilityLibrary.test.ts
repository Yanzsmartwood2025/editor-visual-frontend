import { describe, expect, it } from 'vitest';
import { EDITOR_BOOKS, EDITOR_LIBRARY_VERSION, parseEditorSession, readEditorBooks } from '../lib/naylaCapabilityLibrary';
import { parseNaylaAction } from '../lib/naylaActions';

describe('consultable capability books', () => {
  for (const book of EDITOR_BOOKS) {
    it(`validates the executable example and real controls for ${book.id}`, () => {
      expect(parseNaylaAction(JSON.stringify(book.example))).not.toBeNull();
      const chapter = readEditorBooks([book.id])[0];
      expect(chapter.contract).toBeDefined();
      for (const value of Object.values(chapter.contract)) expect(value).toBeDefined();
      if ('assetControls' in chapter.contract) {
        for (const key of book.assetFields) expect((chapter.contract.assetControls as any)[key]).toBeDefined();
      }
    });
  }
  it('retrieves only the chosen categories, while retaining the complete option list', () => {
    const chapters = readEditorBooks(['captions']);
    expect(chapters.map(c => c.id)).toEqual(['captions']);
    expect(JSON.stringify(chapters)).toContain('karaoke');
    expect(JSON.stringify(chapters)).not.toContain('cameraDistance');
    expect(chapters[0].guide).toContain('Arial');
  });
  it('rejects imaginary capabilities and outdated sessions', () => {
    const session = { version: EDITOR_LIBRARY_VERSION, chapters: ['three'], brief: 'Giro suave elegido; iluminación pendiente.', mode: 'explore' };
    expect(parseEditorSession(JSON.stringify(session))).toEqual(session);
    expect(parseEditorSession(JSON.stringify({ ...session, chapters: ['anything-3d'] }))).toBeNull();
    expect(parseEditorSession(JSON.stringify({ ...session, version: 'old' }))).toBeNull();
  });
});
