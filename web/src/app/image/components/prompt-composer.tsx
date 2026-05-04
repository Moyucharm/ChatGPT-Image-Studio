"use client";

import {
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type ReactNode,
  type RefObject,
} from "react";
import Zoom from "react-medium-image-zoom";
import {
  ArrowUp,
  CircleHelp,
  ImagePlus,
  LoaderCircle,
  Trash2,
} from "lucide-react";

import { AppImage as Image } from "@/components/app-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ImageQuality, ImageRoutePreference } from "@/lib/api";
import type { ImageMode, StoredSourceImage } from "@/store/image-conversations";
import { cn } from "@/lib/utils";

type PromptComposerProps = {
  mode: ImageMode;
  modeOptions: Array<{ label: string; value: ImageMode; description: string }>;
  imageCount: string;
  imageAspectRatio: string;
  imageAspectRatioOptions: Array<{ label: string; value: string }>;
  imageResolutionTier: string;
  imageResolutionTierLabel: string;
  imageResolutionTierOptions: Array<{
    label: string;
    value: string;
    disabled?: boolean;
  }>;
  imageSizeHint: ReactNode;
  imageQuality: ImageQuality;
  imageQualityOptions: Array<{
    label: string;
    value: ImageQuality;
    description: string;
  }>;
  upscaleScale: string;
  upscaleOptions: string[];
  hasGenerateReferences: boolean;
  availableQuota: string;
  imageRoutePreference: ImageRoutePreference;
  sourceImages: StoredSourceImage[];
  imagePrompt: string;
  systemPrompt: string;
  activePromptKind: "user" | "system";
  isSubmitting: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  maskInputRef: RefObject<HTMLInputElement | null>;
  onModeChange: (mode: ImageMode) => void;
  onImageCountChange: (value: string) => void;
  onImageAspectRatioChange: (value: string) => void;
  onImageResolutionTierChange: (value: string) => void;
  onImageQualityChange: (value: string) => void;
  onImageRoutePreferenceChange: (value: ImageRoutePreference) => void;
  onUpscaleScaleChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onSystemPromptChange: (value: string) => void;
  onActivePromptKindChange: (value: "user" | "system") => void;
  onPromptPaste: (event: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  onRemoveSourceImage: (id: string) => void;
  onAppendFiles: (
    files: FileList | null,
    role: "image" | "mask",
  ) => Promise<void>;
  onSubmit: () => Promise<void>;
};

export function PromptComposer({
  mode,
  modeOptions,
  imageCount,
  imageAspectRatio,
  imageAspectRatioOptions,
  imageResolutionTier,
  imageResolutionTierLabel,
  imageResolutionTierOptions,
  imageSizeHint,
  imageQuality,
  imageQualityOptions,
  upscaleScale,
  upscaleOptions,
  hasGenerateReferences,
  availableQuota,
  imageRoutePreference,
  sourceImages,
  imagePrompt,
  systemPrompt,
  activePromptKind,
  isSubmitting,
  textareaRef,
  uploadInputRef,
  maskInputRef,
  onModeChange,
  onImageCountChange,
  onImageAspectRatioChange,
  onImageResolutionTierChange,
  onImageQualityChange,
  onImageRoutePreferenceChange,
  onUpscaleScaleChange,
  onPromptChange,
  onSystemPromptChange,
  onActivePromptKindChange,
  onPromptPaste,
  onRemoveSourceImage,
  onAppendFiles,
  onSubmit,
}: PromptComposerProps) {
  const dragDepthRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const imageQualityLabel =
    imageQualityOptions.find((item) => item.value === imageQuality)?.label ??
    imageQuality;
  const imageRoutePreferenceLabel =
    imageRoutePreference === "responses"
      ? "Responses"
      : imageRoutePreference === "legacy"
        ? "Legacy"
        : "默认";
  const isSystemPromptActive = activePromptKind === "system";
  const currentPrompt = isSystemPromptActive ? systemPrompt : imagePrompt;
  const promptPlaceholder = isSystemPromptActive
    ? "系统提示词仅在responses模式下生效。留空使用默认。"
    : mode === "generate"
      ? "描述你想生成的画面，也可以先上传参考图"
      : mode === "edit"
        ? "描述你想如何修改当前图片"
        : "可选：描述你想增强的方向";
  const showCanvasControls = mode !== "upscale";
  const showGenerateOnlyControls =
    mode === "generate" && !hasGenerateReferences;
  const sizeHintTooltip = showCanvasControls ? (
    <span className="group relative inline-flex items-center align-middle">
      <span
        tabIndex={0}
        className="inline-flex size-8 cursor-help items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-400 transition-colors hover:text-stone-700 focus-visible:text-stone-700 focus-visible:outline-none"
        aria-label="查看分辨率说明"
      >
        <CircleHelp className="size-4" />
      </span>
      <span className="pointer-events-none absolute right-0 bottom-full z-30 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs font-normal leading-6 text-stone-600 opacity-0 shadow-lg transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
        {imageSizeHint}
      </span>
    </span>
  ) : null;

  const hasImageFiles = (dataTransfer: DataTransfer | null) =>
    Boolean(
      dataTransfer &&
      Array.from(dataTransfer.items).some(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      ),
    );

  const handleDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    if (isSubmitting || !hasImageFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (isSubmitting || !hasImageFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  };

  const handleDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasImageFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (isSubmitting || !hasImageFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    void onAppendFiles(event.dataTransfer.files, "image");
  };

  return (
    <div className="shrink-0 border-t border-stone-200 bg-white px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-3">
        <div
          className={cn(
            "relative flex flex-col rounded-xl border border-stone-200 bg-[#fafaf9] shadow-[0_2px_12px_rgba(0,0,0,0.04)] focus-within:border-stone-300 focus-within:ring-1 focus-within:ring-stone-300/50",
            isDragActive && "border-stone-400 ring-2 ring-stone-300/70",
          )}
          onClick={() => {
            textareaRef.current?.focus();
          }}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragActive ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-white/88 px-4 text-center backdrop-blur-sm">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-stone-900">
                  松手即可添加图片
                </div>
                <div className="text-xs text-stone-500">
                  会作为当前模式的源图或参考图加入对话框
                </div>
              </div>
            </div>
          ) : null}

          {sourceImages.length > 0 ? (
            <div className="hide-scrollbar flex gap-3 overflow-x-auto border-b border-stone-100 bg-white/50 px-4 py-3">
              {sourceImages.map((item) => (
                <div
                  key={item.id}
                  className="w-[126px] shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-stone-100 px-3 py-1.5 text-[11px] font-medium text-stone-500">
                    <span>{item.role === "mask" ? "遮罩" : "源图"}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveSourceImage(item.id);
                      }}
                      className="rounded-md p-1 text-stone-400 transition hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <Zoom>
                    <Image
                      src={item.dataUrl}
                      alt={item.name}
                      width={160}
                      height={110}
                      unoptimized
                      className="block h-20 w-full cursor-zoom-in bg-[#f5f5f3] object-contain"
                    />
                  </Zoom>
                </div>
              ))}
            </div>
          ) : null}

          <div className="px-4 pb-2 pt-3">
            <Textarea
              ref={textareaRef}
              value={currentPrompt}
              onChange={(event) => {
                if (isSystemPromptActive) {
                  onSystemPromptChange(event.target.value);
                } else {
                  onPromptChange(event.target.value);
                }
              }}
              placeholder={promptPlaceholder}
              onPaste={isSystemPromptActive ? undefined : onPromptPaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!isSubmitting) {
                    void onSubmit();
                  }
                }
              }}
              className="block min-h-[72px] max-h-[480px] resize-none border-0 bg-transparent !px-0 !py-2 text-[15px] leading-7 text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0 overflow-y-auto"
            />
          </div>

          <div className="rounded-b-xl border-t border-stone-100 bg-stone-50/50 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-stone-200 bg-white p-1 shadow-sm">
                  {modeOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onModeChange(item.value);
                      }}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition",
                        mode === item.value
                          ? "bg-stone-100 text-stone-950"
                          : "text-stone-600 hover:bg-stone-50 hover:text-stone-900",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-700 shadow-sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    uploadInputRef.current?.click();
                  }}
                  title="上传参考图"
                >
                  <ImagePlus className="size-4 text-stone-500" />
                </Button>

                <div className="inline-flex h-8 rounded-lg border border-stone-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onActivePromptKindChange("user");
                      textareaRef.current?.focus();
                    }}
                    className={cn(
                      "rounded-md px-2.5 text-xs font-medium transition",
                      !isSystemPromptActive
                        ? "bg-stone-100 text-stone-950"
                        : "text-stone-500 hover:bg-stone-50 hover:text-stone-900",
                    )}
                  >
                    用户
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onActivePromptKindChange("system");
                      textareaRef.current?.focus();
                    }}
                    className={cn(
                      "rounded-md px-2.5 text-xs font-medium transition",
                      isSystemPromptActive
                        ? "bg-stone-100 text-stone-950"
                        : "text-stone-500 hover:bg-stone-50 hover:text-stone-900",
                    )}
                    title="系统提示词仅在 Responses 模式下生效"
                  >
                    系统
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium text-stone-400">
                  剩余额度 {availableQuota}
                </span>
                <button
                  type="button"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white shadow-sm transition hover:bg-stone-800 disabled:opacity-50 disabled:hover:bg-stone-950"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onSubmit();
                  }}
                  disabled={isSubmitting}
                  aria-label="提交"
                >
                  {isSubmitting ? (
                    <LoaderCircle className="size-4 animate-spin text-white/70" />
                  ) : (
                    <ArrowUp className="size-4" strokeWidth={3} />
                  )}
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {showCanvasControls ? (
                <Select
                  value={imageAspectRatio}
                  onValueChange={onImageAspectRatioChange}
                >
                  <SelectTrigger className="h-8 w-[96px] rounded-lg border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-700 shadow-sm focus-visible:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {imageAspectRatioOptions.map((item) => (
                      <SelectItem
                        key={item.value}
                        value={item.value}
                        className="text-xs"
                      >
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {showCanvasControls ? (
                <Select
                  value={imageResolutionTier}
                  onValueChange={onImageResolutionTierChange}
                >
                  <SelectTrigger
                    className="h-8 w-[160px] rounded-lg border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-700 shadow-sm focus-visible:ring-0"
                    title={imageResolutionTierLabel}
                  >
                    <SelectValue>{imageResolutionTierLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {imageResolutionTierOptions.map((item) => (
                      <SelectItem
                        key={item.value}
                        value={item.value}
                        disabled={item.disabled}
                        className="text-xs"
                      >
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {sizeHintTooltip}

              {showGenerateOnlyControls ? (
                <Select
                  value={imageQuality}
                  onValueChange={onImageQualityChange}
                >
                  <SelectTrigger
                    className="h-8 w-[100px] rounded-lg border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-700 shadow-sm focus-visible:ring-0"
                    title={
                      imageQualityOptions.find(
                        (item) => item.value === imageQuality,
                      )?.description
                    }
                  >
                    <SelectValue>{`质量 ${imageQualityLabel}`}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {imageQualityOptions.map((item) => (
                      <SelectItem
                        key={item.value}
                        value={item.value}
                        className="text-xs"
                      >
                        <span title={item.description}>质量 {item.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {showGenerateOnlyControls ? (
                <div className="flex h-8 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 shadow-sm">
                  <span className="text-xs font-medium text-stone-500">
                    张数
                  </span>
                  <Input
                    type="number"
                    min="1"
                    max="8"
                    step="1"
                    value={imageCount}
                    onChange={(event) => onImageCountChange(event.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-6 w-[32px] border-0 bg-transparent px-0 py-0 text-center text-xs font-medium text-stone-900 shadow-none focus-visible:ring-0"
                  />
                </div>
              ) : null}

              {mode === "upscale" ? (
                <Select
                  value={upscaleScale}
                  onValueChange={onUpscaleScaleChange}
                >
                  <SelectTrigger className="h-8 w-[96px] rounded-lg border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-700 shadow-sm focus-visible:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {upscaleOptions.map((item) => (
                      <SelectItem key={item} value={item} className="text-xs">
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              <Select
                value={imageRoutePreference}
                onValueChange={(value) =>
                  onImageRoutePreferenceChange(value as ImageRoutePreference)
                }
              >
                <SelectTrigger className="h-8 w-[112px] rounded-lg border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-700 shadow-sm focus-visible:ring-0">
                  <SelectValue>{imageRoutePreferenceLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto" className="text-xs">
                    默认（跟随系统）
                  </SelectItem>
                  <SelectItem value="legacy" className="text-xs">
                    Legacy
                  </SelectItem>
                  <SelectItem value="responses" className="text-xs">
                    Responses
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            multiple={mode !== "upscale"}
            className="hidden"
            onChange={(event) => {
              void onAppendFiles(event.target.files, "image");
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={maskInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void onAppendFiles(event.target.files, "mask");
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}
