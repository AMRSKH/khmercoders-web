'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Upload, ImageIcon, Loader2, X, Check, ZoomIn, ZoomOut } from 'lucide-react';
import { useSession } from '@/components/auth-provider';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/generated/card';
import { Button } from '@/components/generated/button';
import { Slider } from '@/components/generated/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/generated/dialog';

const VIEW_SIZE = 280;
const OUTPUT_SIZE = 512;

export default function ProfileSetupPicturePage() {
  const router = useRouter();
  const { session } = useSession();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const [isUploading, setIsUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [cropOpen, setCropOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isCropping, setIsCropping] = useState(false);

  const userImage = session?.user?.image;

  const baseScale =
    imageSize.width && imageSize.height
      ? Math.max(VIEW_SIZE / imageSize.width, VIEW_SIZE / imageSize.height)
      : 1;
  const scale = baseScale * zoom;

  const revoke = useCallback((url: string | null) => {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  }, []);

  const resetCropState = useCallback(() => {
    revoke(rawImageSrc);
    setRawImageSrc(null);
    setImageSize({ width: 0, height: 0 });
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [rawImageSrc, revoke]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file type', description: 'Please select an image file.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Image must be less than 5MB.', variant: 'destructive' });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setRawImageSrc(objectUrl);
    setCropOpen(true);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imageRef.current = img;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const applyCrop = useCallback(async () => {
    if (!rawImageSrc || !imageSize.width) return;
    const img = imageRef.current;
    if (!img) return;
    setIsCropping(true);
    try {
      const v = VIEW_SIZE;
      const s = scale;
      const imgW = imageSize.width;
      const imgH = imageSize.height;

      const origX = (0 - v / 2 - pan.x) / s + imgW / 2;
      const origY = (0 - v / 2 - pan.y) / s + imgH / 2;
      const cropW = v / s;
      const cropH = v / s;

      const sx = clamp(origX, 0, imgW - 1);
      const sy = clamp(origY, 0, imgH - 1);
      const sw = clamp(cropW, 1, imgW - sx);
      const sh = clamp(cropH, 1, imgH - sy);

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('Failed to crop image');

      const croppedFile = new File([blob], 'profile.png', { type: 'image/png' });
      const croppedUrl = URL.createObjectURL(blob);

      revoke(selectedImage);
      setSelectedFile(croppedFile);
      setSelectedImage(croppedUrl);
      setCropOpen(false);
      resetCropState();
    } catch (error) {
      toast({
        title: 'Crop failed',
        description: error instanceof Error ? error.message : 'Failed to crop image',
        variant: 'destructive',
      });
    } finally {
      setIsCropping(false);
    }
  }, [rawImageSrc, imageSize, scale, pan, revoke, selectedImage, toast, resetCropState]);

  const handleCropCancel = () => {
    setCropOpen(false);
    resetCropState();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadImage = async () => {
    if (!selectedFile) return;
    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', selectedFile);

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          const nextProgress = prev + Math.random() * 15;
          return nextProgress >= 90 ? 90 : nextProgress;
        });
      }, 300);

      const response = await fetch('/api/upload/profile', { method: 'POST', body: formData });
      clearInterval(progressInterval);
      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Failed to upload image');
      }
      setUploadProgress(100);
      toast({ title: 'Profile picture updated', description: 'Your profile picture has been updated successfully.' });
      setSelectedFile(null);
      setTimeout(() => router.refresh(), 1000);
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload image',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearSelection = () => {
    revoke(selectedImage);
    setSelectedImage(null);
    setSelectedFile(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    return () => {
      revoke(selectedImage);
      revoke(rawImageSrc);
    };
  }, [selectedImage, rawImageSrc, revoke]);

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Profile Picture</h1>
        <p className="text-muted-foreground mb-8">
          Upload a profile picture to personalize your KhmerCoders account.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Upload Profile Picture</CardTitle>
            <CardDescription>
              Choose an image to represent you on the platform. You can crop and reposition it before
              uploading.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="flex flex-col items-center space-y-6">
              <div className="w-40 h-40 relative rounded-full overflow-hidden border-2 border-primary/40">
                {selectedImage ? (
                  <Image src={selectedImage} alt="Selected profile picture" fill className="object-cover" />
                ) : userImage ? (
                  <Image src={userImage} alt="Current profile picture" fill className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <ImageIcon className="h-16 w-16 text-muted-foreground opacity-30" />
                  </div>
                )}
              </div>

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="w-full max-w-xs">
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-center">
                    Uploading: {Math.round(uploadProgress)}%
                  </p>
                </div>
              )}

              {uploadProgress === 100 && (
                <div className="flex items-center gap-2 text-primary">
                  <Check className="h-5 w-5" />
                  <span>Upload complete!</span>
                </div>
              )}

              <div className="space-y-2 w-full max-w-xs">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="profile-picture-input"
                  disabled={isUploading}
                />

                <div className="flex gap-2">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="w-full"
                    disabled={isUploading}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Select Image
                  </Button>

                  {selectedImage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleClearSelection}
                      disabled={isUploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Supported formats: JPG, PNG, WebP, GIF. Max size: 5MB.
                </p>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => router.push('/profile/setup')} disabled={isUploading}>
              Cancel
            </Button>

            <Button
              onClick={uploadImage}
              disabled={!selectedFile || isUploading}
              className="min-w-[100px]"
            >
              {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Dialog open={cropOpen} onOpenChange={open => { if (!open) handleCropCancel(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crop profile picture</DialogTitle>
            <DialogDescription>
              Drag to reposition and use the slider to zoom. The square area will become your avatar.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4">
            <div
              className="relative overflow-hidden rounded-lg border bg-muted touch-none"
              style={{ width: VIEW_SIZE, height: VIEW_SIZE }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {rawImageSrc && (
                <img
                  src={rawImageSrc}
                  alt="Crop source"
                  onLoad={handleImageLoad}
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: imageSize.width || 'auto',
                    height: imageSize.height || 'auto',
                    transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`,
                    transformOrigin: 'center center',
                    cursor: draggingRef.current ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    maxWidth: 'none',
                  }}
                />
              )}
              <div
                className="pointer-events-none absolute inset-0 border-2 border-primary/70 rounded-none"
                style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
              />
            </div>

            <div className="w-full flex items-center gap-3">
              <ZoomOut className="h-4 w-4 text-muted-foreground" />
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.01}
                onValueChange={v => setZoom(v[0] ?? 1)}
                className="flex-1"
              />
              <ZoomIn className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCropCancel} disabled={isCropping}>
              Cancel
            </Button>
            <Button onClick={applyCrop} disabled={isCropping || !imageSize.width}>
              {isCropping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {isCropping ? 'Cropping...' : 'Save crop'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
