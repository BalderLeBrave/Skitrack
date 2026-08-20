import { buildEngine } from '../src/main/providers/index'
const e = buildEngine({ enableWebScrape: true, vault: () => undefined, mcpSources: null })
const map = (e as unknown as { providers: Map<string, unknown> }).providers
console.log('providers enregistrés (' + map.size + '):', [...map.keys()].join(', '))
