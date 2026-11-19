export interface DiskRoom {
  ok: boolean;
  freeBytes: number | null;
  neededBytes: number;
  drive: string;
}
