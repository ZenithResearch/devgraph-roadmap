// JSON-only contract checks shared by the browser and build. No tracker clients.
export function assertSchema(value, schema, root = schema, path = '$') {
  if (schema.$ref) return assertSchema(value, root.$defs[schema.$ref.split('/').at(-1)], root, path);
  if (schema.anyOf) {
    if (!schema.anyOf.some(part => { try { assertSchema(value, part, root, path); return true; } catch { return false; } })) throw Error(`${path}: does not match contract`);
    return;
  }
  if ('const' in schema && value !== schema.const) throw Error(`${path}: unsupported constant`);
  if (schema.enum && !schema.enum.includes(value)) throw Error(`${path}: unsupported value`);
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.includes(type) && !(type === 'number' && types.includes('integer') && Number.isSafeInteger(value))) throw Error(`${path}: wrong type`);
  }
  if (type === 'number' && (!Number.isFinite(value) || (schema.minimum != null && value < schema.minimum))) throw Error(`${path}: invalid number`);
  if (type === 'string' && ((schema.minLength && value.length < schema.minLength) || (schema.pattern && !new RegExp(schema.pattern).test(value)))) throw Error(`${path}: invalid string`);
  if (type === 'array') for (const [i, item] of value.entries()) assertSchema(item, schema.items, root, `${path}[${i}]`);
  if (type === 'object') {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) throw Error(`${path}.${key}: missing field`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties || {}, key)) { if (schema.additionalProperties === false) throw Error(`${path}.${key}: unknown field`); }
      else assertSchema(value[key], schema.properties[key], root, `${path}.${key}`);
    }
  }
}
export function allWork(snapshot) {
  return [snapshot.initiative, ...snapshot.initiative.projects.flatMap(p => [p, ...p.issues.flatMap(i => [i, ...i.tasks])])];
}
export function tasksFor(projects) {
  return projects.filter(p => !p.canonical.archived).flatMap(p => p.issues.filter(i => !i.canonical.archived).flatMap(i => i.tasks.filter(t => !t.canonical.archived)));
}
export function validateSnapshot(s, schema) {
  assertSchema(s, schema);
  if (!Number.isFinite(Date.parse(s.snapshot.as_of)) || !Number.isFinite(Date.parse(s.snapshot.captured_at))) throw Error('Invalid snapshot date');
  const sources = new Set(s.snapshot.sources.map(x => x.id));
  if (sources.size !== s.snapshot.sources.length || sources.size === 0) throw Error('Duplicate or missing provenance sources');
  const source = id => { if (!sources.has(id)) throw Error(`Unknown source ${id}`); };
  const works = allWork(s), ids = new Set();
  for (const w of works) {
    if (ids.has(w.id)) throw Error(`Duplicate work id ${w.id}`);
    ids.add(w.id);
    if (w.canonical.progress === null ? w.canonical.done !== null : w.canonical.done !== (w.canonical.progress === 'done')) throw Error(`Contradictory done ${w.id}`);
    if (w.canonical.done === true && !w.canonical.workflow_id) throw Error(`Completion lacks workflow ${w.id}`);
    if (w.evidence.state !== 'none' && w.evidence.references.length === 0) throw Error(`Evidence lacks provenance ${w.id}`);
    for (const r of w.evidence.references) source(r.source_id);
    if (w.kind === 'Task') {
      const h = w.estimate.hours;
      if (h && !(h.optimistic <= h.likely && h.likely <= h.pessimistic)) throw Error(`Estimate order ${w.id}`);
      if (h !== null || w.estimate.points !== null) source(w.estimate.source_id);
      const t = w.tokens;
      if (t.coverage === 'unobserved' ? t.total !== null : t.total === null) throw Error(`Token coverage ${w.id}`);
      if (t.total !== null) { source(t.source_id); if (!t.as_of || !Number.isFinite(Date.parse(t.as_of))) throw Error(`Token date ${w.id}`); }
    }
  }
  const projects = new Map(s.initiative.projects.map(p => [p.id, p]));
  const grouped = new Set();
  if (new Set(s.groups.map(g=>g.id)).size !== s.groups.length) throw Error('Duplicate grouping');
  for (const group of s.groups) for (const id of group.project_ids) {
    if (!projects.has(id) || grouped.has(id)) throw Error(`Invalid project grouping ${id}`);
    grouped.add(id);
  }
  const issues = new Map(s.initiative.projects.flatMap(p => p.issues).map(i => [i.id, i]));
  const visit = (id, active = new Set(), done = new Set()) => {
    if (active.has(id)) throw Error(`Dependency cycle ${id}`);
    if (done.has(id)) return;
    active.add(id);
    for (const dep of issues.get(id).depends_on) { if (!issues.has(dep)) throw Error(`Unknown dependency ${dep}`); visit(dep, active, done); }
    active.delete(id); done.add(id);
  };
  for (const id of issues.keys()) visit(id);
  const gates = new Set(s.gates.map(g => g.id));
  if (gates.size !== s.gates.length) throw Error('Duplicate gate');
  const gateVisit = (id, stack = new Set()) => {
    if (stack.has(id)) throw Error('Gate cycle');
    const next = new Set(stack).add(id);
    for (const dep of s.gates.find(g => g.id === id).requires) { if (!gates.has(dep)) throw Error('Unknown gate prerequisite'); gateVisit(dep, next); }
  };
  for (const g of s.gates) { source(g.source_id); gateVisit(g.id); }
  const blockers = new Set(s.blockers.map(b => b.id));
  if (blockers.size !== s.blockers.length) throw Error('Duplicate blocker');
  for (const w of works.filter(w => w.kind === 'Task')) for (const id of w.blocker_ids) if (!blockers.has(id)) throw Error(`Unknown blocker ${id}`);
  for (const c of s.claims) { if (!ids.has(c.work_id) && !gates.has(c.work_id)) throw Error('Unknown claim work'); source(c.source_id); }
  return s;
}
export function rollup(projects) {
  const active = projects.filter(p => !p.canonical.archived), tasks = tasksFor(active);
  const known = tasks.filter(t => t.estimate.hours !== null), pointed = tasks.filter(t => t.estimate.points !== null), observed = tasks.filter(t => t.tokens.coverage !== 'unobserved');
  // Sorting makes the arithmetic order independent of containment iteration;
  // Neumaier compensation retains small fractional estimates beside large ones.
  const sum = (values) => {
    let total = 0, correction = 0;
    for (const value of [...values].sort((a,b) => a-b)) {
      const next = total + value;
      correction += Math.abs(total) >= Math.abs(value) ? (total-next)+value : (value-next)+total;
      total = next;
    }
    const result = total + correction;
    if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) throw Error('Rollup overflow');
    return result;
  };
  return {
    projects: active.length, issues: active.reduce((n,p) => n+p.issues.filter(i => !i.canonical.archived).length,0), tasks: tasks.length,
    done: tasks.filter(t => t.canonical.done === true).length, unknownCompletion: tasks.filter(t => t.canonical.done === null).length,
    legacyAccepted: tasks.filter(t => t.canonical.legacy_status === 'accepted').length,
    recordedEvidence: tasks.filter(t => t.evidence.state !== 'none').length, verifiedEvidence: tasks.filter(t => t.evidence.state === 'verified').length,
    estimateCoverage: known.length, hours: known.length === 0 ? null : Object.fromEntries(['optimistic','likely','pessimistic'].map(k => [k,sum(known.map(t => t.estimate.hours[k]))])),
    pointCoverage: pointed.length, points: pointed.length === 0 ? null : sum(pointed.map(t => t.estimate.points)),
    tokenCoverage: observed.length, tokenComplete: tasks.filter(t => t.tokens.coverage === 'observed').length,
    tokens: observed.length === 0 ? null : sum(observed.map(t => t.tokens.total)),
  };
}
