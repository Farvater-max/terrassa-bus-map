const FGC_STOP_NAMES = ['estacio rambla', 'vallparadis universitat', 'vallparadis-universitat', 'estacio nord', 'estacio nord-2'];
const RENFE_STOP_NAMES = ['estacio nord', 'estacio nord-2', 'estacio est'];
const cache = new Map();

const normalize = name => name
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase();

export function railConnections(stopName) {
  let result = cache.get(stopName);
  if (result) return result;

  const normalized = normalize(stopName);
  result = {
    fgc: FGC_STOP_NAMES.some(name => normalized.includes(name)),
    renfe: RENFE_STOP_NAMES.some(name => normalized.includes(name)),
  };
  cache.set(stopName, result);
  return result;
}
