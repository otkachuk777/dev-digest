import { encoding_for_model } from 'tiktoken';
import { getConfig } from '../../../server/src/platform/config.js';

const encoder = encoding_for_model(getConfig().tokenizerModel as never);

export function countTokens(text: string): number {
  return encoder.encode(text).length;
}
