"use strict";
const packs = document.getElementById("packs");
const play = document.getElementById("play");
const refresh = document.getElementById("refresh");
const status = document.getElementById("status");
async function reload() {
  const selected = packs.value;
  refresh.disabled = true;
  play.disabled = true;
  packs.disabled = true;
  status.textContent = "Đang đọc và kiểm tra solution…";
  try {
    const response = await fetch("/api/manifest", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    packs.replaceChildren(...data.packs.map(pack => {
      const option = document.createElement("option");
      option.value = pack.id;
      option.textContent = `Pack ${pack.id} · ${pack.levelCount} levels`;
      return option;
    }));
    if (data.packs.some(pack => pack.id === selected)) packs.value = selected;
    else if (data.packs.length) packs.value = data.packs.at(-1).id;
    document.getElementById("errors").hidden = !data.errors.length;
    document.getElementById("errorText").textContent = data.errors.map(error => `Pack ${error.id}: ${error.message}`).join("\n\n");
    status.textContent = data.packs.length ? `${data.packs.length} pack sẵn sàng. Chọn pack để mở game trong tab mới.` : "Chưa có pack hợp lệ. Tạo pack bằng lệnh bên dưới hoặc sửa lỗi được hiển thị.";
    packs.disabled = play.disabled = !data.packs.length;
  } catch (error) {
    status.textContent = `Không tải được danh sách: ${error.message}. Kiểm tra terminal đang chạy server.`;
  } finally { refresh.disabled = false; }
}
refresh.addEventListener("click", reload);
play.addEventListener("click", () => window.open(`/player/index.html?levelLab=1&pack=${encodeURIComponent(packs.value)}`, "_blank", "noopener"));
reload();
