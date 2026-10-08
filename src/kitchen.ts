import Phaser from 'phaser';
import { COUNTER_WIDTH, COUNTER_HEIGHT, COUNTER_INGREDIENTS } from './counter-layout';
import type { CounterIngredientId } from './counter-layout';
import { RECIPES } from './engine';

export interface KitchenBowlView {
  noodles: number;
  tai: number;
  chin: number;
  broth: number;
  scallion: number;
  onion: number;
  herbs: number;
  chili: number;
  lime: number;
  sauce: number;
  quay: number;
  cookState: 'empty' | 'raw' | 'cooking' | 'cooked';
  cookElapsed: number;
}

export interface KitchenView {
  activeBowl: number;
  bowls: KitchenBowlView[];
  hotBroth: number;
  potCapacity: number;
  bowlReady: boolean;
  perfectBlanchEnd: number;
  phase: string;
  paused: boolean;
  stock?: Record<CounterIngredientId, number>;
}

const C = {
  ink: 0x514331,
  cream: 0xfff5dc,
  tile: 0xeee4cb,
  grout: 0xc5b89a,
  green: 0x4e6748,
  sage: 0x98aa85,
  paleGreen: 0xdbe1bf,
  wood: 0x9d7145,
  woodLight: 0xba915e,
  woodDark: 0x715033,
  rust: 0xb56442,
  orange: 0xd79652,
  broth: 0xd0a050,
  steel: 0xb7c0be,
  steelLight: 0xe0e5df,
  blue: 0x3e6787,
  porcelain: 0xfaf9ef,
  red: 0xa94337,
  noodle: 0xffe9b5,
};
const W = COUNTER_WIDTH;
const H = COUNTER_HEIGHT;
const SERVING_Y = 136;
const BOWL_X = 320;
const STACK_X = 548;
const STACK_Y = 60;
const BASKET_X = 616;
const POT_Y = SERVING_Y + 26;
const BASKET_Y = SERVING_Y + 8;
const BASKET_REST_Y = 220.5 + BASKET_Y;
const BASKET_DIP = 19;
const FONT = '"Be Vietnam Pro", "Segoe UI", sans-serif';
const EMPTY: KitchenBowlView = {
  noodles: 0, tai: 0, chin: 0, broth: 0, scallion: 0, onion: 0,
  herbs: 0, chili: 0, lime: 0, sauce: 0, quay: 0, cookState: 'empty', cookElapsed: 0,
};
const BOWL_FIELDS = ['noodles', 'tai', 'chin', 'broth', 'scallion', 'onion', 'herbs', 'chili', 'lime', 'sauce', 'quay', 'cookState'] as const;
const DEFAULT: KitchenView = {
  activeBowl: 0,
  bowls: [{ ...EMPTY }],
  hotBroth: 4500, potCapacity: 4500, bowlReady: false, perfectBlanchEnd: 5, phase: 'preparation', paused: false,
};

function rounded(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number,
  radius: number, color: number, stroke = C.ink, line = 2) {
  g.fillStyle(color).fillRoundedRect(x, y, w, h, radius);
  if (line) g.lineStyle(line, stroke).strokeRoundedRect(x, y, w, h, radius);
}
function ellipse(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number,
  color: number, stroke = C.ink, line = 2) {
  g.fillStyle(color).fillEllipse(x, y, w, h, 64);
  if (line) g.lineStyle(line, stroke).strokeEllipse(x, y, w, h, 64);
}
function path(g: Phaser.GameObjects.Graphics, points: number[][], color = C.ink, width = 2, alpha = 1) {
  if (!points.length) return;
  g.lineStyle(width, color, alpha).beginPath().moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  g.strokePath();
}
// Sample smooth, mirrored curves once into the cached ceramic artwork.
function curve(start: number[], c1: number[], c2: number[], end: number[]) {
  return new Phaser.Curves.CubicBezier(
    new Phaser.Math.Vector2(...start), new Phaser.Math.Vector2(...c1),
    new Phaser.Math.Vector2(...c2), new Phaser.Math.Vector2(...end),
  ).getPoints(24);
}
function porcelainBowl(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, rimDepth: number, frontOnly = false, foot = true) {
  const r = width / 2;
  if (foot) ellipse(g, x, y + height + 3, width * .4, 11, C.porcelain, C.blue, 1.3);
  const outline = [
    ...curve([x-r,y], [x-r*.89,y+height*.7], [x-r*.58,y+height], [x-r*.28,y+height]),
    ...curve([x-r*.28,y+height], [x-r*.15,y+height+3], [x+r*.15,y+height+3], [x+r*.28,y+height]),
    ...curve([x+r*.28,y+height], [x+r*.58,y+height], [x+r*.89,y+height*.7], [x+r,y]),
  ];
  const frontRim = Array.from({length:33}, (_,i) => {
    const angle=i/32*Math.PI;
    return new Phaser.Geom.Point(x+Math.cos(angle)*r, y+Math.sin(angle)*rimDepth/2);
  });
  g.fillStyle(C.porcelain).fillPoints(frontOnly ? [...outline, ...frontRim] : outline, true);
  g.lineStyle(1.8, C.ink).strokePoints(outline, !frontOnly);
  const band = curve([x-r*.89,y+height*.38], [x-r*.58,y+height*.93], [x+r*.58,y+height*.93], [x+r*.89,y+height*.38]);
  path(g, band.map(p => [p.x,p.y]), C.blue, 2);
  if (frontOnly) {
    path(g, frontRim.map(p => [p.x,p.y]), C.blue, 1.8);
    return;
  }
  ellipse(g, x, y, width, rimDepth, C.porcelain, C.ink, 1.9);
  ellipse(g, x, y, width-11, rimDepth-10, C.porcelain, C.blue, 1.8);
  ellipse(g, x, y+1, width-23, rimDepth-21, 0xeaf0e3, 0xc2cec0, .8);
}
function leaf(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, scale = 1, color = C.green) {
  const points: Phaser.Geom.Point[] = [];
  const coordinates = [[0, 10], [-7, 1], [-5, -9], [0, -15], [5, -8], [7, 0]];
  for (const [px, py] of coordinates) {
    points.push(new Phaser.Geom.Point(
      x + (px * Math.cos(angle) - py * Math.sin(angle)) * scale,
      y + (px * Math.sin(angle) + py * Math.cos(angle)) * scale,
    ));
  }
  g.fillStyle(color).fillPoints(points, true);
  g.lineStyle(1, C.green).strokePoints(points, true);
  path(g, [[x + 4 * Math.sin(angle) * scale, y - 4 * Math.cos(angle) * scale],
    [x - 8 * Math.sin(angle) * scale, y + 8 * Math.cos(angle) * scale]], 0xa4b87c, 1);
}

class KitchenScene extends Phaser.Scene {
  view: KitchenView = DEFAULT;
  private action: (action: string, payload?: unknown) => void;
  private scratch!: Phaser.GameObjects.Graphics;
  private bowlTextures: Phaser.Textures.CanvasTexture[] = [];
  private bowlImages: Phaser.GameObjects.Image[] = [];
  private lastBowls: (KitchenBowlView | undefined)[] = [];
  private lastReady: boolean | undefined;
  private ingredientImages: Phaser.GameObjects.Image[] = [];
  private ingredientFull: (boolean | undefined)[] = [];
  private equipmentTexture!: Phaser.Textures.CanvasTexture;
  private equipmentCanvas!: HTMLCanvasElement;
  private potTexture!: Phaser.Textures.CanvasTexture;
  private basketTexture!: Phaser.Textures.CanvasTexture;
  private sideImage!: Phaser.GameObjects.Image;
  private sideLabel!: Phaser.GameObjects.Text;
  private basketImage!: Phaser.GameObjects.Image;
  private lastEquipment = '';
  private staticText: Phaser.GameObjects.Text[] | null = [];
  private steamSprites: Phaser.GameObjects.Image[] = [];
  private steamEnabled = [false, false, false];
  private drops: Phaser.GameObjects.Image[] = [];
  private dropCursor = 0;
  private ripples: Phaser.GameObjects.Image[] = [];
  private ladles: Phaser.GameObjects.Image[] = [];
  private streams: Phaser.GameObjects.Image[] = [];
  private serveTextures: Phaser.Textures.CanvasTexture[] = [];
  private serveImages: Phaser.GameObjects.Image[] = [];
  private sparkles: Phaser.GameObjects.Image[] = [];
  private bowlLabels: Phaser.GameObjects.Text[] = [];
  private potLabel?: Phaser.GameObjects.Text;
  private basketLabel?: Phaser.GameObjects.Text;
  private cookingLabel?: Phaser.GameObjects.Text;
  private statusLabel?: Phaser.GameObjects.Text;
  private lastStatus = '';
  private lastCooking = '';
  private ready = false;
  private anim = 0;
  private effectsRemaining = 0;
  private sleepPending = false;
  private hidden = document.hidden;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(action: (action: string, payload?: unknown) => void, private resolution: number) {
    super('pho-kitchen');
    this.action = action;
  }

  private canvasTexture(key: string, width: number, height: number) {
    const texture = this.textures.createCanvas(key, width * this.resolution, height * this.resolution)!;
    texture.source[0].resolution = this.resolution;
    return texture;
  }

  private bake(key: string | Phaser.Textures.CanvasTexture, width: number, height: number) {
    const texture = typeof key === 'string' ? this.canvasTexture(key, width, height) : key;
    const canvas = texture.getSourceImage() as HTMLCanvasElement;
    texture.getContext().clearRect(0, 0, canvas.width, canvas.height);
    this.scratch.setScale(this.resolution);
    this.scratch.generateTexture(canvas, canvas.width, canvas.height);
    this.scratch.setScale(1);
    texture.refresh();
    return texture;
  }

  private sizeImage(image: Phaser.GameObjects.Image) {
    // Keep geometry in 720 × 590 world units while CanvasRenderer samples the
    // full-resolution texture. Animation scales remain ordinary logical scales.
    const resolution = image.frame.source.resolution;
    image.setSize(image.frame.realWidth / resolution, image.frame.realHeight / resolution);
    return image.updateDisplayOrigin();
  }

  private image(x: number, y: number, key: string) {
    return this.sizeImage(this.add.image(x, y, key));
  }

  private text(x: number, y: number, value: string, size = 12, color = '#574b3c', bold = false) {
    const label = this.add.text(x, y, value, {
      fontFamily: FONT, fontSize: `${size}px`, color,
      fontStyle: bold ? 'bold' : 'normal', align: 'center',
      // CanvasRenderer reads resolution from the texture source, initialized by
      // the Text constructor. Changing only the style later scales glyphs twice.
      resolution: this.resolution,
    }).setOrigin(0.5);
    this.staticText?.push(label);
    return label;
  }

  create() {
    this.cameras.main.setBackgroundColor('#e8ece3').setZoom(this.resolution).centerOn(W / 2, H / 2);
    this.scratch = this.make.graphics({ x: 0, y: 0 }, false);
    this.drawWall(this.scratch);
    this.drawCounter(this.scratch);
    this.drawIngredientShelves(this.scratch);
    this.scratch.save().translateCanvas(0, POT_Y);
    this.drawStove(this.scratch);
    this.scratch.restore();
    this.scratch.save().translateCanvas(BASKET_X - 616, BASKET_Y);
    this.drawBasketStand(this.scratch);
    this.scratch.restore();
    this.scratch.save().translateCanvas(BOWL_X - 360, SERVING_Y);
    this.drawCounterDetails(this.scratch);
    this.scratch.restore();
    // The hundreds of decorative vector strokes and fixed labels are rasterized
    // once. Each subsequent frame only composites this one background image.
    const background = this.bake('kitchen-background', W, H);
    const context = background.getContext();
    for (const label of this.staticText!) {
      context.drawImage(label.canvas, (label.x - label.width / 2) * this.resolution, (label.y - label.height / 2) * this.resolution, label.width * this.resolution, label.height * this.resolution);
      label.destroy();
    }
    this.staticText = null;
    background.refresh();
    this.image(0, 0, 'kitchen-background').setOrigin(0);
    this.scratch.clear();
    this.buildIngredientContainers();

    this.equipmentTexture = this.canvasTexture('kitchen-equipment-work', W, 310);
    this.equipmentCanvas = this.equipmentTexture.getSourceImage() as HTMLCanvasElement;
    this.potTexture = this.canvasTexture('kitchen-pot', 132, 110);
    this.basketTexture = this.canvasTexture('kitchen-basket', 130, 125);
    this.image(40, 150 + POT_Y, 'kitchen-pot').setOrigin(0);
    this.basketImage = this.image(BASKET_X + 3, 220.5 + BASKET_Y, 'kitchen-basket');
    // Opaque aluminium stays in front of the moving basket, including tweens.
    this.scratch.clear();
    this.scratch.save().translateCanvas(-548, -212);
    this.drawBasketFront(this.scratch);
    this.scratch.restore();
    this.bake('kitchen-basket-front', 140, 96);
    this.image(BASKET_X - 68, 212 + BASKET_Y, 'kitchen-basket-front').setOrigin(0);
    for (let i = 0; i < 1; i++) {
      this.bowlTextures.push(this.canvasTexture(`kitchen-bowl-${i}`, 200, 164));
      this.bowlImages.push(this.image(BOWL_X, 300 + SERVING_Y, `kitchen-bowl-${i}`));
    }
    this.scratch.clear();
    this.drawBowlStack(this.scratch);
    this.bake('kitchen-bowl-stack', 200, 164);
    this.image(STACK_X, STACK_Y, 'kitchen-bowl-stack').setScale(.66);
    this.scratch.clear();
    ellipse(this.scratch,48,57,88,43,C.porcelain,C.blue,1.5);
    ellipse(this.scratch,48,54,76,33,0xe8ecdb,0xb8c5b1,1);
    this.drawQuay(this.scratch,47,44,65,1.39);
    this.drawQuay(this.scratch,48,63,65,1.5);
    this.bake('kitchen-quay-plate',96,88);
    this.sideImage = this.image(482,420,'kitchen-quay-plate').setVisible(false);
    this.sideLabel = this.text(482,474,'QUẨY ĂN KÈM',10,'#6d725e',true).setVisible(false);
    this.buildEffects();
    this.potLabel = this.text(103, 492, 'CHAN NƯỚC', 16, '#574b3c', true);
    this.basketLabel = this.text(BASKET_X, 492, 'TRỤNG BÁNH', 16, '#574b3c', true);
    this.cookingLabel = this.text(BASKET_X, 515, 'Chạm để bắt đầu', 12, '#6d725e');
    this.statusLabel = this.text(103, 515, '', 12, '#6d725e');

    this.bowlLabels.push(this.text(BOWL_X, 520, '', 13, '#53755b', true));
    this.text(STACK_X, 113, 'LẤY BÁT SẠCH', 11, '#496e50', true);
    this.add.zone(STACK_X, 58, 170, 116)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer: Phaser.Input.Pointer) => this.fire('take-bowl', pointer));
    this.add.zone(103, 244 + POT_Y, 159, 148)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer: Phaser.Input.Pointer) => this.fire('broth', pointer));
    this.add.zone(BASKET_X, 246 + BASKET_Y, 132, 144)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        const bowl = this.view.bowls[this.view.activeBowl] || EMPTY;
        this.fire(bowl.cookState === 'cooking' ? 'lift' : 'blanch', pointer);
      });
    this.ready = true;
    this.paint(true);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.scratch.destroy());
  }

  private fire(action: string, pointer: Phaser.Input.Pointer) {
    // Phaser can forward document mouse events after layout/scroll changes.
    // DOM controls and ingredient overlays own their events; never handle twice.
    if (this.view.paused || pointer.event.target !== this.game.canvas) return;
    this.action(action);
  }

  requestFrame() {
    if (this.ready && !this.hidden && !this.game.loop.running) {
      this.game.loop.resetDelta();
      this.game.loop.wake();
    }
  }

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    if (!this.ready) return;
    if (hidden) {
      this.tweens.pauseAll();
      this.game.loop.sleep();
    } else {
      if (!this.view.paused) this.tweens.resumeAll();
      this.requestFrame();
    }
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    if (!this.ready) return;
    if (reduced) this.resetTransientEffects();
    this.refreshSteam();
    this.requestFrame();
  }

  private resetTransientEffects() {
    this.tweens.killAll();
    this.effectsRemaining = 0;
    this.dropCursor = 0;
    for (const image of [...this.drops, ...this.ripples, ...this.ladles, ...this.streams, ...this.serveImages, ...this.sparkles]) {
      image.setVisible(false).setAlpha(1).setScale(1).setAngle(0);
    }
    this.bowlImages.forEach((image, i) => image.setPosition(BOWL_X, 300 + SERVING_Y).setScale(1).setAlpha(1).setAngle(0));
    this.basketImage.setPosition(BASKET_X + 3, this.basketY()).setScale(1).setAlpha(1).setAngle(0);
  }

  setView(view: KitchenView) {
    const previous = this.view;
    this.view = view;
    if (!this.ready) return;
    const resetEffects = previous.phase !== view.phase && (view.phase === 'summary' || view.phase === 'prep');
    // A day boundary or restart invalidates moving dishes and ingredients.
    // An ordinary pause keeps the same phase and resumes its current animation.
    if (resetEffects) this.resetTransientEffects();
    if (previous.paused !== view.paused) {
      if (view.paused) this.tweens.pauseAll();
      else if (!this.hidden) this.tweens.resumeAll();
    }
    const changed = this.paint();
    if (!view.paused && !this.hidden && !this.reducedMotion && previous.phase === view.phase) {
      this.animateChanges(previous);
    }
    if (changed || resetEffects || previous.paused !== view.paused) this.requestFrame();
  }

  private drawWall(g: Phaser.GameObjects.Graphics) {
    // Hanoi: ochre limewash, worn moss-green shutters and a red enamel sign.
    g.fillStyle(0xd9b362).fillRect(0, 0, W, 110);
    for (let i = 0; i < 380; i++) {
      const x = (i * 137.3) % W, y = (i * 47.7) % 110;
      g.fillStyle(i % 3 ? 0xf4d895 : 0x937340, .16).fillEllipse(x, y, 3 + i % 9, 1 + i % 4);
    }
    for (const x of [0, 690]) {
      rounded(g, x, -4, 30, 117, 2, 0x3e5944, 0x314533, 2);
      for (let y = 5; y < 107; y += 11) {
        path(g, [[x + 4,y],[x + 26,y - 1]], 0x7f9160, 2);
        path(g, [[x + 4,y + 5],[x + 26,y + 4]], 0x293f33, 3);
      }
      path(g, [[x + 2,28],[x + 3,67],[x + 2,80]], 0xab9c69, 1);
    }
    path(g, [[444,0],[439,12],[442,18],[436,24]], 0xa4864c, .8);
    path(g, [[76,0],[82,8],[79,16]], 0xa4864c, .8);
    rounded(g, 192, 9, 236, 93, 4, 0x7b653d, C.ink, 1);
    rounded(g, 196, 6, 228, 91, 3, 0xfff0cf, 0x4d624e, 2.3);
    rounded(g, 202, 12, 216, 79, 1, 0xfff0cf, 0xa14832, .8);
    this.text(310, 33, 'PHỞ ĐẦU NGÕ', 24, '#963c2c', true);
    this.text(310, 59, 'TÁI · CHÍN', 16, '#4f513b', true);
    this.text(310, 80, `Tái ${RECIPES.tai.price / 1000}.000đ · Chín ${RECIPES.chin.price / 1000}.000đ`, 10, '#786144', true);
    for (const x of [199, 415]) for (const y of [15, 95]) g.fillStyle(0x8c9690).fillCircle(x,y,1.3);
    // The left end of the top shelf is now the basket of fresh quẩy.
  }

  private drawCounter(g: Phaser.GameObjects.Graphics) {
    // Ivory wall tiles behind the rack, blue-green trim, then the wooden worktop.
    g.fillStyle(C.grout).fillRect(0, 110, W, 218);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 12; col++) {
      const x = col * 62, y = 112 + row * 55;
      rounded(g, x + 1, y, 59, 52, 1, (row + col) % 5 ? C.tile : 0xe5d7b9, C.grout, .7);
      path(g, [[x+3,y+2],[x+57,y+2]], 0xfff4db, 1);
    }
    g.fillStyle(0x587267).fillRect(0, 313, W, 15);
    for (let x = 4; x < W; x += 31) path(g, [[x,315],[x+12,324],[x+24,315]], 0x9baa83, 1.2);
    g.fillStyle(C.woodLight).fillRect(0, 328, W, 212);
    for (let row = 0; row < 4; row++) {
      const y = 328 + row * 53;
      g.fillStyle(row % 2 ? 0xb08857 : 0xbd945f).fillRect(0, y, W, 52);
      path(g, [[0,y],[W,y]], C.woodDark, 1.5);
      path(g, [[0,y+2],[W,y+2]], 0xe0b981, 1.1);
    }
    for (let i = 0; i < 150; i++) {
      const x = (i * 121 + 47) % W, y = 332 + (i * 59) % 200;
      path(g, [[x,y],[x+14,y-1],[x+40,y+1],[x+62,y]], i % 3 ? 0x6e4f32 : 0xf5d39a, .8, .22);
    }
    for (const [x,y] of [[209,466],[487,344],[25,511]]) {
      ellipse(g,x,y,24,6,C.wood,0x88623e,1);
      path(g,[[x-24,y],[x-10,y+5],[x+14,y+5],[x+32,y]],0x88623e,.8,.6);
    }
    // A terracotta floor and ordinary wooden stools, as in the approved reference.
    g.fillStyle(0x986049).fillRect(0, 546, W, 44);
    for (let x = 0; x < W; x += 72) {
      rounded(g,x+2,548,68,40,1,x%144 ? 0xb37453 : 0xa66a4d,0xd3a783,1);
    }
    rounded(g, -4, 533, 728, 15, 2, C.woodDark, 0x57412c, 1.7);
    path(g,[[0,536],[W,536]],0xe0b57d,1.5);
    rounded(g,245,552,232,31,3,0xffedc5,0x765738,1);
    this.text(361, 568, 'PHỞ ĐẦU NGÕ', 19, '#963c2c', true);
    path(g, [[255, 568], [270, 568]], C.red, 1.4);
    path(g, [[451, 568], [467, 568]], C.red, 1.4);
    // Just the seats and tops of legs of stools on the customer side.
    for (const x of [72, 642]) {
      rounded(g, x - 30, 581, 8, 16, 1, C.woodDark, C.ink, 1.1);
      rounded(g, x + 22, 581, 8, 16, 1, C.woodDark, C.ink, 1.1);
      rounded(g, x - 41, 570, 82, 15, 3, C.woodDark, C.ink, 1.3);
      rounded(g, x - 38, 567, 76, 12, 2, C.woodLight, C.ink, 1.2);
      for (let i = 0; i < 3; i++) path(g, [[x-33,570+i*3],[x+31,571+i*3]],0x88623e,.8);
    }
  }

  private drawIngredientShelves(g: Phaser.GameObjects.Graphics) {
    // One continuous open-front glass case with three clearly separated levels.
    const frame = 0x7d9588;
    g.fillStyle(0xf1ead5, .08).fillRect(19, 7, 687, 320);
    g.fillStyle(0xd3e6e0, .6).fillPoints([
      {x:5,y:3},{x:18,y:14},{x:18,y:326},{x:5,y:313},
    ], true);
    path(g, [[7,9],[7,307],[16,318]], 0x93afa1, 1.6);
    path(g, [[10,22],[10,73]], 0xf3faf2, 2);
    path(g, [[10,142],[10,198]], 0xf3faf2, 2);
    for (const y of [108, 215, 325]) {
      g.fillStyle(0xc2d7cc).fillPoints([
        {x:6,y:y-9},{x:697,y:y-9},{x:711,y},{x:19,y},
      ], true);
      rounded(g, 16, y-1, 695, 5, 1, 0xa9bfb1, frame, 1);
      path(g, [[20,y],[708,y]], 0xf6f8ec, 1.6);
    }
    for (const x of [14, 706]) {
      rounded(g, x, 5, 5, 323, 1, 0x9eb5a8, frame, 1.2);
      path(g, [[x+2,9],[x+2,325]], 0xf3f7ea, 1.5);
    }
    path(g, [[6,3],[698,3],[711,13]], frame, 1.3);
    path(g, [[20,7],[703,7]], 0xf3f7ea, 1.5);
    // Label on the front rail; the entire bowl stack above it is tappable.
    rounded(g, STACK_X-65, 104, 130, 17, 2, 0xfff3d7, 0xb9a27b, 1);
    // A chopstick cup beside the bowls on the same top shelf.
    for(let i=0;i<9;i++) {
      path(g,[[648+i*3.7,87],[644+i*4.4,28+i%3*4]],0x77543b,2.6);
      path(g,[[648+i*3.7,86],[644+i*4.4,29+i%3*4]],0xc99c60,1);
    }
    rounded(g, 644, 72, 42, 33, 5, C.porcelain, C.blue, 1.4);
    ellipse(g, 665, 73, 42, 9, 0xdce6d8, C.blue, 1);
    leaf(g,661,91,-.7,.43,C.blue);
    leaf(g,669,93,.7,.35,C.blue);
    path(g,[[647,100],[683,100]],C.blue,1.3);
  }

  private drawStove(g: Phaser.GameObjects.Graphics) {
    // A tall aluminium stockpot on a low cast-iron gas burner.
    ellipse(g, 103, 307, 179, 24, 0xa58e6d, C.ink, 0);
    rounded(g, 27, 284, 152, 24, 7, 0x575e56, C.ink, 1.8);
    ellipse(g, 103, 287, 151, 32, 0x434e48, C.ink, 1.6);
    for (let i = 0; i < 7; i++) {
      path(g, [[60 + i * 14, 298], [63 + i * 14, 291], [66 + i * 14, 298]], 0x77b5bf, 2.1);
    }
    rounded(g, 36, 301, 15, 9, 2, 0x434e48, C.ink, 1);
    rounded(g, 153, 301, 15, 9, 2, 0x434e48, C.ink, 1);
    path(g, [[177, 298], [185, 299], [190, 308]], 0x96734e, 4);
    // Riveted loop handles and rolled rim.
    rounded(g, 14, 219, 34, 21, 6, 0x959e9a, C.ink, 1.8);
    rounded(g, 21, 225, 21, 9, 2, C.woodLight, C.ink, 1);
    rounded(g, 158, 219, 35, 21, 6, 0x959e9a, C.ink, 1.8);
    rounded(g, 164, 225, 22, 9, 2, C.woodLight, C.ink, 1);
    rounded(g, 34, 197, 138, 93, 12, 0xb6bdb8, C.ink, 2);
    path(g, [[42, 282], [66, 287], [103, 289], [141, 286], [163, 280]], 0x9aa69f, 1.4);
    g.fillStyle(0xdce1d9).fillRect(39, 208, 16, 65);
    g.fillStyle(0xcbd2cb).fillRect(59, 211, 26, 62);
    path(g, [[158, 216], [158, 273]], 0x899893, 1.4);
    path(g, [[48, 259], [74, 261]], 0xe5e6dc, 1.1);
    path(g, [[109, 277], [144, 275]], 0x8b9993, 1);
    path(g, [[121, 250], [137, 249]], 0xdce0d5, 0.8);
    for (const x of [42, 165]) {
      g.fillStyle(0x7e8e87).fillCircle(x, 223, 2);
      g.fillStyle(0xe4e7dc).fillCircle(x - 0.5, 222.5, 0.8);
    }
    ellipse(g, 103, 199, 141, 66, 0xe2e5db, C.ink, 2);
    ellipse(g, 103, 199, 122, 50, 0x899993, 0x687b74, 1.1);
    path(g, [[45, 215], [55, 220], [79, 224]], 0xf3f1e3, 1.5);
  }

  private drawBasketStand(g: Phaser.GameObjects.Graphics) {
    ellipse(g, 616, 307, 151, 24, 0x9c8869, C.ink, 0);
    rounded(g, 558, 294, 121, 15, 4, 0x515f58, C.ink, 1.4);
    rounded(g, 555, 213, 126, 87, 11, C.steel, C.ink, 1.8);
    path(g, [[563, 289], [586, 294], [618, 296], [651, 294], [674, 289]], 0x94a59b, 1.3);
    g.fillStyle(0xe0e5dc).fillRoundedRect(562, 224, 16, 61, 4);
    path(g, [[587, 280], [649, 282]], 0x8f9f98, 1.3);
    ellipse(g, 617, 215, 129, 55, 0xe1e6df, C.ink, 1.7);
    ellipse(g, 617, 215, 110, 40, 0x81998d, 0x748a81, 1.2);
    for (const x of [562, 674]) g.fillStyle(0x778c81).fillCircle(x, 241, 1.8);
  }

  private drawBasketFront(g: Phaser.GameObjects.Graphics) {
    // The near half of the opening curves down toward the viewer. Everything
    // below that lip is opaque; only mesh inside/above the opening can be seen.
    const lip = Array.from({ length: 49 }, (_, i) => {
      const a = Math.PI - i / 48 * Math.PI;
      return new Phaser.Geom.Point(617 + Math.cos(a) * 64.5, 215 + Math.sin(a) * 27.5);
    });
    const front = [...lip,
      ...curve([681.5,215],[681,270],[682,295],[670,299]),
      ...curve([670,299],[646,303],[578,303],[566,299]),
      ...curve([566,299],[553,295],[555,270],[552.5,215]),
    ];
    g.fillStyle(C.steel).fillPoints(front,true);
    g.lineStyle(1.8,C.ink).strokePoints(front,true);
    g.fillStyle(0xe0e5dc).fillRoundedRect(562,244,16,41,4);
    g.fillStyle(0xcbd2cb).fillRoundedRect(583,250,20,37,3);
    path(g,[[671,242],[672,280]],0x87958e,1.5);
    path(g,[[563,289],[586,294],[618,296],[651,294],[674,289]],0x94a59b,1.3);
    path(g,[[587,280],[649,282]],0x8f9f98,1.3);
    // Rolled aluminium lip occludes the basket immediately at the water edge.
    const inner = Array.from({ length: 49 }, (_, i) => {
      const a = i / 48 * Math.PI;
      return new Phaser.Geom.Point(617 + Math.cos(a) * 55, 215 + Math.sin(a) * 20);
    });
    g.fillStyle(0xe1e6df).fillPoints([...lip,...inner],true);
    path(g,inner.map(p=>[p.x,p.y]),0x748a81,1.2);
    path(g,lip.map(p=>[p.x,p.y]),0xf5f0df,1.4);
    for (const x of [562,674]) g.fillStyle(0x778c81).fillCircle(x,246,1.8);
  }

  private drawCounterDetails(g: Phaser.GameObjects.Graphics) {
    // Enamel action plaques remain legible on the darker timber.
    for (const x of [103, BASKET_X]) rounded(g,x-(BOWL_X-360)-83,341,166,47,4,0xffedc9,0x8a6841,1);
    rounded(g,288,374,144,20,3,0xffedc9,0x8a6841,.8);
    // One bowl has its own clear serving tray in the middle of the counter.
    rounded(g, 248, 199, 224, 178, 12, 0xa6b5ae, 0x7a8d83, 1.6);
    rounded(g, 254, 205, 212, 165, 9, 0xd4dcd2, 0xeaf0e4, 1.5);
    path(g, [[261, 364], [459, 364]], 0x98ada1, 1);
    // Cutlery rests along the rear edge, clear of the bowl's rim.
    for (const y of [210, 217]) {
      path(g, [[266,y], [330,y+7]], 0x654d37, 3.6);
      path(g, [[266,y], [330,y+7]], 0xb47a48, 1.8);
    }
    path(g, [[387,212], [430,219]], 0x839991, 4);
    path(g, [[387,211], [430,218]], 0xf1f3e9, 2.4);
    ellipse(g, 438, 220, 22, 11, C.porcelain, C.blue, 1.1);
  }

  private buildIngredientContainers() {
    for (const ingredient of COUNTER_INGREDIENTS) {
      for (const full of [false, true]) {
        this.scratch.clear();
        this.drawIngredientContainer(this.scratch, ingredient.id, full);
        this.bake(`counter-${ingredient.id}-${full ? 'full' : 'empty'}`, ingredient.width, ingredient.height);
      }
      this.ingredientImages.push(this.image(ingredient.x, ingredient.y, `counter-${ingredient.id}-empty`).setOrigin(0));
    }
    this.scratch.clear();
  }

  private drawQuay(g: Phaser.GameObjects.Graphics, x: number, y: number, length: number, angle = 0) {
    g.save().translateCanvas(x,y).rotateCanvas(angle);
    // Two joined golden lobes and an irregular fried crust distinguish quẩy.
    for (const offset of [-6, 5]) {
      rounded(g,offset-6,-length/2,13,length,6,0xdda24b,0x956232,1.3);
      path(g,[[offset-2,-length/2+7],[offset-3,0],[offset-2,length/2-7]],0xf7d37f,2.1);
      for(let i=0;i<7;i++) {
        const px=offset+(i%3-1)*2.5, py=-length/2+7+i*(length-14)/6;
        ellipse(g,px,py,3+(i%2),2,0xb67a36,C.ink,0);
      }
    }
    path(g,[[0,-length/2+5],[0,length/2-5]],0xb77831,1);
    g.restore();
  }

  private drawIngredientContainer(g: Phaser.GameObjects.Graphics, id: CounterIngredientId, full: boolean) {
    if (id === 'quay') {
      ellipse(g,73,75,141,15,0xbca17a,C.ink,0);
      rounded(g,5,40,136,31,12,0xbc915a,C.ink,1.6);
      for(let x=12;x<139;x+=8)path(g,[[x,47],[x+4,66]],0xe5c28b,1.6);
      ellipse(g,73,42,137,46,0xc9a06a,C.ink,1.7);
      ellipse(g,73,40,124,34,0x9e7a47,0x84633e,1);
      if(full) {
        this.drawQuay(g,35,34,54,-.55);
        this.drawQuay(g,74,31,59,-.1);
        this.drawQuay(g,111,33,56,.5);
        this.drawQuay(g,72,53,58,1.5);
      }
      path(g,[[8,48],[22,57],[57,63],[102,61],[136,50]],0xf0d4a0,2.5);
      return;
    }
    if (id === 'noodle') {
      // A broad woven bamboo basket: shallow lip, visible wicker, loose rice noodles.
      ellipse(g, 107, 77, 208, 18, 0xbfa075, C.ink, 0);
      rounded(g, 7, 24, 198, 51, 21, 0xbf9760, C.ink, 1.7);
      for (let x = 15; x < 202; x += 9) {
        path(g, [[x, 34], [x + 7, 67]], 0xe0bb7d, 2.3);
        path(g, [[x, 68], [x + 5, 36]], 0x9e7649, 1.1);
      }
      for (let y = 44; y <= 66; y += 8) path(g, [[12, y], [201, y]], 0xe3c18b, 2);
      ellipse(g, 106, 34, 199, 60, 0xd9b57c, C.ink, 1.9);
      ellipse(g, 106, 33, 182, 45, 0x977849, 0x806642, 1.1);
      ellipse(g, 106, 33, 173, 38, 0xc5b38c, C.ink, 0);
      for (let x = 34; x <= 175; x += 15) path(g, [[x, 22], [x + 12, 46]], 0xa5956e, 1);
      if (full) {
        ellipse(g, 105, 32, 165, 34, 0xe6d6ab, C.ink, 0);
        for (let n = 0; n < 17; n++) {
          const points: number[][] = [];
          const start = 25 + Math.sin(n * 1.8) * 5;
          const span = 151 - Math.abs(n - 8) * 3;
          for (let p = 0; p <= 30; p++) {
            points.push([start + p * span / 30, 20 + (n % 8) * 3.8 + Math.sin(p * 0.42 + n) * 3.2]);
          }
          path(g, points, 0xbbaa79, 3.3);
          path(g, points, 0xffedc5, 2.2);
        }
      }
      path(g, [[16, 58], [37, 66], [81, 72], [137, 72], [183, 64], [198, 56]], 0xedd19b, 2.7);
      return;
    }

    if (id === 'tai' || id === 'chin') {
      // Stainless prep pans rest directly on the wooden counter.
      ellipse(g, 108, 77, 205, 17, 0xbda17a, C.ink, 0);
      rounded(g, 6, 17, 201, 59, 16, 0x899b8f, C.ink, 1.8);
      rounded(g, 4, 8, 203, 63, 15, 0xd4ddd0, C.ink, 1.9);
      rounded(g, 12, 15, 187, 48, 10, 0xa0b1a4, 0x748d7c, 1.3);
      rounded(g, 18, 20, 175, 38, 8, 0xb6c3b1, 0xc9d4c2, 1);
      path(g, [[20, 20], [92, 20]], 0xf0f1de, 1.7);
      path(g, [[37, 64], [176, 64]], 0xf0f1de, 2.1);
      if (full) {
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 7; col++) {
            const x = 32 + col * 24 + (row % 2) * 3;
            const y = 26 + row * 12 + Math.sin(col * 1.7) * 1.3;
            ellipse(g, x, y, 31, 16, id === 'tai' ? 0xc98475 : 0xaa8765, id === 'tai' ? 0xa96d61 : 0x856b52, 1.1);
            path(g, [[x - 10, y - 1], [x - 4, y + 2], [x + 3, y - 2], [x + 10, y + 2]], id === 'tai' ? 0xf4bea3 : 0xd4b68a, 1.8);
            path(g, [[x - 8, y + 4], [x + 6, y + 5]], id === 'tai' ? 0xe9b099 : 0xc7a882, 1.1);
          }
        }
      } else {
        path(g, [[30, 29], [113, 29]], 0xd8dfd0, 1.2);
        path(g, [[89, 46], [178, 46]], 0xd8dfd0, 1.2);
      }
      // Small serving tongs rest on the left rim, recognizable even when empty.
      path(g, [[15, 16], [32, 44], [40, 49]], C.ink, 4.4);
      path(g, [[15, 16], [32, 44], [40, 49]], C.steelLight, 2.7);
      path(g, [[15, 16], [24, 47], [31, 54]], C.ink, 4.4);
      path(g, [[15, 16], [24, 47], [31, 54]], C.steelLight, 2.7);
      return;
    }

    if (id === 'sauce') {
      // Familiar squeeze bottle, with a cream wrap and translucent empty glass.
      ellipse(g, 48, 77, 62, 12, 0xbda17a, C.ink, 0);
      rounded(g, 26, 20, 45, 56, 11, full ? 0xac5940 : 0xd6c6a4, C.ink, 1.8);
      rounded(g, 35, 12, 27, 15, 5, 0xe4c28c, C.ink, 1.4);
      rounded(g, 41, 5, 15, 13, 3, 0xbe7650, C.ink, 1.2);
      path(g, [[48, 5], [50, 1]], C.ink, 3.4);
      if (full) {
        rounded(g, 31, 29, 8, 18, 4, 0xd38a68, C.ink, 0);
        path(g, [[35, 67], [62, 67]], 0x854531, 1.4);
      } else {
        rounded(g, 31, 61, 35, 10, 3, 0xbc8862, C.ink, 0);
        path(g, [[34, 31], [34, 49]], 0xeee1bd, 3);
      }
      rounded(g, 29, 44, 39, 19, 2, 0xf2dfb5, 0x9c7651, 1);
      ellipse(g, 49, 53, 17, 11, 0xc2774b, C.ink, 0);
      path(g, [[47, 49], [51, 46]], C.green, 1.6);
      return;
    }

    if (id === 'chili') {
      // The jar is the actual chili control: it empties with the stock count.
      ellipse(g, 49, 77, 66, 12, 0xbda17a, C.ink, 0);
      rounded(g, 21, 23, 57, 53, 9, 0xdadbc4, 0x72877b, 1.5);
      ellipse(g, 49, 67, 54, 16, full ? 0xa54430 : 0xc4ceb7, 0x91a48f, 1);
      if (full) {
        rounded(g, 25, 37, 49, 30, 5, 0xbf5538, C.ink, 0);
        ellipse(g, 49, 37, 49, 19, 0xd07045, 0xa14a32, 1);
        for (let i = 0; i < 23; i++) {
          const x = 31 + i * 13 % 36, y = 34 + i * 11 % 31;
          ellipse(g, x, y, 5, 2, i % 3 ? 0xf4c57d : 0x983b2d, C.ink, 0);
        }
      }
      ellipse(g, 49, 23, 59, 19, 0xe2e6d0, 0x718675, 1.6);
      ellipse(g, 49, 23, 49, 12, full ? 0xc35c3c : 0xc4d0ba, 0xa5b7a1, 1);
      path(g, [[29, 35], [29, 58]], 0xf9f7e7, 3, 0.8);
      path(g, [[68, 42], [68, 62]], 0xf9f7e7, 1.5, 0.65);
      // A teaspoon resting against the rim.
      path(g, [[52, 29], [77, 5]], 0x697c71, 4.4);
      path(g, [[52, 29], [77, 5]], C.steelLight, 2.4);
      ellipse(g, 50, 31, 15, 8, C.steelLight, 0x697c71, 1);
      return;
    }

    // White enamel bowls with blue rims, used for the fresh garnishes.
    ellipse(g, 48, 77, 84, 12, 0xbda17a, C.ink, 0);
    ellipse(g, 48, 72, 41, 13, 0xe3e7db, C.ink, 1.2);
    ellipse(g, 48, 52, 79, 45, C.porcelain, C.ink, 1.6);
    path(g, [[19, 58], [32, 66], [49, 69], [65, 65], [77, 57]], C.blue, 1.8);
    leaf(g, 47, 63, -0.5, 0.3, C.blue);
    leaf(g, 52, 62, 0.7, 0.3, 0x729caf);
    ellipse(g, 48, 34, 86, 47, C.porcelain, C.ink, 1.7);
    ellipse(g, 48, 34, 77, 39, 0xf1f3e7, C.blue, 2);
    ellipse(g, 48, 35, 66, 28, full ? (id === 'scallion' || id === 'herbs' ? 0x869e61 : 0xd7d1a6) : 0xe0e5d7, 0xbac9b7, 1);
    if (!full) {
      path(g, [[31, 38], [40, 41], [57, 41]], 0xece8c9, 1.7);
      return;
    }
    if (id === 'scallion') {
      for (let n = 0; n < 27; n++) {
        const a = n * 2.399;
        const r = 5 + n * 7 % 25;
        ellipse(g, 48 + Math.sin(a) * r, 34 + Math.cos(a) * r * 0.46, 6.5, 4.2, n % 3 ? 0xafc378 : 0xe1e3ad, 0x4f7a48, 1.1);
      }
    } else if (id === 'onion') {
      for (let n = 0; n < 10; n++) {
        const x = 30 + n % 4 * 12;
        const y = 26 + Math.floor(n / 4) * 8;
        g.lineStyle(3, 0xbfc69e).strokeEllipse(x, y, 28, 14);
        g.lineStyle(2.1, 0xfff5da).strokeEllipse(x, y, 27, 13);
      }
    } else if (id === 'herbs') {
      for (let n = 0; n < 9; n++) {
        const x = 24 + n % 4 * 15;
        const y = 28 + Math.floor(n / 4) * 10;
        leaf(g, x, y, Math.sin(n * 1.9) * 0.9, 0.65 + n % 2 * 0.1, n % 2 ? 0x759653 : C.green);
      }
    } else if (id === 'lime') {
      for (let n = 0; n < 5; n++) {
        const x = 29 + n % 3 * 19;
        const y = 27 + Math.floor(n / 3) * 15;
        ellipse(g, x, y, 29, 20, 0x8eac58, 0x5f843d, 1.3);
        ellipse(g, x, y, 22, 14, 0xe0df99, 0xb9cd7b, 1.2);
        for (let k = 0; k < 3; k++) path(g, [[x, y], [x - 7 + k * 7, y - 5]], 0xf9f0bf, 1);
        path(g, [[x, y], [x + 6, y + 5]], 0xf9f0bf, 1);
      }
    }
  }

  private drawBowl(g: Phaser.GameObjects.Graphics, x: number, bowl: KitchenBowlView, y = 278) {
    g.fillStyle(0x7f7658, .17).fillEllipse(x, y+82, 128, 18, 64);
    porcelainBowl(g, x, y, 166, 73, 88);

    if (bowl.broth > 0) {
      ellipse(g, x, y + 2, 140, 73, C.broth, 0xac8849, 1.1);
      ellipse(g, x, y - 4, 125, 53, 0xdcb76c, C.ink, 0);
      for (let p = 0; p < 12; p++) {
        const a = p * 2.39;
        const r = 15 + ((p * 13) % 40);
        g.fillStyle(0xf4d28a, 0.65).fillCircle(x + Math.sin(a) * r, y + Math.cos(a) * r * 0.44, 1.6 + (p % 3) * 0.6);
      }
    }

    if (bowl.noodles > 0 && bowl.cookState !== 'cooking') {
      const count = bowl.noodles > 50 ? 16 : 10;
      for (let n = 0; n < count; n++) {
        const points: number[][] = [];
        const ny = y - 15 + (n % 7) * 5.5;
        const shift = Math.sin(n * 2.4) * 10;
        for (let s = 0; s <= 24; s++) {
          const nx = -39 + s * 3.2;
          points.push([x + nx + shift, ny + Math.sin(s * 0.45 + n) * 5 + Math.sin(s * 0.16) * 3]);
        }
        path(g, points, 0xbca96c, 3.9);
        path(g, points, C.noodle, 2.7);
      }
    }

    // Alternating placements keep added portions visibly legible.
    const drawMeat = (amount: number, cooked: boolean, offset: number) => {
      if (amount <= 0) return;
      const slices = Math.max(2, Math.min(6, Math.ceil(amount / 12.5)));
      for (let n = 0; n < slices; n++) {
        const mx = x - 40 + offset + n * 12;
        const my = y - 6 + Math.sin(n * 0.7) * 6 + (cooked ? 11 : -9);
        ellipse(g, mx, my, 35, 18, cooked ? 0xb99873 : 0xcf8e7e, cooked ? 0x897052 : 0xa5695c, 1.1);
        path(g, [[mx - 10, my - 2], [mx - 4, my + 2], [mx + 2, my - 2], [mx + 9, my + 2]], cooked ? 0xd1b48b : 0xf6c4a5, 1.8);
        path(g, [[mx - 10, my + 4], [mx + 5, my + 6]], cooked ? 0xceb187 : 0xf1bea5, 1);
      }
    };
    drawMeat(bowl.tai, false, 5);
    drawMeat(bowl.chin, true, 14);

    if (bowl.onion) {
      for (let n = 0; n < 4; n++) {
        g.lineStyle(2.4, 0xfff5d6, 0.95).strokeEllipse(x - 22 + n * 16, y - 14 + (n % 2) * 7, 29, 13);
      }
    }
    if (bowl.herbs) {
      leaf(g, x + 37, y + 5, 0.6, 0.8, C.green);
      leaf(g, x + 43, y - 9, -0.25, 0.63, 0x6f9155);
      leaf(g, x + 27, y + 11, -0.75, 0.7, 0x7d9956);
    }
    if (bowl.scallion) {
      for (let n = 0; n < 15; n++) {
        const a = n * 2.39;
        const r = 8 + (n * 7) % 43;
        const sx = x + Math.sin(a) * r;
        const sy = y + Math.cos(a) * r * 0.47;
        ellipse(g, sx, sy, 4.5, 3.5, 0x8faa5e, C.green, 1.1);
      }
    }
    if (bowl.chili) for (let n = 0; n < 4; n++) {
      ellipse(g, x - 28 + n * 13, y + 15 - (n % 2) * 7, 10, 5, 0xc95139, 0xa04434, 1);
      g.fillStyle(0xffd68b).fillCircle(x - 28 + n * 13, y + 15 - (n % 2) * 7, 1);
    }
    if (bowl.lime) {
      ellipse(g, x + 38, y - 20, 28, 18, 0xa1b86b, C.green, 1.3);
      ellipse(g, x + 38, y - 20, 21, 12, 0xe3e4a1, 0xbdce83, 1.1);
      for (let n = 0; n < 3; n++) path(g, [[x + 38, y - 20], [x + 30 + n * 8, y - 25]], 0xf6f0bd, 1);
    }
    if (bowl.sauce) {
      const sauce: number[][] = [];
      for (let n = 0; n < 20; n++) sauce.push([x - 22 + n * 2.2, y + 14 + Math.sin(n * 0.7) * 4]);
      path(g, sauce, 0x874733, 3.5);
    }

  }

  private drawBowlStack(g: Phaser.GameObjects.Graphics) {
    // Match the work bowl's 166:73:88 width, depth and elliptical rim exactly.
    // Draw nested front walls last so lower rims cover the bowl behind them.
    ellipse(g, 100, 148, 145, 14, 0x8b8f78, C.ink, 0);
    porcelainBowl(g, 100, 44, 166, 73, 88, false, false);
    porcelainBowl(g, 100, 55, 166, 73, 88, true, false);
    porcelainBowl(g, 100, 66, 166, 73, 88, true, true);
  }

  private paint(force = false): boolean {
    let changed = false;
    const sideVisible = this.view.bowlReady && !!this.view.bowls[0]?.quay;
    if (this.sideImage.visible !== sideVisible || force) { this.sideImage.setVisible(sideVisible); this.sideLabel.setVisible(sideVisible); changed = true; }
    for (let i = 0; i < COUNTER_INGREDIENTS.length; i++) {
      const ingredient = COUNTER_INGREDIENTS[i];
      const full = (this.view.stock?.[ingredient.id] ?? 0) > 0;
      if (force || this.ingredientFull[i] !== full) {
        this.ingredientFull[i] = full;
        this.sizeImage(this.ingredientImages[i].setTexture(`counter-${ingredient.id}-${full ? 'full' : 'empty'}`));
        changed = true;
      }
    }
    const selectionChanged = this.lastReady !== this.view.bowlReady;
    for (let i = 0; i < 1; i++) {
      const bowl = this.view.bowls[i] || EMPTY;
      const previous = this.lastBowls[i];
      if (force || selectionChanged || !previous || BOWL_FIELDS.some(field => previous[field] !== bowl[field])) {
        const texture = this.bowlTextures[i];
        this.scratch.clear();
        if (this.view.bowlReady) this.drawBowl(this.scratch, 100, bowl, 60);
        this.bowlImages[i].setVisible(this.view.bowlReady);
        this.bake(texture, 200, 164);
        this.lastBowls[i] = { ...bowl };
        changed = true;
      }
      if (force || selectionChanged) {
        this.bowlLabels[i].setText(this.view.bowlReady ? 'BÁT ĐANG LÀM' : 'CHỖ RÁP MÓN');
        this.bowlLabels[i].setColor(i === this.view.activeBowl ? '#496e50' : '#947b59');
      }
    }
    this.lastReady = this.view.bowlReady;
    const active = this.view.bowls[this.view.activeBowl] || EMPTY;
    // Broth quantity and timer ticks don't alter these painted surfaces.
    const equipment = `${this.view.hotBroth > 0}:${this.view.perfectBlanchEnd}:${active.cookState}:${active.noodles > 0}`;
    if (force || this.lastEquipment !== equipment) {
      this.lastEquipment = equipment;
      this.scratch.clear();
      this.drawEquipment(this.scratch);
      this.bake(this.equipmentTexture, W, 310);
      const pot = this.potTexture.getContext();
      const r = this.resolution;
      pot.clearRect(0, 0, 132*r, 110*r);
      pot.drawImage(this.equipmentCanvas, 40*r, 150*r, 132*r, 110*r, 0, 0, 132*r, 110*r);
      this.potTexture.refresh();
      const basket = this.basketTexture.getContext();
      basket.clearRect(0, 0, 130*r, 125*r);
      basket.drawImage(this.equipmentCanvas, 554*r, 158*r, 130*r, 125*r, 0, 0, 130*r, 125*r);
      this.basketTexture.refresh();
      if (force || !this.tweens.isTweening(this.basketImage)) this.basketImage.setY(this.basketY());
      changed = true;
    }
    const dryDuringService = !this.view.hotBroth && ['open','closing'].includes(this.view.phase);
    const status = `${this.view.hotBroth}/${this.view.potCapacity}/${dryDuringService}`;
    if (force || this.lastStatus !== status) {
      this.lastStatus = status;
      const liters = (value: number) => (value / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
      this.statusLabel?.setText(`${liters(this.view.hotBroth)} / ${liters(this.view.potCapacity)} lít`);
      this.potLabel?.setText(dryDuringService ? 'NẤU NƯỚC' : 'CHAN NƯỚC').setAlpha(this.view.hotBroth > 0 || dryDuringService ? 1 : 0.45);
      changed = true;
    }
    const elapsed = active.cookElapsed;
    const isCooking = active.cookState === 'cooking';
    const state = elapsed < 3 ? 'Chưa tới' : elapsed <= this.view.perfectBlanchEnd ? 'Vừa ngon' : 'Quá lâu';
    const cooking = isCooking ? `${elapsed.toFixed(1)}s · ${state}` : active.cookState === 'cooked' ? 'Bánh đã trụng' : 'Chạm để bắt đầu';
    if (force || this.lastCooking !== cooking) {
      this.lastCooking = cooking;
      this.basketLabel?.setText(isCooking ? 'NHẤC GIỎ' : 'TRỤNG BÁNH');
      this.cookingLabel?.setText(cooking).setColor(isCooking ? elapsed >= 3 && elapsed <= this.view.perfectBlanchEnd ? '#496e50' : '#a55b3f' : '#6d725e');
      changed = true;
    }
    this.refreshSteam();
    return changed;
  }

  private drawEquipment(g: Phaser.GameObjects.Graphics) {
    const active = this.view.bowls[this.view.activeBowl] || EMPTY;
    const hasBroth = this.view.hotBroth > 0;
    ellipse(g, 103, 199, 116, 46, hasBroth ? 0xc29b57 : 0x879a89, C.ink, 0);
    if (hasBroth) {
      ellipse(g, 103, 196, 104, 33, 0xd6b46c, C.ink, 0);
      for (let i = 0; i < 10; i++) {
        g.fillStyle(0xf5d88f, 0.8).fillCircle(65 + ((i * 17) % 74), 190 + ((i * 7) % 17), 1.5 + i % 2);
      }
      leaf(g, 121, 199, 1.6, 0.35, 0x7e874c);
      path(g, [[79, 191], [84, 198], [87, 192]], 0xb77e40, 2);
    }
    // Ladle parked against the back of the pot.
    path(g, [[132, 202], [167, 173]], C.ink, 5);
    path(g, [[132, 202], [167, 173]], C.steelLight, 2.8);
    ellipse(g, 167, 174, 5, 7, 0xa8b7af, C.ink, 1);
    ellipse(g, 133, 201, 24, 12, C.steelLight, C.ink, 1.1);
    ellipse(g, 132, 202, 16, 7, hasBroth ? 0xcda45e : C.steel, C.ink, 0);

    // Handle and basket share a fixed texture and move together behind the lip.
    path(g, [[637, 203], [679, 194]], C.ink, 8);
    path(g, [[637, 203], [679, 194]], C.steelLight, 4);
    path(g, [[657, 199], [679, 194]], C.ink, 9);
    path(g, [[657, 199], [679, 194]], 0xba9063, 6);
    path(g, [[661, 197], [673, 195]], 0xf0d7ab, 1.6);
    // Wire noodle strainer, shown raised until the player starts blanching.
    const isCooking = active.cookState === 'cooking';
    const by = 204;
    rounded(g, 582, by - 10, 69, 49, 16, 0xbbc4a7, C.ink, 1.4);
    ellipse(g, 617, by + 18, 67, 30, 0xb3b898, C.ink, 1.1);
    for (let x = 587; x < 649; x += 7) path(g, [[x, by - 6], [x + 3, by + 27]], 0x819482, 1);
    for (let y = by - 1; y < by + 29; y += 7) path(g, [[586, y], [648, y]], 0x819482, 1);
    ellipse(g, 617, by - 8, 77, 36, C.steelLight, C.ink, 1.6);
    ellipse(g, 617, by - 8, 64, 26, 0x96a88b, C.ink, 1.1);
    if (active.noodles > 0 && (isCooking || active.cookState === 'raw')) {
      for (let n = 0; n < 10; n++) {
        const p: number[][] = [];
        for (let i = 0; i <= 16; i++) p.push([595 + i * 2.7, by - 14 + (n % 4) * 4 + Math.sin(i * 0.6 + n) * 3]);
        path(g, p, 0xb5a66a, 3);
        path(g, p, C.noodle, 1.8);
      }
    }
    if (this.view.perfectBlanchEnd > 5) {
      // Insulated handle marks the purchased strainer upgrade.
      path(g, [[657, 199], [679, 194]], C.green, 6);
      path(g, [[663, 195], [664, 201]], C.cream, 1.4);
      path(g, [[672, 193], [673, 199]], C.cream, 1.4);
    }
  }

  private buildEffects() {
    const makeTexture = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      this.scratch.clear();
      draw(this.scratch);
      this.bake(key, w, h);
    };
    makeTexture('kitchen-steam', 24, 46, g => {
      const points: number[][] = [];
      for (let p = 0; p <= 20; p++) points.push([12 + Math.sin(p * 0.32) * 5, 44 - p * 2]);
      path(g, points, 0xfffbe9, 3.2, 0.9);
    });
    for (let i = 0; i < 9; i++) {
      const source = Math.floor(i / 3);
      const x = source === 0 ? 101 : source === 1 ? BASKET_X - 1 : BOWL_X;
      const y = source === 0 ? 169 + POT_Y : source === 1 ? 183 + BASKET_Y : 239 + SERVING_Y;
      this.steamSprites.push(this.image(x + (i % 3 - 1) * 14, y, 'kitchen-steam').setAlpha(0.3).setVisible(false));
    }
    makeTexture('kitchen-ripple', 100, 44, g => {
      g.lineStyle(2, 0xffedac, 0.95).strokeEllipse(50, 22, 94, 38);
      g.lineStyle(1, 0xfff6d4, 0.55).strokeEllipse(50, 22, 74, 27);
    });
    makeTexture('kitchen-ladle', 64, 76, g => {
      path(g, [[48, 6], [28, 52]], C.ink, 7);
      path(g, [[48, 6], [28, 52]], C.steelLight, 4);
      ellipse(g, 25, 56, 37, 20, C.steelLight, C.ink, 1.5);
      ellipse(g, 25, 55, 28, 12, C.broth, 0xa3834d, 1);
    });
    makeTexture('kitchen-pour', 12, 60, g => {
      path(g, [[4, 2], [6, 21], [5, 43], [8, 57]], 0xd4aa58, 7, 0.85);
      path(g, [[4, 2], [6, 21], [5, 43], [8, 57]], 0xffe6a1, 2, 0.95);
    });
    makeTexture('kitchen-sparkle', 16, 16, g => {
      g.fillStyle(0xe8b453).fillPoints([
        new Phaser.Geom.Point(8, 0), new Phaser.Geom.Point(10, 6), new Phaser.Geom.Point(16, 8),
        new Phaser.Geom.Point(10, 10), new Phaser.Geom.Point(8, 16), new Phaser.Geom.Point(6, 10),
        new Phaser.Geom.Point(0, 8), new Phaser.Geom.Point(6, 6),
      ], true);
    });
    for (const id of BOWL_FIELDS) {
      if (id === 'broth' || id === 'cookState') continue;
      makeTexture(`kitchen-drop-${id}`, 54, 48, g => {
        if (id === 'noodles') {
          for (let n = 0; n < 6; n++) {
            const points: number[][] = [];
            for (let p = 0; p <= 16; p++) points.push([5 + p * 2.6, 13 + n * 4 + Math.sin(p * 0.6 + n) * 3]);
            path(g, points, 0xb9a86f, 3.6);
            path(g, points, C.noodle, 2.5);
          }
        } else if (id === 'quay') {
          this.drawQuay(g,27,24,37,.45);
        } else if (id === 'tai' || id === 'chin') {
          ellipse(g, 27, 24, 38, 21, id === 'tai' ? 0xcf8e7e : 0xb99873, 0x947056, 1.3);
          path(g, [[14, 22], [20, 26], [28, 22], [38, 26]], id === 'tai' ? 0xf6c4a5 : 0xd1b48b, 2);
        } else if (id === 'herbs') {
          leaf(g, 25, 28, -0.5, 0.9, C.green);
          leaf(g, 34, 25, 0.5, 0.85, C.sage);
        } else if (id === 'onion') {
          g.lineStyle(2.6, 0xfff5d6).strokeEllipse(23, 23, 30, 17).strokeEllipse(31, 30, 28, 13);
        } else if (id === 'scallion') {
          for (let n = 0; n < 7; n++) ellipse(g, 15 + n % 3 * 10, 14 + Math.floor(n / 3) * 9, 5, 4, 0x9fb966, C.green, 1.1);
        } else if (id === 'chili') {
          for (let n = 0; n < 3; n++) ellipse(g, 16 + n * 10, 21 + n % 2 * 7, 12, 7, 0xc95139, 0xa04434, 1);
        } else if (id === 'lime') {
          ellipse(g, 27, 24, 30, 21, 0xa1b86b, C.green, 1.3);
          ellipse(g, 27, 24, 22, 13, 0xe3e4a1, 0xbdce83, 1.1);
        } else {
          path(g, [[17, 18], [22, 27], [31, 22], [38, 29]], 0x874733, 4);
        }
      });
    }
    for (let i = 0; i < 6; i++) {
      this.drops.push(this.image(0, 0, 'kitchen-drop-noodles').setVisible(false));
      this.sparkles.push(this.image(0, 0, 'kitchen-sparkle').setVisible(false));
    }
    for (let i = 0; i < 1; i++) {
      this.ripples.push(this.image(0, 0, 'kitchen-ripple').setVisible(false));
      this.streams.push(this.image(0, 0, 'kitchen-pour').setOrigin(0.5, 0).setVisible(false));
      this.ladles.push(this.image(0, 0, 'kitchen-ladle').setVisible(false));
      this.serveTextures.push(this.canvasTexture(`kitchen-served-${i}`, 200, 164));
      this.serveImages.push(this.image(0, 0, `kitchen-served-${i}`).setVisible(false));
    }
  }

  private refreshSteam() {
    this.steamEnabled[0] = this.view.hotBroth > 0;
    this.steamEnabled[1] = (this.view.bowls[this.view.activeBowl] || EMPTY).cookState === 'cooking';
    this.steamEnabled[2] = (this.view.bowls[0]?.broth || 0) > 0;
    for (let i = 0; i < 9; i++) this.steamSprites[i].setVisible(this.steamEnabled[Math.floor(i / 3)] && !this.reducedMotion);
  }

  private animateChanges(previous: KitchenView) {
    if (!previous.bowlReady && this.view.bowlReady) {
      const image = this.bowlImages[0];
      this.tweens.killTweensOf(image);
      image.setPosition(STACK_X, STACK_Y - 10.6).setScale(.66).setAlpha(1);
      this.tweens.add({ targets: image, x: BOWL_X, y: 300 + SERVING_Y, scaleX: 1, scaleY: 1, duration: 340, ease: 'Sine.Out' });
      this.markAnimation(600);
    }
    if (!this.view.bowlReady) {
      // Discarding clears all flying ingredients; serving uses its own snapshot.
      for (const image of [...this.drops, ...this.ladles, ...this.streams, ...this.ripples]) {
        this.tweens.killTweensOf(image); image.setVisible(false);
      }
      this.tweens.killTweensOf(this.bowlImages[0]);
      this.bowlImages[0].setPosition(BOWL_X, 300 + SERVING_Y).setScale(1);
    }

    for (let i = 0; i < 1; i++) {
      const before = previous.bowls[i] || EMPTY;
      const after = this.view.bowls[i] || EMPTY;
      for (const id of BOWL_FIELDS) {
        if (id === 'cookState' || after[id] <= before[id]) continue;
        if (id === 'broth') this.pour(i);
        else this.dropIngredient(id, i);
      }
      if (before.cookState !== after.cookState) {
        if (after.cookState === 'cooking') {
          this.bounceBasket(false);
        } else if (before.cookState === 'cooking' && after.cookState === 'cooked') {
          this.bounceBasket(true);
          this.dropIngredient('noodles', i, BASKET_X, 200 + BASKET_Y);
        }
      }
    }
  }

  private markAnimation(duration: number) {
    this.effectsRemaining = Math.max(this.effectsRemaining, duration + 40);
    this.requestFrame();
  }

  private settleBowl(index: number) {
    const image = this.bowlImages[index];
    this.tweens.killTweensOf(image);
    image.setPosition(BOWL_X, 301.5 + SERVING_Y).setScale(1.012, 0.991);
    this.tweens.add({ targets: image, y: 300 + SERVING_Y, scaleX: 1, scaleY: 1, duration: 220, ease: 'Sine.Out' });
  }

  private dropIngredient(id: string, index: number, fromX?: number, fromY?: number) {
    const image = this.drops[this.dropCursor++ % this.drops.length];
    const x = BOWL_X;
    this.tweens.killTweensOf(image);
    const source = COUNTER_INGREDIENTS.find(ingredient => ingredient.id === (id === 'noodles' ? 'noodle' : id));
    this.sizeImage(image.setTexture(`kitchen-drop-${id}`)).setPosition(fromX ?? (source ? source.x + source.width / 2 : x + 12), fromY ?? (source ? source.y + 38 : 227 + SERVING_Y))
      .setVisible(true).setAlpha(1).setScale(0.95).setAngle(-9);
    this.tweens.add({
      targets: image, x: id === 'quay' ? 482 : x + 3, y: id === 'quay' ? 416 : 278 + SERVING_Y, angle: 5, scaleX: 0.75, scaleY: 0.75,
      alpha: 0.25, duration: fromX ? 300 : 310, ease: 'Sine.InOut',
      onComplete: () => image.setVisible(false),
    });
    if (id !== 'quay') this.settleBowl(index);
    this.markAnimation(330);
  }

  private pour(index: number) {
    const x = BOWL_X;
    const ladle = this.ladles[index], stream = this.streams[index], ripple = this.ripples[index];
    this.tweens.killTweensOf([ladle, stream, ripple]);
    ladle.setPosition(143, 179 + POT_Y).setAngle(9).setAlpha(1).setScale(0.9).setVisible(true);
    this.tweens.add({ targets: ladle, x: x - 9, y: 221 + SERVING_Y, angle: -35, alpha: 0.5, duration: 310,
      ease: 'Cubic.Out', onComplete: () => ladle.setVisible(false) });
    stream.setPosition(x - 13, 229 + SERVING_Y).setScale(0.6, 0.25).setAlpha(0.9).setVisible(false);
    this.tweens.add({ targets: stream, scaleX: 0.8, scaleY: 0.85, alpha: 0, delay: 130, duration: 200,
      ease: 'Sine.Out', onStart: () => stream.setVisible(true), onComplete: () => stream.setVisible(false) });
    ripple.setPosition(x, 278 + SERVING_Y).setScale(0.25).setAlpha(0.9).setVisible(true);
    this.tweens.add({ targets: ripple, scaleX: 1.25, scaleY: 1.25, alpha: 0, duration: 440,
      ease: 'Sine.Out', onComplete: () => ripple.setVisible(false) });
    this.settleBowl(index);
    this.markAnimation(450);
  }

  private basketY() {
    return BASKET_REST_Y + (this.view.bowls[this.view.activeBowl]?.cookState === 'cooking' ? BASKET_DIP : 0);
  }

  private bounceBasket(lift: boolean) {
    this.tweens.killTweensOf(this.basketImage);
    this.basketImage.setY(BASKET_REST_Y + (lift ? BASKET_DIP : 0));
    this.tweens.add({ targets: this.basketImage, y: this.basketY(), duration: 360, ease: 'Sine.InOut' });
    this.markAnimation(400);
  }

  /** Called before the accepted dish is cleared by update(), with no logical delay. */
  serve(index: number) {
    if (!this.ready || this.reducedMotion || this.hidden || this.view.paused || index !== 0) return;
    const texture = this.serveTextures[index];
    const context = texture.getContext();
    context.clearRect(0, 0, 200*this.resolution, 164*this.resolution);
    context.drawImage(this.bowlTextures[index].getSourceImage() as HTMLCanvasElement, 0, 0);
    texture.refresh();
    const image = this.serveImages[index];
    const x = BOWL_X;
    this.tweens.killTweensOf(image);
    image.setPosition(x, 300 + SERVING_Y).setScale(1).setAlpha(1).setVisible(true);
    this.tweens.add({ targets: image, x: x + 14, y: 236 + SERVING_Y, scaleX: 0.88, scaleY: 0.88, alpha: 0,
      duration: 380, ease: 'Cubic.In', onComplete: () => image.setVisible(false) });
    for (let n = 0; n < 3; n++) {
      const star = this.sparkles[index * 3 + n];
      this.tweens.killTweensOf(star);
      star.setPosition(x - 38 + n * 38, 260 + SERVING_Y - n % 2 * 17).setScale(0.4).setAlpha(1).setVisible(true);
      this.tweens.add({ targets: star, y: star.y - 30, angle: 35, scaleX: 0.95, scaleY: 0.95,
        alpha: 0, duration: 430, ease: 'Sine.Out', onComplete: () => star.setVisible(false) });
    }
    this.markAnimation(450);
  }

  update(_time: number, delta: number) {
    if (!this.ready) return;
    const running = !this.view.paused && !this.hidden;
    const steaming = !this.reducedMotion && this.steamEnabled.some(Boolean);
    if (running) this.effectsRemaining = Math.max(0, this.effectsRemaining - Math.min(delta, 100));
    if (running && steaming) {
      this.anim += Math.min(delta, 100) / 1000;
      // Only nine cached image transforms: no particles, paths or point arrays
      // are allocated while the scene animates.
      for (let i = 0; i < 9; i++) {
        const source = Math.floor(i / 3);
        if (!this.steamEnabled[source]) continue;
        const strand = i % 3;
        const scale = source === 0 ? 1 : source === 1 ? 0.8 : 0.68;
        const x = source === 0 ? 101 : source === 1 ? BASKET_X - 1 : BOWL_X;
        const y = source === 0 ? 183 + POT_Y : source === 1 ? 197 + BASKET_Y : 253 + SERVING_Y;
        const cycle = (this.anim * 0.2 + source * 0.17 + strand * 0.29) % 1;
        this.steamSprites[i].setPosition(x + (strand - 1) * 17 * scale + Math.sin(this.anim + i) * 3, y - cycle * 25 * scale)
          .setScale(scale, scale * (0.8 + cycle * 0.2)).setAlpha(Math.sin(cycle * Math.PI) * 0.6);
      }
    }
    if ((!running || (!steaming && this.effectsRemaining <= 0)) && !this.sleepPending) {
      this.sleepPending = true;
      this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
        this.sleepPending = false;
        this.game.loop.sleep();
      });
    }
  }

}

/** Illustrated Phaser counter; the app owns recipes, inventory and game time. */
export function createKitchen(
  parent: HTMLElement,
  onAction: (action: string, payload?: unknown) => void,
): { update(view: KitchenView): void; effect(name: 'serve', payload: { bowl: number }): void; destroy(): void } {
  // Supersample small strokes on normal displays; match the physical pixel
  // density on Retina desktops. Cached textures share the same bounded scale.
  const resolution = Math.min(3, Math.max(2, Math.ceil(parent.clientWidth * (window.devicePixelRatio || 1) / W)));
  const scene = new KitchenScene(onAction, resolution);
  const game = new Phaser.Game({
    // A small cached 2D scene needs no WebGL context or per-frame vector tessellation.
    type: Phaser.CANVAS,
    parent,
    width: W * resolution,
    height: H * resolution,
    backgroundColor: '#f4eddb',
    antialias: true,
    roundPixels: false,
    scene: [scene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: W * resolution,
      height: H * resolution,
    },
    render: { antialias: true, transparent: false },
    audio: { noAudio: true },
    banner: false,
  });
  game.events.once('ready', () => {
    game.canvas.setAttribute('aria-label', 'Quầy phở với kệ kính ba tầng: rổ quẩy, bát sạch và đũa ở tầng trên; bánh phở, thịt ở tầng giữa; hành rau, gia vị ở tầng dưới. Chạm chồng bát ở tầng trên để lấy bát; nồi nước bên trái, bát đang làm ở giữa, giỏ trụng bên phải.');
    game.canvas.setAttribute('role', 'img');
  });
  // Opening the shop moves the counter without resizing it. Refresh its origin
  // before Phaser maps each mouse/touch press, including while the canvas sleeps.
  const refreshPointerBounds = (event: Event) => {
    if (event.target !== game.canvas) return;
    game.scale.updateBounds();
    scene.requestFrame();
  };
  document.addEventListener('mousedown', refreshPointerBounds, true);
  document.addEventListener('touchstart', refreshPointerBounds, { capture: true, passive: true });
  const resize = new ResizeObserver(() => {
    game.scale.refresh();
    scene.requestFrame();
  });
  const visibility = () => scene.setHidden(document.hidden);
  document.addEventListener('visibilitychange', visibility);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionChange = (event: MediaQueryListEvent) => scene.setReducedMotion(event.matches);
  motion.addEventListener('change', motionChange);
  resize.observe(parent);
  return {
    update(view: KitchenView) { scene.setView(view); },
    effect(name: 'serve', payload: { bowl: number }) { if (name === 'serve') scene.serve(payload.bowl); },
    destroy() {
      resize.disconnect();
      document.removeEventListener('mousedown', refreshPointerBounds, true);
      document.removeEventListener('touchstart', refreshPointerBounds, true);
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', motionChange);
      game.destroy(true);
      // Phaser processes destruction on its next frame, including while idle.
      if (!game.loop.running) game.loop.wake();
    },
  };
}
