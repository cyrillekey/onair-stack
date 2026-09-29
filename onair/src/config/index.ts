const appConfig = {
  port: process.env.PORT || 8080,
  env: process.env.NODE_ENV,
  logo: process.env.LOGO_URL,
  fallbackImage:
    "https://res.cloudinary.com/ddia14anf/image/upload/v1790427721/onair/onair_logo_background_tr6a8b.png",
};

export default appConfig;
