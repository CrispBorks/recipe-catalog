/** GET /api/ping — confirms serverless functions are running on this
 *  deployment at all. Useful when /api/import misbehaves: if this answers and
 *  that one doesn't, the problem is in the importer rather than the platform. */

type Res = { status: (code: number) => Res; json: (body: unknown) => void };

export default function handler(_req: unknown, res: Res) {
  res.status(200).json({ ok: true, runtime: process.version });
}
