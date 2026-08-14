/**
 * Grafana solo-panel embed origin.
 * Host/port come from monorepo root `.env` so a Lightsail IP change is one edit.
 * Browser loads the iframe directly — Grafana must be reachable from the client.
 */

const DEFAULT_HOST = '3.36.100.128'
const DEFAULT_PORT = '4000'

export function grafanaOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_GRAFANA_HOST || DEFAULT_HOST).trim().replace(/\/$/, '')
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw
  }
  const port = (process.env.NEXT_PUBLIC_GRAFANA_PORT || DEFAULT_PORT).trim()
  return port ? `http://${raw}:${port}` : `http://${raw}`
}

/** `pathAndQuery` starts with `/d-solo/...` */
export function grafanaEmbed(pathAndQuery: string): string {
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`
  return `${grafanaOrigin()}${path}`
}
