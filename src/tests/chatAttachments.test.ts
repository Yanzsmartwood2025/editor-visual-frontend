import { describe, expect, it } from 'vitest';
import { isSupportedDocumentFile, resolveMediaKind } from '../lib/mediaUpload';

const fakeFile = (name: string, type: string) => ({ name, type });

describe('Nayla chat attachment types', () => {
  it('recognizes photo, video and audio files', () => {
    expect(resolveMediaKind(fakeFile('foto.jpg', 'image/jpeg'))).toBe('foto');
    expect(resolveMediaKind(fakeFile('clip.mp4', 'video/mp4'))).toBe('video');
    expect(resolveMediaKind(fakeFile('voz.m4a', 'audio/mp4'))).toBe('audio');
  });

  it('recognizes supported documents independently from timeline media', () => {
    expect(isSupportedDocumentFile(fakeFile('guion.pdf', 'application/pdf'))).toBe(true);
    expect(isSupportedDocumentFile(fakeFile('notas.txt', 'text/plain'))).toBe(true);
    expect(isSupportedDocumentFile(fakeFile('datos.csv', 'text/csv'))).toBe(true);
    expect(isSupportedDocumentFile(fakeFile('guion.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe(true);
    expect(resolveMediaKind(fakeFile('guion.pdf', 'application/pdf'))).toBeNull();
  });

  it('rejects unknown document extensions', () => {
    expect(isSupportedDocumentFile(fakeFile('archivo.exe', 'application/octet-stream'))).toBe(false);
  });
});
