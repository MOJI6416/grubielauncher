export interface DownloadItem {
  url: string;
  destination: string;
  group: string;
  sha1?: string;
  checksum?: string;
  checksumType?: "sha1" | "sha256";
  size?: number;
  options?: {
    extract?: boolean;
    extractFolder?: string;
    extractDelete?: boolean;
    silent?: boolean;
  };
}

export interface DownloaderInfo {
  totalItems: number;
  completedItems: number;
  failedItems: number;
  progressPercent: number;
  currentGroup?: string;
  currentFileName?: string;
  downloadSpeed?: number;
  estimatedTimeRemaining?: number;
  totalBytes: number;
  downloadedBytes: number;
}

export interface DownloaderFailureItem {
  fileName: string;
  destination: string;
  url: string;
  group: string;
  error: string;
}

export interface DownloaderFailuresInfo {
  totalItems: number;
  completedItems: number;
  failedItems: number;
  failures: DownloaderFailureItem[];
}
