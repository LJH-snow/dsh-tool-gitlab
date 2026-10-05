/**
 * Fail-closed destination validation for an operator-configured API endpoint.
 *
 * GENERATED FILE — the canonical .verify/url-security.template.ts plus the
 * self-hosting-aware policy layer in .verify/url-security-b.append.ts. Do not edit
 * by hand. The address lists are shared verbatim with the A-class variant, so the
 * two cannot drift apart in what they consider blocked.
 */
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { LookupAddress } from 'node:dns'

const LABEL = 'GitLab'

export type LookupImpl = (hostname: string, options: { all: true }) => Promise<LookupAddress[]>

export class EndpointSecurityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EndpointSecurityError'
  }
}

const defaultLookup: LookupImpl = async (hostname, options) => dnsLookup(hostname, options)

/** Aligned with the IANA IPv4 Special-Purpose Address Registry. */
const IPV4_BLOCKED_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // this network / unspecified
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.31.196.0', 24], // AS112-v4
  ['192.52.193.0', 24], // AMT
  ['192.88.99.0', 24], // deprecated 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['192.175.48.0', 24], // AS112-v4 direct delegation
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved / future use
]

/** Aligned with the IANA IPv6 Special-Purpose Address Registry. */
const IPV6_BLOCKED_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['::', 96], // unspecified and IPv4-compatible
  ['::ffff:0:0', 96], // IPv4-mapped
  ['64:ff9b::', 96], // well-known NAT64
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard-only
  ['100:0:0:1::', 64], // dummy IPv6 prefix (RFC 9780)
  ['2001::', 23], // IETF protocol assignments: Teredo, AMT, AS112-v6, benchmarking, ORCHID/ORCHIDv2, DRiP
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['2620:4f:8000::', 48], // direct delegation AS112 service
  ['3fff::', 20], // documentation (RFC 9637)
  ['5f00::', 16], // segment routing (SRv6) SIDs
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // deprecated site-local
  ['ff00::', 8], // multicast
]

function parseIpv4(address: string): bigint | null {
  const parts = address.split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null
  let value = 0n
  for (const part of parts) {
    const octet = Number(part)
    if (octet > 255) return null
    value = (value << 8n) | BigInt(octet)
  }
  return value
}

function parseIpv6(address: string): bigint | null {
  const normalized = address.toLowerCase()
  if (normalized.includes('%')) return null
  const sections = normalized.split('::')
  if (sections.length > 2) return null

  const parseSection = (section: string): string[] | null => {
    if (!section) return []
    const parts = section.split(':')
    const result: string[] = []
    for (const [index, part] of parts.entries()) {
      if (part.includes('.')) {
        if (index !== parts.length - 1) return null
        const ipv4 = parseIpv4(part)
        if (ipv4 === null) return null
        result.push((ipv4 >> 16n).toString(16), (ipv4 & 0xffffn).toString(16))
      } else if (/^[0-9a-f]{1,4}$/.test(part)) {
        result.push(part)
      } else {
        return null
      }
    }
    return result
  }

  const head = parseSection(sections[0])
  const tail = sections.length === 2 ? parseSection(sections[1]) : []
  if (!head || !tail) return null

  const parts = [...head, ...tail]
  if (sections.length === 1) {
    if (parts.length !== 8) return null
  } else {
    const zeroCount = 8 - parts.length
    if (zeroCount < 1) return null
    parts.splice(head.length, 0, ...Array.from({ length: zeroCount }, () => '0'))
  }
  if (parts.length !== 8) return null

  let value = 0n
  for (const part of parts) value = (value << 16n) | BigInt(Number.parseInt(part, 16))
  return value
}

function inRange(address: bigint, network: bigint, bits: number, width: number): boolean {
  const hostBits = width - bits
  const mask = hostBits === width ? 0n : ((1n << BigInt(width)) - 1n) ^ ((1n << BigInt(hostBits)) - 1n)
  return (address & mask) === (network & mask)
}

function isBlockedIpv4(address: string): boolean {
  const value = parseIpv4(address)
  if (value === null) return true
  return IPV4_BLOCKED_RANGES.some(([network, bits]) => {
    const parsed = parseIpv4(network)
    return parsed !== null && inRange(value, parsed, bits, 32)
  })
}

function isBlockedIpv6(address: string): boolean {
  const value = parseIpv6(address)
  if (value === null) return true
  return IPV6_BLOCKED_RANGES.some(([network, bits]) => {
    const parsed = parseIpv6(network)
    return parsed !== null && inRange(value, parsed, bits, 128)
  })
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return isBlockedIpv4(address)
  if (family === 6) return isBlockedIpv6(address)
  return true
}

function hostnameIsLocal(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.+$/, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === 'localhost.localdomain'
    || normalized.endsWith('.localhost.localdomain')
    || normalized === 'local'
    || normalized.endsWith('.local')
}

/** Normalize a configured endpoint to origin + optional path prefix. */
export function normalizeBaseUrl(value: string | undefined, fallback = ''): string {
  const input = value ?? fallback
  // An empty endpoint means "not configured"; each client keeps its own behaviour.
  if (!input) return ''
  if (typeof input !== 'string' || input.trim() !== input || /[\u0000-\u001f\u007f]/.test(input)) {
    throw new EndpointSecurityError(LABEL + ' base URL is invalid.')
  }

  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new EndpointSecurityError(LABEL + ' base URL is invalid.')
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new EndpointSecurityError(LABEL + ' base URL is invalid.')
  }

  const pathPrefix = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${pathPrefix}`
}

/** Validate the final request destination, resolving ordinary hostnames fail-closed. */
export async function assertSafeUrl(url: URL, lookupImpl: LookupImpl = defaultLookup): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EndpointSecurityError(LABEL + ' request URL was rejected by host safety policy.')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase()
  if (!hostname || hostnameIsLocal(hostname)) {
    throw new EndpointSecurityError(LABEL + ' request URL was rejected by host safety policy.')
  }

  const literalFamily = isIP(hostname)
  if (literalFamily) {
    if (isBlockedAddress(hostname)) {
      throw new EndpointSecurityError(LABEL + ' request URL was rejected by host safety policy.')
    }
    return
  }

  let addresses: LookupAddress[]
  try {
    addresses = await lookupImpl(hostname, { all: true })
  } catch {
    throw new EndpointSecurityError(LABEL + ' request URL was rejected by host safety policy.')
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new EndpointSecurityError(LABEL + ' request URL was rejected by host safety policy.')
  }

  for (const result of addresses) {
    if (!result || (result.family !== 4 && result.family !== 6) || isIP(result.address) !== result.family || isBlockedAddress(result.address)) {
      throw new EndpointSecurityError(LABEL + ' request URL was rejected by host safety policy.')
    }
  }
}

/* ---------------------------------------------------------------------------
 * B-class policy layer.
 *
 * Plugins whose endpoint may legitimately be a self-hosted service on a private
 * network (GitHub Enterprise, self-managed GitLab, Jira Data Center, self-hosted
 * Sentry) cannot default to the public-endpoint policy without breaking their
 * advertised deployment mode. They therefore default to a narrow, always-on
 * guard and opt into the full policy explicitly.
 *
 * The default guard blocks addresses that can never be a deliberately configured
 * endpoint: link-local (which includes the cloud metadata address) and the
 * unspecified address. Loopback, RFC1918, and unique-local addresses are left
 * alone because self-hosting legitimately uses them.
 * ------------------------------------------------------------------------- */

/** Rejected regardless of policy: never a valid configured endpoint. */
const ALWAYS_BLOCKED_IPV4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // unspecified / "this network"; routed to loopback by some stacks
  ['169.254.0.0', 16], // link-local, includes the cloud metadata address
]

/** IPv6 prefixes that embed an IPv4 destination. */
const IPV4_EMBEDDING_PREFIXES: ReadonlyArray<readonly [string, number]> = [
  ['::', 96], // IPv4-compatible
  ['::ffff:0:0', 96], // IPv4-mapped
  ['64:ff9b::', 96], // well-known NAT64
]

const LINK_LOCAL_IPV6: readonly [string, number] = ['fe80::', 10]

const ALWAYS_BLOCKED_REASON = ' endpoint is never a valid API endpoint (link-local, which includes the cloud metadata address, or the unspecified address). It is rejected by default; set enforcePublicEndpoint to also require a publicly reachable host.'
const INVALID_REASON = ' request URL is invalid.'
const REJECTED_REASON = ' request URL was rejected by host safety policy.'

function isAlwaysBlockedIpv4(value: bigint): boolean {
  return ALWAYS_BLOCKED_IPV4.some(([network, bits]) => {
    const parsed = parseIpv4(network)
    return parsed !== null && inRange(value, parsed, bits, 32)
  })
}

function embeddedIpv4(value: bigint): bigint | null {
  for (const [network, bits] of IPV4_EMBEDDING_PREFIXES) {
    const parsed = parseIpv6(network)
    if (parsed !== null && inRange(value, parsed, bits, 128)) return value & 0xffffffffn
  }
  return null
}

/** True when the literal address is never a valid configured endpoint. */
export function isAlwaysBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const value = parseIpv4(address)
    return value !== null && isAlwaysBlockedIpv4(value)
  }
  if (family === 6) {
    const value = parseIpv6(address)
    if (value === null) return true
    // RFC 4291 assigns these two addresses specific meanings that must be read
    // before the IPv4-compatible form: "::" is unspecified, "::1" is loopback.
    // Without this, "::1" would decode as IPv4-compatible 0.0.0.1 and be caught
    // by the 0.0.0.0/8 rule, rejecting the IPv6 loopback by default.
    if (value === 0n) return true
    if (value === 1n) return false
    const network = parseIpv6(LINK_LOCAL_IPV6[0])
    if (network !== null && inRange(value, network, LINK_LOCAL_IPV6[1], 128)) return true
    const embedded = embeddedIpv4(value)
    return embedded !== null && isAlwaysBlockedIpv4(embedded)
  }
  return true
}

/**
 * Literal-only check for the default guard. Hostnames are left to
 * `enforcePublicEndpoint` so the default path performs no DNS work and changes
 * no existing behaviour.
 */
export function defaultEndpointError(rawUrl: string): string | undefined {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    // Malformed URLs keep their original failure path instead of failing here.
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase()
  if (!hostname || isIP(hostname) === 0) return undefined
  return isAlwaysBlockedAddress(hostname) ? LABEL + ALWAYS_BLOCKED_REASON : undefined
}

export interface EndpointPolicy {
  /** Require a publicly reachable host and resolve ordinary hostnames. Off by default. */
  enforcePublicEndpoint: boolean
  /** Test-only DNS lookup override; production uses node:dns/promises. */
  lookupImpl?: LookupImpl
}

/** Returns a rejection reason, or undefined when the endpoint is acceptable. */
export async function guardEndpoint(rawUrl: string, policy: EndpointPolicy): Promise<string | undefined> {
  if (!policy.enforcePublicEndpoint) return defaultEndpointError(rawUrl)

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return LABEL + INVALID_REASON
  }
  try {
    await assertSafeUrl(url, policy.lookupImpl)
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : LABEL + REJECTED_REASON
  }
}
