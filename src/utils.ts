import chalk from 'chalk';
import cliProgress from 'cli-progress';

export interface ConversionSummary {
  converted: number;
  failed: number;
  totalInputBytes: number;
  totalOutputBytes: number;
  outputDir: string;
}

export class ProgressTracker {
  private readonly bar: cliProgress.SingleBar;

  constructor() {
    this.bar = new cliProgress.SingleBar(
      {
        format: 'Converting [{bar}] {value}/{total} | {filename} | ETA: {eta}s',
        hideCursor: true,
        clearOnComplete: true,
        barsize: 20
      },
      cliProgress.Presets.shades_classic
    );
  }

  start(total: number): void {
    this.bar.start(total, 0, { filename: '-' });
  }

  update(value: number, filename: string): void {
    this.bar.update(value, { filename });
  }

  stop(): void {
    this.bar.stop();
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const precision = value >= 10 || exponent === 0 ? 0 : 1;

  return `${value.toFixed(precision)} ${units[exponent]}`;
}

export function printSummary(summary: ConversionSummary): void {
  const compressionRatio =
    summary.totalInputBytes > 0
      ? Math.max(0, Math.round((1 - summary.totalOutputBytes / summary.totalInputBytes) * 100))
      : 0;

  console.log(chalk.green('✓ Conversion complete!'));
  console.log('');
  console.log(`  Files converted:  ${summary.converted}`);
  console.log(`  Total input size: ${formatBytes(summary.totalInputBytes)}`);
  console.log(`  Total output size: ${formatBytes(summary.totalOutputBytes)}`);
  console.log(`  Compression ratio: ${compressionRatio}%`);
  console.log(`  Output directory:  ${summary.outputDir}`);

  if (summary.failed > 0) {
    console.log('');
    console.log(chalk.yellow(`Completed with failures: ${summary.converted} succeeded, ${summary.failed} failed`));
  }
}

export function printError(message: string): void {
  console.error(chalk.red(`Error: ${message}`));
}

export function printWarning(message: string): void {
  console.warn(chalk.yellow(message));
}

export function printInfo(message: string): void {
  console.log(chalk.cyan(message));
}
