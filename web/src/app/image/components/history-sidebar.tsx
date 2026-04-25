"use client";

import { History, LoaderCircle, MessageSquarePlus, PanelLeftClose, Trash2 } from "lucide-react";

import { AppImage as Image } from "@/components/app-image";
import { Button } from "@/components/ui/button";
import type { ImageConversation, ImageMode } from "@/store/image-conversations";
import { cn } from "@/lib/utils";

type HistorySidebarProps = {
  conversations: ImageConversation[];
  selectedConversationId: string | null;
  isLoadingHistory: boolean;
  hasActiveTasks: boolean;
  activeConversationIds: Set<string>;
  modeLabelMap: Record<ImageMode, string>;
  buildConversationPreviewSource: (conversation: ImageConversation) => string;
  formatConversationTime: (value: string) => string;
  onCreateDraft: () => void;
  onClearHistory: () => Promise<void>;
  onFocusConversation: (id: string) => void;
  onDeleteConversation: (id: string) => Promise<void>;
  onCloseHistory: () => void;
};

export function HistorySidebar({
  conversations,
  selectedConversationId,
  isLoadingHistory,
  hasActiveTasks,
  activeConversationIds,
  modeLabelMap,
  buildConversationPreviewSource,
  formatConversationTime,
  onCreateDraft,
  onClearHistory,
  onFocusConversation,
  onDeleteConversation,
  onCloseHistory,
}: HistorySidebarProps) {
  return (
    <aside className="order-2 max-h-[36vh] overflow-hidden rounded-xl border border-stone-200 bg-[#f8f8f7] shadow-sm lg:order-none lg:max-h-none lg:min-h-0">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-stone-200/80 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:bg-stone-50 hover:text-stone-900"
                onClick={onCloseHistory}
                title="收起历史面板"
              >
                <PanelLeftClose className="size-4" />
              </button>
              <h2 className="text-base font-semibold tracking-tight text-stone-900">历史记录</h2>
            </div>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-stone-400 border border-stone-100 shadow-sm">
              {conversations.length}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button className="h-9 flex-1 rounded-lg bg-stone-950 text-[13px] text-white hover:bg-stone-800" onClick={onCreateDraft}>
              <MessageSquarePlus className="mr-1.5 size-4" />
              新建对话
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-lg border-stone-200 bg-white px-2.5 text-stone-500 hover:bg-stone-50"
              onClick={() => void onClearHistory()}
              disabled={conversations.length === 0 || hasActiveTasks}
              title={hasActiveTasks ? "有任务运行中时不能清空历史" : "清空历史记录"}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {isLoadingHistory ? (
            <div className="flex items-center gap-2 rounded-lg px-3 py-3 text-sm text-stone-500">
              <LoaderCircle className="size-4 animate-spin" />
              正在读取会话记录
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-3 py-4 text-sm leading-6 text-stone-500">
              还没有历史记录。创建第一条图片任务后，会在这里保留缩略图和提示词摘要。
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => {
                const active = conversation.id === selectedConversationId;
                const isDeletingDisabled = activeConversationIds.has(conversation.id);
                const previewSrc = buildConversationPreviewSource(conversation);
                return (
                  <div
                    key={conversation.id}
                    className={cn(
                      "group rounded-xl border p-1.5 transition",
                      active
                        ? "border-stone-200 bg-white shadow-sm"
                        : "border-transparent bg-transparent hover:border-stone-200/80 hover:bg-white/70",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-stone-100 bg-stone-50"
                        onClick={() => onFocusConversation(conversation.id)}
                      >
                        <Image
                          src={previewSrc}
                          alt={conversation.title}
                          width={48}
                          height={48}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="block w-full text-left"
                          onClick={() => onFocusConversation(conversation.id)}
                        >
                          <div className="truncate text-[13px] font-medium text-stone-900">
                            {conversation.title || "未命名会话"}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
                            <span>{modeLabelMap[conversation.mode]}</span>
                            <span>•</span>
                            <span>{formatConversationTime(conversation.createdAt)}</span>
                          </div>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onDeleteConversation(conversation.id)}
                        disabled={isDeletingDisabled}
                        title={isDeletingDisabled ? "当前会话仍在处理中，暂时不能删除" : "删除会话"}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-400 opacity-100 transition hover:bg-stone-100 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-stone-400 lg:opacity-0 lg:group-hover:opacity-100 lg:disabled:opacity-40"
                        aria-label="删除会话"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
