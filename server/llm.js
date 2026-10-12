export function config() {
  return { key: process.env.OPENAI_API_KEY || '', base: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''), model: process.env.OPENAI_MODEL || 'gpt-4o-mini' };
}
export async function generate(prompt, params = {}) {
  const c = config();
  if (!c.key) return { text: '', mode: 'mock', reason: '未配置 API Key' };
  try {
    const response = await fetch(`${c.base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` }, body: JSON.stringify({ model: params.model || c.model, temperature: params.temperature ?? 0.2, max_tokens: params.max_tokens || 700, messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`API ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data = await response.json(); return { text: data.choices?.[0]?.message?.content || '', mode: 'api' };
  } catch (error) { return { text: '', mode: 'mock', reason: error.message }; }
}
