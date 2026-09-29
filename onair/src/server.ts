#!/usr/bin/env node

import "dotenv/config";
import "@/utils/instrument.js";
import { serveHTTP } from "@/stremio.js";
import { addonInterface } from "@/addon.js";

const port = Number(process.env.PORT ?? 8080);
serveHTTP(addonInterface, { port });

// When you've deployed your add-on, uncomment this line:
// publishToCentral("https://my-addon.awesome/manifest.json");
// For more information on deploying, see:
// https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/deploying/README.md
