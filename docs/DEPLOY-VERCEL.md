# Phương án thay thế: Next.js trên Vercel

Hướng dẫn chính dùng tên miền GitHub nằm ở [DEPLOY.md](../DEPLOY.md).
Với phương án Vercel, đặt `COOKIE_CROSS_SITE=false` trên API vì web chuyển
tiếp API qua cùng tên miền. Blueprint mặc định hiện dành cho GitHub Pages.

Ba dịch vụ, đều có bậc miễn phí, không cần thẻ tín dụng cho database và web —
Render có thể hỏi thẻ để xác minh nhưng không tính phí ở gói free.

| Dịch vụ | Việc | Ai làm |
|---|---|---|
| [Neon](https://neon.tech) | Database PostgreSQL | Bạn (đăng ký) |
| [Render](https://render.com) | Chạy API (Docker) | Bạn (đăng ký + bấm nút) |
| [Vercel](https://vercel.com) | Chạy web (Next.js) | Bạn (đăng ký + bấm nút) |

Mã nguồn đầy đủ nằm ở **`E:\sprout`**; bản trên ổ F là bản sao cũ.
Đã có `apps/api/Dockerfile`, `apps/web/vercel.json`, `render.yaml` và bộ lọc
tệp riêng tư. Cần đăng nhập các dịch vụ và kết nối repo trước khi xuất bản.

---

## Bước 0 — Đẩy code lên GitHub

Cả Render và Vercel đều lấy code từ GitHub. Nếu code chưa ở đó:

```bash
cd E:\sprout
git init -b main
git add .
git commit -m "Initial commit"
```

Sau đó tạo một repo **riêng tư** trên `github.com/new` rồi:

```bash
git remote add origin https://github.com/<tên-bạn>/sprout.git
git push -u origin main
```

> `.env`, `.keys/`, `.pgdata/`, `.storage/`, `.cache/` và `.claude/` được bỏ qua.
> Kiểm tra `git diff --cached --name-only` trước khi push; không đưa khóa riêng,
> database cục bộ hoặc cấu hình cá nhân lên repo.

---

## Bước 1 — Database (Neon)

1. Vào [neon.tech](https://neon.tech) → đăng nhập bằng GitHub
2. **Create a project** → đặt tên `sprout` → chọn vùng gần Việt Nam nhất
   (Singapore nếu có)
3. Neon hiện ngay một chuỗi kết nối dạng:
   ```
   postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. **Copy chuỗi này** — đây là `DATABASE_URL` dùng ở Bước 2

---

## Bước 2 — API (Render)

Có thể chọn **New → Blueprint** và repo `sprout` để dùng `render.yaml`:
chọn gói Free, nhập `DATABASE_URL` và `WEB_ORIGIN`. Hai secret được Render
tự sinh. Nếu chưa có URL web, dùng tạm `http://localhost:3000` rồi sửa ở Bước 4.
Hoặc tạo Web Service thủ công theo các bước dưới đây.

1. Vào [render.com](https://render.com) → đăng nhập bằng GitHub
2. **New** → **Web Service** → chọn repo `sprout`
3. Điền:

   | Trường | Giá trị |
   |---|---|
   | Name | `sprout-api` |
   | Region | Singapore (gần nhất) |
   | Branch | `main` |
   | Runtime | **Docker** |
   | Dockerfile Path | `apps/api/Dockerfile` |
   | Docker Build Context Directory | `.` (dấu chấm — thư mục gốc repo) |
   | Instance Type | Free |
   | Health Check Path | `/readyz` |

4. Mở **Environment** → **Add Environment Variable**, thêm từng dòng:

   | Biến | Giá trị |
   |---|---|
   | `DATABASE_URL` | chuỗi kết nối từ Neon (Bước 1) |
   | `NODE_ENV` | `production` |
   | `COOKIE_SECRET` | một chuỗi ngẫu nhiên dài — chạy `openssl rand -hex 32` hoặc gõ bừa 40 ký tự |
   | `SECRET_ENCRYPTION_KEY` | một chuỗi ngẫu nhiên **khác**, cùng cách trên |
   | `WEB_ORIGIN` | để tạm `http://localhost:3000`, quay lại sửa sau Bước 3 |
   | `AI_PROVIDER` | `gemini` |
   | `AI_API_KEY` | khoá Gemini của bạn |
   | `AI_SPEECH_PROVIDER` | `gemini` |
   | `AI_SPEECH_API_KEY` | để trống nếu dùng chung khoá AI_API_KEY |
   | `STORAGE_PUBLIC_URL` | `/media` |

   Không đặt `COOKIE_DOMAIN`: cookie đăng nhập sẽ thuộc tên miền web nhờ proxy
   ở Bước 3. Các khóa AI có thể bổ sung sau; thiếu khóa thì tính năng AI báo
   chưa cấu hình. Không dùng khóa phát triển trong repo cho production.

   > `JWT_PRIVATE_KEY` và `JWT_PUBLIC_KEY` bắt buộc trong production. Sinh một
   > cặp RSA riêng và lưu dưới dạng secret trên Render; API sẽ từ chối khởi
   > động nếu thiếu. Không dùng cặp khóa phát triển hoặc commit khóa riêng.

5. **Create Web Service**. Render sẽ build (mất 5–10 phút lần đầu) rồi cho ra
   một URL dạng `https://sprout-api.onrender.com`

6. **Copy URL này** — dùng ở Bước 3

> Gói Free của Render "ngủ" sau 15 phút không có ai gọi, và mất khoảng 30–60
> giây để "thức dậy" ở lượt gọi đầu tiên sau đó. Người dùng đầu tiên trong
> ngày sẽ thấy trang load hơi lâu — đó không phải lỗi, đó là gói miễn phí.

---

## Bước 3 — Web (Vercel)

1. Vào [vercel.com](https://vercel.com) → đăng nhập bằng GitHub
2. **Add New** → **Project** → chọn repo `sprout`
3. Vercel tự nhận `apps/web/vercel.json`. Xác nhận:

   | Trường | Giá trị |
   |---|---|
   | Root Directory | `apps/web` |
   | Framework Preset | Next.js |
   | Include source files outside of the Root Directory | Bật |

4. Mở **Environment Variables**, thêm:

   | Biến | Giá trị |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `/api/v1` |
   | `API_ORIGIN` | URL Render, không thêm đường dẫn — ví dụ `https://sprout-api.onrender.com` |

   Web chuyển tiếp `/api/v1/*` và `/media/*` sang Render. Trình duyệt gọi cùng
   tên miền web để cookie `SameSite=Lax` giữ được phiên khi tải lại trang.
   Đặt các biến trước khi build; đổi `API_ORIGIN` cần deploy lại web.

5. **Deploy**. Sau 2–3 phút bạn có link dạng `https://sprout-xxx.vercel.app`

---

## Bước 4 — Nối hai chiều

Quay lại Render (Bước 2), sửa biến `WEB_ORIGIN` thành URL Vercel thật:

```
WEB_ORIGIN=https://sprout-xxx.vercel.app
```

Lưu lại — Render tự khởi động lại. `WEB_ORIGIN` cũng được API dùng cho chuyển
hướng đăng nhập Google và các liên kết quay lại web.

## Bước 5 — Nạp nội dung vào database mới

Container tự chạy migration nhưng **không tự nạp bài học**. Dùng chuỗi kết nối
Neon qua biến môi trường trong một cửa sổ PowerShell riêng; không đổi `.env`
phát triển. Chỉ chạy các lệnh seed dưới đây với database production mới tạo.

```powershell
cd E:\sprout
$env:DATABASE_URL = '<chuỗi kết nối Neon — nhập cục bộ, không gửi vào chat>'
pnpm db:deploy
pnpm db:seed
pnpm --filter @sprout/api run seed:chinese
Remove-Item Env:DATABASE_URL
```

Seed tạo kho tiếng Anh và tiếng Trung từ `content/`; không chuyển tài khoản
hoặc lịch sử học cục bộ. Nếu muốn chuyển dữ liệu người học, cần một bước
backup/restore riêng. Không tự seed lại mỗi lần container khởi động.

---

## Kiểm tra

Mở `https://sprout-xxx.vercel.app` (đợi khoảng 1 phút nếu là lần đầu Render
"thức dậy"). Đăng ký một tài khoản thử, học vài từ, xem điểm số lên.

Kiểm tra API độc lập:
```
https://sprout-api.onrender.com/healthz
https://sprout-api.onrender.com/readyz
```
`/healthz` phải trả `status: "ok"`; `/readyz` phải trả `status: "ready"` và
`checks.database: true`. Kiểm tra thêm: đăng nhập, tải lại trang, học một bài
và đăng xuất. Nếu bị mất phiên, kiểm tra hai biến Vercel ở Bước 3.

Render Free không giữ tệp cục bộ qua các lần khởi động lại. `/media` là proxy,
không phải ổ lưu trữ bền vững; cần cấu hình storage phù hợp nếu muốn giữ audio
được tạo trên server lâu dài.

---

## Sau khi deploy xong

- **Cấp quyền admin cho tài khoản của bạn**: chạy `pnpm make:admin
  ban@example.com` trên máy bạn, nhưng lúc này `.env` phải trỏ `DATABASE_URL`
  sang Neon (database production), không phải Postgres cục bộ. Đổi tạm dòng đó
  trong `.env`, chạy lệnh, rồi đổi lại.
- **Domain riêng** (tuỳ chọn): mua domain rồi vào Vercel → Settings → Domains
  để gắn vào, miễn phí về phía Vercel.
- **Google tìm thấy trang**: khai báo tại
  [Google Search Console](https://search.google.com/search-console) bằng URL
  Vercel hoặc domain riêng — việc này cần vài tuần để có hiệu lực, không có
  cách nào nhanh hơn.

## Nếu deploy lỗi

Lỗi thường gặp nhất là Render build hỏng vì thiếu biến môi trường hoặc sai
đường dẫn Dockerfile. Vào tab **Logs** trên Render, copy đoạn lỗi, đưa cho tôi
xem — tôi đọc log build tốt hơn đoán mò.

Tài liệu cấu hình: [Next.js rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites),
[Vercel monorepo](https://vercel.com/docs/monorepos/monorepo-faq),
[Render Blueprint](https://render.com/docs/blueprint-spec).
