import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const port = Number(process.env.PORT ?? 4173)
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname)
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "")
  const target = path.resolve(repoRoot, relative)
  if (!target.startsWith(`${repoRoot}${path.sep}`) || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404)
    response.end("Not found")
    return
  }
  response.writeHead(200, { "Content-Type": mimeTypes[path.extname(target)] ?? "application/octet-stream" })
  createReadStream(target).pipe(response)
}).listen(port, "127.0.0.1", () => {
  console.log(`Dataset preview: http://127.0.0.1:${port}`)
})
