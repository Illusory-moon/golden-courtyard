export const DEFAULT_MODEL = 'gpt-5.6-sol';
export type ApiStyle = 'responses' | 'chat';

export function apiEndpoint(apiUrl: string, style: ApiStyle): string {
  const base = apiUrl.replace(/\/+$/, '');
  const suffix = style === 'chat' ? '/chat/completions' : '/responses';
  return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

export function upstreamBody(model: string, input: unknown, style: ApiStyle = 'responses'): object {
  if (style === 'chat') return { model, messages: input, response_format: { type: 'json_object' }, max_tokens: 1100 };
  return { model, input, reasoning: { effort: 'low' }, text: { format: { type: 'json_object' } }, max_output_tokens: 1100 };
}
