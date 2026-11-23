/** Generic Onair artwork: channel-poster fallback and addon background. */
const artworkUrl = `${process.env.CENTRAL_URL}${process.env.LOGO_URL || undefined}`;

const appConfig = {
  port: process.env.PORT || 8080,
  env: process.env.NODE_ENV,
  // An empty LOGO_URL must stay `undefined`: the manifest omits the field
  // instead of advertising an empty logo.
  logo: `${process.env.CENTRAL_URL}${process.env.LOGO_URL || undefined}`,
  background: artworkUrl,
  fallbackImage: artworkUrl,
  baseUrl: process.env.CENTRAL_URL,
  signature: process.env.STREMIO_SIGNATURE ?? "",
};

export default appConfig;
