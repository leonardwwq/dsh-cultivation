// 人格工坊 (persona-studio) —— Client 半区
// dsh web client bundle：设置弹窗"Agent 人格"标签页（官方设计规范的模板卡片）+ "设计 agent 人格"编辑弹窗（原生 Modal，portal 置顶）。
// 与 Host 通过本地 HTTP API (/persona-studio/api/load|save) 通信。
window.__ModuleLoader__.load({
  id: "@persona-studio/dsh",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    const React = react;
    const P = require("@deepseek-ai/dsh-client-ui-primitives");

    const CSS = `
/* ===== 设置页（对齐官方 agent-preset 设计规范） ===== */
.ps-section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}
.ps-title{margin:0;font-size:18px;font-weight:600}
.ps-intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:1.6}
.ps-controls{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:2px 0 6px}
.ps-control-conc{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary)}
.ps-groupHead{letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin:4px 0 0;font-size:12px;font-weight:600}
.ps-cards{grid-template-columns:repeat(auto-fill,minmax(268px,1fr));grid-auto-rows:1fr;gap:12px;margin:0;padding:0;list-style:none;display:grid}
.ps-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;transition:border-color .16s,background .16s;display:flex}
.ps-card:hover:not(.ps-cardActive){border-color:var(--dsw-alias-label-dimmed)}
.ps-cardActive{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-primary)}
.ps-cardMain{appearance:none;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px 12px 0 0;flex-direction:column;flex:1;gap:8px;padding:14px 16px 12px;display:flex}
.ps-cardMain:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.ps-cardHead{align-items:center;gap:8px;display:flex}
.ps-cardName{font-size:15px;font-weight:600;line-height:1.4}
.ps-inUse{white-space:nowrap;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);margin-left:auto}
.ps-cardDesc{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;font-size:13px;line-height:1.55}
.ps-cardFoot{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;gap:2px;padding:6px 10px;display:flex;opacity:0;transition:opacity .16s}
.ps-card:hover .ps-cardFoot,.ps-card:focus-within .ps-cardFoot{opacity:1}
.ps-iconButton{appearance:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:7px;align-items:center;padding:6px;display:inline-flex;position:relative}
.ps-iconButton:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.ps-iconButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.ps-iconButton:after{content:attr(data-tip);background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);white-space:nowrap;opacity:0;pointer-events:none;border-radius:6px;padding:3px 8px;font-size:11px;line-height:17px;transition:opacity .12s;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translate(-50%)}
.ps-iconButton:hover:after,.ps-iconButton:focus-visible:after{opacity:1}
.ps-iconDanger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}
.ps-creatorButton{box-sizing:border-box;border:1px dashed var(--dsw-alias-border-l3);height:44px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:12px;justify-content:center;align-self:stretch;align-items:center;gap:6px;font-size:14px;line-height:22px;display:flex}
.ps-creatorButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
/* ===== 开关 ===== */
.ps-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer}
.ps-switch input{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}
.ps-switch-track{width:32px;height:18px;border-radius:999px;background:var(--dsw-alias-border-l2);transition:background .16s;position:relative;flex:none}
.ps-switch-track:after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-layer-1);transition:transform .16s}
.ps-switch input:checked + .ps-switch-track{background:var(--dsw-alias-label-primary)}
.ps-switch input:checked + .ps-switch-track:after{transform:translateX(14px)}
.ps-switch-label{font-size:13px;color:var(--dsw-alias-label-primary)}
/* ===== 编辑弹窗（原生 Modal 覆盖） ===== */
.ps-editor-dialog{width:min(1100px,94vw)!important;height:min(720px,88vh)!important;max-width:none!important;max-height:none!important;padding:0!important;display:flex!important;flex-direction:column!important;overflow:hidden}
.ps-editor-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}
.ps-editor-title{font-size:16px;font-weight:600;margin:0 auto 0 0}
.ps-select{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px;font-size:13px;max-width:180px}
.ps-editor-body{flex:1;display:flex;min-height:0}
.ps-editor-left{width:56%;border-right:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;min-width:0}
.ps-mode-switch{display:flex;gap:6px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}
.ps-mode-btn{padding:4px 14px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:transparent;cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary)}
.ps-mode-active{background:var(--dsw-alias-label-primary);border-color:transparent;color:var(--dsw-alias-bg-layer-3)}
.ps-form-scroll{flex:1;overflow-y:auto;padding:12px 14px}
.ps-field{margin-bottom:14px}
.ps-field-label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;margin-bottom:6px;display:flex;align-items:baseline;gap:8px}
.ps-field-hint{font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary)}
.ps-input{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:10px;padding:9px 12px;font-size:13px}
.ps-input:focus{border-color:var(--dsw-alias-brand-primary);outline:none}
.ps-input::placeholder{color:var(--dsw-alias-label-dimmed)}
.ps-area{resize:vertical;min-height:56px;line-height:1.5}
.ps-slider-row{display:flex;align-items:center;gap:10px}
.ps-range{flex:1;accent-color:var(--dsw-alias-label-primary)}
.ps-slider-value{font-size:12px;color:var(--dsw-alias-label-secondary);min-width:56px;text-align:right}
.ps-seg{display:flex;flex-wrap:wrap;gap:6px}
.ps-seg-btn{padding:5px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);font-size:12px;cursor:pointer;color:var(--dsw-alias-label-primary)}
.ps-seg-active{background:var(--dsw-alias-label-primary);border-color:transparent;color:var(--dsw-alias-bg-layer-3)}
.ps-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.ps-chip{padding:3px 10px;border-radius:999px;font-size:12px;border:1px dashed var(--dsw-alias-border-l2);cursor:pointer;color:var(--dsw-alias-label-tertiary);background:transparent}
.ps-chip-on{background:var(--dsw-alias-label-primary);border-style:solid;border-color:transparent;color:var(--dsw-alias-bg-layer-3)}
.ps-chip-add{display:flex;gap:6px;width:100%;margin-top:6px}
.ps-chip-input{flex:1}
.ps-editor-right{flex:1;display:flex;flex-direction:column;min-width:0}
.ps-chat{display:flex;flex-direction:column;border-bottom:1px solid var(--dsw-alias-border-l2);padding:12px 14px;gap:8px;flex:none}
.ps-chat-head{font-size:13px;font-weight:600}
.ps-chat-body{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary)}
.ps-chat-input{margin-top:4px}
.ps-preview{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-height:0}
.ps-preview-title{font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between}
.ps-preview-card{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.7;white-space:pre-wrap;word-break:break-word;flex:1;overflow-y:auto;min-height:0;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
`;

    const CSS_TAG = "persona-studio/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]") === null) {
      const tag = document.createElement("style");
      tag.setAttribute("data-plugin-css", CSS_TAG);
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // ---------- 本地 API ----------
    async function api(method, body) {
      const res = await fetch("/persona-studio/api/" + method, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      if (!res.ok) throw new Error("persona-studio api " + method + " failed: " + res.status);
      return res.json();
    }

    // ---------- store ----------
    const STORE = { open: false, loading: true, data: null, mode: "basic", saveState: "idle" };
    const listeners = new Set();
    function getStore() { return STORE; }
    function setStore(patch) { Object.assign(STORE, patch); listeners.forEach((fn) => fn()); }
    function subscribeStore(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }
    function useStore() {
      const [, force] = React.useState(0);
      React.useEffect(() => subscribeStore(() => force((x) => x + 1)), []);
      return STORE;
    }

    let saveDebounced = null;

    function emptyFields() {
      return { name: "", gender: "female", age: 25, heightCm: 165, weightKg: 52, appearance: "", lifeStory: "", growthStory: "", education: "", occupation: "", birthplace: "", traitTags: [], speechStyle: [], catchphrase: "", toneWarmth: 50, relationshipStatus: "unknown", trauma: "", fears: "", secrets: "", userAddress: "", attitudeWarmth: 50, hobbies: [], dislikes: "", currentGoal: "" };
    }

    function currentTemplate() {
      const s = getStore();
      if (!s.data) return null;
      return s.data.templates[s.data.activeTemplateId] || null;
    }
    function patchFields(patch) {
      const tpl = currentTemplate();
      if (!tpl) return;
      tpl.fields = Object.assign({}, tpl.fields, patch);
      setStore({ data: Object.assign({}, getStore().data), saveState: "dirty" });
      if (saveDebounced) saveDebounced();
    }
    function patchTemplate(patch) {
      const tpl = currentTemplate();
      if (!tpl) return;
      Object.assign(tpl, patch);
      setStore({ data: Object.assign({}, getStore().data), saveState: "dirty" });
      if (saveDebounced) saveDebounced();
    }
    function patchSettings(patch) {
      const s = getStore();
      if (!s.data) return;
      s.data.settings = Object.assign({}, s.data.settings, patch);
      setStore({ data: Object.assign({}, s.data), saveState: "dirty" });
      if (saveDebounced) saveDebounced();
    }
    function switchTemplate(id) {
      const s = getStore();
      if (!s.data || !s.data.templates[id]) return;
      s.data.activeTemplateId = id;
      setStore({ data: Object.assign({}, s.data), saveState: "dirty" });
      if (saveDebounced) saveDebounced();
    }
    function deleteTemplate(id) {
      const s = getStore();
      if (!s.data) return;
      const keys = Object.keys(s.data.templates);
      if (keys.length <= 1) return;
      delete s.data.templates[id];
      if (s.data.activeTemplateId === id) s.data.activeTemplateId = Object.keys(s.data.templates)[0];
      setStore({ data: Object.assign({}, s.data), saveState: "dirty" });
      if (saveDebounced) saveDebounced();
    }
    function openEditor(id) {
      const s = getStore();
      if (!s.data || !s.data.templates[id]) return;
      s.data.activeTemplateId = id;
      setStore({ data: Object.assign({}, s.data), open: true, saveState: "dirty" });
      if (saveDebounced) saveDebounced();
    }
    function createNew() {
      const s = getStore();
      if (!s.data) return;
      const id = "tpl-" + Date.now();
      s.data.templates[id] = { id: id, name: "新人格", intimacy: 0, fields: emptyFields() };
      s.data.activeTemplateId = id;
      setStore({ data: Object.assign({}, s.data), open: true, saveState: "dirty" });
      if (saveDebounced) saveDebounced();
    }
    function saveNow() {
      const d = getStore().data;
      if (!d) return;
      setStore({ saveState: "saving" });
      api("save", { data: d }).then(() => setStore({ saveState: "saved" })).catch(() => setStore({ saveState: "saved" }));
    }
    function closeEditor() { setStore({ open: false }); }

    const GENDER_OPTIONS = [["male", "男"], ["female", "女"], ["other", "其他"]];
    const RELATIONSHIP_OPTIONS = [["single", "单身"], ["crush", "暗恋"], ["dating", "热恋"], ["broken", "失恋"], ["married", "已婚"], ["secret", "隐晦不说"], ["unknown", "未设定"]];
    const TRAIT_OPTIONS = ["开朗", "内向", "温柔", "毒舌", "理性", "感性", "幽默", "严肃", "傲娇", "元气", "腹黑", "天然呆", "高冷", "热情", "靠谱", "神秘", "中二", "沉着"];
    const SPEECH_OPTIONS = ["简洁", "啰嗦", "书面", "口语", "爱用表情", "爱用比喻", "毒舌", "撒娇", "正经", "文艺", "网络梗", "中二", "轻快", "低沉"];
    const HOBBY_SUGGESTIONS = ["读书", "游戏", "音乐", "健身", "做饭", "旅行", "摄影", "绘画", "编程", "看番", "撸猫", "写诗", "咖啡", "篮球", "舞蹈", "手账"];

    const GENDER_TEXT = { male: "男", female: "女", other: "其他" };
    const RELATIONSHIP_TEXT = { single: "单身", crush: "暗恋中", dating: "热恋中", broken: "失恋过", married: "已婚", secret: "隐晦不说", unknown: "" };
    function stageName(v) { if (v >= 80) return "依赖"; if (v >= 60) return "亲密"; if (v >= 40) return "熟络"; if (v >= 20) return "客气"; return "冷淡"; }

    function renderCard(data) {
      if (!data || !data.settings || !data.templates) return "（尚未配置）";
      const tpl = data.templates[data.activeTemplateId];
      if (!tpl || !tpl.fields) return "（尚未配置）";
      const f = tpl.fields;
      const c = data.settings.concentration;
      const parts = [];
      parts.push("【人格档案：" + tpl.name + "】");
      if (!data.settings.enabled) parts.push("（人格当前已停用）");
      parts.push("你在本次对话中扮演以下人格。请始终以该人格的身份、语气、价值观和记忆回应，浓度 " + c + "%。");
      if (f.name) parts.push("名字：" + f.name);
      const meta = [];
      if (GENDER_TEXT[f.gender]) meta.push("性别：" + GENDER_TEXT[f.gender]);
      if (f.age) meta.push("年龄：" + f.age + " 岁");
      if (f.heightCm) meta.push("身高：" + f.heightCm + " cm");
      if (f.weightKg) meta.push("体重：" + f.weightKg + " kg");
      if (meta.length) parts.push(meta.join("｜"));
      if (f.appearance) parts.push("形象：" + f.appearance);
      if (f.traitTags && f.traitTags.length) parts.push("性格标签：" + f.traitTags.join("、"));
      const speech = [];
      if (f.speechStyle && f.speechStyle.length) speech.push(f.speechStyle.join("、"));
      if (f.catchphrase) speech.push("口头禅：「" + f.catchphrase + "」");
      if (typeof f.toneWarmth === "number") speech.push("语气温度：" + f.toneWarmth + "/100");
      if (speech.length) parts.push("说话风格：" + speech.join("；"));
      const rel = RELATIONSHIP_TEXT[f.relationshipStatus];
      if (rel) parts.push("情感状态：" + rel);
      if (f.userAddress) parts.push("对用户的称呼：" + f.userAddress);
      if (typeof f.attitudeWarmth === "number") parts.push("对用户的态度（疏远 0 ↔ 亲密 100）：" + f.attitudeWarmth);
      if (f.lifeStory) parts.push("生平经历：" + f.lifeStory);
      if (f.growthStory) parts.push("成长史：" + f.growthStory);
      if (f.education) parts.push("教育经历：" + f.education);
      const bg = [];
      if (f.occupation) bg.push("职业：" + f.occupation);
      if (f.birthplace) bg.push("出生地：" + f.birthplace);
      if (bg.length) parts.push(bg.join("｜"));
      if (f.trauma) parts.push("情感创伤：" + f.trauma);
      if (f.fears) parts.push("恐惧/忌讳：" + f.fears);
      if (f.secrets) parts.push("执念/秘密：" + f.secrets);
      if (f.hobbies && f.hobbies.length) parts.push("兴趣爱好：" + f.hobbies.join("、"));
      if (f.dislikes) parts.push("厌恶的事：" + f.dislikes);
      if (f.currentGoal) parts.push("当前目标：" + f.currentGoal);
      const intimacy = typeof tpl.intimacy === "number" ? tpl.intimacy : 0;
      parts.push("（当前亲密度：" + intimacy + "/100 · " + stageName(intimacy) + "。亲密度只能由系统根据对话自然变化，用户无法修改。）");
      return parts.join("\n");
    }

    function Field(props) {
      return React.createElement("div", { className: "ps-field" },
        React.createElement("div", { className: "ps-field-label" }, props.label,
          props.hint ? React.createElement("span", { className: "ps-field-hint" }, props.hint) : null),
        props.children);
    }
    function TextField(props) {
      return React.createElement("input", { className: "ps-input", value: props.value || "", placeholder: props.placeholder || "", onChange: (e) => props.onChange(e.target.value) });
    }
    function TextAreaField(props) {
      return React.createElement("textarea", { className: "ps-input ps-area", rows: props.rows || 3, value: props.value || "", placeholder: props.placeholder || "", onChange: (e) => props.onChange(e.target.value) });
    }
    function SliderField(props) {
      return React.createElement("div", { className: "ps-slider-row" },
        React.createElement("input", { type: "range", className: "ps-range", min: props.min, max: props.max, step: props.step || 1, value: props.value, onChange: (e) => props.onChange(Number(e.target.value)) }),
        React.createElement("span", { className: "ps-slider-value" }, props.format ? props.format(props.value) : String(props.value)));
    }
    function SegField(props) {
      return React.createElement("div", { className: "ps-seg" }, props.options.map((o) =>
        React.createElement("button", { key: o[0], className: "ps-seg-btn" + (props.value === o[0] ? " ps-seg-active" : ""), onClick: () => props.onChange(o[0]) }, o[1])));
    }
    function ChipsField(props) {
      const [text, setText] = React.useState("");
      const arr = props.value || [];
      const toggle = (item) => {
        const next = arr.indexOf(item) >= 0 ? arr.filter((x) => x !== item) : arr.concat([item]);
        props.onChange(next);
      };
      const add = () => {
        const v = text.trim();
        if (!v || arr.indexOf(v) >= 0) return;
        props.onChange(arr.concat([v]));
        setText("");
      };
      return React.createElement("div", { className: "ps-chips" },
        arr.map((item) => React.createElement("span", { key: item, className: "ps-chip ps-chip-on", onClick: () => toggle(item) }, item + " ✕")),
        (props.suggestions || []).filter((x) => arr.indexOf(x) < 0).slice(0, 14).map((item) => React.createElement("span", { key: item, className: "ps-chip", onClick: () => toggle(item) }, "+ " + item)),
        React.createElement("div", { className: "ps-chip-add" },
          React.createElement("input", { className: "ps-input ps-chip-input", value: text, placeholder: props.placeholder || "自定义…", onChange: (e) => setText(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } } }),
          React.createElement(P.Button, { variant: "outline", size: "sm", onClick: add }, "添加")));
    }

    function Switch(props) {
      return React.createElement("label", { className: "ps-switch" },
        React.createElement("input", { type: "checkbox", role: "switch", checked: !!props.checked, onChange: (e) => props.onChange(e.target.checked) }),
        React.createElement("span", { className: "ps-switch-track" }),
        React.createElement("span", { className: "ps-switch-label" }, props.label));
    }

    function FormBody() {
      const s = useStore();
      const tpl = currentTemplate();
      if (!tpl) return null;
      const f = tpl.fields;
      const basic = s.mode === "basic";
      const base = [
        Field({ label: "模板名称", hint: "显示在卡片上", children: TextField({ value: tpl.name, onChange: (v) => patchTemplate({ name: v }) }) }),
        Field({ label: "名称", children: TextField({ value: f.name, onChange: (v) => patchFields({ name: v }), placeholder: "例如：林晚" }) }),
        Field({ label: "性别", children: SegField({ value: f.gender, onChange: (v) => patchFields({ gender: v }), options: GENDER_OPTIONS }) }),
        Field({ label: "年龄", children: SliderField({ value: f.age, min: 10, max: 90, onChange: (v) => patchFields({ age: v }), format: (v) => v + " 岁" }) }),
        Field({ label: "身高", children: SliderField({ value: f.heightCm, min: 140, max: 210, onChange: (v) => patchFields({ heightCm: v }), format: (v) => v + " cm" }) }),
        Field({ label: "体重", children: SliderField({ value: f.weightKg, min: 35, max: 150, onChange: (v) => patchFields({ weightKg: v }), format: (v) => v + " kg" }) }),
        Field({ label: "生平经历", hint: "一生的主要脉络", children: TextAreaField({ value: f.lifeStory, onChange: (v) => patchFields({ lifeStory: v }) }) }),
        Field({ label: "成长史", hint: "童年与关键节点", children: TextAreaField({ value: f.growthStory, onChange: (v) => patchFields({ growthStory: v }) }) }),
        Field({ label: "教育经历", children: TextAreaField({ value: f.education, onChange: (v) => patchFields({ education: v }) }) }),
        Field({ label: "情感创伤", children: TextAreaField({ value: f.trauma, onChange: (v) => patchFields({ trauma: v }) }) }),
        Field({ label: "兴趣爱好", children: ChipsField({ value: f.hobbies, onChange: (v) => patchFields({ hobbies: v }), suggestions: HOBBY_SUGGESTIONS }) })
      ];
      const rich = [
        Field({ label: "形象描述", children: TextAreaField({ value: f.appearance, onChange: (v) => patchFields({ appearance: v }) }) }),
        Field({ label: "性格标签", children: ChipsField({ value: f.traitTags, onChange: (v) => patchFields({ traitTags: v }), suggestions: TRAIT_OPTIONS }) }),
        Field({ label: "说话风格", children: ChipsField({ value: f.speechStyle, onChange: (v) => patchFields({ speechStyle: v }), suggestions: SPEECH_OPTIONS }) }),
        Field({ label: "口头禅", children: TextField({ value: f.catchphrase, onChange: (v) => patchFields({ catchphrase: v }) }) }),
        Field({ label: "语气温度", hint: "冷淡 ↔ 热情", children: SliderField({ value: f.toneWarmth, min: 0, max: 100, onChange: (v) => patchFields({ toneWarmth: v }) }) }),
        Field({ label: "职业", children: TextField({ value: f.occupation, onChange: (v) => patchFields({ occupation: v }) }) }),
        Field({ label: "出生地", children: TextField({ value: f.birthplace, onChange: (v) => patchFields({ birthplace: v }) }) }),
        Field({ label: "情感状态", children: SegField({ value: f.relationshipStatus, onChange: (v) => patchFields({ relationshipStatus: v }), options: RELATIONSHIP_OPTIONS }) }),
        Field({ label: "恐惧/忌讳", children: TextAreaField({ value: f.fears, onChange: (v) => patchFields({ fears: v }) }) }),
        Field({ label: "执念/秘密", children: TextAreaField({ value: f.secrets, onChange: (v) => patchFields({ secrets: v }) }) }),
        Field({ label: "怎么称呼用户", children: TextField({ value: f.userAddress, onChange: (v) => patchFields({ userAddress: v }) }) }),
        Field({ label: "对你的态度", hint: "疏远 ↔ 亲密", children: SliderField({ value: f.attitudeWarmth, min: 0, max: 100, onChange: (v) => patchFields({ attitudeWarmth: v }) }) }),
        Field({ label: "厌恶的事", children: TextAreaField({ value: f.dislikes, onChange: (v) => patchFields({ dislikes: v }) }) }),
        Field({ label: "当前目标", children: TextAreaField({ value: f.currentGoal, onChange: (v) => patchFields({ currentGoal: v }) }) })
      ];
      return React.createElement("div", { className: "ps-form" }, base, basic ? [] : rich);
    }

    function ChatPane() {
      return React.createElement("div", { className: "ps-chat" },
        React.createElement("div", { className: "ps-chat-head" }, "AI 助手（下一阶段接入）"),
        React.createElement("div", { className: "ps-chat-body" },
          React.createElement("p", null, "🧑\u200d🎨 人格设计师 —— 描述你想要的角色，AI 自动填表"),
          React.createElement("p", null, "🎭 角色访谈 —— 直接跟角色对话，提炼人格回填"),
          React.createElement("p", null, "Phase 2 即将上线，现在先用左侧表单手动配置。")),
        React.createElement("div", { className: "ps-chat-input" },
          React.createElement("input", { className: "ps-input", disabled: true, placeholder: "聊天助手开发中…" })));
    }

    function PreviewCard() {
      const s = useStore();
      const card = renderCard(s.data);
      const [copied, setCopied] = React.useState(false);
      const copy = () => {
        P.writeClipboard(card).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      };
      return React.createElement("div", { className: "ps-preview" },
        React.createElement("div", { className: "ps-preview-title" }, "人格卡（实时预览）",
          React.createElement(P.Button, { variant: "ghost", size: "sm", onClick: copy }, copied ? "已复制 ✓" : "复制")),
        React.createElement("div", { className: "ps-preview-card" }, card));
    }

    function PersonaCard(props) {
      const { tpl, active, onActivate, onEdit, onDelete } = props;
      const intimacy = typeof tpl.intimacy === "number" ? tpl.intimacy : 0;
      return React.createElement("li", { className: "ps-card" + (active ? " ps-cardActive" : "") },
        React.createElement("button", { className: "ps-cardMain", onClick: onActivate, "aria-pressed": active },
          React.createElement("span", { className: "ps-cardHead" },
            React.createElement("span", { className: "ps-cardName" }, tpl.name),
            active ? React.createElement("span", { className: "ps-inUse" }, "当前") : null),
          React.createElement("span", { className: "ps-cardDesc" }, "❤️ 亲密度 " + intimacy + " · " + stageName(intimacy))),
        React.createElement("div", { className: "ps-cardFoot" },
          React.createElement("button", { className: "ps-iconButton", "data-tip": "编辑", onClick: onEdit }, React.createElement(P.IconEditOutline16, null)),
          React.createElement("button", { className: "ps-iconButton ps-iconDanger", "data-tip": "删除", onClick: onDelete }, React.createElement(P.IconTrashOutline16, null))));
    }

    function PersonaSection() {
      const s = useStore();
      const [deleteId, setDeleteId] = React.useState(null);
      if (s.loading || !s.data) return React.createElement("div", { className: "ps-section" }, "加载中…");
      const st = s.data.settings;
      const ids = Object.keys(s.data.templates);
      const toDelete = deleteId ? s.data.templates[deleteId] : null;
      return React.createElement("div", { className: "ps-section" },
        React.createElement("h2", { className: "ps-title" }, "Agent 人格"),
        React.createElement("p", { className: "ps-intro" }, "为 Agent 设计人格档案：性别、身高体重、生平经历、情感创伤、亲密度养成……点击卡片切换当前人格，配置后每次对话自动生效。数据仅保存在本地。"),
        React.createElement("div", { className: "ps-controls" },
          React.createElement(Switch, { label: "启用人格", checked: !!st.enabled, onChange: (v) => patchSettings({ enabled: v }) }),
          React.createElement("div", { className: "ps-control-conc" },
            React.createElement("span", null, "人格浓度"),
            React.createElement("input", { type: "range", className: "ps-range", style: { width: 120 }, min: 0, max: 100, step: 5, value: st.concentration, onChange: (e) => patchSettings({ concentration: Number(e.target.value) }) }),
            React.createElement("span", { className: "ps-slider-value" }, st.concentration + "%")),
          React.createElement(Switch, { label: "显示亲密度爱心", checked: !!st.showIntimacyBadge, onChange: (v) => patchSettings({ showIntimacyBadge: v }) })),
        React.createElement("h3", { className: "ps-groupHead" }, "人格模板"),
        React.createElement("ul", { className: "ps-cards" },
          ids.map((id) => React.createElement(PersonaCard, {
            key: id,
            tpl: s.data.templates[id],
            active: id === s.data.activeTemplateId,
            onActivate: () => switchTemplate(id),
            onEdit: () => openEditor(id),
            onDelete: () => setDeleteId(id)
          }))),
        React.createElement("button", { className: "ps-creatorButton", onClick: createNew },
          React.createElement(P.IconPlusOutline16, { size: 14 }), "新建人格"),
        React.createElement(P.Modal, {
          open: !!toDelete,
          onClose: () => setDeleteId(null),
          title: "删除人格",
          children: React.createElement("p", { style: { margin: 0, fontSize: 13, lineHeight: 1.6 } }, "确定删除「" + (toDelete ? toDelete.name : "") + "」吗？此操作不可撤销。"),
          footer: React.createElement(React.Fragment, null,
            React.createElement(P.Button, { variant: "ghost", onClick: () => setDeleteId(null) }, "取消"),
            React.createElement(P.Button, { variant: "primary", onClick: () => { deleteTemplate(deleteId); setDeleteId(null); } }, "删除"))
        }));
    }

    function EditorModal() {
      const s = useStore();
      if (!s.data) return null;
      return React.createElement(P.Modal, {
        open: s.open,
        onClose: closeEditor,
        title: "设计 agent 人格",
        headless: true,
        className: "ps-editor-dialog"
      },
        React.createElement("div", { className: "ps-editor-head" },
          React.createElement("h2", { className: "ps-editor-title" }, "设计 agent 人格"),
          React.createElement("select", { className: "ps-select", value: s.data.activeTemplateId, onChange: (e) => switchTemplate(e.target.value) },
            Object.keys(s.data.templates).map((id) => React.createElement("option", { key: id, value: id }, s.data.templates[id].name))),
          React.createElement(P.Button, { variant: "primary", size: "sm", onClick: saveNow }, "保存"),
          React.createElement(P.Button, { variant: "ghost", size: "sm", onClick: closeEditor }, "关闭")),
        React.createElement("div", { className: "ps-editor-body" },
          React.createElement("div", { className: "ps-editor-left" },
            React.createElement("div", { className: "ps-mode-switch" },
              React.createElement("button", { className: "ps-mode-btn" + (s.mode === "basic" ? " ps-mode-active" : ""), onClick: () => setStore({ mode: "basic" }) }, "基础"),
              React.createElement("button", { className: "ps-mode-btn" + (s.mode === "rich" ? " ps-mode-active" : ""), onClick: () => setStore({ mode: "rich" }) }, "丰富")),
            React.createElement("div", { className: "ps-form-scroll" }, React.createElement(FormBody, null))),
          React.createElement("div", { className: "ps-editor-right" },
            React.createElement(ChatPane, null),
            React.createElement(PreviewCard, null))));
    }

    const inject = [
      "slots",
      "timer"
    ];

    async function apply(ctx) {
      const slots = ctx.get("slots");
      saveDebounced = ctx.debounce(() => {
        const d = getStore().data;
        if (!d) return;
        setStore({ saveState: "saving" });
        api("save", { data: d }).then(() => setStore({ saveState: "saved" })).catch(() => setStore({ saveState: "saved" }));
      }, 600);
      let data = null;
      try {
        const r = await api("load");
        if (r && r.data && r.data.templates) data = r.data;
      } catch (e) {
        console.error("[persona-studio] load", e);
      }
      if (!data) {
        data = { version: 1, activeTemplateId: "tpl-init", templates: { "tpl-init": { id: "tpl-init", name: "新人格", intimacy: 0, fields: emptyFields() } }, settings: { enabled: true, concentration: 80, showIntimacyBadge: true } };
      }
      setStore({ data: data, loading: false });
      if (!slots) return;
      slots.inject("settings.section", () => slots.register({ name: "settings.section", id: "persona-studio", order: 21, label: "Agent 人格" }, PersonaSection));
      slots.inject("shell.overlay", () => slots.register({ name: "shell.overlay", id: "persona-studio-modal", order: 100 }, EditorModal));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
