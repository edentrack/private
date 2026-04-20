/**
 * Image Compression Utility
 * Compresses images before upload to save storage space
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
  maxSizeKB?: number; // Target file size in KB
  format?: 'jpeg' | 'webp' | 'png';
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.75,
  maxSizeKB: 500, // 500KB target
  format: 'jpeg',
};

/**
 * Compress an image file
 * Returns a compressed Blob
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions maintaining aspect ratio
        if (width > opts.maxWidth || height > opts.maxHeight) {
          const ratio = Math.min(opts.maxWidth / width, opts.maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Draw image with high quality
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob with compression
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            // If still too large, reduce quality further
            const sizeKB = blob.size / 1024;
            if (sizeKB > opts.maxSizeKB && opts.quality > 0.3) {
              // Recursively compress with lower quality
              const newQuality = Math.max(0.3, opts.quality - 0.1);
              compressImage(file, { ...opts, quality: newQuality })
                .then(resolve)
                .catch(reject);
            } else {
              resolve(blob);
            }
          },
          `image/${opts.format}`,
          opts.quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Get optimal compression options based on file type and size
 */
export function getOptimalCompressionOptions(file: File): CompressionOptions {
  const sizeMB = file.size / (1024 * 1024);
  
  // For very large files, be more aggressive
  if (sizeMB > 5) {
    return {
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.6,
      maxSizeKB: 400,
      format: 'jpeg',
    };
  }
  
  if (sizeMB > 2) {
    return {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 0.7,
      maxSizeKB: 500,
      format: 'jpeg',
    };
  }

  // For smaller files, less compression
  return {
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 0.8,
    maxSizeKB: 600,
    format: 'jpeg',
  };
}

/**
 * Compress image with automatic optimization
 */
export async function autoCompressImage(file: File): Promise<File> {
  const options = getOptimalCompressionOptions(file);
  const compressedBlob = await compressImage(file, options);
  
  // Create a new File object with compressed blob
  const compressedFile = new File(
    [compressedBlob],
    file.name.replace(/\.[^/.]+$/, `.${options.format}`),
    {
      type: `image/${options.format}`,
      lastModified: Date.now(),
    }
  );

  return compressedFile;
}

/**
 * Get file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}











