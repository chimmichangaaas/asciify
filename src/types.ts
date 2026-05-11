export type AsciiFramePayload = {
  text: string;
  colors?: number[];
  meanColor?: [number, number, number];
};

export type InsertMessage = {
  type: 'insert';
  frames: AsciiFramePayload[];
  columns: number;
  rows: number;
  kind: 'image' | 'animation';
  smoothMerge?: boolean;
  originalImageBytes?: number[]; // PNG bytes of first raw frame for smooth merge
};

export type NotifyMessage = {
  type: 'notify';
  message: string;
  error?: boolean;
};

export type RequestCheckoutMessage = {
  type: 'checkout';
};

export type UiToCode = InsertMessage | NotifyMessage | RequestCheckoutMessage;

// ── Code → UI ──────────────────────────────────────────────────────────────

export type QuotaStatus = {
  imageCount: number;  // used today
  videoCount: number;  // used lifetime
  isPaid: boolean;
  isOwner: boolean;
};

export type QuotaMessage = {
  type: 'quota';
  quota: QuotaStatus;
};

export type DoneMessage = {
  type: 'done';
  frameCount: number;
};

export type CodeToUi = QuotaMessage | DoneMessage;
