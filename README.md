# Giỏ hàng BĐS – bản đồ nhiều dự án

- **Bản cho sale:** `index.html` → https://huan1112.github.io/gio-hang-bds/ (chỉ xem, lưu ♥, gửi khách)
- **Bản admin:** `admin.html` → https://huan1112.github.io/gio-hang-bds/admin.html (nhập tin Viber, sửa giá, ghim lô, dự án)
- Sửa giao diện: `tools/shell.html`, `tools/engine.js`, `tools/ui.js`, `app.css` rồi chạy `python3 tools/build_app.py`.

- Mỗi dự án = 1 ảnh sơ đồ phân lô (JPG/PNG/PDF) phủ lên bản đồ, canh bằng 2–3 điểm.
- Lô có hàng mới cần vị trí: Mỹ Gia tự định vị theo số lô trong bản vẽ CAD; khu khác ghim 1 chạm.
- Nhà phố / đất lẻ: dán link Google Maps, toạ độ, hoặc toạ độ VN-2000 trên sổ (vẽ đúng ranh thửa).
- Dán tin Viber → tự tách dự án, mã lô, giá, HH, nguồn, khách cần mua.

## 1. Đưa lên GitHub Pages (miễn phí)
1. github.com → **New repository** (ví dụ `gio-hang`), chọn **Public**.
2. **Add file → Upload files**: kéo TẤT CẢ file/thư mục trong gói này lên (gồm thư mục `plans` và file `.nojekyll`) → **Commit**.
3. **Settings → Pages → Branch `main` / `(root)` → Save**. 1–2 phút sau app chạy ở `https://<tài-khoản>.github.io/gio-hang/`.

Lúc này đã dùng được ở chế độ thử (dữ liệu lưu trên từng máy). Bấm **Vệ tinh** để xem ảnh vệ tinh.

## 2. Dữ liệu dùng chung: Supabase (miễn phí)
1. supabase.com → **New project** (Region: Singapore).
2. **SQL Editor** → dán nội dung `supabase.sql` → **Run**.
3. **Project Settings → API**: copy **Project URL** và **anon public key**, dán vào `config.js` trên GitHub → Commit.
4. **Authentication → Users → Add user** cho người được cập nhật giá (tick *Auto confirm*). Tắt *Allow new users to sign up*.

Sale mở link là xem; người nhập tin bấm **Đăng nhập**.

## 3. Canh sơ đồ một khu (làm 1 lần)
Bản đồ → chọn dự án → **📐 Canh** → chạm 1 điểm dễ nhận ra trên sơ đồ (ngã tư, góc khu), kéo chấm cam tới đúng chỗ trên ảnh vệ tinh → làm thêm 1–2 điểm ở xa nhau → **Lưu vị trí**.
Khu VCN Phước Hải hiện mới đặt tạm, cần canh.

## Lưu ý
- Supabase gói miễn phí tạm dừng nếu 7 ngày không ai truy cập; vào bảng điều khiển bấm *Restore*.
- `plans/*.bin`: nét vector của sơ đồ (Phước Hải lấy từ PDF, Mỹ Gia từ bản vẽ CAD) để phóng to không vỡ. `plans/mygia.json`: vị trí số lô Mỹ Gia.
