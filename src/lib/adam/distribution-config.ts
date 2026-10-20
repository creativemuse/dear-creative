/** Distribution channel enablement configuration */
export const DISTRIBUTION_CHANNELS = {
  x: true,
  farcaster: process.env.FARCASTER_ENABLED === "true",
  discord: Boolean(process.env.DISCORD_WEBHOOK_URL?.trim()),
  orb: Boolean(process.env.ORB_API_TOKEN?.trim() && process.env.ORB_PUBLICATION_ID?.trim()),
} as const;

export type DistributionChannel = keyof typeof DISTRIBUTION_CHANNELS;

export function getEnabledChannels(): DistributionChannel[] {
  return (Object.entries(DISTRIBUTION_CHANNELS) as [DistributionChannel, boolean][])
    .filter(([, enabled]) => enabled)
    .map(([channel]) => channel);
}

export function isChannelEnabled(channel: DistributionChannel): boolean {
  return DISTRIBUTION_CHANNELS[channel] === true;
}