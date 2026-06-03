// Runs under `bun test`: exercises the REAL vault accessors against bun:sqlite —
// {{environment.ENV.KEY}} (explicit) and {{env.KEY}} (flow default), plus the
// masking that must scrub resolved values from any emitted snapshot, and the
// fail-loud behavior when a secret/env is missing.
import { describe, it, expect, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

process.env.DSTP_SECRET_KEY = 'test-master-key-vault-ctx'

const { EnvironmentRepository } = await import('../db')
const { FlowRepository } = await import('../db')
const { installVaultAccessors } = await import('./vault-context')
const { maskSecrets, __resetGlobalSecrets } = await import('./vault-mask')
const { resolveValue } = await import('./expressions')

// Each test gets its own server id (=> its own sqlite file) for isolation.
const createdServers: string[] = []
let counter = 0
function freshServer(): string {
  const s = `__test_vaultctx_${Date.now()}_${counter++}`
  createdServers.push(s)
  return s
}

afterAll(() => {
  for (const s of createdServers) {
    for (const suffix of ['', '-shm', '-wal']) {
      try { rmSync(join(process.cwd(), 'data', `${s}.sqlite`) + suffix) } catch { /* ignore */ }
    }
  }
})

function seed() {
  const SERVER = freshServer()
  const repo = new EnvironmentRepository(SERVER)
  const prodId = repo.createEnvironment('prod')
  repo.setSecret(prodId, 'OPENAI_KEY', 'sk-openai-REAL-VALUE-1234')
  const devId = repo.createEnvironment('dev')
  repo.setSecret(devId, 'OPENAI_KEY', 'sk-dev-OTHER-VALUE-5678')
  return { prodId, devId, repo, SERVER }
}

describe('vault accessors — explicit {{environment.ENV.KEY}}', () => {
  it('resolves the real decrypted value at execution time', () => {
    __resetGlobalSecrets()
    const { SERVER } = seed()
    const ctx: Record<string, any> = { _flowId: 'flow-x', _serverId: SERVER }
    installVaultAccessors(ctx, SERVER)
    expect(resolveValue('{{environment.prod.OPENAI_KEY}}', ctx)).toBe('sk-openai-REAL-VALUE-1234')
    // a different env resolves its own value
    expect(resolveValue('{{environment.dev.OPENAI_KEY}}', ctx)).toBe('sk-dev-OTHER-VALUE-5678')
  })

  it('masks the resolved value out of an emitted snapshot', () => {
    __resetGlobalSecrets()
    const { SERVER } = seed()
    const ctx: Record<string, any> = { _flowId: 'flow-x', _serverId: SERVER }
    installVaultAccessors(ctx, SERVER)
    const used = resolveValue('{{environment.prod.OPENAI_KEY}}', ctx)
    expect(used).toBe('sk-openai-REAL-VALUE-1234')
    // simulate a node storing the resolved value in context, then logging it
    const snapshot = { node_1: { apiKey: used }, note: `key=${used}` }
    const masked = maskSecrets(snapshot, ctx)
    expect(masked.node_1.apiKey).toBe('***')
    expect(masked.note).toBe('key=***')
    expect(JSON.stringify(masked)).not.toContain('sk-openai-REAL-VALUE-1234')
  })

  it('throws a clear error for a missing secret key', () => {
    __resetGlobalSecrets()
    const { SERVER } = seed()
    const ctx: Record<string, any> = { _flowId: 'flow-x', _serverId: SERVER }
    installVaultAccessors(ctx, SERVER)
    expect(() => resolveValue('{{environment.prod.DOES_NOT_EXIST}}', ctx))
      .toThrow(/Secret not found/)
  })

  it('throws for an unknown environment', () => {
    __resetGlobalSecrets()
    const { SERVER } = seed()
    const ctx: Record<string, any> = { _flowId: 'flow-x', _serverId: SERVER }
    installVaultAccessors(ctx, SERVER)
    expect(() => resolveValue('{{environment.nope.OPENAI_KEY}}', ctx))
      .toThrow(/Secret not found/)
  })
})

describe('vault accessors — flow default {{env.KEY}}', () => {
  it('resolves from the flow default environment', () => {
    __resetGlobalSecrets()
    const { prodId, SERVER } = seed()
    // Create a flow whose default environment is "prod".
    const flowRepo = new FlowRepository(SERVER)
    flowRepo.save({
      id: 'flow-default', name: 'f', enabled: true,
      nodes: [], edges: [], defaultEnvironmentId: prodId,
    })

    const ctx: Record<string, any> = { _flowId: 'flow-default', _serverId: SERVER }
    installVaultAccessors(ctx, SERVER)
    expect(resolveValue('{{env.OPENAI_KEY}}', ctx)).toBe('sk-openai-REAL-VALUE-1234')
  })

  it('throws a clear error when the flow has no default environment', () => {
    __resetGlobalSecrets()
    const { SERVER } = seed()
    const ctx: Record<string, any> = { _flowId: 'flow-without-default', _serverId: SERVER }
    installVaultAccessors(ctx, SERVER)
    // flow row doesn't exist → no default → clear failure, never silent
    expect(() => resolveValue('{{env.OPENAI_KEY}}', ctx))
      .toThrow(/no default environment|Secret not found/)
  })
})

describe('vault accessors — vault disabled', () => {
  it('throws VaultDisabledError when DSTP_SECRET_KEY is absent', async () => {
    __resetGlobalSecrets()
    const { SERVER } = seed()
    const saved = process.env.DSTP_SECRET_KEY
    delete process.env.DSTP_SECRET_KEY
    try {
      const ctx: Record<string, any> = { _flowId: 'flow-x', _serverId: SERVER }
      installVaultAccessors(ctx, SERVER)
      expect(() => resolveValue('{{environment.prod.OPENAI_KEY}}', ctx)).toThrow()
    } finally {
      process.env.DSTP_SECRET_KEY = saved
    }
  })
})
