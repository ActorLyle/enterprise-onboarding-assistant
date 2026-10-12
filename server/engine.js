import { randomUUID } from 'node:crypto';
import { read, write, appendLog } from './store.js';
import { generate } from './llm.js';
import { runCozeWorkflow } from './coze.js';

const skillNames = { structure: '入职问题结构化', decision: '入职任务决策', explain: '入职流程解释', policy_qa: '制度与知识问答', communication: '入职沟通话术生成', compliance: '合规与风险审核' };
const toolNames = { employee_lookup: '查询员工信息', task_lookup: '查询入职任务', contact_lookup: '查询公司联系人', policy_search: '查询制度知识库', training_lookup: '查询培训计划', task_status: '入职任务状态计算' };
const enabledSkill = async id => { const s = (await read('skills')).find(x => x.id === id); if (!s || !s.enabled) throw new Error(`Skill 已禁用或不存在：${id}`); return s; };
function addStep(steps, kind, id, input, output) { steps.push({ index: steps.length + 1, kind, id, name: (kind === 'skill' ? skillNames : toolNames)[id] || id, input, output, at: new Date().toISOString() }); }
function relevantPolicies(rows, q) { const words = ['请假', '考勤', '报销', '社保', '公积金', '信息安全', '保密', '试用期', '福利', '员工手册', '加班', '制度', '薪酬', '劳动合同'].filter(w => q.includes(w)); return rows.filter(p => p.active && (words.length === 0 || words.some(w => `${p.name} ${p.type} ${p.summary} ${p.content}`.includes(w)))).sort((a,b) => new Date(b.effective_date)-new Date(a.effective_date)); }
function deriveIntent(q) { if (/请假|考勤|报销|社保|公积金|制度|加班|保密|福利|试用期|薪酬|劳动合同/.test(q)) return 'query_policy'; if (/培训|课程/.test(q)) return 'query_training'; if (/谁|联系|负责人|领导|门禁|工位|电脑|账号|邮箱|材料/.test(q)) return 'query_contact_or_process'; if (/任务|待办|入职第一天|前三十天|进度|完成/.test(q)) return 'query_onboarding_tasks'; return 'onboarding_question'; }
function parseJson(text) { if (!text) return null; try { return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || ''); } catch { return null; } }
function toText(value) { return Array.isArray(value) ? value.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join('；') : (value == null ? '' : String(value)); }
function mentions(q, re) { return re.test(q); }
const policyPattern = /请假|考勤|报销|社保|公积金|制度|加班|保密|福利|试用期|薪酬|劳动合同|年假|餐补|员工手册/;
const taskPattern = /任务|待办|入职第一天|前三十天|进度|完成|下一步/;
const contactPattern = /谁|联系|负责人|领导|门禁|工位|电脑|账号|邮箱|材料|报到|地址|地点/;
const trainingPattern = /培训|课程/;
function normalizeStructure(parsed, question, employee, employeeId) {
  const base = {
    intent: deriveIntent(question), topic: question, question_type: 'knowledge_query', topics: [], retrieval_query: question,
    entities: { city: null, job_category: employee.position || null, role_type: null, system_name: null, entry_date: null, issue_type: null },
    employee_id: employeeId, department: employee.department, position: employee.position, onboarding_stage: employee.stage,
    need_employee_profile: true, need_onboarding_task_query: mentions(question, taskPattern), need_policy_query: mentions(question, policyPattern),
    need_contact_query: mentions(question, contactPattern), need_training_query: mentions(question, trainingPattern), need_follow_up: false,
    missing_fields: [], known_information: [], missing_information: [], answerability: 'answerable_after_retrieval', sensitive_topic: false, risk_tags: []
  };
  if (parsed && typeof parsed === 'object') Object.assign(base, parsed);
  const entities = { ...base.entities, ...(parsed?.entities || {}) };
  // Query routing is deterministic and additive: an LLM schema change cannot silently skip a needed Tool.
  base.need_onboarding_task_query = Boolean(base.need_onboarding_task_query || parsed?.need_tasks || mentions(question, taskPattern));
  base.need_policy_query = Boolean(base.need_policy_query || parsed?.need_policy_query || /policy_query|social_security|leave_and_benefits/.test(base.intent) || mentions(question, policyPattern));
  base.need_contact_query = Boolean(base.need_contact_query || parsed?.need_contact_query || /contact_or_escalation|access_control|workstation|account_activation|system_login|vpn_application/.test(base.intent) || mentions(question, contactPattern));
  base.need_training_query = Boolean(base.need_training_query || parsed?.need_training_query || /training/.test(base.intent) || mentions(question, trainingPattern));
  base.entities = entities;
  base.employee_id = employeeId;
  return base;
}
function mockReply(q, employee, tasks, policies, contacts, trainings, status) {
  const bits = [];
  if (/制度|请假|考勤|报销|社保|公积金|加班|保密|福利|试用期|薪酬|劳动合同/.test(q)) bits.push(policies.length ? policies.map(p=>`【${p.name} ${p.version}，生效日期 ${p.effective_date}】${p.summary}`).join('\n') : '当前系统未查询到相关信息。');
  if (/培训|课程/.test(q)) bits.push(trainings.length ? `可查询到的培训：${trainings.map(t=>`${t.name}（${t.required?'必修':'选修'}，${t.schedule}，${t.status}）`).join('；')}。` : '当前系统未查询到相关信息。');
  if (/谁|联系|负责人|领导|门禁|工位|电脑|账号|邮箱|材料/.test(q)) bits.push(`直属领导：${employee.manager || '当前系统未查询到相关信息'}；HR 对接人：${employee.hr_contact || '当前系统未查询到相关信息'}。${contacts.length ? `相关联系人：${contacts.map(c=>`${c.name}（${c.role}，${c.email}）`).join('；')}。` : ''}`);
  if (/任务|待办|入职第一天|前三十天|进度|完成|下一步/.test(q)) bits.push(`入职完成率 ${(status.onboarding_progress*100).toFixed(0)}%，还有 ${status.pending_task_count} 项待完成。优先事项：${tasks.slice(0,5).map((t,i)=>`${i+1}. ${t.name}（${t.priority}，负责人：${t.owner}，${t.status==='overdue'?'已逾期':'建议 '+t.recommended_time}）`).join('；') || '当前系统未查询到相关任务'}。`);
  if (!bits.length) bits.push(`你好，${employee.name}。我是入职助手。你可以询问入职待办、制度、培训安排或联系人；目前系统已关联你的部门与岗位信息。`);
  return `你好，${employee.name}。${bits.join('\n\n')}\n\n说明：这是本地模拟数据，仅用于 MVP 演示。涉及薪酬、社保、公积金等事项，请以正式制度及 HR 确认为准。`;
}

export async function runTool(id, input) {
  const tools = await read('tools'); const conf = tools.find(t=>t.id===id); if (!conf || !conf.enabled) throw new Error(`Tool 已禁用或不存在：${id}`);
  const employeeId = input.employee_id || 'E001';
  if (id === 'employee_lookup') { const e=(await read('employees')).find(x=>x.id===employeeId); return e || { error: '未查询到员工信息' }; }
  if (id === 'task_lookup') { const [rows,employees]=await Promise.all([read('onboarding_tasks'),read('employees')]); const employee=employees.find(e=>e.id===employeeId); const completed=new Set(employee?.completed_tasks||[]); return rows.filter(t=>(!t.employee_id||t.employee_id===employeeId) && (!input.stage||t.stage===input.stage)).map(t=>employee?.completed_tasks?{...t,status:completed.has(t.id)?'completed':'pending'}:t); }
  if (id === 'contact_lookup') { const e=(await read('employees')).find(x=>x.id===employeeId); const rows=await read('contacts'); const allowed=new Set([e?.hr_contact,e?.manager].filter(Boolean)); const query=(input.query||'').trim().toLowerCase(); return rows.filter(c=>!query?allowed.has(c.name):`${c.name} ${c.role} ${c.department}`.toLowerCase().includes(query)||allowed.has(c.name)).map(({name,role,email,phone,department})=>({name,role,email,phone,department})); }
  if (id === 'policy_search') return relevantPolicies(await read('policies'), input.query||'');
  if (id === 'training_lookup') return (await read('trainings')).filter(t=>(!t.department||t.department===input.department||t.department==='全员')&&(!t.position||t.position===input.position));
  if (id === 'task_status') { const [all,employees]=await Promise.all([read('onboarding_tasks'),read('employees')]); const employee=employees.find(e=>e.id===employeeId); const completed=new Set(employee?.completed_tasks||[]); const rows=all.filter(t=>!t.employee_id||t.employee_id===employeeId).map(t=>employee?.completed_tasks?{...t,status:completed.has(t.id)?'completed':'pending'}:t); const done=rows.filter(t=>t.status==='completed').length; const pending=rows.filter(t=>t.status!=='completed'); const overdue=pending.filter(t=>new Date(t.due_date)<new Date()).length; const rank={P0:0,P1:1,P2:2}; const sorted=pending.sort((a,b)=>(rank[a.priority]??9)-(rank[b.priority]??9)); return {employee_id:employeeId,onboarding_progress:Number.isFinite(employee?.progress)?employee.progress:(rows.length?done/rows.length:0),completed_task_count:done,pending_task_count:pending.length,overdue_task_count:overdue,next_priority_tasks:sorted.slice(0,5).map(t=>t.name),tasks:sorted}; }
  if (id === 'coze_workflow') return runCozeWorkflow(input, conf);
  throw new Error(`未知 Tool：${id}`);
}

export async function execute({ question, employee_id }) {
  const skills = await read('skills'), tools = await read('tools');
  const employee = (await read('employees')).find(e => e.id === employee_id);
  if (!employee) throw new Error('请选择有效的模拟员工');
  const availableSkill = skills.filter(s => s.enabled), availableTool = tools.filter(t => t.enabled);
  const steps = [];
  const call = async (id, input) => { const output = await runTool(id, input); addStep(steps, 'tool', id, input, output); return output; };

  const structure = await enabledSkill('structure');
  const structureInput = { user_message: question, conversation_context: [], employee_profile: employee };
  const structuredResult = await generate(`${structure.prompt}\n\n输入 JSON：${JSON.stringify(structureInput)}\n只输出约定 JSON。`, structure.model_params);
  const structured = normalizeStructure(parseJson(structuredResult.text), question, employee, employee_id);
  addStep(steps, 'skill', 'structure', structureInput, { ...structured, mode: structuredResult.mode });

  const profile = await call('employee_lookup', { employee_id });
  const needTasks = structured.need_onboarding_task_query || (!structured.need_policy_query && !structured.need_training_query && !structured.need_contact_query);
  const tasks = needTasks ? await call('task_lookup', { employee_id, stage: question.includes('第一天') ? 'day_1' : undefined }) : [];
  const status = needTasks ? await call('task_status', { employee_id }) : { employee_id, onboarding_progress: employee.progress, pending_task_count: 0, overdue_task_count: 0, next_priority_tasks: [], tasks: [] };
  const policies = structured.need_policy_query ? await call('policy_search', { query: structured.retrieval_query || question }) : [];
  const contactQuery = /账号|邮箱|oa|vpn|登录|权限|电脑|系统/.test(question.toLowerCase()) ? 'IT 服务台' : /门禁|工位|报到|材料|办公区/.test(question) ? '行政服务台' : /培训|课程/.test(question) ? '培训负责人' : /报销/.test(question) ? '财务服务台' : '';
  const contacts = structured.need_contact_query ? await call('contact_lookup', { employee_id, query: contactQuery }) : [];
  const trainings = structured.need_training_query ? await call('training_lookup', { employee_id, department: employee.department, position: employee.position }) : [];
  const evidenceSummary = [];
  for (const p of policies) evidenceSummary.push(`制度记录 ${p.name}（${p.version || '版本未注明'}，生效日期${p.effective_date || '未注明'}）：${p.summary || p.content || ''}`);
  for (const t of (status.tasks || tasks).slice(0, 6)) evidenceSummary.push(`本地任务记录：${t.name}；优先级 ${t.priority || '未注明'}；状态 ${t.status || '未注明'}；负责人 ${t.owner || '未注明'}。`);
  for (const c of contacts) evidenceSummary.push(`本地联系人记录：${c.name}，${c.role}，${c.department || ''}，企业邮箱 ${c.email || '未提供'}。`);
  for (const t of trainings) evidenceSummary.push(`本地培训记录：${t.name}；安排 ${t.schedule || '未注明'}；状态 ${t.status || '未注明'}。`);
  if (!evidenceSummary.length) evidenceSummary.push('本次本地查询未获得与用户问题直接相关的知识记录。');

  const facts = { employee: profile, tasks: (status.tasks || tasks).slice(0, 6), status, policies, contacts, trainings, evidence_summary: evidenceSummary };
  let decisionResult = null;
  if (needTasks) {
    const skill = await enabledSkill('decision');
    const input = { structured_query: structured, knowledge_cards: [], employee_status: status, tasks: facts.tasks };
    const result = await generate(`${skill.prompt}\n\n实际查询数据 JSON：${JSON.stringify(input)}\n只输出约定 JSON。`, skill.model_params);
    decisionResult = parseJson(result.text) || { recommended_actions: facts.tasks.map(t => ({ action: t.name, priority: t.priority, when: t.recommended_time, required: t.required, basis: t.reason || '来自本地员工任务记录', owner: t.owner, dependency: t.dependencies || [], confidence: 'medium', requires_confirmation: false })) };
    // Legacy dashboard consumers still use recommended_tasks; preserve that shape while keeping the imported schema.
    decisionResult.recommended_tasks ||= (decisionResult.recommended_actions || []).map(a => ({ task_name: a.action, priority: a.priority, required: a.required, recommended_time: a.when, dependency_tasks: a.dependency, owner: a.owner, reason: a.basis }));
    addStep(steps, 'skill', 'decision', input, { ...decisionResult, mode: result.mode });
  }

  let policyResult = null;
  if (structured.need_policy_query) {
    const skill = await enabledSkill('policy_qa');
    const input = { structured_query: structured, knowledge_cards: policies.map(p => ({ title: p.name, content: p.summary || p.content, version: p.version, effective_date: p.effective_date })) };
    const result = await generate(`${skill.prompt}\n\n实际查询数据 JSON：${JSON.stringify(input)}\n只输出约定 JSON。`, skill.model_params);
    policyResult = parseJson(result.text) || (policies.length ? { answer_status: 'answered', direct_answer: policies.map(p => p.summary || p.content), evidence: policies.map(p => ({ title: p.name, supported_claims: [p.summary || p.content] })), limitations: [], recommended_action: null, risk_level: 'low', confidence: 'medium' } : { answer_status: 'not_found_in_kb', direct_answer: [], evidence: [], limitations: ['当前系统未查询到与该问题直接相关的制度信息。'], recommended_action: '请联系 HR 确认。', risk_level: 'medium', confidence: 'low' });
    policyResult.source_policy_ids = policies.map(p => p.id);
    addStep(steps, 'skill', 'policy_qa', input, { ...policyResult, mode: result.mode });
  }

  const explanation = await enabledSkill('explain');
  const explanationInput = { structured_query: structured, decision_result: decisionResult, policy_qa: policyResult, knowledge_cards: policies.map(p => ({ title: p.name, content: p.summary || p.content })), facts };
  const explanationResult = await generate(`${explanation.prompt}\n\n实际查询数据 JSON：${JSON.stringify(explanationInput)}\n只输出约定 JSON。`, explanation.model_params);
  const explanationOutput = parseJson(explanationResult.text) || { answer_type: 'fact_based_summary', title: '查询结果', summary: evidenceSummary.join('\n'), steps: [], materials_or_information_needed: [], important_notes: ['仅根据本次实际查询结果说明；未查询到的信息不作推测。'], escalation_path: [], confidence: 'medium' };
  addStep(steps, 'skill', 'explain', explanationInput, { ...explanationOutput, mode: explanationResult.mode });

  const communication = await enabledSkill('communication');
  const communicationInput = { user_message: question, process_explanation: explanationOutput, policy_qa: policyResult, task_decision: decisionResult, evidence_summary: evidenceSummary, local_demo_data: true };
  const generated = await generate(`${communication.prompt}\n\n上游已查询事实 JSON：${JSON.stringify(communicationInput)}\n请只输出约定 JSON。`, communication.model_params);
  const generatedJson = parseJson(generated.text);
  let reply = toText(generatedJson?.final_reply || generatedJson?.reply || generated.text).trim() || mockReply(question, employee, (status.tasks || tasks), policies, contacts, trainings, status);
  addStep(steps, 'skill', 'communication', communicationInput, { ...(generatedJson || { final_reply: reply }), mode: generated.mode });

  const audit = await enabledSkill('compliance');
  let risk = { risk_level: policyPattern.test(question) ? 'medium' : 'low', passed: true, review_decision: 'pass', issues: [], required_changes: [], suggestions: ['回复基于本地模拟数据；个人制度和状态请以 HR 确认为准。'], final_reply: reply, safe_reply: reply };
  const auditInput = { draft_reply: reply, structured_query: structured, evidence_summary: evidenceSummary };
  const auditLlm = await generate(`${audit.prompt}\n\n审核输入 JSON：${JSON.stringify(auditInput)}\n只输出约定 JSON。`, audit.model_params);
  const auditResult = parseJson(auditLlm.text);
  if (auditResult) risk = { ...risk, ...auditResult };
  risk.review_decision ||= risk.passed ? 'pass' : 'rewrite_required';
  const needsRewrite = risk.passed === false || risk.review_decision !== 'pass' || ['high', 'critical'].includes(risk.risk_level);
  if (needsRewrite) {
    // Never return the unchecked draft when review blocks it or requests a rewrite.
    reply = toText(auditResult?.safe_reply || auditResult?.final_reply).trim() || '为避免提供不准确的信息，当前无法确认该事项。请联系 HR 或 IT 核实后再处理。';
    risk.passed = false;
  } else {
    reply = toText(risk.safe_reply || risk.final_reply).trim() || reply;
  }
  if (!reply.includes('本地模拟数据')) reply += `\n\n${policyPattern.test(question) ? '涉及个人制度或状态时，请以正式制度及 HR 确认为准。' : ''}（以上信息来自本地模拟数据，仅供演示。）`;
  risk.final_reply = reply;
  risk.safe_reply = reply;
  addStep(steps, 'skill', 'compliance', { ...auditInput, mode: auditLlm.mode }, risk);

  const plan = steps.map(({ index, kind, id, name, input }) => ({ index, kind, id, name, input, depends_on: index === 1 ? [] : [index - 1], expected_output: '结构化 JSON' }));
  const log = { id: randomUUID(), created_at: new Date().toISOString(), question, employee_id, employee_name: employee.name, planner: { available_skills: availableSkill.map(s => ({ id: s.id, name: s.name })), available_tools: availableTool.map(t => ({ id: t.id, name: t.name })), structured, plan }, steps, final_reply: reply, risk, evidence_summary: evidenceSummary, mode: generated.mode };
  await appendLog(log);
  return log;
}

export async function testSkill(id,input={}) { const skill=await enabledSkill(id);const prompt=`${skill.prompt}\n\n测试输入：${JSON.stringify(input)}`;const result=await generate(prompt,skill.model_params);let output=result.text;
  if(!output){if(id==='structure') output=JSON.stringify({intent:deriveIntent(input.question||''),question_type:'knowledge_query',topics:[],retrieval_query:input.question||'',entities:{city:null,job_category:null,role_type:null,system_name:null,entry_date:null,issue_type:null},known_information:[],missing_information:[],answerability:'answerable_after_retrieval',sensitive_topic:/薪酬|社保|公积金|合同/.test(input.question||''),risk_tags:[],need_employee_profile:true,need_onboarding_task_query:mentions(input.question||'',taskPattern),need_policy_query:mentions(input.question||'',policyPattern),need_contact_query:mentions(input.question||'',contactPattern),need_training_query:mentions(input.question||'',trainingPattern),need_follow_up:false,missing_fields:[]},null,2); else if(id==='compliance') output=JSON.stringify({risk_level:'low',passed:true,review_decision:'pass',issues:[],required_changes:[],suggestions:['Mock 模式未发现明显风险'],safe_reply:input.reply||input.draft_reply||'测试回复',final_reply:input.reply||input.draft_reply||'测试回复'},null,2);else output=`Mock 模式测试成功。输入摘要：${JSON.stringify(input)}`;}
  skill.last_test={at:new Date().toISOString(),input,output,mode:result.mode};const all=await read('skills');all[all.findIndex(s=>s.id===id)]=skill;await write('skills',all);return skill.last_test; }
