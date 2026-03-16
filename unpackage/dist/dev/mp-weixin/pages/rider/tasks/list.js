"use strict";
const common_vendor = require("../../../common/vendor.js");
const store_riderTask = require("../../../store/riderTask.js");
if (!Math) {
  TheTabBar();
}
const TheTabBar = () => "../../../components/TheTabBar.js";
const _sfc_main = {
  __name: "list",
  setup(__props) {
    const store = store_riderTask.useRiderTaskStore();
    const currentTab = common_vendor.ref(0);
    const tabs = [
      { label: "待取货", value: "pending_pickup" },
      { label: "配送中", value: "delivering" },
      { label: "已送达", value: "completed" }
    ];
    common_vendor.onShow(async () => {
      common_vendor.index.hideHomeButton();
      await store.loadFromStorage();
    });
    const taskList = common_vendor.computed(() => {
      const statusKeys = ["pending_pickup", "delivering", "completed"];
      const currentStatus = statusKeys[currentTab.value];
      let list = store.tasksByStatus(currentStatus);
      if (currentStatus === "completed") {
        list = [...list].sort((a, b) => {
          const ta = a.complete_time || a.completedAt || 0;
          const tb = b.complete_time || b.completedAt || 0;
          return tb - ta;
        });
      }
      return list.map((t) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _i;
        let delivery = t.deliveryLocation || t.delivery || t.address || "";
        if (!delivery) {
          delivery = "送达地址";
        }
        const dorm = (_a = t.content) == null ? void 0 : _a.dormNumber;
        const rawTags = (t.tags && t.tags.length ? t.tags : [
          ((_b = t.content) == null ? void 0 : _b.isUrgent) ? "加急" : "",
          ((_c = t.content) == null ? void 0 : _c.isDelivery) ? "送货上门" : ""
        ].filter(Boolean)) || [];
        const tags = rawTags.map((tag) => {
          if (tag.includes("送货上门") && dorm) {
            return `${tag} ${dorm}`;
          }
          return tag;
        });
        return {
          ...t,
          pickup: t.pickupLocation || t.pickup || "取件点",
          delivery,
          // 用户上传的取件凭证在 content.images 中
          pickupImages: ((_d = t.content) == null ? void 0 : _d.images) || [],
          deliveryImage: ((_f = (_e = t.content) == null ? void 0 : _e.deliveryImages) == null ? void 0 : _f[0]) || ((_h = (_g = t.content) == null ? void 0 : _g.delivery_images) == null ? void 0 : _h[0]) || "",
          // 客户电话：优先从 content.phone 获取，如果没有则尝试从 address 字段解析
          phone: ((_i = t.content) == null ? void 0 : _i.phone) || t.phone || extractPhoneFromAddress(t.address) || "",
          tags
        };
      });
    });
    const statusMap = {
      pending_pickup: "待取货",
      delivering: "配送中",
      completed: "已送达"
    };
    function extractPhoneFromAddress(address) {
      if (!address)
        return "";
      const lines = address.split("\n");
      if (lines.length > 0) {
        const firstLine = lines[0].trim();
        const phoneMatch = firstLine.match(/(1[3-9]\d{9})/);
        if (phoneMatch) {
          return phoneMatch[1];
        }
      }
      return "";
    }
    const previewCloudImages = async (images = []) => {
      if (!images || images.length === 0) {
        common_vendor.index.showToast({ title: "暂无取件凭证", icon: "none" });
        return;
      }
      let urls = [...images];
      const hasCloudFile = urls.some((url) => url && url.startsWith("cloud://"));
      if (hasCloudFile) {
        try {
          const res = await common_vendor.tr.getTempFileURL({
            fileList: urls
          });
          urls = (res.fileList || []).map((item) => item.tempFileURL || item.download_url || item.fileID).filter(Boolean);
        } catch (e) {
          common_vendor.index.__f__("error", "at pages/rider/tasks/list.vue:276", "获取临时文件 URL 失败:", e);
          common_vendor.index.showToast({ title: "图片加载失败，请稍后重试", icon: "none" });
          return;
        }
      }
      common_vendor.index.previewImage({
        urls,
        current: urls[0]
      });
    };
    const viewPickupImages = async (task) => {
      var _a;
      const images = task.pickupImages || ((_a = task.content) == null ? void 0 : _a.images) || [];
      await previewCloudImages(images);
    };
    const copyPhone = (phone) => {
      if (!phone) {
        common_vendor.index.showToast({ title: "暂无客户电话", icon: "none" });
        return;
      }
      const cleanPhone = phone.replace(/\*/g, "");
      common_vendor.index.setClipboardData({
        data: cleanPhone,
        success: () => {
          common_vendor.index.showToast({ title: "电话已复制", icon: "success" });
        },
        fail: () => {
          common_vendor.index.showToast({ title: "复制失败", icon: "none" });
        }
      });
    };
    const confirmPickup = (task) => {
      common_vendor.index.showModal({
        title: "确认取货",
        content: "您确认已经拿到货品了吗？",
        success: async (res) => {
          if (res.confirm) {
            common_vendor.index.showLoading({ title: "处理中..." });
            const success = await store.confirmPickup(task.id, null);
            common_vendor.index.hideLoading();
            if (success) {
              common_vendor.index.showToast({ title: "已取货", icon: "success" });
              if (currentTab.value === 0) {
                setTimeout(() => {
                  currentTab.value = 1;
                }, 500);
              }
            }
          }
        }
      });
    };
    const confirmDelivery = (task) => {
      common_vendor.index.chooseImage({
        count: 1,
        sourceType: ["camera", "album"],
        success: async (res) => {
          const tempFilePath = res.tempFilePaths[0];
          common_vendor.index.showLoading({ title: "上传中..." });
          try {
            const uploadRes = await common_vendor.tr.uploadFile({
              filePath: tempFilePath,
              cloudPath: `delivery/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
            });
            const fileID = (uploadRes == null ? void 0 : uploadRes.fileID) || (uploadRes == null ? void 0 : uploadRes.fileId);
            if (!fileID) {
              throw new Error("上传失败，未获取到文件ID");
            }
            const success = await store.confirmDelivery(task.id, [fileID]);
            common_vendor.index.hideLoading();
            if (success) {
              common_vendor.index.showToast({ title: "送达确认成功", icon: "success" });
              if (currentTab.value === 1) {
                setTimeout(() => {
                  currentTab.value = 2;
                }, 500);
              }
            } else {
            }
          } catch (e) {
            common_vendor.index.__f__("error", "at pages/rider/tasks/list.vue:393", "上传/送达确认失败:", e);
            common_vendor.index.hideLoading();
            common_vendor.index.showToast({ title: e.message || "上传失败，请重试", icon: "none" });
          }
        },
        fail: () => {
          common_vendor.index.showToast({ title: "取消拍照", icon: "none" });
        }
      });
    };
    const formatTime = (timestamp) => {
      if (!timestamp)
        return "";
      const date = new Date(timestamp);
      const now = /* @__PURE__ */ new Date();
      const diff = now - date;
      if (diff < 6e4) {
        return "刚刚";
      } else if (diff < 36e5) {
        return `${Math.floor(diff / 6e4)}分钟前`;
      } else if (diff < 864e5) {
        return `${Math.floor(diff / 36e5)}小时前`;
      } else {
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hour = date.getHours();
        const minute = date.getMinutes();
        return `${month}-${day} ${hour}:${minute.toString().padStart(2, "0")}`;
      }
    };
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: common_vendor.f(tabs, (item, index, i0) => {
          return {
            a: common_vendor.t(item.label),
            b: item.value,
            c: index === currentTab.value ? 1 : "",
            d: common_vendor.o(($event) => currentTab.value = index, item.value)
          };
        }),
        b: currentTab.value === 0
      }, currentTab.value === 0 ? {
        c: common_vendor.f(taskList.value, (task, k0, i0) => {
          return common_vendor.e({
            a: common_vendor.t(task.delivery),
            b: common_vendor.t(task.price.toFixed(2)),
            c: common_vendor.t(task.type === "pickup" ? "快递代取" : "跑腿服务"),
            d: common_vendor.t(statusMap[task.status]),
            e: task.tags && task.tags.length
          }, task.tags && task.tags.length ? {
            f: common_vendor.f(task.tags, (tag, k1, i1) => {
              return {
                a: common_vendor.t(tag),
                b: tag,
                c: tag.includes("加急") ? 1 : "",
                d: tag.includes("送货上门") ? 1 : ""
              };
            })
          } : {}, {
            g: task.phone
          }, task.phone ? {
            h: common_vendor.t(task.phone),
            i: common_vendor.o(($event) => copyPhone(task.phone), task.id)
          } : {}, {
            j: common_vendor.o(($event) => viewPickupImages(task), task.id),
            k: common_vendor.o(($event) => confirmPickup(task), task.id),
            l: task.id
          });
        })
      } : {}, {
        d: currentTab.value === 1
      }, currentTab.value === 1 ? {
        e: common_vendor.f(taskList.value, (task, k0, i0) => {
          return common_vendor.e({
            a: common_vendor.t(task.delivery),
            b: common_vendor.t(task.price.toFixed(2)),
            c: common_vendor.t(task.type === "pickup" ? "快递代取" : "跑腿服务"),
            d: task.tags && task.tags.length
          }, task.tags && task.tags.length ? {
            e: common_vendor.f(task.tags, (tag, k1, i1) => {
              return {
                a: common_vendor.t(tag),
                b: tag,
                c: tag.includes("加急") ? 1 : "",
                d: tag.includes("送货上门") ? 1 : ""
              };
            })
          } : {}, {
            f: task.phone
          }, task.phone ? {
            g: common_vendor.t(task.phone),
            h: common_vendor.o(($event) => copyPhone(task.phone), task.id)
          } : {}, {
            i: common_vendor.o(($event) => confirmDelivery(task), task.id),
            j: task.id
          });
        })
      } : {}, {
        f: currentTab.value === 2
      }, currentTab.value === 2 ? {
        g: common_vendor.f(taskList.value, (task, k0, i0) => {
          return common_vendor.e({
            a: common_vendor.t(task.delivery),
            b: common_vendor.t(((task.content && task.content.rider_income) != null ? Number(task.content.rider_income) : Number(task.price || 0)).toFixed(2)),
            c: common_vendor.t(task.type === "pickup" ? "快递代取" : "跑腿服务"),
            d: common_vendor.t(formatTime(task.completedAt)),
            e: task.tags && task.tags.length
          }, task.tags && task.tags.length ? {
            f: common_vendor.f(task.tags, (tag, k1, i1) => {
              return {
                a: common_vendor.t(tag),
                b: tag,
                c: tag.includes("加急") ? 1 : "",
                d: tag.includes("送货上门") ? 1 : ""
              };
            })
          } : {}, {
            g: task.deliveryImage
          }, task.deliveryImage ? {
            h: task.deliveryImage,
            i: common_vendor.o(($event) => _ctx.previewDeliveryImage(task), task.id)
          } : {}, {
            j: task.id
          });
        })
      } : {});
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-1cb17a62"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/rider/tasks/list.js.map
