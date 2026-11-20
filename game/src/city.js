// Procedural Solmar Bay: ground canvas with roads/sidewalks/beach/sea, towers with
// lit-window textures, rooftop props, neon, street lamps, palms and street furniture.
// Buildings double as box colliders for the player, cars, traffic and pedestrians.
import * as THREE from 'three';
import { WORLD, DISTRICTS } from './config.js';
import { clamp, hash2 } from './random.js';

const NEON_COLORS = [0xff2e88, 0x22d3ee, 0xffe14d, 0x7cff5e, 0xff7a1a];
const ROOF_COLORS = [0x6b6f75, 0x7a6a58, 0x555c66, 0x8a7f72];

// Canvas texture: a tower face of windows, ~42% lit, in one of 4 glow colours.
export function makeWindowTexture(rng, variant) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5d636e';
  g.fillRect(0, 0, 128, 256);
  const glows = ['#ffd98a', '#ffe9b0', '#9fd8ff', '#ffb36b'];
  const glow = glows[variant % glows.length];
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 14) {
      if (rng() < 0.42) {
        g.fillStyle = glow;
        g.globalAlpha = 0.55 + rng() * 0.45;
      } else {
        g.fillStyle = '#2a2e36';
        g.globalAlpha = 1;
      }
      g.fillRect(x, y, 9, 11);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// One 1024 canvas for the whole ground: grass base, asphalt avenues, sidewalks,
// crosswalks, the sand strip and the sea at the south edge.
export function makeRoadTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const toPx = (m) => ((m + WORLD.half) / (WORLD.half * 2)) * S;
  g.fillStyle = '#8a7d55';
  g.fillRect(0, 0, S, S);
  // Sidewalk corridors first (wider), then asphalt on top.
  for (const r of WORLD.roads) {
    const w = toPx(r + WORLD.roadHalf + 5.5) - toPx(r - WORLD.roadHalf - 5.5);
    g.fillStyle = '#a9a99d';
    g.fillRect(toPx(r - WORLD.roadHalf - 5.5), 0, w, S);
    g.fillRect(0, toPx(r - WORLD.roadHalf - 5.5), S, w);
  }
  for (const r of WORLD.roads) {
    const w = toPx(r + WORLD.roadHalf) - toPx(r - WORLD.roadHalf);
    g.fillStyle = '#484852';
    g.fillRect(toPx(r - WORLD.roadHalf), 0, w, S);
    g.fillRect(0, toPx(r - WORLD.roadHalf), S, w);
    // Centre dashes.
    g.fillStyle = '#d8c95a';
    for (let m = -WORLD.half; m < WORLD.half; m += 12) {
      g.fillRect(toPx(r) - 1, toPx(m), 2, 12);
      g.fillRect(toPx(m), toPx(r) - 1, 12, 2);
    }
  }
  // Crosswalk stripes at every intersection.
  g.fillStyle = '#e8e8e2';
  for (const rx of WORLD.roads) {
    for (const rz of WORLD.roads) {
      for (let i = -3; i <= 3; i++) {
        g.fillRect(toPx(rx + i * 2.2) - 1, toPx(rz - WORLD.roadHalf), 2, 5);
        g.fillRect(toPx(rx + i * 2.2) - 1, toPx(rz + WORLD.roadHalf) - 5, 2, 5);
      }
    }
  }
  // Beach sand, then sea, along the south edge (z > beachZ / seaZ).
  g.fillStyle = '#d9c08a';
  g.fillRect(0, toPx(WORLD.beachZ), S, S - toPx(WORLD.beachZ));
  g.fillStyle = '#2e7f9e';
  g.fillRect(0, toPx(WORLD.seaZ), S, S - toPx(WORLD.seaZ));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d;
  }
  return DISTRICTS[1];
}

export function createCity(scene, rng) {
  const city = { buildings: [], group: new THREE.Group(), lamps: [] };
  scene.add(city.group);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2, WORLD.half * 2),
    new THREE.MeshLambertMaterial({ map: makeRoadTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  city.group.add(ground);

  const windowTex = [
    makeWindowTexture(rng, 0),
    makeWindowTexture(rng, 1),
    makeWindowTexture(rng, 2),
    makeWindowTexture(rng, 3),
  ];
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffdf80, emissiveIntensity: 0.9 });

  // Towers: one or two per block, sized and tinted by district.
  const blockCenters = [];
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      blockCenters.push([-180 + i * 60, -180 + j * 60]);
    }
  }
  for (const [bx, bz] of blockCenters) {
    if (bz > 168) continue; // beach blocks stay open
    const d = districtAt(bx, bz);
    const towers = rng() < 0.55 ? 2 : 1;
    for (let t = 0; t < towers; t++) {
      const ox = towers === 1 ? 0 : (t === 0 ? -9 : 9);
      const oz = towers === 1 ? 0 : (t === 0 ? -8 : 8);
      const w = 16 + rng() * 12;
      const dep = 16 + rng() * 12;
      const h = d.minH + rng() * (d.maxH - d.minH);
      const x = bx + ox;
      const z = bz + oz;
      // Never cover the player spawn (0, 40): a tower on top of it would
      // trap the player inside a wall on the first step.
      if (0 > x - w / 2 - 1 && 0 < x + w / 2 + 1 && 40 > z - dep / 2 - 1 && 40 < z + dep / 2 + 1) continue;
      const tint = new THREE.Color(d.tint);
      tint.offsetHSL(0, 0, (rng() - 0.5) * 0.12);
      const tex = windowTex[Math.floor(rng() * 4)];
      const mat = new THREE.MeshLambertMaterial({
        map: tex, color: tint, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35,
      });
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), mat);
      tower.position.set(x, h / 2, z);
      tower.castShadow = true;
      tower.receiveShadow = true;
      city.group.add(tower);
      city.buildings.push({ x0: x - w / 2, x1: x + w / 2, z0: z - dep / 2, z1: z + dep / 2 });
      // Roof slab + props.
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.9, 0.6, dep * 0.9),
        new THREE.MeshLambertMaterial({ color: ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)] }),
      );
      roof.position.set(x, h + 0.3, z);
      city.group.add(roof);
      if (rng() < 0.7) {
        const ac = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 2.4), poleMat);
        ac.position.set(x + (rng() - 0.5) * w * 0.5, h + 1.1, z + (rng() - 0.5) * dep * 0.5);
        city.group.add(ac);
      }
      if (rng() < 0.5) {
        const ant = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.18, 4 + rng() * 5, 6),
          new THREE.MeshLambertMaterial({ color: 0x888888 }),
        );
        ant.position.set(x + (rng() - 0.5) * w * 0.6, h + 3 + rng() * 2, z + (rng() - 0.5) * dep * 0.6);
        city.group.add(ant);
      }
      // Neon sign on Downtown towers.
      if (d.name === 'DOWNTOWN' && rng() < 0.6) {
        const neon = NEON_COLORS[Math.floor(rng() * NEON_COLORS.length)];
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 1.6, 6 + rng() * 4),
          new THREE.MeshLambertMaterial({ color: neon, emissive: neon, emissiveIntensity: 1.4 }),
        );
        sign.position.set(x + w / 2 + 0.3, h * (0.55 + rng() * 0.3), z);
        city.group.add(sign);
      }
    }
  }

  // Street lamps along every avenue, every 36 m, offset 8.6 m from the road line.
  const lampGeo = new THREE.CylinderGeometry(0.09, 0.12, 7, 6);
  const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6);
  for (const r of WORLD.roads) {
    for (let m = -180; m <= 180; m += 36) {
      for (const [x, z] of [[r + 8.6, m], [m, r - 8.6]]) {
        const pole = new THREE.Mesh(lampGeo, poleMat);
        pole.position.set(x, 3.5, z);
        city.group.add(pole);
        const bulb = new THREE.Mesh(bulbGeo, lampMat);
        bulb.position.set(x, 7.1, z);
        city.group.add(bulb);
      }
    }
  }

  // Palms along the beach and the marina.
  for (let i = 0; i < 26; i++) {
    const beach = i < 14;
    const x = beach ? -190 + i * 28 + rng() * 8 : 80 + rng() * 120;
    const z = beach ? 182 + rng() * 10 : 60 + rng() * 120;
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 6, 7), trunkMat);
    trunk.position.y = 3;
    trunk.rotation.z = (rng() - 0.5) * 0.16;
    palm.add(trunk);
    for (let leaf = 0; leaf < 5; leaf++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 5), leafMat);
      const a = (leaf / 5) * Math.PI * 2;
      cone.position.set(Math.cos(a) * 1.3, 6.4, Math.sin(a) * 1.3);
      cone.rotation.z = Math.cos(a) * 1.1;
      cone.rotation.x = -Math.sin(a) * 1.1;
      palm.add(cone);
    }
    palm.position.set(x, 0, z);
    city.group.add(palm);
  }

  // Street furniture: hydrants at intersections, benches, beach umbrellas.
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc22a1e });
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  for (const rx of WORLD.roads) {
    for (const rz of WORLD.roads) {
      if (rng() < 0.5) {
        const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.9, 8), hydrantMat);
        hyd.position.set(rx + 8.6, 0.45, rz + 8.6);
        city.group.add(hyd);
      }
      if (rng() < 0.4) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.7), benchMat);
        bench.position.set(rx - 9.4, 0.5, rz - 2);
        city.group.add(bench);
      }
    }
  }
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xd93a2b });
  for (let i = 0; i < 8; i++) {
    const x = -170 + i * 46 + rng() * 10;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), poleMat);
    pole.position.set(x, 1.3, 188);
    city.group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.1, 8), umbrellaMat);
    top.position.set(x, 3.1, 188);
    city.group.add(top);
  }

  return city;
}

// True when the point (with radius r) is inside any building box.
export function pointInBuilding(city, x, z, r = 0) {
  for (const b of city.buildings) {
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  }
  return false;
}

// Push a circle out of building boxes (dominant axis), return corrected x/z.
export function collideBuildings(city, x, z, r) {
  for (const b of city.buildings) {
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) {
      const dxl = x - (b.x0 - r);
      const dxr = (b.x1 + r) - x;
      const dzl = z - (b.z0 - r);
      const dzr = (b.z1 + r) - z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) x = b.x0 - r;
      else if (m === dxr) x = b.x1 + r;
      else if (m === dzl) z = b.z0 - r;
      else z = b.z1 + r;
    }
  }
  return { x, z };
}

export function clampToCity(x, z, margin = 2) {
  const lim = WORLD.half - margin;
  return { x: clamp(x, -lim, lim), z: clamp(z, -lim, lim) };
}

export function isOnRoad(x, z) {
  for (const r of WORLD.roads) {
    if (Math.abs(x - r) < WORLD.roadHalf || Math.abs(z - r) < WORLD.roadHalf) return true;
  }
  return false;
}

export function nearestRoadCoord(v) {
  let best = WORLD.roads[0];
  for (const r of WORLD.roads) {
    if (Math.abs(v - r) < Math.abs(v - best)) best = r;
  }
  return best;
}

export { hash2 };
