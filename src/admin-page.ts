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
<link rel="stylesheet" href="/admin.css">
</head>
<body class="bg-background text-foreground min-h-screen font-sans antialiased">
<div class="max-w-[1200px] mx-auto px-5 py-6">
  <header class="flex justify-between items-center mb-1 flex-wrap gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">Sellfox 管理控制台</h1>
    <div class="flex gap-2">
      <button class="btn btn-outline btn-sm" onclick="refresh()">刷新</button>
    </div>
  </header>

  <div class="flex gap-0 mb-5 border-b border-border">
    <button class="tab-btn active" onclick="switchTab('credentials')">凭据管理</button>
    <button class="tab-btn" onclick="switchTab('keys')">密钥权限</button>
  </div>

  <!-- Tab: Credentials -->
  <div id="tab-credentials" class="tab-content block">
    <div class="flex justify-end mb-4">
      <button class="btn btn-primary btn-sm" onclick="showAddCredModal()">+ 添加凭据</button>
    </div>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 mb-6">
      <div class="stat-card"><div class="stat-label">凭据总数</div><div class="stat-value text-primary" id="statCredTotal">-</div></div>
      <div class="stat-card"><div class="stat-label">已启用</div><div class="stat-value text-green-400" id="statCredEnabled">-</div></div>
      <div class="stat-card"><div class="stat-label">Token 有效</div><div class="stat-value text-amber-400" id="statCredToken">-</div></div>
    </div>
    <div class="table-wrap">
      <table class="w-full border-collapse">
        <thead><tr>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Client ID</th>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Secret</th>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Token</th>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">最近使用</th>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">状态</th>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">操作</th>
        </tr></thead>
        <tbody id="tbodyCreds"></tbody>
      </table>
    </div>
  </div>

  <!-- Tab: Keys -->
  <div id="tab-keys" class="tab-content hidden">
    <div class="flex justify-between items-center mb-4">
      <span class="text-xs text-muted-foreground" id="shopSyncInfo"></span>
      <div class="flex gap-2">
        <button class="btn btn-outline btn-sm" onclick="syncShops()" id="btnSyncShops">同步店铺</button>
        <button class="btn btn-primary btn-sm" onclick="showAddKeyModal()">+ 添加密钥</button>
      </div>
    </div>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 mb-6">
      <div class="stat-card"><div class="stat-label">密钥总数</div><div class="stat-value text-primary" id="statKeyTotal">-</div></div>
      <div class="stat-card"><div class="stat-label">管理员</div><div class="stat-value text-amber-400" id="statKeyAdmin">-</div></div>
      <div class="stat-card"><div class="stat-label">已分配权限</div><div class="stat-value text-green-400" id="statKeyPerms">-</div></div>
    </div>
    <div class="table-wrap">
      <table class="w-full border-collapse">
        <thead><tr>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">序号</th>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">姓名</th>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">密钥</th>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">备注</th>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">店铺数</th>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">管理员</th>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">创建时间</th>
          <th class="text-left px-4 py-2.5 text-[0.72rem] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">操作</th>
        </tr></thead>
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
  var credTab = document.getElementById('tab-credentials');
  var keysTab = document.getElementById('tab-keys');
  credTab.classList.toggle('hidden', name !== 'credentials');
  credTab.classList.toggle('block', name === 'credentials');
  keysTab.classList.toggle('hidden', name !== 'keys');
  keysTab.classList.toggle('block', name === 'keys');
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
  if (!data.credentials.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">暂无凭据</div></td></tr>'; return; }
  tbody.innerHTML = data.credentials.map(function(c){
    var tl = c.token_valid ? '<span class="badge badge-green">有效</span> <span class="text-[0.7rem] text-muted-foreground">' + esc(tokenExpiry(c.expires_at) || '') + '</span>' : c.access_token ? '<span class="badge badge-amber">已过期</span>' : '<span class="badge badge-muted">无缓存</span>';
    return '<tr>' +
      '<td class="px-4 py-2.5 text-sm border-b border-border">' + mask(c.client_id, c._showId) + '<span class="reveal" onclick="toggleCredReveal(\\'' + esc(c.client_id) + '\\',\\'id\\')">' + (c._showId ? '🙈' : '👁') + '</span></td>' +
      '<td class="px-4 py-2.5 text-sm border-b border-border">' + mask(c.client_secret, c._showSecret) + '<span class="reveal" onclick="toggleCredReveal(\\'' + esc(c.client_id) + '\\',\\'secret\\')">' + (c._showSecret ? '🙈' : '👁') + '</span></td>' +
      '<td class="px-4 py-2.5 text-sm border-b border-border">' + tl + '</td>' +
      '<td class="px-4 py-2.5 text-sm text-muted-foreground border-b border-border">' + timeAgo(c.last_used_at) + '</td>' +
      '<td class="px-4 py-2.5 border-b border-border"><label class="toggle-track"><input type="checkbox" ' + (c.enabled ? 'checked' : '') + ' onchange="toggleCred(\\'' + esc(c.client_id) + '\\', this.checked)"><span class="toggle-thumb"></span></label></td>' +
      '<td class="px-4 py-2.5 border-b border-border"><div class="flex gap-1.5 flex-wrap"><button class="btn btn-outline btn-sm" onclick="clearCredToken(\\'' + esc(c.client_id) + '\\')">清 Token</button><button class="btn btn-danger btn-sm" onclick="removeCred(\\'' + esc(c.client_id) + '\\')">删除</button></div></td></tr>';
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
  overlay.innerHTML = '<div class="modal"><h2 class="text-lg font-semibold mb-4">添加凭据</h2>' +
    '<div class="form-group"><label class="form-label">Client ID</label><input id="addCredId" class="form-input" placeholder="SELLFOX_CLIENT_ID"></div>' +
    '<div class="form-group"><label class="form-label">Client Secret</label><input id="addCredSecret" type="password" class="form-input" placeholder="SELLFOX_CLIENT_SECRET"></div>' +
    '<div class="flex gap-2 justify-end mt-5"><button class="btn btn-outline btn-sm" onclick="closeModal()">取消</button><button class="btn btn-primary btn-sm" onclick="addCred()">确认添加</button></div></div>';
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
  if (!data.keys.length) { tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">暂无密钥</div></td></tr>'; return; }
  tbody.innerHTML = data.keys.map(function(k){
    var adminBadge = k.is_admin ? '<span class="badge badge-accent">管理员</span>' : '<span class="badge badge-muted">普通</span>';
    return '<tr>' +
      '<td class="px-4 py-2.5 text-sm border-b border-border">' + (k.seq || '-') + '</td>' +
      '<td class="px-4 py-2.5 text-sm border-b border-border">' + esc(k.name || '-') + '</td>' +
      '<td class="px-4 py-2.5 text-sm border-b border-border"><span class="mono">' + esc(k.key_value.substring(0,12)) + '***</span> <button class="copy-btn" onclick="copyKey(\\'' + esc(k.key_value) + '\\')">📋</button></td>' +
      '<td class="px-4 py-2.5 text-sm border-b border-border max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap" title="' + esc(k.memo||'') + '">' + esc(k.memo || '-') + '</td>' +
      '<td class="px-4 py-2.5 border-b border-border"><span class="badge badge-green">' + (k.shop_count || 0) + '</span></td>' +
      '<td class="px-4 py-2.5 border-b border-border"><label class="toggle-track"><input type="checkbox" ' + (k.is_admin ? 'checked' : '') + ' onchange="toggleKeyAdmin(\\'' + esc(k.key_value) + '\\', this.checked)"><span class="toggle-thumb"></span></label></td>' +
      '<td class="px-4 py-2.5 text-sm text-muted-foreground border-b border-border">' + esc(k.created_at || '-') + '</td>' +
      '<td class="px-4 py-2.5 border-b border-border"><div class="flex gap-1.5 flex-wrap">' +
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
  overlay.innerHTML = '<div class="modal"><h2 class="text-lg font-semibold mb-4">添加密钥</h2>' +
    '<div class="flex gap-3"><div class="form-group flex-1"><label class="form-label">序号</label><input id="addKeySeq" type="number" value="0" class="form-input"></div>' +
    '<div class="form-group flex-1"><label class="form-label">姓名</label><input id="addKeyName" class="form-input" placeholder="如：张三"></div></div>' +
    '<div class="form-group"><label class="form-label">备注</label><input id="addKeyMemo" class="form-input" placeholder="用途说明"></div>' +
    '<div class="form-group"><div class="flex items-center gap-2.5"><label class="form-label mb-0">密钥</label>' +
      '<button class="btn btn-outline btn-xs" onclick="genKey()">自动生成</button></div>' +
      '<div class="key-display"><code id="addKeyValue" class="flex-1 break-all text-sm"></code></div></div>' +
    '<div class="form-group"><label class="flex items-center gap-2 cursor-pointer text-sm"><input type="checkbox" id="addKeyAdmin" class="w-4 h-4 rounded border-input accent-primary"> 管理员</label></div>' +
    '<div class="flex gap-2 justify-end mt-5"><button class="btn btn-outline btn-sm" onclick="closeModal()">取消</button><button class="btn btn-primary btn-sm" onclick="addKey()">确认添加</button></div></div>';
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
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closePermModal(); });
  var card = document.createElement('div');
  card.className = 'modal w-[720px] max-h-[90vh] flex flex-col';
  card.innerHTML = '<div class="text-center py-8 text-muted-foreground">加载中...</div>';
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
  } catch(e) { card.innerHTML = '<div class="text-center py-8 text-destructive">加载失败: ' + esc(e.message) + '</div>'; }
}

function buildPermModalHTML() {
  var totalSelected = 0;
  var groupsHTML = permGroups.map(function(g, gi) {
    var groupSelected = 0;
    var shopsHTML = g.shops.map(function(s) {
      var checked = permAuthorized[s.shop_id] ? ' checked' : '';
      if (checked) { groupSelected++; totalSelected++; }
      return '<label class="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded hover:bg-accent/50 transition-colors" title="' + esc(s.shop_name) + ' (ID:' + esc(s.shop_id) + ')">' +
        '<input type="checkbox" value="' + esc(s.shop_id) + '"' + checked + ' class="perm-shop-cb w-4 h-4 rounded border-input accent-primary" data-group="' + gi + '" onchange="updatePermCounts()">' +
        '<span class="text-[13px] text-foreground truncate">' + esc(s.shop_name) + '</span></label>';
    }).join('');
    var allChecked = groupSelected === g.shops.length && g.shops.length > 0;
    return '<div class="perm-group border border-border rounded-lg overflow-hidden" data-group="' + gi + '">' +
      '<button class="w-full flex items-center gap-3 px-4 py-2.5 bg-transparent border-none text-foreground cursor-pointer text-left hover:bg-accent/30 transition-colors" onclick="toggleGroup(' + gi + ')">' +
        '<span class="perm-chevron inline-block transition-transform duration-150 text-muted-foreground' + (g.expanded ? ' rotate-90' : '') + '">▶</span>' +
        '<input type="checkbox" class="perm-group-cb w-4 h-4 rounded border-input accent-primary" ' + (allChecked ? 'checked' : '') + ' data-group="' + gi + '" onclick="event.stopPropagation(); toggleGroupAll(' + gi + ', this.checked)" onchange="updatePermCounts()">' +
        '<span class="text-sm font-medium">' + esc(g.region) + '</span>' +
        '<span class="px-2 py-0.5 rounded-full text-[11px] bg-foreground/5 text-muted-foreground">' + g.shops.length + '</span>' +
        (groupSelected > 0 ? '<span class="ml-auto px-2 py-0.5 rounded-full text-[11px] bg-primary/15 text-primary">' + groupSelected + '</span>' : '') +
      '</button>' +
      '<div class="perm-group-body' + (g.expanded ? '' : ' hidden') + '">' +
        '<div class="grid grid-cols-2 gap-1 px-4 pb-3">' + shopsHTML + '</div>' +
      '</div></div>';
  }).join('');

  var totalShops = permShops.length;
  return '<div class="flex flex-col h-full">' +
    '<div class="pb-4">' +
      '<div class="flex justify-between items-center mb-3">' +
        '<h2 class="text-lg font-semibold text-foreground">店铺权限</h2>' +
        '<span class="text-sm text-muted-foreground">' + esc(permUserName) + '</span>' +
      '</div>' +
      '<div class="flex items-center gap-2">' +
        '<div class="relative flex-1">' +
          '<svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>' +
          '<input id="permSearch" class="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background placeholder:text-muted-foreground" placeholder="搜索店铺..." oninput="filterPermShops()">' +
        '</div>' +
        '<button id="permSelectAllBtn" class="btn btn-outline btn-sm shrink-0" onclick="toggleAllVisible()">全选</button>' +
      '</div>' +
    '</div>' +
    '<div class="flex-1 overflow-y-auto max-h-[55vh] space-y-2">' +
      (groupsHTML || '<div class="text-center py-12 text-muted-foreground text-sm">无匹配店铺</div>') +
    '</div>' +
    '<div class="flex justify-between items-center pt-4 border-t border-border mt-3">' +
      '<span class="text-sm text-muted-foreground">已选 <span id="permSelectedCount" class="text-primary font-medium">' + totalSelected + '</span> / ' + totalShops + ' 个店铺</span>' +
      '<div class="flex gap-2">' +
        '<button class="btn btn-outline btn-sm" onclick="closePermModal()">取消</button>' +
        '<button class="btn btn-primary btn-sm" onclick="savePerms()">保存权限</button>' +
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
