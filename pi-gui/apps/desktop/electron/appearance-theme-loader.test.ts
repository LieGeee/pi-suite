import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
// @ts-ignore Node's strip-types runner requires an explicit TypeScript extension.
import { loadAppearanceThemes } from "./appearance-theme-loader.ts";

test("加载声明式主题、安全颜色变量和主题目录内的本地横幅", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-gui-theme-pack-"));
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "assets", "hero.png"), Buffer.from("89504e470d0a1a0a", "hex"));
  await writeFile(
    join(root, "manifest.json"),
    `${JSON.stringify({
      version: 1,
      themes: [
        {
          id: "miku-dream",
          name: "Miku Dream Pack",
          description: "外部声明式覆盖",
          heroImage: "assets/hero.png",
          variables: {
            "--accent": "#12b8c4",
            "--surface": "rgba(255,255,255,.94)",
            "--unsafe": "url(https://example.invalid/track)",
          },
        },
      ],
    }, null, 2)}\n`,
  );

  const themes = await loadAppearanceThemes(root);
  const miku = themes.find((theme) => theme.id === "miku-dream");
  assert.equal(miku?.name, "Miku Dream Pack");
  assert.equal(miku?.variables?.["--accent"], "#12b8c4");
  assert.equal(miku?.variables?.["--unsafe"], undefined);
  assert.match(miku?.heroImageUrl ?? "", /^file:\/\//);
  assert.deepEqual(themes.map((theme) => theme.id), ["miku-dream", "pure-white", "pi-native"]);
});

test("拒绝主题目录外、远程和不支持格式的横幅", async () => {
  const parent = await mkdtemp(join(tmpdir(), "pi-gui-theme-pack-boundary-"));
  const root = join(parent, "themes");
  await mkdir(root);
  await writeFile(join(parent, "outside.png"), Buffer.from("89504e470d0a1a0a", "hex"));
  await writeFile(join(root, "manifest.json"), JSON.stringify({
    version: 1,
    themes: [
      { id: "outside-theme", name: "Outside", description: "越界", heroImage: "../outside.png" },
      { id: "remote-theme", name: "Remote", description: "远程", heroImage: "https://example.com/hero.png" },
      { id: "svg-theme", name: "SVG", description: "不支持", heroImage: "assets/hero.svg" },
    ],
  }));

  const themes = await loadAppearanceThemes(root);
  assert.equal(themes.find((theme) => theme.id === "outside-theme")?.heroImageUrl, undefined);
  assert.equal(themes.find((theme) => theme.id === "remote-theme")?.heroImageUrl, undefined);
  assert.equal(themes.find((theme) => theme.id === "svg-theme")?.heroImageUrl, undefined);
});

test("主题包缺失或损坏时回退到内置主题", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-gui-theme-pack-invalid-"));
  await writeFile(join(root, "manifest.json"), "not json");

  const themes = await loadAppearanceThemes(root);
  assert.deepEqual(themes.map((theme) => theme.id), ["miku-dream", "pure-white", "pi-native"]);
});
