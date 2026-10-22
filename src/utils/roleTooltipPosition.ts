type Bounds = { left: number; right: number; top: number; bottom: number; width: number; height: number };
type Size = { width: number; height: number };
export type RoleTooltipSide = 'left' | 'right' | 'top' | 'bottom';

/** Place the card beside its token, keeping the pointer aimed at the token. */
export function roleTooltipPosition(anchor: Bounds, tooltip: Size, viewport: Size, tableCenterX = viewport.width / 2) {
  const margin = 8, gap = 12, corner = 16;
  const centerX = (anchor.left + anchor.right) / 2;
  const centerY = (anchor.top + anchor.bottom) / 2;
  const room = {
    left: anchor.left - gap - margin,
    right: viewport.width - anchor.right - gap - margin,
    top: anchor.top - gap - margin,
    bottom: viewport.height - anchor.bottom - gap - margin,
  };
  let side: RoleTooltipSide = centerX < tableCenterX - 1 ? 'left' : 'right';
  const opposite = side === 'left' ? 'right' : 'left';
  if (room[side] < tooltip.width) {
    if (room[opposite] >= tooltip.width) side = opposite;
    else side = room.bottom >= tooltip.height || room.bottom >= room.top ? 'bottom' : 'top';
  }
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
  let left = centerX - tooltip.width / 2;
  let top = centerY - tooltip.height / 2;
  if (side === 'left') left = anchor.left - gap - tooltip.width;
  if (side === 'right') left = anchor.right + gap;
  if (side === 'top') top = anchor.top - gap - tooltip.height;
  if (side === 'bottom') top = anchor.bottom + gap;
  left = clamp(left, margin, viewport.width - tooltip.width - margin);
  top = clamp(top, margin, viewport.height - tooltip.height - margin);
  return {
    side,
    style: {
      left: `${left}px`,
      top: `${top}px`,
      '--pointer-x': `${clamp(centerX - left, corner, tooltip.width - corner)}px`,
      '--pointer-y': `${clamp(centerY - top, corner, tooltip.height - corner)}px`,
    },
  };
}
