/**
 * MountainScene — vallée alpine en dessin animé (React Three Fiber).
 *
 * Relief procédural plus découpé, sapins à étages enneigés, skieurs avec
 * tête / casque / bras / jambes / skis, télésiège, village, neige.
 * Palette plate, Lambert + toon. Figé sous `prefers-reduced-motion`.
 */

import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const SEG = 120
const SIZE = 150
const T_Y = -4
const T_Z = -8

/* ------------------------------------------------------------------------ */
/* Bruit                                                                    */

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function noise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x: number, y: number, oct = 5): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(x * freq, y * freq)
    amp *= 0.5
    freq *= 2.03
  }
  return sum
}

function ridged(x: number, y: number, oct = 6): number {
  let sum = 0
  let amp = 0.62
  let freq = 1
  let weight = 1
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(noise(x * freq, y * freq) * 2 - 1)
    n = n * n * weight
    weight = Math.min(1, Math.max(0, n * 1.6))
    sum += n * amp
    amp *= 0.5
    freq *= 2.12
  }
  return sum
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

function smooth(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function peak(u: number, v: number, cu: number, cv: number, r: number, h: number): number {
  const d = Math.hypot((u - cu) * 1.15, v - cv) / r
  if (d >= 1) return 0
  const f = 1 - d * d
  return f * f * h
}

/* ------------------------------------------------------------------------ */
/* Relief                                                                   */

const PISTE_TOP = 0.62
const PISTE_BOT = 0.26
function pisteU(v: number): number {
  const t = clamp01((v - PISTE_BOT) / (PISTE_TOP - PISTE_BOT))
  return 0.6 + Math.sin(t * Math.PI * 1.7) * 0.05 - t * 0.1
}

const VILLAGE = { u: 0.6, v: 0.21, r: 0.09 }

function rawHeight(u: number, v: number): number {
  let h = fbm(u * 2.8 + 3.1, v * 2.8 + 8.7, 6) * 4.2
  h += ridged(u * 3.6 + 1.7, v * 3.6 + 4.2) * 11.5
  h += ridged(u * 8.2 + 2.4, v * 7.4 + 1.1) * 2.4
  h += peak(u, v, 0.5, 0.7, 0.33, 30)
  h += peak(u, v, 0.17, 0.73, 0.26, 21)
  h += peak(u, v, 0.84, 0.69, 0.28, 24)
  h += peak(u, v, 0.32, 0.52, 0.14, 7.5)
  h += peak(u, v, 0.7, 0.5, 0.13, 6.5)
  h += peak(u, v, 0.46, 0.84, 0.18, 10)
  h += smooth(0.76, 1, v) * (16 + ridged(u * 6.4 + 9, v * 6.4) * 14)
  h -= smooth(0.42, 0, v) * 17
  return h
}

const VILLAGE_H = rawHeight(VILLAGE.u, VILLAGE.v) + 0.6

function heightAt(u: number, v: number): number {
  let h = rawHeight(u, v)
  const dv = Math.hypot((u - VILLAGE.u) * 1.3, v - VILLAGE.v) / VILLAGE.r
  const plateau = smooth(1, 0.55, dv)
  h = h + (VILLAGE_H - h) * plateau
  if (v > PISTE_BOT - 0.03 && v < PISTE_TOP + 0.02) {
    const du = Math.abs(u - pisteU(v))
    const w = smooth(0.034, 0.01, du)
    const t = clamp01((v - PISTE_BOT) / (PISTE_TOP - PISTE_BOT))
    const topH = rawHeight(pisteU(PISTE_TOP), PISTE_TOP)
    const ramp = VILLAGE_H + (topH - VILLAGE_H) * (t * t * 0.55 + t * 0.45)
    h = h + (ramp - h) * w
  }
  return h
}

function onTerrain(u: number, v: number, lift = 0): THREE.Vector3 {
  const x = (u - 0.5) * SIZE
  const z = -(v - 0.5) * SIZE + T_Z
  return new THREE.Vector3(x, heightAt(u, v) + T_Y + lift, z)
}

function buildTerrain(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / SIZE + 0.5
    const v = pos.getY(i) / SIZE + 0.5
    const h = heightAt(u, v)
    pos.setZ(i, Number.isFinite(h) ? h : 0)
  }
  geo.computeVertexNormals()

  const nrm = geo.attributes.normal as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const snow = new THREE.Color('#f7fbff')
  const snowShade = new THREE.Color('#c5d8ee')
  const ice = new THREE.Color('#d7eefc')
  const piste = new THREE.Color('#eef6ff')
  const pisteLine = new THREE.Color('#c9def2')
  const rockHi = new THREE.Color('#8a97a8')
  const rockLo = new THREE.Color('#3d4b5a')
  const forest = new THREE.Color('#3c6a46')
  const tmp = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / SIZE + 0.5
    const v = pos.getY(i) / SIZE + 0.5
    const h = pos.getZ(i)
    const flat = nrm.getZ(i)
    const grain = (noise(u * 52 + 2, v * 52 + 5) - 0.5) * 0.32
    const alt = smooth(3, 22, h)
    const snowy = smooth(0.42 - alt * 0.2, 0.8 - alt * 0.15, flat + grain)
    tmp.copy(rockLo).lerp(rockHi, smooth(-8, 24, h))
    tmp.lerp(forest, smooth(8, 1, h) * (1 - snowy) * 0.85)
    tmp.lerp(flat > 0.82 ? snow : snowShade, snowy)
    tmp.lerp(ice, snowy * smooth(18, 28, h) * 0.45)
    const onPiste = v > PISTE_BOT - 0.03 && v < PISTE_TOP + 0.02 ? smooth(0.034, 0.01, Math.abs(u - pisteU(v))) : 0
    const cord = noise(u * 90, v * 14) > 0.55 ? pisteLine : piste
    tmp.lerp(cord, onPiste)
    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeBoundingSphere()
  return geo
}

function Terrain() {
  const geo = useMemo(buildTerrain, [])
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, T_Y, T_Z]}>
      <meshLambertMaterial vertexColors />
    </mesh>
  )
}

/* ------------------------------------------------------------------------ */
/* Assemblage de géométries colorées                                        */

const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()
const _c = new THREE.Color()

function placed(
  src: THREE.BufferGeometry,
  hex: string,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1
): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone()
  src.dispose()
  _c.set(hex)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r
    arr[i * 3 + 1] = _c.g
    arr[i * 3 + 2] = _c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  if (!g.attributes.normal) g.computeVertexNormals()
  _p.set(x, y, z)
  _e.set(rx, ry, rz)
  _q.setFromEuler(_e)
  _s.set(sx, sy, sz)
  _m.compose(_p, _q, _s)
  g.applyMatrix4(_m)
  return g
}

function mergeGeos(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0
  for (const g of parts) count += g.attributes.position.count
  const pos = new Float32Array(count * 3)
  const nrm = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  let o = 0
  for (const g of parts) {
    const p = g.attributes.position.array as Float32Array
    const n = (g.attributes.normal.array as Float32Array) ?? p
    const c = g.attributes.color.array as Float32Array
    pos.set(p, o)
    nrm.set(n, o)
    col.set(c, o)
    o += p.length
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  out.computeBoundingSphere()
  return out
}

function toonRamp(): THREE.DataTexture {
  const data = new Uint8Array([70, 74, 86, 255, 130, 136, 148, 255, 190, 194, 202, 255, 255, 255, 255, 255])
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}

/* ------------------------------------------------------------------------ */
/* Village                                                                  */

interface Chalet {
  p: THREE.Vector3
  rot: number
  w: number
  d: number
  h: number
}

function makeChalets(): Chalet[] {
  const out: Chalet[] = []
  const N = 12
  for (let i = 0; i < N; i++) {
    const a = hash(i, 3) * Math.PI * 2
    const r = 0.016 + hash(i, 7) * (VILLAGE.r * 0.6)
    const u = VILLAGE.u + Math.cos(a) * r * 0.8
    const v = VILLAGE.v + Math.sin(a) * r * 0.55
    if (Math.abs(u - pisteU(v)) < 0.022 && v > PISTE_BOT - 0.01) continue
    const w = 2.3 + hash(i, 11) * 1.5
    const d = 1.9 + hash(i, 13) * 1.3
    const h = 1.6 + hash(i, 17) * 0.75
    out.push({ p: onTerrain(u, v, h / 2 - 0.12), rot: (hash(i, 19) - 0.5) * 0.55, w, d, h })
  }
  return out
}

function Village() {
  const chalets = useMemo(makeChalets, [])
  return (
    <group>
      {chalets.map((c, i) => (
        <group key={i} position={c.p} rotation={[0, c.rot, 0]}>
          <mesh>
            <boxGeometry args={[c.w, c.h, c.d]} />
            <meshLambertMaterial color="#8a5a38" />
          </mesh>
          <mesh position={[0, c.h / 2 + 0.62, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[Math.max(c.w, c.d) * 0.82, 1.25, 4]} />
            <meshLambertMaterial color="#f4f8fd" />
          </mesh>
          <mesh position={[c.w * 0.28, c.h / 2 + 0.55, c.d * 0.12]}>
            <cylinderGeometry args={[0.14, 0.16, 0.7, 6]} />
            <meshLambertMaterial color="#6d4a36" />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0.02, (s * c.d) / 2 + s * 0.02]}>
              <planeGeometry args={[c.w * 0.48, c.h * 0.28]} />
              <meshBasicMaterial color="#ffcf70" side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
      <pointLight position={onTerrain(VILLAGE.u, VILLAGE.v, 4)} intensity={18} distance={20} color="#ffb866" />
    </group>
  )
}

/* ------------------------------------------------------------------------ */
/* Sapins à étages                                                          */

const TREES = 110

function makeTreeGeo(): THREE.BufferGeometry {
  const trunk = '#6a4328'
  const leaf = '#1f6b3c'
  const leaf2 = '#165530'
  const snow = '#f3f7fb'
  return mergeGeos([
    placed(new THREE.CylinderGeometry(0.16, 0.22, 0.85, 6), trunk, 0, 0.4, 0),
    placed(new THREE.ConeGeometry(1.35, 1.7, 8), leaf, 0, 1.15, 0),
    placed(new THREE.ConeGeometry(1.18, 0.42, 8), snow, 0, 1.55, 0),
    placed(new THREE.ConeGeometry(1.05, 1.5, 8), leaf2, 0, 2.05, 0),
    placed(new THREE.ConeGeometry(0.9, 0.38, 8), snow, 0, 2.42, 0),
    placed(new THREE.ConeGeometry(0.72, 1.25, 8), leaf, 0, 2.85, 0),
    placed(new THREE.ConeGeometry(0.58, 0.34, 8), snow, 0, 3.18, 0),
    placed(new THREE.ConeGeometry(0.42, 0.95, 8), leaf2, 0, 3.5, 0),
    placed(new THREE.SphereGeometry(0.28, 6, 5), snow, 0, 3.95, 0)
  ])
}

function Trees() {
  const geo = useMemo(makeTreeGeo, [])
  const ramp = useMemo(toonRamp, [])
  const items = useMemo(() => {
    const m: THREE.Matrix4[] = []
    const dummy = new THREE.Object3D()
    let tries = 0
    while (m.length < TREES && tries < TREES * 7) {
      tries++
      const u = 0.1 + hash(tries, 23) * 0.8
      const v = 0.08 + hash(tries, 29) * 0.44
      const h = rawHeight(u, v)
      if (h > 11 || h < VILLAGE_H - 5) continue
      if (Math.abs(u - pisteU(v)) < 0.036 && v > PISTE_BOT - 0.02 && v < PISTE_TOP) continue
      if (Math.hypot((u - VILLAGE.u) * 1.3, v - VILLAGE.v) < VILLAGE.r * 0.72) continue
      const s = 0.7 + hash(tries, 31) * 0.95
      dummy.position.copy(onTerrain(u, v, 0))
      dummy.scale.set(s, s * (1.05 + hash(tries, 33) * 0.35), s)
      dummy.rotation.set(0, hash(tries, 37) * Math.PI, 0)
      dummy.updateMatrix()
      m.push(dummy.matrix.clone())
    }
    return m
  }, [])
  const apply = (mesh: THREE.InstancedMesh | null): void => {
    if (!mesh) return
    items.forEach((mat, i) => mesh.setMatrixAt(i, mat))
    mesh.instanceMatrix.needsUpdate = true
    mesh.count = items.length
  }
  return (
    <instancedMesh ref={apply} args={[geo, undefined, TREES]} frustumCulled={false}>
      <meshToonMaterial vertexColors gradientMap={ramp} />
    </instancedMesh>
  )
}

function ForegroundPines() {
  const geo = useMemo(makeTreeGeo, [])
  const ramp = useMemo(toonRamp, [])
  const spots = useMemo(() => {
    const dummy = new THREE.Object3D()
    const m: THREE.Matrix4[] = []
    const pts = [
      [0.84, 0.185, 2.1],
      [0.92, 0.23, 1.55],
      [0.32, 0.175, 1.85],
      [0.22, 0.22, 1.4]
    ] as const
    for (const [u, v, s] of pts) {
      dummy.position.copy(onTerrain(u, v, 0))
      dummy.scale.set(s, s * 1.12, s)
      dummy.rotation.set(0, u * 7, 0)
      dummy.updateMatrix()
      m.push(dummy.matrix.clone())
    }
    return m
  }, [])
  const apply = (mesh: THREE.InstancedMesh | null): void => {
    if (!mesh) return
    spots.forEach((mat, i) => mesh.setMatrixAt(i, mat))
    mesh.instanceMatrix.needsUpdate = true
  }
  return (
    <instancedMesh ref={apply} args={[geo, undefined, 4]} frustumCulled={false}>
      <meshToonMaterial vertexColors gradientMap={ramp} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------------ */
/* Télésiège                                                                */

const LIFT_FROM = { u: 0.655, v: 0.23 }
const LIFT_TO = { u: 0.62, v: 0.61 }
const PYLONS = 7
const CABINS = 8

function makeCabinGeo(): THREE.BufferGeometry {
  return mergeGeos([
    placed(new THREE.BoxGeometry(1.15, 1.05, 1.15), '#e23b2a', 0, 0, 0),
    placed(new THREE.BoxGeometry(0.72, 0.42, 0.05), '#9ee7ff', 0, 0.08, 0.58),
    placed(new THREE.BoxGeometry(0.72, 0.42, 0.05), '#9ee7ff', 0, 0.08, -0.58),
    placed(new THREE.SphereGeometry(0.62, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#f4f7fb', 0, 0.48, 0)
  ])
}

function liftPoints(): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= PYLONS; i++) {
    const t = i / PYLONS
    const u = LIFT_FROM.u + (LIFT_TO.u - LIFT_FROM.u) * t
    const v = LIFT_FROM.v + (LIFT_TO.v - LIFT_FROM.v) * t
    pts.push(onTerrain(u, v, 6.6))
  }
  return pts
}

function Lift({ still }: { still: boolean }) {
  const pylons = useMemo(liftPoints, [])
  const curve = useMemo(() => new THREE.CatmullRomCurve3(pylons, false, 'catmullrom', 0.2), [pylons])
  const cable = useMemo(() => new THREE.TubeGeometry(curve, 64, 0.055, 5, false), [curve])
  const cabinGeo = useMemo(makeCabinGeo, [])
  const cabins = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const phase = useRef(0)
  const ramp = useMemo(toonRamp, [])

  useFrame((_, dt) => {
    const mesh = cabins.current
    if (!mesh) return
    if (!still) phase.current = (phase.current + Math.min(dt, 0.05) * 0.03) % 1
    for (let i = 0; i < CABINS; i++) {
      const up = i < CABINS / 2
      const k = ((i % (CABINS / 2)) / (CABINS / 2) + phase.current) % 1
      const t = up ? k : 1 - k
      const p = curve.getPointAt(t)
      dummy.position.set(p.x + (up ? -0.55 : 0.55), p.y - 1.15, p.z)
      dummy.rotation.set(0, Math.atan2(LIFT_TO.u - LIFT_FROM.u, LIFT_TO.v - LIFT_FROM.v), 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      {pylons.map((p, i) => (
        <group key={i} position={[p.x, p.y - 3.25, p.z]}>
          <mesh>
            <cylinderGeometry args={[0.16, 0.26, 6.5, 6]} />
            <meshLambertMaterial color="#9aa6b4" />
          </mesh>
          <mesh position={[0, 3.2, 0]}>
            <boxGeometry args={[1.85, 0.16, 0.16]} />
            <meshLambertMaterial color="#9aa6b4" />
          </mesh>
        </group>
      ))}
      {[-0.55, 0.55].map((dx) => (
        <mesh key={dx} geometry={cable} position={[dx, 0, 0]}>
          <meshLambertMaterial color="#3a4652" />
        </mesh>
      ))}
      <instancedMesh ref={cabins} args={[cabinGeo, undefined, CABINS]} frustumCulled={false}>
        <meshToonMaterial vertexColors gradientMap={ramp} />
      </instancedMesh>
    </group>
  )
}

/* ------------------------------------------------------------------------ */
/* Skieurs cartoon : tête, casque, bras, jambes, skis                       */

const SKIERS = 9
const SKI_JACKETS = ['#ff4d3a', '#2f7bff', '#ffd23a', '#27ae60', '#9b51e0', '#ff7ad9', '#1f2937', '#ffffff', '#ff8a3d']

function makeSkierGeo(jacket: string): THREE.BufferGeometry {
  const skin = '#f3c4a3'
  const pants = '#243044'
  const boot = '#1a2230'
  const ski = '#f7fbff'
  const pole = '#c5ced8'
  const goggle = '#1b2433'
  const hair = jacket
  return mergeGeos([
    placed(new THREE.BoxGeometry(0.16, 0.05, 1.75), ski, -0.2, 0.03, 0.18),
    placed(new THREE.BoxGeometry(0.16, 0.05, 1.75), ski, 0.2, 0.03, 0.18),
    placed(new THREE.BoxGeometry(0.16, 0.06, 0.22), jacket, -0.2, 0.04, 0.95),
    placed(new THREE.BoxGeometry(0.16, 0.06, 0.22), jacket, 0.2, 0.04, 0.95),
    placed(new THREE.BoxGeometry(0.18, 0.14, 0.32), boot, -0.2, 0.12, 0.12),
    placed(new THREE.BoxGeometry(0.18, 0.14, 0.32), boot, 0.2, 0.12, 0.12),
    placed(new THREE.CylinderGeometry(0.075, 0.085, 0.42, 6), pants, -0.2, 0.38, 0.06, 0.45, 0, 0),
    placed(new THREE.CylinderGeometry(0.075, 0.085, 0.42, 6), pants, 0.2, 0.38, 0.06, 0.45, 0, 0),
    placed(new THREE.BoxGeometry(0.42, 0.18, 0.24), pants, 0, 0.56, 0.1),
    placed(new THREE.BoxGeometry(0.48, 0.52, 0.32), jacket, 0, 0.88, 0.02, 0.38, 0, 0),
    placed(new THREE.CylinderGeometry(0.06, 0.065, 0.46, 6), jacket, -0.34, 0.82, 0.12, 0.55, 0, 0.85),
    placed(new THREE.CylinderGeometry(0.06, 0.065, 0.46, 6), jacket, 0.34, 0.82, 0.12, 0.55, 0, -0.85),
    placed(new THREE.SphereGeometry(0.08, 8, 6), jacket, -0.52, 0.62, 0.28),
    placed(new THREE.SphereGeometry(0.08, 8, 6), jacket, 0.52, 0.62, 0.28),
    placed(new THREE.CylinderGeometry(0.09, 0.1, 0.14, 8), skin, 0, 1.14, -0.02),
    placed(new THREE.SphereGeometry(0.16, 10, 8), skin, 0, 1.3, -0.04),
    placed(new THREE.SphereGeometry(0.175, 10, 8), hair, 0, 1.36, -0.05, 0.15, 0, 0),
    placed(new THREE.BoxGeometry(0.22, 0.07, 0.1), goggle, 0, 1.3, 0.1),
    placed(new THREE.CylinderGeometry(0.025, 0.025, 1.15, 5), pole, -0.55, 0.55, 0.35, 0.55, 0, 0.15),
    placed(new THREE.CylinderGeometry(0.025, 0.025, 1.15, 5), pole, 0.55, 0.55, 0.35, 0.55, 0, -0.15)
  ])
}

function Skiers({ still }: { still: boolean }) {
  const geos = useMemo(() => SKI_JACKETS.map((c) => makeSkierGeo(c)), [])
  const ramp = useMemo(toonRamp, [])
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  const sk = useMemo(
    () =>
      Array.from({ length: SKIERS }, (_, i) => ({
        t: hash(i, 41),
        speed: 0.026 + hash(i, 43) * 0.018,
        side: (hash(i, 47) - 0.5) * 0.02,
        wob: hash(i, 53) * Math.PI * 2
      })),
    []
  )

  useFrame(({ clock }, dt) => {
    const step = still ? 0 : Math.min(dt, 0.05)
    const time = clock.getElapsedTime()
    for (let i = 0; i < SKIERS; i++) {
      const mesh = meshes.current[i]
      if (!mesh) continue
      const s = sk[i]
      s.t += step * s.speed
      if (s.t > 1) s.t -= 1
      const v = PISTE_TOP - (PISTE_TOP - PISTE_BOT) * s.t
      const carve = still ? 0 : Math.sin(time * 2.15 + s.wob) * 0.012
      const u = pisteU(v) + s.side + carve
      const p = onTerrain(u, v, 0.02)
      dummy.position.copy(p)
      look.set(p.x + carve * 10, p.y, p.z + 3)
      dummy.up.set(0, 1, 0)
      dummy.lookAt(look)
      dummy.rotateZ(carve * 18)
      dummy.scale.setScalar(3.9)
      dummy.updateMatrix()
      mesh.matrix.copy(dummy.matrix)
      mesh.matrixAutoUpdate = false
    }
  })

  return (
    <group>
      {geos.map((geo, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el
          }}
          geometry={geo}
          frustumCulled={false}
        >
          <meshToonMaterial vertexColors gradientMap={ramp} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------------ */
/* Ciel, nuages, soleil, neige                                              */

function Sky() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(220, 24, 16)
    const pos = g.attributes.position as THREE.BufferAttribute
    const col = new Float32Array(pos.count * 3)
    const top = new THREE.Color('#7ec4ef')
    const hor = new THREE.Color('#f2d7b0')
    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 220
      tmp.copy(hor).lerp(top, clamp01(y * 0.85 + 0.35))
      col[i * 3] = tmp.r
      col[i * 3 + 1] = tmp.g
      col[i * 3 + 2] = tmp.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [])
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} depthWrite={false} />
    </mesh>
  )
}

function Clouds({ still }: { still: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const puffs = useMemo(
    () =>
      [
        { x: -38, y: 34, z: -42, s: 7 },
        { x: 22, y: 38, z: -55, s: 9 },
        { x: -8, y: 36, z: -70, s: 8 },
        { x: 48, y: 32, z: -30, s: 6 },
        { x: -55, y: 30, z: -18, s: 6.5 }
      ] as const,
    []
  )
  useFrame((_, dt) => {
    if (still || !ref.current) return
    ref.current.rotation.y += Math.min(dt, 0.05) * 0.012
  })
  return (
    <group ref={ref}>
      {puffs.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshLambertMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0.7, 0.1, 0.15]}>
            <sphereGeometry args={[0.72, 8, 6]} />
            <meshLambertMaterial color="#ffffff" />
          </mesh>
          <mesh position={[-0.65, 0.05, -0.1]}>
            <sphereGeometry args={[0.65, 8, 6]} />
            <meshLambertMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const FLAKES = 280

function Snow({ still }: { still: boolean }) {
  const ref = useRef<THREE.Points>(null)
  const geo = useMemo(() => {
    const arr = new Float32Array(FLAKES * 3)
    for (let i = 0; i < FLAKES; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 100
      arr[i * 3 + 1] = Math.random() * 44 - 6
      arr[i * 3 + 2] = (Math.random() - 0.5) * 90
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    g.computeBoundingSphere()
    return g
  }, [])
  useFrame((_, dt) => {
    if (still || !ref.current) return
    const step = Math.min(dt, 0.05)
    const p = ref.current.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < FLAKES; i++) {
      let y = p.getY(i) - step * (1.4 + (i % 5) * 0.35)
      if (y < -6) y = 38
      p.setY(i, y)
      p.setX(i, p.getX(i) + Math.sin(y * 0.5 + i) * step * 0.5)
    }
    p.needsUpdate = true
  })
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#ffffff" size={0.28} sizeAttenuation transparent opacity={0.85} depthWrite={false} />
    </points>
  )
}

function Rig({ still }: { still: boolean }): null {
  useFrame(({ camera, clock }) => {
    const t = still ? 0 : clock.getElapsedTime() * 0.035
    camera.position.x = 14 + Math.sin(t) * 3
    camera.position.y = 8.2 + Math.sin(t * 0.6) * 0.35
    camera.position.z = 20
    camera.lookAt(1.5, 11, -26)
  })
  return null
}

export function MountainScene({ still = false, onFail }: { still?: boolean; onFail?: () => void }) {
  return (
    <Canvas
      className="rc-scene"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      dpr={[1, 1]}
      frameloop={still ? 'demand' : 'always'}
      camera={{ position: [14, 8.2, 20], fov: 36, near: 0.5, far: 420 }}
      shadows={false}
      gl={{
        antialias: false,
        alpha: true,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: false,
        stencil: false,
        depth: true
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping
        gl.outputColorSpace = THREE.SRGBColorSpace
        const el = gl.domElement
        el.addEventListener(
          'webglcontextlost',
          (e) => {
            e.preventDefault()
            el.style.visibility = 'hidden'
            onFail?.()
          },
          false
        )
      }}
    >
      <fog attach="fog" args={['#c5def0', 90, 260]} />
      <hemisphereLight args={['#fff1d6', '#5f88b0', 1.05]} />
      <directionalLight position={[-60, 50, 10]} intensity={1.55} color="#ffe6b8" />
      <directionalLight position={[40, 18, 40]} intensity={0.35} color="#9ec9f2" />
      <Sky />
      <mesh position={[-70, 48, -40]}>
        <sphereGeometry args={[6, 12, 10]} />
        <meshBasicMaterial color="#ffe08a" toneMapped={false} />
      </mesh>
      <Terrain />
      <Trees />
      <ForegroundPines />
      <Village />
      <Lift still={still} />
      <Skiers still={still} />
      <Clouds still={still} />
      <Snow still={still} />
      <Rig still={still} />
    </Canvas>
  )
}

export default MountainScene
