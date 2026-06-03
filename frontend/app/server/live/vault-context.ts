// Vault integration for the flow execution context.
//
// Injects two lazy-resolving accessors into a flow's context so templates can
// reference encrypted secrets WITHOUT the engine ever holding plaintext eagerly:
//
//   {{environment.<env>.<KEY>}}  → explicit: secret KEY from environment <env>
//   {{env.<KEY>}}                → from the flow's DEFAULT environment
//                                  (flows.defaultEnvironmentId)
//
// Decryption happens only when a given path is actually read (lazy), at the
// moment the node executes. Every value handed out is recorded in a per-run
// "sink" so it can be masked (***) everywhere observable: traces, capture, logs.
//
// resolveValue (expressions.ts) stays a pure function — it just walks plain
// objects. The laziness/decryption lives here, behind property getters.

import { EnvironmentRepository, FlowRepository } from '../db'
import { isVaultEnabled, VaultDisabledError } from '../services/SecretCrypto'
import { getSink, recordSecret, maskSecrets, type SecretSink } from './vault-mask'

// Re-export the pure masking helpers so existing importers (FlowEngine) keep
// importing from vault-context.
export { maskSecrets, type SecretSink }

// Resolve+record a secret. Throws a clear error when the vault is off or the
// secret is missing, so a misconfigured node fails loudly instead of silently
// running the AI with no key.
function takeSecret(
  repo: EnvironmentRepository,
  sink: SecretSink,
  lookup: () => string | undefined,
  label: string,
): string {
  if (!isVaultEnabled()) throw new VaultDisabledError()
  let plain: string | undefined
  try {
    plain = lookup()
  } catch (e: any) {
    throw new Error(`Failed to decrypt ${label}: ${e?.message ?? e}`)
  }
  if (plain === undefined) throw new Error(`Secret not found: ${label}`)
  recordSecret(sink, plain)
  return plain
}

// Install the `environment` and `env` accessors onto a flow context (mutates it).
// Uses property getters that build nested proxies on demand — nothing is read
// from the DB until a concrete `{{environment.x.y}}` / `{{env.y}}` is evaluated.
export function installVaultAccessors(context: Record<string, any>, serverId: string): void {
  const repo = new EnvironmentRepository(serverId)
  const sink = getSink(context)

  // Resolve the flow's default environment id lazily (only if {{env.x}} is used).
  // Read from the flow row identified by context._flowId.
  const flowId: string | undefined = context._flowId
  const defaultEnvId = (): number | null => {
    if (!flowId) return null
    const flow = new FlowRepository(serverId).findById(flowId)
    return (flow?.defaultEnvironmentId ?? null) as number | null
  }

  // {{environment.<envName>.<KEY>}}
  Object.defineProperty(context, 'environment', {
    enumerable: false,
    configurable: true,
    get() {
      return new Proxy({}, {
        get(_t, envName: string) {
          if (typeof envName !== 'string') return undefined
          return new Proxy({}, {
            get(_t2, key: string) {
              if (typeof key !== 'string') return undefined
              return takeSecret(
                repo, sink,
                () => repo.getSecretDecrypted(envName, key),
                `environment.${envName}.${key}`,
              )
            },
          })
        },
      })
    },
  })

  // {{env.<KEY>}} — from the flow's default environment
  Object.defineProperty(context, 'env', {
    enumerable: false,
    configurable: true,
    get() {
      return new Proxy({}, {
        get(_t, key: string) {
          if (typeof key !== 'string') return undefined
          return takeSecret(
            repo, sink,
            () => {
              const envId = defaultEnvId()
              if (envId == null) {
                throw new Error('flow has no default environment set')
              }
              return repo.getSecretByEnvId(envId, key)
            },
            `env.${key}`,
          )
        },
      })
    },
  })
}
