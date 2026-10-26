import fp from "fastify-plugin";
import { db } from "@/prisma/db";
import { join } from "path";
import ejs from "ejs";
import { existsSync, readFileSync } from "fs";
import appConfig from "@/config";
import { minify } from "html-minifier-terser";

declare module "fastify" {
  interface FastifyInstance {
    ejs: {
      compile: (
        template: string,
        data: Record<string, unknown>,
      ) => Promise<string>;
    };
  }
}
const GITHUB_URL = "https://github.com/cyrillekey/onair-stack";
const DESCRIPTION =
  "Onair is a self-hosted Stremio addon for live TV with a native EPG, 16 catalog rails, and health-checked streams.";
function resolveTemplatePath(template: string): string {
  // Development runs from the project root; the production image keeps the
  // templates next to the compiled plugin inside dist.
  const roots = [
    join(process.cwd(), "src", "templates"),
    join(__dirname, "..", "templates"),
  ];
  const relative = join(template) + ".ejs";
  const match = roots
    .map((root) => join(root, relative))
    .find((candidate) => existsSync(candidate));
  return match ?? join(roots[0], relative);
}
function compiledTemplate(path: string): ejs.TemplateFunction {
  const html = ejs.compile(readFileSync(path, "utf8"), {
    filename: path,
  });
  return html;
}

async function compileEjs(
  template: string,
  _data: Record<string, unknown>,
): Promise<string> {
  const path = resolveTemplatePath(template);
  if (!existsSync(path)) {
    return "";
  }
  const data = {
    ..._data,
    title: "Onair",
    description: DESCRIPTION,
    logo: appConfig.logo ?? appConfig.background,
    customLogo: appConfig.logo,
    githubUrl: GITHUB_URL,
    docsUrl: "/api/documentation",
    configureUrl: "/configure",
    baseUrl: appConfig.baseUrl,
    year: new Date().getFullYear(),
  };
  const minified = await minify(compiledTemplate(path)(data), {
    removeComments: true,
    collapseWhitespace: true,
    removeEmptyAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    removeRedundantAttributes: true,
  });
  return minified;
}

export default fp(
  async (fastify) => {
    fastify.decorate("ejs", {
      compile: compileEjs,
    });
    fastify.addHook("onClose", async () => {
      await db.close();
    });
  },
  { name: "ejs" },
);
