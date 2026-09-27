// 合成音效（Web Audio API，全部代码生成，不用音频文件）。
//
// - 咔嚓：短噪声（高通）+ 几个高频金属泛音，音高随机 ±8%，再按连击升半音
// - 限流：同一帧（约 16ms 内）最多 maxSnipsPerFrame 个剪断音，多出来的并入"沙沙"底噪层
// - 沙沙底噪：一条常驻的带通噪声，音量跟着"能量"走（断发落地、被限流的剪断音都往里加能量）
// - 空剪：没剪到头发时剪刀开合的轻"咔"，让玩家感到节奏
// - 连击档位重音、500 连击后的鼓点

import { JUICE } from '../data/juice'

export type SnipVoice = 'knife' | 'scissors' | 'shears' | 'garden' | 'clipper'

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
  private clipper: { o1: OscillatorNode; o2: OscillatorNode; lp: BiquadFilterNode; g: GainNode } | null = null
  private lastClang = 0
  private lastThud = 0
  /** 玩家设置的音量 0..1（存档里），乘在 JUICE.masterVolume 上 */
  volume = 0.8
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
    master.gain.value = JUICE.masterVolume * this.volume
    // 轻压一下，避免很多声音叠在一起爆音
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 8
    comp.ratio.value = 4
    comp.attack.value = 0.002
    comp.release.value = 0.12
    // 整体柔一点：6.5kHz 以上轻轻压掉（EDY：不要太尖锐）
    const soft = ctx.createBiquadFilter()
    soft.type = 'lowpass'
    soft.frequency.value = 6500
    soft.Q.value = 0.5
    master.connect(soft)
    soft.connect(comp)
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
    bp.frequency.value = 3200
    bp.Q.value = 0.8
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1400
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
    this.master.gain.setTargetAtTime(JUICE.masterVolume * this.volume, ctx.currentTime, 0.05)
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

  /** 带包络的一段滤波噪声。 */
  private noiseHit(t: number, vol: number, dec: number, type: BiquadFilterType, f0: number, f1: number, q = 1, rate = 1): void {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const n = ctx.createBufferSource()
    n.buffer = this.noise
    n.playbackRate.value = rate
    const f = ctx.createBiquadFilter()
    f.type = type
    f.Q.value = q
    f.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dec)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0008, t + dec)
    n.connect(f)
    f.connect(g)
    g.connect(this.master)
    n.start(t, Math.random() * 0.8, dec + 0.05)
  }

  /**
   * 剪断音（按工具换音色）。semitones：连击升调；count：这一下剪断几缕（压低单个音量）。
   * 同一帧最多 maxSnipsPerFrame 个，多的并入沙沙层。返回是否真的播放。
   * 音色原则（EDY：更爽、不要尖锐）：高频只用短噪声点缀，主体放在 150–3000Hz，给一个"实"的低频撞击。
   */
  snip(semitones: number, count = 1, tool: SnipVoice = 'scissors'): boolean {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return false
    const now = ctx.currentTime
    if (now - this.frameStart > 0.016) {
      this.frameStart = now
      this.frameCount = 0
    }
    if (this.frameCount >= JUICE.maxSnipsPerFrame) {
      this.snipsMerged++
      this.rustle(1)
      return false
    }
    const t = now + 0.004 + this.frameCount * 0.013 + Math.random() * 0.004
    this.frameCount++
    this.snipsPlayed++
    const p = (1 + (Math.random() * 2 - 1) * JUICE.pitchJitter) * 2 ** (semitones / 12)
    const vol = 0.6 / Math.sqrt(Math.min(count, JUICE.maxSnipsPerFrame))
    switch (tool) {
      case 'knife':
        // "唰"：一道从亮到暗扫过去的噪声 + 一个很轻的"嗒"
        this.noiseHit(t, vol * 0.55, 0.07, 'bandpass', 3400 * p, 1300 * p, 1.4)
        this.tone(900 * p, t, vol * 0.12, 0.02, 'triangle', 500 * p)
        break
      case 'scissors':
        // "咔嚓"：刃先碰一下（小"嗒"），紧接着合上（实心的撞击 + 中频的嚓）
        this.tone(1300 * p, t, vol * 0.06, 0.012, 'triangle')
        this.tone(210 * p, t + 0.012, vol * 0.42, 0.06, 'sine', 120 * p)
        this.noiseHit(t + 0.012, vol * 0.5, 0.055, 'bandpass', 2600 * p, 1800 * p, 1.1)
        this.tone(1650 * p, t + 0.012, vol * 0.07, 0.07, 'triangle')
        this.tone(2430 * p, t + 0.012, vol * 0.04, 0.05)
        break
      case 'shears':
        // 理发剪：更清脆一点，带一点金属余韵，但泛音压在 3kHz 以下
        this.tone(1500 * p, t, vol * 0.05, 0.01, 'triangle')
        this.tone(190 * p, t + 0.01, vol * 0.4, 0.07, 'sine', 110 * p)
        this.noiseHit(t + 0.01, vol * 0.45, 0.05, 'bandpass', 3000 * p, 2000 * p, 1.3)
        this.tone(1320 * p, t + 0.01, vol * 0.08, 0.14, 'triangle')
        this.tone(1980 * p, t + 0.01, vol * 0.05, 0.11)
        this.tone(2640 * p, t + 0.01, vol * 0.025, 0.08)
        break
      case 'garden':
        // 园艺大剪："咔嚓"变"喀"：很沉的撞击
        this.tone(120 * p, t, vol * 0.6, 0.1, 'sine', 65 * p)
        this.noiseHit(t, vol * 0.55, 0.08, 'lowpass', 1600 * p, 700 * p, 0.8)
        this.tone(880 * p, t, vol * 0.07, 0.06, 'triangle')
        break
      case 'clipper':
        // 电推子：每剪断一缕只是一个很轻的"嗤"，主体是持续的嗡嗡声（setClipper）
        this.noiseHit(t, vol * 0.3, 0.035, 'bandpass', 2200 * p, 1600 * p, 1.2)
        break
    }
    return true
  }

  /** 缠住了："咔嗒"卡住 + 一声闷闷的"呃"（头发被扯）。 */
  jam(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + 0.004
    this.tone(95, t, 0.22, 0.07, 'square', 70)
    this.noiseHit(t, 0.25, 0.06, 'lowpass', 900, 400, 0.7)
    this.tone(210, t + 0.05, 0.1, 0.2, 'triangle', 120)
    this.rustle(3)
  }

  /** 电推子的持续嗡嗡声：on 开关；load 0..1 推过头发时的负载（声音被压低、变闷）。 */
  setClipper(on: boolean, load = 0): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    if (on && !this.clipper) {
      const o1 = ctx.createOscillator()
      o1.type = 'sawtooth'
      o1.frequency.value = 118
      const o2 = ctx.createOscillator()
      o2.type = 'square'
      o2.frequency.value = 236.5
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1400
      const g = ctx.createGain()
      g.gain.value = 0
      const g2 = ctx.createGain()
      g2.gain.value = 0.35
      o1.connect(lp)
      o2.connect(g2)
      g2.connect(lp)
      lp.connect(g)
      g.connect(this.master)
      o1.start()
      o2.start()
      this.clipper = { o1, o2, lp, g }
    }
    const c = this.clipper
    if (!c) return
    const now = ctx.currentTime
    c.g.gain.setTargetAtTime(on ? 0.07 * (1 - load * 0.45) : 0, now, 0.05)
    c.lp.frequency.setTargetAtTime(1400 - load * 700, now, 0.04)
    c.o1.frequency.setTargetAtTime(118 - load * 14, now, 0.05)
    c.o2.frequency.setTargetAtTime(236.5 - load * 28, now, 0.05)
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
    bp.frequency.value = 2200 * pitch
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

  /** 简单的衰减正弦（给各种"叮""铛"用）。 */
  private tone(f: number, t: number, vol: number, dec: number, type: OscillatorType = 'sine', slideTo = 0): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dec)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0005, t + dec)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + dec + 0.02)
  }

  /** 钢丝发剪不动："铛"（不成谐波比的金属泛音，长一点的尾巴）。限流：同一帧只响一次。 */
  clang(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + 0.003
    if (t - this.lastClang < 0.05) return
    this.lastClang = t
    const p = 1 + (Math.random() * 2 - 1) * 0.04
    this.tone(1180 * p, t, 0.12, 0.35, 'triangle')
    this.tone(2710 * p, t, 0.07, 0.25)
    this.tone(4190 * p, t, 0.04, 0.16)
    this.tone(260 * p, t, 0.1, 0.08, 'square', 120)
  }

  /** 打结发剪了一下没断："咚"（闷、短）。 */
  thud(): void {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const t = ctx.currentTime + 0.003
    if (t - this.lastThud < 0.04) return
    this.lastThud = t
    this.tone(210, t, 0.2, 0.09, 'sine', 90)
    const n = ctx.createBufferSource()
    n.buffer = this.noise
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1400
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.14, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    n.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    n.start(t, Math.random() * 0.9, 0.06)
  }

  /** 白头发：清亮的"叮"。 */
  ding(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + 0.02
    this.tone(2637, t, 0.1, 0.5)
    this.tone(3951, t + 0.005, 0.05, 0.35)
    this.tone(5274, t + 0.01, 0.025, 0.2)
  }

  /** 危险预兆：心跳（两下），danger 0..1 越大越响。 */
  heartbeat(danger: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + 0.01
    const v = 0.18 + danger * 0.25
    this.tone(70, t, v, 0.14, 'sine', 45)
    this.tone(62, t + 0.16, v * 0.7, 0.12, 'sine', 42)
  }

  /** 最后几秒的倒计时"嘀"。 */
  countdown(last: boolean): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + 0.005
    this.tone(last ? 1320 : 990, t, 0.09, last ? 0.35 : 0.1, 'square')
  }

  /** 剪到泳帽线以上：上扬琶音。 */
  fanfare(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + 0.01
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]
    notes.forEach((f, i) => {
      this.tone(f, t + i * 0.07, 0.08, 0.4, 'square')
      this.tone(f * 2, t + i * 0.07, 0.03, 0.3)
    })
  }

  /** 被头发淹没：往下滑的闷声 + 一阵沙沙。 */
  drown(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + 0.01
    this.tone(330, t, 0.16, 0.9, 'triangle', 70)
    this.tone(247, t + 0.25, 0.12, 0.9, 'triangle', 55)
    this.rustle(30)
  }

  /** 时间到：两声短"嘟"。 */
  timeUp(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + 0.01
    this.tone(784, t, 0.1, 0.18, 'square')
    this.tone(523.25, t + 0.2, 0.1, 0.4, 'square')
  }

  /** 买技能：硬币叮当 + 上扬。 */
  buy(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + 0.005
    this.tone(1568, t, 0.08, 0.12, 'square')
    this.tone(2093, t + 0.06, 0.08, 0.3, 'square')
    this.tone(3136, t + 0.06, 0.04, 0.25)
  }

  /** 钱不够：低低的"嗡"。 */
  deny(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + 0.005
    this.tone(150, t, 0.12, 0.14, 'square', 110)
  }

  /** 场景切换：一阵"唰"。 */
  whoosh(): void {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const t = ctx.currentTime + 0.005
    const n = ctx.createBufferSource()
    n.buffer = this.noise
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.2
    bp.frequency.setValueAtTime(600, t)
    bp.frequency.exponentialRampToValueAtTime(4000, t + 0.3)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.12, t + 0.12)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
    n.connect(bp)
    bp.connect(g)
    g.connect(this.master)
    n.start(t, Math.random() * 0.5, 0.45)
  }

  /** 鼠标移到可点的物件上：很轻的"嘀"。 */
  hover(): void {
    const ctx = this.ctx
    if (!ctx) return
    this.tone(2400, ctx.currentTime + 0.002, 0.025, 0.04, 'sine')
  }

  /** 按钮点击。 */
  click(): void {
    const ctx = this.ctx
    if (!ctx) return
    this.tone(1500, ctx.currentTime + 0.002, 0.06, 0.05, 'square', 900)
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
