export type HubSpotConfig = {
  apiKey: string
  createDeal?: boolean
}

export const DEFAULT_HUBSPOT_CONFIG: HubSpotConfig = {
  apiKey: '',
  createDeal: false,
}
