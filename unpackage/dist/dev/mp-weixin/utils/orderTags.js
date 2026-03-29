"use strict";
const TAG_LIBRARY = [
  {
    key: "urgent",
    text: "加急",
    icon: "⚡",
    type: "urgent",
    match: ({ content, rawValue }) => Boolean(content == null ? void 0 : content.isUrgent) || /加急/.test(rawValue || "")
  },
  {
    key: "delivery",
    text: "送货上门",
    icon: "🏠",
    type: "delivery",
    match: ({ content, rawValue }) => Boolean(content == null ? void 0 : content.isDelivery) || /送货上门/.test(rawValue || "")
  },
  {
    key: "male-only",
    text: "限男骑手",
    icon: "♂",
    type: "info",
    match: ({ content, requiredGender, rawValue }) => requiredGender === "male" || /限男|男生宿舍/.test(rawValue || "")
  },
  {
    key: "female-only",
    text: "限女骑手",
    icon: "♀",
    type: "info",
    match: ({ content, requiredGender, rawValue }) => requiredGender === "female" || /限女|女生宿舍/.test(rawValue || "")
  },
  {
    key: "photo-feedback",
    text: "待重传送达图",
    icon: "⚠",
    type: "urgent",
    match: ({ content }) => Boolean(content == null ? void 0 : content.pending_redelivery_upload)
  }
];
function resolveDormSuffix(content = {}) {
  const dorm = content.dormNumber || content.dorm || "";
  return dorm ? ` · ${dorm}` : "";
}
function ensureArray(value) {
  if (!value)
    return [];
  if (Array.isArray(value))
    return value;
  return [value];
}
function buildVisualTags({ rawTags, content, requiredGender } = {}) {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  const normalizedContent = content || {};
  const normalizedRaw = ensureArray(rawTags).map((tag) => typeof tag === "string" ? tag.trim() : "").filter(Boolean);
  const pushTag = ({ key, text, icon = "", type = "neutral", suffix = "" }) => {
    if (!text || seen.has(key + suffix))
      return;
    seen.add(key + suffix);
    result.push({ key, text: `${text}${suffix}`, icon, type });
  };
  TAG_LIBRARY.forEach((tagDef) => {
    const matched = tagDef.match({ content: normalizedContent, requiredGender, rawValue: normalizedRaw.join(",") });
    if (matched) {
      const suffix = tagDef.key === "delivery" ? resolveDormSuffix(normalizedContent) : "";
      pushTag({ ...tagDef, suffix });
    }
  });
  normalizedRaw.forEach((raw) => {
    const matchedDef = TAG_LIBRARY.find((tagDef) => tagDef.match({ content: normalizedContent, requiredGender, rawValue: raw }));
    if (matchedDef)
      return;
    pushTag({ key: `custom-${raw}`, text: raw, icon: "", type: "neutral" });
  });
  return result;
}
exports.buildVisualTags = buildVisualTags;
//# sourceMappingURL=../../.sourcemap/mp-weixin/utils/orderTags.js.map
