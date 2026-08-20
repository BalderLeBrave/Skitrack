/**
 * Extracteur DOM Orchestra — booking.chamonix.com (Ceto / PMB)
 *
 * SEE tools/lib/chamonix/ — this entrypoint re-exports the CLI.
 * Full implementation is split across modules under tools/lib/chamonix/
 * to keep GitHub API payloads small.
 *
 * Usage:
 *   node tools/extract-chamonix.mjs --type hotel --location cmb.houches --with-reviews
 */

import { runCli } from './lib/chamonix/cli.mjs'

runCli(process.argv)
