/** Generic Onair artwork: channel-poster fallback and addon background. */
const artworkUrl =
  "https://res.cloudinary.com/ddia14anf/image/upload/v1790427721/onair/onair_logo_background_tr6a8b.png";

const appConfig = {
  port: process.env.PORT || 8080,
  env: process.env.NODE_ENV,
  // An empty LOGO_URL must stay `undefined`: the manifest omits the field
  // instead of advertising an empty logo.
  logo: process.env.LOGO_URL || undefined,
  background: artworkUrl,
  fallbackImage: artworkUrl,
};

export default appConfig;
