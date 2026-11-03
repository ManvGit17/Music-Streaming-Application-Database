// GitHub Pages has no rewrite rules: serving index.html as 404.html lets deep links load the app.
import { copyFileSync } from "node:fs";

copyFileSync("dist/index.html", "dist/404.html");
