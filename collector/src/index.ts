import { parseM3U } from "./utils/urlparser.js";

async function main() {
  const content = await parseM3U(
    "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_us.m3u",
  );
  console.log(content);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
