import { getCozeToken } from './env.js';

const DEFAULT_WORKFLOW_ID = '7661245829961302052';

function httpError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseNested(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

function findOutput(value, key, depth = 0) {
  if (depth > 8 || value == null) return undefined;
  value = parseNested(value);
  if (Array.isArray(value)) {
    for (const item of value) { const found = findOutput(item, key, depth + 1); if (found !== undefined) return found; }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  const direct = Object.keys(value).find(name => name.toLowerCase() === key.toLowerCase());
  if (direct !== undefined) return value[direct];
  for (const item of Object.values(value)) { const found = findOutput(item, key, depth + 1); if (found !== undefined) return found; }
  return undefined;
}

function toOutputString(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function validateCozeInput(input = {}) {
  for (const key of ['user_id', 'CONVERSATION_NAME', 'USER_INPUT']) {
    if (typeof input[key] !== 'string') throw httpError(`输入 ${key} 必须是 String`, 400);
  }
  if (!input.user_id.trim()) throw httpError('user_id 不能为空', 400);
  if (!input.USER_INPUT.trim()) throw httpError('USER_INPUT 不能为空', 400);
  return {
    user_id: input.user_id,
    CONVERSATION_NAME: input.CONVERSATION_NAME,
    USER_INPUT: input.USER_INPUT,
  };
}

export async function runCozeWorkflow(input, toolConfig = {}) {
  const parameters = validateCozeInput(input);
  const token = getCozeToken(toolConfig.token_env_var);
  if (!token) {
    return {
      answer: 'Coze 尚未配置 API Token，未调用外部工作流。请在 .env 中设置 COZE_API_TOKEN。',
      status: 'mock',
      risk_level: 'unknown',
    };
  }

  const baseUrl = (toolConfig.base_url || process.env.COZE_BASE_URL || 'https://api.coze.cn').replace(/\/+$/, '');
  const workflowId = toolConfig.workflow_id || process.env.COZE_WORKFLOW_ID || DEFAULT_WORKFLOW_ID;
  let response;
  try {
    response = await fetch(`${baseUrl}/v1/workflow/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ workflow_id: workflowId, parameters }),
      signal: AbortSignal.timeout(90000),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw httpError('Coze 工作流调用超时（90 秒）');
    throw httpError(`无法连接 Coze：${error.message}`);
  }

  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw httpError(`Coze 返回了非 JSON 响应（HTTP ${response.status}）`); }
  if (!response.ok) throw httpError(`Coze HTTP ${response.status}: ${payload.msg || payload.message || text.slice(0, 500)}`);
  if (payload.code !== undefined && Number(payload.code) !== 0) throw httpError(`Coze 错误 ${payload.code}: ${payload.msg || payload.message || '工作流调用失败'}`);
  if (payload.execute_status && !['success', 'succeeded'].includes(String(payload.execute_status).toLowerCase())) {
    throw httpError(`Coze 工作流执行状态：${payload.execute_status}${payload.msg ? `；${payload.msg}` : ''}`);
  }

  const data = parseNested(payload.data ?? payload);
  const answer = findOutput(data, 'answer');
  const status = findOutput(data, 'status');
  const riskLevel = findOutput(data, 'risk_level');
  if (answer === undefined || status === undefined || riskLevel === undefined) {
    throw httpError('Coze 工作流执行成功，但返回值缺少 answer、status 或 risk_level。请检查工作流输出变量名。');
  }
  return {
    answer: toOutputString(answer, ''),
    status: toOutputString(status, ''),
    risk_level: toOutputString(riskLevel, ''),
  };
}
