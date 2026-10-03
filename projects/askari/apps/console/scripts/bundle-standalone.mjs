import { cp, access, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = resolve(root, ".next/standalone");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findServerDirectory(base, depth = 0) {
  if (await exists(join(base, "server.js"))) {
    return base;
  }
  if (depth >= 4) {
    return null;
  }
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".next") {
      continue;
    }
    const found = await findServerDirectory(join(base, entry.name), depth + 1);
    if (found) {
      return found;
    }
  }
  return null;
}

if (!(await exists(standalone))) {
  console.error("bundle-standalone: .next/standalone is missing; is output set to standalone?");
  process.exit(1);
}

const target = await findServerDirectory(standalone);

if (!target) {
  console.error("bundle-standalone: no server.js under .next/standalone");
  process.exit(1);
}

await cp(resolve(root, ".next/static"), resolve(target, ".next/static"), { recursive: true });

if (await exists(resolve(root, "public"))) {
  await cp(resolve(root, "public"), resolve(target, "public"), { recursive: true });
}

console.log(`bundle-standalone: static assets copied beside ${target.replace(root, ".")}/server.js`);
