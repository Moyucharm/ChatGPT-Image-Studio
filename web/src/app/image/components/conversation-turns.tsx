"use client";

import Zoom from "react-medium-image-zoom";
import {
  Brush,
  Clock3,
  Copy,
  Download,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";

import { AppImage as Image } from "@/components/app-image";
import { cn } from "@/lib/utils";
import type {
  ImageConversationTurn,
  ImageMode,
  StoredImage,
} from "@/store/image-conversations";

import { formatImageErrorMessage } from "../submit-utils";
import { buildConversationSourceLabel, buildImageDataUrl } from "../view-utils";

type ActiveRequestState = {
  conversationId: string;
  turnId: string;
  mode: ImageMode;
  count: number;
  variant: "standard" | "selection-edit";
};

type ProcessingStatus = {
  title: string;
  detail: string;
};

function formatTurnSizeLabel(size?: string) {
  return String(size || "")
    .trim()
    .replace("x", "X");
}

function buildDownloadName(createdAt: string, turnId: string, index: number) {
  const date = new Date(createdAt);
  const safeIndex = String(index + 1).padStart(2, "0");
  if (Number.isNaN(date.getTime())) {
    return `chatgpt-image-${turnId.slice(0, 8)}-${safeIndex}.png`;
  }

  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");
  return `chatgpt-image-${yyyy}${mm}${dd}-${hh}${min}${sec}-${safeIndex}.png`;
}

async function copyPromptToClipboard(prompt: string) {
  const text = prompt.trim();
  if (!text) {
    toast.warning("没有可复制的提示词");
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    toast.success("提示词已复制");
  } catch {
    toast.error("复制失败");
  }
}

type ConversationTurnsProps = {
  conversationId: string;
  turns: ImageConversationTurn[];
  modeLabelMap: Record<ImageMode, string>;
  activeRequest: ActiveRequestState | null;
  isSubmitting: boolean;
  processingStatus: ProcessingStatus | null;
  waitingDots: string;
  submitElapsedSeconds: number;
  formatConversationTime: (value: string) => string;
  formatProcessingDuration: (seconds: number) => string;
  onOpenSelectionEditor: (
    conversationId: string,
    turnId: string,
    image: StoredImage,
    imageName: string,
  ) => void;
  onSeedFromResult: (
    conversationId: string,
    image: StoredImage,
    nextMode: ImageMode,
  ) => void;
  onRetryTurn: (
    conversationId: string,
    turn: ImageConversationTurn,
  ) => Promise<void>;
  onRerunTurn: (
    conversationId: string,
    turn: ImageConversationTurn,
  ) => Promise<void>;
};

export function ConversationTurns({
  conversationId,
  turns,
  modeLabelMap,
  activeRequest,
  isSubmitting,
  processingStatus,
  waitingDots,
  submitElapsedSeconds,
  formatConversationTime,
  formatProcessingDuration,
  onOpenSelectionEditor,
  onSeedFromResult,
  onRetryTurn,
  onRerunTurn,
}: ConversationTurnsProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 py-8 sm:px-6">
      {turns.map((turn) => {
        const systemPrompt = turn.systemPrompt?.trim() ?? "";
        const turnProcessing = Boolean(
          isSubmitting &&
          activeRequest &&
          activeRequest.conversationId === conversationId &&
          activeRequest.turnId === turn.id,
        );

        return (
          <div key={turn.id} className="space-y-4">
            <div className="flex justify-end">
              <div className="flex w-full max-w-[78%] flex-col items-end gap-4">
                {turn.sourceImages && turn.sourceImages.length > 0 ? (
                  <div className="flex flex-wrap justify-end gap-2.5">
                    {turn.sourceImages.map((source) => (
                      <div
                        key={source.id}
                        className="w-[136px] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
                      >
                        <div className="border-b border-stone-100 px-3 py-2 text-left text-[11px] font-medium text-stone-500">
                          {buildConversationSourceLabel(source)}
                        </div>
                        <Zoom>
                          <Image
                            src={source.dataUrl}
                            alt={source.name}
                            width={220}
                            height={160}
                            unoptimized
                            className="block h-24 w-full cursor-zoom-in bg-stone-50 object-contain"
                          />
                        </Zoom>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="group flex max-w-full flex-col items-end gap-1.5">
                  {systemPrompt ? (
                    <div className="mb-2 w-full max-w-full self-stretch rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-left shadow-sm">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-amber-900">
                          系统提示词
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void copyPromptToClipboard(systemPrompt)
                          }
                          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-amber-200 bg-white/80 px-2 text-[11px] font-medium text-amber-700 transition hover:bg-white hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                          title="复制系统提示词"
                          aria-label="复制系统提示词"
                        >
                          <Copy className="size-3" />
                          复制
                        </button>
                      </div>
                      <div className="whitespace-pre-wrap break-words text-[13px] leading-6 text-amber-950/85">
                        {systemPrompt}
                      </div>
                    </div>
                  ) : null}
                  <div className="min-w-0 self-end whitespace-pre-wrap break-words rounded-xl bg-[#f2f2f1] px-4 py-3 text-[15px] leading-7 text-stone-800">
                    {turn.prompt || "无额外提示词"}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void copyPromptToClipboard(turn.prompt || "")
                    }
                    className="inline-flex h-7 shrink-0 items-center gap-1 self-end rounded-md border border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-500 opacity-0 shadow-sm transition hover:bg-stone-100 hover:text-stone-900 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
                    title="复制提示词"
                    aria-label="复制提示词"
                  >
                    <Copy className="size-3.5" />
                    复制
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <span className="flex size-9 items-center justify-center rounded-lg bg-stone-950 text-white">
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold tracking-tight text-stone-900">
                    ChatGPT Image Studio
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-stone-500">
                <span className="rounded-md bg-stone-100 px-2.5 py-1">
                  {modeLabelMap[turn.mode]}
                </span>
                <span className="rounded-md bg-stone-100 px-2.5 py-1">
                  {turn.model}
                </span>
                <span className="rounded-md bg-stone-100 px-2.5 py-1">
                  {turn.count} 张
                </span>
                {turn.size ? (
                  <span className="rounded-md bg-stone-100 px-2.5 py-1">
                    {formatTurnSizeLabel(turn.size)}
                  </span>
                ) : null}
                {turn.quality ? (
                  <span className="rounded-md bg-stone-100 px-2.5 py-1">
                    Quality {turn.quality}
                  </span>
                ) : null}
                {turn.scale ? (
                  <span className="rounded-md bg-stone-100 px-2.5 py-1">
                    {turn.scale}
                  </span>
                ) : null}
                <span className="rounded-md bg-stone-100 px-2.5 py-1">
                  <Clock3 className="mr-1 inline size-3.5" />
                  {formatConversationTime(turn.createdAt)}
                </span>
              </div>

              {turn.images.length > 0 ? (
                <div
                  className={cn(
                    "grid gap-4",
                    turn.images.length === 1
                      ? "grid-cols-1"
                      : "grid-cols-1 lg:grid-cols-2",
                  )}
                >
                  {turn.images.map((image, index) => {
                    const imageDataUrl = buildImageDataUrl(image);
                    const downloadName = buildDownloadName(
                      turn.createdAt,
                      turn.id,
                      index,
                    );

                    return (
                      <div
                        key={image.id}
                        className={cn(
                          "group relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm",
                          turn.images.length === 1 &&
                            "w-fit max-w-full justify-self-start",
                        )}
                      >
                        {image.status === "success" && image.b64_json ? (
                          <div>
                            <Zoom>
                              <Image
                                src={imageDataUrl}
                                alt={`Generated result ${index + 1}`}
                                width={1024}
                                height={1024}
                                unoptimized
                                className="block h-auto max-h-[60vh] w-auto max-w-full object-contain cursor-zoom-in"
                              />
                            </Zoom>
                            <div className="absolute bottom-2 right-2 flex flex-wrap items-center gap-1 rounded-lg bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                className="inline-flex size-8 items-center justify-center rounded-md text-white/90 transition hover:bg-white/20 hover:text-white"
                                onClick={() =>
                                  onOpenSelectionEditor(
                                    conversationId,
                                    turn.id,
                                    image,
                                    downloadName,
                                  )
                                }
                                title="选区"
                                aria-label="选区"
                              >
                                <Brush className="size-4" />
                              </button>
                              <button
                                type="button"
                                className="inline-flex size-8 items-center justify-center rounded-md text-white/90 transition hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() =>
                                  void onRerunTurn(conversationId, turn)
                                }
                                disabled={isSubmitting}
                                title={isSubmitting ? "处理中" : "重试"}
                                aria-label="重试"
                              >
                                <RotateCcw className="size-4" />
                              </button>
                              <button
                                type="button"
                                className="inline-flex size-8 items-center justify-center rounded-md text-white/90 transition hover:bg-white/20 hover:text-white"
                                onClick={() =>
                                  onSeedFromResult(
                                    conversationId,
                                    image,
                                    "edit",
                                  )
                                }
                                title="引用"
                                aria-label="引用"
                              >
                                <Copy className="size-4" />
                              </button>
                              <button
                                type="button"
                                className="inline-flex size-8 items-center justify-center rounded-md text-white/90 transition hover:bg-white/20 hover:text-white"
                                onClick={() =>
                                  onSeedFromResult(
                                    conversationId,
                                    image,
                                    "upscale",
                                  )
                                }
                                title="放大"
                                aria-label="放大"
                              >
                                <ZoomIn className="size-4" />
                              </button>
                              <a
                                href={imageDataUrl}
                                download={downloadName}
                                className="inline-flex size-8 items-center justify-center rounded-md text-white/90 transition hover:bg-white/20 hover:text-white"
                                title="下载"
                                aria-label="下载"
                              >
                                <Download className="size-4" />
                              </a>
                            </div>
                          </div>
                        ) : image.status === "error" ? (
                          <div className="flex min-h-[320px] flex-col">
                            <div className="flex flex-1 items-center justify-center whitespace-pre-line bg-rose-50 px-6 py-8 text-center text-sm leading-7 text-rose-600">
                              {formatImageErrorMessage(
                                image.error || "处理失败",
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 px-4 py-3">
                              <button
                                type="button"
                                className="inline-flex size-8 items-center justify-center rounded-md border border-stone-200 bg-white text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() =>
                                  void onRetryTurn(conversationId, turn)
                                }
                                disabled={isSubmitting}
                                title={isSubmitting ? "处理中" : "重试"}
                                aria-label="重试"
                              >
                                <RotateCcw className="size-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 bg-stone-50 px-6 py-8 text-center text-stone-500">
                            <div className="rounded-lg bg-white p-2.5 shadow-sm">
                              <LoaderCircle className="size-5 animate-spin" />
                            </div>
                            <p className="text-sm font-medium text-stone-700">
                              {turnProcessing && processingStatus
                                ? `${processingStatus.title}${waitingDots}`
                                : "正在处理图片..."}
                            </p>
                            <p className="text-xs leading-6 text-stone-400">
                              {turnProcessing && processingStatus
                                ? `${processingStatus.detail} · 已等待 ${formatProcessingDuration(submitElapsedSeconds)}`
                                : "图片处理通常需要几十秒，请稍候"}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
