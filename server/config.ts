const DEFAULT_PORT = 3000;

export function getServerPort(env: { PORT?: string } = process.env): number {
  const raw = env.PORT?.trim();
  if (!raw) return DEFAULT_PORT;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }
  return port;
}
