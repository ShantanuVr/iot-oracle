import { env } from '../config/index.js';
import { formatDate, retryWithBackoff, generateRequestId } from '../util/index.js';
import { DailyDigest } from '../model/api.js';

export interface AnchorResult {
  success: boolean;
  adapterTxId?: string;
  txHash?: string;
  error?: string;
}

export class AnchorService {
  constructor(private logger: any) {}

  async anchorDigest(digest: DailyDigest): Promise<AnchorResult> {
    const requestId = generateRequestId();
    
    if (!env.ANCHOR_ENABLED) {
      this.logger.info({
        requestId,
        siteId: digest.siteId,
        day: formatDate(digest.dayUtc),
      }, 'Anchoring disabled, skipping');
      
      return {
        success: true,
        adapterTxId: 'disabled',
        txHash: 'disabled',
      };
    }

    if (!env.ADAPTER_API_URL || !env.ADAPTER_API_KEY) {
      this.logger.error({
        requestId,
        siteId: digest.siteId,
        day: formatDate(digest.dayUtc),
      }, 'Adapter API not configured');
      
      return {
        success: false,
        error: 'Adapter API not configured',
      };
    }

    try {
      const topic = `IOT:${digest.siteId}:${formatDate(digest.dayUtc)}`;
      
      const anchorPayload = {
        topic,
        hash: digest.merkleRoot,
        uri: digest.csvUrl || digest.jsonUrl || undefined,
      };

      this.logger.info({
        requestId,
        siteId: digest.siteId,
        day: formatDate(digest.dayUtc),
        topic,
        hash: digest.merkleRoot,
      }, 'Starting anchor request');

      const response = await retryWithBackoff(async () => {
        const res = await fetch(`${env.ADAPTER_API_URL}/v1/anchor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.ADAPTER_API_KEY}`,
          },
          body: JSON.stringify(anchorPayload),
        });

        if (!res.ok) {
          throw new Error(`Adapter API returned ${res.status}: ${res.statusText}`);
        }

        return res;
      });

      const result = await response.json();

      this.logger.info({
        requestId,
        siteId: digest.siteId,
        day: formatDate(digest.dayUtc),
        adapterTxId: result.adapterTxId,
        txHash: result.txHash,
      }, 'Anchor request successful');

      return {
        success: true,
        adapterTxId: result.adapterTxId,
        txHash: result.txHash,
      };

    } catch (error) {
      this.logger.error({
        requestId,
        siteId: digest.siteId,
        day: formatDate(digest.dayUtc),
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Anchor request failed');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async anchorDigestById(digestId: string): Promise<AnchorResult> {
    const requestId = generateRequestId();
    
    try {
      // This would fetch the digest from database
      // For now, we'll assume it's passed as a parameter
      // In a real implementation, you'd fetch it here
      
      this.logger.info({
        requestId,
        digestId,
      }, 'Anchoring digest by ID');

      // Placeholder implementation
      return {
        success: true,
        adapterTxId: 'placeholder',
        txHash: 'placeholder',
      };

    } catch (error) {
      this.logger.error({
        requestId,
        digestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to anchor digest by ID');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async checkAnchorStatus(txHash: string): Promise<boolean> {
    const requestId = generateRequestId();
    
    try {
      if (!env.ADAPTER_API_URL || !env.ADAPTER_API_KEY) {
        return false;
      }

      const response = await fetch(`${env.ADAPTER_API_URL}/v1/anchor/${txHash}`, {
        headers: {
          'Authorization': `Bearer ${env.ADAPTER_API_KEY}`,
        },
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      
      this.logger.info({
        requestId,
        txHash,
        status: result.status,
      }, 'Anchor status checked');

      return result.status === 'confirmed';

    } catch (error) {
      this.logger.error({
        requestId,
        txHash,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to check anchor status');

      return false;
    }
  }
}
