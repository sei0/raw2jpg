import { execFile, spawn } from 'node:child_process';
import { createWriteStream, type Stats } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { RAW_EXTENSIONS, SIZE_PRESETS, type SizePreset, isRawFile, supportedFormatsLabel } from './formats.js';
import { ProgressTracker, printInfo, printWarning } from './utils.js';

const execFileAsync = promisify(execFile);

export interface ConversionOptions {
  inputPath: string;
  outputDir: string;
  quality: number;
  width?: number;
  height?: number;
  sizePreset: SizePreset;
  overwrite: boolean;
  dryRun: boolean;
  verbose: boolean;
}

export interface ConversionResult {
  totalFiles: number;
  converted: number;
  failed: number;
  skipped: number;
  totalInputBytes: number;
  totalOutputBytes: number;
  outputDir: string;
  backend: 'sips' | 'dcraw';
  failures: Array<{ file: string; error: string }>;
}

interface ResizePlan {
  width?: number;
  height?: number;
  maxDimension?: number;
}

function cleanErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function resolveResizePlan(options: ConversionOptions): ResizePlan {
  if (options.width || options.height) {
    return {
      width: options.width,
      height: options.height,
      maxDimension: Math.max(options.width ?? 0, options.height ?? 0) || undefined
    };
  }

  const presetValue = SIZE_PRESETS[options.sizePreset];
  if (presetValue !== undefined) {
    return {
      maxDimension: presetValue
    };
  }

  return {};
}

async function commandExists(command: string): Promise<boolean> {
  const locator = process.platform === 'win32' ? 'where' : 'which';
  try {
    await execFileAsync(locator, [command]);
    return true;
  } catch {
    return false;
  }
}

async function detectBackend(): Promise<'sips' | 'dcraw'> {
  if (process.platform === 'darwin' && (await commandExists('sips'))) {
    return 'sips';
  }

  if (await commandExists('dcraw')) {
    return 'dcraw';
  }

  if (await commandExists('sips')) {
    return 'sips';
  }

  throw new Error(
    'No RAW converter found. Install dcraw: brew install dcraw (macOS) / apt install dcraw (Linux). macOS users can also use the built-in sips command.'
  );
}

async function collectRawFiles(inputPath: string): Promise<string[]> {
  let inputStats: Stats;
  try {
    inputStats = await stat(inputPath);
  } catch {
    throw new Error(`Input path does not exist: ${inputPath}`);
  }

  if (inputStats.isFile()) {
    return isRawFile(inputPath) ? [path.resolve(inputPath)] : [];
  }

  if (!inputStats.isDirectory()) {
    throw new Error(`Input path is not a file or directory: ${inputPath}`);
  }

  const files: string[] = [];
  const queue: string[] = [path.resolve(inputPath)];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    if (!currentDir) {
      continue;
    }

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (RAW_EXTENSIONS.has(ext)) {
          files.push(entryPath);
        }
      }
    }
  }

  files.sort();
  return files;
}

function outputFilePath(inputRoot: string, inputFile: string, outputDir: string, preserveStructure: boolean): string {
  const normalized = preserveStructure
    ? (() => {
        const rootStatsPath = path.resolve(inputRoot);
        const relative = path.relative(rootStatsPath, inputFile);
        return relative.startsWith('..') ? path.basename(inputFile) : relative;
      })()
    : path.basename(inputFile);
  const extension = path.extname(normalized);
  const base = normalized.slice(0, normalized.length - extension.length);
  return path.join(outputDir, `${base}.jpg`);
}

async function convertWithSips(inputFile: string, outputFile: string, quality: number, plan: ResizePlan): Promise<void> {
  await mkdir(path.dirname(outputFile), { recursive: true });

  const args: string[] = ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality)];
  if (plan.maxDimension) {
    args.push('-Z', String(plan.maxDimension));
  }
  args.push(inputFile, '--out', outputFile);

  await execFileAsync('sips', args);
}

async function convertWithDcraw(inputFile: string, outputFile: string, quality: number, plan: ResizePlan): Promise<void> {
  await mkdir(path.dirname(outputFile), { recursive: true });

  const dcrawProcess = spawn('dcraw', ['-c', '-w', '-W', inputFile], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const stderrChunks: Buffer[] = [];
  dcrawProcess.stderr.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });

  const transformer = sharp();
  if (plan.width || plan.height) {
    transformer.resize({
      width: plan.width,
      height: plan.height,
      fit: 'inside',
      withoutEnlargement: true
    });
  } else if (plan.maxDimension) {
    transformer.resize({
      width: plan.maxDimension,
      height: plan.maxDimension,
      fit: 'inside',
      withoutEnlargement: true
    });
  }
  transformer.jpeg({ quality, mozjpeg: true });

  const sink = createWriteStream(outputFile);

  const exitCodePromise = new Promise<number>((resolve, reject) => {
    dcrawProcess.on('error', reject);
    dcrawProcess.on('close', resolve);
  });

  const [exitCode] = await Promise.all([
    exitCodePromise,
    pipeline(dcrawProcess.stdout, transformer, sink)
  ]);

  if (exitCode !== 0) {
    const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim();
    throw new Error(stderrText || `dcraw exited with code ${exitCode}`);
  }
}

export async function convertRawFiles(options: ConversionOptions): Promise<ConversionResult> {
  const rawFiles = await collectRawFiles(options.inputPath);
  if (rawFiles.length === 0) {
    throw new Error(
      `No RAW files found in ${options.inputPath}. Supported formats: ${supportedFormatsLabel()}`
    );
  }

  const backend = await detectBackend();
  const inputRoot = path.resolve(options.inputPath);
  const outputDir = path.resolve(options.outputDir);
  const inputStats = await stat(inputRoot);
  const preserveStructure = inputStats.isDirectory();
  const plan = resolveResizePlan(options);

  if (!options.dryRun) {
    await mkdir(outputDir, { recursive: true });
  }

  if (options.verbose) {
    printInfo(`Using backend: ${backend}`);
  }

  const progress = new ProgressTracker();
  if (!options.dryRun) {
    progress.start(rawFiles.length);
  }

  let converted = 0;
  let failed = 0;
  let skipped = 0;
  let totalInputBytes = 0;
  let totalOutputBytes = 0;
  const failures: Array<{ file: string; error: string }> = [];

  for (let index = 0; index < rawFiles.length; index += 1) {
    const inputFile = rawFiles[index];
    const filename = path.basename(inputFile);
    const outputFile = outputFilePath(inputRoot, inputFile, outputDir, preserveStructure);

    const sourceStats = await stat(inputFile);
    totalInputBytes += sourceStats.size;

    if (options.dryRun) {
      printInfo(`[dry-run] ${inputFile} -> ${outputFile}`);
      converted += 1;
      continue;
    }

    let exists = false;
    try {
      await stat(outputFile);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists && !options.overwrite) {
      skipped += 1;
      if (options.verbose) {
        printWarning(`Skipping existing file: ${outputFile}`);
      }
      progress.update(index + 1, filename);
      continue;
    }

    try {
      if (backend === 'sips') {
        await convertWithSips(inputFile, outputFile, options.quality, plan);
      } else {
        await convertWithDcraw(inputFile, outputFile, options.quality, plan);
      }

      const outputStats = await stat(outputFile);
      totalOutputBytes += outputStats.size;
      converted += 1;
    } catch (error) {
      failed += 1;
      failures.push({ file: inputFile, error: cleanErrorMessage(error) });
      printWarning(`Failed to convert ${inputFile}: ${cleanErrorMessage(error)}`);

      try {
        await unlink(outputFile);
      } catch {
      }
    }

    progress.update(index + 1, filename);
  }

  if (!options.dryRun) {
    progress.stop();
  }

  return {
    totalFiles: rawFiles.length,
    converted,
    failed,
    skipped,
    totalInputBytes,
    totalOutputBytes,
    outputDir,
    backend,
    failures
  };
}
