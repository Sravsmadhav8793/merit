import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { TwaManifest, TwaGenerator, ConsoleLog } from "@bubblewrap/core";

// Serve the checked-in icon locally so generation does not depend on a web deployment.
const config = JSON.parse(await readFile(new URL("./twa-manifest.json", import.meta.url), "utf8"));
const icon = await readFile(new URL("../public/icon-512.png", import.meta.url));
const webManifest = await readFile(new URL("../public/manifest.webmanifest", import.meta.url));
const server = createServer((req, res) => {
  if (req.url === "/manifest.webmanifest") {
    res.writeHead(200, { "Content-Type": "application/manifest+json" }); res.end(webManifest); return;
  }
  if (req.url !== "/icon.png") { res.writeHead(404).end(); return; }
  res.writeHead(200, { "Content-Type": "image/png" }); res.end(icon);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const localIcon = `http://127.0.0.1:${server.address().port}/icon.png`;
  const manifest = new TwaManifest({ ...config, iconUrl: localIcon, maskableIconUrl: localIcon,
    webManifestUrl: `http://127.0.0.1:${server.address().port}/manifest.webmanifest` });
  const output = fileURLToPath(new URL("./android/", import.meta.url));
  await mkdir(output, { recursive: true });
  await new TwaGenerator().createTwaProject(output, manifest, new ConsoleLog("sravantix"));
  const gradleUrl = new URL("./android/app/build.gradle", import.meta.url);
  const gradle = await readFile(gradleUrl, "utf8");
  await writeFile(gradleUrl, gradle.replaceAll(manifest.webManifestUrl.toString(), config.webManifestUrl));
  const rootGradleUrl = new URL("./android/build.gradle", import.meta.url);
  const rootGradle = await readFile(rootGradleUrl, "utf8");
  await writeFile(rootGradleUrl, rootGradle.replaceAll("jcenter()", "mavenCentral()"));
  // Retain production URLs in generated configuration; no signing keys are generated here.
  await writeFile(new URL("./android/twa-manifest.json", import.meta.url), JSON.stringify(config, null, 2) + "\n");
  console.log(`Generated Android project: ${output}`);
} finally {
  await new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  });
}
