import type {
  ImageConversation,
  StoredImage,
  StoredSourceImage,
} from "@/store/image-conversations";

export function buildImageDataUrl(image: StoredImage) {
  if (!image.b64_json) {
    return "";
  }
  return `data:image/png;base64,${image.b64_json}`;
}

export function buildConversationSourceLabel(source: StoredSourceImage) {
  return source.role === "mask" ? "选区 / 遮罩" : "源图";
}

export function buildConversationPreviewSource(
  conversation: ImageConversation,
) {
  const turns = Array.isArray(conversation.turns) ? conversation.turns : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const image = turns[index].images.find(
      (item) => item.status === "success" && item.b64_json,
    );
    if (image) {
      return buildImageDataUrl(image);
    }
  }

  const latestSuccessfulImage = conversation.images.find(
    (image) => image.status === "success" && image.b64_json,
  );
  if (latestSuccessfulImage) {
    return buildImageDataUrl(latestSuccessfulImage);
  }
  return "";
}
