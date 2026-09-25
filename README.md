# 🌱 Sprout

Web app tự học tiếng Anh cho người Việt: đủ năm kỹ năng, gia sư AI, và một cái
cây lớn dần theo quá trình học.

Đặc tả đầy đủ nằm ở `promptwebsitehoctienganh.md`. Mọi quyết định kỹ thuật lệch
khỏi đặc tả được ghi trong [`DECISIONS.md`](./DECISIONS.md).

---

## Chạy dự án trong 5 phút

Yêu cầu: **Node 20.11+** và **pnpm 9+** (`npm i -g pnpm`). Không cần Docker,
không cần cài PostgreSQL.

```bash
pnpm install                 # cài phụ thuộc cho toàn bộ workspace
cp .env.example .env         # cấu hình mặc định đã chạy được ngay
pnpm pg:start                # bật PostgreSQL cục bộ (cổng 5433)
pnpm db:migrate              # tạo bảng
pnpm build --filter=./packages/*   # build các package dùng chung
pnpm dev                     # chạy web (3000) + api (4000)
```

Mở:

| Địa chỉ | Nội dung |
|---------|----------|
| http://localhost:3000 | Web app |
| http://localhost:3000/dev/ui | Gallery design system |
| http://localhost:4000/docs | OpenAPI (Swagger) |
| http://localhost:4000/healthz | Liveness |
| http://localhost:4000/readyz | Readiness (kiểm tra DB) |

Dừng database: `pnpm pg:stop`. Xoá sạch dữ liệu: `pnpm db:reset`.

> Máy có Docker thì dùng `docker compose up -d` rồi đổi `DATABASE_URL` sang cổng
> 5432 — kết quả tương đương.

---

## Cấu trúc

```
sprout/
├─ apps/
│  ├─ api/            NestJS 11 + Fastify + Prisma  (cổng 4000)
│  └─ web/            Next.js 15 App Router          (cổng 3000)
├─ packages/
│  ├─ shared/         Zod schema, hằng số, tiện ích dùng chung cho cả hai app
│  ├─ srs/            Thuật toán spaced repetition SM-2 (§9.1) — 45 unit test
│  └─ scoring/        Chấm dictation, phát âm, XP, điểm kỹ năng, kiểm tra thích ứng — 167 unit test
├─ content/           Nguồn nội dung dạng file, được seed vào DB
│                     (vocabulary, grammar, reading, listening, tests, writing,
│                      speaking, word-families)
├─ scripts/           PostgreSQL cục bộ không cần Docker
└─ docs/              Bảng mã lỗi, ghi chú bảo mật
```

## Lệnh hay dùng

| Lệnh | Việc |
|------|------|
| `pnpm dev` | Chạy cả web và api |
| `pnpm test` | Toàn bộ unit test |
| `pnpm typecheck` | TypeScript strict, không `any` |
| `pnpm build` | Build tất cả |
| `pnpm db:migrate` | Tạo migration mới từ schema |
| `pnpm db:studio` | Xem dữ liệu bằng Prisma Studio |
| `pnpm pg:start` / `pnpm pg:stop` | Bật/tắt PostgreSQL cục bộ |
| `pnpm check:content` | Kiểm tra cú pháp mọi tệp YAML trong `content/` trước khi seed |
| `pnpm check:ai` | Kiểm tra khoá AI trong `.env` còn sống không, không cần gửi khoá đi đâu |
| `pnpm check:stt` | Kiểm tra nhận dạng giọng nói có phiên âm trung thực hay tự sửa lỗi phát âm (D-051) |

## Cấu hình

`.env.example` liệt kê mọi biến. **Không có khoá của nhà cung cấp nào là bắt
buộc để chạy** — thiếu khoá thì tính năng tương ứng báo "chưa cấu hình" thay vì
lỗi im lặng:

| Biến | Thiếu thì sao |
|------|---------------|
| `AI_API_KEY` | AI Tutor và chấm Writing báo "chưa cấu hình" thay vì lỗi. Kiểm tra bằng `pnpm check:ai` |
| `AI_PROVIDER` | Chọn nhà cung cấp cho phần chữ: `gemini` (mặc định — miễn phí, không cần thẻ), `groq`, `openrouter`, `github`, `ollama`, `anthropic`. Xem D-044 |
| `AI_SPEECH_PROVIDER` / `AI_SPEECH_API_KEY` | Chọn riêng nhà cung cấp cho giọng nói. Chỉ Gemini làm được miễn phí, nên tách ra để phần chữ chạy ở nơi khác mà không đốt hạn mức chấm phát âm (D-053) |
| `AZURE_SPEECH_KEY` | Chấm phát âm dùng bộ chấm dự phòng trong `packages/scoring` (§9.3) |
| `DEEPGRAM_API_KEY` | STT lùi về Gemini nếu đang dùng Gemini, không thì về Web Speech API (D-045) |
| `ELEVENLABS_API_KEY` | TTS lùi về Gemini nếu đang dùng Gemini, không thì về giọng đọc trình duyệt |
| `GOOGLE_CLIENT_ID` | Nút đăng nhập Google báo chưa cấu hình, email + mật khẩu vẫn chạy |
| `REDIS_URL` | Cache và hàng đợi chạy trong tiến trình |

## Ước lượng chi phí nhà cung cấp

Cho 1.000 người dùng hoạt động/tháng, theo hạn mức miễn phí ở §10.1
(20 tin nhắn tutor + 3 bài viết + 10 lượt role-play mỗi ngày):

| Dịch vụ | Giả định | Ước tính/tháng |
|---------|----------|----------------|
| Claude (tutor, sonnet) | 8 tin nhắn/người/ngày, ~1.2k token vào + 400 ra, có prompt caching | 90–150 USD |
| Claude (chấm writing, opus) | 1,5 bài/người/tuần, ~2k token vào + 1.5k ra | 120–200 USD |
| Azure Pronunciation | 6 phút audio/người/tháng | 60–100 USD |
| Deepgram STT | 4 phút/người/tháng | 15–25 USD |
| TTS (cache theo hash) | phần lớn trúng cache sau tháng đầu | 20–40 USD |

Con số thật phụ thuộc mức dùng; `AiUsageLog` ghi lại từng lần gọi để đối chiếu.

## Tình trạng hiện tại

| Phase | Trạng thái |
|-------|-----------|
| **P0 — Nền móng** | ✅ Monorepo, schema §5 đầy đủ (54 bảng), auth email + Google OAuth + xoay refresh token, design system §3.2, `/dev/ui`, onboarding, settings |
| **P1 — Từ vựng + SRS + Gamification** | ✅ 8 chủ đề & từ điển, học từ mới, SRS §9.1 (hàng đợi, chấm thẻ, dự báo), 5 dạng bài tập §7.3.4 với distractor không ngẫu nhiên, bộ thẻ tự tạo, Word Class §7.4, XP/cấp/coin/streak §9.2–§9.4, dashboard + cây, 34 thành tựu |
| **P2 — Ngữ pháp + Đọc + Nghe** | ✅ 12 bài ngữ pháp A1–B2 (lý thuyết, ví dụ, mẹo, bảng lỗi người Việt) có khoá theo điều kiện tiên quyết, 6 bài đọc có tra từ tại chỗ và đo tốc độ đọc, 6 bài nghe có transcript song ngữ, đổi tốc độ phát và chép chính tả chấm theo từng từ |
| **P3 — Viết + Gia sư AI** | ✅ Chấm bài viết theo 4 tiêu chí §5.6, từng lỗi neo đúng vị trí trong bài kèm lý do tiếng Việt, bản viết lại cao hơn một bậc; gia sư trả lời có sửa lỗi riêng, nhớ ngữ cảnh, hạn mức §10.1 |
| **P4 — Nói** | ✅ 20 bài luyện phủ đủ 9 nhóm lỗi §7.6.3, ghi âm trong trình duyệt, chấm từng từ + chỉ ra âm sai, 5 tình huống hội thoại có sửa lỗi |
| **P5 — Kiểm tra + Phân tích** | ✅ Bài kiểm tra đầu vào thích ứng (12–30 câu, leo thang CEFR, ra trình độ từng kỹ năng và ghi vào hồ sơ), trang phân tích 7/30/90 ngày với XP theo ngày, sáu kỹ năng, bảng lỗi, chỗ cần ôn và giờ học |
| P6 — Hoàn thiện | ⏳ PWA, thông báo, deploy |

### Còn thiếu so với đặc tả

- **Nội dung từ vựng**: 164 từ trên 8 chủ đề, trong khi §12.1 yêu cầu 200–250 từ
  mỗi chủ đề. Mọi từ đều đầy đủ IPA, âm tiết, trọng âm, hai ví dụ song ngữ và
  offset in đậm — chỗ thiếu là số lượng, không phải chất lượng. Thêm từ chỉ cần
  sửa `content/vocabulary/*.yaml` rồi chạy lại `pnpm db:seed` (idempotent).
- **Audio thu sẵn**: chưa cấu hình nhà cung cấp TTS nên `audioUsUrl`/`audioUkUrl`
  của từ vựng và `audioUrl` của bài nghe đều trống; trình duyệt đọc tạm bằng
  `speechSynthesis` (D-027, D-033). Mốc thời gian trong transcript là ước lượng
  theo số từ, nên tô sáng chính xác ở mức từng đoạn chứ chưa tới từng từ.
- **Ngân hàng câu hỏi kiểm tra**: 28 câu A1–C1 cho bài kiểm tra đầu vào. Đủ để
  thuật toán thích ứng chạy đúng, nhưng chưa đủ để mỗi kỹ năng có nhiều câu ở
  mọi mức — kết quả sẽ ghi rõ kỹ năng nào chưa đủ dữ liệu thay vì đoán bừa.
- **Nội dung P2**: 12 bài ngữ pháp, 6 bài đọc (1.941 từ) và 6 bài nghe so với
  mức §12.4 mong muốn. Thêm nội dung chỉ cần sửa `content/{grammar,reading,
  listening}/*.yaml` rồi chạy lại `pnpm db:seed`; `node scripts/check-content.cjs`
  kiểm tra cú pháp trước khi seed.
- **Chấm phát âm chỉ ở mức từ**: Gemini trả transcript chứ không trả điểm từng
  âm vị như Azure, và tệ hơn, nó có xu hướng *tự sửa* lỗi phát âm khi phiên âm.
  Nên hệ thống bắt tốt việc nuốt từ, thiếu từ và tốc độ, nhưng bắt kém lỗi thay
  âm (th→s, v→y) — đúng nhóm lỗi người Việt hay mắc nhất. Prompt đã siết lại;
  chạy `pnpm check:stt` để kiểm chứng (D-051). Ngữ điệu để trống, không bịa số.
- **E2E Playwright**: chưa tải được Chromium từ máy này; `scripts/screenshot.mjs`
  đã sẵn sàng cho lúc mạng thông.
