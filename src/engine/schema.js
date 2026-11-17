

const SCHEMA_VERSION = 2;

const MIGRATIONS = {
0: (data) => ({
 ...data,
 project: {
 ...data.project,
 sAndAExpense:       data.project?.sAndAExpense       ?? 10,
 insideSales:        data.project?.insideSales        ?? '',
 outsideSales:       data.project?.outsideSales       ?? '',
 freightPaymentTerm: data.project?.freightPaymentTerm ?? '',
 locked:             data.project?.locked             ?? false,
 },
}),
1: (data) => ({
 ...data,
 project: {
 ...data.project,
 approvals: data.project?.approvals ?? [],
 },
}),
};

const migrateData = (data) => {
let schemaVer = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
// Normalise key names — files saved with 'proj' key must be aliased to 'project'
// before migrations run, since migrations reference data.project
let d = data;
if (d.proj && !d.project) d = { ...d, project: d.proj };
if (d.frt && !d.freight) d = { ...d, freight: d.frt };
if (d.sched && !d.schedule) d = { ...d, schedule: d.sched };
while (schemaVer < SCHEMA_VERSION) {
 if (MIGRATIONS[schemaVer]) d = MIGRATIONS[schemaVer](d);
 schemaVer++;
}
// Re-normalise back to short keys after migration
// GCS: convert lines from before markup levels (defined in engine/gcs.js, loaded after this file)
return gcsMigrateData({ ...d, schemaVersion: SCHEMA_VERSION });
};

const validateLoadedData = (data) => {
const errors = [];
if (!data || typeof data !== 'object') { errors.push('File is not a valid JSON object'); return errors; }
if (!data.project || typeof data.project !== 'object') errors.push('Missing or invalid project data');
if (!Array.isArray(data.items)) errors.push('Missing or invalid items list');
if (data.project) {
 if (data.project.name !== undefined && typeof data.project.name !== 'string') errors.push('Project name must be a string');
 if (data.project.sellCcy && typeof data.project.sellCcy !== 'string') errors.push('Invalid selling currency');
 if (data.project.defaultMargin !== undefined && isNaN(Number(data.project.defaultMargin))) errors.push('Default margin must be a number');
}
if (Array.isArray(data.items)) {
 data.items.forEach((item, i) => {
 if (!item.id)   errors.push(`Item ${i+1}: missing id`);
 if (!item.type) errors.push(`Item ${i+1}: missing type`);
 if (item.qty !== undefined && isNaN(Number(item.qty))) errors.push(`Item ${i+1}: qty must be a number`);
 if (item.unitCost !== undefined && isNaN(Number(item.unitCost))) errors.push(`Item ${i+1}: unitCost must be a number`);
 });
 // Duplicate ID detection — every tree/alloc/sp lookup is a Map keyed by item.id;
 // a duplicate silently overwrites the first item in every one of those maps.
 const seenIds = new Set();
 const dupeIds = new Set();
 data.items.forEach(item => {
  if (!item.id) return;
  if (seenIds.has(item.id)) dupeIds.add(item.id);
  seenIds.add(item.id);
 });
 dupeIds.forEach(id => errors.push(`Duplicate item id: ${id}`));
 // Orphan parent detection — a parentId that doesn't resolve to a real item
 // silently drops that item out of the tree with no error shown anywhere.
 data.items.forEach((item, i) => {
  if (item.parentId && !seenIds.has(item.parentId)) {
   errors.push(`Item ${i+1} (${item.id||'no id'}): parentId "${item.parentId}" does not match any item`);
  }
 });
 // Cycle detection — tree building and cost rollup recurse on parentId/children
 // with no visited-set guard, so a cycle hangs the tab instead of erroring.
 const parentOf = new Map(data.items.filter(i => i.id).map(i => [i.id, i.parentId || null]));
 const cycleIds = new Set();
 parentOf.forEach((_, startId) => {
  const visited = new Set();
  let cur = startId;
  while (cur) {
   if (visited.has(cur)) { cycleIds.add(startId); break; }
   visited.add(cur);
   cur = parentOf.get(cur);
  }
 });
 cycleIds.forEach(id => errors.push(`Item ${id}: circular parent reference detected (BOM cycle)`));
}
return errors;
};