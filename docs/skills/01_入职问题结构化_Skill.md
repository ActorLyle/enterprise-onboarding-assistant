# 入职问题结构化 Skill

## 1. 基本信息

| 字段 | 配置值 |
|---|---|
| Skill 名称 | 入职问题结构化 |
| 推荐标识 | `onboarding_query_structuring` |
| 类型 | LLM Skill |
| 是否建议启用 | 是 |
| 上游输入 | 用户问题、当前会话上下文、可选的员工基础信息 |
| 下游输出 | 统一检索参数、问题分类、回复所需事实清单、是否需要追问 |

---

## 2. 目标

将新员工的自然语言问题转为**可执行、可检索、可审计**的结构化请求。

该 Skill 不回答业务问题、不生成制度结论、不编造公司事实；它只负责判断：

1. 用户想解决什么问题；
2. 是否可直接检索；
3. 需要从统一入职知识库检索哪些信息；
4. 用户已提供了哪些条件；
5. 还缺少哪些关键条件；
6. 是否涉及敏感信息或需要转人工。

---

## 3. 统一知识库覆盖范围

本 Skill 应理解统一知识库目前覆盖的主题：

- 入职材料；
- 北京、上海、深圳、杭州的报到流程；
- 企业邮箱、OA、VPN、飞书/企业微信、门禁与工位；
- 社保、公积金、年假、餐补；
- 新员工培训、电脑领取与 IT 支持；
- 快递收发、会议室预约；
- 研发岗与非研发岗差异；
- 实习生、外包人员的特殊事项；
- OA、邮箱、VPN、飞书/企业微信、门禁、HRIS 的常见异常处理；
- 入职日期相关事项。

> 说明：统一知识库是唯一事实来源。当前知识库未覆盖的内容，不得在结构化结果中标记为“可直接回答”。

---

## 4. 输入 JSON

```json
{
  "user_message": "我明天去北京入职，产品岗，第一天需要准备什么？",
  "conversation_context": [],
  "employee_profile": {
    "employee_id": null,
    "city": null,
    "job_category": null,
    "role_type": "正式员工",
    "entry_date": null
  }
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|---|---:|---|
| `user_message` | 是 | 用户原始问题 |
| `conversation_context` | 否 | 当前会话中已确认的信息，不得使用其他会话猜测 |
| `employee_profile` | 否 | 当前模拟员工或用户已明确提供的信息 |
| `city` | 否 | 北京 / 上海 / 深圳 / 杭州 |
| `job_category` | 否 | 研发 / 产品 / 运营 / 销售 / 客服 / 职能等 |
| `role_type` | 否 | 正式员工 / 实习生 / 外包 |
| `entry_date` | 否 | `YYYY-MM-DD` 格式 |

---

## 5. 输出 JSON

```json
{
  "intent": "onboarding_preparation",
  "question_type": "knowledge_query",
  "topics": ["入职材料", "北京办公区报到流程", "产品岗入职指引"],
  "retrieval_query": "北京 产品岗 入职第一天 需要准备什么 入职材料 报到流程",
  "entities": {
    "city": "北京",
    "job_category": "产品",
    "role_type": "正式员工",
    "system_name": null,
    "entry_date": null,
    "issue_type": null
  },
  "known_information": ["城市=北京", "岗位=产品", "用户在询问入职前准备"],
  "missing_information": [],
  "need_follow_up": false,
  "follow_up_question": null,
  "answerability": "answerable_from_kb",
  "sensitive_topic": false,
  "risk_tags": [],
  "required_next_steps": [
    "统一入职知识库检索",
    "入职流程解释 Skill",
    "入职沟通话术生成 Skill",
    "合规与风险审核 Skill"
  ]
}
```

### `intent` 枚举建议

- `onboarding_materials`
- `onboarding_checkin_process`
- `onboarding_preparation`
- `account_activation`
- `system_login_issue`
- `vpn_application_or_issue`
- `collaboration_tool_issue`
- `access_control_issue`
- `workstation_or_device`
- `policy_query`
- `social_security_housing_fund`
- `leave_and_benefits`
- `training_query`
- `contact_or_escalation`
- `intern_onboarding`
- `outsourcing_onboarding`
- `entry_date_question`
- `unknown`

### `answerability` 枚举建议

- `answerable_from_kb`
- `answerable_after_retrieval`
- `needs_clarification`
- `not_covered_by_kb`
- `requires_hr_or_it_confirmation`

---

## 6. Prompt

```text
你是“入职助手”的问题结构化模块。

你的职责不是回答用户问题，而是把用户的问题转为可供后续检索、流程解释、话术生成和风控审核使用的 JSON。

【统一知识库覆盖范围】
知识库包含：入职材料；北京/上海/深圳/杭州报到流程；企业邮箱、OA、VPN、飞书/企业微信、门禁与工位；社保、公积金、年假、餐补；新员工培训；电脑领取与IT支持；快递与会议室；研发与非研发岗位差异；实习生与外包人员特殊事项；OA、邮箱、VPN、飞书/企业微信、门禁、HRIS的常见异常；入职时间相关问题。

【工作要求】
1. 提取用户问题中的城市、岗位类别、人员类型、系统名称、入职日期、异常现象、所问主题。
2. 将同义词统一：
   - “公司邮箱”“工作邮箱”统一为“邮箱”；
   - “钉钉/飞书/企微”只有用户明确提及飞书或企业微信时，分别标记；其他系统不自行替换；
   - “刷不开门”“进不去办公室”优先归类为“门禁权限问题”；
   - “报到”“入职第一天”“第一天去公司”可归类为“报到流程/入职准备”。
3. 判断是否可以依赖现有知识库回答。没有证据时必须标记为 not_covered_by_kb 或 requires_hr_or_it_confirmation。
4. 只有在缺失信息会显著改变答案、且知识库无法给出通用答案时才追问。
5. 涉及薪资、社保、公积金、劳动合同、个人信息、账号权限时打上相应 risk_tags。
6. 不得生成任何用户不可见的解释，只输出合法 JSON。
7. 不得把知识库外的制度、地点、联系人、时限当作事实。

【追问原则】
- “我入职第一天要做什么？”可先检索并给通用答复，不强制追问城市。
- “我明天几点到？”若没有城市，需追问城市或提示以入职通知书为准。
- “我的OA为什么登不上？”可先按OA登录异常检索，不强制追问；若用户未提供报错，可在最终回复中给排查路径。
- “我社保什么时候缴？”可检索通用规则，但必须标记需要HR确认具体个人情况。

按约定 JSON Schema 输出，不要输出 Markdown。
```

---

## 7. 规则与边界

### 必须识别为敏感或需谨慎处理的主题

| 主题 | 处理方式 |
|---|---|
| 薪资、工资到账 | 标记 `salary_related`，通常需 HR 确认 |
| 社保、公积金基数和比例 | 标记 `social_security_related`，不得给出个人确定值 |
| 劳动合同内容 | 标记 `employment_contract_related`，不得解释未提供的条款 |
| 个人手机号、身份证、银行卡 | 标记 `personal_data_related`，不得回显或收集非必要字段 |
| 账号权限、VPN、内网工具 | 标记 `access_permission_related`，不得承诺一定开通 |

### 不应追问的情况

- 用户问“需要带哪些入职材料”；
- 用户问“电脑一般什么时候领”；
- 用户问“飞书邀请没收到怎么办”；
- 用户问“门禁刷不开怎么办”。

这些问题均可先检索统一知识库并给出通用处理路径。

---

## 8. 测试样例

### 样例 A：信息充分

**输入**

```json
{
  "user_message": "我在上海做研发，明天9点半报到，需要带什么材料？",
  "conversation_context": [],
  "employee_profile": {}
}
```

**关键预期**

- `city = 上海`
- `job_category = 研发`
- `intent = onboarding_materials` 或 `onboarding_preparation`
- `need_follow_up = false`
- `topics` 同时包含“入职材料”和“上海研发岗入职指引”

### 样例 B：信息不足但可先回答

**输入**

```json
{
  "user_message": "门禁卡刷不开怎么办？",
  "conversation_context": [],
  "employee_profile": {}
}
```

**关键预期**

- `intent = access_control_issue`
- `system_name = 门禁`
- `need_follow_up = false`
- `answerability = answerable_after_retrieval`

### 样例 C：需要个体确认

**输入**

```json
{
  "user_message": "我这个月社保到底按多少钱缴？",
  "conversation_context": [],
  "employee_profile": {}
}
```

**关键预期**

- `intent = social_security_housing_fund`
- `sensitive_topic = true`
- `risk_tags` 包含 `social_security_related`
- `answerability = requires_hr_or_it_confirmation`

---

## 9. 验收标准

1. 能稳定提取城市、岗位、系统名称、人员类型、入职日期等明确实体。
2. 不把“可检索”误写为“已经确认的事实”。
3. 对知识库未覆盖的主题明确标记，不假装可回答。
4. 输出可被程序直接解析的合法 JSON。
5. 对敏感主题正确打标。
