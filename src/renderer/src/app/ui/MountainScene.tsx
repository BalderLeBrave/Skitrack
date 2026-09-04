/**
 * MountainScene — vallée alpine animée (React Three Fiber).
 *
 * Relief procédural (bruit multifractal « ridged », trois sommets, chaîne à
 * l'horizon, vallée au premier plan), piste damée, village de chalets aux
 * fenêtres allumées, sapins enneigés, télésiège dont les cabines montent et
 * descendent, skieurs qui dévalent la piste, chute de neige. Lumière rasante
 * chaude, brume bleutée. Tout est figé sous `prefers-reduced-motion`.
 * Aucune donnée métier : c'est une ambiance, pas un relief réel.
 */

import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const SEG = 96
const SIZE = 150
/* Position du plan de terrain dans le monde (translation) et son axe Y local. */
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

function ridged(x: number, y: number, oct = 5): number {
  let sum = 0
  let amp = 0.6
  let freq = 1
  let weight = 1
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(noise(x * freq, y * freq) * 2 - 1)
    n = n * n * weight
    weight = Math.min(1, Math.max(0, n * 1.6))
    sum += n * amp
    amp *= 0.5
    freq *= 2.1
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

/** Piste : du col sous le sommet central jusqu'au village. u = f(v). */
const PISTE_TOP = 0.6
const PISTE_BOT = 0.27
function pisteU(v: number): number {
  const t = clamp01((v - PISTE_BOT) / (PISTE_TOP - PISTE_BOT))
  return 0.6 + Math.sin(t * Math.PI * 1.6) * 0.045 - t * 0.09
}

const VILLAGE = { u: 0.6, v: 0.22, r: 0.085 }

function rawHeight(u: number, v: number): number {
  let h = fbm(u * 2.6 + 3.1, v * 2.6 + 8.7) * 5
  h += ridged(u * 3.4 + 1.7, v * 3.4 + 4.2) * 9.5
  h += peak(u, v, 0.5, 0.68, 0.34, 27)
  h += peak(u, v, 0.19, 0.7, 0.28, 18)
  h += peak(u, v, 0.81, 0.68, 0.3, 21)
  h += peak(u, v, 0.33, 0.5, 0.15, 6)
  h += peak(u, v, 0.68, 0.48, 0.14, 5)
  h += smooth(0.78, 1, v) * (14 + ridged(u * 6 + 9, v * 6) * 12)
  h -= smooth(0.42, 0, v) * 16
  return h
}

/** Hauteur du plateau du village : moyenne du relief brut à son centre. */
const VILLAGE_H = rawHeight(VILLAGE.u, VILLAGE.v) + 0.6

function heightAt(u: number, v: number): number {
  let h = rawHeight(u, v)
  // Plateau du village.
  const dv = Math.hypot((u - VILLAGE.u) * 1.3, v - VILLAGE.v) / VILLAGE.r
  const plateau = smooth(1, 0.55, dv)
  h = h + (VILLAGE_H - h) * plateau
  // Piste damée : couloir lissé le long de la courbe, du col au village.
  if (v > PISTE_BOT - 0.03 && v < PISTE_TOP + 0.02) {
    const du = Math.abs(u - pisteU(v))
    const w = smooth(0.03, 0.01, du)
    const t = clamp01((v - PISTE_BOT) / (PISTE_TOP - PISTE_BOT))
    const topH = rawHeight(pisteU(PISTE_TOP), PISTE_TOP)
    const ramp = VILLAGE_H + (topH - VILLAGE_H) * (t * t * 0.55 + t * 0.45)
    h = h + (ramp - h) * w
  }
  return h
}

/** Coordonnées monde d'un point (u, v) posé sur le terrain. */
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
  const snow = new THREE.Color('#eef4fa')
  const snowShade = new THREE.Color('#c9dbeb')
  const piste = new THREE.Color('#e9f1f8')
  const rockHi = new THREE.Color('#6d7f93')
  const rockLo = new THREE.Color('#2f3d4a')
  const tmp = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / SIZE + 0.5
    const v = pos.getY(i) / SIZE + 0.5
    const h = pos.getZ(i)
    const flat = nrm.getZ(i)
    const grain = (noise(u * 46 + 2, v * 46 + 5) - 0.5) * 0.28
    const alt = smooth(4, 20, h) * 0.35
    const snowy = smooth(0.48 - alt, 0.78 - alt, flat + grain)
    tmp.copy(rockLo).lerp(rockHi, smooth(-6, 22, h))
    tmp.lerp(smooth(0.86, 1, flat) > 0.5 ? snow : snowShade, snowy)
    const onPiste = v > PISTE_BOT - 0.03 && v < PISTE_TOP + 0.02 ? smooth(0.03, 0.012, Math.abs(u - pisteU(v))) : 0
    tmp.lerp(piste, onPiste)
    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeBoundingSphere()
  return geo
}

function Terrain(): JSX.Element {
  const geo = useMemo(buildTerrain, [])
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, T_Y, T_Z]}>
      <meshStandardMaterial vertexColors roughness={0.9} metalness={0.02} />
    </mesh>
  )
}

/* ------------------------------------------------------------------------ */
/* Village : chalets + fenêtres allumées                                     */

interface Chalet {
  p: THREE.Vector3
  rot: number
  w: number
  d: number
  h: number
}

function makeChalets(): Chalet[] {
  const out: Chalet[] = []
  const N = 14
  for (let i = 0; i < N; i++) {
    const a = hash(i, 3) * Math.PI * 2
    const r = 0.018 + hash(i, 7) * (VILLAGE.r * 0.62)
    const u = VILLAGE.u + Math.cos(a) * r * 0.8
    const v = VILLAGE.v + Math.sin(a) * r * 0.55
    if (Math.abs(u - pisteU(v)) < 0.02 && v > PISTE_BOT - 0.01) continue
    const w = 2.2 + hash(i, 11) * 1.6
    const d = 1.8 + hash(i, 13) * 1.4
    const h = 1.5 + hash(i, 17) * 0.8
    out.push({ p: onTerrain(u, v, h / 2 - 0.15), rot: (hash(i, 19) - 0.5) * 0.6, w, d, h })
  }
  return out
}

function Village(): JSX.Element {
  const chalets = useMemo(makeChalets, [])
  return (
    <group>
      {chalets.map((c, i) => (
        <group key={i} position={c.p} rotation={[0, c.rot, 0]}>
          <mesh>
            <boxGeometry args={[c.w, c.h, c.d]} />
            <meshStandardMaterial color="#5b4030" roughness={0.9} />
          </mesh>
          {/* Toit à deux pans (prisme) enneigé */}
          <mesh position={[0, c.h / 2 + 0.55, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[Math.max(c.w, c.d) * 0.78, 1.1, 4]} />
            <meshStandardMaterial color="#eef4fa" roughness={0.95} />
          </mesh>
          {/* Fenêtres chaudes, deux faces */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, -0.05, (s * c.d) / 2 + s * 0.01]}>
              <planeGeometry args={[c.w * 0.62, c.h * 0.32]} />
              <meshBasicMaterial color="#ffc46b" side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
      <pointLight position={onTerrain(VILLAGE.u, VILLAGE.v, 4)} intensity={22} distance={22} color="#ffb866" />
    </group>
  )
}

/* ------------------------------------------------------------------------ */
/* Sapins enneigés (instanciés)                                              */

const TREES = 80

function Trees(): JSX.Element {
  const items = useMemo(() => {
    const m: THREE.Matrix4[] = []
    const dummy = new THREE.Object3D()
    let tries = 0
    while (m.length < TREES && tries < TREES * 6) {
      tries++
      const u = 0.12 + hash(tries, 23) * 0.76
      const v = 0.1 + hash(tries, 29) * 0.42
      const h = rawHeight(u, v)
      if (h > 9 || h < VILLAGE_H - 4) continue
      if (Math.abs(u - pisteU(v)) < 0.03 && v > PISTE_BOT - 0.02 && v < PISTE_TOP) continue
      if (Math.hypot((u - VILLAGE.u) * 1.3, v - VILLAGE.v) < VILLAGE.r * 0.7) continue
      const s = 0.55 + hash(tries, 31) * 0.7
      dummy.position.copy(onTerrain(u, v, s * 1.1))
      dummy.scale.set(s, s * 1.5, s)
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
    <group>
      <instancedMesh ref={apply} args={[undefined, undefined, TREES]} frustumCulled={false}>
        <coneGeometry args={[0.9, 2.4, 7]} />
        <meshStandardMaterial color="#26523a" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={apply} args={[undefined, undefined, TREES]} frustumCulled={false} position={[0, 0.5, 0]} scale={[0.75, 0.7, 0.75]}>
        <coneGeometry args={[0.9, 2.4, 7]} />
        <meshStandardMaterial color="#f1f6fb" roughness={0.95} />
      </instancedMesh>
    </group>
  )
}

/* ------------------------------------------------------------------------ */
/* Télésiège : pylônes, câble, cabines qui montent et descendent             */

const LIFT_FROM = { u: 0.655, v: 0.23 }
const LIFT_TO = { u: 0.62, v: 0.6 }
const PYLONS = 7
const CABINS = 10

function liftPoints(): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= PYLONS; i++) {
    const t = i / PYLONS
    const u = LIFT_FROM.u + (LIFT_TO.u - LIFT_FROM.u) * t
    const v = LIFT_FROM.v + (LIFT_TO.v - LIFT_FROM.v) * t
    pts.push(onTerrain(u, v, 6.5))
  }
  return pts
}

function Lift({ still }: { still: boolean }): JSX.Element {
  const pylons = useMemo(liftPoints, [])
  const curve = useMemo(() => new THREE.CatmullRomCurve3(pylons, false, 'catmullrom', 0.2), [pylons])
  const cable = useMemo(() => new THREE.TubeGeometry(curve, 64, 0.05, 5, false), [curve])
  const cabins = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const phase = useRef(0)

  useFrame((_, dt) => {
    const mesh = cabins.current
    if (!mesh) return
    if (!still) phase.current = (phase.current + Math.min(dt, 0.05) * 0.03) % 1
    for (let i = 0; i < CABINS; i++) {
      const up = i < CABINS / 2
      const k = ((i % (CABINS / 2)) / (CABINS / 2) + phase.current) % 1
      const t = up ? k : 1 - k
      const p = curve.getPointAt(t)
      dummy.position.set(p.x + (up ? -0.55 : 0.55), p.y - 1.05, p.z)
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
            <meshStandardMaterial color="#8e99a6" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 3.2, 0]}>
            <boxGeometry args={[1.8, 0.16, 0.16]} />
            <meshStandardMaterial color="#8e99a6" metalness={0.5} roughness={0.5} />
          </mesh>
        </group>
      ))}
      {[-0.55, 0.55].map((dx) => (
        <mesh key={dx} geometry={cable} position={[dx, 0, 0]}>
          <meshStandardMaterial color="#3a4652" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <instancedMesh ref={cabins} args={[undefined, undefined, CABINS]} frustumCulled={false}>
        <boxGeometry args={[1.3, 1.5, 1.3]} />
        <meshStandardMaterial color="#e8412a" roughness={0.45} metalness={0.15} />
      </instancedMesh>
    </group>
  )
}

/* ------------------------------------------------------------------------ */
/* Skieurs qui dévalent la piste                                             */

const SKIERS = 16
const SKI_COLORS = ['#ff5a3c', '#2f80ed', '#f2c94c', '#27ae60', '#9b51e0', '#ffffff', '#111827', '#eb5757']

function Skiers({ still }: { still: boolean }): JSX.Element {
  const bodies = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const sk = useMemo(
    () =>
      Array.from({ length: SKIERS }, (_, i) => ({
        t: hash(i, 41),
        speed: 0.028 + hash(i, 43) * 0.02,
        side: (hash(i, 47) - 0.5) * 0.018,
        wob: hash(i, 53) * Math.PI * 2
      })),
    []
  )

  useFrame(({ clock }, dt) => {
    const mesh = bodies.current
    if (!mesh) return
    const step = still ? 0 : Math.min(dt, 0.05)
    const time = clock.getElapsedTime()
    for (let i = 0; i < SKIERS; i++) {
      const s = sk[i]
      s.t += step * s.speed
      if (s.t > 1) s.t -= 1
      // t = 0 en haut de la piste, 1 au village.
      const v = PISTE_TOP - (PISTE_TOP - PISTE_BOT) * s.t
      const carve = still ? 0 : Math.sin(time * 2.2 + s.wob) * 0.011
      const u = pisteU(v) + s.side + carve
      const p = onTerrain(u, v, 0.55)
      dummy.position.copy(p)
      dummy.rotation.set(0, Math.PI + (carve * 40), 0)
      dummy.scale.setScalar(1.8)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      if (mesh.instanceColor == null) mesh.setColorAt(i, color.set(SKI_COLORS[i % SKI_COLORS.length]))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={bodies} args={[undefined, undefined, SKIERS]} frustumCulled={false}>
      <capsuleGeometry args={[0.22, 0.6, 3, 6]} />
      <meshStandardMaterial roughness={0.6} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------------ */
/* Flocons                                                                   */

const FLAKES = 360

function Snow({ still }: { still: boolean }): JSX.Element {
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
      <pointsMaterial color="#ffffff" size={0.24} sizeAttenuation transparent opacity={0.8} depthWrite={false} />
    </points>
  )
}

/* ------------------------------------------------------------------------ */

function Rig({ still }: { still: boolean }): null {
  useFrame(({ camera, clock }) => {
    const t = still ? 0 : clock.getElapsedTime() * 0.05
    camera.position.x = Math.sin(t) * 6
    camera.position.y = 20 + Math.sin(t * 0.7) * 0.8
    camera.lookAt(0, 3, -20)
  })
  return null
}

export function MountainScene({ still = false }: { still?: boolean }): JSX.Element {
  return (
    <Canvas
      className="rc-scene"
      dpr={[1, 1]}
      frameloop={still ? 'demand' : 'always'}
      camera={{ position: [0, 20, 84], fov: 44, near: 0.5, far: 320 }}
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
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 0.9
        const el = gl.domElement
        el.addEventListener(
          'webglcontextlost',
          (e) => {
            e.preventDefault()
            el.style.visibility = 'hidden'
          },
          false
        )
      }}
    >
      <fog attach="fog" args={['#b7d3ea', 95, 270]} />
      <hemisphereLight args={['#cfe3f7', '#3f5f7d', 0.7]} />
      <directionalLight position={[-70, 42, -10]} intensity={2.4} color="#ffe9c9" />
      <directionalLight position={[40, 20, 40]} intensity={0.35} color="#8fbfe8" />
      <Terrain />
      <Trees />
      <Village />
      <Lift still={still} />
      <Skiers still={still} />
      <Snow still={still} />
      <Rig still={still} />
    </Canvas>
  )
}

export default MountainScene
