import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const mediaDir = resolve(process.env.QRS_MEDIA_DIR || join(root, "media-data"));
const limits = { image: 10_000_000, audio: 25_000_000 };
const host = process.env.QRS_HOST || "127.0.0.1";
const port = Number(process.env.QRS_PORT || process.env.PORT || 3000);

const startsWith = (bytes, signature, offset = 0) => (
  bytes.subarray(offset, offset + signature.length).toString("latin1") === signature
);

const mediaFormats = {
  png: { mime: "image/png", valid: (b) => startsWith(b, "\x89PNG\r\n\x1a\n") },
  jpg: { mime: "image/jpeg", valid: (b) => startsWith(b, "\xff\xd8\xff") },
  webp: { mime: "image/webp", valid: (b) => startsWith(b, "RIFF") && startsWith(b, "WEBP", 8) },
  gif: { mime: "image/gif", valid: (b) => startsWith(b, "GIF87a") || startsWith(b, "GIF89a") },
  mp3: { mime: "audio/mpeg", valid: (b) => startsWith(b, "ID3") || (b.length >= 4 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  wav: { mime: "audio/wav", valid: (b) => startsWith(b, "RIFF") && startsWith(b, "WAVE", 8) },
  ogg: { mime: "audio/ogg", valid: (b) => startsWith(b, "OggS") },
  m4a: { mime: "audio/mp4", valid: (b) => startsWith(b, "ftyp", 4) },
  flac: { mime: "audio/flac", valid: (b) => startsWith(b, "fLaC") },
};
const formatsByMime = new Map(Object.entries(mediaFormats).map(([extension, format]) => [format.mime, { extension, ...format }]));
const staticTypes = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2", ".png": "image/png", ".txt": "text/plain; charset=utf-8",
};

function json(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

async function upload(request, response, type) {
  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite && fetchSite !== "same-origin") return json(response, 403, { error: "Abra o gerador para enviar um arquivo." });

  const format = formatsByMime.get(request.headers["content-type"]);
  if (!format?.mime.startsWith(`${type}/`)) return json(response, 415, { error: "Formato de arquivo incompatível." });
  const limit = limits[type];
  const sizeError = { error: `O arquivo deve ter até ${limit / 1_000_000} MB.` };
  if (Number(request.headers["content-length"]) > limit) return json(response, 413, sizeError);

  const name = `${randomUUID().replaceAll("-", "")}.${format.extension}`;
  const temporary = join(mediaDir, `${name}.part`);
  const file = await open(temporary, "wx");
  let size = 0;
  let signature = Buffer.alloc(0);

  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > limit) {
        response.setHeader("Connection", "close");
        return json(response, 413, sizeError);
      }
      if (signature.length < 16) signature = Buffer.concat([signature, chunk.subarray(0, 16 - signature.length)]);
      await file.writeFile(chunk);
    }
    if (!format.valid(signature)) return json(response, 415, { error: "O conteúdo não corresponde ao formato do arquivo escolhido." });

    await file.close();
    await rename(temporary, join(mediaDir, name));
    json(response, 201, { path: `/media/${name}` });
  } finally {
    await file.close();
    await rm(temporary, { force: true });
  }
}

function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return start >= 0 && start <= end ? { start, end } : null;
}

async function serveFile(request, response, path, mime, isMedia = false) {
  const file = await stat(path);
  if (!file.isFile()) return json(response, 404, { error: "Arquivo não encontrado." });
  const headers = {
    "Content-Type": mime,
    "Content-Length": file.size,
    "Cache-Control": isMedia ? "private, max-age=86400" : "no-cache",
  };
  let range;
  if (isMedia) {
    headers["Accept-Ranges"] = "bytes";
    if (request.headers.range) {
      range = byteRange(request.headers.range, file.size);
      if (!range) {
        response.writeHead(416, { "Content-Range": `bytes */${file.size}` });
        return response.end();
      }
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${file.size}`;
      headers["Content-Length"] = range.end - range.start + 1;
    }
  }

  response.writeHead(range ? 206 : 200, headers);
  if (request.method === "HEAD") return response.end();
  await pipeline(createReadStream(path, range), response);
}

const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");

  try {
    const { pathname } = new URL(request.url, "http://localhost");
    const uploadRoute = /^\/media\/(image|audio)$/.exec(pathname);
    if (request.method === "POST" && uploadRoute) return await upload(request, response, uploadRoute[1]);
    if (request.method !== "GET" && request.method !== "HEAD") return json(response, 405, { error: "Método indisponível." });
    if (pathname === "/media") return json(response, 200, { uploads: true });

    const mediaRoute = /^\/media\/([a-f0-9]{32}\.([a-z0-9]+))$/.exec(pathname);
    if (mediaRoute && Object.hasOwn(mediaFormats, mediaRoute[2])) {
      return await serveFile(request, response, join(mediaDir, mediaRoute[1]), mediaFormats[mediaRoute[2]].mime, true);
    }

    const staticPath = pathname === "/" ? "index.html" : pathname.slice(1);
    const type = staticTypes[extname(staticPath)];
    if (type && (/^(index\.html|app\.js|styles\.css)$/.test(staticPath) || /^assets\/[\w.-]+$/.test(staticPath))) {
      return await serveFile(request, response, join(root, staticPath), type);
    }
    json(response, 404, { error: "Arquivo não encontrado." });
  } catch (error) {
    if (response.destroyed) return;
    if (response.headersSent) return response.destroy();
    if (error.code === "ENOENT") return json(response, 404, { error: "Arquivo não encontrado." });
    console.error(error);
    json(response, 500, { error: "Não foi possível concluir a operação. Tente novamente." });
  }
});

await mkdir(mediaDir, { recursive: true });
server.listen(port, host, () => {
  console.log(`QRs Code em http://${host}:${server.address().port}`);
});
