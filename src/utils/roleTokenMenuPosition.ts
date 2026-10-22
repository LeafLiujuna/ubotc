type Rect = { left: number; top: number; width: number; height: number };
type Size = { width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));

/** Place the menu on the centre-facing edge/corner of a circular seat token. */
export function roleTokenMenuPosition(anchor: Rect, menu: Size, viewport: Size, seatAngle: number) {
  const radians = seatAngle * Math.PI / 180;
  const dx = -Math.cos(radians);
  const dy = -Math.sin(radians);
  const sector = (Math.round((seatAngle + 180) / 45) % 8 + 8) % 8;
  const horizontal = [1, 1, 0, -1, -1, -1, 0, 1][sector];
  const vertical = [0, 1, 1, 1, 0, -1, -1, -1][sector];
  const centerX = anchor.left + anchor.width / 2;
  const centerY = anchor.top + anchor.height / 2;
  const radius = Math.min(anchor.width, anchor.height) / 2;
  const gap = 14;
  const rawLeft = centerX + dx * (radius + gap) - (horizontal < 0 ? menu.width : horizontal === 0 ? menu.width / 2 : 0);
  const rawTop = centerY + dy * (radius + gap) - (vertical < 0 ? menu.height : vertical === 0 ? menu.height / 2 : 0);
  let left = clamp(rawLeft, 8, viewport.width - menu.width - 8);
  let top = clamp(rawTop, 8, viewport.height - menu.height - 8);
  const coversAnchor = (x: number, y: number) => centerX > x && centerX < x + menu.width && centerY > y && centerY < y + menu.height;
  if (coversAnchor(left, top)) {
    const oppositeLeft = clamp(centerX - dx * (radius + gap) - (horizontal > 0 ? menu.width : horizontal === 0 ? menu.width / 2 : 0), 8, viewport.width - menu.width - 8);
    const oppositeTop = clamp(centerY - dy * (radius + gap) - (vertical > 0 ? menu.height : vertical === 0 ? menu.height / 2 : 0), 8, viewport.height - menu.height - 8);
    if (!coversAnchor(oppositeLeft, oppositeTop)) {
      left = oppositeLeft;
      top = oppositeTop;
    }
  }

  // Recompute the pointer after clamping so it still points at the token when
  // a small viewport pushes the menu away from its preferred position.
  const targetX = clamp(centerX, left, left + menu.width);
  const targetY = clamp(centerY, top, top + menu.height);
  const pointerX = targetX - left;
  const pointerY = targetY - top;
  const rotation = Math.atan2(centerY - targetY, centerX - targetX) * 180 / Math.PI - 45;

  return {
    left: `${left}px`,
    top: `${top}px`,
    '--pointer-x': `${pointerX}px`,
    '--pointer-y': `${pointerY}px`,
    '--pointer-rotation': `${rotation}deg`,
    '--pointer-visibility': coversAnchor(left, top) ? 'hidden' : 'visible',
  };
}
