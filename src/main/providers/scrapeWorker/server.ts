/**
 * HTTP d’un worker de relevé. Un process, une SOURCE, un port.
 *
 *   SOURCE=gites-web PORT=8080 node scrape/dist/worker.mjs
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { scrapeAirbnbSearch } from '../airbnb/scrape'
import { isWorkerSource, type WorkerSource } from './protocol'
import { createWorkerProvider } from './factory'

const sourceRaw = process.env.SOURCE ?? ''
if (!isWorkerSource(sourceRaw)) {
  process.stderr.write(
    `SOURCE invalide « ${sourceRaw} ». Attendu : booking-web | gites-web | vrbo-web | airbnb | station-web\n`
  )
  process.exit(1)
}
const source: WorkerSource = sourceRaw
const port = Number(process.env.PORT ?? 8080)

const lodging = source === 'airbnb' ? null : createWorkerProvider(source)

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 1_000_000) {
        reject(new Error('corps trop grand'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(json)
}

const server = createServer((req, res) => {
  void (async () => {
    const url = req.url?.split('?')[0] ?? '/'
    if (req.method === 'GET' && url === '/health') {
      send(res, 200, { ok: true, source, isolated: true })
      return
    }
    if (req.method === 'POST' && url === '/search') {
      const raw = await readBody(req)
      const params = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      if (source === 'airbnb') {
        const out = await scrapeAirbnbSearch({
          city: String(params.city ?? params.destination ?? ''),
          checkIn: params.checkIn as string | undefined,
          checkOut: params.checkOut as string | undefined,
          adults: params.adults as number | undefined,
          children: params.children as number | undefined,
          infants: params.infants as number | undefined,
          pets: params.pets as number | undefined,
          minPrice: params.minPrice as number | undefined,
          maxPrice: params.maxPrice as number | undefined,
          bedrooms: params.bedrooms as number | undefined,
          scrollCount: params.scrollCount as number | undefined,
          maxRetries: params.maxRetries as number | undefined,
          timeoutMs: params.timeoutMs as number | undefined,
          bounds: params.bounds as never
        })
        send(res, out.ok ? 200 : 502, out)
        return
      }
      if (!lodging) {
        send(res, 500, { ok: false, error: 'connecteur absent' })
        return
      }
      const results = await lodging.search(params as never)
      send(res, 200, { ok: true, results })
      return
    }
    send(res, 404, { ok: false, error: 'inconnu' })
  })().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) send(res, 500, { ok: false, error: message })
  })
})

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`skitrack-scrape ${source} :${port}\n`)
})
