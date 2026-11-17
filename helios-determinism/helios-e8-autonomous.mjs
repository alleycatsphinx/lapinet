/**
 * Autonomous exact-site interaction scheduling for constrained E8/H4.
 * Stable IDs and exact site determine pairing; mutable channels do not.
 */
import {
  packE8,
  unpackE8,
  scatterPairE8,
  stepE8,
} from '../noether-h4-62/icosian-e8.mjs';

const U32_MAX = 0xffffffff;

function mix32(x) {
  let y = x >>> 0;
  y ^= y >>> 16;
  y = Math.imul(y, 0x7feb352d);
  y ^= y >>> 15;
  y = Math.imul(y, 0x846ca68b);
  y ^= y >>> 16;
  return y >>> 0;
}

function validateStableIDs(stableIDs, count) {
  if (!(stableIDs instanceof Uint32Array) || stableIDs.length !== count) {
    throw new Error('stableIDs must be Uint32Array(count)');
  }
  const seen = new Set();
  for (const id of stableIDs) {
    if (seen.has(id)) throw new Error('Duplicate stable particle ID ' + id);
    seen.add(id);
  }
}

function compareCoords(a, b) {
  for (let i = 0; i < 8; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function siteKey(coords) {
  return coords.join(':');
}

export function interactionControlPackedSiteE8(siteWords,idA,idB,frame){
  if(!(siteWords instanceof Uint32Array)||siteWords.length<3)
    throw new Error('Expected three packed E8 site words');
  if(
    !Number.isInteger(idA)||!Number.isInteger(idB)||
    idA<0||idB<0||idA>U32_MAX||idB>U32_MAX||idA===idB
  )throw new Error('Expected two distinct u32 stable IDs');
  if(!Number.isSafeInteger(frame)||frame<0)
    throw new Error('Frame must be a nonnegative safe integer');
  const lo=Math.min(idA,idB)>>>0;
  const hi=Math.max(idA,idB)>>>0;
  let h=mix32((frame>>>0)^0x9e3779b9);
  h=mix32(h^lo);
  h=mix32(h^Math.imul(hi,0x85ebca6b));
  h=mix32(h^Math.imul(siteWords[0]>>>0,0x27d4eb2d));
  h=mix32(h^Math.imul(siteWords[1]>>>0,0x165667b1));
  h=mix32(h^Math.imul(siteWords[2]>>>0,0x85ebca77));
  return h%240;
}

export function interactionControlE8(coords,idA,idB,frame){
  if(
    coords.length!==8||
    coords.some((x)=>!Number.isInteger(x)||x<0||x>4095)
  )throw new Error('Expected exact E8 site coordinates');
  const packed=packE8(coords,0);
  return interactionControlPackedSiteE8(
    packed.subarray(0,3),idA,idB,frame
  );
}

export function scheduleExactSiteInteractionsE8(words, stableIDs, frame) {
  if (!(words instanceof Uint32Array) || words.length % 4 !== 0) {
    throw new Error('Expected packed E8 Uint32Array');
  }
  const count = words.length / 4;
  validateStableIDs(stableIDs, count);
  if (!Number.isSafeInteger(frame) || frame < 0) {
    throw new Error('Frame must be a nonnegative safe integer');
  }

  const sites = new Map();
  for (let record = 0; record < count; record++) {
    const particle = unpackE8(words, record);
    const key = siteKey(particle.coords);
    let bucket = sites.get(key);
    if (!bucket) {
      bucket = { coords: particle.coords, members: [] };
      sites.set(key, bucket);
    }
    bucket.members.push({
      stableID: stableIDs[record] >>> 0,
      record,
    });
  }

  const orderedSites = [...sites.values()].sort((a, b) =>
    compareCoords(a.coords, b.coords)
  );
  const events = [];
  for (const site of orderedSites) {
    site.members.sort((a, b) =>
      a.stableID - b.stableID || a.record - b.record
    );
    for (let i = 0; i + 1 < site.members.length; i += 2) {
      const left = site.members[i];
      const right = site.members[i + 1];
      events.push(Object.freeze({
        frame,
        coords: Object.freeze([...site.coords]),
        stableA: left.stableID,
        stableB: right.stableID,
        recordA: left.record,
        recordB: right.record,
        control: interactionControlE8(
          site.coords,
          left.stableID,
          right.stableID,
          frame
        ),
      }));
    }
  }
  return Object.freeze(events);
}

function scatterAutonomous(particles, stableIDs, frame) {
  const packed = new Uint32Array(particles.length * 4);
  for (let i = 0; i < particles.length; i++) {
    packed.set(packE8(particles[i].coords, particles[i].ch), 4 * i);
  }

  const schedule = scheduleExactSiteInteractionsE8(
    packed,
    stableIDs,
    frame
  );
  let eligible = 0;
  let collisions = 0;
  const applied = [];

  for (const event of schedule) {
    const left = particles[event.recordA];
    const right = particles[event.recordB];
    const result = scatterPairE8(left.ch, right.ch, event.control);
    if (result.eligible) eligible++;
    if (result.changed) {
      particles[event.recordA] = { ...left, ch: result.a };
      particles[event.recordB] = { ...right, ch: result.b };
      collisions++;
    }
    applied.push(Object.freeze({
      ...event,
      eligible: result.eligible,
      changed: result.changed,
    }));
  }

  return {
    schedule,
    applied: Object.freeze(applied),
    eligible,
    collisions,
  };
}

function streamAutonomous(
  particles,
  frame,
  { reverse = false, seed = 0, threshold = 3072 } = {}
) {
  for (let i = 0; i < particles.length; i++) {
    particles[i] = stepE8(particles[i], frame, {
      reverse,
      seed,
      threshold,
    });
  }
}

export function autonomousFrameE8(
  words,
  stableIDs,
  frame,
  { reverse = false, seed = 0, threshold = 3072 } = {}
) {
  if (!(words instanceof Uint32Array) || words.length % 4 !== 0) {
    throw new Error('Expected packed E8 Uint32Array');
  }
  const count = words.length / 4;
  validateStableIDs(stableIDs, count);
  if (!Number.isSafeInteger(frame) || frame < 0) {
    throw new Error('Frame must be a nonnegative safe integer');
  }

  const particles = Array.from(
    { length: count },
    (_, i) => unpackE8(words, i)
  );

  let interaction;
  if (reverse) {
    streamAutonomous(particles, frame, {
      reverse: true,
      seed,
      threshold,
    });
    interaction = scatterAutonomous(particles, stableIDs, frame);
  } else {
    interaction = scatterAutonomous(particles, stableIDs, frame);
    streamAutonomous(particles, frame, {
      seed,
      threshold,
    });
  }

  const out = new Uint32Array(words.length);
  for (let i = 0; i < count; i++) {
    out.set(packE8(particles[i].coords, particles[i].ch), 4 * i);
  }

  return Object.freeze({
    frame: reverse ? frame : frame + 1,
    words: out,
    stableIDs,
    schedule: interaction.schedule,
    applied: interaction.applied,
    eligible: interaction.eligible,
    collisions: interaction.collisions,
  });
}

export function runAutonomousFramesE8(
  words,
  stableIDs,
  start,
  count,
  opts = {}
) {
  if (
    !Number.isSafeInteger(start) || start < 0 ||
    !Number.isSafeInteger(count) || count < 0
  ) throw new Error('Invalid autonomous frame interval');

  let out = words;
  let eligible = 0;
  let collisions = 0;
  for (let i = 0; i < count; i++) {
    const frame = opts.reverse
      ? start + count - 1 - i
      : start + i;
    const next = autonomousFrameE8(
      out,
      stableIDs,
      frame,
      opts
    );
    out = next.words;
    eligible += next.eligible;
    collisions += next.collisions;
  }

  return Object.freeze({
    words: out,
    stableIDs,
    frame: opts.reverse ? start : start + count,
    eligible,
    collisions,
  });
}

export function stateByStableIDE8(words, stableIDs) {
  if (!(words instanceof Uint32Array) || words.length % 4 !== 0) {
    throw new Error('Expected packed E8 Uint32Array');
  }
  validateStableIDs(stableIDs, words.length / 4);
  const result = new Map();
  for (let i = 0; i < stableIDs.length; i++) {
    const particle = unpackE8(words, i);
    result.set(stableIDs[i] >>> 0, Object.freeze({
      coords: Object.freeze([...particle.coords]),
      ch: particle.ch,
    }));
  }
  return result;
}
