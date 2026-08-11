import { readFile } from "node:fs/promises";

const NAME = "@earendil-works/pi-coding-agent";
const VERSION = "0.84.0";
const INTEGRITY = "sha512-oxEU7BT9xuVT6UKNwUNDzNP5dVGb+DZRGfaEyMyAab8dRlqTSxxyhSlMAxmYsu//YOeasj9E8n2+px1BzIai0g==";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const dependency = manifest.dependencies?.[NAME];
const locked = lock.packages?.[`node_modules/${NAME}`];

if (dependency !== VERSION) throw new Error(`${NAME} must be pinned exactly to ${VERSION}; found ${String(dependency)}`);
if (lock.packages?.[""]?.dependencies?.[NAME] !== VERSION) throw new Error(`root lock dependency for ${NAME} drifted`);
if (locked?.version !== VERSION) throw new Error(`${NAME} lock version drifted: ${String(locked?.version)}`);
if (locked?.resolved !== `https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-${VERSION}.tgz`) throw new Error(`${NAME} resolved artifact drifted`);
if (locked?.integrity !== INTEGRITY) throw new Error(`${NAME} integrity drifted`);

console.log(`${NAME}@${VERSION} lock integrity verified`);
