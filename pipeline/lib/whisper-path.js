// Resolves the directory containing the `whisper-cli` binary.
//
// `whisper.cpp` builds typically install outside the system PATH, so we
// prepend a known location to PATH for child processes. Override the default
// with the HYPERFRAMES_WHISPER_DIR env var if your install is elsewhere.

const DEFAULT_WIN32 = 'C:\\tools\\whisper';

export function whisperBinDir() {
  if (process.env.HYPERFRAMES_WHISPER_DIR) return process.env.HYPERFRAMES_WHISPER_DIR;
  if (process.platform === 'win32') return DEFAULT_WIN32;
  return null;
}

export function withWhisperOnPath(env = process.env) {
  const dir = whisperBinDir();
  if (!dir) return { ...env };
  const sep = process.platform === 'win32' ? ';' : ':';
  const path = env.PATH ?? env.Path ?? '';
  if (path.split(sep).includes(dir)) return { ...env };
  return { ...env, PATH: `${dir}${sep}${path}` };
}
