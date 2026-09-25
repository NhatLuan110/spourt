# Sprout trên GitHub Pages

- Repo: <https://github.com/NhatLuan110/spourt>
- Web: <https://nhatluan110.github.io/spourt/>
- Xuất bản: [Publish GitHub Pages](https://github.com/NhatLuan110/spourt/actions/workflows/pages.yml)

Giao diện chạy trên GitHub, không phụ thuộc máy cá nhân. Trang con có dạng
`/spourt/#/login`; dấu `#` giúp mở trực tiếp, tải lại và chia sẻ mà không gặp
lỗi 404 trên máy chủ tĩnh.

GitHub Pages không chạy NestJS hoặc PostgreSQL. Đăng nhập, dữ liệu học và
AI Tutor cần API Render và database Neon. Khi chưa có `PAGES_API_URL`, web
hiện thông báo dịch vụ chưa sẵn sàng, khóa nút đăng nhập/đăng ký và không gửi
thông tin đăng nhập đến GitHub. Đây chưa phải bản dùng đầy đủ chức năng.

## Xuất bản giao diện

Settings → Pages → Source: **GitHub Actions**. Mỗi lần push `main`, workflow
tự kiểm tra kiểu dữ liệu, unit test, build và kiểm tra trình duyệt trước khi
xuất bản `apps/web/out-pages`. Địa chỉ web không đổi khi cập nhật hoặc tắt máy.

`pnpm --filter @sprout/web build:pages` dùng lại các trang React qua
`static-app/`; cách chạy Next.js cục bộ vẫn giữ nguyên. Asset công khai nằm
dưới `/spourt/`; audio được tạo trên API lấy từ tên miền API.

Kiểm tra bằng `node scripts/test-pages.mjs`; cài trình duyệt bằng
`pnpm exec playwright install chromium`. Máy có Chrome có thể đặt biến
`PAGES_BROWSER_CHANNEL=chrome`. Truyền URL web làm đối số để kiểm tra bản online.

## Kết nối API và dữ liệu

1. Đăng nhập [Neon](https://console.neon.tech), tạo project PostgreSQL riêng
   cho Sprout. Giữ `DATABASE_URL` trong cấu hình bí mật, không commit vào Git.
2. Đăng nhập [Render](https://dashboard.render.com), tạo Blueprint từ repo
   `NhatLuan110/spourt`. `render.yaml` chọn Docker, Singapore, gói Free và
   `/readyz`. Nhập `DATABASE_URL` và `AI_API_KEY` khi được yêu cầu.
3. Cấu hình API dành cho tên miền GitHub:

   | Biến | Giá trị |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `WEB_ORIGIN` | `https://nhatluan110.github.io/spourt/` |
   | `COOKIE_CROSS_SITE` | `true` |
   | `COOKIE_DOMAIN` | Không đặt |
   | `AI_PROVIDER` | `gemini` |
   | `AI_API_KEY` | Khóa riêng, chỉ lưu trên Render |
   | `STORAGE_PUBLIC_URL` | `/media` |

   Blueprint sinh `COOKIE_SECRET` và `SECRET_ENCRYPTION_KEY`. Khi chuyển
   database cũ có khóa AI cá nhân đã mã hóa, giữ khóa mã hóa cũ hoặc nhập lại
   các khóa AI đó. Cookie phiên dùng `HttpOnly; Secure; SameSite=None;
   Partitioned`; API kiểm tra Origin trước khi đổi phiên. Bản GitHub Pages
   dùng email/mật khẩu, chưa hỗ trợ chuyển hướng Google OAuth.
4. Chờ API build xong, `/readyz` phải báo database sẵn sàng. Container tự chạy
   migration nhưng không tự seed bài học. Với database mới, chạy migration
   và seed bằng biến môi trường production trong terminal riêng. Với dữ liệu
   cũ, dùng backup/restore được kiểm tra trước, không seed đè dữ liệu người học.
5. Repo → Settings → Secrets and variables → Actions → **Variables**: thêm
   `PAGES_API_URL=https://<tên-api-thật>.onrender.com/api/v1`. Đây là URL công
   khai, không phải khóa AI. Chạy lại workflow **Publish GitHub Pages**.
6. Trên link GitHub, kiểm tra đăng ký, đăng nhập, tải lại, mở bài học, gửi
   hai tin liên tiếp cho AI Tutor và đăng xuất. Kiểm tra cả thiết bị khác.

Render Free có thể ngủ khi không hoạt động; lần gọi đầu có thể chậm. Audio
trong container không bền vững qua lần khởi động lại; cần storage riêng nếu
muốn giữ audio lâu dài. Dùng trình duyệt hiện hành hỗ trợ cookie phân vùng
để giữ phiên với API khác tên miền.

Mã nguồn chính ở `E:\sprout`. `.env`, `.deploy`, `.pgdata`, `.keys` và
`.storage` không được đưa lên Git. Backup và thông tin đăng nhập chỉ nằm
trong vùng riêng tư, không có trong artifact GitHub Pages.

Phương án Next.js với proxy API: [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md).
Tài liệu: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages),
[Vite](https://vite.dev/guide/static-deploy#github-pages),
[Render Blueprint](https://render.com/docs/blueprint-spec),
[cookie phân vùng](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies/Partitioned_cookies).
