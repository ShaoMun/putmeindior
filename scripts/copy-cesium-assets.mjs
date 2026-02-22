import { mkdir, cp } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.resolve("node_modules/cesium/Build/Cesium");
const targetRoot = path.resolve("public/cesium");
const folders = ["Workers", "Assets", "Widgets", "ThirdParty"];

async function copyCesiumAssets() {
  await mkdir(targetRoot, { recursive: true });

  await Promise.all(
    folders.map(async (folder) => {
      const source = path.join(sourceRoot, folder);
      const target = path.join(targetRoot, folder);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target, { recursive: true });
    }),
  );

  console.log("Cesium static assets copied to public/cesium");
}

copyCesiumAssets().catch((error) => {
  console.error("Failed to copy Cesium assets", error);
  process.exitCode = 1;
});
