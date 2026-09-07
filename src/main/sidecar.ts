import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { app } from 'electron'
import type { SidecarState } from '@shared/ipc-contract'
import { resolvePython } from './python'

const HANDSHAKE_TIMEOUT_MS = 30_000
const MAX_STDERR_LINES = 200

interface Handshake {
  event: 'ready'
  host: string
  port: number
  pid: number
  version: string
}

/**
 * Cycle de vie du processus Python.
 *
 * Le port n'est pas choisi par nous : le sidecar réserve une socket libre et
 * annonce le port sur stdout. Cela évite la course classique « je teste que le
 * port 8000 est libre, puis je le donne à un enfant qui le prend 200 ms plus
 * tard » — entre-temps un autre processus a pu s'en emparer.
 */
export class Sidecar extends EventEmitter {
  private child: ChildProcess | null = null
  private state: SidecarState = { status: 'stopped' }
  private stderrBuffer: string[] = []
  private readonly token = randomBytes(32).toString('hex')
  private stopping = false

  getState(): SidecarState {
    return this.state
  }

  getToken(): string {
    return this.token
  }

  private setState(state: SidecarState): void {
    this.state = state
    this.emit('state', state)
  }

  async start(): Promise<SidecarState> {
    if (this.child) return this.state
    this.stopping = false
    this.setState({ status: 'starting' })

    const python = resolvePython()
    // Le token part sur stdin, pas en argument : sous Windows, la ligne de
    // commande de tout processus de la session est lisible sans élévation
    // (`Get-CimInstance Win32_Process`). Un token en argv serait accessible au
    // premier programme venu, ce qui viderait l'authentification de son sens.
    const args = [
      ...python.args,
      '--host',
      '127.0.0.1',
      '--port',
      '0',
      '--token-stdin',
      '--data-dir',
      app.getPath('userData')
    ]

    const child = spawn(python.command, args, {
      cwd: python.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        // Sans cela, la ligne de handshake peut rester dans le tampon stdout de
        // Python et l'application attendrait 30 s pour rien.
        PYTHONUNBUFFERED: '1'
      }
    })
    this.child = child
    child.stdin?.write(`${this.token}\n`)
    child.stdin?.end()

    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
        this.stderrBuffer.push(line)
        if (this.stderrBuffer.length > MAX_STDERR_LINES) this.stderrBuffer.shift()
        this.emit('log', line)
      }
    })

    child.on('exit', (code, signal) => {
      this.child = null
      if (this.stopping) {
        this.setState({ status: 'stopped' })
        return
      }
      this.setState({
        status: 'error',
        message: `Le sidecar Python s'est arrêté (code ${code ?? 'null'}, signal ${signal ?? 'null'}).`,
        hint: this.diagnose()
      })
    })

    child.on('error', (err) => {
      this.child = null
      this.setState({
        status: 'error',
        message: `Impossible de lancer « ${python.command} » : ${err.message}`,
        hint:
          python.warning ??
          'Vérifiez que Python 3.11+ est installé et que `npm run bootstrap` a été exécuté.'
      })
    })

    try {
      const handshake = await this.awaitHandshake(child)
      this.setState({
        status: 'ready',
        baseUrl: `http://${handshake.host}:${handshake.port}`,
        token: this.token,
        port: handshake.port,
        pid: handshake.pid,
        version: handshake.version
      })
    } catch (err) {
      this.setState({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
        hint: python.warning ?? this.diagnose()
      })
    }
    return this.state
  }

  /** Lit stdout jusqu'à la ligne JSON `{"event":"ready",...}`. */
  private awaitHandshake(child: ChildProcess): Promise<Handshake> {
    return new Promise((resolve, reject) => {
      let buffer = ''
      const timer = setTimeout(() => {
        cleanup()
        reject(
          new Error(
            `Le sidecar n'a pas répondu en ${HANDSHAKE_TIMEOUT_MS / 1000} s. ` +
              'Consultez le journal ci-dessous.'
          )
        )
      }, HANDSHAKE_TIMEOUT_MS)

      const onData = (chunk: string): void => {
        buffer += chunk
        const newline = buffer.indexOf('\n')
        if (newline === -1) return
        const line = buffer.slice(0, newline).trim()
        try {
          const parsed = JSON.parse(line) as Handshake
          if (parsed.event !== 'ready') throw new Error(`Handshake inattendu : ${line}`)
          cleanup()
          resolve(parsed)
        } catch (err) {
          cleanup()
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }

      const onExit = (): void => {
        cleanup()
        reject(new Error(`Le sidecar s'est arrêté avant le handshake.\n${this.diagnose()}`))
      }

      const cleanup = (): void => {
        clearTimeout(timer)
        child.stdout?.off('data', onData)
        child.off('exit', onExit)
      }

      child.stdout?.setEncoding('utf-8')
      child.stdout?.on('data', onData)
      child.once('exit', onExit)
    })
  }

  /** Traduit les échecs de démarrage les plus fréquents en conseil actionnable. */
  private diagnose(): string {
    const log = this.stderrBuffer.join('\n')
    if (/No Python at/i.test(log)) {
      // Signature du lanceur de venv Windows : sidecar\.venv\Scripts\python.exe
      // n'est qu'un aiguilleur vers le Python de base enregistré dans
      // pyvenv.cfg à la création. Si ce Python a été désinstallé ou mis à jour
      // (3.12 → 3.13 change le dossier), le venv est irréparable en l'état.
      return (
        "L'environnement virtuel du sidecar pointe vers un Python qui n'existe plus " +
        '(désinstallé ou mis à jour depuis sa création). Supprimez-le et recréez-le :\n' +
        '    Remove-Item -Recurse -Force sidecar\\.venv\n' +
        '    npm run bootstrap'
      )
    }
    if (/No module named ['"]?skitrack/.test(log)) {
      return 'Le paquet `skitrack` est introuvable. Lancez `npm run bootstrap` pour créer sidecar/.venv et installer les dépendances.'
    }
    if (/No module named ['"]?(fastapi|uvicorn|sqlalchemy|ijson|shapely)/.test(log)) {
      return 'Des dépendances Python manquent. Lancez `npm run bootstrap`.'
    }
    if (/Microsoft Store|introuvable|was not found/i.test(log)) {
      return "L'alias Python du Microsoft Store a été appelé. Installez Python 3.11+ depuis python.org en cochant « Add python.exe to PATH », puis `npm run bootstrap`."
    }
    if (/Permission denied|Accès refusé|WinError 10013/i.test(log)) {
      return "Le pare-feu ou une politique locale bloque l'écoute sur 127.0.0.1. Autorisez python.exe."
    }
    return this.stderrBuffer.slice(-15).join('\n') || 'Aucune sortie du sidecar.'
  }

  getLog(): string[] {
    return [...this.stderrBuffer]
  }

  async restart(): Promise<SidecarState> {
    await this.stop()
    return this.start()
  }

  async stop(): Promise<void> {
    const child = this.child
    if (!child) return
    this.stopping = true
    await new Promise<void>((resolve) => {
      const done = setTimeout(() => {
        this.killTree(child.pid)
        resolve()
      }, 3000)
      child.once('exit', () => {
        clearTimeout(done)
        resolve()
      })
      child.kill()
    })
    this.child = null
    this.setState({ status: 'stopped' })
  }

  /**
   * Termine l'arborescence complète du sidecar.
   *
   * Nécessaire sous Windows : `venv\\Scripts\\python.exe` est un lanceur qui
   * ré-exécute l'interpréteur de base dans un processus enfant, et c'est ce
   * petit-fils qui tient réellement la socket et la base. Tuer le seul
   * processus que Node connaît laisserait un sidecar orphelin conservant le
   * port et le verrou SQLite — vérifié sur cette machine : le lanceur et
   * l'interpréteur réel sont bien deux PID distincts.
   */
  private killTree(pid: number | undefined): void {
    if (pid === undefined) return
    if (process.platform === 'win32') {
      try {
        spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
      } catch {
        this.child?.kill('SIGKILL')
      }
    } else {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        this.child?.kill('SIGKILL')
      }
    }
  }
}
