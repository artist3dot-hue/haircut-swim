// 合成音效（Web Audio API，全部代码生成，不用音频文件）。
//
// - 咔嚓：短噪声（高通）+ 几个高频金属泛音，音高随机 ±8%，再按连击升半音
// - 限流：同一帧（约 16ms 内）最多 maxSnipsPerFrame 个剪断音，多出来的并入"沙沙"底噪层
// - 沙沙底噪：一条常驻的带通噪声，音量跟着"能量"走（断发落地、被限流的剪断音都往里加能量）
// - 空剪：没剪到头发时剪刀开合的轻"咔"，让玩家感到节奏
// - 连击档位重音、500 连击后的鼓点

import { JUICE } from '../data/juice'

type Ctx = AudioContext

export class Sfx {
  private ctx: Ctx | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private rustleGain: GainNode | null = null
  private rustleEnergy = 0
  /** 当前"帧"窗口里已经播了几个剪断音 */
  private frameStart = -1
  private frameCount = 0
  private drumOn = false
  private nextBeat = 0
  private beat = 0
  private tickLast = 0
  /** 统计：播放 / 并入底噪的剪断音数量 */
  snipsPlayed = 0
  snipsMerged = 0

  /** 第一次用户手势时调用（浏览器要求手势后才能出声）。 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = JUICE.masterVolume
    // 轻压一下，避免很多声音叠在一起爆音
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 8
    comp.ratio.value = 4
    comp.attack.value = 0.002
    comp.release.value = 0.12
    master.connect(comp)
    comp.connect(ctx.destination)
    this.master = master

    // 1 秒白噪声，所有噪声类声音共用
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    this.noise = buf

    // 沙沙底噪层：常驻循环噪声，音量由能量控制
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 5200
    bp.Q.value = 0.7
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 2500
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(bp)
    bp.connect(hp)
    hp.connect(g)
    g.connect(master)
    src.start()
    this.rustleGain = g
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running'
  }

  /** 每个渲染帧调用：更新音量、底噪能量衰减、鼓点调度。 */
  tick(dt: number): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    this.master.gain.setTargetAtTime(JUICE.masterVolume, ctx.currentTime, 0.05)
    this.rustleEnergy *= Math.exp(-dt * 3.2)
    if (this.rustleGain) {
      const v = Math.min(0.22, Math.sqrt(this.rustleEnergy) * 0.06)
      this.rustleGain.gain.setTargetAtTime(v, ctx.currentTime, 0.04)
    }
    if (this.drumOn) this.scheduleDrums()
  }

  /** 往沙沙层加能量（断发落地、被限流的剪断音）。 */
  rustle(amount: number): void {
    this.rustleEnergy = Math.min(40, this.rustleEnergy + amount)
  }

  /**
   * 剪断音。semitones：连击升调；count：这一下总共剪断几根（用来压低单个音量）。
   * 返回是否真的播放（被限流时返回 false，并入沙沙层）。
   */
  snip(semitones: number, count = 1): boolean {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return false
    const now = ctx.currentTime
    if (now - this.frameStart > 0.016) {
      this.frameStart = now
      this.frameCount = 0
    }
    if (this.frameCount >= JUICE.maxSnipsPerFrame) {
      this.snipsMerged++
      this.rustle(1.2)
      return false
    }
    // 同一帧里的几个音错开几毫秒，听起来是"咔嚓嚓"而不是一个很响的"咔"
    const t = now + 0.004 + this.frameCount * 0.011 + Math.random() * 0.004
    this.frameCount++
    this.snipsPlayed++
    const pitch = (1 + (Math.random() * 2 - 1) * JUICE.pitchJitter) * 2 ** (semitones / 12)
    const vol = 0.55 / Math.sqrt(Math.min(count, JUICE.maxSnipsPerFrame))

    // 1) 噪声瞬态：高通 + 带通，很短
    const n = ctx.createBufferSource()
    n.buffer = this.noise
    n.playbackRate.value = pitch
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3800 * pitch
    const bp = ctx.createBiquadFilter()
    bp.type = 'peaking'
    bp.frequency.value = 7200 * pitch
    bp.gain.value = 9
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0, t)
    ng.gain.linearRampToValueAtTime(vol, t + 0.0015)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.045)
    n.connect(hp)
    hp.connect(bp)
    bp.connect(ng)
    ng.connect(this.master)
    n.start(t, Math.random() * 0.9, 0.06)

    // 2) 金属泛音：几个不成谐波比的高频正弦，快速衰减
    const partials = [2870, 4130, 5610, 7450]
    for (let i = 0; i < partials.length; i++) {
      const o = ctx.createOscillator()
      o.type = i === 0 ? 'triangle' : 'sine'
      o.frequency.value = partials[i]! * pitch
      const g = ctx.createGain()
      const pv = vol * (0.22 - i * 0.04)
      const dec = 0.07 - i * 0.012
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(pv, t + 0.001)
      g.gain.exponentialRampToValueAtTime(0.0008, t + dec)
      o.connect(g)
      g.connect(this.master)
      o.start(t)
      o.stop(t + dec + 0.01)
    }

    // 3) 低一点的"咔"：刃合上的实感
    const c = ctx.createOscillator()
    c.type = 'square'
    c.frequency.setValueAtTime(1400 * pitch, t)
    c.frequency.exponentialRampToValueAtTime(500 * pitch, t + 0.012)
    const cg = ctx.createGain()
    cg.gain.setValueAtTime(vol * 0.12, t)
    cg.gain.exponentialRampToValueAtTime(0.0008, t + 0.016)
    const clp = ctx.createBiquadFilter()
    clp.type = 'lowpass'
    clp.frequency.value = 3000
    c.connect(clp)
    clp.connect(cg)
    cg.connect(this.master)
    c.start(t)
    c.stop(t + 0.03)
    return true
  }

  /** 没剪到东西的空剪：轻、短、偏低。 */
  emptySnap(): void {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const t = ctx.currentTime + 0.002
    const pitch = 1 + (Math.random() * 2 - 1) * 0.05
    const n = ctx.createBufferSource()
    n.buffer = this.noise
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 3400 * pitch
    bp.Q.value = 3
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.09, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.025)
    n.connect(bp)
    bp.connect(g)
    g.connect(this.master)
    n.start(t, Math.random() * 0.9, 0.03)
  }

  /** 光点飞进计数器的"叮"：很轻，限速，连续到达时音高往上走一点。 */
  collect(streak: number): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const now = ctx.currentTime
    if (now - this.tickLast < 0.035) return
    this.tickLast = now
    const semis = Math.min(14, streak * 0.5)
    const f = 1760 * 2 ** (semis / 12)
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(0.045, now + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.09)
    o.connect(g)
    g.connect(this.master)
    o.start(now)
    o.stop(now + 0.1)
  }

  /** 连击档位的重音：低鼓 + 上扬的和弦。tier 0..3 */
  tierUp(tier: number): void {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const t = ctx.currentTime + 0.005
    this.kick(t, 0.5 + tier * 0.1)
    // 和弦（大三和弦 + 八度），越高档越亮
    const root = 523.25 * 2 ** ((tier * 2) / 12)
    const ratios = [1, 1.26, 1.5, 2]
    ratios.forEach((r, i) => {
      const o = ctx.createOscillator()
      o.type = i % 2 === 0 ? 'square' : 'triangle'
      o.frequency.value = root * r
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 2400 + tier * 800
      const g = ctx.createGain()
      const st = t + i * 0.035
      g.gain.setValueAtTime(0, st)
      g.gain.linearRampToValueAtTime(0.06, st + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0008, st + 0.35)
      o.connect(lp)
      lp.connect(g)
      g.connect(this.master!)
      o.start(st)
      o.stop(st + 0.4)
    })
  }

  private kick(t: number, vol: number): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + 0.25)
  }

  private hat(t: number, vol: number): void {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const n = ctx.createBufferSource()
    n.buffer = this.noise
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 8000
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
    n.connect(hp)
    hp.connect(g)
    g.connect(this.master)
    n.start(t, Math.random() * 0.9, 0.05)
  }

  /** 500 连击后的鼓点（GDD："背景音乐加鼓点"；目前还没有背景音乐，先只有鼓）。 */
  setDrums(on: boolean): void {
    if (on === this.drumOn) return
    this.drumOn = on
    if (on && this.ctx) {
      this.nextBeat = this.ctx.currentTime + 0.05
      this.beat = 0
    }
  }

  private scheduleDrums(): void {
    const ctx = this.ctx
    if (!ctx) return
    const step = 60 / 150 / 2 // 150 BPM 的八分音符
    while (this.nextBeat < ctx.currentTime + 0.12) {
      const b = this.beat % 8
      if (b === 0 || b === 3 || b === 4) this.kick(this.nextBeat, 0.32)
      this.hat(this.nextBeat, b % 2 === 0 ? 0.06 : 0.035)
      this.nextBeat += step
      this.beat++
    }
  }
}

export const sfx = new Sfx()
