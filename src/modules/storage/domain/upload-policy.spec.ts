import { checkUpload, safeFilename, UPLOAD_POLICIES, UploadRejectedError } from './upload-policy';

const PDF = Buffer.from('%PDF-1.7\n%\xe2\xe3', 'latin1');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const EXE = Buffer.from('MZ\x90\x00\x03\x00', 'latin1');

describe('upload policy', () => {
  it('accepts a PDF CV by its content and reports the real type', () => {
    expect(
      checkUpload(UPLOAD_POLICIES.CV, { size: 1000, head: PDF, originalName: 'cv.pdf' }),
    ).toEqual({ kind: 'pdf', mime: 'application/pdf', extension: 'pdf' });
  });

  it('ignores the claimed name: an executable renamed to .pdf is rejected', () => {
    expect(() =>
      checkUpload(UPLOAD_POLICIES.CV, { size: 1000, head: EXE, originalName: 'cv.pdf' }),
    ).toThrow(UploadRejectedError);
  });

  it('accepts DOCX only when the ZIP container is declared as .docx', () => {
    expect(
      checkUpload(UPLOAD_POLICIES.CV, { size: 1000, head: ZIP, originalName: 'cv.docx' }).kind,
    ).toBe('docx');
    expect(() =>
      checkUpload(UPLOAD_POLICIES.CV, { size: 1000, head: ZIP, originalName: 'archive.zip' }),
    ).toThrow(UploadRejectedError);
  });

  it('enforces size limits and rejects empty files', () => {
    const over = UPLOAD_POLICIES.CV.maxBytes + 1;
    expect(() =>
      checkUpload(UPLOAD_POLICIES.CV, { size: over, head: PDF, originalName: 'cv.pdf' }),
    ).toThrow(/larger than 5 MB/);
    expect(() =>
      checkUpload(UPLOAD_POLICIES.CV, { size: 0, head: PDF, originalName: 'cv.pdf' }),
    ).toThrow(/empty/);
  });

  it('applies each policy’s own type list', () => {
    expect(() =>
      checkUpload(UPLOAD_POLICIES.LESSON_RESOURCE, {
        size: 10,
        head: PNG,
        originalName: 'x.png',
      }),
    ).toThrow(UploadRejectedError);
    expect(
      checkUpload(UPLOAD_POLICIES.PAYMENT_PROOF, { size: 10, head: PNG, originalName: 'x.png' })
        .kind,
    ).toBe('png');
  });

  it('produces safe download filenames', () => {
    expect(safeFilename('../../etc/passwd', 'pdf')).toBe('....etcpasswd');
    expect(safeFilename('My CV (final).pdf', 'pdf')).toBe('My CV final.pdf');
    expect(safeFilename('<<>>', 'pdf')).toBe('file.pdf');
  });
});
