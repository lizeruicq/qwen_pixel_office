/**
 * 像素胸像生成器：为游戏角色生成一张方形对话头像（dataURL）。
 * 用角色的发色 + 衣服主色合成一个胸像（深色底 + 头发 + 脸 + 衣领），
 * 让老板 / 小蓝 / 小橙在对话框里一眼可区分。
 *
 * 用法（需在 Phaser scene、素材加载后调用）：
 *   const url = makePortrait(scene, 'npcwalk');        // 老板（有正面帧，取头发/衣服色）
 *   const url = makePortrait(scene, 'agent_typing0');  // 同事（从打字图采样配色）
 *   rpgDialog({ portrait: url, text: '…' });
 *
 * @param scene Phaser.Scene
 * @param key   精灵纹理 key（16×24 帧，取 frame0 的上半采样颜色）
 * @returns dataURL
 */
export function makePortrait(scene, key) {
  const tex = scene.textures.get(key);
  const img = tex.getSourceImage();

  // 采样 frame0 的上半（16×18）找发色与衣服色
  const tmp = document.createElement('canvas');
  tmp.width = 16; tmp.height = 18;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(img, 0, 0, 16, 18, 0, 0, 16, 18);
  const px = tctx.getImageData(0, 0, 16, 18).data;

  const at = (x, y) => {
    const i = (y * 16 + x) * 4;
    return px[i + 3] > 128 ? [px[i], px[i + 1], px[i + 2]] : null;
  };
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  // 发色：头顶区域第一个不透明像素；衣服色：躯干中部；缺省回退
  let hair = null, shirt = null;
  for (let y = 0; y < 7 && !hair; y++) for (let x = 0; x < 16; x++) { hair = hair || at(x, y); }
  for (let y = 12; y < 17 && !shirt; y++) for (let x = 0; x < 16; x++) { shirt = shirt || at(x, y); }
  hair = hair || [60, 40, 30];
  shirt = shirt || [120, 120, 130];
  // 衣服色若太接近肤色（说明采到了手臂），压暗一点当作衣色
  const skin = [238, 200, 160];

  // 合成 64×64 胸像
  const S = 64;
  const out = document.createElement('canvas');
  out.width = S; out.height = S;
  const c = out.getContext('2d');
  c.fillStyle = '#2a2e38'; c.fillRect(0, 0, S, S);
  const pxU = 4; // 像素单位
  // 衣领/肩（底部）
  c.fillStyle = rgb(shirt); c.fillRect(12, 44, 40, 20);
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(12, 44, 40, 3);
  // 脖子
  c.fillStyle = rgb(skin); c.fillRect(26, 38, 12, 8);
  // 头（脸）
  c.fillStyle = rgb(skin); c.fillRect(18, 12, 28, 28);
  // 头发（头顶 + 两侧）
  c.fillStyle = rgb(hair);
  c.fillRect(16, 6, 32, 10);   // 头顶
  c.fillRect(16, 6, 6, 22);    // 左鬓
  c.fillRect(42, 6, 6, 22);    // 右鬓
  // 眼睛
  c.fillStyle = '#20242c';
  c.fillRect(24, 26, 4, 5);
  c.fillRect(36, 26, 4, 5);
  // 嘴
  c.fillRect(29, 34, 6, 2);
  return out.toDataURL();
}
