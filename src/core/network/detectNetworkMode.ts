import { probe } from './probe'
import { buildNetworkProbeUrl, hasCompleteNetworkProbeConfig } from '@/config/networkProbe'
import type { NetworkProbeConfig, Service } from '@/config/schema'

export type NetworkMode = 'lan' | 'wan' | 'unknown'

/**
 * 检测网络模式
 * @param services 服务列表
 * @returns 网络模式
 */
export async function detectNetworkMode(
  _services: Service[],
  networkProbe?: NetworkProbeConfig | null
): Promise<NetworkMode> {
  if (networkProbe && hasCompleteNetworkProbeConfig(networkProbe)) {
    const lanProbeUrl = buildNetworkProbeUrl(networkProbe.lanProtocol, networkProbe.lanHost)
    const wanProbeUrl = buildNetworkProbeUrl(networkProbe.wanProtocol, networkProbe.wanHost)

    if (await probe(lanProbeUrl, 1200)) {
      return 'lan'
    }

    if (await probe(wanProbeUrl, 1200)) {
      return 'wan'
    }

    return 'unknown'
  }

  // An arbitrary bookmark's availability does not establish the network mode.
  return 'unknown'
}
