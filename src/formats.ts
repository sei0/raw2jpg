import path from 'node:path';

export const RAW_EXTENSIONS = new Set([
  '.arw',
  '.cr2',
  '.cr3',
  '.nef',
  '.nrw',
  '.raf',
  '.orf',
  '.rw2',
  '.pef',
  '.srw',
  '.dng',
  '.raw',
  '.3fr',
  '.kdc',
  '.dcr',
  '.erf',
  '.rwl'
]);

export const SIZE_PRESETS = {
  original: undefined,
  '4k': 3840,
  '2k': 2048,
  hd: 1920,
  fhd: 1920
} as const;

export type SizePreset = keyof typeof SIZE_PRESETS;

export function isRawFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return RAW_EXTENSIONS.has(ext);
}

export function supportedFormatsLabel(): string {
  return Array.from(RAW_EXTENSIONS)
    .map((ext) => ext.slice(1).toUpperCase())
    .join(', ');
}
