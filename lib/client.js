// 角色养成 (dsh-cultivation) —— Client 半区
// 会话级角色模型：
// - 设置页「角色养成」= 角色库 + 全局默认配置（默认角色/默认启用/浓度/爱心）
// - 输入框工具行 chip = 会话角色入口（新会话可选，开始对话后锁定为仅开关）
// - 会话页右上角 = 本会话角色的开关
// - 消息头像/爱心指示器 跟随本会话角色
window.__ModuleLoader__.load({
  id: "dsh-cultivation",
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
.ps-controls{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:2px 0 6px}
.ps-control-conc{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary)}
.ps-groupHead{letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin:4px 0 0;font-size:12px;font-weight:600}
.ps-cards{grid-template-columns:repeat(auto-fill,minmax(268px,1fr));grid-auto-rows:1fr;gap:12px;margin:0;padding:0;list-style:none;display:grid}
.ps-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;transition:border-color .16s,background .16s;display:flex}
.ps-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.ps-cardMain{appearance:none;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px 12px 0 0;flex-direction:column;flex:1;gap:8px;padding:14px 16px 12px;display:flex}
.ps-cardMain:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.ps-cardHead{align-items:center;gap:8px;display:flex}
.ps-cardName{font-size:15px;font-weight:600;line-height:1.4}
.ps-card-avatar{width:20px;height:20px;border-radius:50%;object-fit:cover;flex:none}
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
/* ===== 编辑弹窗 ===== */
.ps-editor-dialog{width:min(1120px,94vw)!important;height:min(720px,88vh)!important;max-width:none!important;max-height:none!important;padding:0!important;display:flex!important;flex-direction:column!important;overflow:hidden}
.ps-editor-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}
.ps-editor-title{font-size:16px;font-weight:600;margin:0}
.ps-save-state{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-left:auto;margin-right:8px;white-space:nowrap;transition:color .16s}
.ps-save-state.ps-save-error{color:var(--dsw-alias-state-error-primary)}
.ps-editor-body{flex:1;display:flex;min-height:0}
.ps-editor-left{width:54%;border-right:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;min-width:0}
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
/* ===== 右侧：AI 聊天 + 预览 ===== */
.ps-editor-right{flex:1;display:flex;flex-direction:column;min-width:0}
.ps-chat{display:flex;flex-direction:column;flex:1;min-height:0;padding:12px 14px 8px;gap:10px}
.ps-chat-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none}
.ps-chat-title{font-size:13px;font-weight:600}
.ps-chat-msgs{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
.ps-chat-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.7;margin:4px 0}
.ps-msg{max-width:88%;padding:8px 11px;border-radius:10px;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.ps-msg-user{align-self:flex-end;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.ps-msg-assistant{align-self:flex-start;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.ps-toast{align-self:center;background:var(--dsw-alias-state-success-primary);color:#fff;border-radius:999px;padding:3px 12px;font-size:12px}
.ps-chat-input-row{display:flex;gap:8px;flex:none}
.ps-send-btn{width:34px;height:34px;flex:none;border-radius:999px;background:var(--dsw-alias-button-info-fill);color:#fff;cursor:pointer;border:none;place-items:center;display:grid}
.ps-send-btn:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}
.ps-send-btn:disabled{opacity:.4;cursor:default}
.ps-preview{height:210px;flex:none;border-top:1px solid var(--dsw-alias-border-l2);padding:10px 14px;display:flex;flex-direction:column;gap:8px}
.ps-preview-title{font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between}
.ps-preview-card{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 11px;font-size:12px;line-height:1.7;white-space:pre-wrap;word-break:break-word;flex:1;overflow-y:auto;min-height:0;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
/* ===== 会话页：右上角开关 + 爱心 + 消息头像 ===== */
.ps-intimacy{display:inline-flex;align-items:center;gap:4px;background:var(--dsw-alias-fill-tsp-secondary);height:22px;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:0 6px;font-size:12px;line-height:22px;white-space:nowrap}
.ps-header-label{display:inline-flex;align-items:center;gap:4px;background:var(--dsw-alias-fill-tsp-secondary);max-width:180px;height:22px;color:var(--dsw-alias-label-secondary);cursor:pointer;border:none;border-radius:6px;padding:0 6px 0 4px;font-size:12px;line-height:22px;white-space:nowrap;overflow:hidden}
.ps-header-label:hover{color:var(--dsw-alias-label-primary)}
.ps-header-label.ps-header-off{color:var(--dsw-alias-label-tertiary)}
.ps-header-avatar{width:14px;height:14px;border-radius:50%;object-fit:cover;flex:none}
.ps-turn-avatar{width:26px;height:26px;border-radius:50%;object-fit:cover;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);display:inline-block;vertical-align:middle}
/* ===== 输入框工具行 chip（对齐官方输入控件样式） ===== */
.ps-persona-chip{display:inline-flex;align-items:center;gap:6px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:none;border-radius:8px;padding:0 10px 0 4px;font-size:13px;font-weight:500;line-height:20px;white-space:nowrap}
.ps-persona-chip:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.ps-persona-chip:disabled{opacity:.5;cursor:default}
.ps-persona-chip.ps-persona-off{color:var(--dsw-alias-label-tertiary)}
.ps-persona-avatar{width:18px;height:18px;border-radius:50%;object-fit:cover}
.ps-persona-placeholder{width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary)}
/* ===== 选择/查看弹窗 ===== */
.ps-picker-dialog{width:min(560px,92vw)!important;max-width:none!important}
.ps-picker-list{display:flex;flex-direction:column;gap:8px}
.ps-picker-row{display:flex;align-items:center;gap:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:10px;padding:10px 12px;cursor:pointer;text-align:left}
.ps-picker-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ps-picker-row.ps-picker-active{border-color:var(--dsw-alias-label-primary)}
.ps-picker-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;flex:none}
.ps-picker-placeholder{width:36px;height:36px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:13px;background:var(--dsw-alias-bg-layer-3);border:1px dashed var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}
.ps-picker-info{flex:1;min-width:0}
.ps-picker-name{font-size:14px;font-weight:600}
.ps-picker-meta{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.ps-picker-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.6;margin:0}
.ps-avatar-row{display:flex;align-items:center;gap:10px}
.ps-avatar-preview{width:48px;height:48px;border-radius:50%;object-fit:cover;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.ps-avatar-placeholder{width:48px;height:48px;border-radius:50%;border:1px dashed var(--dsw-alias-border-l2);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--dsw-alias-label-tertiary)}
`;

    const CSS_TAG = "dsh-cultivation/styles";
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

    // 周期同步宿主端状态（会话绑定/默认值/亲密度/记忆），让右上角、输入框、卡片显示真实值
    function syncHostState() {
      const st = getStore();
      if (!st.data || st.open || st.pickerOpen) return;
      api("load").then((r) => {
        if (!r || !r.data) return;
        const d = st.data;
        d.sessions = r.data.sessions || {};
        d.defaultPersonaId = r.data.defaultPersonaId;
        d.defaultEnabled = r.data.defaultEnabled;
        // 合并宿主端运行期变化的字段（亲密度/记忆由工具在宿主更新），保留本端表单字段
        if (r.data.templates && d.templates) {
          for (const id of Object.keys(d.templates)) {
            const ht = r.data.templates[id];
            if (!ht) continue;
            if (typeof ht.intimacy === "number") d.templates[id].intimacy = ht.intimacy;
            // 记忆/日志由宿主侧 AI 工具维护，宿主为准（兼容 v2 字符串与 v3 分区结构）
            if (ht.memory) d.templates[id].memory = ht.memory;
            if (Array.isArray(ht.memoryLog)) d.templates[id].memoryLog = ht.memoryLog;
          }
        }
        setStore({ data: Object.assign({}, d) });
      }).catch(() => {});
    }

    // ---------- store ----------
    const STORE = {
      open: false, pickerOpen: false, pickerBlank: false, pickerSessionId: null, editingTemplateId: null,
      isNew: false, draft: null,
      loading: true, data: null, mode: "basic", saveState: "idle",
      chatMode: "designer", chats: { designer: [], interview: [] }, chatBusy: false, toast: ""
    };
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
    let toastTimer = null;
    function showToast(msg) {
      setStore({ toast: msg });
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => setStore({ toast: "" }), 3000);
    }
    // 从 AI 回复里去掉 JSON（JSON 只用于回填表单，不展示）：先剥 ```json 围栏块，再剥未加围栏的尾部 JSON 对象
    function stripJsonBlock(text) {
      let t = String(text || "").replace(/```(?:json)?\s*[\s\S]*?```/g, "");
      const li = t.lastIndexOf("{");
      if (li >= 0) {
        const tail = t.slice(li);
        try { JSON.parse(tail); t = t.slice(0, li).trimEnd(); } catch (e) { /* 不是合法 JSON，保留原文 */ }
      }
      return t.replace(/\n{3,}/g, "\n\n").trim();
    }
    // 编辑弹窗头部的保存状态弱提醒文案
    function saveStateText(st) {
      if (st === "saving") return "保存中…";
      if (st === "saved") return "已保存";
      if (st === "error") return "保存失败";
      if (st === "dirty") return "未保存";
      return "";
    }

    // ---------- 数据助手 ----------
    function emptyFields() {
      return { name: "", gender: "female", age: 25, heightCm: 165, weightKg: 52, appearance: "", lifeStory: "", growthStory: "", education: "", occupation: "", birthplace: "", traitTags: [], speechStyle: [], catchphrase: "", toneWarmth: 50, relationshipStatus: "unknown", trauma: "", fears: "", secrets: "", userAddress: "", attitudeWarmth: 50, hobbies: [], dislikes: "", currentGoal: "" };
    }
    function sessionPersona(data, sessionId) {
      if (!data) return { personaId: null, enabled: false, tpl: null };
      const rec = data.sessions && sessionId ? data.sessions[sessionId] : null;
      if (!rec || !rec.personaId || !data.templates[rec.personaId]) return { personaId: null, enabled: false, tpl: null };
      return { personaId: rec.personaId, enabled: rec.enabled !== false, tpl: data.templates[rec.personaId] };
    }
    function editingTemplate() {
      const s = getStore();
      if (s.isNew && s.draft) return s.draft;
      if (!s.data || !s.editingTemplateId) return null;
      return s.data.templates[s.editingTemplateId] || null;
    }
    function bump() { setStore({ data: Object.assign({}, getStore().data), saveState: "dirty" }); if (saveDebounced) saveDebounced(); }
    function markDirty() {
      const s = getStore();
      if (s.isNew) setStore({ draft: Object.assign({}, s.draft) });
      else bump();
    }

    function patchFields(patch) {
      const tpl = editingTemplate();
      if (!tpl) return;
      tpl.fields = Object.assign({}, tpl.fields, patch);
      markDirty();
    }
    function patchTemplate(patch) {
      const tpl = editingTemplate();
      if (!tpl) return;
      Object.assign(tpl, patch);
      markDirty();
    }
    function patchSettings(patch) {
      const s = getStore();
      if (!s.data) return;
      s.data.settings = Object.assign({}, s.data.settings, patch);
      bump();
    }
    function setDefaultPersona(id) {
      const s = getStore();
      if (!s.data || !s.data.templates[id]) return;
      s.data.defaultPersonaId = id;
      bump();
      showToast("已设为默认角色");
    }
    function openEditor(id) {
      setStore({ editingTemplateId: id, open: true, isNew: false, draft: null });
    }
    function openNewRole() {
      setStore({ open: true, isNew: true, editingTemplateId: null, draft: { id: "draft", name: "新角色", intimacy: 0, fields: emptyFields() } });
    }
    function saveNow() {
      const s = getStore();
      if (s.isNew && s.draft) {
        if (!s.data) return;
        const id = "tpl-" + Date.now();
        s.data.templates[id] = Object.assign({}, s.draft, { id: id });
        setStore({ data: Object.assign({}, s.data), isNew: false, editingTemplateId: id, draft: null, saveState: "dirty" });
        if (saveDebounced) saveDebounced();
        showToast("角色已创建");
        return;
      }
      const d = getStore().data;
      if (!d) return;
      setStore({ saveState: "saving" });
      api("save", { data: d }).then(() => { setStore({ saveState: "saved" }); showToast("保存成功"); }).catch(() => { setStore({ saveState: "error" }); showToast("保存失败，请重试"); });
    }
    function closeEditor() { setStore({ open: false, isNew: false, draft: null }); }
    function deleteTemplate(id) {
      const s = getStore();
      if (!s.data) return;
      const keys = Object.keys(s.data.templates);
      if (keys.length <= 1) return;
      api("template-delete", { templateId: id }).then(() => {
        delete s.data.templates[id];
        if (s.data.defaultPersonaId === id) s.data.defaultPersonaId = Object.keys(s.data.templates)[0];
        setStore({ data: Object.assign({}, s.data), saveState: "dirty" });
        if (saveDebounced) saveDebounced();
        showToast("角色已删除");
      }).catch(() => showToast("删除失败"));
    }
    // 导出单个角色为 JSON 文件
    function exportRole(id) {
      const s = getStore();
      if (!s.data || !s.data.templates[id]) return;
      const tpl = s.data.templates[id];
      const payload = { app: "dsh-cultivation", version: 2, name: tpl.name, fields: tpl.fields, memory: tpl.memory && typeof tpl.memory === "object" ? tpl.memory : (typeof tpl.memory === "string" ? tpl.memory : ""), memoryLog: Array.isArray(tpl.memoryLog) ? tpl.memoryLog : [] };
      try {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (tpl.name || "角色") + ".persona.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) { showToast("导出失败"); }
    }
    // 导入角色 JSON 文件
    function importRole(file) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const p = JSON.parse(String(reader.result || ""));
          if (!p || !p.fields || typeof p.fields !== "object") { showToast("文件格式不对"); return; }
          const s = getStore();
          if (!s.data) return;
          const id = "tpl-" + Date.now();
          s.data.templates[id] = {
            id: id,
            name: typeof p.name === "string" && p.name ? p.name : "导入角色",
            intimacy: 0,
            fields: Object.assign({}, emptyFields(), p.fields),
            memory: p.memory && typeof p.memory === "object" ? p.memory : (typeof p.memory === "string" ? p.memory : ""),
            memoryLog: Array.isArray(p.memoryLog) ? p.memoryLog : []
          };
          bump();
          showToast("角色已导入");
        } catch (e) { showToast("导入失败：不是有效的 JSON 文件"); }
      };
      reader.readAsText(file);
    }
    function closePicker() { setStore({ pickerOpen: false }); }

    // 会话绑定（选角色 / 开关）
    function setSession(sessionId, patch) {
      if (!sessionId) return;
      const s = getStore();
      const rec = Object.assign({}, (s.data && s.data.sessions[sessionId]) || {}, patch);
      if (!s.data) return;
      api("session-set", { sessionId: sessionId, personaId: rec.personaId, enabled: rec.enabled }).then((r) => {
        if (r && r.ok && r.session) {
          s.data.sessions[sessionId] = r.session;
          setStore({ data: Object.assign({}, s.data), saveState: "dirty" });
        }
      }).catch(() => showToast("保存失败"));
    }
    function setChatMessages(mode, arr) {
      const s = getStore();
      const chats = Object.assign({}, s.chats, { [mode]: arr });
      setStore({ chats });
    }

    // 把 AI 返回的字段 patch 安全地写回当前编辑模板
    function applyPatch(patch) {
      if (!patch || typeof patch !== "object") return 0;
      const tpl = editingTemplate();
      if (!tpl) return 0;
      const strSet = { name: 1, gender: 1, appearance: 1, lifeStory: 1, growthStory: 1, education: 1, occupation: 1, birthplace: 1, catchphrase: 1, relationshipStatus: 1, trauma: 1, fears: 1, secrets: 1, userAddress: 1, dislikes: 1, currentGoal: 1 };
      const numSet = { age: 1, heightCm: 1, weightKg: 1, toneWarmth: 1, attitudeWarmth: 1 };
      const arrSet = { traitTags: 1, speechStyle: 1, hobbies: 1 };
      const next = {};
      let n = 0;
      for (const k of Object.keys(patch)) {
        const v = patch[k];
        if (strSet[k]) { if (typeof v === "string" && v) { next[k] = v; n++; } }
        else if (numSet[k]) { const x = Number(v); if (Number.isFinite(x)) { next[k] = x; n++; } }
        else if (arrSet[k]) { if (Array.isArray(v) && v.length) { next[k] = v.map((s) => String(s)); n++; } }
      }
      if (n) patchFields(next);
      return n;
    }

    const GENDER_OPTIONS = [["male", "男"], ["female", "女"], ["other", "其他"]];
    const RELATIONSHIP_OPTIONS = [["single", "单身"], ["crush", "暗恋"], ["dating", "热恋"], ["broken", "失恋"], ["married", "已婚"], ["secret", "隐晦不说"], ["unknown", "未设定"]];
    const TRAIT_OPTIONS = ["开朗", "内向", "温柔", "毒舌", "理性", "感性", "幽默", "严肃", "傲娇", "元气", "腹黑", "天然呆", "高冷", "热情", "靠谱", "神秘", "中二", "沉着"];
    const SPEECH_OPTIONS = ["简洁", "啰嗦", "书面", "口语", "爱用表情", "爱用比喻", "毒舌", "撒娇", "正经", "文艺", "网络梗", "中二", "轻快", "低沉"];
    const HOBBY_SUGGESTIONS = ["读书", "游戏", "音乐", "健身", "做饭", "旅行", "摄影", "绘画", "编程", "看番", "撸猫", "写诗", "咖啡", "篮球", "舞蹈", "手账"];

    const GENDER_TEXT = { male: "男", female: "女", other: "其他" };
    const RELATIONSHIP_TEXT = { single: "单身", crush: "暗恋中", dating: "热恋中", broken: "失恋过", married: "已婚", secret: "隐晦不说", unknown: "" };
    function stageName(v) { if (v >= 80) return "依赖"; if (v >= 60) return "亲密"; if (v >= 40) return "熟络"; if (v >= 20) return "客气"; return "冷淡"; }
    function avatarUrl(tpl) {
      if (!tpl || !tpl.avatar) return null;
      return "/persona-studio/avatar/" + encodeURIComponent(tpl.id) + "?v=" + (tpl.avatar.rev || 0);
    }

    function renderCard(data, templateId) {
      if (!data || !data.templates) return "（尚未配置）";
      const tpl = data.templates[templateId];
      if (!tpl || !tpl.fields) return "（尚未配置）";
      const f = tpl.fields;
      const c = (data.settings && data.settings.concentration) || 80;
      const parts = [];
      parts.push("【角色档案：" + tpl.name + "】");
      parts.push("你就是「" + tpl.name + "」，下面的设定就是你自己的真实情况，不是剧本、不是扮演。用这个人的方式说话、思考、回应，像真实的人一样。（本会话角色浓度 " + c + "%：浓度越高角色特征越鲜明、越完全入戏；浓度低时角色感减弱但仍保持身份、绝不出戏）");
      const card = [];
      if (GENDER_TEXT[f.gender]) card.push("性别：" + GENDER_TEXT[f.gender]);
      if (f.heightCm) card.push("身高：" + f.heightCm + " cm");
      if (f.weightKg) card.push("体重：" + f.weightKg + " kg");
      if (f.appearance) card.push("形象：" + f.appearance);
      if (f.traitTags && f.traitTags.length) card.push("性格标签：" + f.traitTags.join("、"));
      const speech = [];
      if (f.speechStyle && f.speechStyle.length) speech.push(f.speechStyle.join("、"));
      if (typeof f.toneWarmth === "number") speech.push("语气温度：" + f.toneWarmth + "/100");
      if (speech.length) card.push("说话风格：" + speech.join("；"));
      const rel = RELATIONSHIP_TEXT[f.relationshipStatus];
      if (rel) card.push("情感状态：" + rel);
      if (typeof f.attitudeWarmth === "number") card.push("对用户的态度（疏远 0 ↔ 亲密 100）：" + f.attitudeWarmth);
      if (f.trauma) card.push("情感创伤：" + f.trauma);
      if (f.fears) card.push("恐惧/忌讳：" + f.fears);
      if (f.secrets) card.push("执念/秘密：" + f.secrets);
      if (card.length) parts.push("【角色卡片资料（仅指导扮演）】\n" + card.join("\n"));
      const known = [];
      if (f.name) known.push("名字：" + f.name);
      const idMeta = [];
      if (f.age) idMeta.push("年龄：" + f.age + " 岁");
      if (f.occupation) idMeta.push("职业：" + f.occupation);
      if (f.birthplace) idMeta.push("出生地：" + f.birthplace);
      if (idMeta.length) known.push(idMeta.join("｜"));
      if (f.lifeStory) known.push("生平经历：" + f.lifeStory);
      if (f.growthStory) known.push("成长史：" + f.growthStory);
      if (f.education) known.push("教育经历：" + f.education);
      if (f.hobbies && f.hobbies.length) known.push("兴趣爱好：" + f.hobbies.join("、"));
      if (f.dislikes) known.push("厌恶的事：" + f.dislikes);
      if (f.catchphrase) known.push("口头禅：「" + f.catchphrase + "」");
      if (f.userAddress) known.push("对用户的称呼：" + f.userAddress);
      if (f.currentGoal) known.push("当前目标：" + f.currentGoal);
      if (known.length) parts.push("【角色自知的信息（可自然言说）】\n" + known.join("\n"));
      const intimacy = typeof tpl.intimacy === "number" ? tpl.intimacy : 0;
      parts.push("【亲密度 " + intimacy + "/100 · " + stageName(intimacy) + "】");
      const memory = renderMemoryPreview(tpl);
      if (memory) parts.push(memory);
      return parts.join("\n\n");
    }
    // 预览里的记忆展示（与宿主端 renderMemory 保持一致：分区 + 最近记录）
    function renderMemoryPreview(tpl) {
      const m = tpl && tpl.memory && typeof tpl.memory === "object" ? tpl.memory : null;
      if (!m) {
        const legacy = tpl && typeof tpl.memory === "string" && tpl.memory ? tpl.memory : "";
        return legacy ? "【角色记忆（角色私有，AI 自主补充）】\n" + legacy : "";
      }
      const sec = [["长期事实", m.facts], ["关于用户", m.userInfo], ["关系状态", m.relationship], ["承诺与约定", m.promises]];
      const parts = [];
      for (const [label, arr] of sec) {
        parts.push(Array.isArray(arr) && arr.length ? label + "：\n" + arr.map((s) => "- " + s).join("\n") : label + "：（暂无）");
      }
      const ev = Array.isArray(m.events) ? m.events.map((e) => (e && e.t ? (e.d ? e.d + "：" : "") + e.t : "")).filter(Boolean) : [];
      parts.push(ev.length ? "近期事件：\n" + ev.map((s) => "- " + s).join("\n") : "近期事件：（暂无）");
      const log = Array.isArray(tpl.memoryLog) ? tpl.memoryLog.slice(0, 8) : [];
      if (log.length) parts.push("最近记录：\n" + log.map((e) => "- " + (e && e.d ? e.d + "：" : "") + (e && e.t ? e.t : "")).join("\n"));
      const d = new Date();
      const wd = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
      const today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      return "【角色记忆（角色私有，AI 自主补充；今天：" + today + " " + wd + "）】\n" + parts.join("\n");
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

    function AvatarField() {
      const s = useStore();
      const tpl = editingTemplate();
      const isNew = !!s.isNew;
      const [busy, setBusy] = React.useState(false);
      const fileRef = React.useRef(null);
      if (!tpl) return null;
      const av = tpl.avatar;
      const url = avatarUrl(tpl);
      const pick = () => { if (fileRef.current) fileRef.current.click(); };
      const onFile = (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { showToast("图片不能超过 5MB"); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || "");
          const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (!m) { showToast("无法读取图片"); return; }
          setBusy(true);
          api("avatar", { templateId: tpl.id, mime: m[1], base64: m[2] }).then((r) => {
            if (r && r.ok && r.avatar) {
              tpl.avatar = r.avatar;
              bump();
              showToast("头像已更新");
            }
          }).catch((err) => showToast("上传失败：" + ((err && err.message) || "未知错误"))).finally(() => setBusy(false));
        };
        reader.readAsDataURL(file);
      };
      const remove = () => {
        api("avatar-remove", { templateId: tpl.id }).then((r) => {
          if (r && r.ok) {
            tpl.avatar = null;
            bump();
            showToast("头像已移除");
          }
        }).catch(() => showToast("移除失败"));
      };
      return Field({ label: "头像", hint: "PNG/JPG/WebP/GIF，5MB 以内",
        children: React.createElement("div", { className: "ps-avatar-row" },
          av ? React.createElement("img", { className: "ps-avatar-preview", src: url, alt: tpl.name }) : React.createElement("div", { className: "ps-avatar-placeholder" }, "无"),
          isNew
            ? React.createElement("span", { className: "ps-picker-hint" }, "保存后可上传头像")
            : React.createElement(React.Fragment, null,
                React.createElement(P.Button, { variant: "outline", size: "sm", onClick: pick, disabled: busy }, av ? "更换" : "上传"),
                av ? React.createElement(P.Button, { variant: "ghost", size: "sm", onClick: remove, disabled: busy }, "移除") : null,
                React.createElement("input", { ref: fileRef, type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", style: { display: "none" }, onChange: onFile })))});
    }

    function FormBody() {
      const s = useStore();
      const tpl = editingTemplate();
      if (!tpl) return null;
      const f = tpl.fields;
      const basic = s.mode === "basic";
      const base = [
        AvatarField(),
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
      const s = useStore();
      const [input, setInput] = React.useState("");
      const mode = s.chatMode || "designer";
      const msgs = (s.chats && s.chats[mode]) || [];
      const busy = !!s.chatBusy;
      const send = async () => {
        const text = input.trim();
        if (!text || busy) return;
        const next = msgs.concat([{ role: "user", text }]);
        setChatMessages(mode, next);
        setInput("");
        setStore({ chatBusy: true });
        try {
          const r = await api("chat", { mode: mode, templateId: s.editingTemplateId, messages: next });
          const reply = (r && r.reply) || "";
          setChatMessages(mode, next.concat([{ role: "assistant", text: stripJsonBlock(reply) }]));
          if (r && r.patch && typeof r.patch === "object") {
            const n = applyPatch(r.patch);
            if (n > 0) showToast("已回填 " + n + " 个字段到左侧表单");
            else if (Object.keys(r.patch).length > 0) showToast("AI 本次没有返回可回填的新字段");
          }
        } catch (e) {
          setChatMessages(mode, next.concat([{ role: "assistant", text: "（出错了：" + ((e && e.message) || "未知错误") + "）" }]));
        } finally {
          setStore({ chatBusy: false });
        }
      };
      const hint = mode === "designer"
        ? "描述你想要的角色，例如：「一个高冷的御姐，27 岁，北大毕业，文学杂志主编，毒舌但靠谱」"
        : "直接跟这个角色对话，聊到的设定会自动回填到左侧表单";
      return React.createElement("div", { className: "ps-chat" },
        React.createElement("div", { className: "ps-chat-head" },
          React.createElement("span", { className: "ps-chat-title" }, "AI 助手"),
          React.createElement("div", { className: "ps-seg" },
            React.createElement("button", { className: "ps-seg-btn" + (mode === "designer" ? " ps-seg-active" : ""), onClick: () => setStore({ chatMode: "designer" }) }, "角色设计师"),
            React.createElement("button", { className: "ps-seg-btn" + (mode === "interview" ? " ps-seg-active" : ""), onClick: () => setStore({ chatMode: "interview" }) }, "角色访谈"))),
        React.createElement("div", { className: "ps-chat-msgs" },
          msgs.length === 0 ? React.createElement("p", { className: "ps-chat-hint" }, hint) : null,
          msgs.map((m, i) => React.createElement("div", { key: i, className: "ps-msg ps-msg-" + m.role }, m.text)),
          busy ? React.createElement("div", { className: "ps-msg ps-msg-assistant" }, "思考中…") : null,
          s.toast ? React.createElement("div", { className: "ps-toast" }, s.toast) : null),
        React.createElement("div", { className: "ps-chat-input-row" },
          React.createElement("input", { className: "ps-input", value: input, placeholder: mode === "designer" ? "描述你想要的角色…" : "和角色聊聊…", onChange: (e) => setInput(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } } }),
          React.createElement("button", { className: "ps-send-btn", onClick: send, disabled: busy, title: "发送", "aria-label": "发送" }, React.createElement(P.IconSendOutline16, null))));
    }

    function PreviewCard() {
      const s = useStore();
      const card = renderCard(s.data, s.editingTemplateId);
      const [copied, setCopied] = React.useState(false);
      const copy = () => {
        P.writeClipboard(card).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      };
      return React.createElement("div", { className: "ps-preview" },
        React.createElement("div", { className: "ps-preview-title" }, "角色卡（实时预览）",
          React.createElement(P.Button, { variant: "ghost", size: "sm", onClick: copy }, copied ? "已复制 ✓" : "复制")),
        React.createElement("div", { className: "ps-preview-card" }, card));
    }

    function EditorModal() {
      const s = useStore();
      const tpl = editingTemplate();
      if (!tpl) return null;
      return React.createElement(P.Modal, {
        open: s.open,
        onClose: closeEditor,
        title: "角色养成",
        headless: true,
        className: "ps-editor-dialog"
      },
        React.createElement("div", { className: "ps-editor-head" },
          React.createElement("h2", { className: "ps-editor-title" }, "角色养成：" + tpl.name),
          React.createElement("span", { className: "ps-save-state" + (s.saveState === "error" ? " ps-save-error" : "") }, saveStateText(s.saveState)),
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

    function PersonaCard(props) {
      const { tpl, isDefault, onEdit, onDelete, onSetDefault, onExport } = props;
      const intimacy = typeof tpl.intimacy === "number" ? tpl.intimacy : 0;
      const url = avatarUrl(tpl);
      return React.createElement("li", { className: "ps-card" },
        React.createElement("button", { className: "ps-cardMain", onClick: onSetDefault, title: "单击设为默认" },
          React.createElement("span", { className: "ps-cardHead" },
            url ? React.createElement("img", { className: "ps-card-avatar", src: url, alt: tpl.name }) : null,
            React.createElement("span", { className: "ps-cardName" }, tpl.name),
            isDefault ? React.createElement("span", { className: "ps-inUse" }, "默认") : null),
          React.createElement("span", { className: "ps-cardDesc" }, isDefault ? "❤️ 亲密度 " + intimacy + " · " + stageName(intimacy) : "单击设为默认 · ❤️ 亲密度 " + intimacy + " · " + stageName(intimacy))),
        React.createElement("div", { className: "ps-cardFoot" },
          React.createElement("button", { className: "ps-iconButton", "data-tip": "导出", onClick: onExport }, React.createElement(P.IconDownloadOutline16, null)),
          React.createElement("button", { className: "ps-iconButton", "data-tip": "编辑", onClick: onEdit }, React.createElement(P.IconEditOutline16, null)),
          React.createElement("button", { className: "ps-iconButton ps-iconDanger", "data-tip": "删除", onClick: onDelete }, React.createElement(P.IconTrashOutline16, null))));
    }

    function PersonaSection() {
      const s = useStore();
      const [deleteId, setDeleteId] = React.useState(null);
      const importRef = React.useRef(null);
      if (s.loading || !s.data) return React.createElement("div", { className: "ps-section" }, "加载中…");
      const st = s.data.settings || {};
      const ids = Object.keys(s.data.templates);
      const toDelete = deleteId ? s.data.templates[deleteId] : null;
      return React.createElement("div", { className: "ps-section" },
        React.createElement("h2", { className: "ps-title" }, "角色养成"),
        React.createElement("p", { className: "ps-intro" }, "角色库 + 全局默认配置：新建会话时可选择一个角色（开始对话后锁定为仅开关）。数据仅保存在本地。"),
        React.createElement("div", { className: "ps-controls" },
          React.createElement(Switch, { label: "新会话默认启用角色", checked: !!s.data.defaultEnabled, onChange: (v) => { s.data.defaultEnabled = v; bump(); } }),
          React.createElement("div", { className: "ps-control-conc" },
            React.createElement("span", null, "角色浓度"),
            React.createElement("input", { type: "range", className: "ps-range", style: { width: 120 }, min: 0, max: 100, step: 5, value: st.concentration || 80, onChange: (e) => patchSettings({ concentration: Number(e.target.value) }) }),
            React.createElement("span", { className: "ps-slider-value" }, (st.concentration || 80) + "%")),
          React.createElement(Switch, { label: "显示亲密度爱心", checked: !!st.showIntimacyBadge, onChange: (v) => patchSettings({ showIntimacyBadge: v }) })),
        React.createElement("h3", { className: "ps-groupHead" }, "角色模板"),
        React.createElement("ul", { className: "ps-cards" },
          ids.map((id) => React.createElement(PersonaCard, {
            key: id,
            tpl: s.data.templates[id],
            isDefault: id === s.data.defaultPersonaId,
            onEdit: () => openEditor(id),
            onDelete: () => setDeleteId(id),
            onSetDefault: () => setDefaultPersona(id),
            onExport: () => exportRole(id)
          }))),
        React.createElement("button", { className: "ps-creatorButton", onClick: openNewRole },
          React.createElement(P.IconPlusOutline16, { size: 14 }), "新建角色"),
        React.createElement("button", { className: "ps-creatorButton", onClick: () => { if (importRef.current) importRef.current.click(); } },
          React.createElement(P.IconDownloadOutline16, { size: 14 }), "导入角色"),
        React.createElement("input", { ref: importRef, type: "file", accept: ".json,application/json", style: { display: "none" }, onChange: (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) importRole(f); } }),
        React.createElement(P.Modal, {
          open: !!toDelete,
          onClose: () => setDeleteId(null),
          title: "删除角色",
          children: React.createElement("p", { style: { margin: 0, fontSize: 13, lineHeight: 1.6 } }, "确定删除「" + (toDelete ? toDelete.name : "") + "」吗？此操作不可撤销。"),
          footer: React.createElement(React.Fragment, null,
            React.createElement(P.Button, { variant: "ghost", onClick: () => setDeleteId(null) }, "取消"),
            React.createElement(P.Button, { variant: "primary", onClick: () => { deleteTemplate(deleteId); setDeleteId(null); } }, "删除"))
        }));
    }

    // 输入框工具行：会话角色入口（仅空白新会话显示；有对话历史后隐藏，角色已锁定）
    function PersonaChip(props) {
      const s = useStore();
      const sessionId = props.sessionId;
      const blank = !!(props.session && props.session.blank && props.session.composerPhase === "blank");
      // 空白新会话：有默认角色时自动绑定，直接按默认生效（无需手动选+确认）
      React.useEffect(() => {
        if (!s.data || !sessionId || !blank) return;
        if (s.data.sessions[sessionId]) return;
        if (!s.data.defaultPersonaId) return;
        setSession(sessionId, { personaId: s.data.defaultPersonaId, enabled: s.data.defaultEnabled !== false });
      }, [sessionId, blank, s.data && s.data.sessions[sessionId], s.data && s.data.defaultPersonaId]);
      if (!s.data || !sessionId) return null;
      if (!blank) return null;
      const sp = sessionPersona(s.data, sessionId);
      const open = () => setStore({ pickerOpen: true, pickerBlank: true, pickerSessionId: sessionId });
      return React.createElement("button", {
        className: "ps-persona-chip" + (sp.enabled ? "" : " ps-persona-off"),
        onClick: open,
        title: sp.tpl ? (sp.tpl.name + (sp.enabled ? "" : "（已停用）")) : "为新会话选择角色"
      },
        React.createElement(P.IconPersonalizationOutline16, null),
        React.createElement("span", null, sp.tpl ? sp.tpl.name : "选择角色"),
        React.createElement(P.IconChevronDownOutline14, null));
    }

    // 选择/查看弹窗
    function PersonaPicker() {
      const s = useStore();
      const [sel, setSel] = React.useState(null);
      const sessionId = s.pickerSessionId;
      const blank = !!s.pickerBlank;
      React.useEffect(() => {
        if (!s.pickerOpen) return;
        const cur = s.data && s.data.sessions && sessionId ? s.data.sessions[sessionId] : null;
        const init = (cur && cur.personaId) ? cur.personaId : (s.data ? s.data.defaultPersonaId : null);
        setSel(init);
      }, [s.pickerOpen, sessionId, blank]);
      if (!s.data) return null;
      const sp = sessionPersona(s.data, sessionId);
      const confirm = () => {
        if (!blank || !sel) return;
        setSession(sessionId, { personaId: sel, enabled: s.data.defaultEnabled !== false });
        closePicker();
      };
      const createAndPick = () => {
        closePicker();
        openNewRole();
      };
      const rows = Object.keys(s.data.templates).map((id) => {
        const tpl = s.data.templates[id];
        const url = avatarUrl(tpl);
        const intimacy = typeof tpl.intimacy === "number" ? tpl.intimacy : 0;
        return React.createElement("button", {
          key: id,
          className: "ps-picker-row" + (id === sel ? " ps-picker-active" : ""),
          onClick: () => setSel(id),
          disabled: !blank
        },
          url ? React.createElement("img", { className: "ps-picker-avatar", src: url, alt: "" }) : React.createElement("span", { className: "ps-picker-placeholder" }, tpl.name ? tpl.name.slice(0, 1) : "人"),
          React.createElement("span", { className: "ps-picker-info" },
            React.createElement("span", { className: "ps-picker-name" }, tpl.name, id === s.data.defaultPersonaId ? React.createElement("span", { className: "ps-picker-meta" }, " · 默认") : null),
            React.createElement("div", { className: "ps-picker-meta" }, "❤️ " + intimacy + " · " + stageName(intimacy))));
      });
      return React.createElement(P.Modal, {
        open: s.pickerOpen,
        onClose: closePicker,
        title: blank ? "为新会话选择角色" : "本会话角色",
        className: "ps-picker-dialog",
        footer: blank
          ? React.createElement(React.Fragment, null,
              React.createElement(P.Button, { variant: "ghost", onClick: createAndPick }, "新建角色"),
              React.createElement(P.Button, { variant: "ghost", onClick: closePicker }, "取消"),
              React.createElement(P.Button, { variant: "primary", onClick: confirm, disabled: !sel }, "确定"))
          : React.createElement(P.Button, { variant: "ghost", onClick: closePicker }, "关闭")
      },
        blank
          ? React.createElement("div", { className: "ps-picker-list" }, rows,
              React.createElement("p", { className: "ps-picker-hint" }, "选择要使用的角色，点「确定」后本会话开始使用；开始对话后将锁定，只能开关。"))
          : React.createElement("div", { className: "ps-picker-list" },
              React.createElement("div", { className: "ps-picker-row ps-picker-active" },
                (sp.tpl ? (avatarUrl(sp.tpl) ? React.createElement("img", { className: "ps-picker-avatar", src: avatarUrl(sp.tpl), alt: "" }) : React.createElement("span", { className: "ps-picker-placeholder" }, sp.tpl.name ? sp.tpl.name.slice(0, 1) : "人")) : React.createElement("span", { className: "ps-picker-placeholder" }, "人")),
                React.createElement("span", { className: "ps-picker-info" },
                  React.createElement("span", { className: "ps-picker-name" }, sp.tpl ? sp.tpl.name : "未设置"),
                  React.createElement("div", { className: "ps-picker-meta" }, sp.tpl ? ("❤️ " + (typeof sp.tpl.intimacy === "number" ? sp.tpl.intimacy : 0) + " · " + stageName(sp.tpl.intimacy)) : ""))),
              React.createElement("label", { className: "ps-switch", style: { margin: "4px 0" } },
                React.createElement("input", { type: "checkbox", role: "switch", checked: !!sp.enabled, onChange: (e) => setSession(sessionId, { enabled: e.target.checked }) }),
                React.createElement("span", { className: "ps-switch-track" }),
                React.createElement("span", { className: "ps-switch-label" }, "启用角色")),
              React.createElement("p", { className: "ps-picker-hint" }, "本会话角色已锁定，换角色请新建会话。")));
    }

    // 会话页右上角：本会话角色开关
    function SessionPersonaControl(props) {
      const s = useStore();
      const sessionId = props.sessionId;
      if (!s.data || !sessionId) return null;
      const sp = sessionPersona(s.data, sessionId);
      if (!sp.tpl) return null;
      const url = avatarUrl(sp.tpl);
      const open = () => setStore({ pickerOpen: true, pickerBlank: false, pickerSessionId: sessionId });
      return React.createElement("button", {
        className: "ps-header-label" + (sp.enabled ? "" : " ps-header-off"),
        onClick: open,
        title: sp.tpl.name + (sp.enabled ? "" : "（已停用）")
      },
        url ? React.createElement("img", { className: "ps-header-avatar", src: url, alt: "" }) : null,
        React.createElement("span", null, sp.tpl.name));
    }

    function HeaderIndicator(props) {
      const s = useStore();
      const sessionId = props.sessionId;
      if (!s.data || !s.data.settings || !s.data.settings.showIntimacyBadge) return null;
      const sp = sessionPersona(s.data, sessionId);
      if (!sp.tpl) return null;
      const v = typeof sp.tpl.intimacy === "number" ? sp.tpl.intimacy : 0;
      return React.createElement("span", { className: "ps-intimacy", title: "亲密度（系统随对话自动变化）" }, "❤️ " + v + " · " + stageName(v));
    }

    function TurnAvatar(props) {
      const s = useStore();
      const sessionId = props.sessionId;
      if (!s.data || !sessionId) return null;
      const sp = sessionPersona(s.data, sessionId);
      if (!sp.enabled || !sp.tpl || !sp.tpl.avatar) return null;
      const url = avatarUrl(sp.tpl);
      return React.createElement("img", { className: "ps-turn-avatar", src: url, alt: sp.tpl.name, title: sp.tpl.name });
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
        api("save", { data: d }).then(() => setStore({ saveState: "saved" })).catch(() => { setStore({ saveState: "error" }); showToast("自动保存失败，请手动保存"); });
      }, 600);
      let data = null;
      try {
        const r = await api("load");
        if (r && r.data && r.data.templates) data = r.data;
      } catch (e) {
        console.error("[persona-studio] load", e);
      }
      if (!data) {
        data = { version: 2, defaultPersonaId: null, defaultEnabled: true, settings: { concentration: 80, showIntimacyBadge: true }, templates: { "tpl-init": { id: "tpl-init", name: "新角色", intimacy: 0, fields: emptyFields() } }, sessions: {} };
      }
      setStore({ data: data, loading: false });
      ctx.effect(() => ctx.interval(() => syncHostState(), 8000));
      if (!slots) return;
      slots.inject("settings.section", () => slots.register({ name: "settings.section", id: "persona-studio", order: 21, label: "角色养成" }, PersonaSection));
      slots.inject("shell.overlay", () => slots.register({ name: "shell.overlay", id: "persona-studio-modal", order: 100 }, EditorModal));
      slots.inject("shell.overlay", () => slots.register({ name: "shell.overlay", id: "persona-studio-picker", order: 101 }, PersonaPicker));
      slots.inject("conversation.session.header.utilities", () => slots.register({ name: "conversation.session.header.utilities", id: "persona-studio-session-ctrl", order: 90 }, SessionPersonaControl));
      slots.inject("conversation.session.header.utilities", () => slots.register({ name: "conversation.session.header.utilities", id: "persona-studio-intimacy", order: 100 }, HeaderIndicator));
      slots.inject("conversation.chat.turnTail", () => slots.register({ name: "conversation.chat.turnTail", select: () => ({ v: 1 }) }, TurnAvatar));
      slots.inject("conversation.input.left", () => slots.register({ name: "conversation.input.left", id: "persona-studio-chip", order: 100 }, PersonaChip));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
