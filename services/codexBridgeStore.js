const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ID = /^[a-zA-Z0-9_-]{1,100}$/;
function checkedId(value) {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error('Invalid bridge ID');
  return value;
}
function validateRoute(route) {
  for (const key of ['id', 'deviceId', 'threadId', 'hostId']) checkedId(route[key]);
  if (!/^[1-9]\d*$/.test(String(route.ownerId))) throw new Error('Invalid private owner ID');
  if (typeof route.title !== 'string' || route.title.length > 500) throw new Error('Invalid title');
  if (!Array.isArray(route.recommendations) || route.recommendations.length > 5) throw new Error('Up to 5 recommendations allowed');
  for (const item of route.recommendations) {
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 60 ||
        typeof item.prompt !== 'string' || !item.prompt.trim() || item.prompt.length > 12000) throw new Error('Invalid recommendation');
  }
  return route;
}

class BridgeStore {
  constructor(root) {
    this.root = root;
    for (const dir of ['routes', 'messages', 'pending', 'processing', 'done', 'dedupe']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  file(dir, id) { return path.join(this.root, dir, checkedId(id) + '.json'); }
  read(dir, id) {
    try { return JSON.parse(fs.readFileSync(this.file(dir, id), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  writeNew(dir, id, value) { fs.writeFileSync(this.file(dir, id), JSON.stringify(value), { flag: 'wx', mode: 0o600 }); }
  register(route) {
    validateRoute(route);
    this.writeNew('routes', route.id, { ...route, createdAt: new Date().toISOString() });
  }
  route(id) { return this.read('routes', id); }
  bind(id, messageId) {
    const route = this.route(id);
    if (!route || !Number.isSafeInteger(messageId) || messageId <= 0) throw new Error('Invalid message binding');
    const key = `${route.ownerId}_${messageId}`;
    const existing = this.read('messages', key);
    if (existing?.routeId === id) return;
    this.writeNew('messages', key, { routeId: id });
  }
  byMessage(ownerId, messageId) {
    if (!/^\d+$/.test(String(ownerId)) || !Number.isSafeInteger(messageId)) return null;
    const mapping = this.read('messages', `${ownerId}_${messageId}`);
    return mapping ? this.route(mapping.routeId) : null;
  }
  enqueue(route, text, sourceId) {
    if (typeof text !== 'string' || !text.trim() || text.length > 12000) throw new Error('Task must contain 1–12000 characters');
    const id = createHash('sha256').update(route.id + ':' + sourceId).digest('hex');
    const reservation = this.read('dedupe', id);
    if (reservation) {
      if (reservation.job && !this.read('pending', id) && !this.read('processing', id) && !this.read('done', id)) {
        this.writeNew('pending', id, reservation.job);
      }
      return { id, duplicate: true };
    }
    const job = { id, deviceId: route.deviceId, threadId: route.threadId, hostId: route.hostId,
      reportId: route.id, reportTitle: route.title, text, createdAt: new Date().toISOString(), source: 'telegram-owner' };
    // Reserve the dedupe key before exposing the job to concurrent consumers.
    try { this.writeNew('dedupe', id, { id, job }); }
    catch (error) { if (error.code === 'EEXIST') return { id, duplicate: true }; throw error; }
    this.writeNew('pending', id, job);
    return { id, duplicate: false };
  }
  claim(deviceId, requestId) {
    if (requestId !== undefined) checkedId(requestId);
    checkedId(deviceId);
    const lock = path.join(this.root, `claim-${deviceId}.lock`);
    if (fs.existsSync(lock)) {
      const previous = JSON.parse(fs.readFileSync(lock, 'utf8'));
      if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0) throw new Error('Invalid claim lock; operator review required');
      try { process.kill(previous.pid, 0); return []; }
      catch (error) { if (error.code !== 'ESRCH') throw error; fs.unlinkSync(lock); }
    }
    try { fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx' }); }
    catch (error) { if (error.code === 'EEXIST') return []; throw error; }
    try {
    // Unacknowledged jobs are never automatically resent: forwarding may already have succeeded.
    const processing = this.processing(deviceId);
    if (processing.length) return requestId ? processing.filter(job => job.claimRequestId === requestId) : [];
    for (const name of fs.readdirSync(path.join(this.root, 'pending')).filter(n => n.endsWith('.json')).sort()) {
      const id = name.replace(/\.json$/, '');
      const job = this.read('pending', id);
      if (!job || job.deviceId !== deviceId) continue;
      if (requestId) {
        job.claimRequestId = requestId;
        const pending = this.file('pending', id);
        fs.writeFileSync(pending + '.tmp', JSON.stringify(job), { mode: 0o600 });
        fs.renameSync(pending + '.tmp', pending);
      }
      try { fs.renameSync(this.file('pending', id), this.file('processing', id)); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      return [job];
    }
    return [];
    } finally { fs.unlinkSync(lock); }
  }
  processing(deviceId) {
    checkedId(deviceId);
    return fs.readdirSync(path.join(this.root, 'processing')).map(n => this.read('processing', n.replace(/\.json$/, ''))).filter(j => j?.deviceId === deviceId);
  }
  ack(deviceId, id) {
    checkedId(deviceId);
    const completed = this.read('done', id);
    if (completed?.deviceId === deviceId) return;
    const job = this.read('processing', id);
    if (!job || job.deviceId !== checkedId(deviceId)) throw new Error('Claimed task not found for device');
    fs.renameSync(this.file('processing', id), this.file('done', id));
  }
}
module.exports = { BridgeStore, validateRoute };
