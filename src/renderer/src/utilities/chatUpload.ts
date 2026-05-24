import { BACKEND_URL } from "@/shared/config";

interface UploadChatImageOptions {
  accessToken: string;
  file: File;
  folder: string;
  fileName: string;
  onProgress?: (progress: number) => void;
}

export function uploadChatImage({
  accessToken,
  file,
  folder,
  fileName,
  onProgress,
}: UploadChatImageOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append("file", file, fileName);
    formData.append("folder", folder);

    xhr.open("POST", `${BACKEND_URL}/files/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(String(xhr.responseText).replace(/^"|"$/g, ""));
        return;
      }

      reject(new Error(`upload_failed_${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error("upload_failed"));
    xhr.onabort = () => reject(new Error("upload_aborted"));

    onProgress?.(0);
    xhr.send(formData);
  });
}
