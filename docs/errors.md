# Bảng mã lỗi

§6.1 — mọi lỗi API trả về đúng một hình dạng:

```json
{ "error": { "code": "SCREAMING_SNAKE", "message": "câu tiếng Việt cho người dùng", "details": {} } }
```

`code` dành cho client xử lý, `message` dành cho người dùng đọc, `details` chỉ
có ở lỗi validate.

| Mã | HTTP | Khi nào | Client nên làm gì |
|----|------|---------|-------------------|
| `VALIDATION_FAILED` | 422 | Dữ liệu không qua được Zod | Hiện lỗi ngay tại trường trong `details[].path` |
| `UNAUTHENTICATED` | 401 | Thiếu token, token hỏng hoặc hết hạn | Thử `/auth/refresh` một lần, thất bại thì về `/login` |
| `INVALID_CREDENTIALS` | 401 | Sai email hoặc mật khẩu | Hiện lỗi chung, **không** nói email có tồn tại hay không |
| `EMAIL_ALREADY_REGISTERED` | 409 | Đăng ký trùng email | Gợi ý đăng nhập hoặc quên mật khẩu |
| `REFRESH_TOKEN_INVALID` | 401 | Refresh token sai, hết hạn hoặc không tồn tại | Đăng nhập lại |
| `REFRESH_TOKEN_REUSED` | 401 | Dùng lại token đã xoay — dấu hiệu bị lộ | Đăng xuất mọi nơi, bắt đăng nhập lại |
| `FORBIDDEN` | 403 | Không đủ quyền | Ẩn thao tác đó |
| `NOT_FOUND` | 404 | Không có nội dung | Hiện trạng thái rỗng, không phải màn hình lỗi |
| `RATE_LIMITED` | 429 | Vượt giới hạn §6.1 | Chờ rồi thử lại, hiện thời gian còn lại |
| `AI_QUOTA_EXCEEDED` | 429 | Hết lượt AI trong ngày (§10.1) | Hiện số lượt còn lại và giờ reset |
| `AI_PROVIDER_ERROR` | 502 | Nhà cung cấp AI lỗi hoặc timeout | Cho thử lại, **không** mất bài viết của người dùng |
| `SRS_QUEUE_EMPTY` | 200/404 | Không còn thẻ đến hạn | Hiện trạng thái rỗng tích cực, gợi ý học từ mới |
| `SRS_CARD_NOT_DUE` | 409 | Chấm một thẻ chưa đến hạn | Bỏ qua, đồng bộ lại hàng đợi |
| `WORD_ALREADY_LEARNING` | 409 | Thêm từ đã có trong bộ từ | Hiện thông báo nhẹ, không coi là lỗi |
| `LESSON_LOCKED` | 403 | Chưa đạt prerequisite (§7.8) | Chỉ tới bài cần học trước, hoặc nút kiểm tra vượt cấp |
| `UPLOAD_TOO_LARGE` | 413 | Audio vượt 10MB | Yêu cầu ghi âm ngắn hơn |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | MIME hoặc magic bytes sai | Báo định dạng được hỗ trợ |
| `INSUFFICIENT_COINS` | 409 | Không đủ xu để mua | Hiện số xu còn thiếu |
| `ATTEMPT_ALREADY_SUBMITTED` | 409 | Nộp lại bài đã nộp | Chuyển tới trang kết quả |
| `INTERNAL_ERROR` | 500 | Lỗi ngoài dự kiến | Hiện lỗi chung, gửi lên Sentry |

## Quy tắc

- Không rò rỉ thông tin trong `message`: đăng nhập sai luôn trả cùng một câu dù
  email có tồn tại hay không.
- Không log token hay mật khẩu, kể cả trong `details`.
- Mọi `code` mới phải được thêm vào `packages/shared/src/constants/errors.ts` —
  đó là nguồn duy nhất, bảng này chỉ mô tả.
