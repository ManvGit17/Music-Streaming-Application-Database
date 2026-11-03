// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightOpenAPI, { openAPISidebarGroups } from "starlight-openapi";

const repo = "https://github.com/ManvGit17/Music-Streaming-Application-Database";

export default defineConfig({
  site: "https://manvgit17.github.io",
  // GitHub Pages serves the docs next to the demo; the workflow sets DOCS_BASE.
  base: process.env.DOCS_BASE ?? "/docs",
  integrations: [
    starlight({
      title: "VaMusic",
      description:
        "Documentation for VaMusic, a music streaming app built database-first on PostgreSQL 18.",
      logo: {
        light: "./src/assets/wordmark-light.svg",
        dark: "./src/assets/wordmark-dark.svg",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: repo }],
      editLink: { baseUrl: `${repo}/edit/master/site/` },
      customCss: [
        "@fontsource-variable/inter",
        "@fontsource-variable/fraunces",
        "./src/styles/theme.css",
      ],
      lastUpdated: false,
      plugins: [
        starlightOpenAPI([
          { base: "api", schema: "./openapi.json", sidebar: { label: "API reference" } },
        ]),
      ],
      sidebar: [
        { label: "Start here", items: [{ autogenerate: { directory: "start" } }] },
        { label: "Concepts", items: [{ autogenerate: { directory: "concepts" } }] },
        { label: "Guides", items: [{ autogenerate: { directory: "guides" } }] },
        ...openAPISidebarGroups,
        { label: "FAQ", link: "/faq/" },
      ],
    }),
  ],
});
