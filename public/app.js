const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const pretty = value => JSON.stringify(value, null, 2);
const state = {
  route: 'agent',
  param: null,
  bootstrap: null,
  employeeId: 'E001',
  question: '我入职第一天需要做什么？',
  result: null,
  running: false,
  expanded: {},
  selectedSkill: null,
  selectedTool: null,
  skillTests: {},
  toolTests: {},
  testingSkills: {},
  testingTools: {},
  skillInputDrafts: {},
  toolInputDrafts: {},
  logs: []
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `请求失败（HTTP ${response.status}）`);
  return body;
}

function badge(kind, text) {
  const safeKind = ['success', 'error', 'warning', 'info', 'purple', 'gray', 'primary'].includes(kind) ? kind : 'gray';
  return `<span class="badge badge-${safeKind}">${escapeHtml(text)}</span>`;
}

function toast(message) {
  const element = $('#toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => element.classList.remove('visible'), 2600);
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', { hour12: false });
}

function employeeName(employeeId) {
  return state.bootstrap?.employees.find(employee => employee.id === employeeId)?.name || '未知员工';
}

function renderSidebar() {
  const items = [
    { id: 'agent', label: 'Agent 执行', icon: '<svg viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>' },
    { id: 'skills', label: 'Skill 管理', icon: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' },
    { id: 'tools', label: 'Tool 管理', icon: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.121 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>' },
    { id: 'logs', label: '执行日志', icon: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/></svg>' }
  ];
  const mode = state.bootstrap?.mode === 'api' ? 'API 模式' : 'Mock 模式';
  $('#sidebar').innerHTML = `
    <div class="brand">
      <div class="brand-title"><span class="brand-icon"><span class="lucide"><svg viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg></span></span><div><div>入职助手</div><div class="brand-sub">Plan-Skill 执行平台</div></div></div>
    </div>
    <nav aria-label="页面导航">
      ${items.map(item => `<button class="nav-item ${state.route === item.id || (state.route === 'logDetail' && item.id === 'logs') ? 'active' : ''}" data-action="navigate" data-route="${item.id}" aria-current="${state.route === item.id || (state.route === 'logDetail' && item.id === 'logs') ? 'page' : 'false'}"><span class="nav-icon lucide">${item.icon}</span>${item.label}</button>`).join('')}
    </nav>
    <div class="footer"><div><span class="dot"></span>本地服务已连接</div><div>${mode} · JSON 数据</div></div>`;
}

function render() {
  renderSidebar();
  if (!state.bootstrap) {
    $('#main').innerHTML = '<div class="card card-pad loading">正在连接本地服务…</div>';
    return;
  }
  if (state.route === 'agent') renderAgent();
  else if (state.route === 'skills') renderSkills();
  else if (state.route === 'tools') renderTools();
  else if (state.route === 'logs') renderLogs();
  else if (state.route === 'logDetail') renderLogDetail(state.param);
}

async function navigate(route, param = null) {
  state.route = route;
  state.param = param;
  if (route === 'logs' || route === 'logDetail') {
    try { state.logs = await api('/api/logs'); }
    catch (error) { toast(error.message); state.logs = []; }
  }
  if (route === 'skills') {
    try { state.bootstrap.skills = await api('/api/skills'); }
    catch (error) { toast(error.message); }
    if (!state.selectedSkill || !state.bootstrap.skills.some(skill => skill.id === state.selectedSkill)) state.selectedSkill = state.bootstrap.skills[0]?.id || null;
  }
  if (route === 'tools') {
    try {
      state.bootstrap.tools = await api('/api/tools');
      if (!state.selectedTool || !state.bootstrap.tools.some(tool => tool.id === state.selectedTool)) state.selectedTool = state.bootstrap.tools[0]?.id || null;
    } catch (error) { toast(error.message); }
  }
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAgent() {
  const employees = state.bootstrap.employees;
  const employee = employees.find(item => item.id === state.employeeId) || employees[0];
  if (!employee) {
    $('#main').innerHTML = '<div class="card empty">没有可选择的模拟员工。</div>';
    return;
  }
  const quickQuestions = [
    '我入职第一天需要做什么？', '我需要准备哪些入职材料？', '我的电脑和账号什么时候可以领取？',
    '公司请假制度是什么？', '我的入职培训有哪些？', '我的直属领导是谁？', '我的入职进度如何？'
  ];
  const skills = state.bootstrap.skills || [];
  const tools = state.bootstrap.tools || [];
  let html = `
    <h1 class="page-title">Agent 执行台</h1>
    <p class="page-desc">选择员工身份，提交入职问题，查看 Planner → Executor → 风控完整执行链路</p>
    <div class="card card-pad">
      <div class="form-row">
        <div class="field"><label for="selEmp">当前员工</label><select id="selEmp">${employees.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === employee.id ? 'selected' : ''}>${escapeHtml(item.id)} · ${escapeHtml(item.name)}（${escapeHtml(item.department)} · ${escapeHtml(item.position)}）</option>`).join('')}</select></div>
        <div class="field" style="flex:2"><label for="qInput">入职问题</label><div class="agent-input-row"><input id="qInput" class="input" value="${escapeHtml(state.question)}" placeholder="请输入您的入职问题…"><button class="btn" id="runBtn" ${state.running ? 'disabled' : ''}>${state.running ? '执行中…' : '发送 →'}</button></div></div>
      </div>
      <div class="qk-chips"><span class="qk-label">快捷提问：</span>${quickQuestions.map(question => `<button class="qk" data-action="quick-question" data-question="${escapeHtml(question)}">${escapeHtml(question)}</button>`).join('')}</div>
    </div>
    <div class="card card-pad"><div class="code-label" style="margin-bottom:8px">当前员工信息</div><div class="emp-grid">
      <div><span class="k">员工编号：</span>${escapeHtml(employee.id)}</div><div><span class="k">姓名：</span>${escapeHtml(employee.name)}</div>
      <div><span class="k">部门：</span>${escapeHtml(employee.department)}</div><div><span class="k">岗位：</span>${escapeHtml(employee.position)}</div>
      <div><span class="k">入职日期：</span>${escapeHtml(employee.start_date || '未提供')}</div><div><span class="k">入职阶段：</span>${escapeHtml(employee.stage || '未提供')}</div>
      <div><span class="k">账号状态：</span>${escapeHtml(employee.account_status || '未提供')}</div><div><span class="k">设备领取：</span>${escapeHtml(employee.device_status || '未提供')}</div>
      <div><span class="k">直属领导：</span>${escapeHtml(employee.manager || '未提供')}</div><div><span class="k">HR 对接人：</span>${escapeHtml(employee.hr_contact || '未提供')}</div>
    </div></div>
    <div class="twocol">
      <div class="card card-pad"><div class="code-label" style="margin-bottom:8px">可用 Skills（${skills.filter(skill => skill.enabled).length}/${skills.length}）</div><div class="registry-badges">${skills.map(skill => badge(skill.enabled ? 'primary' : 'gray', skill.name)).join('')}</div></div>
      <div class="card card-pad"><div class="code-label" style="margin-bottom:8px">可用 Tools（${tools.filter(tool => tool.enabled).length}/${tools.length}）</div><div class="registry-badges">${tools.map(tool => badge(tool.id === 'coze_workflow' ? 'purple' : 'info', tool.name)).join('')}</div></div>
    </div>`;
  if (state.running) html += '<div class="card card-pad loading">Planner 分析与 Executor 执行中…</div>';
  if (state.result) html += renderExecution(state.result);
  $('#main').innerHTML = html;
  $('#selEmp')?.addEventListener('change', event => { state.employeeId = event.target.value; state.result = null; renderAgent(); });
  $('#qInput')?.addEventListener('input', event => {
    state.question = event.target.value;
    if (state.result && state.result.question !== state.question) {
      state.result = null;
      $('#execution-result')?.remove();
    }
  });
  $('#qInput')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); runAgent(); } });
  $('#runBtn')?.addEventListener('click', runAgent);
}

function renderExecution(log) {
  const steps = log.steps || [];
  const plan = log.planner?.plan || [];
  const risk = log.risk || {};
  const issues = (risk.issues || []).map(issue => typeof issue === 'string' ? issue : issue.description || issue.type || JSON.stringify(issue));
  const notes = [...issues, ...(risk.required_changes || []), ...(risk.suggestions || [])];
  const riskType = risk.risk_level === 'low' ? 'success' : risk.risk_level === 'medium' ? 'warning' : 'error';
  return `<div id="execution-result">
    <div class="card"><div class="card-hd"><span>📋 执行计划 · ${escapeHtml(log.planner?.structured?.intent || '入职咨询')}</span>${badge('gray', `${plan.length} 个步骤`)}</div>
      <div class="card-pad"><p style="margin:0;color:#334155">本次共执行 ${plan.length} 个计划步骤，结构化意图为 <b>${escapeHtml(log.planner?.structured?.intent || '未分类')}</b>。</p>
        <ol class="plan-ol">${plan.map((step, index) => `<li><span class="plan-num">${index + 1}</span><span>${badge(step.kind === 'skill' ? 'purple' : 'info', step.kind === 'skill' ? 'Skill' : 'Tool')} <b>${escapeHtml(step.name)}</b><span style="color:#64748b"> · ${escapeHtml(step.id)}</span></span></li>`).join('')}</ol>
      </div>
    </div>
    <div class="card"><div class="card-hd">⚙️ 执行步骤详情 <span class="muted-text">点击展开查看每步输入和输出 JSON</span></div><div class="step-list">
      ${steps.map((step, index) => `<details class="step-card" ${index < 2 ? 'open' : ''}><summary class="step-hd"><span>${badge(step.kind === 'skill' ? 'purple' : 'info', step.kind === 'skill' ? 'Skill' : 'Tool')} <b>${escapeHtml(step.name)}</b> <span class="muted-text">${escapeHtml(step.id)}</span></span><span class="chev">›</span></summary><div class="step-bd"><div class="json-pair"><div><div class="code-label">输入 (Input)</div><pre class="code-block">${escapeHtml(pretty(step.input))}</pre></div><div><div class="code-label">输出 (Output)</div><pre class="code-block">${escapeHtml(pretty(step.output))}</pre></div></div></div></details>`).join('')}
    </div></div>
    <div class="card"><div class="card-hd" style="background:var(--primary-light)">💬 最终入职助手回复</div><div class="card-pad"><div class="final-reply">${escapeHtml(log.final_reply || '（暂无回复）')}</div></div></div>
    <div class="card"><div class="card-hd"><span>合规与风险审核</span><span>${badge(riskType, `风险等级：${risk.risk_level || 'unknown'}`)} ${badge(risk.passed ? 'success' : 'error', risk.passed ? '✓ 审核通过' : '未通过')}</span></div>
      <div class="card-pad">${notes.length ? `<ul class="audit-list">${notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : '<p class="notice">未发现明显风险。</p>'}</div>
    </div>
    <div class="detail-actions"><button class="btn btn-ghost btn-sm" data-action="open-log" data-id="${escapeHtml(log.id)}">查看完整执行日志 →</button></div></div>`;
}

async function runAgent() {
  if (state.running) return;
  const input = $('#qInput');
  const question = input ? input.value.trim() : state.question.trim();
  if (!question) return toast('请先输入一个入职问题。');
  state.question = question;
  state.result = null;
  state.running = true;
  render();
  try {
    state.result = await api('/api/execute', { method: 'POST', body: JSON.stringify({ question, employee_id: state.employeeId }) });
    toast('执行完成，日志已保存。');
  } catch (error) {
    state.result = null;
    toast(error.message);
  } finally {
    state.running = false;
    render();
  }
}

function setQuickQuestion(question) {
  state.question = question;
  state.result = null;
  renderAgent();
  $('#qInput')?.focus();
}

function renderSkills() {
  const skills = state.bootstrap.skills || [];
  const selected = skills.find(skill => skill.id === state.selectedSkill);
  const modelOptions = ['gpt-4o-mini', 'gpt-4o', 'deepseek-chat', 'doubao-seed-1-6-flash'];
  let html = `<h1 class="page-title">Skill 管理</h1><p class="page-desc">管理 Skill 提示词、模型参数和启用状态，并单独运行测试。</p>
    <div class="grid2"><div><div class="list-heading"><b>${skills.length}</b> 个 Skill 配置 <span class="notice">点击项目查看详情</span></div>
      ${skills.map(skill => `<button class="skill-card ${skill.id === state.selectedSkill ? 'active' : ''}" data-action="select-skill" data-id="${escapeHtml(skill.id)}"><div class="skill-card-hd"><div class="skill-name">${badge(skill.enabled ? 'success' : 'gray', skill.enabled ? '启用' : '禁用')}${escapeHtml(skill.name)}</div><span class="mono-id">${escapeHtml(skill.id)}</span></div><div class="skill-desc">${escapeHtml(skill.description || '—')}</div><div class="skill-meta"><span>模型：${escapeHtml(skill.model_params?.model || '默认')}</span><span>temp：${skill.model_params?.temperature ?? '—'}</span><span>max_tokens：${skill.model_params?.max_tokens ?? '—'}</span></div></button>`).join('')}
    </div><div>${selected ? renderSkillEditor(selected, modelOptions) : '<div class="card empty">选择一个 Skill 进行配置。</div>'}</div></div>`;
  $('#main').innerHTML = html;
}

function renderSkillEditor(skill, modelOptions) {
  const result = state.skillTests[skill.id] || null;
  const testing = Boolean(state.testingSkills[skill.id]);
  return `<div class="card card-pad"><div class="editor-heading"><div><h3>${escapeHtml(skill.name)}</h3><div class="mono-id">${escapeHtml(skill.id)}</div></div><button class="switch ${skill.enabled ? 'on' : ''}" role="switch" aria-checked="${skill.enabled}" aria-label="${skill.enabled ? '禁用' : '启用'}此 Skill" data-action="toggle-skill" data-id="${escapeHtml(skill.id)}"></button></div>
    <div class="field" style="margin-bottom:12px"><label for="sk_desc">Skill 描述</label><input class="input" id="sk_desc" value="${escapeHtml(skill.description || '')}"></div>
    <div class="form-grid3" style="margin-bottom:12px"><div class="field"><label for="sk_model">模型</label><select id="sk_model">${[...new Set([skill.model_params?.model, ...modelOptions].filter(Boolean))].map(model => `<option value="${escapeHtml(model)}" ${model === skill.model_params?.model ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('')}</select></div>
      <div class="field"><label for="sk_temp">Temperature</label><input class="input" id="sk_temp" type="number" step="0.1" min="0" max="2" value="${skill.model_params?.temperature ?? 0.2}"></div>
      <div class="field"><label for="sk_max">Max Tokens</label><input class="input" id="sk_max" type="number" min="100" max="8000" value="${skill.model_params?.max_tokens ?? 700}"></div></div>
    <div class="field" style="margin-bottom:12px"><label for="sk_prompt">System Prompt</label><textarea class="code-block" id="sk_prompt" rows="10">${escapeHtml(skill.prompt || '')}</textarea></div>
    <div class="skill-source">来源文档：${escapeHtml(skill.source_document || '自定义配置')}</div>
    <div class="editor-actions"><button class="btn btn-sm" data-action="save-skill" data-id="${escapeHtml(skill.id)}">保存修改</button><button class="btn btn-ghost btn-sm" data-action="reset-skill" data-id="${escapeHtml(skill.id)}">重置</button><span class="save-status"></span></div>
    <div class="test-panel"><h4>✳ Skill 单独测试</h4><div class="field"><label for="sk_testin">测试输入（文本或 JSON）</label><textarea id="sk_testin" rows="3" placeholder="例如：我入职第一天要做什么">${escapeHtml(state.skillInputDrafts[skill.id] || '')}</textarea></div><button class="btn btn-sm" data-action="test-skill" data-id="${escapeHtml(skill.id)}" ${testing ? 'disabled' : ''}>${testing ? '测试中…' : '运行测试'}</button>
      <p class="notice">测试会按当前服务模式执行；Mock 模式不会调用外部模型 API。</p>${result ? `<div class="test-res">${badge(result.mode === 'api' ? 'info' : 'gray', `${result.mode || 'mock'} 模式`)}<div class="code-label" style="margin-top:8px">测试输入</div><pre class="code-block">${escapeHtml(pretty(result.input))}</pre>${result.error ? `<div class="alert alert-error">${escapeHtml(result.error)}</div>` : `<div class="code-label" style="margin-top:8px">输出</div><pre class="code-block">${escapeHtml(result.output || '')}</pre>`}</div>` : ''}</div>
    ${skill.last_test ? `<div class="test-res"><div class="code-label">最近一次测试 · ${formatTime(skill.last_test.at)} · ${escapeHtml(skill.last_test.mode)}</div><pre class="code-block">${escapeHtml(skill.last_test.output || '')}</pre></div>` : ''}
  </div>`;
}

async function saveSkill(id) {
  const current = state.bootstrap.skills.find(skill => skill.id === id);
  if (!current) return;
  const temperature = Number($('#sk_temp')?.value ?? current.model_params?.temperature ?? 0.2);
  const maxTokens = Number($('#sk_max')?.value ?? current.model_params?.max_tokens ?? 700);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) return toast('Temperature 必须在 0 到 2 之间。');
  if (!Number.isInteger(maxTokens) || maxTokens < 100 || maxTokens > 8000) return toast('Max Tokens 必须是 100 到 8000 之间的整数。');
  const patch = {
    name: $('#sk_name')?.value?.trim() || current.name,
    description: $('#sk_desc')?.value?.trim() ?? current.description,
    prompt: $('#sk_prompt')?.value ?? current.prompt,
    enabled: current.enabled,
    model_params: {
      model: $('#sk_model')?.value || current.model_params?.model,
      temperature,
      max_tokens: maxTokens
    }
  };
  try {
    const updated = await api(`/api/skills/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) });
    state.bootstrap.skills = state.bootstrap.skills.map(skill => skill.id === id ? updated : skill);
    delete state.skillTests[id];
    toast('Skill 配置已保存。');
    render();
  } catch (error) { toast(error.message); }
}

async function toggleSkill(id) {
  const skill = state.bootstrap.skills.find(item => item.id === id);
  if (!skill) return;
  try {
    const updated = await api(`/api/skills/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ enabled: !skill.enabled }) });
    state.bootstrap.skills = state.bootstrap.skills.map(item => item.id === id ? updated : item);
    render();
  } catch (error) { toast(error.message); }
}

async function testSkill(id) {
  const raw = $('#sk_testin')?.value.trim() || '';
  state.skillInputDrafts[id] = $('#sk_testin')?.value || '';
  let input = { question: state.question, employee_id: state.employeeId };
  if (raw) {
    try { input = JSON.parse(raw); }
    catch { input = { question: raw, employee_id: state.employeeId }; }
  }
  if (state.testingSkills[id]) return;
  state.testingSkills[id] = true;
  render();
  try {
    state.skillTests[id] = await api(`/api/skills/${encodeURIComponent(id)}/test`, { method: 'POST', body: JSON.stringify(input) });
    state.bootstrap.skills = await api('/api/skills');
    toast('Skill 测试完成。');
  } catch (error) { state.skillTests[id] = { input, mode: 'error', error: error.message }; toast(error.message); }
  finally { delete state.testingSkills[id]; render(); }
}

function defaultToolInput(tool) {
  if (tool.id === 'coze_workflow') return { user_id: 'demo_user_001', CONVERSATION_NAME: '新员工入职咨询', USER_INPUT: '我入职第一天需要做什么？' };
  if (tool.id === 'employee_lookup' || tool.id === 'task_lookup' || tool.id === 'contact_lookup' || tool.id === 'task_status') return { employee_id: state.employeeId };
  if (tool.id === 'policy_search') return { query: '请假' };
  if (tool.id === 'training_lookup') {
    const employee = state.bootstrap.employees.find(item => item.id === state.employeeId) || {};
    return { employee_id: state.employeeId, department: employee.department, position: employee.position };
  }
  return {};
}

const toolSchemas = {
  employee_lookup: { input: { employee_id: 'String' }, output: { id: 'String', name: 'String', department: 'String', position: 'String', start_date: 'String', stage: 'String' } },
  task_lookup: { input: { employee_id: 'String', stage: 'String (optional)' }, output: [{ id: 'String', name: 'String', stage: 'String', priority: 'String', status: 'String' }] },
  contact_lookup: { input: { employee_id: 'String', query: 'String (optional)' }, output: [{ name: 'String', role: 'String', department: 'String', email: 'String' }] },
  policy_search: { input: { query: 'String' }, output: [{ id: 'String', name: 'String', version: 'String', effective_date: 'String', summary: 'String' }] },
  training_lookup: { input: { employee_id: 'String', department: 'String', position: 'String' }, output: [{ name: 'String', schedule: 'String', required: 'Boolean', status: 'String' }] },
  task_status: { input: { employee_id: 'String' }, output: { employee_id: 'String', onboarding_progress: 'Number', completed_task_count: 'Number', pending_task_count: 'Number', overdue_task_count: 'Number', next_priority_tasks: ['String'] } }
};

function renderTools() {
  const tools = state.bootstrap.tools || [];
  const selected = tools.find(tool => tool.id === state.selectedTool);
  $('#main').innerHTML = `<h1 class="page-title">Tool 管理</h1><p class="page-desc">管理本地查询和 Coze 工作流 Tool，配置启用状态，并在测试面板查看真实输入与输出。</p>
    <div class="grid2"><div><div class="list-heading"><b>${tools.length}</b> 个 Tool <button class="btn btn-ghost btn-sm" data-action="refresh-tools">刷新</button></div>
      ${tools.map(tool => `<div class="tool-card ${tool.id === state.selectedTool ? 'active' : ''}" data-action="select-tool" data-id="${escapeHtml(tool.id)}"><div class="skill-card-hd"><div class="skill-name">${badge(tool.enabled ? 'success' : 'gray', tool.enabled ? '启用' : '禁用')}${badge(tool.id === 'coze_workflow' ? 'purple' : 'info', tool.id === 'coze_workflow' ? 'Coze 工作流' : '本地 Tool')} ${escapeHtml(tool.name)}</div><button class="switch ${tool.enabled ? 'on' : ''}" role="switch" aria-checked="${tool.enabled}" aria-label="${tool.enabled ? '禁用' : '启用'}此 Tool" data-action="toggle-tool" data-id="${escapeHtml(tool.id)}"></button></div><div class="mono-id">${escapeHtml(tool.id)}</div><div class="skill-desc">${escapeHtml(tool.description || '—')}</div><div class="skill-meta"><span>数据源：${escapeHtml(tool.source || '代码注册')}</span></div><button class="btn btn-ghost btn-sm" data-action="select-tool" data-id="${escapeHtml(tool.id)}" ${tool.enabled ? '' : 'disabled'}>打开测试面板</button></div>`).join('')}
    </div><div>${selected ? renderToolEditor(selected) : '<div class="card empty">选择一个 Tool 查看配置。</div>'}</div></div>`;
}

function renderToolEditor(tool) {
  const result = state.toolTests[tool.id] || null;
  const testing = Boolean(state.testingTools[tool.id]);
  const credentialText = tool.id === 'coze_workflow' ? (tool.credential_configured ? '● 已检测到凭证（密钥内容不会显示）' : '○ 尚未检测到凭证') : '';
  const cozeConfig = tool.id === 'coze_workflow' ? `<div class="tool-config-grid"><div class="field"><label for="tool_workflow">Workflow ID</label><input class="input" id="tool_workflow" value="${escapeHtml(tool.workflow_id || '')}"></div><div class="field"><label for="tool_base">API Base URL</label><input class="input" id="tool_base" value="${escapeHtml(tool.base_url || 'https://api.coze.cn')}"></div></div>
      <div class="field" style="margin:10px 0"><label for="tool_token_env">Token 环境变量名</label><input class="input" id="tool_token_env" value="${escapeHtml(tool.token_env_var || '')}" placeholder="例如 COZE_API_TOKEN"><span class="notice">${credentialText} · 仅显示变量名，不回显 Token。</span></div>` : '';
  const schema = toolSchemas[tool.id] || {};
  const inputSchema = tool.input_schema || schema.input || defaultToolInput(tool);
  const outputSchema = tool.output_schema || schema.output || { description: '由服务端 Tool 返回' };
  return `<div class="card card-pad"><div class="editor-heading"><div><h3>${escapeHtml(tool.name)}</h3><div class="mono-id">${escapeHtml(tool.id)}</div></div><button class="switch ${tool.enabled ? 'on' : ''}" role="switch" aria-checked="${tool.enabled}" aria-label="${tool.enabled ? '禁用' : '启用'}此 Tool" data-action="toggle-tool" data-id="${escapeHtml(tool.id)}"></button></div>
    <div class="field" style="margin-bottom:10px"><label for="tool_name">Tool 名称</label><input class="input" id="tool_name" value="${escapeHtml(tool.name)}"></div>
    <div class="field" style="margin-bottom:12px"><label for="tool_desc">Tool 描述</label><textarea class="code-block" id="tool_desc" rows="3">${escapeHtml(tool.description || '')}</textarea></div>
    ${cozeConfig}
    <div class="twocol schema-grid"><div><div class="code-label">输入 Schema / 默认输入</div><pre class="code-block">${escapeHtml(pretty(inputSchema))}</pre></div><div><div class="code-label">输出 Schema</div><pre class="code-block">${escapeHtml(pretty(outputSchema))}</pre></div></div>
    <div class="editor-actions"><button class="btn btn-sm" data-action="save-tool" data-id="${escapeHtml(tool.id)}">保存修改</button><span class="save-status"></span></div>
    <div class="test-panel"><h4>⚙ Tool 测试面板</h4><div class="field"><label for="tool_testin">测试参数（JSON 对象）</label><textarea class="code-block" id="tool_testin" rows="6">${escapeHtml(state.toolInputDrafts[tool.id] ?? pretty(defaultToolInput(tool)))}</textarea></div>
      ${tool.id === 'coze_workflow' ? '<div class="alert alert-warn">点击运行会调用 Coze 工作流；没有可用凭证时返回明确的 Mock 结果。</div>' : ''}
      <button class="btn btn-sm" data-action="test-tool" data-id="${escapeHtml(tool.id)}" ${!tool.enabled || testing ? 'disabled' : ''}>${testing ? '运行中…' : '运行测试 →'}</button>
      ${result ? `<div class="test-res">${badge(result.error ? 'error' : result.mock ? 'gray' : 'success', result.error ? '调用失败' : result.mock ? 'Mock 结果' : '调用成功')}<div class="code-label" style="margin-top:8px">发送参数</div><pre class="code-block">${escapeHtml(pretty(result.input))}</pre>${result.error ? `<div class="alert alert-error">${escapeHtml(result.error)}</div>` : `<div class="code-label" style="margin-top:8px">返回结果</div><pre class="code-block">${escapeHtml(pretty(result.output))}</pre>`}</div>` : ''}
    </div></div>`;
}

async function refreshTools() {
  try { state.bootstrap.tools = await api('/api/tools'); render(); toast('Tool 列表已刷新。'); }
  catch (error) { toast(error.message); }
}

async function toggleTool(id) {
  const tool = state.bootstrap.tools.find(item => item.id === id);
  if (!tool) return;
  try {
    await api(`/api/tools/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ enabled: !tool.enabled }) });
    state.bootstrap.tools = await api('/api/tools');
    render();
  } catch (error) { toast(error.message); }
}

async function saveTool(id) {
  const patch = { name: $('#tool_name')?.value.trim(), description: $('#tool_desc')?.value.trim() };
  const current = state.bootstrap.tools.find(tool => tool.id === id);
  if (current?.id === 'coze_workflow') Object.assign(patch, {
    workflow_id: $('#tool_workflow')?.value.trim(), base_url: $('#tool_base')?.value.trim(), token_env_var: $('#tool_token_env')?.value.trim()
  });
  try {
    await api(`/api/tools/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) });
    state.bootstrap.tools = await api('/api/tools');
    delete state.toolTests[id];
    render();
    toast('Tool 配置已保存。');
  } catch (error) { toast(error.message); }
}

async function testTool(id) {
  let input;
  const raw = $('#tool_testin')?.value || '{}';
  state.toolInputDrafts[id] = raw;
  try { input = JSON.parse(raw); }
  catch { return toast('测试参数必须是合法 JSON。'); }
  if (state.testingTools[id]) return;
  state.testingTools[id] = true;
  delete state.toolTests[id];
  render();
  try {
    const output = await api(`/api/tools/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(input) });
    state.toolTests[id] = { input, output, mock: output?.status === 'mock' };
    toast(state.toolTests[id].mock ? 'Tool Mock 测试完成。' : 'Tool 调用完成。');
  } catch (error) {
    state.toolTests[id] = { input, error: error.message, output: null, mock: false };
    toast(error.message);
  } finally { delete state.testingTools[id]; render(); }
}

function renderLogs() {
  const logs = state.logs || [];
  const rows = logs.map(log => `<button class="log-item" data-action="open-log" data-id="${escapeHtml(log.id)}"><div class="log-item-hd">${badge(log.risk?.passed ? 'success' : 'error', log.risk?.passed ? '执行成功' : '需复核')}${badge(log.risk?.risk_level === 'low' ? 'success' : log.risk?.risk_level === 'medium' ? 'warning' : 'error', log.risk?.risk_level || 'unknown')}${badge('gray', log.mode || 'mock')}${badge('gray', log.employee_id || '未知员工')}</div><div class="log-item-q">${escapeHtml(log.question || '（空问题）')}</div><div class="log-item-meta">${formatTime(log.created_at)} · ${(log.steps || []).length} 个步骤 · ${escapeHtml(log.employee_name || employeeName(log.employee_id))} →</div></button>`).join('');
  $('#main').innerHTML = `<h1 class="page-title">执行日志</h1><p class="page-desc">查看 Agent 执行记录、证据摘要与风险审核结果，共 ${logs.length} 条。</p><div class="card"><div class="card-hd">历史执行记录 <button class="btn btn-ghost btn-sm" data-action="refresh-logs">刷新</button></div>${rows || '<div class="empty">暂无执行日志。提交一次入职问题后，执行链路会显示在这里。</div>'}</div>`;
}

function renderLogDetail(id) {
  const log = state.logs.find(item => item.id === id);
  if (!log) {
    $('#main').innerHTML = `<button class="back-btn" data-action="navigate" data-route="logs">← 返回日志列表</button><div class="card empty">日志不存在或已删除。</div>`;
    return;
  }
  const risk = log.risk || {};
  const issues = (risk.issues || []).map(issue => typeof issue === 'string' ? issue : issue.description || issue.type || JSON.stringify(issue));
  const suggestions = [...(risk.required_changes || []), ...(risk.suggestions || [])];
  $('#main').innerHTML = `<button class="back-btn" data-action="navigate" data-route="logs">← 返回日志列表</button><h1 class="page-title">执行日志详情</h1>
    <div class="card card-pad"><div class="log-meta-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;font-size:13px"><div><div class="kv">日志 ID</div><code>${escapeHtml(log.id)}</code></div><div><div class="kv">执行时间</div>${formatTime(log.created_at)}</div><div><div class="kv">员工</div>${escapeHtml(log.employee_id)} · ${escapeHtml(log.employee_name)}</div><div><div class="kv">执行模式</div>${escapeHtml(log.mode)}</div><div><div class="kv">风险等级</div>${badge(risk.risk_level === 'low' ? 'success' : risk.risk_level === 'medium' ? 'warning' : 'error', risk.risk_level || 'unknown')}</div><div><div class="kv">步骤数</div>${(log.steps || []).length}</div></div><div style="margin-top:12px"><div class="kv">用户问题</div><div style="margin-top:4px;font-weight:500">${escapeHtml(log.question)}</div></div></div>
    <div class="card"><div class="card-hd">⚙️ 完整执行步骤</div><div class="step-list">${(log.steps || []).map((step, index) => `<details class="step-card" ${index < 2 ? 'open' : ''}><summary class="step-hd"><span>${badge(step.kind === 'skill' ? 'purple' : 'info', step.kind === 'skill' ? 'Skill' : 'Tool')} <b>${escapeHtml(step.name)}</b><span class="muted-text">${escapeHtml(step.id)}</span></span><span class="chev">›</span></summary><div class="step-bd"><div class="json-pair"><div><div class="code-label">输入 (Input)</div><pre class="code-block">${escapeHtml(pretty(step.input))}</pre></div><div><div class="code-label">输出 (Output)</div><pre class="code-block">${escapeHtml(pretty(step.output))}</pre></div></div></div></details>`).join('')}</div></div>
    <div class="card"><div class="card-hd" style="background:var(--primary-light)">💬 最终回复</div><div class="card-pad"><div class="final-reply">${escapeHtml(log.final_reply || '—')}</div></div></div>
    <div class="card"><div class="card-hd">合规审核 ${badge(risk.risk_level === 'low' ? 'success' : risk.risk_level === 'medium' ? 'warning' : 'error', risk.risk_level || 'unknown')} ${badge(risk.passed ? 'success' : 'error', risk.passed ? '审核通过' : '未通过')}</div><div class="card-pad">${issues.length ? `<ul class="audit-list">${issues.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}${suggestions.length ? `<ul class="audit-list">${suggestions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="notice">未发现需要补充的审核事项。</p>'}</div></div>
    ${log.evidence_summary?.length ? `<div class="card"><div class="card-hd">证据摘要</div><div class="card-pad"><ul class="audit-list">${log.evidence_summary.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div></div>` : ''}
    <div class="detail-actions"><button class="btn btn-ghost btn-sm" data-action="delete-log" data-id="${escapeHtml(log.id)}">删除此日志</button></div>`;
}

async function deleteLog(id) {
  if (!window.confirm('确认删除这条执行日志？此操作不可撤销。')) return;
  try {
    await api(`/api/logs/${encodeURIComponent(id)}`, { method: 'DELETE' });
    state.logs = state.logs.filter(log => log.id !== id);
    if (state.route === 'logs' || state.route === 'logDetail') await navigate('logs');
    toast('日志已删除。');
  } catch (error) { toast(error.message); }
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id, route, question } = target.dataset;
  if (action === 'navigate') navigate(route);
  else if (action === 'quick-question') setQuickQuestion(question);
  else if (action === 'open-log') navigate('logDetail', id);
  else if (action === 'select-skill') { state.selectedSkill = id; renderSkills(); }
  else if (action === 'save-skill') saveSkill(id);
  else if (action === 'toggle-skill') toggleSkill(id);
  else if (action === 'reset-skill') { delete state.skillTests[id]; renderSkills(); toast('已恢复服务器中保存的配置。'); }
  else if (action === 'test-skill') testSkill(id);
  else if (action === 'select-tool') { state.selectedTool = id; renderTools(); }
  else if (action === 'toggle-tool') { event.stopPropagation(); toggleTool(id); }
  else if (action === 'save-tool') saveTool(id);
  else if (action === 'test-tool') testTool(id);
  else if (action === 'refresh-tools') refreshTools();
  else if (action === 'refresh-logs') navigate('logs');
  else if (action === 'delete-log') deleteLog(id);
});

document.addEventListener('input', event => {
  if (event.target.id === 'sk_testin' && state.selectedSkill) state.skillInputDrafts[state.selectedSkill] = event.target.value;
  if (event.target.id === 'tool_testin' && state.selectedTool) state.toolInputDrafts[state.selectedTool] = event.target.value;
});

async function init() {
  try {
    state.bootstrap = await api('/api/bootstrap');
    state.employeeId = state.bootstrap.employees.some(employee => employee.id === state.employeeId) ? state.employeeId : state.bootstrap.employees[0]?.id;
    render();
  } catch (error) {
    $('#sidebar').innerHTML = '<div class="brand"><div class="brand-title"><span class="brand-icon">✦</span><div>入职助手</div></div></div>';
    $('#main').innerHTML = `<h1 class="page-title">无法连接本地服务</h1><p class="page-desc">${escapeHtml(error.message)}</p><button class="btn" onclick="location.reload()">重新连接</button>`;
  }
}

render();
init();
