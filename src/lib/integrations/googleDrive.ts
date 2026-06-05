export type GoogleDriveConfig = {
  folderPrefix?: string
  connected?: boolean
  google_email?: string
}

export const DEFAULT_GOOGLE_DRIVE_CONFIG: GoogleDriveConfig = {
  folderPrefix: 'Clients',
}

export function parseGoogleDriveConfig(raw: Record<string, unknown> | null | undefined): GoogleDriveConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_GOOGLE_DRIVE_CONFIG }
  return {
    folderPrefix: typeof raw.folderPrefix === 'string' ? raw.folderPrefix : DEFAULT_GOOGLE_DRIVE_CONFIG.folderPrefix,
    connected: raw.connected === true,
    google_email: typeof raw.google_email === 'string' ? raw.google_email : undefined,
  }
}

export function isGoogleDriveConnected(config: GoogleDriveConfig): boolean {
  return config.connected === true
}
