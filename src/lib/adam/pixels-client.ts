import { readFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * PixelsTemplateClient handles the integration with the Pixels headless render engine.
 * It uses the specifications defined in the YAML config to orchestrate video renders.
 */
export class PixelsTemplateClient {
  private spec: any;

  constructor() {
    const specPath = path.join(process.cwd(), 'src/lib/adam/config/pixels-spec.yaml');
    this.spec = yaml.load(readFileSync(specPath, 'utf8'));
  }

  /**
   * Triggers a headless render based on a specific template ID.
   * Implements X402 payment integration for render calls.
   */
  async renderVideo(templateId: string, variables: Record<string, any>) {
    const template = this.spec.templates.find((t: any) => t.id === templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found in specification.`);
    }

    console.log(`Initiating ${this.spec.rendering.engine} render for ${templateId}...`);
    
    // Mock implementation of the X402 headless call
    const response = await fetch('https://api.pixels.ai/v1/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Gateway': this.spec.rendering.payment_gateway,
      },
      body: JSON.stringify({
        brand: this.spec.brand,
        template: template,
        variables: variables,
        settings: {
          quality: this.spec.rendering.quality,
          resolution: this.spec.rendering.resolution,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Render failed with status: ${response.status}`);
    }

    return response.json();
  }

  getBrandConfig() {
    return this.spec.brand;
  }
}

export const pixelsClient = new PixelsTemplateClient();
