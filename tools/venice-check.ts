/**
 * Vérification de bout en bout de l'accès à Venice AI.
 *
 *     npm run venice:check
 *
 * Fait un vrai appel réseau à `/chat/completions` avec la clé du `.env`.
 * Sort en code 1 si quoi que ce soit manque : clé absente, API en erreur,
 * réponse vide. Rien d'autre dans le projet ne dépend de ce fichier.
 */

import { VeniceError, chatCompletion, veniceBaseUrl, veniceModel } from '../src/main/venice'

async function main(): Promise<void> {
  console.log(`Venice — ${veniceBaseUrl()}`)
  console.log(`Modèle  — ${veniceModel()}`)
  console.log('')

  const started = Date.now()
  const res = await chatCompletion(
    [
      { role: 'system', content: 'Tu réponds en français, en une seule phrase courte.' },
      { role: 'user', content: 'Confirme que tu réponds, et nomme le modèle que tu es.' }
    ],
    { maxTokens: 800, temperature: 0.2 }
  )
  const elapsed = Date.now() - started

  console.log(`Réponse (${elapsed} ms, modèle servi : ${res.model})`)
  console.log(`  ${res.text.trim()}`)
  const { promptTokens, completionTokens, totalTokens } = res.usage
  if (totalTokens != null) {
    console.log(`Jetons  — ${promptTokens ?? '?'} + ${completionTokens ?? '?'} = ${totalTokens}`)
  }
  if (res.reasoning != null) {
    console.log(`Raisonnement — ${res.reasoning.length} caractères (non affiché)`)
  }
  if (res.finishReason != null && res.finishReason !== 'stop') {
    console.log(`Arrêt   — ${res.finishReason} (réponse possiblement tronquée)`)
  }
  console.log('')
  console.log('OK — la clé, l’URL de base et le modèle répondent.')
}

main().catch((err: unknown) => {
  const message = err instanceof VeniceError || err instanceof Error ? err.message : String(err)
  console.error(`ÉCHEC — ${message}`)
  process.exitCode = 1
})
