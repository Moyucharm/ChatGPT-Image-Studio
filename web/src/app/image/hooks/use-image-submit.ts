"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import {
  createImageGenerationTask,
  editImage,
  fetchImageGenerationTask,
  upscaleImage,
  type ImageGenerationTask,
  type ImageModel,
  type ImageQuality,
  type ImageRoutePreference,
} from "@/lib/api";
import {
  finishImageTask,
  listActiveImageTasks,
  startImageTask,
  updateImageTaskStatus,
} from "@/store/image-active-tasks";
import type {
  ImageConversation,
  ImageConversationTurn,
  ImageMode,
  StoredImage,
  StoredSourceImage,
} from "@/store/image-conversations";

import type { EditorTarget } from "./use-image-source-inputs";
import {
  buildConversationTitle,
  buildInpaintSourceReference,
  countFailures,
  createConversationTurn,
  createLoadingImages,
  dataUrlToFile,
  formatImageError,
  mergeResultImages,
  shouldFallbackSelectionEdit,
} from "../submit-utils";

type ActiveRequestState = {
  conversationId: string;
  turnId: string;
  mode: ImageMode;
  count: number;
  variant: "standard" | "selection-edit";
};

const imageGenerationTaskPollIntervalMs = 2500;
const imageGenerationTaskMaxWaitMs = 15 * 60 * 1000;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function generateImageViaTask(
  prompt: string,
  options: {
    model: ImageModel;
    count: number;
    size?: string;
    quality: ImageQuality;
    imageRoute: ImageRoutePreference;
    systemPrompt?: string;
    onTaskCreated?: (task: ImageGenerationTask) => Promise<void> | void;
    onTaskUpdated?: (task: ImageGenerationTask) => Promise<void> | void;
  },
) {
  const created = await createImageGenerationTask(prompt, options);
  let task = created.task;
  if (task.id) {
    await options.onTaskCreated?.(task);
  }
  const startedAt = Date.now();

  while (task.status === "queued" || task.status === "running") {
    if (Date.now() - startedAt > imageGenerationTaskMaxWaitMs) {
      throw new Error(
        "图片生成任务等待超时，请稍后在历史记录中查看或降低分辨率后重试",
      );
    }
    await wait(imageGenerationTaskPollIntervalMs);
    task = (await fetchImageGenerationTask(task.id)).task;
    await options.onTaskUpdated?.(task);
  }

  if (task.status === "failed") {
    throw new Error(task.error || "图片生成失败");
  }
  if (!task.result) {
    throw new Error("图片生成任务没有返回结果");
  }
  return task.result;
}

function syncSubmissionStateAfterFinish(
  setIsSubmitting: (value: boolean) => void,
  setActiveRequest: (value: ActiveRequestState | null) => void,
  setSubmitStartedAt: (value: number | null) => void,
) {
  const nextTask = listActiveImageTasks()[0] ?? null;
  setIsSubmitting(Boolean(nextTask));
  setActiveRequest(
    nextTask
      ? {
          conversationId: nextTask.conversationId,
          turnId: nextTask.turnId,
          mode: nextTask.mode,
          count: nextTask.count,
          variant: nextTask.variant,
        }
      : null,
  );
  setSubmitStartedAt(nextTask?.startedAt ?? null);
}

function normalizeActiveTaskStatus(status: ImageGenerationTask["status"]) {
  return status === "queued" || status === "running" ? status : undefined;
}

type UseImageSubmitOptions = {
  mode: ImageMode;
  imagePrompt: string;
  systemPrompt: string;
  imageModel: ImageModel;
  imageSources: StoredSourceImage[];
  maskSource: StoredSourceImage | null;
  sourceImages: StoredSourceImage[];
  parsedCount: number;
  imageSize: string;
  imageQuality: ImageQuality;
  imageRoutePreference: ImageRoutePreference;
  upscaleScale: string;
  selectedConversationId: string | null;
  editorTarget: EditorTarget | null;
  makeId: () => string;
  focusConversation: (conversationId: string) => void;
  closeSelectionEditor: () => void;
  setImagePrompt: (value: string) => void;
  setSystemPrompt: (value: string) => void;
  setSourceImages: (value: StoredSourceImage[]) => void;
  setIsSubmitting: (value: boolean) => void;
  setActiveRequest: (value: ActiveRequestState | null) => void;
  setSubmitElapsedSeconds: (value: number) => void;
  setSubmitStartedAt: (value: number | null) => void;
  persistConversation: (conversation: ImageConversation) => Promise<void>;
  updateConversation: (
    conversationId: string,
    updater: (current: ImageConversation | null) => ImageConversation,
  ) => Promise<void>;
  resetComposer: (nextMode?: ImageMode) => void;
};

function buildConversationBase(
  conversationId: string,
  draftTurn: ImageConversationTurn,
): ImageConversation {
  return {
    id: conversationId,
    title: draftTurn.title,
    mode: draftTurn.mode,
    prompt: draftTurn.prompt,
    systemPrompt: draftTurn.systemPrompt,
    model: draftTurn.model,
    count: draftTurn.count,
    size: draftTurn.size,
    quality: draftTurn.quality,
    scale: draftTurn.scale,
    imageRoute: draftTurn.imageRoute,
    sourceImages: draftTurn.sourceImages,
    images: draftTurn.images,
    createdAt: draftTurn.createdAt,
    status: draftTurn.status,
    error: draftTurn.error,
    turns: [draftTurn],
  };
}

export function useImageSubmit({
  mode,
  imagePrompt,
  systemPrompt,
  imageModel,
  imageSources,
  maskSource,
  sourceImages,
  parsedCount,
  imageSize,
  imageQuality,
  imageRoutePreference,
  upscaleScale,
  selectedConversationId,
  editorTarget,
  makeId,
  focusConversation,
  closeSelectionEditor,
  setImagePrompt,
  setSystemPrompt,
  setSourceImages,
  setIsSubmitting,
  setActiveRequest,
  setSubmitElapsedSeconds,
  setSubmitStartedAt,
  persistConversation,
  updateConversation,
  resetComposer,
}: UseImageSubmitOptions) {
  const handleSelectionEditSubmit = useCallback(
    async ({
      prompt,
      mask,
    }: {
      prompt: string;
      mask: {
        file: File;
        previewDataUrl: string;
      };
    }) => {
      if (!editorTarget) {
        return;
      }

      const sourceReference = buildInpaintSourceReference(editorTarget.image);
      const conversationId = editorTarget.conversationId;
      const turnId = makeId();
      const now = new Date().toISOString();
      const draftTurn = createConversationTurn({
        turnId,
        title: buildConversationTitle("edit", prompt, upscaleScale),
        mode: "edit",
        prompt,
        model: imageModel,
        count: 1,
        imageRoute: imageRoutePreference,
        sourceImages: [
          {
            id: makeId(),
            role: "image",
            name: editorTarget.imageName,
            dataUrl: editorTarget.sourceDataUrl,
          },
          {
            id: makeId(),
            role: "mask",
            name: "mask.png",
            dataUrl: mask.previewDataUrl,
          },
        ],
        images: createLoadingImages(1, turnId),
        createdAt: now,
        status: "generating",
      });

      const startedAt = Date.now();
      setIsSubmitting(true);
      setActiveRequest({
        conversationId,
        turnId,
        mode: "edit",
        count: 1,
        variant: "selection-edit",
      });
      setSubmitElapsedSeconds(0);
      setSubmitStartedAt(startedAt);
      focusConversation(conversationId);
      setImagePrompt("");
      setSourceImages([]);
      closeSelectionEditor();
      try {
        await updateConversation(conversationId, (current) => {
          if (!current) {
            return buildConversationBase(conversationId, draftTurn);
          }
          return {
            ...current,
            turns: [...(current.turns ?? []), draftTurn],
          };
        });

        startImageTask({
          conversationId,
          turnId,
          mode: "edit",
          count: 1,
          variant: "selection-edit",
          startedAt,
        });

        let fallbackImageFile = sourceReference
          ? null
          : await dataUrlToFile(
              editorTarget.sourceDataUrl,
              editorTarget.imageName || "source.png",
            );
        let data;
        try {
          data = await editImage({
            prompt,
            images: fallbackImageFile ? [fallbackImageFile] : [],
            mask: mask.file,
            sourceReference,
            model: imageModel,
            imageRoute: imageRoutePreference,
          });
        } catch (error) {
          if (!sourceReference || !shouldFallbackSelectionEdit(error)) {
            throw error;
          }
          fallbackImageFile =
            fallbackImageFile ??
            (await dataUrlToFile(
              editorTarget.sourceDataUrl,
              editorTarget.imageName || "source.png",
            ));
          data = await editImage({
            prompt,
            images: [fallbackImageFile],
            mask: mask.file,
            model: imageModel,
            imageRoute: imageRoutePreference,
          });
        }
        const resultItems = mergeResultImages(turnId, data.data || [], 1);
        const failedCount = countFailures(resultItems);

        await updateConversation(conversationId, (current) => ({
          ...(current ?? buildConversationBase(conversationId, draftTurn)),
          turns: (current?.turns ?? [draftTurn]).map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  images: resultItems,
                  status: failedCount > 0 ? "error" : "success",
                  error:
                    failedCount > 0
                      ? `其中 ${failedCount} 张处理失败`
                      : undefined,
                }
              : turn,
          ),
        }));

        if (failedCount > 0) {
          toast.error(`已返回结果，但有 ${failedCount} 张处理失败`);
        } else {
          toast.success("图片已按选区编辑");
        }
      } catch (error) {
        const message = formatImageError(error);
        await updateConversation(conversationId, (current) => ({
          ...(current ?? buildConversationBase(conversationId, draftTurn)),
          turns: (current?.turns ?? [draftTurn]).map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: "error",
                  error: message,
                  images: turn.images.map((image) => ({
                    ...image,
                    status: "error" as const,
                    error: message,
                  })),
                }
              : turn,
          ),
        }));
        toast.error(message);
      } finally {
        finishImageTask(conversationId, turnId);
        syncSubmissionStateAfterFinish(
          setIsSubmitting,
          setActiveRequest,
          setSubmitStartedAt,
        );
      }
    },
    [
      closeSelectionEditor,
      editorTarget,
      focusConversation,
      imageModel,
      imageRoutePreference,
      makeId,
      setActiveRequest,
      setImagePrompt,
      setIsSubmitting,
      setSourceImages,
      setSubmitElapsedSeconds,
      setSubmitStartedAt,
      updateConversation,
      upscaleScale,
    ],
  );

  const handleRetryTurn = useCallback(
    async (conversationId: string, turn: ImageConversationTurn) => {
      const prompt = turn.prompt?.trim() ?? "";
      const turnMode = turn.mode || "generate";
      const turnSourceImages = Array.isArray(turn.sourceImages)
        ? turn.sourceImages
        : [];
      const turnImageSources = turnSourceImages.filter(
        (item) => item.role === "image",
      );
      const turnMaskSource =
        turnSourceImages.find((item) => item.role === "mask") ?? null;
      const turnScale = turnMode === "upscale" ? turn.scale || "2x" : undefined;
      const turnQuality = turn.quality || "high";
      const turnImageRoute = turn.imageRoute || "auto";
      const expectedCount = Math.max(1, turn.count || 1);

      if (turnMode === "generate" && !prompt) {
        toast.error("该记录缺少提示词，无法重试");
        return;
      }
      if (
        (turnMode === "edit" || turnMode === "upscale") &&
        turnImageSources.length === 0
      ) {
        toast.error("该记录缺少源图，无法重试");
        return;
      }

      const turnId = turn.id;
      const now = new Date().toISOString();
      const draftTurn = createConversationTurn({
        turnId,
        title: buildConversationTitle(
          turnMode,
          prompt,
          turnScale || upscaleScale,
        ),
        mode: turnMode,
        prompt,
        systemPrompt: turn.systemPrompt,
        model: turn.model,
        count: expectedCount,
        size: turn.size,
        quality:
          turnMode === "generate" && turnImageSources.length === 0
            ? turnQuality
            : undefined,
        scale: turnScale,
        imageRoute: turnImageRoute,
        sourceImages: turnSourceImages,
        images: createLoadingImages(expectedCount, turnId),
        createdAt: now,
        status: "generating",
      });

      const startedAt = Date.now();
      setIsSubmitting(true);
      setActiveRequest({
        conversationId,
        turnId,
        mode: turnMode,
        count: expectedCount,
        variant: "standard",
      });
      setSubmitElapsedSeconds(0);
      setSubmitStartedAt(startedAt);
      focusConversation(conversationId);
      try {
        await updateConversation(conversationId, (current) => ({
          ...(current ?? buildConversationBase(conversationId, draftTurn)),
          turns: current?.turns?.map((item) =>
            item.id === turnId ? draftTurn : item,
          ) ?? [draftTurn],
        }));

        startImageTask({
          conversationId,
          turnId,
          mode: turnMode,
          count: expectedCount,
          variant: "standard",
          startedAt,
        });

        let resultItems: StoredImage[] = [];
        if (turnMode === "generate") {
          if (turnImageSources.length > 0) {
            const files = await Promise.all(
              turnImageSources.map((item, index) =>
                dataUrlToFile(
                  item.dataUrl,
                  item.name || `reference-${index + 1}.png`,
                ),
              ),
            );
            const data = await editImage({
              prompt,
              images: files,
              size: turn.size,
              model: turn.model,
              imageRoute: turnImageRoute,
              systemPrompt: turn.systemPrompt,
            });
            resultItems = mergeResultImages(turnId, data.data || [], 1);
          } else {
            const data = await generateImageViaTask(prompt, {
              model: turn.model,
              count: expectedCount,
              size: turn.size,
              quality: turnQuality,
              imageRoute: turnImageRoute,
              systemPrompt: turn.systemPrompt,
              onTaskCreated: async (task) => {
                startImageTask({
                  conversationId,
                  turnId,
                  mode: turnMode,
                  count: expectedCount,
                  variant: "standard",
                  startedAt,
                  taskId: task.id,
                });
                await updateConversation(conversationId, (current) => ({
                  ...(current ??
                    buildConversationBase(conversationId, draftTurn)),
                  turns: (current?.turns ?? [draftTurn]).map((item) =>
                    item.id === turnId ? { ...item, taskId: task.id } : item,
                  ),
                }));
              },
              onTaskUpdated: async (task) => {
                updateImageTaskStatus(
                  conversationId,
                  turnId,
                  normalizeActiveTaskStatus(task.status),
                  task.id,
                );
              },
            });
            resultItems = mergeResultImages(
              turnId,
              data.data || [],
              expectedCount,
            );
          }
        }

        if (turnMode === "edit") {
          const files = await Promise.all(
            turnImageSources.map((item, index) =>
              dataUrlToFile(
                item.dataUrl,
                item.name || `image-${index + 1}.png`,
              ),
            ),
          );
          const mask = turnMaskSource
            ? await dataUrlToFile(
                turnMaskSource.dataUrl,
                turnMaskSource.name || "mask.png",
              )
            : null;
          const data = await editImage({
            prompt,
            images: files,
            mask,
            size: turn.size,
            model: turn.model,
            imageRoute: turnImageRoute,
            systemPrompt: turn.systemPrompt,
          });
          resultItems = mergeResultImages(turnId, data.data || [], 1);
        }

        if (turnMode === "upscale") {
          const file = await dataUrlToFile(
            turnImageSources[0].dataUrl,
            turnImageSources[0].name || "upscale.png",
          );
          const data = await upscaleImage({
            image: file,
            prompt,
            scale: turnScale || "2x",
            model: turn.model,
            imageRoute: turnImageRoute,
            systemPrompt: turn.systemPrompt,
          });
          resultItems = mergeResultImages(turnId, data.data || [], 1);
        }

        const failedCount = countFailures(resultItems);
        await updateConversation(conversationId, (current) => ({
          ...(current ?? buildConversationBase(conversationId, draftTurn)),
          turns: (current?.turns ?? [draftTurn]).map((item) =>
            item.id === turnId
              ? {
                  ...item,
                  images: resultItems,
                  status: failedCount > 0 ? "error" : "success",
                  error:
                    failedCount > 0
                      ? `其中 ${failedCount} 张处理失败`
                      : undefined,
                }
              : item,
          ),
        }));

        if (failedCount > 0) {
          toast.error(`已返回结果，但有 ${failedCount} 张处理失败`);
        } else {
          toast.success(
            turnMode === "generate"
              ? "图片已生成"
              : turnMode === "edit"
                ? "图片已编辑"
                : "图片已放大",
          );
        }
      } catch (error) {
        const message = formatImageError(error);
        await updateConversation(conversationId, (current) => ({
          ...(current ?? buildConversationBase(conversationId, draftTurn)),
          turns: (current?.turns ?? [draftTurn]).map((item) =>
            item.id === turnId
              ? {
                  ...item,
                  status: "error",
                  error: message,
                  images: item.images.map((image) => ({
                    ...image,
                    status: "error" as const,
                    error: message,
                  })),
                }
              : item,
          ),
        }));
        toast.error(message);
      } finally {
        finishImageTask(conversationId, turnId);
        syncSubmissionStateAfterFinish(
          setIsSubmitting,
          setActiveRequest,
          setSubmitStartedAt,
        );
      }
    },
    [
      focusConversation,
      setActiveRequest,
      setIsSubmitting,
      setSubmitElapsedSeconds,
      setSubmitStartedAt,
      updateConversation,
      upscaleScale,
    ],
  );

  const handleRerunTurn = useCallback(
    async (conversationId: string, turn: ImageConversationTurn) => {
      const prompt = turn.prompt?.trim() ?? "";
      const turnMode = turn.mode || "generate";
      const turnSourceImages = Array.isArray(turn.sourceImages)
        ? turn.sourceImages
        : [];
      const turnImageSources = turnSourceImages.filter(
        (item) => item.role === "image",
      );
      const turnMaskSource =
        turnSourceImages.find((item) => item.role === "mask") ?? null;
      const turnScale = turnMode === "upscale" ? turn.scale || "2x" : undefined;
      const turnQuality = turn.quality || "high";
      const turnImageRoute = turn.imageRoute || "auto";
      const expectedCount = Math.max(1, turn.count || 1);

      if (turnMode === "generate" && !prompt) {
        toast.error("该记录缺少提示词，无法重试");
        return;
      }
      if (
        (turnMode === "edit" || turnMode === "upscale") &&
        turnImageSources.length === 0
      ) {
        toast.error("该记录缺少源图，无法重试");
        return;
      }

      const turnId = makeId();
      const now = new Date().toISOString();
      const draftTurn = createConversationTurn({
        turnId,
        title: buildConversationTitle(
          turnMode,
          prompt,
          turnScale || upscaleScale,
        ),
        mode: turnMode,
        prompt,
        systemPrompt: turn.systemPrompt,
        model: turn.model,
        count: expectedCount,
        size: turn.size,
        quality:
          turnMode === "generate" && turnImageSources.length === 0
            ? turnQuality
            : undefined,
        scale: turnScale,
        imageRoute: turnImageRoute,
        sourceImages: turnSourceImages,
        images: createLoadingImages(expectedCount, turnId),
        createdAt: now,
        status: "generating",
      });

      const startedAt = Date.now();
      setIsSubmitting(true);
      setActiveRequest({
        conversationId,
        turnId,
        mode: turnMode,
        count: expectedCount,
        variant: "standard",
      });
      setSubmitElapsedSeconds(0);
      setSubmitStartedAt(startedAt);
      focusConversation(conversationId);
      try {
        await updateConversation(conversationId, (current) => ({
          ...(current ?? buildConversationBase(conversationId, draftTurn)),
          turns: [...(current?.turns ?? []), draftTurn],
        }));

        startImageTask({
          conversationId,
          turnId,
          mode: turnMode,
          count: expectedCount,
          variant: "standard",
          startedAt,
        });

        let resultItems: StoredImage[] = [];
        if (turnMode === "generate") {
          if (turnImageSources.length > 0) {
            const files = await Promise.all(
              turnImageSources.map((item, index) =>
                dataUrlToFile(
                  item.dataUrl,
                  item.name || `reference-${index + 1}.png`,
                ),
              ),
            );
            const data = await editImage({
              prompt,
              images: files,
              size: turn.size,
              model: turn.model,
              imageRoute: turnImageRoute,
              systemPrompt: turn.systemPrompt,
            });
            resultItems = mergeResultImages(turnId, data.data || [], 1);
          } else {
            const data = await generateImageViaTask(prompt, {
              model: turn.model,
              count: expectedCount,
              size: turn.size,
              quality: turnQuality,
              imageRoute: turnImageRoute,
              systemPrompt: turn.systemPrompt,
              onTaskCreated: async (task) => {
                startImageTask({
                  conversationId,
                  turnId,
                  mode: turnMode,
                  count: expectedCount,
                  variant: "standard",
                  startedAt,
                  taskId: task.id,
                });
                await updateConversation(conversationId, (current) => ({
                  ...(current ??
                    buildConversationBase(conversationId, draftTurn)),
                  turns: (current?.turns ?? [draftTurn]).map((item) =>
                    item.id === turnId ? { ...item, taskId: task.id } : item,
                  ),
                }));
              },
              onTaskUpdated: async (task) => {
                updateImageTaskStatus(
                  conversationId,
                  turnId,
                  normalizeActiveTaskStatus(task.status),
                  task.id,
                );
              },
            });
            resultItems = mergeResultImages(
              turnId,
              data.data || [],
              expectedCount,
            );
          }
        }

        if (turnMode === "edit") {
          const files = await Promise.all(
            turnImageSources.map((item, index) =>
              dataUrlToFile(
                item.dataUrl,
                item.name || `image-${index + 1}.png`,
              ),
            ),
          );
          const mask = turnMaskSource
            ? await dataUrlToFile(
                turnMaskSource.dataUrl,
                turnMaskSource.name || "mask.png",
              )
            : null;
          const data = await editImage({
            prompt,
            images: files,
            mask,
            size: turn.size,
            model: turn.model,
            imageRoute: turnImageRoute,
            systemPrompt: turn.systemPrompt,
          });
          resultItems = mergeResultImages(turnId, data.data || [], 1);
        }

        if (turnMode === "upscale") {
          const file = await dataUrlToFile(
            turnImageSources[0].dataUrl,
            turnImageSources[0].name || "upscale.png",
          );
          const data = await upscaleImage({
            image: file,
            prompt,
            scale: turnScale || "2x",
            model: turn.model,
            imageRoute: turnImageRoute,
            systemPrompt: turn.systemPrompt,
          });
          resultItems = mergeResultImages(turnId, data.data || [], 1);
        }

        const failedCount = countFailures(resultItems);
        await updateConversation(conversationId, (current) => ({
          ...(current ?? buildConversationBase(conversationId, draftTurn)),
          turns: (current?.turns ?? [draftTurn]).map((item) =>
            item.id === turnId
              ? {
                  ...item,
                  images: resultItems,
                  status: failedCount > 0 ? "error" : "success",
                  error:
                    failedCount > 0
                      ? `其中 ${failedCount} 张处理失败`
                      : undefined,
                }
              : item,
          ),
        }));

        if (failedCount > 0) {
          toast.error(`已返回结果，但有 ${failedCount} 张处理失败`);
        } else {
          toast.success(
            turnMode === "generate"
              ? turnImageSources.length > 0
                ? "参考图生成已重新提交"
                : "图片已重新提交"
              : turnMode === "edit"
                ? "图片已重新编辑"
                : "图片已重新放大",
          );
        }
      } catch (error) {
        const message = formatImageError(error);
        await updateConversation(conversationId, (current) => ({
          ...(current ?? buildConversationBase(conversationId, draftTurn)),
          turns: (current?.turns ?? [draftTurn]).map((item) =>
            item.id === turnId
              ? {
                  ...item,
                  status: "error",
                  error: message,
                  images: item.images.map((image) => ({
                    ...image,
                    status: "error" as const,
                    error: message,
                  })),
                }
              : item,
          ),
        }));
        toast.error(message);
      } finally {
        finishImageTask(conversationId, turnId);
        syncSubmissionStateAfterFinish(
          setIsSubmitting,
          setActiveRequest,
          setSubmitStartedAt,
        );
      }
    },
    [
      focusConversation,
      makeId,
      setActiveRequest,
      setIsSubmitting,
      setSubmitElapsedSeconds,
      setSubmitStartedAt,
      updateConversation,
      upscaleScale,
    ],
  );

  const handleSubmit = useCallback(async () => {
    const prompt = imagePrompt.trim();
    const trimmedSystemPrompt = systemPrompt.trim();
    if (mode === "generate" && !prompt) {
      toast.error("请输入提示词");
      return;
    }
    if (mode === "edit" && imageSources.length === 0) {
      toast.error("编辑模式至少需要一张源图");
      return;
    }
    if (mode === "edit" && !prompt) {
      toast.error("编辑模式需要提示词");
      return;
    }
    if (mode === "upscale" && imageSources.length === 0) {
      toast.error("放大模式需要一张源图");
      return;
    }

    const conversationId = selectedConversationId ?? makeId();
    const turnId = makeId();
    const now = new Date().toISOString();
    const expectedCount =
      mode === "generate" && imageSources.length === 0 ? parsedCount : 1;
    const draftTurn = createConversationTurn({
      turnId,
      title: buildConversationTitle(mode, prompt, upscaleScale),
      mode,
      prompt,
      systemPrompt: trimmedSystemPrompt || undefined,
      model: imageModel,
      count: expectedCount,
      size: mode === "generate" || mode === "edit" ? imageSize : undefined,
      quality:
        mode === "generate" && imageSources.length === 0
          ? imageQuality
          : undefined,
      scale: mode === "upscale" ? upscaleScale : undefined,
      imageRoute: imageRoutePreference,
      sourceImages,
      images: createLoadingImages(expectedCount, turnId),
      createdAt: now,
      status: "generating",
    });

    const startedAt = Date.now();
    setIsSubmitting(true);
    setActiveRequest({
      conversationId,
      turnId,
      mode,
      count: expectedCount,
      variant: "standard",
    });
    setSubmitElapsedSeconds(0);
    setSubmitStartedAt(startedAt);
    focusConversation(conversationId);
    setImagePrompt("");
    setSystemPrompt("");
    setSourceImages([]);
    try {
      if (selectedConversationId) {
        await updateConversation(conversationId, (current) => ({
          ...(current ?? buildConversationBase(conversationId, draftTurn)),
          turns: [...(current?.turns ?? []), draftTurn],
        }));
      } else {
        await persistConversation(
          buildConversationBase(conversationId, draftTurn),
        );
      }

      startImageTask({
        conversationId,
        turnId,
        mode,
        count: expectedCount,
        variant: "standard",
        startedAt,
      });

      let resultItems: StoredImage[] = [];
      if (mode === "generate") {
        if (imageSources.length > 0) {
          const files = await Promise.all(
            imageSources.map((item, index) =>
              dataUrlToFile(
                item.dataUrl,
                item.name || `reference-${index + 1}.png`,
              ),
            ),
          );
          const data = await editImage({
            prompt,
            images: files,
            size: imageSize,
            model: imageModel,
            imageRoute: imageRoutePreference,
            systemPrompt: trimmedSystemPrompt,
          });
          resultItems = mergeResultImages(turnId, data.data || [], 1);
        } else {
          const data = await generateImageViaTask(prompt, {
            model: imageModel,
            count: parsedCount,
            size: imageSize,
            quality: imageQuality,
            imageRoute: imageRoutePreference,
            systemPrompt: trimmedSystemPrompt,
            onTaskCreated: async (task) => {
              startImageTask({
                conversationId,
                turnId,
                mode,
                count: expectedCount,
                variant: "standard",
                startedAt,
                taskId: task.id,
              });
              await updateConversation(conversationId, (current) => ({
                ...(current ??
                  buildConversationBase(conversationId, draftTurn)),
                turns: (current?.turns ?? [draftTurn]).map((turn) =>
                  turn.id === turnId ? { ...turn, taskId: task.id } : turn,
                ),
              }));
            },
            onTaskUpdated: async (task) => {
              updateImageTaskStatus(
                conversationId,
                turnId,
                normalizeActiveTaskStatus(task.status),
                task.id,
              );
            },
          });
          resultItems = mergeResultImages(turnId, data.data || [], parsedCount);
        }
      }

      if (mode === "edit") {
        const files = await Promise.all(
          imageSources.map((item, index) =>
            dataUrlToFile(item.dataUrl, item.name || `image-${index + 1}.png`),
          ),
        );
        const mask = maskSource
          ? await dataUrlToFile(
              maskSource.dataUrl,
              maskSource.name || "mask.png",
            )
          : null;
        const data = await editImage({
          prompt,
          images: files,
          mask,
          size: imageSize,
          model: imageModel,
          imageRoute: imageRoutePreference,
          systemPrompt: trimmedSystemPrompt,
        });
        resultItems = mergeResultImages(turnId, data.data || [], 1);
      }

      if (mode === "upscale") {
        const file = await dataUrlToFile(
          imageSources[0].dataUrl,
          imageSources[0].name || "upscale.png",
        );
        const data = await upscaleImage({
          image: file,
          prompt,
          scale: upscaleScale,
          model: imageModel,
          imageRoute: imageRoutePreference,
          systemPrompt: trimmedSystemPrompt,
        });
        resultItems = mergeResultImages(turnId, data.data || [], 1);
      }

      const failedCount = countFailures(resultItems);
      await updateConversation(conversationId, (current) => ({
        ...(current ?? buildConversationBase(conversationId, draftTurn)),
        turns: (current?.turns ?? [draftTurn]).map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                images: resultItems,
                status: failedCount > 0 ? "error" : "success",
                error:
                  failedCount > 0
                    ? `其中 ${failedCount} 张处理失败`
                    : undefined,
              }
            : turn,
        ),
      }));

      resetComposer(mode === "generate" ? "generate" : mode);
      if (failedCount > 0) {
        toast.error(`已返回结果，但有 ${failedCount} 张处理失败`);
      } else {
        toast.success(
          mode === "generate"
            ? imageSources.length > 0
              ? "参考图生成已完成"
              : "图片已生成"
            : mode === "edit"
              ? "图片已编辑"
              : "图片已放大",
        );
      }
    } catch (error) {
      const message = formatImageError(error);
      await updateConversation(conversationId, (current) => ({
        ...(current ?? buildConversationBase(conversationId, draftTurn)),
        turns: (current?.turns ?? [draftTurn]).map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                status: "error",
                error: message,
                images: turn.images.map((image) => ({
                  ...image,
                  status: "error" as const,
                  error: message,
                })),
              }
            : turn,
        ),
      }));
      toast.error(message);
    } finally {
      finishImageTask(conversationId, turnId);
      syncSubmissionStateAfterFinish(
        setIsSubmitting,
        setActiveRequest,
        setSubmitStartedAt,
      );
    }
  }, [
    focusConversation,
    imageModel,
    imagePrompt,
    imageRoutePreference,
    imageSources,
    systemPrompt,
    makeId,
    maskSource,
    mode,
    imageSize,
    imageQuality,
    parsedCount,
    persistConversation,
    resetComposer,
    selectedConversationId,
    setActiveRequest,
    setImagePrompt,
    setSystemPrompt,
    setIsSubmitting,
    setSourceImages,
    setSubmitElapsedSeconds,
    setSubmitStartedAt,
    sourceImages,
    updateConversation,
    upscaleScale,
  ]);

  return {
    handleSelectionEditSubmit,
    handleRerunTurn,
    handleRetryTurn,
    handleSubmit,
  };
}
