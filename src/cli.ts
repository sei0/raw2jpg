#!/usr/bin/env node

import chalk from 'chalk';
import { Command, InvalidArgumentError } from 'commander';
import { convertRawFiles } from './converter.js';
import { SIZE_PRESETS, type SizePreset } from './formats.js';
import { printError, printSummary } from './utils.js';

interface CliOptions {
  output: string;
  quality: number;
  width?: number;
  height?: number;
  size: SizePreset;
  overwrite: boolean;
  dryRun: boolean;
  verbose: boolean;
}

function parseIntegerOption(value: string, optionName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`${optionName} must be a positive integer`);
  }
  return parsed;
}

function parseQuality(value: string): number {
  const parsed = parseIntegerOption(value, 'Quality');
  if (parsed < 1 || parsed > 100) {
    throw new InvalidArgumentError('Quality must be between 1 and 100');
  }
  return parsed;
}

function parseSize(value: string): SizePreset {
  if (value in SIZE_PRESETS) {
    return value as SizePreset;
  }
  throw new InvalidArgumentError('Size preset must be one of: original, 4k, 2k, hd, fhd');
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('raw2jpg')
    .description('Convert camera RAW files (ARW, CR2, CR3, NEF, RAF, ORF, DNG, etc.) to JPEG')
    .version('1.0.0', '-V, --version', 'Show version')
    .helpOption('-h, --help', 'Show help')
    .argument('<input>', 'Input directory or file path')
    .option('-o, --output <dir>', 'Output directory', './jpg_output')
    .option('-q, --quality <number>', 'JPEG quality 1-100', parseQuality, 90)
    .option('-w, --width <number>', 'Max width in pixels (maintains aspect ratio)', (value) =>
      parseIntegerOption(value, 'Width')
    )
    .option('--height <number>', 'Max height in pixels (maintains aspect ratio)', (value) =>
      parseIntegerOption(value, 'Height')
    )
    .option(
      '-s, --size <preset>',
      'Size preset: "original", "4k", "2k", "hd", "fhd"',
      parseSize,
      'original'
    )
    .option('--overwrite', 'Overwrite existing files', false)
    .option('--dry-run', 'Show what would be converted without converting', false)
    .option('-v, --verbose', 'Verbose output', false)
    .showHelpAfterError(true);

  program.parse();

  const input = program.args[0] as string;
  const options = program.opts<CliOptions>();

  if ((options.width || options.height) && options.size !== 'original') {
    throw new InvalidArgumentError('Use width/height or size preset, not both');
  }

  const result = await convertRawFiles({
    inputPath: input,
    outputDir: options.output,
    quality: options.quality,
    width: options.width,
    height: options.height,
    sizePreset: options.size,
    overwrite: options.overwrite,
    dryRun: options.dryRun,
    verbose: options.verbose
  });

  if (options.dryRun) {
    console.log(chalk.green('✓ Dry-run complete!'));
    console.log(`Would process ${result.totalFiles} file(s) using backend: ${result.backend}`);
    return;
  }

  printSummary({
    converted: result.converted,
    failed: result.failed,
    totalInputBytes: result.totalInputBytes,
    totalOutputBytes: result.totalOutputBytes,
    outputDir: result.outputDir
  });

  if (result.skipped > 0) {
    console.log(chalk.yellow(`Skipped existing files: ${result.skipped}`));
  }

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  printError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
