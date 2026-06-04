// ============================================================
// Admin page HTML & API handlers — mirrors admin_page.py
// ============================================================

import type { CredentialPool } from "./credential-pool.js";
import type { ApiKeyManager } from "./api-key-manager.js";
import type { SellfoxOpenAPIService } from "./services.js";

export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sellfox 管理控制台</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f1117; --surface: #1a1d27; --border: #2a2d3a;
  --text: #e1e4ed; --text-muted: #8b8fa3; --accent: #4f8fff;
  --green: #34d399; --yellow: #fbbf24; --red: #f87171;
  --radius: 8px; --transition: 150ms ease;
}
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
.container { max-width: 1200px; margin: 0 auto; padding: 24px 20px; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 12px; }
h1 { font-size: 1.5rem; font-weight: 600; }
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: var(--radius); font-size: 0.875rem;
  font-weight: 500; cursor: pointer; border: 1px solid transparent;
  transition: background var(--transition), opacity var(--transition);
}
.btn:hover { opacity: 0.85; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-outline { background: transparent; border-color: var(--border); color: var(--text); }
.btn-outline:hover { background: var(--surface); }
.btn-danger { background: transparent; border-color: var(--red); color: var(--red); }
.btn-danger:hover { background: var(--red); color: #fff; }
.btn-sm { padding: 4px 10px; font-size: 0.75rem; }
.btn-xs { padding: 2px 8px; font-size: 0.7rem; }
.tabs { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
.tab-btn {
  padding: 10px 20px; font-size: 0.875rem; font-weight: 500; cursor: pointer;
  background: transparent; border: none; color: var(--text-muted);
  border-bottom: 2px solid transparent; transition: all var(--transition);
}
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab-btn:hover { color: var(--text); }
.tab-content { display: none; }
.tab-content.active { display: block; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; }
.stat-card .label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
.stat-card .value { font-size: 1.75rem; font-weight: 700; }
.table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; padding: 10px 14px; font-size: 0.72rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); }
td { padding: 10px 14px; font-size: 0.85rem; border-bottom: 1px solid var(--border); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(255,255,255,0.02); }
.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 500; }
.badge-green { background: rgba(52,211,153,0.15); color: var(--green); }
.badge-yellow { background: rgba(251,191,36,0.15); color: var(--yellow); }
.badge-gray { background: rgba(139,143,163,0.15); color: var(--text-muted); }
.badge-accent { background: rgba(79,143,255,0.15); color: var(--accent); }
.toggle { position: relative; display: inline-block; width: 40px; height: 22px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle .slider { position: absolute; cursor: pointer; inset: 0; background: #3a3d4a; border-radius: 22px; transition: var(--transition); }
.toggle .slider::before { content: ""; position: absolute; height: 16px; width: 16px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: var(--transition); }
.toggle input:checked + .slider { background: var(--accent); }
.toggle input:checked + .slider::before { transform: translateX(18px); }
.reveal { cursor: pointer; user-select: none; color: var(--text-muted); padding: 0 4px; }
.reveal:hover { color: var(--text); }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; width: 520px; max-width: 95vw; max-height: 85vh; overflow-y: auto; }
.modal h2 { margin-bottom: 16px; font-size: 1.1rem; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px; }
.form-group input, .form-group textarea { width: 100%; padding: 8px 12px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 0.875rem; }
.form-group textarea { resize: vertical; min-height: 60px; }
.form-group input:focus, .form-group textarea:focus { outline: none; border-color: var(--accent); }
.form-row { display: flex; gap: 12px; }
.form-row .form-group { flex: 1; }
.form-inline { display: flex; align-items: center; gap: 10px; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
.empty { text-align: center; padding: 48px 20px; color: var(--text-muted); }
.toast { position: fixed; bottom: 24px; right: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 20px; font-size: 0.875rem; z-index: 200; box-shadow: 0 4px 16px rgba(0,0,0,0.4); animation: fadeIn 0.2s ease; }
.toast-error { border-color: var(--red); }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.mono { font-family: "SF Mono", "Consolas", "Monaco", monospace; font-size: 0.78rem; }
.copy-btn { cursor: pointer; color: var(--text-muted); background: none; border: none; font-size: 0.85rem; padding: 2px 6px; }
.copy-btn:hover { color: var(--accent); }
.key-display { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.key-display code { flex: 1; word-break: break-all; font-size: 0.82rem; }
.flex { display: flex; } .flex-col { flex-direction: column; } .items-center { align-items: center; } .justify-between { justify-content: space-between; } .gap-1 { gap: 4px; } .gap-2 { gap: 8px; } .gap-3 { gap: 12px; }
.w-full { width: 100%; } .h-full { height: 100%; } .flex-1 { flex: 1; } .shrink-0 { flex-shrink: 0; }
.rounded { border-radius: 4px; } .rounded-lg { border-radius: 8px; }
.text-sm { font-size: 0.875rem; } .text-xs { font-size: 0.75rem; } .font-medium { font-weight: 500; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cursor-pointer { cursor: pointer; }
.hidden { display: none; }
.overflow-hidden { overflow: hidden; } .overflow-y-auto { overflow-y: auto; }
.border-t { border-top: 1px solid var(--border); }
.pt-3 { padding-top: 12px; } .pt-4 { padding-top: 16px; } .pb-3 { padding-bottom: 12px; }
.px-2 { padding-left: 8px; padding-right: 8px; } .px-3 { padding-left: 12px; padding-right: 12px; } .px-4 { padding-left: 16px; padding-right: 16px; }
.py-0\\.5 { padding-top: 2px; padding-bottom: 2px; } .py-1\\.5 { padding-top: 6px; padding-bottom: 6px; } .py-2 { padding-top: 8px; padding-bottom: 8px; }
.mt-3 { margin-top: 12px; } .mb-3 { margin-bottom: 12px; } .ml-auto { margin-left: auto; }
.space-y-2 > * + * { margin-top: 8px; }
.grid { display: grid; } .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
.relative { position: relative; } .absolute { position: absolute; }
.left-3 { left: 12px; } .top-1\\/2 { top: 50%; }
.-translate-y-1\\/2 { transform: translateY(-50%); }
.transition-colors { transition: color 0.15s, background-color 0.15s, border-color 0.15s; }
.transition-transform { transition: transform 0.15s; }
.transition-opacity { transition: opacity 0.15s; }
.rotate-90 { transform: rotate(90deg); }
.hover\\:bg-white\\/\\[0\\.02\\]:hover { background: rgba(255,255,255,0.02); }
.hover\\:bg-white\\/\\[0\\.04\\]:hover { background: rgba(255,255,255,0.04); }
.hover\\:opacity-85:hover { opacity: 0.85; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Sellfox 管理控制台</h1>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-outline btn-sm" onclick="refresh()">刷新</button>
    </div>
  </header>

  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('credentials')">凭据管理</button>
    <button class="tab-btn" onclick="switchTab('keys')">密钥权限</button>
  </div>

  <!-- Tab: Credentials -->
  <div id="tab-credentials" class="tab-content active">
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
      <button class="btn btn-primary btn-sm" onclick="showAddCredModal()">+ 添加凭据</button>
    </div>
    <div class="stats">
      <div class="stat-card"><div class="label">凭据总数</div><div class="value" style="color:var(--accent)" id="statCredTotal">-</div></div>
      <div class="stat-card"><div class="label">已启用</div><div class="value" style="color:var(--green)" id="statCredEnabled">-</div></div>
      <div class="stat-card"><div class="label">Token 有效</div><div class="value" style="color:var(--yellow)" id="statCredToken">-</div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Client ID</th><th>Secret</th><th>Token</th><th>最近使用</th><th>状态</th><th>操作</th></tr></thead>
        <tbody id="tbodyCreds"></tbody>
      </table>
    </div>
  </div>

  <!-- Tab: Keys -->
  <div id="tab-keys" class="tab-content">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <span style="font-size:0.78rem;color:var(--text-muted)" id="shopSyncInfo"></span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" onclick="syncShops()" id="btnSyncShops">同步店铺</button>
        <button class="btn btn-primary btn-sm" onclick="showAddKeyModal()">+ 添加密钥</button>
      </div>
    </div>
    <div class="stats">
      <div class="stat-card"><div class="label">密钥总数</div><div class="value" style="color:var(--accent)" id="statKeyTotal">-</div></div>
      <div class="stat-card"><div class="label">管理员</div><div class="value" style="color:var(--yellow)" id="statKeyAdmin">-</div></div>
      <div class="stat-card"><div class="label">已分配权限</div><div class="value" style="color:var(--green)" id="statKeyPerms">-</div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>序号</th><th>姓名</th><th>密钥</th><th>备注</th><th>店铺数</th><th>管理员</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody id="tbodyKeys"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
const KEYS_API = '/admin/api/keys';
const SHOPS_API = '/admin/api/shops';
const CRED_API = '/admin/api/credentials';

function apiKey() { var p = new URLSearchParams(location.search); return p.get('key') || p.get('token') || ''; }

async function request(url, method, body) {
  var headers = {'Content-Type': 'application/json'};
  var key = apiKey();
  var fullUrl = key ? url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key) : url;
  var res = await fetch(fullUrl, {method, headers, body: body ? JSON.stringify(body) : undefined});
  if (res.status === 401) { toast('鉴权失败', true); throw new Error('unauthorized'); }
  if (!res.ok) { var d = await res.json().catch(function(){return {};}); throw new Error(d.error || d.message || res.statusText); }
  return res.json();
}

function toast(msg, isError) {
  var el = document.createElement('div');
  el.className = 'toast' + (isError ? ' toast-error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function(){ el.remove(); }, 3000);
}
function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function mask(s, show) { return show ? '<span class="mono">' + esc(s) + '</span>' : '<span class="mono">' + esc(s.substring(0,8)) + '***</span>'; }
function timeAgo(ts) { if (!ts) return '-'; var diff = (Date.now()/1000) - ts; if (diff < 60) return '刚刚'; if (diff < 3600) return Math.floor(diff/60) + ' 分钟前'; if (diff < 86400) return Math.floor(diff/3600) + ' 小时前'; return Math.floor(diff/86400) + ' 天前'; }
function tokenExpiry(exp) { if (!exp) return null; var r = exp - (Date.now()/1000); if (r <= 0) return null; if (r < 3600) return Math.floor(r/60) + '分钟后过期'; if (r < 86400) return Math.floor(r/3600) + '小时后过期'; return Math.floor(r/86400) + '天后过期'; }

var currentTab = 'credentials';
function switchTab(name) {
  currentTab = name;
  document.getElementById('tab-credentials').classList.toggle('active', name === 'credentials');
  document.getElementById('tab-keys').classList.toggle('active', name === 'keys');
  var btns = document.querySelectorAll('.tab-btn');
  btns[0].classList.toggle('active', name === 'credentials');
  btns[1].classList.toggle('active', name === 'keys');
  refresh();
}

function refresh() {
  if (currentTab === 'credentials') loadCreds();
  else loadKeys();
}

// ==================== Credentials ====================
var credShow = {};

function loadCreds() {
  request(CRED_API, 'GET').then(function(d){
    d.credentials = d.credentials.map(function(c){
      var idk = c.client_id + '|id', sk = c.client_id + '|secret';
      c._showId = credShow[idk] || false; c._showSecret = credShow[sk] || false;
      return c;
    });
    renderCreds(d);
  }).catch(function(e){ if (e.message !== 'unauthorized') toast('加载凭据失败: ' + e.message, true); });
}

function renderCreds(data) {
  document.getElementById('statCredTotal').textContent = data.stats.total;
  document.getElementById('statCredEnabled').textContent = data.stats.enabled;
  document.getElementById('statCredToken').textContent = data.stats.with_valid_token;
  var tbody = document.getElementById('tbodyCreds');
  if (!data.credentials.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty">暂无凭据</div></td></tr>'; return; }
  tbody.innerHTML = data.credentials.map(function(c){
    var tl = c.token_valid ? '<span class="badge badge-green">有效</span> <span style="font-size:0.7rem;color:var(--text-muted)">' + esc(tokenExpiry(c.expires_at) || '') + '</span>' : c.access_token ? '<span class="badge badge-yellow">已过期</span>' : '<span class="badge badge-gray">无缓存</span>';
    return '<tr><td>' + mask(c.client_id, c._showId) + '<span class="reveal" onclick="toggleCredReveal(\\'' + esc(c.client_id) + '\\',\\'id\\')">' + (c._showId ? '🙈' : '👁') + '</span></td>' +
      '<td>' + mask(c.client_secret, c._showSecret) + '<span class="reveal" onclick="toggleCredReveal(\\'' + esc(c.client_id) + '\\',\\'secret\\')">' + (c._showSecret ? '🙈' : '👁') + '</span></td>' +
      '<td>' + tl + '</td><td style="font-size:0.8rem;color:var(--text-muted)">' + timeAgo(c.last_used_at) + '</td>' +
      '<td><label class="toggle"><input type="checkbox" ' + (c.enabled ? 'checked' : '') + ' onchange="toggleCred(\\'' + esc(c.client_id) + '\\', this.checked)"><span class="slider"></span></label></td>' +
      '<td><div class="actions"><button class="btn btn-outline btn-sm" onclick="clearCredToken(\\'' + esc(c.client_id) + '\\')">清 Token</button><button class="btn btn-danger btn-sm" onclick="removeCred(\\'' + esc(c.client_id) + '\\')">删除</button></div></td></tr>';
  }).join('');
}

function toggleCredReveal(cid, field) { var key = cid + '|' + field; credShow[key] = !credShow[key]; loadCreds(); }

async function toggleCred(cid, enabled) {
  try { await request(CRED_API, 'POST', {action:'toggle', client_id: cid, enabled: !!enabled}); } catch(e) { toast(e.message, true); loadCreds(); }
}

async function clearCredToken(cid) {
  if (!confirm('确认清除 ' + cid + ' 的缓存 token？')) return;
  try { await request(CRED_API, 'POST', {action:'clear_token', client_id: cid}); toast('Token 已清除'); loadCreds(); } catch(e) { toast(e.message, true); }
}

async function removeCred(cid) {
  if (!confirm('确认删除凭据 ' + cid + '？')) return;
  try { await request(CRED_API, 'POST', {action:'remove', client_id: cid}); toast('已删除'); loadCreds(); } catch(e) { toast(e.message, true); }
}

function showAddCredModal() {
  var overlay = document.createElement('div'); overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal"><h2>添加凭据</h2>' +
    '<div class="form-group"><label>Client ID</label><input id="addCredId" placeholder="SELLFOX_CLIENT_ID"></div>' +
    '<div class="form-group"><label>Client Secret</label><input id="addCredSecret" type="password" placeholder="SELLFOX_CLIENT_SECRET"></div>' +
    '<div class="modal-actions"><button class="btn btn-outline btn-sm" onclick="closeModal()">取消</button><button class="btn btn-primary btn-sm" onclick="addCred()">确认添加</button></div></div>';
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay); document.getElementById('addCredId').focus();
}

async function addCred() {
  var cid = document.getElementById('addCredId').value.trim();
  var sec = document.getElementById('addCredSecret').value.trim();
  if (!cid || !sec) { toast('请填写完整信息', true); return; }
  try { await request(CRED_API, 'POST', {action:'add', client_id: cid, client_secret: sec}); toast('添加成功'); closeModal(); loadCreds(); } catch(e) { toast(e.message, true); }
}

// ==================== Keys ====================
function loadKeys() {
  request(KEYS_API, 'GET').then(function(d){ renderKeys(d); }).catch(function(e){ if (e.message !== 'unauthorized') toast('加载密钥失败: ' + e.message, true); });
  request(SHOPS_API, 'GET').then(function(d){ syncInfo = d.sync_info || {count: 0, last_sync: null}; renderShopSyncInfo(); }).catch(function(){});
}

function renderKeys(data) {
  document.getElementById('statKeyTotal').textContent = data.stats.total;
  document.getElementById('statKeyAdmin').textContent = data.stats.admin_count;
  document.getElementById('statKeyPerms').textContent = data.stats.with_permissions;
  var tbody = document.getElementById('tbodyKeys');
  if (!data.keys.length) { tbody.innerHTML = '<tr><td colspan="8"><div class="empty">暂无密钥</div></td></tr>'; return; }
  tbody.innerHTML = data.keys.map(function(k){
    var adminBadge = k.is_admin ? '<span class="badge badge-accent">管理员</span>' : '<span class="badge badge-gray">普通</span>';
    return '<tr>' +
      '<td>' + (k.seq || '-') + '</td>' +
      '<td>' + esc(k.name || '-') + '</td>' +
      '<td><span class="mono">' + esc(k.key_value.substring(0,12)) + '***</span> <button class="copy-btn" onclick="copyKey(\\'' + esc(k.key_value) + '\\')">📋</button></td>' +
      '<td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(k.memo||'') + '">' + esc(k.memo || '-') + '</td>' +
      '<td><span class="badge badge-green">' + (k.shop_count || 0) + '</span></td>' +
      '<td><label class="toggle"><input type="checkbox" ' + (k.is_admin ? 'checked' : '') + ' onchange="toggleKeyAdmin(\\'' + esc(k.key_value) + '\\', this.checked)"><span class="slider"></span></label></td>' +
      '<td style="font-size:0.78rem;color:var(--text-muted)">' + esc(k.created_at || '-') + '</td>' +
      '<td><div class="actions">' +
        '<button class="btn btn-outline btn-xs" onclick="copyKey(\\'' + esc(k.key_value) + '\\')">复制</button>' +
        '<button class="btn btn-outline btn-xs" onclick="showPermModal(\\'' + esc(k.key_value) + '\\',\\'' + esc(k.name || k.key_value) + '\\')">权限</button>' +
        '<button class="btn btn-danger btn-xs" onclick="removeKey(\\'' + esc(k.key_value) + '\\')">删除</button>' +
      '</div></td></tr>';
  }).join('');
}

function copyKey(text) {
  if (navigator.clipboard) { navigator.clipboard.writeText(text).then(function(){ toast('已复制到剪贴板'); }); return; }
  var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  toast('已复制到剪贴板');
}

async function toggleKeyAdmin(kv, isAdmin) {
  try { await request(KEYS_API, 'POST', {action:'toggle_admin', key_value: kv, is_admin: !!isAdmin}); loadKeys(); } catch(e) { toast(e.message, true); loadKeys(); }
}

async function removeKey(kv) {
  if (!confirm('确认删除密钥 ' + kv.substring(0,12) + '***？')) return;
  try { await request(KEYS_API, 'POST', {action:'remove', key_value: kv}); toast('已删除'); loadKeys(); } catch(e) { toast(e.message, true); }
}

function showAddKeyModal() {
  var overlay = document.createElement('div'); overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal"><h2>添加密钥</h2>' +
    '<div class="form-row"><div class="form-group"><label>序号</label><input id="addKeySeq" type="number" value="0"></div>' +
    '<div class="form-group"><label>姓名</label><input id="addKeyName" placeholder="如：张三"></div></div>' +
    '<div class="form-group"><label>备注</label><input id="addKeyMemo" placeholder="用途说明"></div>' +
    '<div class="form-group"><div class="form-inline"><label style="margin:0;">密钥</label>' +
      '<button class="btn btn-outline btn-xs" onclick="genKey()">自动生成</button></div>' +
      '<div class="key-display"><code id="addKeyValue"></code></div></div>' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="addKeyAdmin"> 管理员</label></div>' +
    '<div class="modal-actions"><button class="btn btn-outline btn-sm" onclick="closeModal()">取消</button><button class="btn btn-primary btn-sm" onclick="addKey()">确认添加</button></div></div>';
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay); genKey(); document.getElementById('addKeyName').focus();
}

async function genKey() {
  try { var d = await request(KEYS_API, 'POST', {action:'generate_key'}); document.getElementById('addKeyValue').textContent = d.key_value; } catch(e) { toast(e.message, true); }
}

async function addKey() {
  var kv = document.getElementById('addKeyValue').textContent.trim();
  var name = document.getElementById('addKeyName').value.trim();
  var seq = parseInt(document.getElementById('addKeySeq').value) || 0;
  var memo = document.getElementById('addKeyMemo').value.trim();
  var isAdmin = document.getElementById('addKeyAdmin').checked;
  if (!name) { toast('请填写姓名', true); return; }
  if (!kv) { toast('请先生成密钥', true); return; }
  try { await request(KEYS_API, 'POST', {action:'add', key_value: kv, name: name, seq: seq, memo: memo, is_admin: isAdmin}); toast('添加成功'); closeModal(); loadKeys(); } catch(e) { toast(e.message, true); }
}

// ==================== Shop Sync ====================
var syncInfo = null;

function renderShopSyncInfo() {
  var el = document.getElementById('shopSyncInfo'); if (!el) return;
  if (!syncInfo || syncInfo.count === 0) { el.textContent = '暂无缓存'; return; }
  var t = syncInfo.last_sync || '';
  el.textContent = syncInfo.count + ' 个店铺' + (t ? ' | ' + t : '');
}

async function syncShops() {
  var btn = document.getElementById('btnSyncShops'); btn.disabled = true; btn.textContent = '同步中...';
  try {
    var d = await request(SHOPS_API, 'POST', {action: 'sync'});
    toast(d.count + ' 个店铺已同步'); syncInfo = {count: d.count, last_sync: new Date().toLocaleString()}; renderShopSyncInfo();
  } catch(e) { toast('同步失败: ' + e.message, true); }
  finally { btn.disabled = false; btn.textContent = '同步店铺'; }
}

// ==================== Shop Permission Modal ====================
var permShops = []; var permGroups = []; var permAuthorized = {}; var permKeyValue = ''; var permUserName = '';

var REGION_MAP = {
  '北美区': {label:'北美区 (US/CA/MX/BR)', codes:['US','CA','MX','BR'], order:1},
  '欧洲区': {label:'欧洲区 (UK/DE/FR/IT/ES...)', codes:['UK','DE','FR','IT','ES','NL','BE','SE','PL','SA','AE','IN','TR','EG','ZA'], order:2},
  '亚太区': {label:'亚太区 (JP/AU/SG)', codes:['JP','AU','SG'], order:3},
  '其他': {label:'其他站点', codes:[], order:99}
};

function extractCountryCode(name) { var parts = (name||'').split('-'); return parts.length > 1 ? parts[parts.length-1].toUpperCase() : 'OTHER'; }

function groupShopsByRegion(shops) {
  var groups = {};
  shops.forEach(function(s){
    var cc = extractCountryCode(s.shop_name);
    var regionKey = '其他';
    for (var rk in REGION_MAP) { if (REGION_MAP[rk].codes.indexOf(cc) !== -1) { regionKey = rk; break; } if (rk === '其他') continue; }
    if (!groups[regionKey]) { groups[regionKey] = {region: REGION_MAP[regionKey].label, order: REGION_MAP[regionKey].order, shops: [], countries: []}; }
    groups[regionKey].shops.push(s);
    if (groups[regionKey].countries.indexOf(cc) === -1) groups[regionKey].countries.push(cc);
  });
  return Object.values(groups).sort(function(a,b){ return a.order - b.order; });
}

async function showPermModal(kv, name) {
  permKeyValue = kv; permUserName = name || kv;
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay'; overlay.id = 'permModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closePermModal(); });
  var card = document.createElement('div');
  card.style.cssText = 'background:#1a1d27;border:1px solid #2a2d3a;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);width:720px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;padding:24px;';
  card.innerHTML = '<div class="text-center py-8" style="padding:32px;text-align:center;color:#8b8fa3">加载中...</div>';
  overlay.appendChild(card); document.body.appendChild(overlay);
  try {
    var d1 = await request(SHOPS_API, 'GET');
    syncInfo = d1.sync_info || {count: 0, last_sync: null}; renderShopSyncInfo();
    permShops = (d1.shops || []).map(function(s){ return {shop_id: String(s.shopId||''), shop_name: String(s.shopName||'')}; });
    permGroups = groupShopsByRegion(permShops);
    permGroups.forEach(function(g){ g.expanded = true; });
    var d2 = await request(KEYS_API, 'POST', {action:'get_permissions', key_value: kv});
    permAuthorized = {};
    (d2.shops||[]).forEach(function(s){ permAuthorized[s.shop_id] = true; });
    card.innerHTML = buildPermModalHTML();
  } catch(e) { card.innerHTML = '<div class="text-center py-8" style="padding:32px;text-align:center;color:#f87171">加载失败: ' + esc(e.message) + '</div>'; }
}

function buildPermModalHTML() {
  var totalSelected = 0;
  var groupsHTML = permGroups.map(function(g, gi) {
    var groupSelected = 0;
    var shopsHTML = g.shops.map(function(s) {
      var checked = permAuthorized[s.shop_id] ? ' checked' : '';
      if (checked) { groupSelected++; totalSelected++; }
      return '<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:4px" title="' + esc(s.shop_name) + ' (ID:' + esc(s.shop_id) + ')">' +
        '<input type="checkbox" value="' + esc(s.shop_id) + '"' + checked + ' class="perm-shop-cb" data-group="' + gi + '" onchange="updatePermCounts()" style="width:16px;height:16px;accent-color:#4f8fff">' +
        '<span style="font-size:13px;color:#e1e4ed;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.shop_name) + '</span></label>';
    }).join('');
    var allChecked = groupSelected === g.shops.length;
    return '<div class="perm-group" data-group="' + gi + '" style="border:1px solid #2a2d3a;border-radius:8px;overflow:hidden">' +
      '<button style="width:100%;display:flex;align-items:center;gap:12px;padding:10px 16px;background:transparent;border:none;color:#e1e4ed;cursor:pointer;text-align:left" onclick="toggleGroup(' + gi + ')">' +
        '<span class="perm-chevron' + (g.expanded ? ' rotate-90' : '') + '" style="display:inline-block;transition:transform 0.15s;color:#8b8fa3">▶</span>' +
        '<input type="checkbox" class="perm-group-cb" ' + (allChecked ? 'checked' : '') + ' data-group="' + gi + '" onclick="event.stopPropagation(); toggleGroupAll(' + gi + ', this.checked)" onchange="updatePermCounts()" style="width:16px;height:16px;accent-color:#4f8fff">' +
        '<span style="font-size:14px;font-weight:500">' + esc(g.region) + '</span>' +
        '<span style="padding:1px 8px;border-radius:12px;font-size:11px;background:rgba(255,255,255,0.06);color:#8b8fa3">' + g.shops.length + '</span>' +
        (groupSelected > 0 ? '<span style="padding:1px 8px;border-radius:12px;font-size:11px;background:rgba(79,143,255,0.15);color:#4f8fff;margin-left:auto">' + groupSelected + '</span>' : '') +
      '</button>' +
      '<div class="perm-group-body' + (g.expanded ? '' : ' hidden') + '">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:0 16px 12px">' + shopsHTML + '</div>' +
      '</div></div>';
  }).join('');

  var totalShops = permShops.length;
  return '<div style="display:flex;flex-direction:column;height:100%">' +
    '<div style="padding-bottom:16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
        '<h2 style="font-size:18px;font-weight:600;color:#e1e4ed">店铺权限</h2>' +
        '<span style="font-size:14px;color:#8b8fa3">' + esc(permUserName) + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<div style="position:relative;flex:1">' +
          '<input id="permSearch" style="width:100%;padding:8px 12px 8px 36px;background:#0f1117;border:1px solid #2a2d3a;border-radius:8px;font-size:14px;color:#e1e4ed" placeholder="搜索店铺..." oninput="filterPermShops()">' +
        '</div>' +
        '<button id="permSelectAllBtn" style="padding:8px 12px;font-size:12px;border:1px solid #2a2d3a;border-radius:8px;background:transparent;color:#e1e4ed;cursor:pointer" onclick="toggleAllVisible()">全选</button>' +
      '</div>' +
    '</div>' +
    '<div style="flex:1;overflow-y:auto;max-height:55vh" class="space-y-2">' +
      (groupsHTML || '<div style="text-align:center;padding:48px;color:#8b8fa3;font-size:14px">无匹配店铺</div>') +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:16px;border-top:1px solid #2a2d3a;margin-top:12px">' +
      '<span style="font-size:14px;color:#8b8fa3">已选 <span id="permSelectedCount" style="color:#4f8fff;font-weight:500">' + totalSelected + '</span> / ' + totalShops + ' 个店铺</span>' +
      '<div style="display:flex;gap:8px">' +
        '<button style="padding:8px 16px;font-size:14px;border:1px solid #2a2d3a;border-radius:8px;background:transparent;color:#e1e4ed;cursor:pointer" onclick="closePermModal()">取消</button>' +
        '<button style="padding:8px 16px;font-size:14px;background:#4f8fff;border:none;border-radius:8px;color:white;cursor:pointer" onclick="savePerms()">保存权限</button>' +
      '</div>' +
    '</div></div>';
}

function filterPermShops() {
  var q = (document.getElementById('permSearch').value||'').toLowerCase().trim();
  permGroups.forEach(function(g, gi){
    var visible = 0;
    document.querySelectorAll('.perm-shop-cb[data-group="' + gi + '"]').forEach(function(cb){
      var label = cb.closest('label');
      var name = (label.getAttribute('title')||'').toLowerCase();
      var match = !q || name.indexOf(q) !== -1 || cb.value.indexOf(q) !== -1;
      label.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    var groupEl = document.querySelector('.perm-group[data-group="' + gi + '"]');
    if (groupEl) groupEl.style.display = visible > 0 ? '' : 'none';
  });
  updatePermCounts();
}

function toggleGroup(gi) {
  var body = document.querySelector('.perm-group[data-group="' + gi + '"] .perm-group-body');
  var chevron = document.querySelector('.perm-group[data-group="' + gi + '"] .perm-chevron');
  if (body) body.classList.toggle('hidden');
  if (chevron) chevron.classList.toggle('rotate-90');
}

function toggleGroupAll(gi, checked) {
  document.querySelectorAll('.perm-shop-cb[data-group="' + gi + '"]').forEach(function(cb){
    if (cb.closest('label').style.display !== 'none') cb.checked = checked;
  });
  updatePermCounts();
}

function toggleAllVisible() {
  var anyUnchecked = false;
  document.querySelectorAll('.perm-shop-cb').forEach(function(cb){
    if (cb.closest('label').style.display !== 'none' && !cb.checked) anyUnchecked = true;
  });
  document.querySelectorAll('.perm-shop-cb').forEach(function(cb){
    if (cb.closest('label').style.display !== 'none') cb.checked = anyUnchecked;
  });
  updatePermCounts();
}

function updatePermCounts() {
  var totalSelected = 0;
  permGroups.forEach(function(g, gi){
    var groupSelected = 0; var visibleTotal = 0;
    document.querySelectorAll('.perm-shop-cb[data-group="' + gi + '"]').forEach(function(cb){
      if (cb.checked) groupSelected++;
      if (cb.closest('label').style.display !== 'none') visibleTotal++;
    });
    totalSelected += groupSelected;
    var groupCb = document.querySelector('.perm-group-cb[data-group="' + gi + '"]');
    if (groupCb) {
      var visibleChecked = 0;
      document.querySelectorAll('.perm-shop-cb[data-group="' + gi + '"]').forEach(function(cb){
        if (cb.closest('label').style.display !== 'none' && cb.checked) visibleChecked++;
      });
      groupCb.checked = visibleTotal > 0 && visibleChecked === visibleTotal;
      groupCb.indeterminate = visibleChecked > 0 && visibleChecked < visibleTotal;
    }
  });
  var countEl = document.getElementById('permSelectedCount'); if (countEl) countEl.textContent = totalSelected;
  var btn = document.getElementById('permSelectAllBtn'); if (btn) {
    var allChecked = true;
    document.querySelectorAll('.perm-shop-cb').forEach(function(cb){
      if (cb.closest('label').style.display !== 'none' && !cb.checked) allChecked = false;
    });
    btn.textContent = allChecked ? '取消全选' : '全选';
  }
}

async function savePerms() {
  var shops = [];
  document.querySelectorAll('.perm-shop-cb:checked').forEach(function(cb){
    var info = permShops.find(function(s){ return s.shop_id === cb.value; });
    shops.push({shop_id: cb.value, shop_name: info ? info.shop_name : ''});
  });
  try { await request(KEYS_API, 'POST', {action:'set_permissions', key_value: permKeyValue, shops: shops}); toast('权限已保存（' + shops.length + ' 个店铺）'); closePermModal(); loadKeys(); } catch(e) { toast(e.message, true); }
}

function closePermModal() { var el = document.getElementById('permModalOverlay'); if (el) el.remove(); }
function closeModal() { var o = document.querySelector('.modal-overlay'); if (o) o.remove(); }
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeModal(); });

loadCreds();
setInterval(refresh, 30000);
</script>
</body>
</html>`;

// ---- Admin API handlers ----

export async function handleAdminApi(
  pool: CredentialPool,
  method: string,
  path: string,
  body: Buffer | null,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  if (method === "GET" && path === "/admin/api/credentials") {
    const records = await pool.listAll();
    const stats = await pool.stats();
    return {
      status: 200,
      payload: {
        ok: true,
        stats,
        credentials: records.map((r) => ({
          id: r.id,
          client_id: r.client_id,
          client_secret: r.client_secret.slice(0, 8) + "***",
          access_token: r.access_token ? r.access_token.slice(0, 16) + "***" : null,
          expires_at: r.expires_at,
          last_used_at: r.last_used_at,
          enabled: r.enabled,
          created_at: r.created_at,
          token_valid: r.access_token != null && r.expires_at != null && r.expires_at > Math.floor(Date.now() / 1000) + 120,
        })),
      },
    };
  }

  if (method === "POST" && path.startsWith("/admin/api/credentials")) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse((body ?? Buffer.alloc(0)).toString("utf-8"));
    } catch {
      return { status: 400, payload: { ok: false, error: "invalid_json" } };
    }

    const action = String(data["action"] ?? "");
    const client_id = String(data["client_id"] ?? "").trim();

    if (action === "add") {
      const secret = String(data["client_secret"] ?? "").trim();
      if (!client_id || !secret) {
        return { status: 400, payload: { ok: false, error: "client_id 和 client_secret 不能为空" } };
      }
      const ok = await pool.add(client_id, secret);
      if (!ok) {
        return { status: 409, payload: { ok: false, error: `client_id '${client_id}' 已存在` } };
      }
      return { status: 200, payload: { ok: true, action: "add", client_id } };
    }

    if (action === "remove") {
      await pool.remove(client_id);
      await pool.clearToken(client_id);
      return { status: 200, payload: { ok: true, action: "remove", client_id } };
    }

    if (action === "toggle") {
      const enabled = Boolean(data["enabled"]);
      await pool.setEnabled(client_id, enabled);
      return { status: 200, payload: { ok: true, action: "toggle", client_id, enabled } };
    }

    if (action === "clear_token") {
      await pool.clearToken(client_id);
      return { status: 200, payload: { ok: true, action: "clear_token", client_id } };
    }

    return { status: 400, payload: { ok: false, error: `未知 action: ${action}` } };
  }

  return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
}

export async function handleKeyAdminApi(
  apiKeyMgr: ApiKeyManager,
  service: { sellerLists(): Promise<{ data: Record<string, unknown>[] }> },
  method: string,
  path: string,
  body: Buffer | null,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  // GET /admin/api/shops
  if (method === "GET" && path === "/admin/api/shops") {
    try {
      const shops = await apiKeyMgr.getCachedShops();
      const syncInfo = await apiKeyMgr.getShopSyncInfo();
      const shopsOut = shops.map((s) => ({
        shopId: s["shop_id"],
        shopName: s["shop_name"],
        marketplaceId: s["marketplace_id"],
        region: s["region"],
        sellerId: s["seller_id"],
        adStatus: s["ad_status"],
        status: s["status"],
      }));
      return { status: 200, payload: { ok: true, shops: shopsOut, sync_info: syncInfo } };
    } catch (err) {
      return { status: 500, payload: { ok: false, error: String(err) } };
    }
  }

  // POST /admin/api/shops
  if (method === "POST" && path === "/admin/api/shops") {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse((body ?? Buffer.alloc(0)).toString("utf-8"));
    } catch {
      return { status: 400, payload: { ok: false, error: "invalid_json" } };
    }
    const action = String(data["action"] ?? "");
    if (action === "sync") {
      try {
        const result = await service.sellerLists();
        const shops = result.data;
        const count = await apiKeyMgr.syncShops(shops);
        return { status: 200, payload: { ok: true, action: "sync", count } };
      } catch (err) {
        return { status: 500, payload: { ok: false, error: String(err) } };
      }
    }
    return { status: 400, payload: { ok: false, error: `未知 action: ${action}` } };
  }

  // GET /admin/api/keys
  if (method === "GET" && path === "/admin/api/keys") {
    const keys = await apiKeyMgr.listKeys();
    const stats = await apiKeyMgr.stats();
    const resultKeys = await Promise.all(
      keys.map(async (k) => {
        const kv = k["key_value"] as string;
        const shops = await apiKeyMgr.getAuthorizedShops(kv);
        return { ...k, shop_count: shops.length, shops };
      }),
    );
    return { status: 200, payload: { ok: true, stats, keys: resultKeys } };
  }

  // POST /admin/api/keys/*
  if (method === "POST") {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse((body ?? Buffer.alloc(0)).toString("utf-8"));
    } catch {
      return { status: 400, payload: { ok: false, error: "invalid_json" } };
    }

    const action = String(data["action"] ?? "");
    const key_value = String(data["key_value"] ?? "").trim();

    if (action === "add") {
      const seq = Number(data["seq"] ?? 0);
      const name = String(data["name"] ?? "").trim();
      const memo = String(data["memo"] ?? "").trim();
      const is_admin = Boolean(data["is_admin"]);
      const generated = await apiKeyMgr.addKey({ seq, name, key_value, memo, is_admin });
      return { status: 200, payload: { ok: true, action: "add", key_value: generated } };
    }

    if (action === "remove") {
      if (!key_value) return { status: 400, payload: { ok: false, error: "缺少 key_value" } };
      await apiKeyMgr.removeKey(key_value);
      return { status: 200, payload: { ok: true, action: "remove" } };
    }

    if (action === "toggle_admin") {
      if (!key_value) return { status: 400, payload: { ok: false, error: "缺少 key_value" } };
      const isAdmin = Boolean(data["is_admin"]);
      await apiKeyMgr.setAdmin(key_value, isAdmin);
      return { status: 200, payload: { ok: true, action: "toggle_admin", is_admin: isAdmin } };
    }

    if (action === "generate_key") {
      return { status: 200, payload: { ok: true, key_value: apiKeyMgr.generateKeyValue() } };
    }

    if (action === "get_permissions") {
      if (!key_value) return { status: 400, payload: { ok: false, error: "缺少 key_value" } };
      const shops = await apiKeyMgr.getAuthorizedShops(key_value);
      return { status: 200, payload: { ok: true, shops } };
    }

    if (action === "set_permissions") {
      if (!key_value) return { status: 400, payload: { ok: false, error: "缺少 key_value" } };
      const shopsRaw = data["shops"];
      if (!Array.isArray(shopsRaw)) return { status: 400, payload: { ok: false, error: "shops 应为数组" } };
      const shops = shopsRaw.map((s: Record<string, unknown>) => ({
        shop_id: String(s["shop_id"] ?? ""),
        shop_name: String(s["shop_name"] ?? ""),
      }));
      await apiKeyMgr.setShopPermissions(key_value, shops);
      return { status: 200, payload: { ok: true, action: "set_permissions", count: shops.length } };
    }

    if (action === "update") {
      if (!key_value) return { status: 400, payload: { ok: false, error: "缺少 key_value" } };
      const seq: number | undefined = data["seq"] != null ? Number(data["seq"]) : undefined;
      const name: string | undefined = String(data["name"] ?? "").trim() || undefined;
      const memo: string | undefined = String(data["memo"] ?? "").trim() || undefined;
      await apiKeyMgr.updateKey(key_value, { seq, name, memo });
      return { status: 200, payload: { ok: true, action: "update" } };
    }

    return { status: 400, payload: { ok: false, error: `未知 action: ${action}` } };
  }

  return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
}
