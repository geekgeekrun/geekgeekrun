import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const out = {
    flow: '',
    runRecordId: '',
    startedAt: '',
    stoppedAt: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--flow') {
      out.flow = argv[++i] ?? '';
    } else if (current === '--run-record-id') {
      out.runRecordId = argv[++i] ?? '';
    } else if (current === '--started-at') {
      out.startedAt = argv[++i] ?? '';
    } else if (current === '--stopped-at') {
      out.stoppedAt = argv[++i] ?? '';
    }
  }

  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.flow) {
  console.error('missing --flow');
  process.exit(1);
}

const summaryPy = fileURLToPath(new URL('./get-run-stop-summary.py', import.meta.url));
const pythonArgs = [summaryPy, '--flow', args.flow];
if (args.runRecordId) {
  pythonArgs.push('--run-record-id', args.runRecordId);
} else if (args.startedAt && args.stoppedAt) {
  pythonArgs.push('--started-at', args.startedAt, '--stopped-at', args.stoppedAt);
}

const result = spawnSync('python', pythonArgs, { encoding: 'utf8' });
if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exit(result.status ?? 0);
